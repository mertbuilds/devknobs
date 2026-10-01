import type { DevknobsState, DprValue, WidthValue } from "../types";
import {
  FRAME_ATTRIBUTE,
  FRAME_NAME,
  type FrameKnobs,
  needsFrame,
  post,
  readMessage,
  UNFRAMED,
} from "./frame";
import { ensureStyle, removeStyle } from "./style";
import { visionFilter } from "./vision";

const NAME = "width";

/** What the frame takes from the knobs. */
export type ViewportValue = FrameKnobs & Pick<DevknobsState, "scheme">;

/** One under the panel host, so the panel stays on top of the frame. */
const Z_INDEX = 2147483645;

/**
 * Everything an app on this origin does, short of navigating the window above
 * on its own: a frame-busting script would reload the page into its frame
 * forever. A click can still, so `target="_top"` links work.
 */
const SANDBOX = [
  "allow-scripts",
  "allow-same-origin",
  "allow-forms",
  "allow-popups",
  "allow-popups-to-escape-sandbox",
  "allow-modals",
  "allow-downloads",
  "allow-top-navigation-by-user-activation",
].join(" ");

/**
 * The letterbox around the frame. It lives in a shadow root like the panel,
 * so page css cannot reach it. One mid gray reads as chrome in light and dark.
 */
const CSS = `
.viewport {
  all: initial;
  box-sizing: border-box;
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  direction: ltr;
  background: #6e6e69;
}
.size {
  flex: none;
  align-self: center;
  /* A set height, so the room the frame is fitted to never waits on the text. */
  height: 16px;
  padding: 4px 0;
  font: 11px/16px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  color: rgba(255, 255, 255, 0.7);
  user-select: none;
  -webkit-user-select: none;
}
.stage {
  flex: 1 1 0;
  min-height: 0;
  position: relative;
  overflow: hidden;
}
/* Scales the frame down to fit. A transform keeps the device pixel ratio
   inside, where zoom would change it, and hit testing follows it into the
   frame, so clicks land where they are drawn. */
.screen {
  position: absolute;
  top: 0;
  left: 0;
  transform-origin: 0 0;
}
iframe {
  display: block;
  border: 0;
  /* The canvas color of the frame's own scheme, which is what shows through a
     page that leaves its background to the browser. */
  background: Canvas;
}
`;

let host: HTMLElement | null = null;
let stage: HTMLElement | null = null;
let screen: HTMLElement | null = null;
let frame: HTMLIFrameElement | null = null;
let readout: HTMLElement | null = null;
let current: ViewportValue = { ...UNFRAMED, scheme: "system" };
/** The frame's page has loaded, so what it reports can be trusted. */
let loaded = false;
/** Where the frame was last seen on this origin. */
let frameUrl = "";
let latest: DevknobsState | null = null;
/** Only the page nodes made inert here, so a reset never touches the page's own. */
const inerted: Element[] = [];

/** The window inside the frame, while there is one. */
export function frameWindow(): Window | null {
  return frame?.contentWindow ?? null;
}

function share(): void {
  if (latest) post(frameWindow(), { source: "devknobs", type: "state", state: latest });
}

/** Keep the knobs and hand them to the frame, which applies them to its own page. */
export function sync(state: DevknobsState): void {
  latest = state;
  share();
}

/** Where the frame is now. A frame that left the origin keeps the last place seen. */
function locate(): string {
  try {
    const href = frame?.contentWindow?.location.href;
    if (href && href !== "about:blank") frameUrl = href;
  } catch {
    // Another origin: the frame cannot be followed there.
  }
  return frameUrl;
}

function onLoad(): void {
  loaded = true;
  locate();
  checkZoom();
  share();
}

/** A page that mounts late asks for the knobs once it listens. */
function onMessage(event: MessageEvent): void {
  if (readMessage(event, frameWindow(), window.location.origin)?.type === "ready") share();
}

/**
 * Does the browser hand a frame element's `color-scheme` to the page inside
 * as its `prefers-color-scheme`? css color adjust says it should (csswg #7493,
 * chrome 129, firefox 105). Asked once, of a blank probe frame that takes each
 * scheme in turn, so a dark system cannot pass for support.
 */
let schemeHandover: boolean | null = null;

function handsSchemeDown(root: Node): boolean {
  if (schemeHandover !== null) return schemeHandover;
  if (!root.isConnected) return false;
  const probe = document.createElement("iframe");
  probe.style.cssText = "position:absolute;width:0;height:0;border:0;visibility:hidden";
  root.appendChild(probe);
  const ask = (scheme: "light" | "dark"): boolean => {
    probe.style.colorScheme = scheme;
    // The frame only sees the scheme once the style above it is current.
    getComputedStyle(probe).getPropertyValue("color-scheme");
    return probe.contentWindow?.matchMedia(`(prefers-color-scheme: ${scheme})`).matches === true;
  };
  try {
    schemeHandover = ask("dark") && ask("light");
  } catch {
    schemeHandover = false;
  }
  probe.remove();
  return schemeHandover;
}

/** Where the frame goes in the room the letterbox leaves it. */
export interface Fit {
  /** The frame's css size, which is the viewport the page inside sees. */
  width: number;
  height: number;
  /** `zoom` on the frame. The page inside gets that many more device pixels per css pixel. */
  zoom: number;
  /** What the frame is drawn at, 1 or less. */
  scale: number;
  /** `transform: scale()` on the frame's wrapper: the fit, and the zoom undone. */
  transform: number;
  /** Offset of the frame from the left, which centers it. */
  left: number;
}

