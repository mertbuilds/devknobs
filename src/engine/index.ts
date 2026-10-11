import type { DevknobsState, DevknobsStatePatch } from "../types";
import * as requests from "../requests";
import { DEVICES, hasTouch } from "./devices";
import {
  framed,
  isDevknobsFrame,
  nativeScheme,
  needsFrame,
  post,
  readMessage,
  UNFRAMED,
} from "./frame";
import * as geo from "./geo";
import * as header from "./header";
import * as locale from "./locale";
import * as media from "./media";
import * as network from "./network";
import { clearOutside, parseOutside, refuseOutside, setOutside } from "./outside";
import * as outlines from "./outlines";
import * as overflow from "./overflow";
import * as pseudo from "./pseudo";
import { replay as replayAnimations } from "./replay";
import * as scrollbars from "./scrollbars";
import * as spacing from "./spacing";
import * as speed from "./speed";
import { DEFAULT_STATE, keepPlace as keepPlaceOf, load, merge, resetState, save } from "./store";
import * as text from "./text";
import * as time from "./time";
import * as touch from "./touch";
import * as touchPointer from "./touchpointer";
import * as ua from "./ua";
import * as width from "./width";

export interface EngineOptions {
  /** Keep the knobs in sessionStorage across reloads. Defaults to true. */
  persist?: boolean;
  /** Knobs to apply on top of the stored state. */
  state?: DevknobsStatePatch;
}

export type Listener = (state: DevknobsState) => void;

let state: DevknobsState = { ...DEFAULT_STATE };
let persist = true;
let running = false;
/** Running inside the width knob's frame, where the page above drives the knobs. */
let inFrame = false;
let stopRelay: (() => void) | null = null;
const listeners = new Set<Listener>();

export function getState(): DevknobsState {
  return state;
}

/** Hear about every knob change, whoever made it. Returns the way to stop. */
export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function applyState(next: DevknobsState): void {
  state = inFrame ? framed(next) : next;
  // In a frame that gets the scheme natively, the rewrite and the patch step aside.
  const scheme = inFrame && nativeScheme(state.scheme) ? "system" : state.scheme;
  // The frame is the device's screen, so its touch screen goes there.
  const touchScreen = inFrame && hasTouch(state.device);
  media.apply({
    scheme,
    motion: state.motion,
    contrast: state.contrast,
    transparency: state.transparency,
    touch: touchScreen,
  });
  // A ua preset reports `maxTouchPoints` for its own browser, so the touch
  // screen only does while the ua knob has none.
  touch.apply({ on: touchScreen, points: ua.uaPreset(state.ua.preset) === undefined });
  touchPointer.apply(touchScreen && state.touchPointer);
  scrollbars.apply(touchScreen);
  speed.apply(state.speed);
  locale.apply(state.locale);
  pseudo.apply(state.pseudo);
  geo.apply(state.geo);
  time.apply(time.resolveTimeZone(state.timeZone, state.geo), state.clock);
  header.apply(state.clock);
  network.apply(state.network);
  text.apply(state.text);
  spacing.apply(state.spacing);
  ua.apply(state.ua);
  // An outside page goes with the frame it was shown in.
  if (!inFrame && !needsFrame(state)) clearOutside();
  width.apply(state);
  // While the frame is up, the copy inside it looks at the page at that width.
  overflow.apply(state.overflow && !needsFrame(state));
  outlines.apply(state.outlines);
  if (persist) save(state);
  width.sync(state);
  for (const listener of Array.from(listeners)) listener(state);
}

export function setState(patch: DevknobsStatePatch): DevknobsState {
  applyState(merge(state, patch));
  return state;
}

/** What `showOutside` takes besides the address. */
export interface OutsideOptions {
  /**
   * The page refuses to be framed, as the host's own check of its headers
   * said. The frame never asks for it, and the device's screen says so.
   */
  refused?: boolean;
}

