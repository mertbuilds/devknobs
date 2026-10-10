import { realNow } from "./clock";
import { FRAME_NAME, isDevknobsFrame } from "./frame";
import { newer, stamped } from "./stored";

/**
 * Fresh mode, and the one way to web storage. With `devknobs=fresh` in the
 * page's address, devknobs shows what a first visit sees: it leaves
 * `localStorage` alone, and a load of the page it did not ask for starts with
 * none of its items in `sessionStorage`. Every read and write of either
 * storage goes through `webStorage`, so the rule holds in one place.
 */

/** The address parameter and the value that turn fresh mode on. */
export const FRESH_PARAM = "devknobs";
export const FRESH_VALUE = "fresh";

/** On the width knob's frame while the page above is in fresh mode. */
export const FRESH_ATTRIBUTE = "data-devknobs-fresh";

/** Where a reload devknobs is about to ask for is timed, in `sessionStorage`. */
export const FRESH_RELOAD_KEY = "devknobs:fresh-reload";

/** The version of the timing `FRESH_RELOAD_KEY` keeps. Bump it with a change of shape, see stored.ts. */
export const FRESH_RELOAD_VERSION = 1;

/** How long a reload devknobs asked for has to bring its page, in ms. A later load is the user's. */
export const FRESH_RELOAD_WINDOW = 10000;

/**
 * What a load of the user's leaves in `sessionStorage`: the record of the
 * locale stores devknobs wrote, and the timing of its reload. The locale knob,
 * back on `system`, puts those stores back from it and drops it. Without it, a
 * cookie devknobs wrote would stay on the page for good.
 */
const KEPT = "devknobs:locale-";

/**
 * Where a document's mode is kept once it is known, on its window. The early
 * script and the full script are two copies of this module, and the second
 * finds what the first settled: it never wipes again. The address may change
 * after the load, as the window follows its frame, and the mode stays.
 */
const MODE = Symbol.for("devknobs.fresh");

/** Does this address query turn fresh mode on? */
export function freshIn(search: string): boolean {
  try {
    return new URLSearchParams(search).getAll(FRESH_PARAM).includes(FRESH_VALUE);
  } catch {
    return false;
  }
}

/** Is `key` an item of devknobs that a load of the user's starts without? */
export function wiped(key: string): boolean {
  if (key === FRESH_PARAM) return true;
  return key.startsWith(`${FRESH_PARAM}:`) && !key.startsWith(KEPT);
}

/** When the reload devknobs last asked for was, from its record, or 0 for none. */
function reloadAt(text: string | null): number {
  if (!text) return 0;
  try {
    const raw: unknown = JSON.parse(text);
    if (typeof raw !== "object" || raw === null || newer(raw, FRESH_RELOAD_VERSION)) return 0;
    const at: unknown = Reflect.get(raw, "at");
    return typeof at === "number" ? at : 0;
  } catch {
    return 0;
  }
}

/**
 * The start of a page in fresh mode. A reload devknobs asked for moments ago
 * keeps the session. Any other load drops every item `wiped` names.
 */
function begin(): void {
  try {
    const session = window.sessionStorage;
    const age = realNow() - reloadAt(session.getItem(FRESH_RELOAD_KEY));
    session.removeItem(FRESH_RELOAD_KEY);
    if (age >= 0 && age < FRESH_RELOAD_WINDOW) return;
    const keys: string[] = [];
    for (let index = 0; index < session.length; index++) {
      const key = session.key(index);
      if (key !== null && wiped(key)) keys.push(key);
    }
    for (const key of keys) session.removeItem(key);
  } catch {
    // Private mode, disabled storage: nothing is kept there to drop.
  }
}

/** Whether the page above this frame is in fresh mode, which it wrote on the frame. */
function framedFresh(): boolean {
  try {
    const owner = window.frameElement;
    if (owner) return owner.hasAttribute(FRESH_ATTRIBUTE);
  } catch {
    // A parent on another origin. The frame loaded at the address of the page above.
  }
  return window.name === FRAME_NAME && freshIn(window.location?.search ?? "");
}

/**
 * Is this document in fresh mode? Settled once per document, before devknobs
 * reads anything it keeps. The page settles it from its address, and starts
 * its session over unless devknobs asked for this load. The copy in the width
 * knob's frame follows the page above, and never drops anything.
 */
export function fresh(): boolean {
  if (typeof window === "undefined") return false;
  const known: unknown = Reflect.get(window, MODE);
  if (typeof known === "boolean") return known;
  let on = false;
  try {
    if (isDevknobsFrame()) on = framedFresh();
    else {
      on = freshIn(window.location?.search ?? "");
      if (on) begin();
    }
  } catch {
    on = false;
  }
  Reflect.set(window, MODE, on);
  return on;
}

/**
 * Either storage, or null where it cannot be reached. In fresh mode there is
 * no `localStorage`: what it keeps reads as nothing kept, and nothing is
 * written over it.
 */
export function webStorage(kind: "session" | "local"): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    if (kind === "session") {
      fresh();
      return window.sessionStorage ?? null;
    }
    return fresh() ? null : (window.localStorage ?? null);
  } catch {
    return null;
  }
}

/**
 * Devknobs is about to reload the page, or send it elsewhere. In fresh mode
 * the timing lets the next load tell it from one of the user's, and keep the
 * session.
 */
export function ownReload(): void {
  // The copy in the frame reloads its own window, never the page.
  if (!fresh() || isDevknobsFrame()) return;
  try {
    const record = stamped({ at: realNow() }, FRESH_RELOAD_VERSION);
    window.sessionStorage.setItem(FRESH_RELOAD_KEY, JSON.stringify(record));
  } catch {
    // Storage refused: the next load starts over, as a load of the user's does.
  }
}
