import type { SideValue } from "../types";
import { PANE_WIDTH } from "./pane";
import { between, PANEL_GAP } from "./place";
import type { LivePrefs } from "./prefs";

/**
 * How wide the panel is, and the strip on its page side that changes it, as
 * the edge of a docked devtools does. The rows and the settings share one
 * width and a feature's view has its own, wider one. Both are kept with the
 * preferences, and a window too narrow for one shows the panel narrower
 * without changing what is kept.
 */

/** What the panel shows, as far as its width goes: the rows or the settings, or a feature's view. */
export type Showing = "list" | "view";

/** How wide the panel is until the user says otherwise, in px. */
export const LIST_WIDTH = 240;
export const VIEW_WIDTH = PANE_WIDTH;

/** The narrowest the strip makes each, in px. */
export const LIST_MIN = 240;
export const VIEW_MIN = 280;

/** The widest the strip makes the panel, and what it leaves the page of the window's width, in px. */
export const WIDTH_MAX = 720;
export const PAGE_ROOM = 96;

/** How far an arrow key moves the strip, in px. */
export const WIDTH_STEP = 16;

/** How far the handle stands out of the panel, in px: its width less the pixel it sits over the panel. */
export const HANDLE_REACH = 21;

/** The widths the strip can set. */
export interface Limits {
  min: number;
  max: number;
}

/** The widths the strip can set in a window `view` wide. With no room to spare, only the least. */
export function widthLimits(showing: Showing, view: number): Limits {
  const min = showing === "view" ? VIEW_MIN : LIST_MIN;
  return { min, max: Math.max(min, Math.min(WIDTH_MAX, view - PAGE_ROOM)) };
}

/**
 * The width the panel takes for the one that is wanted, in a window `view`
 * wide: held between the strip's limits, and in a window too narrow even for
 * the least, what the handle and the gap leave, down to the rows' least,
 * which a panel always had.
 */
export function widthIn(showing: Showing, wanted: number, view: number): number {
  const { min, max } = widthLimits(showing, view);
  const room = view - HANDLE_REACH - PANEL_GAP;
  return Math.max(LIST_MIN, Math.min(Math.round(between(wanted, min, max)), room));
}

/**
 * The width a drag of the strip asks for, from the width it started at and
 * how far the pointer went across: away from the edge the panel is on is wider.
 */
export function dragWidth(from: number, travel: number, side: SideValue): number {
  return from + (side === "right" ? -travel : travel);
}

/**
 * The width a key on the strip asks for, or null for a key that is not the
 * strip's. An arrow moves the strip the way it points, so the one that points
 * away from the panel's edge of the window widens it. Home is the least and
 * End the most.
 */
export function keyWidth(
  key: string,
  width: number,
  limits: Limits,
  side: SideValue,
): number | null {
  if (key === "Home") return limits.min;
  if (key === "End") return limits.max;
  if (key !== "ArrowLeft" && key !== "ArrowRight") return null;
  const wider = (key === "ArrowLeft") === (side === "right");
  return between(width + (wider ? WIDTH_STEP : -WIDTH_STEP), limits.min, limits.max);
}

/**
 * Does the panel glide to a new width? Not to its first one, not under the
 * strip, which it follows one to one, and not as the window resizes.
 */
export function widthGlides(cue: { first: boolean; dragging: boolean; resizing: boolean }): boolean {
  return !cue.first && !cue.dragging && !cue.resizing;
}

/** What the strip needs from the panel. */
export interface SizerContext {
  /** The host, which is as wide as the panel and its handle. */
  host: HTMLElement;
  /** The wrapper, which carries the width as `--panel-width`. */
  wrap: HTMLElement;
  panel: HTMLElement;
  prefs: LivePrefs;
  /** What the panel shows now. */
  showing(): Showing;
  /** Whether the panel is open, and the side of the window it is on. */
  place(): { open: boolean; side: SideValue };
  /** The panel has a new width, which it glides to or not. */
  sized(glide: boolean): void;
}

export interface Sizer {
  /** The strip, which goes in the panel. */
  strip: HTMLElement;
  /**
   * Give the panel the width of what it shows. `draw` draws that, at the
   * width the panel ends at, so what is measured there holds once it has
   * glided. A closed panel keeps its width until it opens, as its handle
   * would jump with it.
   */
  size(draw?: () => void): void;
  /** The window resized: the panel takes the width that leaves, at once. */
  fit(): void;
  /** End a drag the window took away, back at the width that is kept. */
  cancel(): void;
}

/** The strip's drag: what it sizes, the pointer that drags, where it started and where it is. */
interface Held {
  showing: Showing;
  pointer: number;
  from: number;
  x: number;
  width: number;
  moved: boolean;
}

