import { realNow } from "./clock";
import { isDevknobsFrame } from "./frame";
import { webStorage } from "./fresh";
import { newer, stamped } from "./stored";

/**
 * The scroll position, carried across a load devknobs asks for: a reload for
 * the locale or the device, the frame's reload button, a frame a knob builds.
 * A host that restores scroll itself only knows the history entry it left, and
 * a frame built again is a new one, so its page starts at the top. Before such
 * a load devknobs keeps where each document was, and the document that comes
 * goes back there. A load of the visitor's finds nothing kept, in fresh mode
 * too, where it starts the session over.
 */

/** Where the positions are kept for the next page, in `sessionStorage`. */
export const SCROLL_KEY = "devknobs:scroll";

/** The version of the record `SCROLL_KEY` keeps. Bump it with a change of shape, see stored.ts. */
export const SCROLL_VERSION = 1;

/** How long a load devknobs asked for has to bring its page, in ms. A later load is the visitor's. */
export const SCROLL_WINDOW = 10000;

/** How long past its load a page is held at its place, in ms, while the host may still move it. */
export const HOLD = 2000;

/** How long a page that never finishes loading is held, in ms. */
export const HOLD_CAP = 10000;

/** How many times the page is put back. A host that moves it more often than that wins. */
export const PUT_BUDGET = 20;

/** What of the visitor ends the hold at once: the page is theirs to scroll. */
const INPUTS = ["wheel", "touchstart", "keydown", "mousedown"] as const;

/** The window's own page, or the copy of it in the width knob's frame. */
export type Role = "page" | "frame";

export interface Point {
  x: number;
  y: number;
}

/** Where a document was scrolled to, and the path it was at. */
export interface Place extends Point {
  path: string;
}

/** What is kept for the next load: when, and a place for each document that has one. */
export interface Kept {
  at: number;
  page?: Place;
  frame?: Place;
}

function placeOf(value: unknown): Place | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const path: unknown = Reflect.get(value, "path");
  const x: unknown = Reflect.get(value, "x");
  const y: unknown = Reflect.get(value, "y");
  if (typeof path !== "string" || typeof x !== "number" || typeof y !== "number") return undefined;
  return Number.isFinite(x) && Number.isFinite(y) ? { path, x, y } : undefined;
}

/** Read a kept record, or null when it is missing, malformed or from a newer devknobs. */
export function parseKept(text: string | null): Kept | null {
  if (!text) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null || newer(raw, SCROLL_VERSION)) return null;
  const at: unknown = Reflect.get(raw, "at");
  if (typeof at !== "number") return null;
  const kept: Kept = { at };
  const page = placeOf(Reflect.get(raw, "page"));
  const frame = placeOf(Reflect.get(raw, "frame"));
  if (page) kept.page = page;
  if (frame) kept.frame = frame;
  return kept;
}

/** Is a record kept at `at` too old for a load at `now` to be the one it was kept for? */
function stale(at: number, now: number): boolean {
  const age = now - at;
  return !(age >= 0 && age < SCROLL_WINDOW);
}

/**
 * The record once `role` is kept at `place`, or at nothing with null. A page
 * at its top keeps nothing, as that is where a load leaves it anyway. The
 * other document's place stays while it is still fresh. Null for nothing left
 * to keep.
 */
export function keptWith(kept: Kept | null, role: Role, place: Place | null, now: number): Kept | null {
  const next: Kept = { at: now };
  const other: Role = role === "page" ? "frame" : "page";
  const rest = kept && !stale(kept.at, now) ? kept[other] : undefined;
  if (rest) next[other] = rest;
  if (place && (place.x !== 0 || place.y !== 0)) next[role] = place;
  return next.page || next.frame ? next : null;
}

/**
 * What a document that loads as `role` at `path` takes from the record: where
 * to go back to, and what stays kept for the other document. Its own place is
 * used once: it goes whether it is taken or the path is another. A stale
 * record goes whole.
 */
export function take(
  kept: Kept | null,
  role: Role,
  path: string,
  now: number,
): { place: Point | null; rest: Kept | null } {
  if (!kept || stale(kept.at, now)) return { place: null, rest: null };
  const own = kept[role];
  const other: Role = role === "page" ? "frame" : "page";
  const left = kept[other];
  const rest: Kept | null = left ? { at: kept.at, [other]: left } : null;
  if (!own || own.path !== path) return { place: null, rest };
  return { place: { x: own.x, y: own.y }, rest };
}

/** A hold on a page: where it goes back to, and how it went so far. */
export interface Holding {
  target: Point;
  start: number;
  /** When the document was first seen loaded, or null while it loads. */
  loadedAt: number | null;
  /** How many times the page was put back. */
  puts: number;
}

/** What a hold sees of the page at one frame. */
export interface Seen extends Point {
  /** How far the page scrolls each way. */
  maxX: number;
  maxY: number;
  now: number;
}

