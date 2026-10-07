import type { PostureValue } from "../types";
import { bezelUrl } from "./bezels";
import {
  type BlurFade,
  type FoldFrame,
  foldFrame,
  type FoldLayout,
  foldLayout,
  type FoldSide,
  HAND_OVER,
  handOver,
  type Hinge,
  HINGE_STEP,
  hingeAfter,
  hingeStep,
  hingeStill,
  openOf,
  outline,
  type Pane,
  paneLook,
  type Point,
  RIM,
  screenDim,
  seenAt,
} from "./fold";
import type { Mock, Rect } from "./mock";
import { corners, drawMock, UNDER } from "./mockdraw";
import { lerp } from "./morph";
import { blurPictures, copyPage, forgetShots, paintPage, shootPage } from "./pageshot";
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

/** One side of a fold as it is drawn: its body, and the picture of it that has loaded. */
interface Face extends FoldSide {
  body: Mock | null;
  href: string | null;
}

/** A copy of one side of the half that turns, and the window onto the page its screen is. */
interface Leaf {
  pane: Pane;
  /** The copy of the body, turned. */
  node: HTMLElement;
  /** Its screen, dark where the window does not reach. */
  screen: HTMLElement;
  /** The part of the screen that turns, as it lies flat, cut to where the turned one is seen. */
  window: HTMLElement;
  /** The screen as it lies in the window: the pictures of the page and the browser's bars. */
  stage: HTMLElement;
  /** The page, and the same blurred more and more. */
  pictures: HTMLElement[];
  /** The dark its ends along the hinge go toward as the half stands. */
  rim: HTMLElement;
  /** The dark of the picture as it lies, and, turned with the body over the window, of the screen. */
  flat: HTMLElement;
  veil: HTMLElement;
  shade: HTMLElement;
  /** The way from the hinge to the free edge, as a gradient goes, and where the two are on the stage, in percent. */
  toward: string;
  span: [number, number];
  /** The outline of the part that turns, and the point it turns about, in the body's css px. */
  outline: Point[];
  pivot: Point;
  /** Where the window's top left is in the body's css px. */
  corner: Point;
  /** The screen's css px across the hinge, and its width. */
  extent: number;
  width: number;
}

