/**
 * The box of an element, as numbers: its margin, border and padding by side
 * as the computed style has them, and the four areas they make on the page.
 * Nothing here touches the page.
 */

/** The four areas of a box, from the outside in. */
export const RINGS = ["margin", "border", "padding", "content"] as const;

export type BoxRing = (typeof RINGS)[number];

export const SIDES = ["top", "right", "bottom", "left"] as const;

export type Side = (typeof SIDES)[number];

/** A length for each side, in css px. */
export type Sides = Record<Side, number>;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

/** Four corners, in order around the shape. */
export type Quad = readonly [Point, Point, Point, Point];

/** What the computed style says of an element's box. */
export interface BoxModel {
  margin: Sides;
  border: Sides;
  padding: Sides;
  /** The offsets of a positioned element, null for a side left `auto`, or null where it has none. */
  offsets: Record<Side, number | null> | null;
  boxSizing: string;
  display: string;
  position: string;
}

/** The properties of a computed style the box is read from. */
export type BoxStyle = Pick<
  CSSStyleDeclaration,
  | "marginTop"
  | "marginRight"
  | "marginBottom"
  | "marginLeft"
  | "borderTopWidth"
  | "borderRightWidth"
  | "borderBottomWidth"
  | "borderLeftWidth"
  | "paddingTop"
  | "paddingRight"
  | "paddingBottom"
  | "paddingLeft"
  | "top"
  | "right"
  | "bottom"
  | "left"
  | "boxSizing"
  | "display"
  | "position"
>;

/** A computed length in px, or null for one that is no length, as `auto` is. */
export function pxOf(value: string): number | null {
  const match = /^(-?\d*\.?\d+(?:e-?\d+)?)px$/.exec(value.trim());
  return match ? Number(match[1]) : null;
}

function sides(top: string, right: string, bottom: string, left: string): Sides {
  return {
    top: pxOf(top) ?? 0,
    right: pxOf(right) ?? 0,
    bottom: pxOf(bottom) ?? 0,
    left: pxOf(left) ?? 0,
  };
}

/** The box as a computed style has it. A margin left `auto` that comes to no length is 0. */
export function boxModel(style: BoxStyle): BoxModel {
  const offsets = {
    top: pxOf(style.top),
    right: pxOf(style.right),
    bottom: pxOf(style.bottom),
    left: pxOf(style.left),
  };
  const positioned =
    style.position !== "static" && SIDES.some((side) => offsets[side] !== null);
  return {
    margin: sides(style.marginTop, style.marginRight, style.marginBottom, style.marginLeft),
    border: sides(
      style.borderTopWidth,
      style.borderRightWidth,
      style.borderBottomWidth,
      style.borderLeftWidth,
    ),
    padding: sides(style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft),
    offsets: positioned ? offsets : null,
    boxSizing: style.boxSizing,
    display: style.display,
    position: style.position,
  };
}

/**
 * The size of the content box. The computed `width` and `height` are the
 * content's with `content-box` and the border box's with `border-box`. Where
 * one is no length, as on an inline element, it is the laid out border box
 * less the border and the padding.
 */
export function contentSize(
  model: Pick<BoxModel, "border" | "padding" | "boxSizing">,
  computed: { width: string; height: string },
  laid: { width: number; height: number },
): { width: number; height: number } {
  const { border, padding } = model;
  const one = (value: string, box: number, around: number): number => {
    const px = pxOf(value);
    if (px === null) return Math.max(0, box - around);
    return model.boxSizing === "border-box" ? Math.max(0, px - around) : px;
  };
  return {
    width: one(computed.width, laid.width, border.left + border.right + padding.left + padding.right),
    height: one(
      computed.height,
      laid.height,
      border.top + border.bottom + padding.top + padding.bottom,
    ),
  };
}

/**
 * Whether an element has a box to draw. One with `display: contents` or
 * `none` has none, and neither has one that is 0 wide and 0 tall. An empty
 * block, as wide as its line and 0 tall, still has its margin to show.
 */
export function hasBox(display: string, laid: { width: number; height: number }): boolean {
  if (display === "contents" || display === "none") return false;
  return laid.width > 0 || laid.height > 0;
}

/** A rect with each side moved in by a length, or out by a negative one, and never inside out. */
function inset(rect: Rect, by: Sides): Rect {
  const width = Math.max(0, rect.width - by.left - by.right);
  const height = Math.max(0, rect.height - by.top - by.bottom);
  return {
    x: Math.min(rect.x + by.left, rect.x + rect.width),
    y: Math.min(rect.y + by.top, rect.y + rect.height),
    width,
    height,
  };
}

/**
 * The outer edge of each area, from the border box on the page: the margin
 * outside it, the padding inside the border, the content inside the padding.
 * A negative margin pulls the element over its neighbour and makes no area
 * of its own, so it is drawn as none on that side.
 */
export function ringRects(
  border: Rect,
  model: Pick<BoxModel, "margin" | "border" | "padding">,
): Record<BoxRing, Rect> {
  const { margin } = model;
  const out = {
    top: -Math.max(0, margin.top),
    right: -Math.max(0, margin.right),
    bottom: -Math.max(0, margin.bottom),
    left: -Math.max(0, margin.left),
  };
  const padding = inset(border, model.border);
  return {
    margin: inset(border, out),
    border,
    padding,
    content: inset(padding, model.padding),
  };
}