export function createSizer(context: SizerContext): Sizer {
  const { host, wrap, panel, prefs } = context;

  const strip = document.createElement("div");
  strip.className = "sizer";
  strip.tabIndex = 0;
  strip.setAttribute("role", "separator");
  strip.setAttribute("aria-orientation", "vertical");
  strip.setAttribute("aria-label", "panel width");

  /** The width the panel has, null before its first. */
  let shown: number | null = null;
  let held: Held | null = null;

  /** The window's width less a scrollbar, the room the host is fixed in. */
  function viewWidth(): number {
    return document.documentElement.clientWidth || window.innerWidth;
  }

  function put(width: number): void {
    wrap.style.setProperty("--panel-width", `${width}px`);
  }

  /**
   * The host takes the new width at once, so the frame is fitted beside where
   * the panel ends up, once, as the glide starts. The panel takes it with no
   * transition for `draw`, and where it glides, goes back to the width it had
   * and is let go from there.
   */
  function apply(draw: (() => void) | undefined, resizing: boolean): void {
    const showing = context.showing();
    const view = viewWidth();
    const kept = showing === "view" ? prefs.get().viewWidth : prefs.get().listWidth;
    const next = widthIn(showing, held?.showing === showing ? held.width : kept, view);
    const from = shown;
    const limits = widthLimits(showing, view);
    strip.setAttribute("aria-valuemin", String(limits.min));
    strip.setAttribute("aria-valuemax", String(limits.max));
    if (next === from || (from !== null && !context.place().open)) {
      draw?.();
      return;
    }
    strip.setAttribute("aria-valuenow", String(next));
    const glide = widthGlides({ first: from === null, dragging: held !== null, resizing });
    shown = next;
    host.style.width = `${HANDLE_REACH + next}px`;
    panel.style.transitionProperty = "none";
    put(next);
    draw?.();
    if (glide && from !== null) put(from);
    // Read the layout, so the width is in before the transition returns.
    panel.getBoundingClientRect();
    panel.style.transitionProperty = "";
    put(next);
    if (from !== null) context.sized(glide);
  }

  /** End the drag: the width it reached is kept, or dropped for the one that was. */
  function end(keep: boolean): void {
    if (!held) return;
    const { showing, pointer, width, moved } = held;
    held = null;
    delete wrap.dataset.sizing;
    if (strip.hasPointerCapture(pointer)) strip.releasePointerCapture(pointer);
    if (keep && moved) prefs.setWidth(showing, width);
    else apply(undefined, false);
  }

  // The capture keeps the drag while the pointer is over the page, or a frame in it.
  strip.addEventListener("pointerdown", (event: PointerEvent) => {
    if (event.button !== 0 || held || shown === null) return;
    held = {
      showing: context.showing(),
      pointer: event.pointerId,
      from: shown,
      x: event.clientX,
      width: shown,
      moved: false,
    };
    wrap.dataset.sizing = "true";
    strip.setPointerCapture(event.pointerId);
  });
  strip.addEventListener("pointermove", (event: PointerEvent) => {
    if (!held || event.pointerId !== held.pointer) return;
    const wanted = dragWidth(held.from, event.clientX - held.x, context.place().side);
    const width = widthIn(held.showing, wanted, viewWidth());
    if (width === held.width) return;
    held.width = width;
    held.moved = true;
    // Not through the preferences: a pointermove is no reason to write them.
    apply(undefined, false);
  });
  strip.addEventListener("pointerup", (event: PointerEvent) => {
    if (event.pointerId === held?.pointer) end(true);
  });
  strip.addEventListener("pointercancel", (event: PointerEvent) => {
    if (event.pointerId === held?.pointer) end(false);
  });
  // The browser can take the pointer away. The capture a pointerup lets go of
  // finds the drag already ended.
  strip.addEventListener("lostpointercapture", (event: PointerEvent) => {
    if (event.pointerId === held?.pointer) end(false);
  });
  strip.addEventListener("dblclick", () => {
    const showing = context.showing();
    prefs.setWidth(showing, showing === "view" ? VIEW_WIDTH : LIST_WIDTH);
  });
  strip.addEventListener("keydown", (event: KeyboardEvent) => {
    if (shown === null || event.altKey || event.ctrlKey || event.metaKey) return;
    const showing = context.showing();
    const limits = widthLimits(showing, viewWidth());
    const next = keyWidth(event.key, shown, limits, context.place().side);
    if (next === null) return;
    event.preventDefault();
    prefs.setWidth(showing, next);
  });

  return {
    strip,
    size: (draw) => apply(draw, false),
    fit: () => apply(undefined, true),
    cancel: () => end(false),
  };
}
