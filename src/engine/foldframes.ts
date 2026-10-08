import { type FoldPictures, foldShots } from "./bezels";
import {
  type FoldLayout,
  type FoldShot,
  type FoldShots,
  type FoldStill,
  flatMatrix,
  type Pane,
  type Point,
  type Quad,
  quadFacing,
  quadMap,
  roundedPath,
  shotOpen,
  shotPane,
  shotPicture,
  shotQuad,
  shotsTransform,
  shotWindow,
  shownAt,
} from "./fold";
import { freeOf, reachOf, screenLook, wedgeOf } from "./foldgl";
import {
  creaseOf,
  type Face,
  div,
  type Glued,
  gluedOf,
  light,
  type Pictures,
  placeAt,
  screenOf,
  turningOf,
} from "./foldpage";
import type { Rect } from "./mock";
import type { Corners } from "./morph";

/**
 * The half of the Duo that turns as its fold's frames, rendered from Apple's
 * model: a canvas the frame nearest the hinge's angle is drawn on, the half
 * that stays from the same render under it, and the screens glued on, each a
 * window onto the page lying flat. All of it is drawn at the angle of the
 * frame shown, so it changes as one picture, a frame at a time.
 */

/**
 * A canvas pictures are drawn on, at the files' scale, over where all of
 * them lie in the render, from `corner` in it, and the one drawn on it, if any.
 */
interface Plane<Drawn extends FoldStill> {
  canvas: HTMLCanvasElement;
  pen: CanvasRenderingContext2D;
  corner: Point;
  shot: Drawn | null;
}

/**
 * The half that turns as the Duo's fold frames: the render's px laid on the
 * fold by `model`, the canvas in it the frame nearest the hinge's angle is
 * drawn on, the case of the half that stays from the same render under it,
 * and the two screens glued on. The open screen and the folded one, where the
 * layout lays them. `lit` is the frame the screens were last laid and lit
 * for, and what drew them then, so they are not again till either changes.
 */
export interface Shots {
  shots: FoldShots;
  model: HTMLElement;
  plane: Plane<FoldShot>;
  still: Plane<FoldStill>;
  inner: Glued;
  outer: Glued;
  inside: Rect;
  outside: Rect;
  lit: { shot: FoldShot; by: unknown[] } | null;
}

/**
 * How far the dark under the window reaches past the turned screen, in its
 * css px, under the case all round, but for the open screen's hinge side,
 * where the page goes on past it: so where the window's edge and the case's
 * hole each fade out over a px, the mat never shows between them.
 */
export const BLEED = 2;

/**
 * As the screen turns away its sides along the hinge are seen ever thinner:
 * there the dark reaches as far as it takes to be seen at least this many px
 * of the render past them, two thirds of a css px, up to 8 times `BLEED`.
 */
const SEEN_BLEED = 2;

/** Where all of some pictures lie in the render: left, top, right, bottom. */
function boxAround(drawn: readonly FoldStill[]): [number, number, number, number] {
  return drawn.reduce<[number, number, number, number]>(
    (all, { box }) => [Math.min(all[0], box[0]), Math.min(all[1], box[1]), Math.max(all[2], box[2]), Math.max(all[3], box[3])],
    [Infinity, Infinity, -Infinity, -Infinity],
  );
}

/**
 * The half that turns as the fold's frames, `found`, laid on the fold: a
 * canvas over where every frame lies in the render, under it the screens
 * with the page glued on, the bend's half on the open one, and under them a
 * canvas over where every half that stays lies. Null where there is no
 * canvas to draw on.
 */