/**
 * Show an outside page in the frame: one on another origin, at the device's
 * size, which no knob reaches into. Only an `http:` or `https:` address is
 * taken. With no frame up, the first phone of the list brings one. False
 * where nothing was shown: another kind of address, the copy inside the
 * frame, or before the knobs started.
 */
export function showOutside(url: string, options: OutsideOptions = {}): boolean {
  const outside = parseOutside(url);
  if (!running || inFrame || outside === null) return false;
  setOutside(outside, options.refused === true);
  const phone = DEVICES.find((device) => device.kind === "phone");
  applyState(merge(state, needsFrame(state) || !phone ? {} : { device: phone.id }));
  return true;
}

/** The outside page shown refuses to be framed, as the host's own check said: the device's screen says so. */
export function refuseShown(): void {
  if (!running || inFrame) return;
  refuseOutside();
  applyState(state);
}

/** Put the window's own page back in the frame, which stays up. */
export function showOwn(): void {
  if (!running || inFrame) return;
  clearOutside();
  applyState(state);
}

/**
 * Keep the panel's place for new tabs and sessions, as the user just put it.
 * Like a save, never from the copy in the width knob's frame.
 */
export function keepPlace(): void {
  if (persist) keepPlaceOf(state);
}

/**
 * Put every knob back to its default and list the default rows again. The
 * panel keeps its place and stays open or closed, across a reload too.
 */
export function reset(): void {
  applyState(resetState(state));
}

/** Inside the frame, take the knobs and replays the page above sends down. */
function onMessage(event: MessageEvent): void {
  const message = readMessage(event, window.parent, window.location.origin);
  if (message?.type === "state") applyState(message.state);
  else if (message?.type === "replay") replayAnimations();
}

/** Inside the frame, tell the panel above how many boxes stick out here. */
function relay(count: number): void {
  post(window.parent, { source: "devknobs", type: "overflow", count });
}

export function start(options: EngineOptions = {}): void {
  if (running) return;
  running = true;
  inFrame = isDevknobsFrame();
  const stored = options.persist !== false;
  // The frame shares sessionStorage with the page above, which owns the stored
  // state. It reads it, so the first paint is right, but a save would clobber it.
  persist = stored && !inFrame;
  if (inFrame) window.addEventListener("message", onMessage);
  // Before any knob, so a patch a knob puts on `fetch` wraps the log's and comes off first.
  requests.start();
  // A page that will not load in the frame offers this way out, of a pinned panel's frame too.
  width.onExit(() => setState({ ...UNFRAMED, panel: { docked: false } }));
  // The letterbox zooms the frame from its own control, the wheel and the keys.
  width.onZoom((zoom) => setState({ zoom }));
  applyState(merge(stored ? load() : { ...DEFAULT_STATE }, options.state ?? {}));
  if (!inFrame) return;
  relay(overflow.overflowCount());
  stopRelay = overflow.onCount(relay);
  post(window.parent, { source: "devknobs", type: "ready" });
}

/** Undo every patch and hand the page back to the browser. */
export function stop(): void {
  if (!running) return;
  running = false;
  window.removeEventListener("message", onMessage);
  stopRelay?.();
  stopRelay = null;
  inFrame = false;
  width.onExit(null);
  width.onZoom(null);
  clearOutside();
  media.destroy();
  touch.reset();
  touchPointer.reset();
  scrollbars.reset();
  speed.reset();
  locale.reset();
  pseudo.reset();
  geo.reset();
  time.reset();
  header.reset();
  network.reset();
  text.reset();
  spacing.reset();
  ua.reset();
  width.reset();
  overflow.reset();
  outlines.reset();
  requests.stop();
  state = { ...DEFAULT_STATE };
}

/** Restart every CSS animation, in the width knob's frame too. */
export function replay(): void {
  replayAnimations();
  post(width.frameWindow(), { source: "devknobs", type: "replay" });
}
