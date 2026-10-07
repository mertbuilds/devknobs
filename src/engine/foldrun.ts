import type { PostureValue } from "../types";
import { bezelUrl, decodeFoldShots, foldShots, releaseFoldShots, SHOTS_KEPT } from "./bezels";
import {
  type FoldFrame,
  foldFrame,
  type FoldLayout,
  foldLayout,
  type FoldShot,
  type FoldShots,
  flatMatrix,
  HAND_OVER,
  handOver,
  type Hinge,
  HINGE_STEP,
  hingeAfter,
  hingeStep,
  hingeStill,
  openOf,
  type Pane,
  paneAt,
  type Point,
  type Quad,
  quadBetween,
  quadFacing,
  quadMap,
  quadToQuad,
  RIM,
  roundedPath,
  screenDim,
  seenAt,
  SHOTS_HAND_OVER,
  shotPicture,
  shotQuad,
  shotsBetween,
  shotsTransform,
  shotWindow,
} from "./fold";
import {
  creaseOf,
  type Face,
  div,
  fill,
  light,
  paintLeaf,
  type Panel,
  type Picture,
  type Pictures,
  placeAt,
  round,
  screenOf,
  type Turning,
  turningOf,
} from "./foldpage";
import type { Mock, Rect } from "./mock";
import { drawMock, UNDER } from "./mockdraw";
import { type Corners, lerp } from "./morph";
import { copyPage, forgetShots, paintPage, shootPage } from "./pageshot";
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
 * A fold of the Duo in its bezels decodes the Duo's fold frames as it starts,
 * and once they are in draws the half that turns as the two frames either
 * side of the hinge's angle instead, rendered from Apple's model, each on a
 * canvas laid onto the screen's corners between theirs, faded one into the
 * other, and the screen between those corners a window onto the page lying
 * flat, as Apple projects it: its picture, blurs and shades stay still, and
 * the window is dark where it reaches past them. They hand over to the device only when
 * all but flat. Till then, or where one fails, it turns the copies. The
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

