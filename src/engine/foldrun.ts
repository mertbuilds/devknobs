import type { PostureValue } from "../types";
import { bezelUrl, decodeFoldShots, endFoldShots, foldShots } from "./bezels";
import {
  type FoldFrame,
  foldFrame,
  type FoldLayout,
  foldLayout,
  type FoldShot,
  type FoldShots,
  type FoldStill,
  flatMatrix,
  HAND_OVER,
  handOver,
  type Hinge,
  HINGE_STEP,
  hingeAfter,
  hingeStep,
  hingeStill,
  nearestReady,
  openOf,
  type Pane,
  type Point,
  type Quad,
  quadFacing,
  quadMap,
  RIM,
  roundedPath,
  screenDim,
  seenAt,
  SHOTS_FADE,
  shotAt,
  shotPane,
  shotPicture,
  shotQuad,
  shotsDrift,
  shotsTransform,
  shotWindow,
} from "./fold";
import { freeOf, reachOf, screenLook, wedgeOf } from "./foldgl";
import {
  creaseOf,
  type Face,
  div,
  fill,
  type Glued,
  gluedOf,
  light,
  paintDrawn,
  paintLeaf,
  type Panel,
  type Picture,
  type Pictures,
  pictureOf,
  placeAt,
  round,
  screenOf,
  type Turning,
  turningOf,
} from "./foldpage";
import type { Mock, Rect } from "./mock";
import { drawMock, UNDER } from "./mockdraw";
import { type Corners, lerp } from "./morph";
import { copyPage, forgetShots } from "./pageshot";
import { slowed, slowness } from "./slow";
import { coverTo, darken, type TurnScene } from "./turnrun";
import type { ViewportValue } from "./width";

/**
 * Folds a foldable open or shut in view, as the phone does, from the click's
 * next frame. The frame's own device stays live and sharp: open, as the half
 * of it that stays, and shut, for the last of the way there. A copy of the
 * body of the half that turns turns about the hinge on a layer over it, and
 * its screen is a window onto a picture of the page that lies flat, as
 * Apple's does: the picture is cut to where the turned screen is seen, dark
 * past its edge, blurred a few ever softer ways over the part the wipe
 * reaches, and the turned screen's shade goes over it. The hinge's spring
 * sets how far it has turned and how the screens are lit and blurred. Close
 * to shut and to open the copy fades into the device. Each frame changes only
 * transforms, the window's outline, gradients, masks and opacities. What it
 * needs of the frame comes in a `FoldScene`, so it holds no node of its own.
 *
 * A fold of the Duo in its bezels decodes the Duo's fold frames round the
 * hinge's angle as it goes, and once the first are in draws the half that
 * turns as the frame nearest that angle instead, rendered from Apple's model,
 * exactly as it was rendered, never warped, and its screen, by that frame's
 * own corners, a window onto the page lying flat, as Apple projects it: its
 * picture, blurs and shades stay still, and the window is dark where it
 * reaches past them. The case of the half that stays is drawn from the same
 * render, over the device's own, whose live page shows through it, so both
 * halves meet at the hinge in the same size and shade. It fades in over the
 * device's bezel picture as the hinge leaves an end, and once the hinge is
 * still at an end the whole render fades out to the device as it is drawn at
 * rest. Till the frames are in, or where one fails, it turns the copies. The
 * frames are let go of a while after it lands.
 */

/** What a foldable folding asks of the frame, as it starts. */
export interface FoldScene extends TurnScene {
  /** Put the layer the fold is drawn on over the device, under the readout. */
  place(layer: HTMLElement): void;
  /** The body drawn around the screen for the knobs. */
  body(value: ViewportValue): Mock | null;
  /** Where the screen would be drawn for the knobs, in the letterbox. */
  screenFor(value: ViewportValue): Rect | null;
}

/** A copy of one side of the half that turns, and the window onto the page its screen is. */
interface Leaf extends Panel {
  /** The copy of the body, turned. */
  node: HTMLElement;
  /** Its screen, dark where the window does not reach. */
  screen: HTMLElement;
  /** The part of the screen that turns, as it lies flat, cut to where the turned one is seen. */
  window: HTMLElement;
  /** The dark its ends along the hinge go toward as the half stands. */
  rim: HTMLElement;
  /** The shade's layer, turned with the body over the window. */
  veil: HTMLElement;
  /** The part that turns and its corners, and the point it turns about, in the body's css px. */
  rect: Rect;
  radii: Corners;
  pivot: Point;
}

