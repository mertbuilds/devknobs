import type { PanelValue } from "../types";
import { folding } from "./foldrun";
import type { Rect } from "./mock";
import { bezier, FADE_CURVE, sameRect } from "./morph";
import { running, still } from "./morphrun";
import { turning } from "./turnrun";
import type { Point } from "./zoom";

/**
 * The frame glides to its new place when the panel goes to the other side,
 * or opens or closes, and moves what the frame is fitted beside. What shows
 * is measured before and after the frame is drawn there, moved back by the
 * difference and let go, by `translate` and `scale` alone, so the case, the
 * page and the bars glide as one and the page inside lays out once.
 */

/** How long a glide takes at the least and at the most, in ms, as the panel's own. */
export const FRAME_GLIDE = 220;
export const FRAME_GLIDE_MAX = 440;

/** The fastest a glide goes on average, in px per ms, until it takes `FRAME_GLIDE_MAX`. */
const FRAME_GLIDE_SPEED = 6;

/** The panel as the frame is fitted beside it. */
export type PanelSpot = Pick<PanelValue, "open" | "side">;

/** What decides whether a change of the knobs glides the frame. */
export interface GlideCue {
  /** The knobs are applied for the first time, as on a reload. */
  first: boolean;
  /** The user asks for less motion, or the browser cannot animate. */
  still: boolean;
  /** A device change, turn or fold moves the frame already. */
  moving: boolean;
  from: PanelSpot;
  to: PanelSpot;
}

/**
 * Does the frame glide? Only when the panel changed side or opened or closed,
 * never on the first paint, with less motion, or while the device moves.
 */
export function glides(cue: GlideCue): boolean {
  if (cue.first || cue.still || cue.moving) return false;
  return cue.from.side !== cue.to.side || cue.from.open !== cue.to.open;
}

/** How far the frame is moved back and scaled, to show where it was. */
export interface Flip {
  x: number;
  y: number;
  sx: number;
  sy: number;
}

/**
 * What takes the frame drawn at `after` back to where it showed at `before`,
 * with its top left as the origin, or null where it did not move.
 */
export function flipOf(before: Rect, after: Rect): Flip | null {
  if (sameRect(before, after)) return null;
  return {
    x: before.x - after.x,
    y: before.y - after.y,
    sx: after.width > 0 ? before.width / after.width : 1,
    sy: after.height > 0 ? before.height / after.height : 1,
  };
}

/** How long a glide over a distance in px takes, in ms: longer the farther it goes. */
export function frameGlideTime(distance: number): number {
  return Math.min(Math.max(distance / FRAME_GLIDE_SPEED, FRAME_GLIDE), FRAME_GLIDE_MAX);
}

/** Where the frame is drawn, as a key that changes when its place does. */
export function placeKey(at: Point, scale: number): string {
  return `${at.x}|${at.y}|${scale}`;
}

/** The glide on its way, and the place it goes to. */
let flight: { animation: Animation; to: string } | null = null;
/** Where the frame was last drawn. */
let placed = "";

/** End a glide where it goes: the frame shows where it is drawn. */
export function landGlide(): void {
  flight?.animation.cancel();
  flight = null;
}

/**
 * The frame was drawn at `key`. A glide toward another place, as the window
 * resized or a picture came in, lands, as it no longer ends where it shows.
 */
export function drawnAt(key: string): void {
  if (flight && flight.to !== key) landGlide();
  placed = key;
}

function rectOf(node: HTMLElement): Rect {
  const { left, top, width, height } = node.getBoundingClientRect();
  return { x: left, y: top, width, height };
}

/**
 * Draw the frame with `draw`, and glide `node`, which holds the case and the
 * page, from where it shows to there, as `cue` says. A glide on its way starts
 * the next from where it got to.
 */
export function glideFrame(
  node: HTMLElement | null,
  cue: Omit<GlideCue, "still" | "moving">,
  draw: () => void,
): void {
  const moving = running() || turning() || folding();
  if (!node || !glides({ ...cue, still: still(), moving })) {
    draw();
    return;
  }
  const before = rectOf(node);
  landGlide();
  draw();
  const flip = flipOf(before, rectOf(node));
  if (!flip) return;
  const animation = node.animate(
    [
      { translate: `${flip.x}px ${flip.y}px`, scale: `${flip.sx} ${flip.sy}` },
      { translate: "0px 0px", scale: "1 1" },
    ],
    { duration: frameGlideTime(Math.hypot(flip.x, flip.y)), easing: bezier(FADE_CURVE) },
  );
  const going = { animation, to: placed };
  flight = going;
  animation.finished.then(
    () => {
      if (flight === going) flight = null;
    },
    () => {},
  );
}
