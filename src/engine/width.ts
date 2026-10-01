import type { DevknobsState } from "../types";
import { FRAME_ATTRIBUTE, FRAME_NAME, post, readMessage } from "./frame";
import { ensureStyle, removeStyle } from "./style";

const NAME = "width";

/** What the frame takes from the knobs. */
export type ViewportValue = Pick<DevknobsState, "width" | "scheme">;

/** One under the panel host, so the panel stays on top of the frame. */
const Z_INDEX = 2147483645;

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
  overflow: auto;
  overscroll-behavior: contain;
  direction: ltr;
  background: #6e6e69;
}
.size {
  flex: none;
  align-self: center;
  padding: 4px 0;
  font: 11px/16px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  color: rgba(255, 255, 255, 0.7);
  user-select: none;
  -webkit-user-select: none;
}
iframe {
  flex: 1 1 0;
  min-height: 0;
  display: block;
  /* Auto margins center the frame, and fall back to the start edge when it is
     wider than the window, so the overflow can be scrolled to. */
  margin: 0 auto;
  border: 0;
  /* The canvas color of the frame's own scheme, which is what shows through a
     page that leaves its background to the browser. */
  background: Canvas;
}
`;

let host: HTMLElement | null = null;
let frame: HTMLIFrameElement | null = null;
let readout: HTMLElement | null = null;
let current: ViewportValue = { width: "full", scheme: "system" };
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
  locate();
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

function resize(): void {
  const width = typeof current.width === "number" ? current.width : 0;
  if (readout) readout.textContent = String(width);
  if (!frame) return;
  frame.style.width = `${width}px`;
  // Natively, the page inside gets the scheme as its real preference. System
  // leaves the frame to follow the window.
  const native = current.scheme !== "system" && handsSchemeDown(frame.getRootNode());
  if (native) frame.style.colorScheme = current.scheme;
  else frame.style.removeProperty("color-scheme");
}

/**
 * Cover the window with a frame that loads this page at the knob's width. The
 * page underneath stops scrolling and takes no input until the frame goes.
 */
function open(): void {
  const body = document.body;
  if (host || typeof current.width !== "number" || !body) return;
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
  frame = document.createElement("iframe");
  frame.setAttribute(FRAME_ATTRIBUTE, "");
  frame.name = FRAME_NAME;
  frame.title = "devknobs viewport";
  frameUrl = window.location.href;
  frame.src = frameUrl;
  frame.addEventListener("load", onLoad);
  box.append(readout, frame);
  root.append(style, box);
  for (const child of Array.from(body.children)) {
    if (child.hasAttribute("data-devknobs") || child.hasAttribute("inert")) continue;
    child.setAttribute("inert", "");
    inerted.push(child);
  }
  ensureStyle(NAME).textContent = "html{overflow:hidden!important}";
  window.addEventListener("message", onMessage);
  body.append(host);
  // Before the frame's page starts, which is no sooner than this task ends.
  resize();
}

/** Take the frame away. `follow` brings the window to where the frame went. */
function close(follow: boolean): void {
  current = { ...current, width: "full" };
  document.removeEventListener("DOMContentLoaded", open);
  if (!host) return;
  const target = follow ? locate() : "";
  window.removeEventListener("message", onMessage);
  frame?.removeEventListener("load", onLoad);
  host.remove();
  host = null;
  frame = null;
  readout = null;
  for (const node of inerted) node.removeAttribute("inert");
  inerted.length = 0;
  removeStyle(NAME);
  if (target && target !== window.location.href) window.location.assign(target);
}

export function apply(value: ViewportValue): void {
  if (typeof value.width !== "number" || !(value.width > 0)) {
    close(true);
    return;
  }
  current = { width: value.width, scheme: value.scheme };
  if (host) resize();
  else if (document.body) open();
  else document.addEventListener("DOMContentLoaded", open, { once: true });
}

/** Take the frame away and leave the window where it is. */
export function reset(): void {
  close(false);
}
