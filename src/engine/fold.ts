import type { PostureValue } from "../types";
import type { Rect, Sides } from "./mock";
import { lerp } from "./morph";

/**
 * A foldable folding open or shut in view, as a book does: the half of the
 * open body on the far side of the hinge from the folded one turns about the
 * hinge toward the viewer, the open screen on its inside and the folded body
 * on its outside, while the other half stays. Measured from Apple's own fold
 * of the iPhone Duo, which drives everything from how far open the hinge is,
 * 0 shut to 1 open: the turn, how dim the screens are and how blurred the
 * half that turns is. The fold is drawn in the open screen's css px, from the
 * open body's top left, and the whole of it moves from where the folded body
 * is drawn to where the open one is as it opens. Everything here is pure: the
 * frame draws it.
 */

/**
 * The hinge is a spring, stepped 60 times a second: Apple's of 0.75 s with a
 * bounce of 0.15, whose stiffness and damping follow from those, of mass 1.
 * Within `reach` of shut or open a magnet takes over, `pull` strong, and
 * snaps it there, so it never goes past.
 */
export const HINGE = {
  stiffness: (2 * Math.PI / 0.75) ** 2,
  damping: ((1 - 0.15) * 4 * Math.PI) / 0.75,
  step: 1 / 60,
  reach: 0.08,
  pull: { shut: 30, open: 20 },
} as const;

/** How long one step of the hinge is, in ms. */
export const HINGE_STEP = HINGE.step * 1000;

/** How far open the hinge is, 0 shut to 1 open, and how fast it moves, in openings a second. */
export interface Hinge {
  position: number;
  velocity: number;
}

/** How far open a posture leaves the hinge. */
export function openOf(posture: PostureValue): number {
  return posture === "open" ? 1 : 0;
}

/** The hinge a step on toward `target`, shut or open. */
export function hingeStep(hinge: Hinge, target: number): Hinge {
  const { position, velocity } = hinge;
  const dt = HINGE.step;
  const away = position - target;
  if (away === 0) return { position, velocity: 0 };
  const off = Math.abs(away);
  if (off > HINGE.reach) {
    const pushed = velocity + (-HINGE.stiffness * away - HINGE.damping * velocity) * dt;
    return { position: position + pushed * dt, velocity: pushed };
  }
  // The magnet keeps the speed, turned toward where it pulls, and pulls the harder the nearer.
  const toward = -Math.sign(away);
  const near = (HINGE.reach * HINGE.reach) / 10;
  const pull = target === 1 ? HINGE.pull.open : HINGE.pull.shut;
  const pulled = Math.abs(velocity) * toward + toward * pull * (near / (off * off)) * dt;
  const next = position + pulled * dt;
  const past = Math.sign(next - target) !== Math.sign(away);
  return past ? { position: target, velocity: 0 } : { position: next, velocity: pulled };
}

/** The hinge `steps` steps on toward `target`. */
export function hingeAfter(hinge: Hinge, target: number, steps: number): Hinge {
  let at = hinge;
  for (let step = 0; step < steps && !hingeStill(at, target); step++) at = hingeStep(at, target);
  return at;
}

/** Has the hinge got to `target` and stopped there? */
export function hingeStill(hinge: Hinge, target: number): boolean {
  return hinge.position === target && hinge.velocity === 0;
}

/** How far away the fold is seen from, in widths of the open screen. */
const DEPTH = 2.75;

/** How dark the half that turns goes toward its free edge as it stands, at most. */
export const FOLD_EDGE = 0.6;

/**
 * Over how much of the way the half that turns, a picture of the page, hands
 * the screen over to the page itself, laid out as it ends up.
 */
export const HAND_OVER = 0.08;

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
  /** The hinge's line: x held across, else y. */
  hinge: number;
  /** What the half that turns keeps of the open body, a px past the hinge. */
  clip: string;
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

