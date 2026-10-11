/**
 * An outside page in the frame: one on another origin, which the frame shows
 * at the device's size and nothing reaches into. It is for the session only.
 * Nothing of it is stored, so a reload of the window is back on its own page.
 */

/** What the frame shows in place of the window's own page. */
export interface OutsideState {
  /** The outside page's address, or null while the frame shows the window's own page. */
  outside: string | null;
  /** The host said the outside page refuses to be framed, and the screen says so. */
  refused: boolean;
  /** The frame's load event came for the outside page. A page that refuses to be framed sends it too. */
  loaded: boolean;
}

export type OutsideListener = (state: OutsideState) => void;

const OWN: OutsideState = { outside: null, refused: false, loaded: false };

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
    next.outside === state.outside && next.refused === state.refused && next.loaded === state.loaded;
  if (same) return;
  state = next;
  for (const listener of Array.from(listeners)) listener(state);
}

/** Show the outside page at `outside`, an address `parseOutside` gave. */
export function setOutside(outside: string, refused: boolean): void {
  put({ outside, refused, loaded: false });
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