/** The half that turns as the copies of its two sides, and the bend's half on it. */
interface Copies {
  inner: Leaf;
  outer: Leaf;
  bend: HTMLElement;
}

/** A canvas a frame is drawn on, at the files' scale, and the frame drawn on it, if any. */
interface Plane {
  canvas: HTMLCanvasElement;
  pen: CanvasRenderingContext2D;
  shot: FoldShot | null;
}

/**
 * The half that turns as the Duo's fold frames: the render's px laid on the
 * fold by `model`, the canvas in it the frame nearest the hinge's angle is
 * drawn on, from `corner` in the render, the case of the half that stays from
 * the same render under it, and the two screens glued on. The open screen
 * and the folded one, where the layout lays them.
 */
interface Shots {
  shots: FoldShots;
  model: HTMLElement;
  plane: Plane;
  still: HTMLCanvasElement;
  corner: Point;
  inner: Glued;
  outer: Glued;
  inside: Rect;
  outside: Rect;
}

/**
 * The layer a fold is drawn on, the fold's place on it, the half that turns,
 * as copies or as frames, and the bend's half on the half that stays.
 */
interface Layer {
  layer: HTMLElement;
  place: HTMLElement;
  turning: Copies | Shots;
  still: HTMLElement;
}

/**
 * The frame's own device as it is drawn: in which posture, where its corner
 * is in the letterbox and how it is transformed at rest, and its scale there.
 */
interface Unit {
  posture: PostureValue;
  corner: { x: number; y: number };
  rest: string;
  base: number;
}

/** A fold on its way: its hinge and where it goes, the knobs of each posture, and what draws them. */
interface Going {
  scene: FoldScene;
  layout: FoldLayout;
  hinge: Hinge;
  /**
   * Its sides and pictures of the page, is it the Duo's, and does it wait
   * for the Duo's frames to take over from the copies?
   */
  faces: { open: Face; closed: Face };
  pictures: Pictures;
  duo: boolean;
  waiting: boolean;
  /** How far open the fold is drawn: between the hinge's last step and its next, by the time between. */
  open: number;
  target: number;
  /** Does a hand hold the hinge, and the posture the knobs hold, which it lands in let go between the ends? */
  held: boolean;
  home: PostureValue;
  /** Does the hinge go where a hand sent it, not where the knobs did? */
  hand: boolean;
  values: Record<PostureValue, ViewportValue>;
  frame: number;
  /** When the hinge's first step was, how long since in the hinge's own time, and how many steps it has taken. */
  begin: number | null;
  elapsed: number;
  /** How many times slower than the phone's it runs. */
  slow: number;
  steps: number;
  parts: Layer;
  unit: Unit;
  /**
   * Under the frames, how far the still half's rendered case has faded in
   * over the device's bezel picture since the hinge left an end, and how far
   * the whole render has faded out to the device since it got still at one,
   * 0 to 1 each.
   */
  still: number;
  out: number;
  draw: (value: ViewportValue) => void;
}

let fold: Going | null = null;

/** What wants to know once a fold is over. */
const watchers = new Set<() => void>();

/** What wants to know where the hinge is drawn each time it is, and whether a hand sent it there. */
const hinges = new Set<(open: number, hand: boolean) => void>();

/** Is a foldable folding? */
export function folding(): boolean {
  return fold !== null;
}

function sideOf(scene: FoldScene, value: ViewportValue, screen: Rect): Face {
  const body = scene.body(value);
  const href = body?.image ? bezelUrl(body.image.file) : null;
  const width = typeof value.width === "number" ? value.width : screen.width;
  const height = typeof value.height === "number" ? value.height : screen.height;
  return { body, href, size: { width, height }, screen };
}

/**
 * A copy of a side's body around its screen, in the screen's css px, as the
 * frame draws it, its screen dark, and the window onto the page, `picture`,
 * that the part of it that turns is: the pictures laid as the screen lies,
 * the browser's `bars` over them, the dark over the picture, then over the
 * window, turned with the body, the dark of the turned screen.
 */
