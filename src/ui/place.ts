import type { EdgeValue, PanelValue, SideValue } from "../types";

/**
 * Where the handle and the panel sit against the window's edges, and how a
 * drag on the handle lands: the snapping, the fling and the glide, as numbers
 * with no page to read.
 */

/** Pointer travel that turns a click on the handle into a drag. */
export const DRAG_SLOP = 4;

/** How far back the pointer's speed is read from when a drag ends, in ms. */
export const FLING_SPAN = 150;

/** The shortest stretch of a drag a speed is read over, in ms. */
export const FLING_STRETCH = 40;

/** The shortest a whole drag can be and still have a speed, in ms. */
const FLING_LEAST = 8;

/** Speed across, in px per ms, that throws the panel to the other side. */
export const FLING = 0.5;

/** How many times faster than up or down a fling must go across to count as one. */
export const FLING_LEAN = 1.5;

/** Travel across, in px, a drag needs before it can be flung, so a hurried click never is. */
export const FLING_TRAVEL = 16;

/** How long a glide takes at the least and at the most, in ms. */
export const GLIDE = 220;
export const GLIDE_MAX = 440;

/** The fastest a glide goes on average, in px per ms, until it takes `GLIDE_MAX`. */
export const GLIDE_SPEED = 6;

/** Space the panel keeps between itself and the top or bottom of the viewport. */
export const PANEL_GAP = 8;

/**
 * How near an edge pulls a box flush with it, in px. More than the panel's
 * corner radius, so the handle never sits on the curve of a corner.
 */
export const SNAP = 24;

/**
 * What a drag on the handle moves: a plain one the panel and the handle as
 * one, a shift one the handle alone along the panel's edge. A closed panel
 * has only the handle to move.
 */
export function dragTarget(shift: boolean, open: boolean): "panel" | "handle" {
  return open && !shift ? "panel" : "handle";
}

/** Where the handle and the panel sit, and the edges they sit flush with. */
export type Place = Pick<PanelValue, "y" | "top" | "edge" | "tab">;

/** The heights a layout works with, in px: the window's, the panel's and the handle's. */
export interface Room {
  view: number;
  panel: number;
  handle: number;
}

