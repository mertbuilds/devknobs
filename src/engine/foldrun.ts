import type { PostureValue } from "../types";
import { bezelUrl, decodeFoldShots, endFoldShots, foldShots } from "./bezels";
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
  type Point,
  type Quad,
  quadFacing,
  quadMap,
  quadToQuad,
  RIM,
  roundedPath,
  screenDim,
  seenAt,
  SHOTS_HAND_OVER,
  shotPicture,
  shotPose,
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
  /** Dark, over every frame in the render, cut a little past the turned screen's outline, under the case, so no edge of it lets the mat through. */
  node: HTMLElement;
  /** The window in it, cut to the turned screen's outline. */
  cut: HTMLElement;
  /** The part that turns as it lies, in its own css px, laid flat where the page is seen, and its corners. */
  picture: HTMLElement;
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
  /** The dark of each frame's screen, under the windows, where it is laid off them near edge on. */
  holes: [HTMLElement, HTMLElement];
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
  /** Does a hand hold the hinge, and the posture the knobs hold, which it lands in let go between the ends? */
  held: boolean;
  home: PostureValue;
  /** Does the hinge go where a hand sent it, not where the knobs did? */
  hand: boolean;
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
  const cut = fill(div(""));
  node.append(cut);
  const flatly = placeAt(div(""), { ...rect, x: 0, y: 0 });
  flatly.style.transformOrigin = "0 0";
  // Cut at the hinge, but not at the ends along it, where the blurs spread the picture into the dark past it.
  flatly.style.overflowX = across ? "clip" : "visible";
  flatly.style.overflowY = across ? "visible" : "clip";
  const stage = placeAt(div(""), { ...whole.rect, x: whole.rect.x - rect.x, y: whole.rect.y - rect.y });
  if (picture.bars) stage.append(picture.bars);
  // Their dark goes over what the blurs spread past the ends too.
  const darkening = () => {
    const node = fill(div(""));
    node.style[across ? "top" : "left"] = "-100%";
    node.style[across ? "height" : "width"] = "300%";
    return node;
  };
  const flat = darkening();
  const shade = darkening();
  flatly.append(stage, flat, shade);
  cut.append(flatly);
  const glued: Glued = {
    pane: turning.pane,
    node,
    cut,
    picture: flatly,
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
    across,
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
    return { canvas, pen, shot: null };
  };
  const under = plane();
  const over = plane();
  if (!under || !over) return null;
  const sides = turningOf(layout, open, closed);
  const model = div("");
  const box = { x: left, y: top, width: right - left, height: bottom - top };
  const inner = gluedOf(open, pictures.open, sides.inner, layout.across, box);
  const outer = gluedOf(closed, pictures.closed, sides.outer, layout.across, box);
  inner.shade.after(creaseOf(layout, open, true, sides.inner.rect));
  const frames = div("");
  frames.style.position = "absolute";
  frames.append(under.canvas, over.canvas);
  const hole = () => {
    const node = placeAt(div(""), box);
    node.style.background = "#000";
    node.style.visibility = "hidden";
    return node;
  };
  const holes: [HTMLElement, HTMLElement] = [hole(), hole()];
  model.append(...holes, inner.node, outer.node, frames);
  const { rect } = screenOf(closed);
  return {
    shots,
    model,
    planes: [under, over],
    holes,
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
 * Show the frames either side of the hinge's angle, `open` of the way open,
 * the more open one and the next over it, the one faded in and the other
 * out as the hinge goes from one to the other, laid on the fold, and the screen that faces the viewer a
 * window onto the page lying flat, its corners as far between the two
 * frames', the whole of it `shown` of the way over the frame's own device.
 * Each frame is laid onto the corners between from its own, as `shotPose`
 * has it, so the two outlines meet and the case never shows twice.
 */
function pose(turning: Shots, layout: FoldLayout, open: number, shown: number): void {
  const { shots, model } = turning;
  const posed = shotPose(shots, open);
  if (!posed) return;
  const { from, to, share, lay, pane, quad, holes } = posed;
  const [under, over] = planesFor(turning, from, to);
  layShot(turning, under, lay.from, lay.onto);
  // The next fades in over the one under in the first half of the way, which fades out in the second, so where
  // the two meet the case is whole all the way, and where they part neither comes or goes at once.
  const fade = (value: number) => (value >= 1 ? "" : String(Math.round(Math.max(0, value) * 1000) / 1000));
  under.canvas.style.opacity = fade(from === to ? 1 : 2 * (1 - share));
  over.canvas.style.opacity = fade(from === to ? 0 : 2 * share);
  if (from !== to) layShot(turning, over, lay.to, lay.onto);
  holes.forEach((hole, index) => {
    const node = turning.holes[index];
    if (!node) return;
    node.style.visibility = hole && (index === 0 || from !== to) ? "" : "hidden";
    if (hole) node.style.clipPath = `path("${outline(local(turning, hole))}")`;
    // Each as its frame shows.
    node.style.opacity = (index === 0 ? under : over).canvas.style.opacity;
  });
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
    glued.cut.style.clipPath = `path("${roundedPath(rect, glued.radii, seen)}")`;
    glued.node.style.clipPath = `path("${roundedPath(bled(rect, glued.pane, layout.across, seen), bledRadii(glued.radii), seen)}")`;
    const { x, y } = turning.corner;
    glued.picture.style.transform = flatMatrix(glued.size, { ...picture, x: picture.x - x, y: picture.y - y }, layout.across);
    light(glued, open);
  }
}

/** A quad as css path data. */
function outline(quad: Quad): string {
  return `${quad.map(([x, y], index) => `${index ? "L" : "M"}${Math.round(x * 100) / 100} ${Math.round(y * 100) / 100}`).join("")}Z`;
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

/** Lay the frame a plane holds from its corners `own` onto `onto`, or as it was rendered where either is edge on. */
function layShot(turning: Shots, plane: Plane, own: Quad, onto: Quad): void {
  const laid = plane.shot ? quadToQuad(local(turning, own), local(turning, onto)) : null;
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
  if ("model" in turning) pose(turning, layout, open, 1 - hand);
  else {
    stand(turning.inner, layout, frame, frame.inner, open, 1 - hand);
    stand(turning.outer, layout, frame, frame.outer, open, 1 - hand);
    turning.bend.style.opacity = String(frame.lift);
  }
  // As the half that turns shows it, faded as it is. Under the frames it may go on past a right angle, so it never goes at once.
  parts.still.style.visibility = frame.inner || "model" in turning ? "" : "hidden";
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
  for (const watcher of Array.from(hinges)) watcher(open, going.hand);
}

/** Take the fold's layer away, and leave the frame's own device as it is drawn. */
function clear(last: Going): void {
  window.cancelAnimationFrame(last.frame);
  window.removeEventListener("resize", settle);
  last.parts.layer.remove();
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
      if (!going.held && isEnd(going.target)) land();
      else rest(going);
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
    target: openOf((held ? from : value).posture),
    held,
    home: (held ? from : value).posture,
    hand: held,
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
  if (snap) going.hinge = { position: stop, velocity: 0 };
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
  if (fold) window.cancelAnimationFrame(fold.frame);
  window.removeEventListener("resize", settle);
  fold = null;
  for (const watcher of Array.from(watchers)) watcher();
  forgetShots();
  endFoldShots(true);
}