export function shotsOf(layout: FoldLayout, open: Face, closed: Face, pictures: Pictures, found: FoldPictures): Shots | null {
  const { shots } = found;
  const planeOver = <Drawn extends FoldStill>(drawn: readonly Drawn[]): Plane<Drawn> | null => {
    const [left, top, right, bottom] = boxAround(drawn);
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil((right - left) * shots.scale);
    canvas.height = Math.ceil((bottom - top) * shots.scale);
    placeAt(canvas, { x: left, y: top, width: canvas.width / shots.scale, height: canvas.height / shots.scale });
    canvas.style.display = "block";
    const pen = canvas.getContext("2d");
    return pen && { canvas, pen, corner: { x: left, y: top }, shot: null };
  };
  const plane = planeOver(shots.frames);
  const still = planeOver(shots.stills);
  if (!plane || !still) return null;
  const { canvas } = plane;
  const [left, top, right, bottom] = boxAround(shots.frames);
  const sides = turningOf(layout, open, closed);
  const model = div("");
  const box = { x: left, y: top, width: right - left, height: bottom - top };
  // As far past the page's ends as the turned screen ever reaches, and a few px more, and as fine as the screen is shown.
  const margin = (side: Face, pane: Pane) => reachOf(shots, pane) * (layout.across ? side.size.height : side.size.width) + 4;
  const density = (window.devicePixelRatio || 1) * Math.max(layout.folded.scale, layout.unfolded.scale);
  const inner = gluedOf(open, pictures.open, sides.inner, layout.across, box, margin(open, "inner"), density);
  const outer = gluedOf(closed, pictures.closed, sides.outer, layout.across, box, margin(closed, "cover"), density);
  inner.shade.after(creaseOf(layout, open, true, sides.inner.rect));
  model.append(still.canvas, inner.node, outer.node, canvas);
  const { rect } = screenOf(closed);
  return {
    shots,
    model,
    plane,
    still,
    inner,
    outer,
    inside: screenOf(open).rect,
    outside: { ...rect, x: layout.shut.x + rect.x, y: layout.shut.y + rect.y },
    lit: null,
  };
}

/**
 * Draw the frame nearest the hinge's angle, `open` of the way open, as it was
 * rendered, or the nearest to it decoded where it is not yet, and the half
 * that stays from the same render. How far open the hinge is drawn: at the
 * angle of the frame shown, or `open` where none is yet.
 */
export function pick(turning: Shots, open: number): number {
  const { shots, plane } = turning;
  const found = foldShots();
  // Only a frame whose half that stays is in too, so both are of the same angle.
  const ready = (found?.frames ?? []).map((bitmap, index) => {
    const shot = shots.frames[index];
    return shot && found?.stills[shot.still] ? bitmap : null;
  });
  const { at } = shownAt(shots, ready, open);
  const next = at === null ? null : shots.frames[at];
  const bitmap = at === null ? null : ready[at];
  const kept = next && shots.stills[next.still];
  const keptBitmap = next && found?.stills[next.still];
  if (next && bitmap && next !== plane.shot) drawOn(plane, next, bitmap, shots.scale);
  if (kept && keptBitmap && kept !== turning.still.shot) drawOn(turning.still, kept, keptBitmap, shots.scale);
  return plane.shot ? shotOpen(plane.shot) : open;
}

/**
 * Lay the frame `pick` drew on the fold, with the hinge drawn `open` of the
 * way open, and the screen that faces the viewer in it a window onto the page
 * lying flat, by that frame's own corners, so the window fills the frame's
 * hole exactly. The whole of it `shown` of the way over the frame's own
 * device, and the case of the half that stays `still` of the way over it.
 */
export function pose(turning: Shots, layout: FoldLayout, open: number, shown: number, still: number): void {
  const { shots, model, plane } = turning;
  const shot = plane.shot;
  model.style.transform = shotsTransform(shots, layout, turning.inside, turning.outside, open);
  const fade = (value: number) => (value >= 1 ? "" : String(Math.round(Math.max(0, value) * 1000) / 1000));
  model.style.opacity = fade(shown);
  turning.still.canvas.style.opacity = fade(still);
  // The screens change only with the frame, or with what draws them.
  const by = [turning.inner.gl, turning.inner.pictures, turning.outer.gl, turning.outer.pictures];
  const { lit } = turning;
  if (lit && lit.shot === shot && lit.by.every((one, index) => one === by[index])) return;
  turning.lit = shot && { shot, by };
  const pane = shot && shotPane(shots, shot);
  const quad = shot && pane ? shotQuad(shot, pane) : null;
  for (const glued of [turning.inner, turning.outer]) {
    const facing = quad && glued.pane === pane ? quad : null;
    const picture = facing && shotPicture(shots, glued.pane, facing);
    const rect = { x: 0, y: 0, ...glued.size };
    const opening = facing && picture && shotWindow(facing, glued.pane, picture);
    const seen = opening && quadMap(rect, quadFacing(local(turning, opening), layout.across));
    glued.node.style.visibility = seen ? "" : "hidden";
    if (!seen || !picture || !opening) continue;
    // The page stays still and flat behind the turned screen, dark where the screen reaches past it.
    glued.cut.style.clipPath = `path("${roundedPath(rect, glued.radii, seen)}")`;
    glued.node.style.clipPath = `path("${roundedPath(bled(rect, glued.pane, layout.across, seen), bledRadii(glued.radii), seen)}")`;
    const { x, y } = plane.corner;
    glued.picture.style.transform = flatMatrix(glued.size, { ...picture, x: picture.x - x, y: picture.y - y }, layout.across);
    light(glued, open);
    const span = layout.across ? glued.size.height : glued.size.width;
    const wedge = wedgeOf(opening, glued.pane, picture, span);
    glued.gl?.draw(screenLook(glued.pane, open, glued.extent, wedge, freeOf(opening, glued.pane, picture)));
  }
}

