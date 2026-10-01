import type { DevknobsState, WidthValue } from "../types";
import { FRAME_ATTRIBUTE, FRAME_NAME, post, readMessage } from "./frame";
import { ensureStyle, removeStyle } from "./style";

const NAME = "width";

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
  background: #fff;
}
`;

let host: HTMLElement | null = null;
let frame: HTMLIFrameElement | null = null;
let readout: HTMLElement | null = null;
/** The width the frame should have, or 0 while the knob is off. */
let size = 0;
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

function resize(): void {
  if (frame) frame.style.width = `${size}px`;
  if (readout) readout.textContent = String(size);
}

/**
 * Cover the window with a frame that loads this page at the knob's width. The
 * page underneath stops scrolling and takes no input until the frame goes.
 */
function open(): void {
  const body = document.body;
  if (host || !(size > 0) || !body) return;
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
  resize();
  for (const child of Array.from(body.children)) {
    if (child.hasAttribute("data-devknobs") || child.hasAttribute("inert")) continue;
    child.setAttribute("inert", "");
    inerted.push(child);
  }
  ensureStyle(NAME).textContent = "html{overflow:hidden!important}";
  window.addEventListener("message", onMessage);
  body.append(host);
}

/** Take the frame away. `follow` brings the window to where the frame went. */
function close(follow: boolean): void {
  size = 0;
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

export function apply(value: WidthValue): void {
  if (typeof value !== "number" || !(value > 0)) {
    close(true);
    return;
  }
  size = value;
  if (host) resize();
  else if (document.body) open();
  else document.addEventListener("DOMContentLoaded", open, { once: true });
}

/** Take the frame away and leave the window where it is. */
export function reset(): void {
  close(false);
}