/** A share of light or blur, to a thousandth. */
function fine(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
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
    hinge: across ? middle.x : middle.y,
    clip: across ? `inset(0 ${num(width - middle.x - 1)}px 0 0)` : `inset(${num(middle.y - 1)}px 0 0 0)`,
    origins: across
      ? { inner: `${num(middle.x)}px ${num(middle.y)}px`, outer: `0px ${num(shutMiddle.y)}px` }
      : {
          inner: `${num(middle.x)}px ${num(middle.y)}px`,
          outer: `${num(shutMiddle.x)}px ${num(shutBox.height)}px`,
        },
    folded: { x: at.x - shut.x * at.scale, y: at.y - shut.y * at.scale, scale: at.scale },
    unfolded: placeOf(open),
    depth: DEPTH * (across ? open.size.width : open.size.height),
  };
}

/** How a fold is drawn with its hinge `open` of the way open. */
export interface FoldFrame {
  /** Where the fold is in the letterbox, on its way from where it is drawn shut to where open. */
  place: Place;
  /** The turning half's inside, the open screen's, while it faces the viewer, as a transform. */
  inner: string | null;
  /** Its outside, the folded body, while that faces the viewer. */
  outer: string | null;
  /** How far the turning half stands off the screen, 0 flat to 1 square to it. */
  lift: number;
}

/** How a fold laid out as `layout` is drawn with its hinge `open` of the way open. */
export function foldFrame(layout: FoldLayout, open: number): FoldFrame {
  const angle = 180 * (1 - open);
  const { folded, unfolded } = layout;
  const turn = layout.across ? "rotateY" : "rotateX";
  const view = `perspective(${num(layout.depth)}px)`;
  const leaf = (degrees: number) => `${view} ${turn}(${num(degrees)}deg)`;
  return {
    place: {
      x: lerp(folded.x, unfolded.x, open),
      y: lerp(folded.y, unfolded.y, open),
      scale: lerp(folded.scale, unfolded.scale, open),
    },
    inner: angle < 90 ? leaf(angle) : null,
    outer: angle < 90 ? null : leaf(angle - 180),
    lift: num(Math.sin((angle * Math.PI) / 180)),
  };
}

/** How the screens are lit and blurred with the hinge `open` of the way open. */
export interface FoldLight {
  /** How dark the open screen is, both halves, 0 to 1. */
  dim: number;
  /** How dark the folded body's screen is. */
  coverDim: number;
  /** How far the open screen's half that turns darkens toward its free edge, of `FOLD_EDGE`. */
  edge: number;
  /** How far the folded body's screen does. */
  coverEdge: number;
  /** How blurred the open screen's half that turns is at its free edge, 0 to 1. */
  blur: number;
  /** How blurred the folded body's screen is at its free edge, 0 to 1. */
  coverBlur: number;
}

/**
 * The light of a fold, as the phone's: the open screen brightens from a
 * quarter as it opens, and the folded one as it shuts, and the half that
 * turns blurs and darkens toward its free edge the more it stands, so both
 * are sharp and bright as the hinge lands.
 */
export function foldLight(open: number): FoldLight {
  return {
    dim: fine(0.75 * (1 - open)),
    coverDim: fine(0.75 * open),
    edge: fine(1 - open),
    coverEdge: fine(open),
    blur: fine(clamp(1.2 * (1 - open))),
    coverBlur: fine(clamp(1.2 * open)),
  };
}

/**
 * How much each of the two ever blurrier pictures of the page shows over the
 * sharp one, for a blur 0 to 1: the first all of the way by 0.4, the second
 * from a quarter on, all of it by 0.65, as Apple's blur comes on quickly.
 */
export function blurShares(blur: number): [number, number] {
  return [fine(clamp(2.5 * blur)), fine(clamp(2.5 * blur - 0.6))];
}

/**
 * How far the page itself has taken over from the picture of it on the half
 * that turns, 0 to 1, with the frame laid out `drawn`: in the last
 * `HAND_OVER` of the way to that posture, where the half lies all but flat.
 */
export function handOver(open: number, drawn: PostureValue): number {
  return fine(clamp(drawn === "open" ? (open - (1 - HAND_OVER)) / HAND_OVER : (HAND_OVER - open) / HAND_OVER));
}
