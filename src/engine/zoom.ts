/** The zooms the letterbox and the panel offer after fit, as scales. */
export const ZOOM_PRESETS: readonly number[] = [0.5, 0.75, 1, 1.25, 1.5];

/** The smallest and the largest scale the frame is drawn at. */
export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 4;

/** What the zoom keys step through: the browser's own page zoom levels. */
const ZOOM_STEPS: readonly number[] = [
  0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4,
];

/** How far a wheel event may zoom at once, in wheel pixels: a mouse notch is a tenth. */
const WHEEL_LIMIT = 10;

export interface Point {
  x: number;
  y: number;
}

export function clampZoom(scale: number): number {
  return Math.min(Math.max(scale, ZOOM_MIN), ZOOM_MAX);
}

/** A scale as the letterbox and the panel say it, such as `125%`. */
export function percent(scale: number): string {
  return `${Math.round(scale * 100)}%`;
}

/** The next step in or out from a scale, which need not be a step itself, as fit is not. */
export function stepZoom(scale: number, direction: 1 | -1): number {
  const slack = 0.001;
  if (direction > 0) return ZOOM_STEPS.find((step) => step > scale + slack) ?? ZOOM_MAX;
  return [...ZOOM_STEPS].reverse().find((step) => step < scale - slack) ?? ZOOM_MIN;
}

/**
 * The scale after a wheel event with ctrl or meta, which is also what a
 * trackpad pinch sends: down zooms out, up zooms in. A pinch moves a little
 * per event, and a mouse notch no more than a tenth.
 */
export function wheelZoom(scale: number, deltaY: number): number {
  const delta = Math.min(Math.max(deltaY, -WHEEL_LIMIT), WHEEL_LIMIT);
  return clampZoom(scale * Math.exp(-delta / 100));
}

/**
 * Where the letterbox scrolls to after a zoom, so the point of the frame under
 * the pointer stays under it. The pointer is in the letterbox's visible area,
 * and each origin is the frame's top left in its scrolled content, at the
 * scale before and after. The browser clamps what falls outside.
 */
export function anchorScroll(
  pointer: Point,
  scroll: Point,
  before: { origin: Point; scale: number },
  after: { origin: Point; scale: number },
): Point {
  const ratio = after.scale / before.scale;
  return {
    x: after.origin.x + (scroll.x + pointer.x - before.origin.x) * ratio - pointer.x,
    y: after.origin.y + (scroll.y + pointer.y - before.origin.y) * ratio - pointer.y,
  };
}
