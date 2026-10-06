import { bezelUrl } from "./bezels";
import {
  angleOf,
  blurOf,
  FOLD_BLUR,
  foldAt,
  foldBlurAt,
  foldFrame,
  type FoldLayout,
  foldLayout,
  type FoldSide,
  foldTime,
  type Leaf,
} from "./fold";
import type { Mock, Rect } from "./mock";
import { corners, drawMock, UNDER } from "./mockdraw";
import { pictureOf, shootPage } from "./pageshot";
import { coverShare, coverTo, type TurnScene, uncover, zoomOf } from "./turnrun";
import type { ViewportValue } from "./width";

/**
 * Folds a foldable open or shut in view, as the phone does. The page on the
 * screen blurs under a cover, a copy of each body with a rough picture of the
 * page blurred as much on its screen stands in for the device on a layer
 * over the mat, and the half that turns turns about the hinge as fold.ts lays
 * it out. The device is drawn the way it ends up in the same frame as the
 * fold's last, and the page laid out there sharpens. What it needs of the
 * frame comes in a `FoldScene`, so it holds no node of its own.
 */

/** What a foldable folding asks of the frame, as it starts. */
export interface FoldScene extends TurnScene {
  /** Put the layer the fold is drawn on over the mat, under the readout. */
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

/** The layer a fold is drawn on, the fold's place on it, and its three parts. */
interface Layer {
  layer: HTMLElement;
  place: HTMLElement;
  rest: HTMLElement;
  inner: HTMLElement;
  outer: HTMLElement;
}

/** A fold on its way: the hinge's angle now and where it goes, and what draws the device once there. */
interface Going {
  scene: FoldScene;
  layout: FoldLayout;
  closed: Face;
  open: Face;
  angle: number;
  target: number;
  frame: number;
  /** Counts the loops started, so a frame of one cut short draws nothing. */
  loop: number;
  /** A picture of the page as the fold started, or null where it is out of reach. */
  shot: HTMLCanvasElement | null;
  /** How many of the cover's px are a css px of the screen, which its blur is measured in. */
  blur: number;
  /** Null while the page blurs, before the fold stands in for the device. */
  parts: Layer | null;
  draw: (value: ViewportValue) => void;
}

let fold: Going | null = null;
/** The knobs a fold draws once it is there. */
let folded: ViewportValue | null = null;

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

/**
 * A side's body around its screen, in the screen's css px, as the frame draws
 * it. On its screen is `shot` stretched to it and blurred, or `color` alone.
 */
function faceOf(side: Face, color: string, shot: HTMLCanvasElement | null): HTMLElement {
  const { body, size, href } = side;
  const face = div("face");
  face.style.width = `${body?.width ?? size.width}px`;
  face.style.height = `${body?.height ?? size.height}px`;
  const blank = div("");
  blank.style.left = `${body?.inset.left ?? 0}px`;
  blank.style.top = `${body?.inset.top ?? 0}px`;
  blank.style.width = `${size.width}px`;
  blank.style.height = `${size.height}px`;
  blank.style.background = color;
  if (body) blank.style.borderRadius = corners(body.screenRadius).map((r) => `${r}px`).join(" ");
  if (href) blank.style.boxShadow = `0 0 0 ${UNDER}px #000`;
  // Drawn past the screen's edges, so its blur keeps the page's color right to them.
  const margin = 3 * FOLD_BLUR.radius;
  const picture = shot ? pictureOf(shot, size, margin) : null;
  if (picture) {
    blank.style.overflow = "hidden";
    picture.style.position = "absolute";
    picture.style.left = `${-margin}px`;
    picture.style.top = `${-margin}px`;
    picture.style.width = `${size.width + 2 * margin}px`;
    picture.style.height = `${size.height + 2 * margin}px`;
    picture.style.filter = blurOf(1);
    blank.append(picture);
  }
  face.append(blank);
  if (body) {
    const drawing = drawMock(body, size, href);
    drawing.style.width = "100%";
    drawing.style.height = "100%";
    face.append(drawing);
  }
  return face;
}

/** Put the fold over the mat in the device's place, and hide the device under it. */
function build(going: Going): Layer {
  const { scene, layout, open, closed, shot } = going;
  const color = scene.background();
  const layer = div("fold");
  const place = div("");
  const rest = faceOf(open, color, shot);
  rest.style.clipPath = layout.clips.rest;
  const inner = faceOf(open, color, shot);
  inner.style.clipPath = layout.clips.inner;
  inner.style.transformOrigin = layout.origins.inner;
  const outer = faceOf(closed, color, shot);
  outer.style.left = `${layout.shut.x}px`;
  outer.style.top = `${layout.shut.y}px`;
  outer.style.transformOrigin = layout.origins.outer;
  place.append(rest, inner, outer);
  layer.append(place);
  scene.place(layer);
  scene.unit.style.visibility = "hidden";
  return { layer, place, rest, inner, outer };
}

function stand(node: HTMLElement, leaf: Leaf | null): void {
  node.style.visibility = leaf ? "" : "hidden";
  if (!leaf) return;
  node.style.transform = leaf.transform;
  node.style.filter = leaf.shade < 1 ? `brightness(${leaf.shade})` : "";
}

/** Draw the fold at the angle it has got to. */
function show(going: Going): void {
  const parts = going.parts;
  if (!parts) return;
  const frame = foldFrame(going.layout, going.angle);
  parts.place.style.transform = frame.place;
  parts.rest.style.opacity = String(frame.rest);
  stand(parts.inner, frame.inner);
  stand(parts.outer, frame.outer);
}

/**
 * The fold is over: the device is drawn the way the knobs say, the layer goes
 * in the same frame, and the page sharpens, at once unless `lift`.
 */
function land(lift: boolean): void {
  const last = fold;
  fold = null;
  if (!last) return;
  window.cancelAnimationFrame(last.frame);
  const next = folded;
  folded = null;
  if (!lift) coverTo(last.scene.cover, 0);
  if (next) last.draw(next);
  last.parts?.layer.remove();
  last.scene.unit.style.visibility = "";
  if (lift) uncover();
}

/** Start a loop of `going`, which ends any it had: a frame of that one does nothing. */
function loop(going: Going): () => boolean {
  window.cancelAnimationFrame(going.frame);
  const mine = ++going.loop;
  return () => fold === going && going.loop === mine;
}

/** Turn the hinge to where the fold goes, a frame at a time, from where it got to. */
function swing(going: Going): void {
  const live = loop(going);
  const from = going.angle;
  const to = going.target;
  const time = foldTime(from, to);
  let begin: number | null = null;
  const step = (now: number) => {
    if (!live()) return;
    begin ??= now;
    const elapsed = now - begin;
    going.angle = foldAt(from, to, elapsed);
    show(going);
    if (elapsed < time) going.frame = window.requestAnimationFrame(step);
    else land(true);
  };
  going.frame = window.requestAnimationFrame(step);
}

/**
 * Blur the page, from as far as it is blurred, then let the fold stand in for
 * the device and turn. Turned back before then, the page sharpens again.
 */
function cover(going: Going): void {
  const live = loop(going);
  if (going.target === going.angle) {
    land(true);
    return;
  }
  const from = coverShare();
  let begin: number | null = null;
  const step = (now: number) => {
    if (!live()) return;
    begin ??= now;
    const share = foldBlurAt(from, now - begin);
    coverTo(going.scene.cover, share, going.blur);
    if (share < 1) {
      going.frame = window.requestAnimationFrame(step);
      return;
    }
    going.parts = build(going);
    show(going);
    swing(going);
  };
  going.frame = window.requestAnimationFrame(step);
}

/**
 * Fold the device drawn as `from` to the posture `value` has, in view, and
 * `draw` the knobs once it is there. A fold back while it folds goes back
 * from where it got to. Without a scene or a place to go, the knobs are drawn
 * at once.
 */
export function foldDevice(
  from: ViewportValue,
  value: ViewportValue,
  scene: FoldScene | null,
  draw: (value: ViewportValue) => void,
): void {
  folded = value;
  const going = fold;
  if (going) {
    going.target = angleOf(value.posture);
    if (going.parts) swing(going);
    else cover(going);
    return;
  }
  const to = scene?.screenFor(value);
  if (!scene || !to) {
    folded = null;
    draw(value);
    return;
  }
  const now = sideOf(scene, from, scene.screenRect());
  const next = sideOf(scene, value, to);
  const opening = value.posture === "open";
  const closed = opening ? now : next;
  const open = opening ? next : now;
  const across = (opening ? value : from).orientation === "landscape";
  scene.cover.style.background = "";
  // Over the bars too, which are laid out for the other screen as well.
  scene.glass.append(scene.cover);
  const shot = shootPage(scene.frame, scene.glass, now.size, scene.background());
  fold = {
    scene,
    layout: foldLayout(closed, open, across),
    closed,
    open,
    angle: angleOf(from.posture),
    target: angleOf(value.posture),
    frame: 0,
    loop: 0,
    shot,
    blur: zoomOf(scene),
    parts: null,
    draw,
  };
  cover(fold);
}

/** The fold goes on, and the frame takes these knobs once it is there. */
export function holdFold(value: ViewportValue): void {
  folded = value;
}

/** Land a fold where it goes, at once, the page sharp. */
export function finishFold(): void {
  land(false);
}

/** Stop a fold where it is, and show the device as it was drawn, the page sharp. */
export function stopFold(): void {
  const last = fold;
  fold = null;
  if (!last) return;
  window.cancelAnimationFrame(last.frame);
  last.parts?.layer.remove();
  last.scene.unit.style.visibility = "";
  coverTo(last.scene.cover, 0);
}

/** The frame is gone, and the knobs a fold would draw with it. */
export function forgetFold(): void {
  folded = null;
}
