import { type BarsKnobs, copyBars, type Drawn, withBars } from "./barshot";
import { type BlurFade, type FoldLayout, type FoldSide, freeShades, type Pane, paneLook, type Point } from "./fold";
import type { Mock, Rect } from "./mock";
import { corners } from "./mockdraw";
import { type ScreenGl, screenGl } from "./foldgl";
import type { Corners } from "./morph";
import { blurPictures, marginPlace, paintPage, shootPage } from "./pageshot";

/**
 * The page on the screens of a fold's half that turns, whichever way the
 * half is drawn: the pictures of it, where the part that turns is on each
 * side's screen, the bend down the hinge, and how the hinge lights and blurs
 * it. Shared by the copies and the frames, whose screens WebGL2 draws where it
 * can.
 */

/** One side of a fold as it is drawn: its body, and the picture of it that has loaded. */
export interface Face extends FoldSide {
  body: Mock | null;
  href: string | null;
}

/** The page on a screen of the half that turns: its pictures, lit and blurred as it turns. */
export interface Panel {
  pane: Pane;
  /** The screen as it lies: the pictures of the page and the browser's bars. */
  stage: HTMLElement;
  /** The page, and the same blurred more and more. */
  pictures: HTMLElement[];
  /** The dark of the picture as it lies, and of the screen as it turns. */
  flat: HTMLElement;
  shade: HTMLElement;
  /** The dark at the turned screen's free edge, where WebGL2 does not draw it. */
  edge: HTMLElement;
  /** The way from the hinge to the free edge, as a gradient goes, and where the two are on the stage, in percent. */
  toward: string;
  span: [number, number];
  /** The screen's css px across the hinge, and its width. */
  extent: number;
  width: number;
  /** Does the hinge run down the screen, so its ends along it are its top and bottom. */
  across: boolean;
}

export function div(className: string): HTMLElement {
  const node = document.createElement("div");
  node.className = className;
  return node;
}

/** Corners as a css border radius. */
export function round(radii: Corners): string {
  return radii.map((radius) => `${radius}px`).join(" ");
}

/** Fill the box it is in. */
export function fill(node: HTMLElement): HTMLElement {
  node.style.position = "absolute";
  node.style.inset = "0";
  node.style.width = "100%";
  node.style.height = "100%";
  return node;
}

/** Put a node at `rect`, in its parent's css px. */
export function placeAt(node: HTMLElement, rect: Rect): HTMLElement {
  node.style.position = "absolute";
  node.style.left = `${rect.x}px`;
  node.style.top = `${rect.y}px`;
  node.style.width = `${rect.width}px`;
  node.style.height = `${rect.height}px`;
  return node;
}

