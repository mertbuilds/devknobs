import type { DevknobsState, MatColorValue, PanelValue } from "../types";
import type { Look } from "./browserkit";
import { needsFrame } from "./frame";
import { MAT_COLORS, matGradient } from "./matcolors";
import { newer, stamped } from "./stored";

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

/** The version of the snapshot `SNAPSHOT_KEY` keeps. Bump it with a new shape, see stored.ts. */
export const SNAPSHOT_VERSION = 1;

/** How long the stand-in waits for devknobs before it gives the page back, in ms. */
export const GIVE_UP = 3000;

/** How many frames the early script's stand-in waits over the frame for the device's picture. */
const EARLY_FRAMES = 60;

/** The wait for the device's picture under the early script's stand-in. */
let earlyWait = 0;

/**
 * The page under the frame hidden, as the frame hides it, and the bare mat
 * over it in the stored color where nothing else stands in yet. It is a
 * pseudo element, so a page that hydrates its document finds no node of ours
 * there.
 */
export function coverCss(mat: MatColorValue): string {
  const paint = MAT_COLORS[mat];
  return `html{overflow:hidden!important}
body>:not([data-devknobs]){content-visibility:hidden!important}
html::after{content:"";position:fixed;inset:0;z-index:${Z_INDEX - 1};background:${matGradient(paint.srgb)};pointer-events:none}
@media (color-gamut:p3){html::after{background:${matGradient(paint.p3)}}}`;
}

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
  | "posture"
  | "mock"
  | "browser"
  | "bars"
  | "edgeToEdge"
  | "zoom"
  | "mat"
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
    knobs.posture,
    knobs.mock,
    knobs.browser,
    knobs.bars,
    knobs.edgeToEdge,
    knobs.zoom,
    knobs.mat,
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
    if (typeof data !== "object" || data === null || newer(data, SNAPSHOT_VERSION)) return null;
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
    session()?.setItem(SNAPSHOT_KEY, JSON.stringify(stamped(snapshot, SNAPSHOT_VERSION)));
  } catch {
    // Storage full or off: the next page shows the bare mat.
    clearSnapshot();
  }
}

/** What `keepDrawing` keeps of the frame. */
export interface Kept {
  /** The mat around the frame, as it is drawn now. */
  letterbox: HTMLElement;
  /** The zoom control's pick, a property, which a copy leaves out. */
  zoom: string;
  /** What it was drawn for, from `snapshotKey`. */
  key: string;
  /** The shadow root's style. */
  css: string;
  look: Look;
}

/**
 * Keep the frame's drawing for the next page, so a reload shows it from its
 * first paint: the letterbox as it is, its screen blank in the page's color.
 */
export function keepDrawing({ letterbox, zoom, key, css, look }: Kept): void {
  const copy = letterbox.cloneNode(true);
  if (!(copy instanceof HTMLElement)) return;
  copy.querySelector("iframe")?.remove();
  // The touch cursor is the live frame's, and the stand-in keeps the mouse's.
  copy.querySelector(".touchdot")?.remove();
  copy.querySelector(".glass")?.removeAttribute("data-touch");
  for (const line of Array.from(copy.querySelectorAll<HTMLElement>(".progress"))) line.hidden = true;
  const blank = copy.querySelector<HTMLElement>(".screenblank");
  if (blank) {
    blank.hidden = false;
    blank.style.background = look.background;
  }
  for (const option of Array.from(copy.querySelectorAll("option"))) {
    option.toggleAttribute("selected", option.value === zoom);
  }
  writeSnapshot({ key, css, html: copy.outerHTML, look });
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
 * The early script's stand-in goes over the frame, which draws the same
 * under it, and goes once the device's picture is in, so the switch never
 * shows. `pictureLoading` says whether it is still on its way.
 */
export function adoptEarly(pictureLoading: () => boolean): void {
  const early = earlyHost();
  if (!early || !document.body) {
    dropEarly();
    return;
  }
  document.body.append(early);
  let frames = 0;
  const step = () => {
    earlyWait = 0;
    if (pictureLoading() && ++frames < EARLY_FRAMES) {
      earlyWait = window.requestAnimationFrame(step);
      return;
    }
    // One more frame, so the frame's own drawing is on screen under it.
    earlyWait = window.requestAnimationFrame(() => {
      earlyWait = 0;
      dropEarly();
    });
  };
  earlyWait = window.requestAnimationFrame(step);
}

/** Stop waiting for the device's picture, as the frame goes. */
export function stopAdopting(): void {
  if (earlyWait) window.cancelAnimationFrame(earlyWait);
  earlyWait = 0;
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
  style.textContent = coverCss(knobs.mat);
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
