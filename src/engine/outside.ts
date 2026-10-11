/**
 * An outside page in the frame: one on another origin, which the frame shows
 * at the device's size and nothing reaches into. It is for the session only.
 * Nothing of it is stored, so a reload of the window is back on its own page.
 */

import { parsePlainColor } from "./color";

/**
 * The colors of an outside page, as the host found them, such as its
 * `theme-color`: one for the light scheme, one for the dark. Each is a hex or
 * an `rgb()` of plain numbers. One alone is for both schemes.
 */
export interface OutsideLook {
  light?: string;
  dark?: string;
}

/** What the frame shows in place of the window's own page. */
export interface OutsideState {
  /** The outside page's address, or null while the frame shows the window's own page. */
  outside: string | null;
  /** The host said the outside page refuses to be framed, and the screen says so. */
  refused: boolean;
  /** The frame's load event came for the outside page. A page that refuses to be framed sends it too. */
  loaded: boolean;
  /** The outside page's colors the host gave, each one a color that was taken, or null with none. */
  look: OutsideLook | null;
}

export type OutsideListener = (state: OutsideState) => void;

const OWN: OutsideState = { outside: null, refused: false, loaded: false, look: null };

let state: OutsideState = OWN;
const listeners = new Set<OutsideListener>();

/**
 * An address the frame may show: an absolute `http:` or `https:` one, as the
 * browser writes it. Anything else, such as `javascript:`, `data:`, `blob:` or
 * `file:`, and anything that is no address, is null.
 */
export function parseOutside(url: unknown): string | null {
  if (typeof url !== "string") return null;
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : null;
  } catch {
    return null;
  }
}

/**
 * The colors of `look` that may be drawn: the hex ones and the `rgb()` ones of
 * plain numbers, as `parsePlainColor` takes them. Anything else is left out,
 * and a look with none left is null.
 */
export function parseLook(look: unknown): OutsideLook | null {
  if (typeof look !== "object" || look === null) return null;
  const taken: OutsideLook = {};
  for (const scheme of ["light", "dark"] as const) {
    const value: unknown = Reflect.get(look, scheme);
    if (typeof value === "string" && parsePlainColor(value)) taken[scheme] = value.trim();
  }
  return taken.light === undefined && taken.dark === undefined ? null : taken;
}

export function getOutside(): OutsideState {
  return state;
}

/** Hear about every change of what the frame shows. Returns the way to stop. */
export function subscribeOutside(listener: OutsideListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function put(next: OutsideState): void {
  const same =
    next.outside === state.outside &&
    next.refused === state.refused &&
    next.loaded === state.loaded &&
    next.look?.light === state.look?.light &&
    next.look?.dark === state.look?.dark;
  if (same) return;
  state = next;
  for (const listener of Array.from(listeners)) listener(state);
}

/**
 * Show the outside page at `outside`, an address `parseOutside` gave, in the
 * colors of `look`, which `parseLook` gave. With none, the page before's go.
 */
export function setOutside(outside: string, refused: boolean, look: OutsideLook | null = null): void {
  put({ outside, refused, loaded: false, look });
}

/** The outside page shown has the colors of `look`, which `parseLook` gave, or none again. */
export function lookOutside(look: OutsideLook | null): void {
  if (state.outside !== null) put({ ...state, look });
}

/** The outside page shown refuses to be framed. */
export function refuseOutside(): void {
  if (state.outside !== null) put({ ...state, refused: true, loaded: false });
}

/** The frame is loading the outside page again. */
export function reloadingOutside(): void {
  if (state.outside !== null) put({ ...state, loaded: false });
}

/** The frame's load event came for the outside page. */
export function landOutside(): void {
  if (state.outside !== null && !state.refused) put({ ...state, loaded: true });
}

/** Back to the window's own page. */
export function clearOutside(): void {
  put(OWN);
}
