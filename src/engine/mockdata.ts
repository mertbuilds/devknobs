import type { Rect, Sides } from "./mock";

/**
 * A shape on the front, relative to the screen's top left in portrait: the
 * island or a punch hole over the screen, a receiver slot, a camera lens or a
 * home button on the bezel. Its ends are fully round.
 */
export interface Front extends Rect {
  kind: "sensor" | "slot" | "lens" | "home";
  /** A home button's key inside its ring. */
  key?: number;
}

/** A button on the body's edge, `at` px from its top, or from its left on the top edge. */
export interface Button {
  side: "left" | "right" | "top";
  at: number;
  length: number;
  /** How far it stands out of the band, when not the device's own. */
  out?: number;
}

/** One device's body around its screen, held upright, in css px of the screen. */
export interface Body {
  bezel: Sides;
  screenRadius: number;
  bodyRadius: number;
  /** How far its buttons stand out of the band. */
  out: number;
  front: Front[];
  buttons: Button[];
}

function sides(top: number, right: number, bottom: number, left: number): Sides {
  return { top, right, bottom, left };
}

function pill(kind: Front["kind"], x: number, y: number, width: number, height: number): Front {
  return { kind, x, y, width, height };
}

/** A circle `size` across, centered on `x`, `y`. */
function dot(kind: Front["kind"], x: number, y: number, size: number): Front {
  return { kind, x: x - size / 2, y: y - size / 2, width: size, height: size };
}

const left = (at: number, length: number): Button => ({ side: "left", at, length });
const right = (at: number, length: number, out?: number): Button => ({
  side: "right",
  at,
  length,
  out,
});
const top = (at: number, length: number): Button => ({ side: "top", at, length });

/** The action button and the volume keys of the iPhone 16 family, on the left. */
const IPHONE_LEFT = [left(185, 41.7), left(257.4, 67.6), left(343.2, 67.6)];

/** The side button, and Camera Control at `control`, which sits nearly flush. */
function iphoneRight(control: number): Button[] {
  return [right(280.7, 106.9), right(control, 103.3, 1)];
}

/**
 * The front of each phone and tablet, from Apple's dimensional drawings, the
 * AOSP display config and measured window insets. Android bodies have no
 * drawing: their body radius and buttons are estimates.
 */
export const BODIES: Record<string, Body> = {
  "iphone-16": {
    bezel: sides(19.7, 19.7, 19.8, 19.7),
    screenRadius: 55,
    bodyRadius: 75.5,
    out: 2.7,
    front: [pill("sensor", 134, 11.3, 124.9, 36.7)],
    buttons: [...IPHONE_LEFT, ...iphoneRight(529.5)],
  },
  "iphone-16-pro": {
    bezel: sides(14.7, 14.7, 14.4, 14.7),
    screenRadius: 62,
    bodyRadius: 77.9,
    out: 2.7,
    front: [pill("sensor", 138.4, 13.5, 125.2, 36.7)],
    buttons: [...IPHONE_LEFT, ...iphoneRight(541.3)],
  },
  "iphone-16-pro-max": {
    bezel: sides(14.3, 14.3, 14.3, 14.3),
    screenRadius: 62,
    bodyRadius: 77.9,
    out: 2.7,
    front: [pill("sensor", 157.3, 14, 125.4, 36.7)],
    buttons: [...IPHONE_LEFT, ...iphoneRight(622.4)],
  },
  "iphone-se": {
    bezel: sides(110.2, 28.1, 110.3, 28.1),
    screenRadius: 0,
    bodyRadius: 65.6,
    out: 2.6,
    front: [
      pill("slot", 149.5, -55.4, 76.1, 7.7),
      // The lens size is an estimate, its place is not.
      dot("lens", 119.3, -51.5, 14),
      // The key inside the ring is an estimate.
      { ...dot("home", 187.5, 718, 69.9), key: 60 },
    ],
    buttons: [left(94.6, 36), left(187.5, 68.1), left(268.3, 68.1), right(188, 68.1)],
  },
  "pixel-9": {
    bezel: sides(21.9, 22.2, 21.9, 22.2),
    screenRadius: 50.3,
    // Estimates: the body radius, how far the buttons stand out, and where they are.
    bodyRadius: 72,
    out: 2.5,
    front: [dot("sensor", 205.5, 33, 32)],
    buttons: [right(290, 70), right(385, 135)],
  },
  "galaxy-s25": {
    bezel: sides(11, 12.4, 11, 12.4),
    screenRadius: 34,
    // Estimates: the body radius, how far the buttons stand out, and where they are.
    bodyRadius: 46,
    out: 2.5,
    front: [dot("sensor", 180, 24.7, 19.3)],
    buttons: [right(175, 110), right(320, 60)],
  },
  "galaxy-s25-ultra": {
    bezel: sides(9.6, 10.9, 9.6, 10.9),
    screenRadius: 14.9,
    // Estimates: the body radius, how far the buttons stand out, and where they are.
    bodyRadius: 25,
    out: 2.5,
    front: [dot("sensor", 192, 24.9, 18.5)],
    buttons: [right(185, 110), right(335, 60)],
  },
  "ipad-mini": {
    bezel: sides(60.6, 60.4, 60.6, 60.4),
    // Estimates: both radii, the camera's distance from the edge and its lens size.
    screenRadius: 21.5,
    bodyRadius: 77,
    out: 2.5,
    front: [dot("lens", 372, -35, 16)],
    buttons: [top(82.3, 64.6), top(159.7, 64.6), top(673.5, 109.9)],
  },
  "ipad-air-11": {
    bezel: sides(53.5, 53.9, 53.5, 53.9),
    screenRadius: 18,
    bodyRadius: 66.5,
    out: 2.5,
    // The lens size is an estimate, its place is not.
    front: [dot("lens", 850.5, 540.6, 16)],
    buttons: [top(772.9, 89), right(75.1, 52.3), right(137.8, 52.3)],
  },
  "ipad-pro-13": {
    bezel: sides(43.7, 44, 43.7, 44),
    // An estimate: the drawing gives no screen radius.
    screenRadius: 30,
    bodyRadius: 74.8,
    out: 2.5,
    front: [dot("lens", 1051.6, 688, 13.9)],
    buttons: [top(984.7, 62.7), right(74.3, 52.3), right(137, 52.3)],
  },
};
