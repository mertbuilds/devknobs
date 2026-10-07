import { type BlurFade, type FoldLayout, type FoldSide, type Pane, paneLook, type Point } from "./fold";
import type { Mock, Rect } from "./mock";
import { corners } from "./mockdraw";
import type { Corners } from "./morph";
import { blurPictures } from "./pageshot";

/**
 * The page on the screens of a fold's half that turns, whichever way the
 * half is drawn: the pictures of it, where the part that turns is on each
 * side's screen, the bend down the hinge, and how the hinge lights and blurs
 * it. Shared by the copies and the frames.
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
  /** The way from the hinge to the free edge, as a gradient goes, and where the two are on the stage, in percent. */
  toward: string;
  span: [number, number];
  /** The screen's css px across the hinge, and its width. */
  extent: number;
  width: number;
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
 * it is out of reach, the one the browser draws once it has, and a copy of
 * the browser's bars around it.
 */
export interface Picture {
  shot: HTMLCanvasElement | null;
  painted: Promise<HTMLCanvasElement | null> | null;
  bars: HTMLElement | null;
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
  const mask = `linear-gradient(${leaf.toward}, transparent ${onStage(leaf, fade.from)}%, rgba(0, 0, 0, ${fade.most}) ${onStage(leaf, fade.to)}%)`;
  picture.style.maskImage = mask;
  picture.style.setProperty("-webkit-mask-image", mask);
}

/** Light and blur the page on a screen of the half that turns as the hinge `open` of the way open has it. */
export function light(panel: Panel, open: number): void {
  const look = paneLook(panel.pane, open, panel.extent);
  panel.shade.style.background = shading(panel.toward, look.turned);
  panel.flat.style.background = shading(panel.toward, look.flat);
  panel.pictures.slice(1).forEach((picture, index) => blurTo(panel, picture, look.blurs[index] ?? null));
}