/** Put `shot` on a leaf's stage, and the same blurred over it, as much as was shown before. */
export function paintLeaf(leaf: Panel, shot: HTMLCanvasElement): void {
  const { across } = leaf;
  const blurred = blurPictures(shot, leaf.width, across);
  const next = [shot, ...blurred].map(fill);
  for (const picture of blurred) {
    // Its black past the ends along the hinge reaches past the screen's.
    const { start, size } = across ? marginPlace(shot.height, picture.height) : marginPlace(shot.width, picture.width);
    picture.style[across ? "top" : "left"] = `${start}%`;
    picture.style[across ? "height" : "width"] = `${size}%`;
    picture.style[across ? "bottom" : "right"] = "auto";
  }
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
export function screenOf(side: Face): { rect: Rect; radii: Corners } {
  const { body, size } = side;
  const rect = { x: body?.inset.left ?? 0, y: body?.inset.top ?? 0, ...size };
  return { rect, radii: body ? corners(body.screenRadius) : [0, 0, 0, 0] };
}

/** The part of a side's screen that turns, and the way from its hinge to its free edge. */
export interface Turning {
  pane: Pane;
  /** Where it is in the body, and its corners, square at the hinge. */
  rect: Rect;
  radii: Corners;
  toward: string;
  /** Where the hinge and the free edge are along `toward` on the whole screen, in percent. */
  span: [number, number];
  pivot: Point;
}

/** How wide the bend shows each side of the hinge, in css px of the open screen. */
const BEND = 14;

/** The two sides of the half that turns: the open screen's half, and the folded body's whole screen. */
export function turningOf(layout: FoldLayout, open: Face, closed: Face): { inner: Turning; outer: Turning } {
  const { across, hinge, pivots } = layout;
  const inside = screenOf(open);
  const [topLeft = 0, topRight = 0, bottomRight = 0, bottomLeft = 0] = inside.radii;
  const half = across
    ? { ...inside.rect, width: hinge - inside.rect.x }
    : { ...inside.rect, y: hinge, height: inside.rect.y + inside.rect.height - hinge };
  const outside = screenOf(closed);
  return {
    inner: {
      pane: "inner",
      rect: half,
      radii: across ? [topLeft, 0, 0, bottomLeft] : [0, 0, bottomRight, bottomLeft],
      toward: across ? "to left" : "to bottom",
      span: [50, 100],
      pivot: pivots.inner,
    },
    outer: {
      pane: "cover",
      rect: outside.rect,
      radii: outside.radii,
      toward: across ? "to right" : "to top",
      span: [0, 100],
      pivot: pivots.outer,
    },
  };
}

/**
 * A half of the crease down the hinge, in the open screen's body, darkest at
 * the hinge: on the half that turns, `turned`, or on the half that stays,
 * placed from `corner` of the body. Each meets the other there, the one on
 * the half that turns turned with it, so its edge at the hinge is not cut off
 * as it stands.
 */
export function creaseOf(layout: FoldLayout, open: Face, turned: boolean, corner: Point = { x: 0, y: 0 }): HTMLElement {
  const { across, hinge } = layout;
  const { rect } = screenOf(open);
  const before = across === turned;
  const from = before ? hinge - BEND : hinge;
  const node = placeAt(
    div(""),
    across
      ? { x: from - corner.x, y: rect.y - corner.y, width: BEND, height: rect.height }
      : { x: rect.x - corner.x, y: from - corner.y, width: rect.width, height: BEND },
  );
  const away = across ? (before ? "to left" : "to right") : before ? "to top" : "to bottom";
  node.style.background = `linear-gradient(${away}, rgba(0, 0, 0, 0.3), transparent)`;
  return node;
}

/**
 * The page as laid out on a screen: a rough picture of it now, or null where
 * it is out of reach, the one the browser draws once it has, with the bars
 * drawn in where they draw, and a copy of the browser's bars to go over the
 * pictures till then, or where they do not.
 */
export interface Picture {
  shot: HTMLCanvasElement | null;
  painted: Promise<Drawn | null> | null;
  bars: HTMLElement | null;
}

/**
 * The page in `frame` as laid out now on a screen `size` css px, shown in
 * `glass` for the knobs `value`, `copy` of it to draw, and its bars as shown.
 */
export function pictureOf(
  frame: HTMLIFrameElement,
  glass: HTMLElement,
  value: BarsKnobs,
  size: { width: number; height: number },
  color: string,
  copy: Element | null,
): Picture {
  const shown = glass.querySelector<HTMLElement>(":scope > .browser");
  const bars = shown ? document.importNode(shown, true) : null;
  // Drawn in the screen's css px, scaled up by the frame's zoom, which the copy leaves out.
  if (bars) bars.style.transform = "";
  const drawn = shown && copy ? copyBars(shown, value, size) : null;
  return {
    shot: shootPage(frame, glass, size, color),
    painted: copy ? withBars(paintPage(frame, glass, size, color, copy), drawn).catch(() => null) : null,
    bars,
  };
}

/** Put `drawn` on a screen with `paint`, and once its bars are in it, take their copy off the screen. */
export function paintDrawn(picture: Picture, drawn: Drawn, paint: (shot: HTMLCanvasElement) => void): void {
  paint(drawn.shot);
  // The bars blur and darken with the page now, as pixels of the same screen.
  if (drawn.bars) picture.bars?.remove();
}

/** Pictures of the page as laid out on each screen. */
export interface Pictures {
  open: Picture;
  closed: Picture;
}

/** A gradient from the hinge to the free edge through the shares of dark `shades`, evenly spaced. */
function shading(toward: string, shades: number[]): string {
  const last = Math.max(1, shades.length - 1);
  const stops = shades.map((dark, index) => `rgba(0, 0, 0, ${dark}) ${Math.round((index / last) * 1000) / 10}%`);
  return `linear-gradient(${toward}, ${stops.join(", ")})`;
}

/** Where a share `t` of the way from the hinge to the free edge is on a leaf's stage, in percent. */
function onStage(leaf: Panel, t: number): number {
  const [hinge, free] = leaf.span;
  return Math.round((hinge + (free - hinge) * t) * 100) / 100;
}

/** Show a blurrier picture as `fade` has it, faded in along the stage. */
function blurTo(leaf: Panel, picture: HTMLElement, fade: BlurFade | null): void {
  picture.style.opacity = fade ? "" : "0";
  if (!fade) return;
  const mask = `linear-gradient(${leaf.toward}, rgba(0, 0, 0, ${fade.least}) ${onStage(leaf, fade.from)}%, rgba(0, 0, 0, ${fade.most}) ${onStage(leaf, fade.to)}%)`;
  picture.style.maskImage = mask;
  picture.style.setProperty("-webkit-mask-image", mask);
}

/** A gradient from the hinge to the free edge through `stops`, each where it is as a share of the way, and how dark. */
function edging(toward: string, stops: [at: number, dark: number][]): string {
  if (stops.length === 0) return "";
  const list = stops.map(([at, dark]) => `rgba(0, 0, 0, ${dark}) ${Math.round(at * 1000) / 10}%`);
  return `linear-gradient(${toward}, ${list.join(", ")})`;
}

/**
 * Light and blur the page on a screen of the half that turns as the hinge
 * `open` of the way open has it, and darken it toward the turned screen's
 * free edge, seen `free` of the way from the hinge, or not where WebGL2
 * does, null. Its blur is as Apple's camera sees it, the turned screen seen
 * `out` of the way from the hinge to the picture's free edge.
 */
export function light(panel: Panel, open: number, free: number | null, out: number): void {
  const look = paneLook(panel.pane, open, panel.extent, out);
  panel.shade.style.background = shading(panel.toward, look.turned);
  panel.flat.style.background = shading(panel.toward, look.flat);
  panel.edge.style.background = free === null ? "" : edging(panel.toward, freeShades(open, free));
  panel.pictures.slice(1).forEach((picture, index) => blurTo(panel, picture, look.blurs[index] ?? null));
}

/** A screen of a frame's half that turns, a window onto the page lying flat behind it. */
export interface Glued extends Panel {
  /** Dark, over every frame in the render, cut a little past the turned screen's outline, under the case, so no edge of it lets the mat through. */
  node: HTMLElement;
  /** The window in it, cut to the turned screen's outline. */
  cut: HTMLElement;
  /** The part that turns as it lies, in its own css px, laid flat where the page is seen, and its corners. */
  picture: HTMLElement;
  size: { width: number; height: number };
  radii: Corners;
  /** The page drawn by WebGL2, or null where the pictures are laid over each other instead. */
  gl: ScreenGl | null;
}

/**
 * The page on a side's screen of the half that turns, seen through a frame:
 * a window over `box`, the render's px every frame lies in, dark, and in it
 * the part that turns, in its own css px, the pictures and the browser's bars
 * as the screen lies, the dark of the picture and the shade of the turned
 * screen, all laid flat. The window is cut to the turned screen, so none of
 * its dark shows past the case. The page is drawn by WebGL2 where it can be,
 * `margin` css px past its ends along the hinge, `density` display px a css px.
 */
export function gluedOf(
  side: Face,
  picture: Picture,
  turning: Turning,
  across: boolean,
  box: Rect,
  margin: number,
  density: number,
): Glued {
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
  const edge = darkening();
  flatly.append(stage, flat, shade, edge);
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
    edge,
    toward: turning.toward,
    span: turning.span,
    extent: across ? side.size.width : side.size.height,
    width: side.size.width,
    across,
    gl: null,
  };
  const part = { ...rect, x: rect.x - whole.rect.x, y: rect.y - whole.rect.y };
  const place = { pane: turning.pane, across, stage: side.size, part, margin, density };
  glued.gl = screenGl(place, (shot) => {
    glued.gl = null;
    if (shot) paintLeaf(glued, shot);
  });
  // Under the bars.
  if (glued.gl) stage.prepend(glued.gl.canvas);
  if (picture.shot) paintGlued(glued, picture.shot);
  void picture.painted?.then((drawn) => {
    if (drawn && glued.node.isConnected) paintDrawn(picture, drawn, (shot) => paintGlued(glued, shot));
  });
  return glued;
}

/** Put `shot` on a glued screen: drawn by WebGL2, or where it cannot be, as the pictures laid over each other. */
function paintGlued(glued: Glued, shot: HTMLCanvasElement): void {
  if (glued.gl?.paint(shot)) return;
  glued.gl?.release();
  glued.gl = null;
  paintLeaf(glued, shot);
}
