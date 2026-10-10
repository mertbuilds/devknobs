import type { ColumnEdge } from "../engine/dock";
import type { SideValue } from "../types";

/**
 * A pinned panel's column as it shows on the window, which the page's frame
 * follows while the column moves: read from where it is drawn, its slide and
 * its glide included, so the page's edge and the column's are one.
 */

/** What moves the column across: the wrapper's open and close slide and its glide, and the panel's width. */
const SLIDES = ["transform", "translate"];
const GROWS = ["width"];

/** What is asked of the wrapper: the transitions on their way on it. */
interface Glider {
  getAnimations(): readonly object[];
}

/** And of the panel: where its box shows as well. */
interface Box extends Glider {
  getBoundingClientRect(): { left: number; right: number };
}

/** Is a transition of one of `names` on its way on `node`? */
function running(node: Glider, names: string[]): boolean {
  return node
    .getAnimations()
    .some(
      (animation) =>
        "transitionProperty" in animation &&
        typeof animation.transitionProperty === "string" &&
        names.includes(animation.transitionProperty),
    );
}

/**
 * How much of its side of a window `view` wide the column covers now, and
 * whether it is still on its way. The box is read first, which starts a
 * transition that was only asked for.
 */
export function readColumn(wrap: Glider, panel: Box, side: SideValue, view: number): ColumnEdge {
  const box = panel.getBoundingClientRect();
  return {
    cover: side === "left" ? box.right : view - box.left,
    moving: running(wrap, SLIDES) || running(panel, GROWS),
  };
}
