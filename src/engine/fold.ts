import type { PostureValue } from "../types";
import type { Rect, Sides } from "./mock";
import { type Corners, fitCorners, lerp } from "./morph";

/**
 * A foldable folding open or shut in view, as a book does: the half of the
 * open body on the far side of the hinge from the folded one turns about the
 * hinge toward the viewer, the open screen on its inside and the folded body
 * on its outside, while the other half stays. Measured from Apple's own fold
 * of the iPhone Duo, which drives everything from how far open the hinge is,
 * 0 shut to 1 open: the turn, and the light and blur of the screens, which
 * are Apple's own "Wipe" shader's, written out below. The fold is drawn in the open screen's css px, from the
 * open body's top left, and the whole of it moves from where the folded body
 * is drawn to where the open one is as it opens. Everything here is pure: the
 * frame draws it.
 */

/**
 * The hinge is a spring, stepped 60 times a second: Apple's of 0.75 s with a
 * bounce of 0.15, whose stiffness and damping follow from those, of mass 1.
 * Within `reach` of shut or open a magnet takes over, `pull` strong, and
 * snaps it there, so it never goes past. Between them, where a hand leaves
 * it, it rests once it is within `rest` of there and all but still.
 */
export const HINGE = {
  stiffness: (2 * Math.PI / 0.75) ** 2,
  damping: ((1 - 0.15) * 4 * Math.PI) / 0.75,
  step: 1 / 60,
  reach: 0.08,
  pull: { shut: 30, open: 20 },
  rest: 1e-4,
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

/** The hinge a step on toward `target`: shut, open, or anywhere between, where a hand puts it. */
export function hingeStep(hinge: Hinge, target: number): Hinge {
  const { position, velocity } = hinge;
  const dt = HINGE.step;
  const away = position - target;
  if (away === 0) return { position, velocity: 0 };
  const off = Math.abs(away);
  const end = target === 0 || target === 1;
  if (!end || off > HINGE.reach) {
    const pushed = velocity + (-HINGE.stiffness * away - HINGE.damping * velocity) * dt;
    const next = position + pushed * dt;
    const rests = !end && Math.abs(next - target) < HINGE.rest && Math.abs(pushed) < HINGE.rest;
    return rests ? { position: target, velocity: 0 } : { position: next, velocity: pushed };
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

/**
 * Over how much of the way the half that turns, a picture of the page, hands
 * the screen over to the page itself, laid out as it ends up.
 */
export const HAND_OVER = 0.08;

/**
 * How long, in ms, the Duo's fold frames, rendered from its model, hand over
 * to the device's own bezel picture once the hinge is still at an end, both
 * lying flat in the same place: the whole device fades from the one to the
 * other, as their shades differ. As long, the still half's rendered case
 * fades in over the picture as the hinge leaves an end.
 */
export const SHOTS_FADE = 150;

/** A point, in css px. */
export interface Point {
  x: number;
  y: number;
}

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
  /** The same points, in each side's own css px. */
  pivots: { inner: Point; outer: Point };
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
  const pivots = {
    inner: middle,
    outer: across ? { x: 0, y: shutMiddle.y } : { x: shutMiddle.x, y: shutBox.height },
  };
  return {
    across,
    open: { width, height },
    shut,
    hinge: across ? middle.x : middle.y,
    clip: across ? `inset(0 ${num(width - middle.x - 1)}px 0 0)` : `inset(${num(middle.y - 1)}px 0 0 0)`,
    origins: {
      inner: `${num(pivots.inner.x)}px ${num(pivots.inner.y)}px`,
      outer: `${num(pivots.outer.x)}px ${num(pivots.outer.y)}px`,
    },
    pivots,
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
  /** How far the side that faces the viewer is turned, in degrees. */
  degrees: number;
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
    degrees: num(angle < 90 ? angle : angle - 180),
  };
}

/**
 * Where a point of the turning half, in its own css px, is seen with it
 * turned `degrees` about `pivot` as `foldFrame` turns it: about the hinge
 * running up and down, held `across`, else along, from `depth` px away.
 */
export function seenAt(point: Point, pivot: Point, degrees: number, across: boolean, depth: number): Point {
  const angle = (degrees * Math.PI) / 180;
  const x = point.x - pivot.x;
  const y = point.y - pivot.y;
  // How far it comes toward the viewer, and how much bigger that makes it.
  const near = across ? -x * Math.sin(angle) : y * Math.sin(angle);
  const grow = 1 / (1 - near / depth);
  return across
    ? { x: pivot.x + x * Math.cos(angle) * grow, y: pivot.y + y * grow }
    : { x: pivot.x + x * grow, y: pivot.y + y * Math.cos(angle) * grow };
}

/**
 * How far out from the hinge the turned half `rect` is seen turned `degrees`
 * about `pivot` as `seenAt` sees it, as a share of the way to its free edge.
 */
export function seenShare(rect: Rect, pivot: Point, degrees: number, across: boolean, depth: number): number {
  const [from, to] = across ? [rect.x, rect.x + rect.width] : [rect.y, rect.y + rect.height];
  const at = across ? pivot.x : pivot.y;
  const far = Math.abs(from - at) > Math.abs(to - at) ? from : to;
  if (far === at) return 1;
  const seen = seenAt(across ? { x: far, y: pivot.y } : { x: pivot.x, y: far }, pivot, degrees, across, depth);
  return clamp(((across ? seen.x : seen.y) - at) / (far - at));
}

/** A point as two numbers, x and y. */
export type Pair = readonly [x: number, y: number];

/** The corners of a four sided shape, from the top left round by the right. */
export type Quad = readonly [Pair, Pair, Pair, Pair];

/**
 * A piece of a frame: where it lies in the frame, left, top, width and
 * height, and its left and top in the frame's file, all in the file's px.
 */
export type Piece = readonly [x: number, y: number, width: number, height: number, fileX: number, fileY: number];

/**
 * A picture of the iPhone Duo's case rendered offline from Apple's model by
 * scripts/render-duo-fold, its screens see-through, as seen from the fold's
 * own distance: where it lies in the render, in the render's px, and the
 * pieces of it its file holds.
 */
export interface FoldStill {
  file: string;
  /** Where it lies in the render: left, top, right, bottom. */
  box: readonly [number, number, number, number];
  /** The pieces of it its file holds: all of it but its clear middle. */
  pieces: readonly Piece[];
}

/** One frame of the Duo's turning half. Everything but its pieces is in the render's px. */
export interface FoldShot extends FoldStill {
  /** How far the half has turned, 0 open to 180 shut. */
  deg: number;
  /** Where the open screen's turning half is seen, and the folded body's screen, each as it faces the viewer. */
  inner: Quad;
  cover: Quad;
  /** The half that stays at this angle, by its place among the fold's `stills`. */
  still: number;
}

/** The frames of a fold, from open to shut, where the open screen lies in them, and the half that stays. */
export interface FoldShots {
  /** The open screen: left, top, width, height. */
  open: readonly [number, number, number, number];
  /** The files' px per px of the render. */
  scale: number;
  frames: readonly FoldShot[];
  /**
   * The half that stays, from the same render as each frame, so both halves
   * meet at the hinge: one for each render of it that differs, which the
   * frames name.
   */
  stills: readonly FoldStill[];
}

/** How far open a frame shows the hinge, 0 shut to 1 open. */
export function shotOpen(shot: FoldShot): number {
  return 1 - shot.deg / 180;
}

/**
 * The frame shown with the hinge `open` of the way open, the nearest to it
 * of those `ready` has, by its place among the frames, and how far open every
 * layer is drawn under it: at that frame's own angle, so nothing moves
 * between two frames and all of it moves at one. Where none is ready, no
 * frame, and the hinge's own angle.
 */
export function shownAt(shots: FoldShots, ready: readonly unknown[], open: number): { at: number | null; open: number } {
  const at = nearestReady(ready, shotAt(shots, open));
  const shot = at === null ? null : shots.frames[at];
  return shot ? { at, open: shotOpen(shot) } : { at: null, open };
}

/** The frame nearest how far the hinge is open, by its place among the frames: the more open of two as near. */
export function shotAt(shots: FoldShots, open: number): number {
  const deg = 180 * (1 - open);
  let best = 0;
  shots.frames.forEach((shot, index) => {
    const far = Math.abs(shot.deg - deg);
    // Not by a rounding of the angle either, so two as near never flicker.
    if (far < Math.abs((shots.frames[best]?.deg ?? 0) - deg) - 1e-9) best = index;
  });
  return best;
}

/** The frame nearest `at` whose picture `ready` has, by its place among the frames, or null where none is ready. */
export function nearestReady(ready: readonly unknown[], at: number): number | null {
  for (let off = 0; off < ready.length; off++) {
    if (ready[at - off]) return at - off;
    if (ready[at + off]) return at + off;
  }
  return null;
}

/**
 * How many frames either side of the hinge's are decoded, and how many more
 * ahead of it as it goes, with the halves that stay they name: a degree each,
 * about 55 MB decoded at most.
 */
export const SHOTS_AROUND = 10;
export const SHOTS_AHEAD = 10;

/**
 * The frames decoded with the hinge at frame `at` of `count`, going `toward`
 * the shut end, 1, the open one, -1, or neither, 0: from `SHOTS_AROUND`
 * before it to as many past it and `SHOTS_AHEAD` more ahead, first and last.
 */
export function shotsWindow(count: number, at: number, toward: number): [number, number] {
  const ahead = SHOTS_AROUND + SHOTS_AHEAD;
  const from = at - (toward < 0 ? ahead : SHOTS_AROUND);
  const to = at + (toward > 0 ? ahead : SHOTS_AROUND);
  return [Math.max(0, from), Math.min(count - 1, to)];
}

/**
 * Which screen of the half that turns faces the viewer in a frame: the one
 * whose corners go round as they do lying flat. One does in each of the
 * Duo's frames, the inside up to a right angle and the outside past it.
 */
export function shotPane(shots: FoldShots, shot: FoldShot): Pane | null {
  const panes: Pane[] = ["inner", "cover"];
  // Its own corners, as seen from behind the other's are round the other way, also lying flat.
  return panes.find((pane) => Math.sign(quadArea(pane === "inner" ? shot.inner : shot.cover)) === faceOf(shots, pane)) ?? null;
}

/**
 * Where a frame sees a screen of the half that turns. Lying flat, open or
 * shut, it is the rect its corners bound, as the device draws its screen,
 * so the fold ends exactly where the device lies.
 */
export function shotQuad(shot: FoldShot, pane: Pane): Quad {
  const quad = pane === "inner" ? shot.inner : shot.cover;
  if (shot.deg % 180 !== 0) return quad;
  const { x, y, width, height } = boundsOf(quad);
  return [[x, y], [x + width, y], [x + width, y + height], [x, y + height]];
}

/** Which way a screen's corners go round as it faces the viewer: as they do lying flat, open or shut. */
function faceOf(shots: FoldShots, pane: Pane): number {
  const shot = pane === "inner" ? shots.frames[0] : shots.frames.at(-1);
  return shot ? Math.sign(quadArea(shotQuad(shot, pane))) : 0;
}

/** A quad's area, above 0 where its corners go round clockwise as the page is drawn, y down. */
export function quadArea(quad: Quad): number {
  return quad.reduce((sum, [x, y], index) => {
    const [nx, ny] = quad[(index + 1) % 4] ?? [x, y];
    return sum + x * ny - nx * y;
  }, 0) / 2;
}

/** A Quad's bounds, as a rect. */
function boundsOf(quad: Quad): Rect {
  const xs = quad.map(([x]) => x);
  const ys = quad.map(([, y]) => y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

/**
 * How a rendered frame lies on the fold: its x scaled by `wide` and its y by
 * `tall`, then moved, and turned a quarter held upright.
 */
interface Fit {
  wide: number;
  tall: number;
  x: number;
  y: number;
}

/**
 * Lay the render's rect `from` on the layout's `to`, exactly, each way
 * scaled to it: the render's screens are a few tenths of a px off the
 * device's along the hinge. Held upright the render, made held across, turns
 * a quarter anticlockwise, as the folded body does: its x goes up the layout.
 */
function fitOf(from: Rect, to: Rect, across: boolean): Fit {
  const wide = across ? to.width / from.width : to.height / from.width;
  const tall = across ? to.height / from.height : to.width / from.height;
  const middle = { x: (from.x + from.width / 2) * wide, y: (from.y + from.height / 2) * tall };
  const turned = across ? middle : { x: middle.y, y: -middle.x };
  return { wide, tall, x: to.x + to.width / 2 - turned.x, y: to.y + to.height / 2 - turned.y };
}

/**
 * Where the frames are drawn on a fold laid out as `layout`, as a css
 * transform from the render's px to the open body's css px, with the hinge
 * `open` of the way open. The open screen lies on `inside`, the open
 * screen's place in the layout, open, and the last frame's folded screen on
 * `outside`, the folded screen's, shut, so each end lies exactly where the
 * device is drawn; between, the one goes over to the other.
 */
export function shotsTransform(shots: FoldShots, layout: FoldLayout, inside: Rect, outside: Rect, open: number): string {
  const fit = shotsFit(shots, layout, inside, outside, open);
  const exact = (value: number) => Math.round(value * 1e6) / 1e6;
  const wide = exact(fit.wide);
  const tall = exact(fit.tall);
  const e = num(fit.x);
  const f = num(fit.y);
  return layout.across ? `matrix(${wide}, 0, 0, ${tall}, ${e}, ${f})` : `matrix(0, ${-wide}, ${tall}, 0, ${e}, ${f})`;
}

/** How the frames lie on the fold with the hinge `open` of the way open, as `shotsTransform` lays them. */
function shotsFit(shots: FoldShots, layout: FoldLayout, inside: Rect, outside: Rect, open: number): Fit {
  const [x, y, width, height] = shots.open;
  const last = shots.frames.at(-1);
  const opened = fitOf({ x, y, width, height }, inside, layout.across);
  const shut = last ? fitOf(boundsOf(last.cover), outside, layout.across) : opened;
  return {
    wide: lerp(shut.wide, opened.wide, open),
    tall: lerp(shut.tall, opened.tall, open),
    x: lerp(shut.x, opened.x, open),
    y: lerp(shut.y, opened.y, open),
  };
}

/** A point of the layout scaled by `wide` and `tall` and then moved by `x` and `y`. */
export interface Drift {
  wide: number;
  tall: number;
  x: number;
  y: number;
}

/**
 * How the device drawn in `posture` moves on the layout with the hinge `open`
 * of the way open, so it stays on the frames: the frames lie on it exactly at
 * that posture's end, and between the ends they shrink a little toward the
 * folded screen's size in the render, which is about 1% smaller than the
 * device's. None at that end.
 */
export function shotsDrift(
  shots: FoldShots,
  layout: FoldLayout,
  inside: Rect,
  outside: Rect,
  open: number,
  posture: PostureValue,
): Drift {
  const now = shotsFit(shots, layout, inside, outside, open);
  const end = shotsFit(shots, layout, inside, outside, openOf(posture));
  // Held upright the render's x goes up the layout, so its height scales the layout's x.
  const wide = layout.across ? now.wide / end.wide : now.tall / end.tall;
  const tall = layout.across ? now.tall / end.tall : now.wide / end.wide;
  return { wide, tall, x: now.x - wide * end.x, y: now.y - tall * end.y };
}

/**
 * A frame's quad of a screen, from the corner that is its own top left as
 * the layout shows it: held upright, its top left was the render's top right.
 */
export function quadFacing(quad: Quad, across: boolean): Quad {
  const [a, b, c, d] = quad;
  return across ? quad : [b, c, d, a];
}

/** A plane's projective map, row by row: x, y and w from x, y and 1. */
type Mat3 = readonly [number, number, number, number, number, number, number, number, number];

/** The map that lays the square of side 1 onto `quad`, corner on corner. Null where the quad has no room, seen edge on. */
function squareTo(quad: Quad): Mat3 | null {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = quad;
  const area = (x0 * y1 - x1 * y0 + x1 * y2 - x2 * y1 + x2 * y3 - x3 * y2 + x3 * y0 - x0 * y3) / 2;
  if (Math.abs(area) < 1) return null;
  const dx1 = x1 - x2;
  const dx2 = x3 - x2;
  const dy1 = y1 - y2;
  const dy2 = y3 - y2;
  const sx = x0 - x1 + x2 - x3;
  const sy = y0 - y1 + y2 - y3;
  const den = dx1 * dy2 - dx2 * dy1;
  const g = (sx * dy2 - dx2 * sy) / den;
  const h = (dx1 * sy - sx * dy1) / den;
  return [x1 - x0 + g * x1, x3 - x0 + h * x3, x0, y1 - y0 + g * y1, y3 - y0 + h * y3, y0, g, h, 1];
}

/**
 * Where a point of the rect `from` is seen with the rect laid onto the quad
 * `to`, corner on corner, each straight line staying straight, as a flat
 * screen is seen in perspective. Null where the quad has no room, seen edge on.
 */
export function quadMap(from: Rect, to: Quad): ((point: Point) => Point) | null {
  const square = squareTo(to);
  if (!square || from.width <= 0 || from.height <= 0) return null;
  const [a, b, c, d, e, f, g, h, i] = square;
  return ({ x, y }) => {
    const u = (x - from.x) / from.width;
    const v = (y - from.y) / from.height;
    const w = g * u + h * v + i;
    return { x: (a * u + b * v + c) / w, y: (d * u + e * v + f) / w };
  };
}

/**
 * Where the page on a screen of the half that turns lies in a frame, in the
 * render's px, as Apple projects it and jadon7/iphone-duo after it: flat, as
 * seen from the front, so it stays still as the half turns and the turned
 * screen, `quad`, is a window onto it. The open screen's lies where its half
 * past the hinge lies open. The folded screen's is as big as that screen
 * lies shut, slid along so its hinge side stays on the turned screen's.
 */
export function shotPicture(shots: FoldShots, pane: Pane, quad: Quad): Rect {
  if (pane === "inner") {
    const [x, y, width, height] = shots.open;
    return { x, y, width: width / 2, height };
  }
  const last = shots.frames.at(-1);
  const shut = boundsOf(last ? last.cover : quad);
  return { ...shut, x: quad[0][0] };
}

/**
 * A frame's turned screen, `quad`, as the window onto its `picture`. The open
 * screen's hinge side is put on the picture's, as the frames have it a px or
 * two off the hinge, which would leave a dark line down it.
 */
export function shotWindow(quad: Quad, pane: Pane, picture: Rect): Quad {
  if (pane !== "inner") return quad;
  const hinge = picture.x + picture.width;
  const [a, [, top], [, bottom], d] = quad;
  return [a, [hinge, top], [hinge, bottom], d];
}

/**
 * How far the window, `quad`, reaches past its `picture` at the turned
 * screen's free edge, above and below, in the render's px: the dark there,
 * which grows as the free edge comes nearer, and is none lying flat.
 */
export function darkAt(quad: Quad, pane: Pane, picture: Rect): { top: number; bottom: number } {
  const [top, bottom] = pane === "inner" ? [quad[0], quad[3]] : [quad[1], quad[2]];
  return {
    top: Math.max(0, picture.y - top[1]),
    bottom: Math.max(0, bottom[1] - (picture.y + picture.height)),
  };
}

/**
 * The css `matrix` that lays a screen `size` css px, from its top left at
 * 0 0, flat onto `picture`, turned a quarter held upright as `quadFacing`
 * turns a frame's screen: no perspective, so the page never turns.
 */
export function flatMatrix(size: { width: number; height: number }, picture: Rect, across: boolean): string {
  const exact = (value: number) => Math.round(value * 1e6) / 1e6;
  const { x, y, width, height } = picture;
  if (across) return `matrix(${exact(width / size.width)}, 0, 0, ${exact(height / size.height)}, ${exact(x)}, ${exact(y)})`;
  return `matrix(0, ${exact(height / size.width)}, ${exact(-width / size.height)}, 0, ${exact(x + width)}, ${exact(y)})`;
}

/** How far along its tangents a cubic's handles sit to draw a quarter circle, in radii. */
const KAPPA = 0.5523;

/**
 * The outline of a rect with its corners rounded by `radii`, from the top left
 * round by the right, as css path data, each point put where `seen` puts it:
 * its sides as lines, and each corner as a quarter circle's cubic through its
 * handles, so it stays as round as a border radius in perspective.
 */
export function roundedPath(rect: Rect, radii: Corners, seen: (point: Point) => Point): string {
  const { x, y, width, height } = rect;
  const [a, b, c, d] = fitCorners(rect, radii);
  const at = (px: number, py: number) => {
    const point = seen({ x: px, y: py });
    return `${num(point.x)} ${num(point.y)}`;
  };
  // A corner from where it leaves one side, by its two handles, to where it meets the next.
  const corner = (radius: number, from: Point, to: Point, tip: Point) => {
    if (radius <= 0) return `L${at(tip.x, tip.y)}`;
    const handle = (end: Point) => at(end.x + (tip.x - end.x) * KAPPA, end.y + (tip.y - end.y) * KAPPA);
    return `L${at(from.x, from.y)}C${handle(from)} ${handle(to)} ${at(to.x, to.y)}`;
  };
  const right = x + width;
  const bottom = y + height;
  return [
    `M${at(x + a, y)}`,
    corner(b, { x: right - b, y }, { x: right, y: y + b }, { x: right, y }),
    corner(c, { x: right, y: bottom - c }, { x: right - c, y: bottom }, { x: right, y: bottom }),
    corner(d, { x: x + d, y: bottom }, { x, y: bottom - d }, { x, y: bottom }),
    corner(a, { x, y: y + a }, { x: x + a, y }, { x, y }),
    "Z",
  ].join("");
}

/**
 * Apple's "Wipe" shader lights each screen of the fold, as the hinge sets it.
 * Across the screen, from 0 to 1 the way its texture runs, light falls off
 * with the distance from the wipe's line, `at`: from the open screen's far
 * side, so the half that stays is lit all over and the half that turns
 * darkens toward its free edge, and from the folded screen's hinge, so it
 * darkens toward its free edge too. Before the screen is drawn its picture is
 * blurred twice, each time the more the further it is from the line past
 * `blur`, out to a mip level 8 times `blurArea`, and darkened where it is
 * blurred most. The picture itself lies flat behind the glass, so a half that
 * turns is a window onto it: what it shows does not turn with it, and past
 * the picture's edge, where the half comes nearer than the screen it stood
 * in, it is dark, a wedge at each end that grows toward the free edge.
 */
export const WIPE = {
  /** The open screen: Apple's inner texture, 2853 px across, the wipe's line on the side that stays. */
  inner: { at: 1, shade: [0.5, 1], blur: [0.45, 1], texture: 2853 },
  /** The folded body's screen: its texture as wide as its opening in Apple's picture of it. */
  cover: { at: 0, shade: [0, 1], blur: [0, 0.9], texture: 1398 },
} as const;

/** Which of the turning half's screens: the open screen's half, or the folded body's whole. */
export type Pane = keyof typeof WIPE;

/** Apple shows the middle of each texture, 1.12 times smaller than the whole. */
export const FRAMING = 1.12;

/** The blur's most, as a mip level, at a `blurArea` of 1. */
const MAX_BLUR = 8;

/** The screen's light is worked out unlit by the display: shown, it goes through this gamma. */
const GAMMA = 2.2;

function smoothstep(from: number, to: number, value: number): number {
  const t = clamp((value - from) / (to - from));
  return t * t * (3 - 2 * t);
}

/** How strong the wipe is on a screen, 0 to 1, with the hinge `open` of the way open, as Apple's uniforms record it. */
export function wipeAmount(pane: Pane, open: number): number {
  return pane === "inner" ? clamp(1.2 * (1 - open)) : clamp(1 - 2 * Math.abs(open - 0.5)) / 2;
}

/**
 * How bright the open screen is set, 0 to 1: 0.15 shut, a quarter a third of
 * the way open, then evenly up to all of it, as recorded. The folded screen's
 * stays 1.
 */
export function brightness(pane: Pane, open: number): number {
  if (pane === "cover") return 1;
  return open < 1 / 3 ? 0.15 + 0.3 * open : 0.25 + 1.125 * (open - 1 / 3);
}

/** Where a point `t` of the way from the hinge to the free edge of the half that turns is, across its texture. */
export function uvOf(pane: Pane, t: number): number {
  return pane === "inner" ? 0.5 - t / 2 : t;
}

/** How much light the wipe leaves at `uv`, 0 to 1. */
export function wipeLight(pane: Pane, uv: number, amount: number): number {
  const { at, shade } = WIPE[pane];
  return 1 - clamp(smoothstep(shade[0], shade[1], Math.abs(uv - at)) * amount * 1.5);
}

/** Apple's `blurArea` at `uv` before it is held to its range, which runs evenly along the half. */
export function rawArea(pane: Pane, uv: number, amount: number): number {
  const { at, blur } = WIPE[pane];
  return (((Math.abs(uv - at) - blur[0]) / (blur[1] - blur[0])) * amount * 2.5) / 0.75;
}

/** How blurred the picture is at `uv`: Apple's `blurArea`, 0 to 4/3, a mip level 8 times it. */
export function blurArea(pane: Pane, uv: number, amount: number): number {
  return Math.min(4 / 3, Math.max(0, rawArea(pane, uv, amount)));
}

/** How much light each of the two blurs leaves where it blurs `area`, both of them together. */
export function blurLight(area: number): number {
  return smoothstep(1.3, 0.9, area) ** 2;
}

/**
 * The extra shadow of the open screen's far side, which deepens as the wipe
 * does, over the outer half of the half that turns. The folded screen has none.
 */
export function edgeLight(pane: Pane, uv: number, amount: number): number {
  if (pane === "cover") return 1;
  return lerp(1, smoothstep(0.05, 0.5, uv), smoothstep(0, 0.55, amount));
}

/**
 * The dark at the free edge of the half that turns, on top of the wipe,
 * measured from Apple's frames of the Duo's fold against those lying flat:
 * Apple's camera swings round as the hinge turns, so its turned screen shows
 * the picture's dark far side out to its own free edge, which a fold seen
 * from the front does not. It is deepest with the half square to the
 * screen, `most` of the light there, and falls off as the cube of how far
 * the hinge is from that, so it is none open and shut. Across the turned
 * screen, half of it comes on evenly from `from` of the way out, the other
 * half over its last `band`. Neither the hinge's side nor the half that
 * stays darkens.
 */
export const FREE_DARK = { most: 0.7, power: 3, from: 0.25, band: 0.05, broad: 0.5 } as const;

/** How deep the free edge's dark is, 0 to `FREE_DARK.most`, with the hinge `open` of the way open. */
export function freeDepth(open: number): number {
  return FREE_DARK.most * clamp(1 - 2 * Math.abs(open - 0.5)) ** FREE_DARK.power;
}

/** How much of the free edge's dark there is `t` of the way across the turned screen from the hinge to its free edge, 0 to 1. */
export function freeBand(t: number): number {
  const { from, band, broad } = FREE_DARK;
  return broad * smoothstep(from, 1, t) + (1 - broad) * smoothstep(1 - band, 1, t);
}

/** The share of dark at the free edge, `t` of the way across the turned screen, with the hinge `open` of the way open. */
export function freeDark(t: number, open: number): number {
  return freeDepth(open) * freeBand(t);
}

/**
 * The free edge's dark as gradient stops over the picture lying flat, from
 * the hinge to its free edge: where each is, as a share of the way, and how
 * dark. The turned screen is seen out to `free` of the way, so its free edge,
 * and its dark, is there.
 */
export function freeShades(open: number, free: number): [at: number, dark: number][] {
  const depth = freeDepth(open);
  if (depth <= 0 || free <= 0) return [];
  const { from, band } = FREE_DARK;
  const steps = [0, from, (from + 1) / 2, 1 - 2 * band, 1 - band, 1 - band / 2, 1];
  return steps.map((t) => [fine(t * free), fine(freeDark(t, open))]);
}

/**
 * How much of the turned screen Apple's camera sees, from the hinge out, as
 * a share of the way to its free edge, by how far open the hinge is: measured
 * from Apple's frames of the Duo's fold. Its camera swings round as the hinge
 * turns, so it sees more of the open screen's half than a fold seen from the
 * front does, and neither screen standing square to it.
 */
export const APPLE_SEEN = {
  inner: [[0.5, 0], [0.6, 0.58], [0.7, 0.88], [0.8, 0.97], [1, 1]],
  cover: [[0, 1], [0.1, 0.96], [0.2, 0.87], [0.3, 0.67], [0.4, 0.3], [0.5, 0]],
} as const;

/** How much of the turned screen of `pane` Apple's camera sees with the hinge `open` of the way open, 0 to 1. */
export function appleSeen(pane: Pane, open: number): number {
  const points = APPLE_SEEN[pane];
  const first = points[0];
  if (open <= first[0]) return first[1];
  for (let index = 1; index < points.length; index++) {
    const [x0, y0] = points[index - 1] ?? first;
    const [x1, y1] = points[index] ?? first;
    if (open <= x1) return lerp(y0, y1, (open - x0) / (x1 - x0));
  }
  return points[points.length - 1]?.[1] ?? 1;
}

/**
 * Where a point `t` of the way across the picture from the hinge lies on the
 * picture Apple shows, the turned screen seen out to `free` of it here and
 * `seen` there: as far across what each shows, so the blur Apple shows at its
 * turned screen's free edge is at this one's.
 */
export function seenAlong(t: number, free: number, seen: number): number {
  return (free > 0 ? Math.min(1, t / free) : 1) * seen;
}

/**
 * The blur all over the turned screen, from the hinge to the free edge alike,
 * measured from the same frames against those lying flat: near a right angle
 * Apple's turned screen is blurred at its hinge too, so nothing on it reads.
 * As wide as `most` of the screen across the hinge standing square to it, it
 * falls off as how far the hinge is from there to the `power`: the folded
 * screen's slowly, and the open screen's fast, whose hinge side still reads
 * a fifth of the way from it.
 */
export const NEAR_BLUR = {
  inner: { most: 0.038, power: 8 },
  cover: { most: 0.038, power: 2.5 },
} as const;

/** How wide the blur all over the turned screen of `pane` is, as a share of the screen across the hinge, with the hinge `open` of the way open. */
export function nearBlur(pane: Pane, open: number): number {
  const { most, power } = NEAR_BLUR[pane];
  return most * clamp(1 - 2 * Math.abs(open - 0.5)) ** power;
}

/** How wide a blur of `area` is, as a share of the screen across the hinge: its mip level's texels, twice over. */
export function blurWidth(pane: Pane, area: number): number {
  return (Math.SQRT2 * 2 ** (MAX_BLUR * area) * FRAMING) / WIPE[pane].texture;
}

/** How light a shown screen is, 0 to 1, for a light of `light` as Apple's shader works it out. */
export function shown(light: number): number {
  return clamp(light) ** (1 / GAMMA);
}

/**
 * How much of the screen, at each end along the hinge, the picture darkens
 * toward its edge over as the half stands, so the dark past it comes on
 * softly: as much as Apple's texture goes past what the screen shows of it.
 */
export const RIM = (FRAMING - 1) / 2;

/** How dim the screen the frame draws is, 0 to 1, with the hinge `open` of the way open: the half that stays, or the folded screen. */
export function screenDim(pane: Pane, open: number): number {
  return fine(1 - shown(smoothstep(0.1, 1, brightness(pane, open))));
}

/** How many points along the half that turns its shades are worked out at, hinge to free edge. */
const STEPS = 8;

/**
 * A blurrier picture fading in, `from` to `to` of the way from the hinge to
 * the free edge, from `least` of it to `most`.
 */
export interface BlurFade {
  from: number;
  to: number;
  least: number;
  most: number;
}

/** How the half that turns is lit and blurred. */
export interface PaneLook {
  /** How dark the half is as it turns, at `STEPS + 1` points from the hinge to the free edge: the screen's light and the wipe. */
  turned: number[];
  /** How dark the picture is at the same points of it as it lies flat: its blurs' dark and the far side's shadow. */
  flat: number[];
  /** Where each blurrier picture fades in, or null where it does not show. */
  blurs: (BlurFade | null)[];
}

/**
 * The blurrier pictures of the page, by how wide their blur is in css px.
 * Each fades in over the one before as the blur goes from that one's to its
 * own, the sharp one's counted as `BLURS[0]`.
 */
export const BLURS = [2, 8, 32, 128] as const;

/**
 * How the half that turns, of `pane`, looks with the hinge `open` of the way
 * open, its screen `extent` css px across the hinge, and seen out to `free`
 * of the way from the hinge to the picture's free edge.
 */
export function paneLook(pane: Pane, open: number, extent: number, free = 1): PaneLook {
  const amount = wipeAmount(pane, open);
  const light = smoothstep(0.1, 1, brightness(pane, open));
  const points = Array.from({ length: STEPS + 1 }, (_, step) => uvOf(pane, step / STEPS));
  const turned = points.map((uv) => fine(1 - shown(light * wipeLight(pane, uv, amount))));
  const flat = points.map((uv) =>
    fine(1 - shown(blurLight(blurArea(pane, uv, amount)) * edgeLight(pane, uv, amount))),
  );
  // The blur's width doubles for each eighth of the area, and the area grows evenly along what Apple shows of the half.
  const start = rawArea(pane, uvOf(pane, 0), amount);
  const slope = (rawArea(pane, uvOf(pane, 1), amount) - start) * appleSeen(pane, open);
  const top = Math.min(start + slope, 4 / 3);
  const areaFor = (width: number) =>
    Math.log2((width * WIPE[pane].texture) / (extent * Math.SQRT2 * FRAMING)) / MAX_BLUR;
  const near = nearBlur(pane, open) * extent;
  const blurs = BLURS.slice(1).map((width, index) => {
    const low = areaFor(BLURS[index] ?? 0);
    const high = areaFor(width);
    // How much of it the blur all over shows, from the hinge on.
    const least = near > 0 ? fine(clamp((areaFor(near) - low) / (high - low))) : 0;
    if (slope <= 0 || top <= low) return least > 0 ? { from: 0, to: 0, least, most: least } : null;
    // From where the blur is the last picture's to where it is this one's, or as far as it gets.
    const reach = Math.min(high, top);
    const most = fine((reach - low) / (high - low));
    if (least >= most) return { from: 0, to: 0, least, most: least };
    const along = (area: number) => (free > 0 ? ((area - start) / slope) * free : 0);
    // It fades in from where the wipe's blur passes the blur all over.
    return { from: fine(along(lerp(low, reach, least / most))), to: fine(along(reach)), least, most };
  });
  return { turned, flat, blurs };
}

/**
 * How far the page itself has taken over from the picture of it on the half
 * that turns, 0 to 1, with the frame laid out `drawn`: in the last `span`
 * of the way to that posture, where the half lies all but flat.
 */
export function handOver(open: number, drawn: PostureValue, span = HAND_OVER): number {
  return fine(clamp(drawn === "open" ? (open - (1 - span)) / span : (span - open) / span));
}
