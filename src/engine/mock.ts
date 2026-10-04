import type { OrientationValue } from "../types";
import { deviceOf, type MockFamily, turn } from "./devices";

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
 * A shape on the body: a button on its edge, drawn under it, a sensor on the
 * bezel or over the screen, or the ring of a home button.
 */
export interface Part extends Rect {
  kind: "button" | "sensor" | "ring";
  radius: number;
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
  bezel: Sides;
  screenRadius: number;
  /** The screen's radius and the thinnest bezel, so the corners are concentric. */
  bodyRadius: number;
  parts: Part[];
}

interface Family {
  bezel: Sides;
  radius: number;
  /** How far the side buttons stand out of the body. */
  out: number;
  /** The parts of a portrait mock, given its screen and the mock's width. */
  parts(screen: Rect, width: number): Part[];
}

function even(size: number): Sides {
  return { top: size, right: size, bottom: size, left: size };
}

/** A shape `width` wide, centered across a mock `across` wide. */
function centered(
  kind: Part["kind"],
  across: number,
  y: number,
  width: number,
  height: number,
): Part {
  return { kind, x: (across - width) / 2, y, width, height, radius: Math.min(width, height) / 2 };
}

function button(x: number, y: number, height: number): Part {
  return { kind: "button", x, y, width: 3, height, radius: 1.5 };
}

const FAMILIES: Record<MockFamily, Family> = {
  // Thin even bezel, the dynamic island, and the buttons on both sides.
  island: {
    bezel: even(12),
    radius: 55,
    out: 2,
    parts: (screen, width) => [
      centered("sensor", width, screen.y + 11, 125, 36),
      button(0, 150, 40),
      button(0, 210, 60),
      button(0, 285, 60),
      button(width - 3, 230, 95),
    ],
  },
  // Thick top and bottom, a speaker slot over the screen and a home button under it.
  home: {
    bezel: { top: 100, right: 18, bottom: 100, left: 18 },
    radius: 4,
    out: 0,
    parts: (screen, width) => [
      centered("sensor", width, (screen.y - 6) / 2, 56, 6),
      centered("ring", width, screen.y + screen.height + (100 - 54) / 2, 54, 54),
    ],
  },
  // Thin bezel and a punch-hole camera.
  hole: {
    bezel: even(10),
    radius: 44,
    out: 0,
    parts: (screen, width) => [centered("sensor", width, screen.y + 14, 12, 12)],
  },
  // Even medium bezel with a camera dot on it.
  tablet: {
    bezel: even(24),
    radius: 18,
    out: 0,
    parts: (screen, width) => [centered("sensor", width, (screen.y - 6) / 2, 6, 6)],
  },
};

/** A rect of a portrait mock `width` wide, turned a quarter so its top is on the left. */
function turnRect<T extends Rect>(rect: T, width: number): T {
  const { x, y } = rect;
  return { ...rect, x: y, y: width - x - rect.width, width: rect.height, height: rect.width };
}

function turnSides(sides: Sides): Sides {
  return { top: sides.right, right: sides.bottom, bottom: sides.left, left: sides.top };
}

/**
 * The mock of a device held one way, or null for one that has none. A turn
 * puts the top of the phone on the left, island and all.
 */
export function mockOf(id: string, orientation: OrientationValue): Mock | null {
  const device = deviceOf(id);
  const family = device?.mock && FAMILIES[device.mock];
  if (!device || !family) return null;
  const { bezel, radius, out } = family;
  const size = turn(device, "portrait");
  const inset = { ...bezel, left: bezel.left + out, right: bezel.right + out };
  const width = size.width + inset.left + inset.right;
  const height = size.height + inset.top + inset.bottom;
  const screen = { x: inset.left, y: inset.top, ...size };
  const body = { x: out, y: 0, width: width - 2 * out, height };
  const upright: Mock = {
    width,
    height,
    inset,
    body,
    bezel,
    screenRadius: radius,
    bodyRadius: radius + Math.min(bezel.top, bezel.right, bezel.bottom, bezel.left),
    parts: family.parts(screen, width),
  };
  if (orientation === "portrait") return upright;
  return {
    ...upright,
    width: height,
    height: width,
    inset: turnSides(inset),
    body: turnRect(body, width),
    bezel: turnSides(bezel),
    parts: upright.parts.map((part) => turnRect(part, width)),
  };
}
