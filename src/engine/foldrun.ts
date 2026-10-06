import type { PostureValue } from "../types";
import { bezelUrl } from "./bezels";
import {
  blurShares,
  FOLD_EDGE,
  foldFrame,
  type FoldLayout,
  foldLayout,
  foldLight,
  type FoldSide,
  HAND_OVER,
  handOver,
  type Hinge,
  HINGE_STEP,
  hingeAfter,
  hingeStep,
  hingeStill,
  openOf,
} from "./fold";
import type { Mock, Rect } from "./mock";
import { corners, drawMock, UNDER } from "./mockdraw";
import { lerp } from "./morph";
import { blurPictures, copyPage, paintPage, shootPage } from "./pageshot";
import { coverTo, darken, type TurnScene } from "./turnrun";
import type { ViewportValue } from "./width";

/**
 * Folds a foldable open or shut in view, as the phone does, from the click's
 * next frame. The frame's own device stays live and sharp: open, as the half
 * of it that stays, and shut, for the last of the way there. A copy of the
 * half that turns, with a picture of the page on its screen drawn once and
 * blurred as a few ever softer layers, turns about the hinge on a layer over
 * it, and the hinge's spring sets how far it has turned, how dim the screens
 * are and how blurred the copy is. Close to shut and to open the copy fades
 * into the device. Each frame changes only transforms and opacities. What it
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

/** A copy of one side of the half that turns: the pictures of the page on its screen, and its shades. */
interface Leaf {
  node: HTMLElement;
  /** Its screen, which fades to let the frame's own show through its body. */
  screen: HTMLElement;
  /** The page, and the same blurred more and more toward the free edge. */
  pictures: HTMLElement[];
  edge: HTMLElement;
  dim: HTMLElement;
  /** How the blurrier pictures fade in toward the free edge. */
  ramp: string;
  /** The screen's css width. */
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

/** Fill the screen it is in, under what goes over it. */
function fill(node: HTMLElement): HTMLElement {
  node.style.position = "absolute";
  node.style.inset = "0";
  node.style.width = "100%";
  node.style.height = "100%";
  return node;
}

/** Put `shot` on a leaf's screen, and the same blurred over it, as much as was shown before. */
function paintLeaf(leaf: Leaf, shot: HTMLCanvasElement): void {
  const next = [shot, ...blurPictures(shot, leaf.width)].map(fill);
  next.forEach((picture, index) => {
    if (index === 0) return;
    picture.style.opacity = leaf.pictures[index]?.style.opacity || "0";
    picture.style.maskImage = leaf.ramp;
    picture.style.setProperty("-webkit-mask-image", leaf.ramp);
  });
  for (const last of leaf.pictures) last.remove();
  // Under the bars and the shades.
  leaf.edge.parentElement?.prepend(...next);
  leaf.pictures = next;
}

/**
 * A copy of a side's body around its screen, in the screen's css px, as the
 * frame draws it. On its screen is the page, `shot`, and over it the same
 * blurred more and more toward the free edge, `toward` it from the hinge,
 * which is `reach` percent of the way across, the browser's `bars`, then the shade
 * there, and the dark the screen goes.
 */
function leafOf(side: Face, color: string, picture: Picture, toward: string, reach: number): Leaf {
  const { body, size, href } = side;
  const node = div("face");
  node.style.width = `${body?.width ?? size.width}px`;
  node.style.height = `${body?.height ?? size.height}px`;
  const blank = div("");
  blank.style.left = `${body?.inset.left ?? 0}px`;
  blank.style.top = `${body?.inset.top ?? 0}px`;
  blank.style.width = `${size.width}px`;
  blank.style.height = `${size.height}px`;
  blank.style.background = color;
  blank.style.overflow = "hidden";
  if (body) blank.style.borderRadius = corners(body.screenRadius).map((r) => `${r}px`).join(" ");
  if (href) blank.style.boxShadow = `0 0 0 ${UNDER}px #000`;
  const edge = fill(div(""));
  edge.style.background = `linear-gradient(${toward}, rgba(0, 0, 0, ${FOLD_EDGE}), transparent ${reach}%)`;
  const dim = fill(div(""));
  dim.style.background = "#000";
  if (picture.bars) blank.append(picture.bars);
  blank.append(edge, dim);
  node.append(blank);
  // Blurred all the way over the third of it nearest the free edge.
  const ramp = `linear-gradient(${toward}, #000 ${reach / 3}%, transparent ${reach}%)`;
  const leaf = { node, screen: blank, pictures: [], edge, dim, ramp, width: size.width };
  if (picture.shot) paintLeaf(leaf, picture.shot);
  // The page as the browser draws it, once it has, over the rough one.
  void picture.painted?.then((shot) => {
    if (shot && leaf.node.isConnected) paintLeaf(leaf, shot);
  });
  if (body) {
    const drawing = drawMock(body, size, href);
    drawing.style.width = "100%";
    drawing.style.height = "100%";
    node.append(drawing);
  }
  return leaf;
}

/** How wide the bend shows each side of the hinge, in css px of the open screen. */
const BEND = 14;

/**
 * Put the copies of the half that turns over the frame's own device: its
 * inside, `inner` on its screen, and its outside, the folded body, `outer`.
 */
function build(scene: FoldScene, layout: FoldLayout, open: Face, closed: Face, pictures: Pictures): Layer {
  const color = scene.background();
  const layer = div("fold");
  const place = div("");
  const across = layout.across;
  const inner = leafOf(open, color, pictures.open, across ? "to right" : "to top", 50);
  inner.node.style.clipPath = layout.clip;
  inner.node.style.transformOrigin = layout.origins.inner;
  // A crease down the hinge, in the screen it bends.
  const bend = div("");
  const screen = inner.screen;
  const inset = open.body?.inset ?? { left: 0, top: 0 };
  const at = layout.hinge - (across ? inset.left : inset.top) - BEND;
  bend.style.position = "absolute";
  bend.style.left = across ? `${at}px` : "0";
  bend.style.top = across ? "0" : `${at}px`;
  bend.style.width = across ? `${2 * BEND}px` : "100%";
  bend.style.height = across ? "100%" : `${2 * BEND}px`;
  const shade = "transparent, rgba(0, 0, 0, 0.3) 50%, transparent";
  bend.style.background = `linear-gradient(${across ? "to right" : "to bottom"}, ${shade})`;
  screen.append(bend);
  const outer = leafOf(closed, color, pictures.closed, across ? "to left" : "to bottom", 100);
  outer.node.style.left = `${layout.shut.x}px`;
  outer.node.style.top = `${layout.shut.y}px`;
  outer.node.style.transformOrigin = layout.origins.outer;
  place.append(inner.node, outer.node);
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

/**
 * Show a copy of a side of the half that turns as it stands, blurred, shaded
 * and dimmed as much, its screen `shown` of the way over the frame's own.
 */
function stand(leaf: Leaf, transform: string | null, blur: number, edge: number, dim: number, shown: number): void {
  leaf.node.style.visibility = transform ? "" : "hidden";
  if (!transform) return;
  leaf.node.style.transform = transform;
  // Its body stays whole, so nothing behind the device shows through it.
  leaf.screen.style.opacity = shown < 1 ? String(shown) : "";
  const shares = blurShares(blur);
  leaf.pictures.slice(1).forEach((layer, index) => {
    layer.style.opacity = String(shares[index] ?? 0);
  });
  leaf.edge.style.opacity = String(edge);
  leaf.dim.style.opacity = String(dim);
}

/** Draw the fold with the hinge where it has got to. */
function show(going: Going): void {
  const { layout, parts, unit, scene } = going;
  const { open } = going;
  const frame = foldFrame(layout, open);
  const light = foldLight(open);
  const hand = handOver(open, unit.posture);
  const { x, y, scale } = frame.place;
  parts.place.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
  stand(parts.inner, frame.inner, light.blur, light.edge, light.dim, 1 - hand);
  stand(parts.outer, frame.outer, light.coverBlur, light.coverEdge, light.coverDim, 1 - hand);
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
  darken(scene.cover, opened ? light.dim : light.coverDim);
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
    const due = (now - going.begin) / HINGE_STEP + 1;
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
}