export function rectQuad(rect: Rect): Quad {
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;
  return [
    { x: rect.x, y: rect.y },
    { x: right, y: rect.y },
    { x: right, y: bottom },
    { x: rect.x, y: bottom },
  ];
}

/** The outer edge of each area as four corners, for a box that is not turned. */
export function ringQuads(
  border: Rect,
  model: Pick<BoxModel, "margin" | "border" | "padding">,
): Record<BoxRing, Quad> {
  const rects = ringRects(border, model);
  return {
    margin: rectQuad(rects.margin),
    border: rectQuad(rects.border),
    padding: rectQuad(rects.padding),
    content: rectQuad(rects.content),
  };
}

function isPoint(value: unknown): value is Point {
  if (typeof value !== "object" || value === null) return false;
  const x: unknown = Reflect.get(value, "x");
  const y: unknown = Reflect.get(value, "y");
  return typeof x === "number" && typeof y === "number" && Number.isFinite(x + y);
}

/**
 * What `getBoxQuads` answered, as one quad. Null for anything else, and for
 * an element in several pieces, as an inline one over a few lines is: that
 * one is drawn by its bounding box.
 */
export function oneQuad(value: unknown): Quad | null {
  if (typeof value !== "object" || value === null) return null;
  if (Reflect.get(value, "length") !== 1) return null;
  const quad: unknown = Reflect.get(value, 0);
  if (typeof quad !== "object" || quad === null) return null;
  const corners = ["p1", "p2", "p3", "p4"].map((name): unknown => Reflect.get(quad, name));
  const [a, b, c, d] = corners;
  if (!isPoint(a) || !isPoint(b) || !isPoint(c) || !isPoint(d)) return null;
  return [
    { x: a.x, y: a.y },
    { x: b.x, y: b.y },
    { x: c.x, y: c.y },
    { x: d.x, y: d.y },
  ];
}

/** Nearer than this, in px, two lengths are the same. */
const NEAR = 0.5;

/**
 * Whether a border box's quad is only a rect of the size the element is laid
 * out at: no transform turns, skews or scales it. Such a box is drawn from
 * its bounds, which glide. `laid` is null where the layout size is not known.
 */
export function isPlain(quad: Quad, laid: { width: number; height: number } | null): boolean {
  const [a, b, c, d] = quad;
  const straight =
    Math.abs(a.y - b.y) < NEAR &&
    Math.abs(b.x - c.x) < NEAR &&
    Math.abs(c.y - d.y) < NEAR &&
    Math.abs(d.x - a.x) < NEAR;
  if (!straight || !laid) return straight;
  return (
    Math.abs(Math.abs(b.x - a.x) - laid.width) < NEAR &&
    Math.abs(Math.abs(d.y - a.y) - laid.height) < NEAR
  );
}

/**
 * The quads of each area moved as one, so the border box's bounds start where
 * `bounds` does. `getBoxQuads` and `getBoundingClientRect` need not count
 * from the same corner of the page.
 */
export function alignQuads(
  quads: Record<BoxRing, Quad>,
  bounds: { x: number; y: number },
): Record<BoxRing, Quad> {
  const dx = bounds.x - Math.min(...quads.border.map((point) => point.x));
  const dy = bounds.y - Math.min(...quads.border.map((point) => point.y));
  const move = (quad: Quad): Quad => [
    { x: quad[0].x + dx, y: quad[0].y + dy },
    { x: quad[1].x + dx, y: quad[1].y + dy },
    { x: quad[2].x + dx, y: quad[2].y + dy },
    { x: quad[3].x + dx, y: quad[3].y + dy },
  ];
  return {
    margin: move(quads.margin),
    border: move(quads.border),
    padding: move(quads.padding),
    content: move(quads.content),
  };
}

function loop(quad: Quad, closed: boolean): string {
  const points = closed ? [...quad, quad[0]] : quad;
  return points
    .map((point) => `${Math.round(point.x * 100) / 100}px ${Math.round(point.y * 100) / 100}px`)
    .join(", ");
}

/**
 * The `clip-path` that leaves one area: what is inside `outer` and outside
 * `inner`, or all of `outer` with no inner one. The two loops are one polygon
 * filled by the even-odd rule, and the line that joins them is gone over
 * twice, so it fills nothing.
 */
export function ringPath(outer: Quad, inner: Quad | null): string {
  if (!inner) return `polygon(${loop(outer, false)})`;
  return `polygon(evenodd, ${loop(outer, true)}, ${loop(inner, true)})`;
}

/** The `clip-path` of each area, from the outer edges of all four. */
export function ringPaths(quads: Record<BoxRing, Quad>): Record<BoxRing, string> {
  return {
    margin: ringPath(quads.margin, quads.border),
    border: ringPath(quads.border, quads.padding),
    padding: ringPath(quads.padding, quads.content),
    content: ringPath(quads.content, null),
  };
}