/**
 * A screen's rect, seen as `seen` has it, bigger by `BLEED` px along the
 * hinge and by as much as `SEEN_BLEED` takes across it, but at the open
 * screen's hinge: its right held across, else its top.
 */
function bled(rect: Rect, pane: Pane, across: boolean, seen: (point: Point) => Point): Rect {
  const { x, y, width, height } = rect;
  const middle = { x: x + width / 2, y: y + height / 2 };
  // How far a side has to go out to be seen `SEEN_BLEED` px of the render further on.
  const outward = (at: Point, step: Point) => {
    const from = seen(at);
    const to = seen({ x: at.x + step.x, y: at.y + step.y });
    const shown = Math.hypot(to.x - from.x, to.y - from.y);
    return Math.max(BLEED, Math.min(8 * BLEED, shown > 0 ? SEEN_BLEED / shown : 8 * BLEED));
  };
  const hinge = pane === "inner";
  const left = across ? outward({ x, y: middle.y }, { x: -1, y: 0 }) : BLEED;
  const right = across ? (hinge ? 0 : outward({ x: x + width, y: middle.y }, { x: 1, y: 0 })) : BLEED;
  const top = across ? BLEED : hinge ? 0 : outward({ x: middle.x, y }, { x: 0, y: -1 });
  const bottom = across ? BLEED : outward({ x: middle.x, y: y + height }, { x: 0, y: 1 });
  return { x: x - left, y: y - top, width: width + left + right, height: height + top + bottom };
}

/** Corners as round as a screen's, `BLEED` px further out, square ones staying square. */
function bledRadii(radii: Corners): Corners {
  const [a, b, c, d] = radii;
  const out = (radius: number) => (radius > 0 ? radius + BLEED : 0);
  return [out(a), out(b), out(c), out(d)];
}

/** Corners in the render, from where the planes and windows lie in it. */
function local(turning: Shots, corners: Quad): Quad {
  const { x, y } = turning.plane.corner;
  const [a, b, c, d] = corners.map(([px, py]): readonly [number, number] => [px - x, py - y]);
  return a && b && c && d ? [a, b, c, d] : corners;
}

/** Draw a picture's pieces with `pen`, its box's top left at `x` `y` of the file's px. */
function drawPieces(pen: CanvasRenderingContext2D, bitmap: ImageBitmap, still: FoldStill, x: number, y: number, scale: number): void {
  const left = Math.round(x * scale);
  const top = Math.round(y * scale);
  for (const [px, py, width, height, fileX, fileY] of still.pieces) {
    pen.drawImage(bitmap, fileX, fileY, width, height, left + px, top + py, width, height);
  }
}

/** Draw a picture on a plane, where it lies on it, in place of what was there. */
function drawOn<Drawn extends FoldStill>(plane: Plane<Drawn>, shot: Drawn, bitmap: ImageBitmap, scale: number): void {
  const { pen, canvas, corner } = plane;
  plane.shot = shot;
  pen.clearRect(0, 0, canvas.width, canvas.height);
  drawPieces(pen, bitmap, shot, shot.box[0] - corner.x, shot.box[1] - corner.y, scale);
}