/** A value kept between two bounds. With no room between them, the lower one. */
export function between(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

/**
 * A value kept between two bounds and pulled flush with the nearer one once
 * it is within `SNAP` of it.
 */
export function snap(value: number, min: number, max: number): number {
  const end = Math.max(min, max);
  const at = between(value, min, end);
  if (at - min <= SNAP && at - min <= end - at) return min;
  return end - at <= SNAP ? end : at;
}

/**
 * The end of a span a value sits at, to the half px. A box as big as its span
 * sits at both, and keeps the one it had.
 */
function edgeOf(value: number, min: number, max: number, had: EdgeValue): EdgeValue {
  const top = Math.abs(value - min) < 0.5;
  const bottom = Math.abs(value - max) < 0.5;
  if (top && bottom) return had === "none" ? "top" : had;
  return top ? "top" : bottom ? "bottom" : "none";
}

/**
 * Lay the handle and the panel out for the heights there are. The panel goes
 * to the edge of the window it sits flush with, so one at the bottom grows
 * upward, and the handle to the corner of the panel it sits flush with. What
 * sits flush with nothing keeps its place. Then the window's edges, less the
 * gap, pull the panel flush within `SNAP` and keep it inside, and the panel's
 * corners do the same for the handle. The edges they end up flush with are
 * what the next layout keeps them to, so a layout of a layout moves nothing.
 */
export function settle(place: Place, room: Room): Place {
  const last = room.view - PANEL_GAP - room.panel;
  const top = snap(
    place.edge === "top" ? PANEL_GAP : place.edge === "bottom" ? last : place.top,
    PANEL_GAP,
    last,
  );
  const low = top + room.panel - room.handle;
  const y = snap(place.tab === "top" ? top : place.tab === "bottom" ? low : place.y, top, low);
  return {
    y,
    top,
    edge: edgeOf(top, PANEL_GAP, last, place.edge),
    tab: edgeOf(y, top, low, place.tab),
  };
}

/**
 * The corner of a panel whose top is at `top` that a handle at `y` covers, if
 * any. A closed panel stays where it last showed while its handle may move
 * on, so this is what tells the two apart while the slide back still shows it.
 */
export function cornerAt(y: number, top: number, room: Room): EdgeValue {
  return edgeOf(y, top, top + room.panel - room.handle, "none");
}

/**
 * Where a drag lands, from where it started and where the pointer would put
 * what it moves with no edge pulling: the panel's top for a plain drag, the
 * handle's top for a shift drag or a closed panel's. A plain drag carries the
 * handle along, a shift drag slides it along the panel, and a closed panel's
 * handle snaps to the window's edges and carries the hidden panel along as
 * far as the window lets it, so the panel opens where the handle left it.
 */
export function dragTo(
  target: "panel" | "handle",
  open: boolean,
  to: number,
  from: Place,
  room: Room,
): Place {
  const offset = from.y - from.top;
  if (target === "panel") {
    const top = snap(to, PANEL_GAP, room.view - PANEL_GAP - room.panel);
    return settle({ y: top + offset, top, edge: "none", tab: "none" }, room);
  }
  if (open) return settle({ ...from, y: to, tab: "none" }, room);
  const y = snap(to, PANEL_GAP, room.view - PANEL_GAP - room.handle);
  return settle({ y, top: y - offset, edge: "none", tab: "none" }, room);
}

/** Where the pointer was at a moment of a drag, in px and ms. */
export interface Sample {
  t: number;
  x: number;
  y: number;
}

/** The speed from one sample to a later one, in px per ms. */
function speedOf(from: Sample, to: Sample): { x: number; y: number } {
  const time = to.t - from.t;
  return { x: (to.x - from.x) / time, y: (to.y - from.y) / time };
}

/**
 * The pointer's speed in px per ms as a drag ends: that of its fastest
 * stretch in the `FLING_SPAN` before `at`. A hand slows down, and often
 * stops, before the button comes up, so the speed at the release itself says
 * little about the throw. A stretch is `FLING_STRETCH` long or a little more,
 * so one jittery event does not make a fling, and a pointer that stopped a
 * span before it let go has none. A drag shorter than a stretch is read whole.
 */
export function velocity(samples: Sample[], at: number): { x: number; y: number } {
  const recent = samples.filter((sample) => sample.t >= at - FLING_SPAN && sample.t <= at);
  let fastest = { x: 0, y: 0 };
  let read = false;
  for (const [index, end] of recent.entries()) {
    // The shortest stretch that ends here: from the last sample far enough back.
    let start: Sample | undefined;
    for (const sample of recent.slice(0, index)) {
      if (end.t - sample.t >= FLING_STRETCH) start = sample;
    }
    if (!start) continue;
    const speed = speedOf(start, end);
    if (!read || Math.hypot(speed.x, speed.y) > Math.hypot(fastest.x, fastest.y)) fastest = speed;
    read = true;
  }
  const first = recent[0];
  const last = recent[recent.length - 1];
  if (!read && first && last && last.t - first.t >= FLING_LEAST) return speedOf(first, last);
  return fastest;
}

/** How long a glide over a distance in px takes, in ms: longer the farther it goes. */
export function glideTime(distance: number): number {
  return between(distance / GLIDE_SPEED, GLIDE, GLIDE_MAX);
}

/**
 * The side a dragged panel lands on, from the side it left, the middle of
 * what was dragged across a window `width` wide, and the pointer's speed. A
 * fling toward the other side lands it there wherever it is. Past the middle
 * of the window it lands there too, unless it was flung back home. A fling
 * goes mostly across, so a fast drag up or down never changes sides.
 */
export function landSide(
  side: SideValue,
  x: number,
  width: number,
  vx: number,
  vy: number,
): SideValue {
  const other = side === "right" ? "left" : "right";
  // Speed toward the other side, less than zero toward home.
  const toward = side === "right" ? -vx : vx;
  const across = Math.abs(vx) >= FLING && Math.abs(vx) > FLING_LEAN * Math.abs(vy);
  const past = side === "right" ? x < width / 2 : x > width / 2;
  if (across && toward > 0) return other;
  if (across && toward < 0) return side;
  return past ? other : side;
}

/** A computed `translate`, such as `-120px 4px` or `none`, as px. */
export function translateOf(value: string): { x: number; y: number } {
  const [x = 0, y = 0] = value === "none" ? [] : value.split(" ").map((part) => parseFloat(part));
  return { x: Number.isFinite(x) ? x : 0, y: Number.isFinite(y) ? y : 0 };
}