function leafOf(side: Face, picture: Picture, turning: Turning, across: boolean): Leaf {
  const { body, size, href } = side;
  const node = div("face");
  node.style.width = `${body?.width ?? size.width}px`;
  node.style.height = `${body?.height ?? size.height}px`;
  const { rect: whole, radii } = screenOf(side);
  const { rect } = turning;
  const screen = placeAt(div(""), whole);
  screen.style.background = "#000";
  screen.style.borderRadius = round(radii);
  if (href) screen.style.boxShadow = `0 0 0 ${UNDER}px #000`;
  node.append(screen);
  if (body) {
    const drawing = drawMock(body, size, href);
    drawing.style.width = "100%";
    drawing.style.height = "100%";
    node.append(drawing);
  }
  const opening = placeAt(div(""), rect);
  const dark = div("");
  dark.style.position = "absolute";
  dark.style.inset = "-100%";
  dark.style.background = "#000";
  // Rounded as the screen is, so the pictures, the bars and the rim are too.
  const stage = placeAt(div(""), { ...whole, x: whole.x - rect.x, y: whole.y - rect.y });
  stage.style.borderRadius = round(radii);
  stage.style.overflow = "hidden";
  if (picture.bars) stage.append(picture.bars);
  const rim = fill(div(""));
  const edge = `transparent ${RIM * 100}%, transparent ${(1 - RIM) * 100}%`;
  rim.style.background = `linear-gradient(${across ? "to bottom" : "to right"}, #000, ${edge}, #000)`;
  stage.append(rim);
  const flat = fill(div(""));
  opening.append(dark, stage, flat);
  const veil = div("face");
  veil.style.width = node.style.width;
  veil.style.height = node.style.height;
  const shade = placeAt(div(""), rect);
  shade.style.borderRadius = round(turning.radii);
  veil.append(shade);
  const leaf: Leaf = {
    pane: turning.pane,
    node,
    screen,
    window: opening,
    stage,
    pictures: [],
    rim,
    flat,
    veil,
    shade,
    toward: turning.toward,
    span: turning.span,
    rect,
    radii: turning.radii,
    pivot: turning.pivot,
    extent: across ? size.width : size.height,
    width: size.width,
    across,
  };
  if (picture.shot) paintLeaf(leaf, picture.shot);
  // The page as the browser draws it, once it has, over the rough one.
  void picture.painted?.then((drawn) => {
    if (drawn && leaf.node.isConnected) paintDrawn(picture, drawn, (shot) => paintLeaf(leaf, shot));
  });
  return leaf;
}

/**
 * The copies of the half that turns: its inside, the open screen's half,
 * `inner`, and its outside, the folded body, `outer`, each with the window its
 * screen is, and the bend's half on it.
 */
function copiesOf(layout: FoldLayout, open: Face, closed: Face, pictures: Pictures): Copies {
  const sides = turningOf(layout, open, closed);
  const inner = leafOf(open, pictures.open, sides.inner, layout.across);
  const outer = leafOf(closed, pictures.closed, sides.outer, layout.across);
  for (const node of [inner.node, inner.veil]) {
    node.style.clipPath = layout.clip;
    node.style.transformOrigin = layout.origins.inner;
  }
  for (const node of [outer.node, outer.window, outer.veil]) {
    node.style.left = `${layout.shut.x + (node === outer.window ? sides.outer.rect.x : 0)}px`;
    node.style.top = `${layout.shut.y + (node === outer.window ? sides.outer.rect.y : 0)}px`;
  }
  outer.node.style.transformOrigin = layout.origins.outer;
  outer.veil.style.transformOrigin = layout.origins.outer;
  const bend = creaseOf(layout, open, true);
  inner.veil.append(bend);
  return { inner, outer, bend };
}

/**
 * The half that turns as the fold's frames, `found`, laid on the fold: a
 * canvas over where every frame lies in the render, under it the screens
 * with the page glued on, the bend's half on the open one, and under them the
 * half that stays, drawn once. Null where there is no canvas to draw on.
 */
