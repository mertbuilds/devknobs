import type { OrientationValue } from "../types";
import { screenOf, turn } from "./devices";
import { BODIES, type Button, type Front } from "./mockdata";

/** A length on each side of a box, in css px of the screen. */
export interface Sides {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * A corner radius, or one for each corner where they differ: top left, top
 * right, bottom right, bottom left.
 */
export type Radius = number | readonly [number, number, number, number];

/**
 * A shape on the body: a button on its edge, drawn under it, the island or a
 * punch hole, a receiver slot, a camera lens, or a home button and its key.
 */
export interface Part extends Rect {
  kind: "button" | "sensor" | "slot" | "lens" | "home" | "key";
  radius: number;
}

/**
 * A picture of the whole body, in the mock: where it goes, how big it is
 * drawn, and for an upright one turned with the device, how wide the upright
 * mock is.
 */
export interface MockImage extends Rect {
  file: string;
  turn: number | null;
}

/** A device's body around its screen, in css px of the screen. */
export interface Mock {
  /** The whole mock, buttons included. */
  width: number;
  height: number;
  /** Where the screen sits in the mock: the room the mock takes on each side of it. */
  inset: Sides;
  /** The body, in the mock. */
  body: Rect;
  screenRadius: Radius;
  bodyRadius: Radius;
  parts: Part[];
  /** The body as a picture, which then has every part in it, in place of the drawn one. */
  image?: MockImage;
}

/** A rect with fully round ends. */
function round(kind: Part["kind"], rect: Rect): Part {
  return { kind, ...rect, radius: Math.min(rect.width, rect.height) / 2 };
}

/** A button as a bar half under the body, so `out` of it shows past the edge. */
function bar(button: Button, out: number, body: Rect): Part {
  const { side, at, length } = button;
  if (side === "top") {
    const y = body.y - out;
    return { kind: "button", x: body.x + at, y, width: length, height: 2 * out, radius: out };
  }
  const x = side === "left" ? body.x - out : body.x + body.width - out;
  return { kind: "button", x, y: body.y + at, width: 2 * out, height: length, radius: out };
}

/** A home button's key, centered in its ring. */
function keyOf(front: Front): Rect | null {
  if (front.key === undefined) return null;
  const gap = (front.width - front.key) / 2;
  return { x: front.x + gap, y: front.y + gap, width: front.key, height: front.key };
}

/** A rect of a portrait mock `width` wide, turned a quarter so its top is on the left. */
function turnRect<T extends Rect>(rect: T, width: number): T {
  const { x, y } = rect;
  return { ...rect, x: y, y: width - x - rect.width, width: rect.height, height: rect.width };
}

export function turnSides(sides: Sides): Sides {
  return { top: sides.right, right: sides.bottom, bottom: sides.left, left: sides.top };
}

/** The corners after the same turn: the top right one comes to the top left. */
export function turnRadius(radius: Radius): Radius {
  if (typeof radius === "number") return radius;
  const [topLeft, topRight, bottomRight, bottomLeft] = radius;
  return [topRight, bottomRight, bottomLeft, topLeft];
}

/**
 * A mock drawn in the room another one takes, its screen where that one has
 * it, so the frame stays put when one takes the other's place.
 */
export function placeIn(mock: Mock, room: Mock): Mock {
  const dx = room.inset.left - mock.inset.left;
  const dy = room.inset.top - mock.inset.top;
  const move = <T extends Rect>(rect: T): T => ({ ...rect, x: rect.x + dx, y: rect.y + dy });
  const { width, height, inset } = room;
  return { ...mock, width, height, inset, body: move(mock.body), parts: mock.parts.map(move) };
}

/**
 * The mock of a device, or a foldable's screen, held one way, or null for one
 * that has none. A turn puts the top of the phone on the left, island and all.
 */
export function mockOf(id: string, orientation: OrientationValue): Mock | null {
  const device = screenOf(id);
  const shape = BODIES[id];
  if (!device || !shape) return null;
  const { bezel, screenRadius, bodyRadius } = shape;
  const out = (button: Button) => button.out ?? shape.out;
  const most = (side: Button["side"]) =>
    Math.max(0, ...shape.buttons.filter((button) => button.side === side).map(out));
  const room = { top: most("top"), right: most("right"), left: most("left") };
  const size = turn(device, "portrait");
  const inset = {
    top: bezel.top + room.top,
    right: bezel.right + room.right,
    bottom: bezel.bottom,
    left: bezel.left + room.left,
  };
  const width = size.width + inset.left + inset.right;
  const height = size.height + inset.top + inset.bottom;
  const body = {
    x: room.left,
    y: room.top,
    width: size.width + bezel.left + bezel.right,
    height: size.height + bezel.top + bezel.bottom,
  };
  const at = ({ x, y, width, height }: Rect): Rect => {
    return { x: inset.left + x, y: inset.top + y, width, height };
  };
  const parts = [
    ...shape.buttons.map((button) => bar(button, out(button), body)),
    ...shape.front.flatMap((front) => {
      const key = keyOf(front);
      const shown = round(front.kind, at(front));
      return key ? [shown, round("key", at(key))] : [shown];
    }),
  ];
  const upright: Mock = { width, height, inset, body, screenRadius, bodyRadius, parts };
  if (orientation === "portrait") return upright;
  return {
    ...upright,
    width: height,
    height: width,
    inset: turnSides(inset),
    body: turnRect(body, width),
    screenRadius: turnRadius(screenRadius),
    bodyRadius: turnRadius(bodyRadius),
    parts: upright.parts.map((part) => turnRect(part, width)),
  };
}