/**
 * What a hold does at one frame. `put` scrolls the page to its place, once it
 * is long enough to get there. `wait` leaves it: too short still, or already
 * there, whoever put it there, and watched in case the host moves it as it
 * mounts. Once the time is up, `last` puts a page that never got there as far
 * as it goes, and `done` ends the hold.
 */
export function next(holding: Holding, seen: Seen): "put" | "wait" | "last" | "done" {
  const { target } = holding;
  const there = Math.abs(seen.x - target.x) <= 1 && Math.abs(seen.y - target.y) <= 1;
  const spent = holding.puts >= PUT_BUDGET;
  const over =
    seen.now - holding.start >= HOLD_CAP ||
    (holding.loadedAt !== null && seen.now - holding.loadedAt >= HOLD);
  if (over) return there || spent ? "done" : "last";
  if (spent) return "done";
  if (there) return "wait";
  return seen.maxX >= target.x - 1 && seen.maxY >= target.y - 1 ? "put" : "wait";
}

/** What a hold needs of a window. */
export interface ScrollView {
  scrollX: number;
  scrollY: number;
  document: {
    readyState: string;
    documentElement: {
      scrollWidth: number;
      scrollHeight: number;
      clientWidth: number;
      clientHeight: number;
    } | null;
  };
  scrollTo(options: ScrollToOptions): void;
  addEventListener(type: string, listener: () => void, options: boolean): void;
  removeEventListener(type: string, listener: () => void, options: boolean): void;
  requestAnimationFrame(callback: () => void): number;
}

/**
 * Bring the page in `view` back to `target` and keep it there for a moment:
 * the page may not be long enough yet, and a host that mounts later may send
 * it to the top once more. Looked at every frame, and over at once when the
 * visitor does anything.
 */
export function hold(view: ScrollView, target: Point, now: () => number = realNow): void {
  const holding: Holding = { target, start: now(), loadedAt: null, puts: 0 };
  let over = false;
  const end = () => {
    over = true;
    for (const type of INPUTS) view.removeEventListener(type, end, true);
  };
  const frame = () => {
    if (over) return;
    const time = now();
    if (holding.loadedAt === null && view.document.readyState === "complete") holding.loadedAt = time;
    const root = view.document.documentElement;
    const move = next(holding, {
      x: view.scrollX,
      y: view.scrollY,
      maxX: root ? root.scrollWidth - root.clientWidth : 0,
      maxY: root ? root.scrollHeight - root.clientHeight : 0,
      now: time,
    });
    if (move === "put" || move === "last") {
      holding.puts++;
      view.scrollTo({ left: target.x, top: target.y, behavior: "instant" });
    }
    if (move === "last" || move === "done") end();
    else view.requestAnimationFrame(frame);
  };
  for (const type of INPUTS) view.addEventListener(type, end, true);
  frame();
}

/** The window in the width knob's frame, while the page has one up. */
let framed: (() => Window | null) | null = null;

/** The page has a frame up, or with null has none, so a reload of the page keeps the frame's place too. */
export function follow(view: (() => Window | null) | null): void {
  framed = view;
}

/** Where `view` is now, or null for a window that is gone or on another origin. */
function placeIn(view: Window | null): Place | null {
  try {
    return view ? { path: view.location.pathname, x: view.scrollX, y: view.scrollY } : null;
  } catch {
    return null;
  }
}

/**
 * Devknobs is about to load `view` again as `role`: keep where it is. With no
 * window, what was kept for that role goes.
 */
export function keep(view: Window | null, role: Role): void {
  try {
    const session = webStorage("session");
    if (!session) return;
    const kept = keptWith(parseKept(session.getItem(SCROLL_KEY)), role, placeIn(view), realNow());
    if (kept) session.setItem(SCROLL_KEY, JSON.stringify(stamped(kept, SCROLL_VERSION)));
    else session.removeItem(SCROLL_KEY);
  } catch {
    // Private mode, disabled storage: the next page starts where the host leaves it.
  }
}

/**
 * Devknobs is about to reload this window. The copy in the frame keeps its
 * own place. The page keeps its own and, as its frame is built again after the
 * reload, the frame's.
 */
export function keepOwn(): void {
  if (isDevknobsFrame()) {
    keep(window, "frame");
    return;
  }
  keep(window, "page");
  keep(framed?.() ?? null, "frame");
}

/**
 * The start of a document: take the place kept for it, if devknobs asked for
 * this load, and go back there. The early script and the full script both ask,
 * and the first one takes it.
 */
export function resume(): void {
  if (typeof window === "undefined") return;
  let target: Point | null = null;
  try {
    const session = webStorage("session");
    const text = session?.getItem(SCROLL_KEY) ?? null;
    if (!session || text === null) return;
    const role: Role = isDevknobsFrame() ? "frame" : "page";
    const { place, rest } = take(parseKept(text), role, window.location.pathname, realNow());
    if (rest) session.setItem(SCROLL_KEY, JSON.stringify(stamped(rest, SCROLL_VERSION)));
    else session.removeItem(SCROLL_KEY);
    target = place;
  } catch {
    // Private mode, disabled storage: nothing is kept there.
    return;
  }
  if (target) hold(window, target);
}