function shotsOf(
  layout: FoldLayout,
  open: Face,
  closed: Face,
  pictures: Pictures,
  found: { shots: FoldShots; still: ImageBitmap },
): Shots | null {
  const { shots } = found;
  const [first, ...rest] = shots.frames.map((shot) => shot.box);
  if (!first) return null;
  const [left, top, right, bottom] = rest.reduce(
    (all, box) => [
      Math.min(all[0], box[0]),
      Math.min(all[1], box[1]),
      Math.max(all[2], box[2]),
      Math.max(all[3], box[3]),
    ],
    [...first],
  );
  const canvasOver = (box: readonly [number, number, number, number]) => {
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil((box[2] - box[0]) * shots.scale);
    canvas.height = Math.ceil((box[3] - box[1]) * shots.scale);
    placeAt(canvas, { x: box[0], y: box[1], width: canvas.width / shots.scale, height: canvas.height / shots.scale });
    canvas.style.display = "block";
    return canvas;
  };
  const canvas = canvasOver([left, top, right, bottom]);
  const pen = canvas.getContext("2d");
  const still = canvasOver(shots.still.box);
  const stillPen = still.getContext("2d");
  if (!pen || !stillPen) return null;
  drawPieces(stillPen, found.still, shots.still, 0, 0, shots.scale);
  const sides = turningOf(layout, open, closed);
  const model = div("");
  const box = { x: left, y: top, width: right - left, height: bottom - top };
  // As far past the page's ends as the turned screen ever reaches, and a few px more, and as fine as the screen is shown.
  const margin = (side: Face, pane: Pane) => reachOf(shots, pane) * (layout.across ? side.size.height : side.size.width) + 4;
  const density = (window.devicePixelRatio || 1) * Math.max(layout.folded.scale, layout.unfolded.scale);
  const inner = gluedOf(open, pictures.open, sides.inner, layout.across, box, margin(open, "inner"), density);
  const outer = gluedOf(closed, pictures.closed, sides.outer, layout.across, box, margin(closed, "cover"), density);
  inner.shade.after(creaseOf(layout, open, true, sides.inner.rect));
  model.append(still, inner.node, outer.node, canvas);
  const { rect } = screenOf(closed);
  return {
    shots,
    model,
    plane: { canvas, pen, shot: null },
    still,
    corner: { x: left, y: top },
    inner,
    outer,
    inside: screenOf(open).rect,
    outside: { ...rect, x: layout.shut.x + rect.x, y: layout.shut.y + rect.y },
  };
}

/**
 * Put the half that turns over the frame's own device, as the fold's frames
 * where `found` has them, else as copies, and the bend's half on the half that
 * stays, which shows only while the inside does, so the outside never goes over it.
 */
function build(
  scene: FoldScene,
  layout: FoldLayout,
  open: Face,
  closed: Face,
  pictures: Pictures,
  found: { shots: FoldShots; still: ImageBitmap } | null,
): Layer {
  const layer = div("fold");
  const place = div("");
  const still = creaseOf(layout, open, false);
  let turning: Copies | Shots;
  const shots = found && shotsOf(layout, open, closed, pictures, found);
  if (shots) {
    // Under the frames, which draw the hinge over it.
    place.append(still, shots.model);
    turning = shots;
  } else {
    const copies = copiesOf(layout, open, closed, pictures);
    const { inner, outer } = copies;
    place.append(inner.node, inner.window, inner.veil, outer.node, outer.window, outer.veil, still);
    turning = copies;
  }
  layer.append(place);
  scene.place(layer);
  return { layer, place, turning, still };
}

/** Where the frame's own device is, now that it is drawn `posture`. */
function measure(scene: FoldScene, posture: PostureValue): Unit {
  const box = scene.letterbox.getBoundingClientRect();
  const rect = scene.unit.getBoundingClientRect();
  const rest = scene.unit.style.transform;
  const base = Number(/scale\(([\d.e-]+)\)/.exec(rest)?.[1] ?? 1);
  return { posture, corner: { x: rect.left - box.left, y: rect.top - box.top }, rest, base };
}

/** Draw the frame's own device in a posture, in the middle of a fold, which holds any draw off otherwise. */
function redraw(going: Going, posture: PostureValue): void {
  fold = null;
  going.draw(going.values[posture]);
  fold = going;
  going.unit = measure(going.scene, posture);
}

/**
 * Draw the frame's own device the way it should be with the hinge where it
 * is: open, but for the last of the way to shut, where the folded body hides
 * the rest of it.
 */
function sync(going: Going): void {
  const posture: PostureValue = going.open <= HAND_OVER ? "closed" : "open";
  if (going.unit.posture !== posture) redraw(going, posture);
}

/**
 * Show a copy of a side of the half that turns as it stands, turned with
 * `transform` as `frame` has it, lit and blurred as the hinge `open` of the
 * way open has it, its screen `shown` of the way over the frame's own.
 */
