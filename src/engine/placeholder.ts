import type { DevknobsState, PanelValue } from "../types";
import type { Look } from "./browserkit";
import { needsFrame } from "./frame";

/**
 * What stands in for the frame from a reload's first paint until devknobs
 * mounts: the mat, and where the last page kept one, the frame's drawing as
 * it was, its screen blank. The early script puts it up, the frame takes it
 * down once it draws the same.
 */

/** One under the panel host, so the panel stays on top of the frame. */
export const Z_INDEX = 2147483645;

/** Marks the early script's style and its stand-in. */
export const EARLY = "early";

/** Where the frame's drawing is kept for the next page, in `sessionStorage`. */
export const SNAPSHOT_KEY = "devknobs:snapshot";

/** How long the stand-in waits for devknobs before it gives the page back, in ms. */
export const GIVE_UP = 3000;

/**
 * The blue of the cutting mat the frame lies on, a little lighter up top and
 * deeper toward the edges, and in P3 where the screen has it.
 */
export const MAT =
  "radial-gradient(140% 100% at 50% 0%, rgb(20, 70, 152), rgb(12, 48, 114) 60%, rgb(7, 31, 80))";
export const MAT_P3 =
  "radial-gradient(140% 100% at 50% 0%, color(display-p3 0.1 0.27 0.61), color(display-p3 0.06 0.19 0.46) 60%, color(display-p3 0.035 0.12 0.32))";

/**
 * The page under the frame hidden, as the frame hides it, and the bare mat
 * over it where nothing else stands in yet. It is a pseudo element, so a page
 * that hydrates its document finds no node of ours there.
 */
const COVER = `html{overflow:hidden!important}
body>:not([data-devknobs]){content-visibility:hidden!important}
html::after{content:"";position:fixed;inset:0;z-index:${Z_INDEX - 1};background:${MAT};pointer-events:none}
@media (color-gamut:p3){html::after{background:${MAT_P3}}}`;

/** The knobs a drawing of the frame depends on, beside the window's size. */
export type Drawn = Pick<
  DevknobsState,
  | "width"
  | "height"
  | "frame"
  | "dpr"
  | "vision"
  | "scheme"
  | "device"
  | "orientation"
  | "mock"
  | "browser"
  | "bars"
  | "edgeToEdge"
  | "zoom"
> & { panel: Pick<PanelValue, "open" | "side"> };

/** The window's size and pixel ratio, which a drawing of the frame depends on too. */
export interface WindowSize {
  innerWidth: number;
  innerHeight: number;
  devicePixelRatio: number;
}

/** The frame's drawing as the last page left it. */
export interface Snapshot {
  /** What it was drawn for, from `snapshotKey`. */
  key: string;
  /** The shadow root's style and the letterbox's markup, its screen blank. */
  css: string;
  html: string;
  /** What the browser's bars showed for the page. */
  look: Look;
}

export function snapshotKey(knobs: Drawn, view: WindowSize): string {
  return JSON.stringify([
    knobs.width,
    knobs.height,
    knobs.frame,
    knobs.dpr,
    knobs.vision,
    knobs.scheme,
    knobs.device,
    knobs.orientation,
    knobs.mock,
    knobs.browser,
    knobs.bars,
    knobs.edgeToEdge,
    knobs.zoom,
    knobs.panel.open,
    knobs.panel.side,
    view.innerWidth,
    view.innerHeight,
    view.devicePixelRatio,
  ]);
}

function session(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function lookOf(value: unknown): Look | null {
  if (typeof value !== "object" || value === null) return null;
  const read = (key: string): unknown => Reflect.get(value, key);
  const background = read("background");
  const scheme = read("scheme");
  const host = read("host");
  const flags = [read("dark"), read("canBack"), read("canForward")];
  if (typeof background !== "string" || !/^rgb\(\d{1,3}, \d{1,3}, \d{1,3}\)$/.test(background)) {
    return null;
  }
  if ((scheme !== "light" && scheme !== "dark") || typeof host !== "string") return null;
  const [dark, canBack, canForward] = flags;
  if (typeof dark !== "boolean" || typeof canBack !== "boolean") return null;
  if (typeof canForward !== "boolean") return null;
  return { background, dark, scheme, host, canBack, canForward };
}

/** The drawing the last page kept, if it was drawn for these knobs at this window's size. */
export function readSnapshot(knobs: Drawn, view: WindowSize): Snapshot | null {
  try {
    const text = session()?.getItem(SNAPSHOT_KEY);
    if (!text) return null;
    const data: unknown = JSON.parse(text);
    if (typeof data !== "object" || data === null) return null;
    const key = Reflect.get(data, "key");
    const css = Reflect.get(data, "css");
    const html = Reflect.get(data, "html");
    const look = lookOf(Reflect.get(data, "look"));
    if (key !== snapshotKey(knobs, view) || typeof css !== "string") return null;
    if (typeof html !== "string" || !look) return null;
    return { key, css, html, look };
  } catch {
    return null;
  }
}

export function writeSnapshot(snapshot: Snapshot): void {
  try {
    session()?.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {
    // Storage full or off: the next page shows the bare mat.
    clearSnapshot();
  }
}

export function clearSnapshot(): void {
  try {
    session()?.removeItem(SNAPSHOT_KEY);
  } catch {
    // Nothing kept, or nothing to reach.
  }
}

/** The stand-in the early script put up, if it is still there. */
export function earlyHost(): HTMLElement | null {
  return document.querySelector<HTMLElement>(`div[data-devknobs="${EARLY}"]`);
}

/** Take the stand-in and its style away, which gives the page back unless the frame covers it. */
export function dropEarly(): void {
  for (const node of Array.from(document.querySelectorAll(`[data-devknobs="${EARLY}"]`))) {
    node.remove();
  }
}

/**
 * From the early script, before the first paint: when the stored knobs put
 * the page in a frame, hide it under the mat, and put the frame's drawing the
 * last page kept over that once there is a body for it. Devknobs takes both
 * away when it draws the frame, and they go on their own after `GIVE_UP`.
 */
export function showEarly(knobs: Drawn): void {
  if (!needsFrame(knobs) || !document.head) return;
  const style = document.createElement("style");
  style.setAttribute("data-devknobs", EARLY);
  style.textContent = COVER;
  document.head.append(style);
  window.setTimeout(dropEarly, GIVE_UP);
  const snapshot = readSnapshot(knobs, window);
  if (!snapshot) return;
  const host = document.createElement("div");
  host.setAttribute("data-devknobs", EARLY);
  host.style.cssText = `position:fixed;inset:0;z-index:${Z_INDEX}`;
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = snapshot.html;
  const sheet = document.createElement("style");
  sheet.textContent = snapshot.css;
  root.prepend(sheet);
  const put = (): boolean => {
    if (!style.isConnected) return true;
    if (!document.body) return false;
    document.body.append(host);
    return true;
  };
  if (put()) return;
  // The body comes after this script, and is in before anything of it paints.
  const observer = new MutationObserver(() => {
    if (put()) observer.disconnect();
  });
  observer.observe(document.documentElement, { childList: true });
}
