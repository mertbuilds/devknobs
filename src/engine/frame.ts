import { type BoxRing, RINGS } from "../grab/boxmodel";
import type { DevknobsState, PanelValue, SchemeValue } from "../types";
import { parse } from "./store";

/** Marks the iframe the width knob renders the page in. */
export const FRAME_ATTRIBUTE = "data-devknobs-frame";

/**
 * The same frame by window name. A page that cannot reach its frame element,
 * such as one on `file:`, still knows it is framed and never opens a frame of
 * its own.
 */
export const FRAME_NAME = "devknobs-frame";

/**
 * Marks the frame while an outside page is in it, with the address its bar
 * shows. That page is on another origin, so nothing reads its window or its
 * document.
 */
export const OUTSIDE_ATTRIBUTE = "data-devknobs-outside";

/**
 * May the page in `frame` be read? Not while an outside page is in it. Every
 * read of the frame's window or document asks this first, so an outside page
 * is never touched.
 */
export function reachable(frame: HTMLIFrameElement): boolean {
  return !frame.hasAttribute(OUTSIDE_ATTRIBUTE);
}

/** What a zoom key asks of the frame: a step in or out, or back to fit. */
export type ZoomAction = "zoom-in" | "zoom-out" | "zoom-fit";

/** What a key pressed inside the frame asks of the panel above it. */
export type KeyAction =
  | "toggle"
  | "close"
  | "replay"
  | "requests"
  | "reset"
  | "storage"
  | "search"
  | ZoomAction;

const KEY_ACTIONS: readonly KeyAction[] = [
  "toggle",
  "close",
  "replay",
  "requests",
  "reset",
  "storage",
  "search",
  "zoom-in",
  "zoom-out",
  "zoom-fit",
];

/** Everything the page and its frame say to each other. */
export type DevknobsMessage =
  | { source: "devknobs"; type: "state"; state: DevknobsState }
  | { source: "devknobs"; type: "key"; action: KeyAction }
  | { source: "devknobs"; type: "overflow"; count: number }
  | { source: "devknobs"; type: "grab" | "inspect"; on: boolean; scheme?: "light" | "dark" }
  /** `picked`: inspect took an element in the frame. `outline`: the frame is to box another. */
  | { source: "devknobs"; type: "ready" | "replay" | "picked" | "outline" }
  /** The frame is to tint one area of the box it outlines, or with null all four. */
  | { source: "devknobs"; type: "area"; ring: BoxRing | null };

/** The parts of a `MessageEvent` that decide whether devknobs reads it. */
export interface Envelope {
  data: unknown;
  origin: string;
  source: unknown;
}

/** Is this page the one the width knob renders inside its frame? */
export function isDevknobsFrame(): boolean {
  try {
    if (window.frameElement?.hasAttribute(FRAME_ATTRIBUTE)) return true;
  } catch {
    // A parent on another origin. The name still tells.
  }
  return window.name === FRAME_NAME;
}

/**
 * Inside the frame: does the frame element carry the scheme? The page above
 * only sets it there when the browser hands it down as this page's real
 * `prefers-color-scheme`, so there is nothing left to emulate.
 */
export function nativeScheme(scheme: SchemeValue): boolean {
  if (scheme === "system") return false;
  try {
    const owner = window.frameElement as HTMLElement | null;
    return owner?.style.getPropertyValue("color-scheme") === scheme;
  } catch {
    return false;
  }
}

/**
 * Does the browser hand a frame element's `color-scheme` to the page inside
 * as its `prefers-color-scheme`? css color adjust says it should (csswg #7493,
 * chrome 129, firefox 105). Asked once, of a blank probe frame that takes each
 * scheme in turn, so a dark system cannot pass for support.
 */
let schemeHandover: boolean | null = null;