function stand(leaf: Leaf, layout: FoldLayout, frame: FoldFrame, transform: string | null, open: number, shown: number): void {
  const parts = [leaf.node, leaf.window, leaf.veil];
  for (const part of parts) part.style.visibility = transform ? "" : "hidden";
  if (!transform) return;
  leaf.node.style.transform = transform;
  leaf.veil.style.transform = transform;
  // The window shows the flat picture only where the turned screen is seen, its corners as round.
  const { rect, pivot } = leaf;
  const path = roundedPath(rect, leaf.radii, (point) => {
    const seen = seenAt(point, pivot, frame.degrees, layout.across, layout.depth);
    return { x: seen.x - rect.x, y: seen.y - rect.y };
  });
  leaf.window.style.clipPath = `path("${path}")`;
  leaf.rim.style.opacity = String(frame.lift);
  light(leaf, open);
  // Its body stays whole, so nothing behind the device shows through it.
  const fade = shown < 1 ? String(shown) : "";
  leaf.screen.style.opacity = fade;
  leaf.window.style.opacity = fade;
  leaf.veil.style.opacity = fade;
}

/**
 * How far the dark under the window reaches past the turned screen, in its
 * css px, under the case all round, but for the open screen's hinge side,
 * where the page goes on past it: so where the window's edge and the case's
 * hole each fade out over a px, the mat never shows between them.
 */
const BLEED = 2;

/**
 * As the screen turns away its sides along the hinge are seen ever thinner:
 * there the dark reaches as far as it takes to be seen at least this many px
 * of the render past them, two thirds of a css px, up to 8 times `BLEED`.
 */
const SEEN_BLEED = 2;

/**
 * Show the frame nearest the hinge's angle, `open` of the way open, as it was
 * rendered, or the nearest to it decoded where it is not yet, laid on the
 * fold, and the screen that faces the viewer in it a window onto the page
 * lying flat, by that frame's own corners, so the window fills the frame's
 * hole exactly. The whole of it `shown` of the way over the frame's own
 * device, and the case of the half that stays `still` of the way over it.
 */
