import type { PostureValue } from "../types";
import type { Rect, Sides } from "./mock";
import { type Curve, ease, FADE_CURVE, lerp, MORPH_TIME } from "./morph";

/**
 * A foldable folding open or shut in view, as a book does: the half of the
 * open body on the far side of the hinge from the folded one turns about the
 * hinge toward the viewer, the open screen on its inside and the folded body
 * on its outside, while the other half stays. Measured from Apple's own fold
 * of the iPhone Duo. The fold is drawn in the open screen's css px, from the
 * open body's top left, and the whole of it moves from where the folded body
 * is drawn to where the open one is as it folds. Everything here is pure: the
 * frame draws it.
 */

/**
 * The hinge turns out quickly and settles long, fitted to Apple's fold over
 * its measured 470 ms.
 */
export const FOLD_CURVE: Curve = [0.3, 0.15, 0.2, 1];

/** How far away the fold is seen from, in widths of the half that turns. */
const DEPTH = 4.5;

/** How much darker each side of the turning half goes as it stands up off the screen. */
export const FOLD_SHADE = { inner: 0.5, outer: 0.35 } as const;

/** Over how many degrees of a fold from shut the half that stays comes out from under the folded body. */
const REST_IN = 30;

/** One posture's side of a fold. */
export interface FoldSide {
  /** The room the body takes around the screen and its size, or null where none is drawn. */
  body: { width: number; height: number; inset: Sides } | null;
  /** The screen's css size. */
  size: { width: number; height: number };
  /** Where the screen is drawn in the letterbox. */
  screen: Rect;
}

/** Where the fold is drawn in the letterbox: its top left, and its scale. */
export interface Place {
  x: number;
  y: number;
  scale: number;
}

/** A fold laid out, in the open screen's css px from the open body's top left. */
export interface FoldLayout {
  /** The hinge runs up and down the open screen, held across, else along it. */
  across: boolean;
  /** The open body's size. */
  open: { width: number; height: number };
  /** Where the folded body lies on the open one once shut. */
  shut: Rect;
  /** What each part of the open body keeps: the half that stays, and the half that turns, a px past the hinge. */
  clips: { rest: string; inner: string };
  /** The point each side of the turning half turns about: the hinge, in the middle of the screens. */
  origins: { inner: string; outer: string };
  /** The fold shut, and open. */
  folded: Place;
  unfolded: Place;
  /** The perspective, in px. */
  depth: number;
}

function num(value: number): number {
  return Math.round(value * 100) / 100;
}

/** The body of a side, or the bare screen where none is drawn. */
function boxOf(side: FoldSide): { width: number; height: number; inset: Sides } {
  return side.body ?? { ...side.size, inset: { top: 0, right: 0, bottom: 0, left: 0 } };
}

/** Where a side's body is drawn: its top left in the letterbox, at the scale its screen is. */
function placeOf(side: FoldSide): Place {
  const { inset } = boxOf(side);
  const scale = side.size.width > 0 ? side.screen.width / side.size.width : 1;
  return { x: side.screen.x - inset.left * scale, y: side.screen.y - inset.top * scale, scale };
}

/**
 * Lay a fold out between a foldable's folded and open sides. The hinge runs
 * through the middle of the open screen. Folded upright, the hinge is on the
 * body's left, so held across open, the folded body lies right of it, and
 * held upright open, as it is turned a quarter anticlockwise, above it. The
 * screens' middles line up along the hinge.
 */