export function handsSchemeDown(root: Node): boolean {
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

/** The knobs that bring the frame up. */
export type FrameKnobs = Pick<DevknobsState, "width" | "height" | "frame" | "dpr" | "vision">;

/** Each of those knobs at the value that leaves the frame down. */
export const UNFRAMED: FrameKnobs = {
  width: "full",
  height: "full",
  frame: false,
  dpr: "system",
  vision: "none",
};

function positive(value: number | string): boolean {
  return typeof value === "number" && value > 0;
}

/** The frame knobs, with the panel where it can be pinned to its side. */
export type Framing = FrameKnobs & { panel?: Pick<PanelValue, "docked"> };

/**
 * Does any knob need the page inside the frame? Device pixels only exist in a
 * frame. Vision does too: its filter on the frame leaves the panel alone and
 * fixed elements in place, where one on `<html>` would not.
 */
export function knobFrame(knobs: FrameKnobs): boolean {
  return (
    positive(knobs.width) ||
    positive(knobs.height) ||
    knobs.frame ||
    positive(knobs.dpr) ||
    knobs.vision !== "none"
  );
}

/**
 * Is the page inside the frame? A knob puts it there, and so does a panel
 * pinned to its side: only a frame gives the page a viewport that ends where
 * the panel starts, for its media queries, `100vw` and fixed boxes alike.
 */
export function needsFrame(knobs: Framing): boolean {
  return knobFrame(knobs) || knobs.panel?.docked === true;
}

/**
 * Is the frame up for a pinned panel alone? Then it is the page as it was,
 * edge to edge in the room the panel leaves: no mat shows, and no zoom.
 */
export function plainFrame(knobs: Framing): boolean {
  return knobs.panel?.docked === true && !knobFrame(knobs);
}

/**
 * Is the frame up whatever the frame knob says? A size, a ratio or a vision
 * deficiency brings it up alone, and the knob then changes nothing to see.
 */
export function frameForced(knobs: Framing): boolean {
  return needsFrame({ ...knobs, frame: false });
}

/**
 * The knobs a framed page runs with. It is the viewport already, so it never
 * frames itself, for a knob or for a pinned panel.
 */
export function framed(state: DevknobsState): DevknobsState {
  if (!needsFrame(state)) return state;
  return { ...state, ...UNFRAMED, panel: { ...state.panel, docked: false } };
}

/**
 * Read a devknobs message sent by `from` on `origin`. Anything from another
 * window or origin, or in another shape, is null.
 */
export function readMessage(
  event: Envelope,
  from: object | null,
  origin: string,
): DevknobsMessage | null {
  if (from === null || event.source !== from || event.origin !== origin) return null;
  const data = event.data;
  if (typeof data !== "object" || data === null) return null;
  const message = data as Record<string, unknown>;
  if (message.source !== "devknobs") return null;
  const type = message.type;
  if (type === "state") {
    if (typeof message.state !== "object" || message.state === null) return null;
    return { source: "devknobs", type, state: parse(JSON.stringify(message.state)) };
  }
  if (type === "key") {
    const action = KEY_ACTIONS.find((known) => known === message.action);
    return action ? { source: "devknobs", type, action } : null;
  }
  if (type === "overflow") {
    const count = message.count;
    if (typeof count !== "number" || !Number.isInteger(count) || count < 0) return null;
    return { source: "devknobs", type, count };
  }
  if (type === "grab" || type === "inspect") {
    if (typeof message.on !== "boolean") return null;
    const scheme =
      message.scheme === "light" || message.scheme === "dark" ? message.scheme : undefined;
    return scheme
      ? { source: "devknobs", type, on: message.on, scheme }
      : { source: "devknobs", type, on: message.on };
  }
  if (type === "area") {
    const ring = RINGS.find((known) => known === message.ring) ?? null;
    return ring === null && message.ring !== null ? null : { source: "devknobs", type, ring };
  }
  if (type === "ready" || type === "replay" || type === "picked" || type === "outline") {
    return { source: "devknobs", type };
  }
  return null;
}

/** Post to a window on this origin. A window on any other origin never sees it. */
export function post(target: Window | null, message: DevknobsMessage): void {
  target?.postMessage(message, "/");
}
