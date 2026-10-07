/** How long a pointer on the move stays on one element before the box goes to it, in ms. */
export const DWELL = 80;

/** Slower than this, in px a ms, the pointer is coming to rest. */
export const SLOW = 0.3;

/** What the hit test found of an element the box is not on yet. */
export interface Hover {
  /** A box is up: on an element, or still on the last one for a moment. */
  boxed: boolean;
  /** How long the hit test has found this one element, in ms. */
  held: number;
  /** How fast the pointer went since the hit test before, in px a ms. */
  speed: number;
}

/**
 * Whether the box goes to the element under the pointer now. A pointer that
 * sweeps the page only passes over most of what it crosses, and a box that
 * set off for each of those would never get to one. So the box waits for the
 * pointer to slow down, or to stay on one element for a while. The first
 * box has nothing to leave, and is up at once.
 */
export function settles(hover: Hover): boolean {
  return !hover.boxed || hover.speed < SLOW || hover.held >= DWELL;
}

/** How fast a pointer went from one point to another in `elapsed` ms, in px a ms. */
export function speedOf(
  from: { x: number; y: number },
  to: { x: number; y: number },
  elapsed: number,
): number {
  return Math.hypot(to.x - from.x, to.y - from.y) / Math.max(elapsed, 1);
}