export function foldLayout(closed: FoldSide, open: FoldSide, across: boolean): FoldLayout {
  const shutBox = boxOf(closed);
  const openBox = boxOf(open);
  const middle = {
    x: openBox.inset.left + open.size.width / 2,
    y: openBox.inset.top + open.size.height / 2,
  };
  const shutMiddle = {
    x: shutBox.inset.left + closed.size.width / 2,
    y: shutBox.inset.top + closed.size.height / 2,
  };
  const { width, height } = openBox;
  const shut = across
    ? { x: middle.x, y: middle.y - shutMiddle.y, width: shutBox.width, height: shutBox.height }
    : {
        x: middle.x - shutMiddle.x,
        y: middle.y - shutBox.height,
        width: shutBox.width,
        height: shutBox.height,
      };
  const at = placeOf(closed);
  return {
    across,
    open: { width, height },
    shut,
    clips: across
      ? { rest: `inset(0 0 0 ${num(middle.x)}px)`, inner: `inset(0 ${num(width - middle.x - 1)}px 0 0)` }
      : {
          rest: `inset(0 0 ${num(height - middle.y)}px 0)`,
          inner: `inset(${num(middle.y - 1)}px 0 0 0)`,
        },
    origins: across
      ? { inner: `${num(middle.x)}px ${num(middle.y)}px`, outer: `0px ${num(shutMiddle.y)}px` }
      : {
          inner: `${num(middle.x)}px ${num(middle.y)}px`,
          outer: `${num(shutMiddle.x)}px ${num(shutBox.height)}px`,
        },
    folded: { x: at.x - shut.x * at.scale, y: at.y - shut.y * at.scale, scale: at.scale },
    unfolded: placeOf(open),
    depth: DEPTH * (across ? middle.x : height - middle.y),
  };
}

/** The hinge's angle in a posture: 0 open flat, 180 folded shut. */
export function angleOf(posture: PostureValue): number {
  return posture === "open" ? 0 : 180;
}

/** How long a fold from one angle to another takes, a half turn the whole time. */
export function foldTime(from: number, to: number): number {
  return (MORPH_TIME.fold * Math.abs(to - from)) / 180;
}

/** The hinge's angle `elapsed` ms into a fold from one angle to another. */
export function foldAt(from: number, to: number, elapsed: number): number {
  const time = foldTime(from, to);
  return elapsed < time ? lerp(from, to, ease(FOLD_CURVE, elapsed / time)) : to;
}

/**
 * How far the cover is over the page `elapsed` ms into covering it from
 * `from` before a fold, 0 to 1. A cover part of the way over takes as much
 * less time.
 */
export function foldCoverAt(from: number, elapsed: number): number {
  const time = MORPH_TIME.foldCover * (1 - from);
  return time > 0 ? lerp(from, 1, ease(FADE_CURVE, elapsed / time)) : 1;
}

/** One side of the turning half as it stands: its transform, and how bright it is drawn. */
export interface Leaf {
  transform: string;
  shade: number;
}

/** How a fold is drawn at a hinge angle. */
export interface FoldFrame {
  /** The fold's transform in the letterbox, on its way from where it is drawn shut to where open. */
  place: string;
  /** How much of the half that stays shows. */
  rest: number;
  /** The turning half's inside, the open screen's, while it faces the viewer. */
  inner: Leaf | null;
  /** Its outside, the folded body, while that faces the viewer. */
  outer: Leaf | null;
}

/** How a fold laid out as `layout` is drawn at `angle`. */
export function foldFrame(layout: FoldLayout, angle: number): FoldFrame {
  const share = 1 - angle / 180;
  const { folded, unfolded } = layout;
  const x = lerp(folded.x, unfolded.x, share);
  const y = lerp(folded.y, unfolded.y, share);
  const scale = lerp(folded.scale, unfolded.scale, share);
  const turn = layout.across ? "rotateY" : "rotateX";
  const view = `perspective(${num(layout.depth)}px)`;
  const lift = Math.sin((angle * Math.PI) / 180);
  const leaf = (degrees: number, shade: number): Leaf => ({
    transform: `${view} ${turn}(${num(degrees)}deg)`,
    shade: num(1 - shade * lift),
  });
  return {
    place: `translate(${num(x)}px, ${num(y)}px) scale(${scale})`,
    rest: Math.min(1, Math.max(0, (180 - angle) / REST_IN)),
    inner: angle < 90 ? leaf(angle, FOLD_SHADE.inner) : null,
    outer: angle < 90 ? null : leaf(angle - 180, FOLD_SHADE.outer),
  };
}