/** The layer a fold is drawn on, the fold's place on it, the half that turns, and the bend at the hinge. */
interface Layer {
  layer: HTMLElement;
  place: HTMLElement;
  inner: Leaf;
  outer: Leaf;
  bend: HTMLElement;
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

function div(className: string): HTMLElement {
  const node = document.createElement("div");
  node.className = className;
  return node;
}

/** Fill the box it is in. */
function fill(node: HTMLElement): HTMLElement {
  node.style.position = "absolute";
  node.style.inset = "0";
  node.style.width = "100%";
  node.style.height = "100%";
  return node;
}

/** Put a node at `rect`, in its parent's css px. */
function placeAt(node: HTMLElement, rect: Rect): HTMLElement {
  node.style.position = "absolute";
  node.style.left = `${rect.x}px`;
  node.style.top = `${rect.y}px`;
  node.style.width = `${rect.width}px`;
  node.style.height = `${rect.height}px`;
  return node;
}

/** Put `shot` on a leaf's stage, and the same blurred over it, as much as was shown before. */
function paintLeaf(leaf: Leaf, shot: HTMLCanvasElement): void {
  const next = [shot, ...blurPictures(shot, leaf.width)].map(fill);
  next.forEach((picture, index) => {
    const last = leaf.pictures[index];
    if (index === 0 || !last) return;
    picture.style.opacity = last.style.opacity;
    picture.style.maskImage = last.style.maskImage;
    picture.style.setProperty("-webkit-mask-image", last.style.maskImage);
  });
  for (const last of leaf.pictures) last.remove();
  // Under the bars.
  leaf.stage.prepend(...next);
  leaf.pictures = next;
}

/** The screen of a side's body, where it is in the body, and its corners. */
function screenOf(side: Face): { rect: Rect; radii: number[] } {
  const { body, size } = side;
  const rect = { x: body?.inset.left ?? 0, y: body?.inset.top ?? 0, ...size };
  return { rect, radii: body ? corners(body.screenRadius) : [0, 0, 0, 0] };
}

/** The part of a side's screen that turns, and the way from its hinge to its free edge. */
interface Turning {
  pane: Pane;
  /** Where it is in the body, and its corners, square at the hinge. */
  rect: Rect;
  radii: number[];
  toward: string;
  /** Where the hinge and the free edge are along `toward` on the whole screen, in percent. */
  span: [number, number];
  pivot: Point;
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
  const { rect: whole } = screenOf(side);
  const { rect } = turning;
  const screen = placeAt(div(""), whole);
  screen.style.background = "#000";
  if (body) screen.style.borderRadius = corners(body.screenRadius).map((r) => `${r}px`).join(" ");
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
  const stage = placeAt(div(""), { ...whole, x: whole.x - rect.x, y: whole.y - rect.y });
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
    outline: outline(rect, turning.radii),
    pivot: turning.pivot,
    corner: { x: rect.x, y: rect.y },
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

/** How wide the bend shows each side of the hinge, in css px of the open screen. */
const BEND = 14;

/**
 * Put the copies of the half that turns over the frame's own device: its
 * inside, the open screen's half, `inner`, and its outside, the folded body,
 * `outer`, each with the window its screen is.
 */
function build(scene: FoldScene, layout: FoldLayout, open: Face, closed: Face, pictures: Pictures): Layer {
  const layer = div("fold");
  const place = div("");
  const { across, hinge, pivots } = layout;
  const inside = screenOf(open);
  const [topLeft = 0, topRight = 0, bottomRight = 0, bottomLeft = 0] = inside.radii;
  const half = across
    ? { ...inside.rect, width: hinge - inside.rect.x }
    : { ...inside.rect, y: hinge, height: inside.rect.y + inside.rect.height - hinge };
  const inner = leafOf(
    open,
    pictures.open,
    {
      pane: "inner",
      rect: half,
      radii: across ? [topLeft, 0, 0, bottomLeft] : [0, 0, bottomRight, bottomLeft],
      toward: across ? "to left" : "to bottom",
      span: [50, 100],
      pivot: pivots.inner,
    },
    across,
  );
  const outside = screenOf(closed);
  const outer = leafOf(
    closed,
    pictures.closed,
    {
      pane: "cover",
      rect: outside.rect,
      radii: outside.radii,
      toward: across ? "to right" : "to top",
      span: [0, 100],
      pivot: pivots.outer,
    },
    across,
  );
  for (const node of [inner.node, inner.veil]) {
    node.style.clipPath = layout.clip;
    node.style.transformOrigin = layout.origins.inner;
  }
  for (const node of [outer.node, outer.window, outer.veil]) {
    node.style.left = `${layout.shut.x + (node === outer.window ? outside.rect.x : 0)}px`;
    node.style.top = `${layout.shut.y + (node === outer.window ? outside.rect.y : 0)}px`;
  }
  outer.node.style.transformOrigin = layout.origins.outer;
  outer.veil.style.transformOrigin = layout.origins.outer;
  // A crease down the hinge, in the screen it bends.
  const bend = div("");
  bend.style.position = "absolute";
  bend.style.left = across ? `${hinge - BEND}px` : `${inside.rect.x}px`;
  bend.style.top = across ? `${inside.rect.y}px` : `${hinge - BEND}px`;
  bend.style.width = across ? `${2 * BEND}px` : `${inside.rect.width}px`;
  bend.style.height = across ? `${inside.rect.height}px` : `${2 * BEND}px`;
  const shade = "transparent, rgba(0, 0, 0, 0.3) 50%, transparent";
  bend.style.background = `linear-gradient(${across ? "to right" : "to bottom"}, ${shade})`;
  inner.veil.append(bend);
  place.append(inner.node, inner.window, inner.veil, outer.node, outer.window, outer.veil);
  layer.append(place);
  scene.place(layer);
  return { layer, place, inner, outer, bend };
}

/**
 * The page as laid out on a screen: a rough picture of it now, or null where
 * it is out of reach, the one the browser draws once it has, and a copy of
 * the browser's bars around it.
 */
interface Picture {
  shot: HTMLCanvasElement | null;
  painted: Promise<HTMLCanvasElement | null> | null;
  bars: HTMLElement | null;
}

/** Pictures of the page as laid out on each screen. */
interface Pictures {
  open: Picture;
  closed: Picture;
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

/** A gradient from the hinge to the free edge through the shares of dark `shades`, evenly spaced. */
function shading(toward: string, shades: number[]): string {
  const last = Math.max(1, shades.length - 1);
  const stops = shades.map((dark, index) => `rgba(0, 0, 0, ${dark}) ${Math.round((index / last) * 1000) / 10}%`);
  return `linear-gradient(${toward}, ${stops.join(", ")})`;
}

/** Where a share `t` of the way from the hinge to the free edge is on a leaf's stage, in percent. */
function onStage(leaf: Leaf, t: number): number {
  const [hinge, free] = leaf.span;
  return Math.round((hinge + (free - hinge) * t) * 100) / 100;
}

/** Show a blurrier picture as `fade` has it, faded in along the stage. */
function blurTo(leaf: Leaf, picture: HTMLElement, fade: BlurFade | null): void {
  picture.style.opacity = fade ? "" : "0";
  if (!fade) return;
  const mask = `linear-gradient(${leaf.toward}, transparent ${onStage(leaf, fade.from)}%, rgba(0, 0, 0, ${fade.most}) ${onStage(leaf, fade.to)}%)`;
  picture.style.maskImage = mask;
  picture.style.setProperty("-webkit-mask-image", mask);
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
  // The window shows the flat picture only where the turned screen is seen.
  const { corner, pivot } = leaf;
  const points = leaf.outline.map((point) => {
    const seen = seenAt(point, pivot, frame.degrees, layout.across, layout.depth);
    return `${Math.round((seen.x - corner.x) * 100) / 100}px ${Math.round((seen.y - corner.y) * 100) / 100}px`;
  });
  leaf.window.style.clipPath = `polygon(${points.join(", ")})`;
  leaf.rim.style.opacity = String(frame.lift);
  const look = paneLook(leaf.pane, open, leaf.extent);
  leaf.shade.style.background = shading(leaf.toward, look.turned);
  leaf.flat.style.background = shading(leaf.toward, look.flat);
  leaf.pictures.slice(1).forEach((picture, index) => blurTo(leaf, picture, look.blurs[index] ?? null));
  // Its body stays whole, so nothing behind the device shows through it.
  const fade = shown < 1 ? String(shown) : "";
  leaf.screen.style.opacity = fade;
  leaf.window.style.opacity = fade;
  leaf.veil.style.opacity = fade;
}

/** Draw the fold with the hinge where it has got to. */
function show(going: Going): void {
  const { layout, parts, unit, scene } = going;
  const { open } = going;
  const frame = foldFrame(layout, open);
  const hand = handOver(open, unit.posture);
  const { x, y, scale } = frame.place;
  parts.place.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
  stand(parts.inner, layout, frame, frame.inner, open, 1 - hand);
  stand(parts.outer, layout, frame, frame.outer, open, 1 - hand);
  parts.bend.style.opacity = String(frame.lift);
  // The frame's own device moves with the fold, its folded body onto where it lies shut.
  const opened = unit.posture === "open";
  const own = opened ? layout.unfolded.scale : layout.folded.scale;
  const to = opened ? { x, y } : { x: x + layout.shut.x * scale, y: y + layout.shut.y * scale };
  const by = { x: to.x - unit.corner.x, y: to.y - unit.corner.y };
  scene.unit.style.transform = `translate(${by.x}px, ${by.y}px) scale(${(unit.base * scale) / own})`;
  // Open, only the half that stays shows, till the copy of the other fades into it.
  const hinge = (layout.hinge * own) / unit.base;
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
  const pictures = opening ? { open: after, closed: before } : { open: before, closed: after };
  const values = { [from.posture]: from, [value.posture]: value } as Record<PostureValue, ViewportValue>;
  fold = {
    scene,
    layout,
    hinge: { position: openOf(from.posture), velocity: 0 },
    open: openOf(from.posture),
    target: openOf(value.posture),
    values,
    frame: 0,
    begin: null,
    slow: slowness(),
    steps: 0,
    parts: build(scene, layout, open, closed, pictures),
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
}
