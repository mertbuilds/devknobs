import type { DevknobsState, DevknobsStatePatch } from "../types";
import * as geo from "./geo";
import * as locale from "./locale";
import * as media from "./media";
import * as outlines from "./outlines";
import { replay } from "./replay";
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
  state = next;
  media.apply({
    scheme: next.scheme,
    motion: next.motion,
    contrast: next.contrast,
    width: next.width,
  });
  locale.apply(next.locale);
  geo.apply(next.geo);
  text.apply(next.text);
  width.apply(next.width);
  outlines.apply(next.outlines);
  if (persist) save(next);
  for (const listener of Array.from(listeners)) listener(next);
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

export function start(options: EngineOptions = {}): void {
  if (running) return;
  running = true;
  persist = options.persist !== false;
  applyState(merge(persist ? load() : { ...DEFAULT_STATE }, options.state ?? {}));
}

/** Undo every patch and hand the page back to the browser. */
export function stop(): void {
  if (!running) return;
  running = false;
  media.destroy();
  locale.reset();
  geo.reset();
  text.reset();
  width.reset();
  outlines.reset();
  state = { ...DEFAULT_STATE };
}

export { replay };