function pose(turning: Shots, layout: FoldLayout, open: number, shown: number, still: number): void {
  const { shots, model, plane } = turning;
  const found = foldShots();
  const at = found ? nearestReady(found.frames, shotAt(shots, open)) : null;
  const next = at === null ? null : shots.frames[at];
  const bitmap = at === null ? null : found?.frames[at];
  if (next && bitmap && next !== plane.shot) drawShot(turning, next, bitmap);
  const shot = plane.shot;
  model.style.transform = shotsTransform(shots, layout, turning.inside, turning.outside, open);
  const fade = (value: number) => (value >= 1 ? "" : String(Math.round(Math.max(0, value) * 1000) / 1000));
  model.style.opacity = fade(shown);
  turning.still.style.opacity = fade(still);
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
    const { x, y } = turning.corner;
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
  const { x, y } = turning.corner;
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

/** Draw a frame on the plane, where it lies on it, in place of what was there. */
function drawShot(turning: Shots, shot: FoldShot, bitmap: ImageBitmap): void {
  const { corner, shots, plane } = turning;
  const { pen, canvas } = plane;
  plane.shot = shot;
  pen.clearRect(0, 0, canvas.width, canvas.height);
  drawPieces(pen, bitmap, shot, shot.box[0] - corner.x, shot.box[1] - corner.y, shots.scale);
}

/** Which way the hinge goes along the frames: toward shut, 1, toward open, -1, or neither, 0. */
function towardOf(going: Going): number {
  return Math.sign(going.open - going.target);
}

/** Draw the fold with the hinge where it has got to. */
function show(going: Going): void {
  if (going.duo) decodeFoldShots(going.open, towardOf(going));
  const found = going.waiting ? foldShots() : null;
  // The frames came in as it folds: they take over from the copies, once.
  if (found) {
    going.waiting = false;
    const { open, closed } = going.faces;
    drop(going.parts);
    going.parts = build(going.scene, going.layout, open, closed, going.pictures, found);
  }
  const { layout, parts, unit, scene } = going;
  const { open } = going;
  const frame = foldFrame(layout, open);
  const { turning } = parts;
  const shots = "model" in turning ? turning : null;
  const hand = shots ? going.out : handOver(open, unit.posture);
  const { x, y, scale } = frame.place;
  parts.place.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
  if ("model" in turning) pose(turning, layout, open, 1 - hand, going.still);
  else {
    stand(turning.inner, layout, frame, frame.inner, open, 1 - hand);
    stand(turning.outer, layout, frame, frame.outer, open, 1 - hand);
    turning.bend.style.opacity = String(frame.lift);
  }
  // As the half that turns shows it, faded as it is. Under the frames it may go on past a right angle, so it never goes at once.
  parts.still.style.visibility = frame.inner || shots ? "" : "hidden";
  parts.still.style.opacity = String(frame.lift * (1 - hand));
  // The frame's own device moves with the fold, its folded body onto where it lies shut, and under the frames with them.
  const opened = unit.posture === "open";
  const own = opened ? layout.unfolded.scale : layout.folded.scale;
  const drift = shots
    ? shotsDrift(shots.shots, layout, shots.inside, shots.outside, open, unit.posture)
    : { wide: 1, tall: 1, x: 0, y: 0 };
  const body = opened ? { x: 0, y: 0 } : layout.shut;
  const to = { x: x + (drift.wide * body.x + drift.x) * scale, y: y + (drift.tall * body.y + drift.y) * scale };
  const by = { x: to.x - unit.corner.x, y: to.y - unit.corner.y };
  const size = (unit.base * scale) / own;
  scene.unit.style.transform = `translate(${by.x}px, ${by.y}px) scale(${size * drift.wide}, ${size * drift.tall})`;
  scene.unit.style.clipPath = opened && hand === 0 ? stillClip(going, shots, frame.inner !== null, own) : "";
  darken(scene.cover, screenDim(opened ? "inner" : "cover", open));
  for (const watcher of Array.from(hinges)) watcher(open, going.hand);
}

/**
 * What of the frame's own device shows open, in its own css px: the half
 * that stays, till the copy of the other fades into it. It goes a px of the
 * screen under the inside of the half that turns, while that shows, so their
 * edges at the hinge leave no seam. Under the frames, once the still half's
 * rendered case is all in, only its screen shows, `BLEED` px further out, under
 * that case, so none of the bezel picture shows past the render's.
 */
function stillClip(going: Going, shots: Shots | null, inside: boolean, own: number): string {
  const { layout, unit } = going;
  const at = (value: number) => (value * own) / unit.base;
  const under = inside ? 1 : 0;
  const hinge = at(layout.hinge + (layout.across ? -under : under));
  const far = 1e5;
  const points = (corners: [number, number][]) => `polygon(${corners.map(([px, py]) => `${px}px ${py}px`).join(", ")})`;
  if (!shots || going.still < 1) {
    return layout.across
      ? points([[hinge, -far], [far, -far], [far, far], [hinge, far]])
      : points([[-far, -far], [far, -far], [far, hinge], [-far, hinge]]);
  }
  const { inside: screen } = shots;
  const left = at(screen.x - BLEED);
  const top = at(screen.y - BLEED);
  const right = at(screen.x + screen.width + BLEED);
  const bottom = at(screen.y + screen.height + BLEED);
  return layout.across
    ? points([[hinge, top], [right, top], [right, bottom], [hinge, bottom]])
    : points([[left, top], [right, top], [right, hinge], [left, hinge]]);
}

/** Take a fold's layer away, and let go of what draws its screens. */
function drop(parts: Layer): void {
  parts.layer.remove();
  if (!("model" in parts.turning)) return;
  for (const glued of [parts.turning.inner, parts.turning.outer]) {
    glued.gl?.release();
    glued.gl = null;
  }
}

/** Take the fold's layer away, and leave the frame's own device as it is drawn. */
function clear(last: Going): void {
  window.cancelAnimationFrame(last.frame);
  window.removeEventListener("resize", settle);
  drop(last.parts);
  last.scene.unit.style.clipPath = "";
  darken(last.scene.cover, 0);
  if (last.duo) endFoldShots();
  for (const watcher of Array.from(watchers)) watcher();
}

/** Is the hinge shut or open there? */
function isEnd(open: number): boolean {
  return open === 0 || open === 1;
}

/**
 * The fold is over: the device is drawn the way the knobs say, and the layer
 * goes in the same frame. Let go at an end, that end's knobs, else, held or
 * left between, those of the posture the knobs hold.
 */
function land(): void {
  const last = fold;
  fold = null;
  if (!last) return;
  const ended = !last.held && isEnd(last.target);
  last.draw(last.values[ended ? (last.target === 1 ? "open" : "closed") : last.home]);
  clear(last);
}

/** The window changed size while a hand left the hinge between the ends: it lands as the knobs have it. */
function settle(): void {
  if (foldRest() !== null) land();
}

/** The hinge got where a hand holds it, or left it between the ends: drawn there, it stops stepping till it moves on. */
function rest(going: Going): void {
  going.frame = 0;
  going.begin = null;
  going.elapsed = 0;
  going.steps = 0;
  going.open = going.target;
  sync(going);
  show(going);
  if (!going.held) window.addEventListener("resize", settle);
}

/** Step a hinge that rests again, now that it goes somewhere else. */
function wake(going: Going): void {
  if (going.frame === 0 && fold === going) swing(going);
}

/**
 * Under the frames, fade the render `ms` on: out to the device where the
 * hinge is still at an end, else the still half's case in over it, from none
 * again where the render had faded out.
 */
function fadeOn(going: Going, ms: number, flat: boolean): void {
  if (!("model" in going.parts.turning)) return;
  if (flat) {
    going.out = Math.min(1, going.out + ms / SHOTS_FADE);
    return;
  }
  if (going.out > 0) going.still = 0;
  going.out = 0;
  going.still = Math.min(1, going.still + ms / SHOTS_FADE);
}

/** Has the render done fading, the hinge still at an end or not? Always without the frames. */
function faded(going: Going, flat: boolean): boolean {
  if (!("model" in going.parts.turning)) return true;
  return flat ? going.out >= 1 : going.still >= 1;
}

/**
 * Step the hinge sixty times a second from the click's next frame, its first
 * step drawn then, till it lands, and while the render fades. A frame between
 * two steps draws it between them, so it moves as smoothly at any rate.
 */
function swing(going: Going): void {
  const tick = (now: number) => {
    if (fold !== going) return;
    going.begin ??= now;
    const elapsed = slowed(now - going.begin, going.slow);
    const due = elapsed / HINGE_STEP + 1;
    const steps = Math.floor(due);
    going.hinge = hingeAfter(going.hinge, going.target, steps - going.steps);
    going.steps = Math.max(going.steps, steps);
    const still = hingeStill(going.hinge, going.target);
    const flat = still && isEnd(going.target);
    fadeOn(going, elapsed - going.elapsed, flat);
    going.elapsed = elapsed;
    if (still && faded(going, flat)) {
      if (!going.held && isEnd(going.target)) land();
      else rest(going);
      return;
    }
    const next = hingeStep(going.hinge, going.target).position;
    going.open = still ? going.target : lerp(going.hinge.position, next, due - steps);
    sync(going);
    show(going);
    going.frame = window.requestAnimationFrame(tick);
  };
  going.frame = window.requestAnimationFrame(tick);
}

/**
 * Fold the device drawn as `from` to the posture `value` has, in view, and
 * `draw` the knobs once it is there. A fold back while it folds goes back
 * from where it got to, as fast as it was going, and a hand on the hinge
 * lets go of it. Without a scene or a place to go, the knobs are drawn at
 * once. `held`, a hand takes the hinge instead, of the fold on its way or of
 * one toward `value` that stays where it is till the hand moves it, and
 * nothing is drawn where there is none. True where it folds in view.
 */
export function foldDevice(
  from: ViewportValue,
  value: ViewportValue,
  scene: FoldScene | null,
  draw: (value: ViewportValue) => void,
  held = false,
): boolean {
  const going = fold;
  if (going && held) {
    going.held = true;
    going.hand = true;
    return true;
  }
  if (going) {
    // The knobs take the hinge from a hand that holds it, or that sent it somewhere else.
    if (going.held || going.target !== openOf(value.posture)) going.hand = false;
    going.held = false;
    going.home = value.posture;
    going.target = openOf(value.posture);
    going.values[value.posture] = value;
    going.open = going.hinge.position;
    sync(going);
    show(going);
    wake(going);
    return true;
  }
  const to = scene?.screenFor(value);
  if (!scene || !to) {
    if (!held) draw(value);
    return false;
  }
  // A turn's dark lifting off the page stops, and the dim goes over the bars too.
  coverTo(scene.cover, 0);
  scene.glass.append(scene.cover);
  const color = scene.background();
  const now = sideOf(scene, from, scene.screenRect());
  const next = sideOf(scene, value, to);
  const opening = value.posture === "open";
  const across = (opening ? value : from).orientation === "landscape";
  // Pictures of the page as it is, and as laid out for the other screen, for
  // which the frame is drawn that way a moment, unseen.
  const copy = copyPage(scene.frame);
  const before = pictureOf(scene.frame, scene.glass, from, now.size, color, copy);
  draw(value);
  const after = pictureOf(scene.frame, scene.glass, value, next.size, color, copy);
  draw(from);
  const closed = opening ? now : next;
  const open = opening ? next : now;
  const layout = foldLayout(closed, open, across);
  // The fold's frames are the Duo's, drawn to go with its bezels, which a body has once they have loaded.
  const duo = [open, closed].every((side) => side.body?.image?.file.startsWith("iphone-duo-"));
  const pictures = opening ? { open: after, closed: before } : { open: before, closed: after };
  const values = { [from.posture]: from, [value.posture]: value } as Record<PostureValue, ViewportValue>;
  const start = openOf(from.posture);
  const target = openOf((held ? from : value).posture);
  if (duo) decodeFoldShots(start, Math.sign(start - target));
  const parts = build(scene, layout, open, closed, pictures, duo ? foldShots() : null);
  fold = {
    scene,
    layout,
    faces: { open, closed },
    pictures,
    duo,
    waiting: duo && !("model" in parts.turning),
    hinge: { position: start, velocity: 0 },
    open: start,
    target,
    held,
    home: (held ? from : value).posture,
    hand: held,
    values,
    frame: 0,
    begin: null,
    elapsed: 0,
    slow: slowness(),
    steps: 0,
    parts,
    unit: measure(scene, from.posture),
    // At rest the device shows as it is drawn, till the hinge moves.
    still: 0,
    out: 1,
    draw,
  };
  show(fold);
  swing(fold);
  return true;
}

/** Where the hand holding the hinge moves it to, 0 shut to 1 open, through the spring. False where none holds it. */
export function scrubFold(target: number): boolean {
  if (!fold?.held) return false;
  fold.target = target;
  wake(fold);
  return true;
}

/** The hand lets go of the hinge, which goes on to `stop`, at once where `snap`. False where there is no fold. */
export function releaseFold(stop: number, snap: boolean): boolean {
  const going = fold;
  if (!going) return false;
  going.held = false;
  going.hand = true;
  going.target = stop;
  // With less motion it lands at once, without fading.
  if (snap) {
    going.hinge = { position: stop, velocity: 0 };
    going.out = isEnd(stop) ? 1 : 0;
    going.still = 1;
  }
  wake(going);
  return true;
}

/** Does a hand hold the hinge? */
export function holdingHinge(): boolean {
  return fold?.held ?? false;
}

/** Where a hand left the hinge between the ends, on its way there or resting, else null. */
export function foldRest(): number | null {
  return fold && !fold.held && !isEnd(fold.target) ? fold.target : null;
}

/** Hear when a fold is over, whichever way. Returns the way to stop. */
export function watchFold(watcher: () => void): () => void {
  watchers.add(watcher);
  return () => {
    watchers.delete(watcher);
  };
}

/** Hear where the hinge is drawn, 0 shut to 1 open, each time it is, and whether a hand sent it there. Returns the way to stop. */
export function watchHinge(watcher: (open: number, hand: boolean) => void): () => void {
  hinges.add(watcher);
  return () => {
    hinges.delete(watcher);
  };
}

/**
 * The fold goes on, and the frame takes these knobs once it is there. One a
 * hand left between the ends lands as the knobs have it, as the frame cannot
 * draw anything else about it while it stays.
 */
export function holdFold(value: ViewportValue): void {
  if (!fold) return;
  fold.values[value.posture] = value;
  if (foldRest() !== null) land();
}

/** Land a fold where it goes, at once. */
export function finishFold(): void {
  land();
}

/** Stop a fold where it is, and show the device as it is drawn. */
export function stopFold(): void {
  const last = fold;
  fold = null;
  if (!last) return;
  clear(last);
  last.scene.unit.style.transform = last.unit.rest;
}

/** The frame is gone, and the fold with it. */
export function forgetFold(): void {
  if (fold) {
    window.cancelAnimationFrame(fold.frame);
    drop(fold.parts);
  }
  window.removeEventListener("resize", settle);
  fold = null;
  for (const watcher of Array.from(watchers)) watcher();
  forgetShots();
  endFoldShots(true);
}