/**
 * Fit a frame `width` wide into `room`. One wider than the room is drawn
 * smaller, and made taller by as much, so it still fills the height. A zoom
 * keeps the frame's css size, and the wrapper takes it back out of the drawing.
 */
export function fit(width: WidthValue, room: { width: number; height: number }, zoom = 1): Fit {
  const size = typeof width === "number" ? width : room.width;
  const scale = size > 0 && room.width > 0 ? Math.min(1, room.width / size) : 1;
  return {
    width: size,
    height: room.height / scale,
    zoom,
    scale,
    transform: scale / zoom,
    left: Math.max(0, (room.width - size * scale) / 2),
  };
}

/** What the letterbox says about the frame, such as `1440 at 62% · 2x`. */
export function label(place: Fit, dpr: DprValue): string {
  let text = String(place.width);
  if (place.scale < 1) text += ` at ${Math.round(place.scale * 100)}%`;
  if (typeof dpr === "number") text += ` · ${dpr}x`;
  return text;
}

/**
 * Zoom on a frame multiplies the device pixel ratio of the page inside it
 * (csswg #9644, chromium since 2024), with the frame's css size unchanged.
 * False once a browser is seen not to, so its zoom never stretches a viewport.
 */
let zoomWorks = true;

function zoomFor(dpr: DprValue): number {
  if (!zoomWorks || typeof dpr !== "number" || !(window.devicePixelRatio > 0)) return 1;
  return dpr / window.devicePixelRatio;
}

/** Did the page inside get the ratio? If not, drop the zoom for good. */
function checkZoom(): void {
  const view = frameWindow();
  if (!frame || !view || !loaded || zoomFor(current.dpr) === 1) return;
  // The ratio inside follows the zoom once the layout above it is current.
  frame.getBoundingClientRect();
  try {
    if (Math.abs(view.devicePixelRatio - Number(current.dpr)) < 0.01) return;
  } catch {
    return;
  }
  zoomWorks = false;
  resize();
}

function resize(): void {
  if (!frame || !stage || !screen || !readout) return;
  // At full width the frame is the window, and there is nothing to read out.
  // This goes first, as it changes the room the frame has.
  readout.hidden = typeof current.width !== "number";
  const room = { width: stage.clientWidth, height: stage.clientHeight };
  const place = fit(current.width, room, zoomFor(current.dpr));
  readout.textContent = label(place, zoomWorks ? current.dpr : "system");
  frame.style.width = `${place.width}px`;
  frame.style.height = `${place.height}px`;
  frame.style.zoom = place.zoom === 1 ? "" : String(place.zoom);
  screen.style.left = `${place.left}px`;
  screen.style.transform = place.transform === 1 ? "" : `scale(${place.transform})`;
  // Natively, the page inside gets the scheme as its real preference. System
  // leaves the frame to follow the window.
  const native = current.scheme !== "system" && handsSchemeDown(frame.getRootNode());
  if (native) frame.style.colorScheme = current.scheme;
  else frame.style.removeProperty("color-scheme");
  frame.style.filter = visionFilter(current.vision);
  checkZoom();
}

/**
 * Cover the window with a frame that loads this page at the knob's width. The
 * page underneath stops scrolling and takes no input until the frame goes.
 */
function open(): void {
  const body = document.body;
  if (host || !needsFrame(current) || !body) return;
  host = document.createElement("div");
  host.setAttribute("data-devknobs", "viewport");
  host.style.cssText = `position:fixed;inset:0;z-index:${Z_INDEX}`;
  const root = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = CSS;
  const box = document.createElement("div");
  box.className = "viewport";
  readout = document.createElement("div");
  readout.className = "size";
  stage = document.createElement("div");
  stage.className = "stage";
  screen = document.createElement("div");
  screen.className = "screen";
  frame = document.createElement("iframe");
  frame.setAttribute(FRAME_ATTRIBUTE, "");
  frame.name = FRAME_NAME;
  frame.title = "devknobs viewport";
  frame.setAttribute("sandbox", SANDBOX);
  frameUrl = window.location.href;
  loaded = false;
  frame.src = frameUrl;
  frame.addEventListener("load", onLoad);
  screen.append(frame);
  stage.append(screen);
  box.append(readout, stage);
  root.append(style, box);
  for (const child of Array.from(body.children)) {
    if (child.hasAttribute("data-devknobs") || child.hasAttribute("inert")) continue;
    child.setAttribute("inert", "");
    inerted.push(child);
  }
  ensureStyle(NAME).textContent = "html{overflow:hidden!important}";
  window.addEventListener("message", onMessage);
  window.addEventListener("resize", resize);
  body.append(host);
  // Before the frame's page starts, which is no sooner than this task ends.
  resize();
}

/** Take the frame away. `follow` brings the window to where the frame went. */
function close(follow: boolean): void {
  current = { ...current, ...UNFRAMED };
  document.removeEventListener("DOMContentLoaded", open);
  if (!host) return;
  const target = follow ? locate() : "";
  window.removeEventListener("message", onMessage);
  window.removeEventListener("resize", resize);
  frame?.removeEventListener("load", onLoad);
  host.remove();
  host = null;
  stage = null;
  screen = null;
  frame = null;
  readout = null;
  for (const node of inerted) node.removeAttribute("inert");
  inerted.length = 0;
  removeStyle(NAME);
  if (target && target !== window.location.href) window.location.assign(target);
}

export function apply(value: ViewportValue): void {
  if (!needsFrame(value)) {
    close(true);
    return;
  }
  current = value;
  if (host) resize();
  else if (document.body) open();
  else document.addEventListener("DOMContentLoaded", open, { once: true });
}

/** Take the frame away and leave the window where it is. */
export function reset(): void {
  close(false);
}
