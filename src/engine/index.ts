import type { DevknobsState, DevknobsStatePatch } from "../types";
import { framed, isDevknobsFrame, nativeScheme, post, readMessage, UNFRAMED } from "./frame";
import * as geo from "./geo";
import * as locale from "./locale";
import * as media from "./media";
import * as outlines from "./outlines";
import { replay as replayAnimations } from "./replay";
import * as speed from "./speed";
import { clear, DEFAULT_STATE, load, merge, save } from "./store";
import * as text from "./text";
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
  media.apply({ scheme, motion: state.motion, contrast: state.contrast });
  speed.apply(state.speed);
  locale.apply(state.locale);
  geo.apply(state.geo);
  text.apply(state.text);
  width.apply(state);
  outlines.apply(state.outlines);
  if (persist) save(state);
  width.sync(state);
  for (const listener of Array.from(listeners)) listener(state);
}

export function setState(patch: DevknobsStatePatch): DevknobsState {
  applyState(merge(state, patch));
  return state;
}

/** Put every knob back to system and forget the stored state. */
export function reset(): void {
  applyState({ ...DEFAULT_STATE, panel: state.panel });
  if (persist) clear();
}

/** Inside the frame, take the knobs and replays the page above sends down. */
function onMessage(event: MessageEvent): void {
  const message = readMessage(event, window.parent, window.location.origin);
  if (message?.type === "state") applyState(message.state);
  else if (message?.type === "replay") replayAnimations();
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
  // A page that will not load in the frame offers this way out.
  width.onExit(() => setState(UNFRAMED));
  applyState(merge(stored ? load() : { ...DEFAULT_STATE }, options.state ?? {}));
  if (inFrame) post(window.parent, { source: "devknobs", type: "ready" });
}

/** Undo every patch and hand the page back to the browser. */
export function stop(): void {
  if (!running) return;
  running = false;
  window.removeEventListener("message", onMessage);
  inFrame = false;
  width.onExit(null);
  media.destroy();
  speed.reset();
  locale.reset();
  geo.reset();
  text.reset();
  width.reset();
  outlines.reset();
  state = { ...DEFAULT_STATE };
}

/** Restart every CSS animation, in the width knob's frame too. */
export function replay(): void {
  replayAnimations();
  post(width.frameWindow(), { source: "devknobs", type: "replay" });
}