/** A screen of a frame's half that turns, a window onto the page lying flat behind it. */
interface Glued extends Panel {
  /** The window, dark, over every frame in the render, cut to the turned screen's outline. */
  node: HTMLElement;
  /** The part that turns as it lies, in its own css px, laid flat where the page is seen, and its corners. */
  picture: HTMLElement;
  /** The dark its ends along the hinge fade into toward the free edge, as the blur spreads them into the dark past them. */
  rim: HTMLElement;
  size: { width: number; height: number };
  radii: Corners;
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
 * fold by `model`, the two canvases in it the frames either side of the
 * hinge are drawn on, from `corner` in the render, their pictures, and the
 * two screens glued on. The open screen and the folded one, where the layout lays them.
 */
interface Shots {
  shots: FoldShots;
  model: HTMLElement;
  planes: [Plane, Plane];
  /** Can the browser add the two up, so they fade one into the other as one whole case? */
  adds: boolean;
  corner: Point;
  bitmaps: ImageBitmap[];
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
  values: Record<PostureValue, ViewportValue>;
  frame: number;
  /** When the hinge's first step was, and how many it has taken since. */
  begin: number | null;
  /** How many times slower than the phone's it runs. */
  slow: number;
  steps: number;
  parts: Layer;
  unit: Unit;
  draw: (value: ViewportValue) => void;
}

let fold: Going | null = null;

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
  };
  if (picture.shot) paintLeaf(leaf, picture.shot);
  // The page as the browser draws it, once it has, over the rough one.
  void picture.painted?.then((shot) => {
    if (shot && leaf.node.isConnected) paintLeaf(leaf, shot);
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
 * The page on a side's screen of the half that turns, seen through a frame:
 * a window over `box`, the render's px every frame lies in, dark, and in it
 * the part that turns, in its own css px, the pictures and the browser's bars
 * as the screen lies, the dark of the picture and the shade of the turned
 * screen, all laid flat. The window is cut to the turned screen, so none of
 * its dark shows past the case.
 */
function gluedOf(side: Face, picture: Picture, turning: Turning, across: boolean, box: Rect): Glued {
  const { rect, radii } = turning;
  const whole = screenOf(side);
  const node = placeAt(div(""), box);
  node.style.background = "#000";
  const flatly = placeAt(div(""), { ...rect, x: 0, y: 0 });
  flatly.style.transformOrigin = "0 0";
  flatly.style.overflow = "hidden";
  const stage = placeAt(div(""), { ...whole.rect, x: whole.rect.x - rect.x, y: whole.rect.y - rect.y });
  if (picture.bars) stage.append(picture.bars);
  const rim = fill(div(""));
  const edge = `transparent ${RIM * 100}%, transparent ${(1 - RIM) * 100}%`;
  rim.style.background = `linear-gradient(${across ? "to bottom" : "to right"}, #000, ${edge}, #000)`;
  const sharp = `linear-gradient(${turning.toward}, transparent, #000)`;
  rim.style.maskImage = sharp;
  rim.style.setProperty("-webkit-mask-image", sharp);
  const flat = fill(div(""));
  const shade = fill(div(""));
  flatly.append(stage, rim, flat, shade);
  node.append(flatly);
  const glued: Glued = {
    pane: turning.pane,
    node,
    picture: flatly,
    rim,
    size: { width: rect.width, height: rect.height },
    radii,
    stage,
    pictures: [],
    flat,
    shade,
    toward: turning.toward,
    span: turning.span,
    extent: across ? side.size.width : side.size.height,
    width: side.size.width,
  };
  if (picture.shot) paintLeaf(glued, picture.shot);
  void picture.painted?.then((shot) => {
    if (shot && glued.node.isConnected) paintLeaf(glued, shot);
  });
  return glued;
}

/**
 * The half that turns as the fold's frames, `found`, laid on the fold: two
 * canvases over where every frame lies in the render, under them the screens
 * with the page glued on, and the bend's half on the open one. Null where
 * there is no canvas to draw on.
 */
function shotsOf(
  layout: FoldLayout,
  open: Face,
  closed: Face,
  pictures: Pictures,
  found: { shots: FoldShots; bitmaps: ImageBitmap[] },
): Shots | null {
  const { shots, bitmaps } = found;
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
  const plane = (): Plane | null => {
    const canvas = document.createElement("canvas");
    const pen = canvas.getContext("2d");
    if (!pen) return null;
    canvas.width = Math.ceil((right - left) * shots.scale);
    canvas.height = Math.ceil((bottom - top) * shots.scale);
    placeAt(canvas, { x: left, y: top, width: canvas.width / shots.scale, height: canvas.height / shots.scale });
    canvas.style.display = "block";
    canvas.style.transformOrigin = "0 0";
    if (adds) canvas.style.mixBlendMode = "plus-lighter";
    return { canvas, pen, shot: null };
  };
  const adds = typeof CSS !== "undefined" && CSS.supports("mix-blend-mode", "plus-lighter");
  const under = plane();
  const over = plane();
  if (!under || !over) return null;
  const sides = turningOf(layout, open, closed);
  const model = div("");
  const box = { x: left, y: top, width: right - left, height: bottom - top };
  const inner = gluedOf(open, pictures.open, sides.inner, layout.across, box);
  const outer = gluedOf(closed, pictures.closed, sides.outer, layout.across, box);
  inner.shade.after(creaseOf(layout, open, true, sides.inner.rect));
  // Added up only with each other, not with the screens under them.
  const frames = div("");
  frames.style.position = "absolute";
  frames.style.isolation = "isolate";
  frames.append(under.canvas, over.canvas);
  model.append(inner.node, outer.node, frames);
  const { rect } = screenOf(closed);
  return {
    shots,
    model,
    planes: [under, over],
    adds,
    corner: { x: left, y: top },
    bitmaps,
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
  found: { shots: FoldShots; bitmaps: ImageBitmap[] } | null,
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

/** The page as the frame lays it out now on a screen `size` css px, `copy` of it to draw. */
function pictureOf(
  scene: FoldScene,
  size: { width: number; height: number },
  color: string,
  copy: Element | null,
): Picture {
  const { frame, glass } = scene;
  const shown = Array.from(glass.children).find((node) => node.className === "browser");
  const bars = shown ? (shown.cloneNode(true) as HTMLElement) : null;
  // Drawn in the screen's css px, scaled up by the frame's zoom, which the copy leaves out.
  if (bars) bars.style.transform = "";
  return {
    shot: shootPage(frame, glass, size, color),
    painted: copy ? paintPage(frame, glass, size, color, copy) : null,
    bars,
  };
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
 * Over how much of the way the device takes over from the half that turns:
 * the frames, all but flat by then, cover it till later, so the device under
 * them is drawn the way it ends up a while before it shows.
 */
function spanOf(going: Going): number {
  return "model" in going.parts.turning ? SHOTS_HAND_OVER : HAND_OVER;
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
 * Show the frames either side of the hinge's angle, `open` of the way open,
 * the more open one and the next faded in over it as far as the hinge has
 * gone toward it, laid on the fold, and the screen that faces the viewer a
 * window onto the page lying flat, its corners as far between the two
 * frames', the whole of it `shown` of the way over the frame's own device.
 * Each frame is laid onto those corners from its own, as the half turns
 * between them, so the two outlines meet and the case never shows twice.
 */
function pose(turning: Shots, layout: FoldLayout, open: number, lift: number, shown: number): void {
  const { shots, model } = turning;
  const between = shotsBetween(shots, open);
  if (!between) return;
  const { from, to, share } = between;
  const pane = paneAt(180 * (1 - open));
  const quad = pane ? quadBetween(shotQuad(from, pane), shotQuad(to, pane), share) : null;
  // Edge on, a frame's screen has no corners to be laid from, so the two only fade.
  const laid = pane !== null && paneAt(from.deg) === pane && paneAt(to.deg) === pane ? quad : null;
  const [under, over] = planesFor(turning, from, to);
  layShot(turning, under, laid ? pane : null, laid);
  // Added up, the two make a whole case where both have it, and one's edge fades out as the other's fades in.
  const fade = from === to ? 0 : Math.round(share * 1000) / 1000;
  under.canvas.style.opacity = turning.adds && fade > 0 ? String(Math.round((1 - fade) * 1000) / 1000) : "";
  over.canvas.style.opacity = String(fade);
  if (from !== to) layShot(turning, over, laid ? pane : null, laid);
  model.style.transform = shotsTransform(shots, layout, turning.inside, turning.outside, open);
  model.style.opacity = shown < 1 ? String(shown) : "";
  for (const glued of [turning.inner, turning.outer]) {
    const facing = quad && glued.pane === pane ? quad : null;
    const picture = facing && shotPicture(shots, glued.pane, facing);
    const rect = { x: 0, y: 0, ...glued.size };
    const seen = facing && picture && quadMap(rect, quadFacing(local(turning, shotWindow(facing, glued.pane, picture)), layout.across));
    glued.node.style.visibility = seen ? "" : "hidden";
    if (!seen || !picture) continue;
    // The page stays still and flat behind the turned screen, dark where the screen reaches past it.
    glued.node.style.clipPath = `path("${roundedPath(rect, glued.radii, seen)}")`;
    const { x, y } = turning.corner;
    glued.picture.style.transform = flatMatrix(glued.size, { ...picture, x: picture.x - x, y: picture.y - y }, layout.across);
    glued.rim.style.opacity = String(lift);
    light(glued, open);
  }
}

/** Corners in the render, from where the planes and windows lie in it. */
function local(turning: Shots, corners: Quad): Quad {
  const { x, y } = turning.corner;
  const [a, b, c, d] = corners.map(([px, py]): readonly [number, number] => [px - x, py - y]);
  return a && b && c && d ? [a, b, c, d] : corners;
}

/**
 * The planes to draw `from` on, under, and `to` over it, drawing either
 * only where its plane does not hold it already: a plane keeps its frame as
 * the hinge goes on to the next.
 */
function planesFor(turning: Shots, from: FoldShot, to: FoldShot): [Plane, Plane] {
  const [first, second] = turning.planes;
  const under = second.shot === from || first.shot === to ? second : first;
  const over = under === first ? second : first;
  if (under.shot !== from) drawShot(turning, under, from);
  if (from !== to && over.shot !== to) drawShot(turning, over, to);
  under.canvas.style.zIndex = "0";
  over.canvas.style.zIndex = "1";
  return [under, over];
}

/** Lay the frame a plane holds onto `quad`, its screen of `pane` corner on corner, or as it was rendered. */
function layShot(turning: Shots, plane: Plane, pane: Pane | null, quad: Quad | null): void {
  const { shot } = plane;
  const laid = shot && pane && quad ? quadToQuad(local(turning, shotQuad(shot, pane)), local(turning, quad)) : null;
  plane.canvas.style.transform = laid ?? "";
}

/** Draw a frame's pieces on a plane, where they lie on it, in place of what was there. */
function drawShot(turning: Shots, plane: Plane, shot: FoldShot): void {
  const { corner, shots } = turning;
  const { pen, canvas } = plane;
  plane.shot = shot;
  pen.clearRect(0, 0, canvas.width, canvas.height);
  const bitmap = turning.bitmaps[shots.frames.indexOf(shot)];
  if (!bitmap) return;
  const x = Math.round((shot.box[0] - corner.x) * shots.scale);
  const y = Math.round((shot.box[1] - corner.y) * shots.scale);
  for (const [left, top, width, height, fileX, fileY] of shot.pieces) {
    pen.drawImage(bitmap, fileX, fileY, width, height, x + left, y + top, width, height);
  }
}

/** Draw the fold with the hinge where it has got to. */
function show(going: Going): void {
  const found = going.waiting ? foldShots() : null;
  // The frames came in as it folds: they take over from the copies, once.
  if (found) {
    going.waiting = false;
    const { open, closed } = going.faces;
    going.parts.layer.remove();
    going.parts = build(going.scene, going.layout, open, closed, going.pictures, found);
  }
  const { layout, parts, unit, scene } = going;
  const { open } = going;
  const frame = foldFrame(layout, open);
  const hand = handOver(open, unit.posture, spanOf(going));
  const { x, y, scale } = frame.place;
  parts.place.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
  const { turning } = parts;
  if ("model" in turning) pose(turning, layout, open, frame.lift, 1 - hand);
  else {
    stand(turning.inner, layout, frame, frame.inner, open, 1 - hand);
    stand(turning.outer, layout, frame, frame.outer, open, 1 - hand);
    turning.bend.style.opacity = String(frame.lift);
  }
  // As the half that turns shows it, faded as it is.
  parts.still.style.visibility = frame.inner ? "" : "hidden";
  parts.still.style.opacity = String(frame.lift * (1 - hand));
  // The frame's own device moves with the fold, its folded body onto where it lies shut.
  const opened = unit.posture === "open";
  const own = opened ? layout.unfolded.scale : layout.folded.scale;
  const to = opened ? { x, y } : { x: x + layout.shut.x * scale, y: y + layout.shut.y * scale };
  const by = { x: to.x - unit.corner.x, y: to.y - unit.corner.y };
  scene.unit.style.transform = `translate(${by.x}px, ${by.y}px) scale(${(unit.base * scale) / own})`;
  // Open, only the half that stays shows, till the copy of the other fades into it. It
  // goes a px of the screen under the inside of the copy, while that shows, so
  // their edges at the hinge leave no seam.
  const under = frame.inner ? 1 : 0;
  const hinge = ((layout.hinge + (layout.across ? -under : under)) * own) / unit.base;
  const far = 1e5;
  const rest = layout.across
    ? `polygon(${hinge}px -${far}px, ${far}px -${far}px, ${far}px ${far}px, ${hinge}px ${far}px)`
    : `polygon(-${far}px -${far}px, ${far}px -${far}px, ${far}px ${hinge}px, -${far}px ${hinge}px)`;
  scene.unit.style.clipPath = opened && hand === 0 ? rest : "";
  darken(scene.cover, screenDim(opened ? "inner" : "cover", open));
}

/** Take the fold's layer away, and leave the frame's own device as it is drawn. */
function clear(last: Going): void {
  window.cancelAnimationFrame(last.frame);
  last.parts.layer.remove();
  last.scene.unit.style.clipPath = "";
  darken(last.scene.cover, 0);
  if (last.duo) releaseFoldShots(SHOTS_KEPT);
}

/** The fold is over: the device is drawn the way the knobs say, and the layer goes in the same frame. */
function land(): void {
  const last = fold;
  fold = null;
  if (!last) return;
  last.draw(last.values[last.target === 1 ? "open" : "closed"]);
  clear(last);
}

/**
 * Step the hinge sixty times a second from the click's next frame, its first
 * step drawn then, till it lands. A frame between two steps draws it between
 * them, so it moves as smoothly at any rate.
 */
function swing(going: Going): void {
  const tick = (now: number) => {
    if (fold !== going) return;
    going.begin ??= now;
    const due = slowed(now - going.begin, going.slow) / HINGE_STEP + 1;
    const steps = Math.floor(due);
    going.hinge = hingeAfter(going.hinge, going.target, steps - going.steps);
    going.steps = Math.max(going.steps, steps);
    if (hingeStill(going.hinge, going.target)) {
      land();
      return;
    }
    const next = hingeStep(going.hinge, going.target).position;
    going.open = lerp(going.hinge.position, next, due - steps);
    sync(going);
    show(going);
    going.frame = window.requestAnimationFrame(tick);
  };
  going.frame = window.requestAnimationFrame(tick);
}

/**
 * Fold the device drawn as `from` to the posture `value` has, in view, and
 * `draw` the knobs once it is there. A fold back while it folds goes back
 * from where it got to, as fast as it was going. Without a scene or a place
 * to go, the knobs are drawn at once.
 */
export function foldDevice(
  from: ViewportValue,
  value: ViewportValue,
  scene: FoldScene | null,
  draw: (value: ViewportValue) => void,
): void {
  const going = fold;
  if (going) {
    going.target = openOf(value.posture);
    going.values[value.posture] = value;
    going.open = going.hinge.position;
    sync(going);
    show(going);
    return;
  }
  const to = scene?.screenFor(value);
  if (!scene || !to) {
    draw(value);
    return;
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
  const before = pictureOf(scene, now.size, color, copy);
  draw(value);
  const after = pictureOf(scene, next.size, color, copy);
  draw(from);
  const closed = opening ? now : next;
  const open = opening ? next : now;
  const layout = foldLayout(closed, open, across);
  // The fold's frames are the Duo's, drawn to go with its bezels, which a body has once they have loaded.
  const duo = [open, closed].every((side) => side.body?.image?.file.startsWith("iphone-duo-"));
  const pictures = opening ? { open: after, closed: before } : { open: before, closed: after };
  const values = { [from.posture]: from, [value.posture]: value } as Record<PostureValue, ViewportValue>;
  if (duo) decodeFoldShots();
  const parts = build(scene, layout, open, closed, pictures, duo ? foldShots() : null);
  fold = {
    scene,
    layout,
    faces: { open, closed },
    pictures,
    duo,
    waiting: duo && !("model" in parts.turning),
    hinge: { position: openOf(from.posture), velocity: 0 },
    open: openOf(from.posture),
    target: openOf(value.posture),
    values,
    frame: 0,
    begin: null,
    slow: slowness(),
    steps: 0,
    parts,
    unit: measure(scene, from.posture),
    draw,
  };
  show(fold);
  swing(fold);
}

/** The fold goes on, and the frame takes these knobs once it is there. */
export function holdFold(value: ViewportValue): void {
  if (fold) fold.values[value.posture] = value;
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
  if (fold) window.cancelAnimationFrame(fold.frame);
  fold = null;
  forgetShots();
  releaseFoldShots();
}
