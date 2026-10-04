import type { Radius, Rect, Sides } from "./mock";

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
  screenRadius: Radius;
  bodyRadius: Radius;
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
const top = (at: number, length: number, out?: number): Button => ({
  side: "top",
  at,
  length,
  out,
});

/** The action button and the volume keys of the iPhone 16 family, on the left. */
const IPHONE_LEFT = [left(185, 41.7), left(257.4, 67.6), left(343.2, 67.6)];

/** The side button, and Camera Control at `control`, which sits nearly flush. */
function iphoneRight(control: number): Button[] {
  return [right(280.7, 106.9), right(control, 103.3, 1)];
}

/**
 * The front of each phone and tablet, from Apple's dimensional drawings, the
 * AOSP display config and measured window insets. Android bodies have no
 * drawing: their body radius and buttons are estimates. The iPhone 16 Plus,
 * 17, Air, 18 and Duo are measured from Apple's product bezel images, at 3
 * image px per css px: the bezel, the island or camera hole, and the buttons
 * that stand out. Their body radius is an estimate, the screen's radius and
 * the bezel, and Camera Control is left out where it sits flush. The Pixels
 * but the 9 are measured the same way from Google's emulator frames, at their
 * own density: the bezel, the corner, the punch hole and the right side's
 * buttons, with the body radius an estimate as on the iPhones.
 */
export const BODIES: Record<string, Body> = {
  "iphone-18-pro": {
    bezel: sides(15.7, 16, 15.7, 15.7),
    screenRadius: 62,
    bodyRadius: 77.7,
    out: 3,
    // Narrower than the 17 Pro's 124.4: Face ID sits under the display.
    front: [pill("sensor", 154, 14.3, 94, 36.1)],
    buttons: [left(186, 41.7), left(258.3, 67.7), left(344, 68), right(281.7, 107, 2.7)],
  },
  "iphone-18-pro-max": {
    bezel: sides(15.3, 15.3, 15, 15.3),
    screenRadius: 62,
    bodyRadius: 77.3,
    out: 2.7,
    front: [pill("sensor", 173.2, 14.5, 93.6, 35.8)],
    buttons: [left(186.3, 41.7), left(258.7, 67.7), left(344.3, 67.7), right(282, 106.7)],
  },
  // The folded phone's cover screen: the hinge on the left, so square corners
  // there, and a round camera hole at the top right.
  "iphone-duo-closed": {
    bezel: sides(16.3, 16, 16, 25.7),
    // The simulator's radii. The image measures 7.5 and 57.7.
    screenRadius: [8, 59, 59, 8],
    bodyRadius: [10, 75, 75, 10],
    out: 2.7,
    front: [dot("sensor", 418.35, 47.75, 36.3)],
    buttons: [right(202.7, 112.7), top(235, 65.7, 2.3), top(316, 65.7, 2.3)],
  },
  // The open phone's inner screen, held upright. Its camera is under the display.
  "iphone-duo-open": {
    bezel: sides(20.3, 20.7, 20.7, 20.7),
    // The simulator's radius. The image measures 53.
    screenRadius: 55,
    bodyRadius: 75.7,
    out: 2.7,
    front: [],
    buttons: [left(134.3, 57), left(206.3, 65.7), top(202.3, 112.7)],
  },
  "iphone-air": {
    bezel: sides(15.3, 15.3, 15.3, 15.3),
    screenRadius: 62,
    bodyRadius: 77.3,
    out: 2.7,
    // The island sits 6 lower than on the 17.
    front: [pill("sensor", 147.8, 20.4, 124.6, 36)],
    buttons: [left(185, 41.7), left(257.3, 67.7), left(343, 67.7), right(280.7, 106.7, 3)],
  },
  "iphone-17": {
    bezel: sides(14.3, 14.7, 14.3, 14.7),
    screenRadius: 62,
    bodyRadius: 76.7,
    out: 3,
    front: [pill("sensor", 138.8, 14.3, 124.5, 35.9)],
    buttons: [left(185, 41.7), left(257.3, 67.7), left(342.7, 68), right(280.3, 107, 2.7)],
  },
  "iphone-17-pro": {
    bezel: sides(15.7, 16, 15.7, 15.7),
    screenRadius: 62,
    bodyRadius: 77.7,
    out: 3,
    front: [pill("sensor", 138.8, 14.4, 124.4, 35.8)],
    buttons: [left(186, 41.7), left(258.3, 67.7), left(344, 67.7), right(281.7, 107, 2.7)],
  },
  "iphone-17-pro-max": {
    bezel: sides(15.3, 15.3, 15, 15.3),
    screenRadius: 62,
    bodyRadius: 77.3,
    out: 2.7,
    front: [pill("sensor", 157.8, 14.5, 124.4, 35.8)],
    buttons: [left(186.3, 41.7), left(258.7, 67.7), left(344.3, 67.7), right(282, 106.7)],
  },
  "iphone-16": {
    bezel: sides(19.7, 19.7, 19.8, 19.7),
    screenRadius: 55,
    bodyRadius: 75.5,
    out: 2.7,
    front: [pill("sensor", 134, 11.3, 124.9, 36.7)],
    buttons: [...IPHONE_LEFT, ...iphoneRight(529.5)],
  },
  "iphone-16-plus": {
    bezel: sides(19.7, 19.7, 19.7, 19.7),
    screenRadius: 55,
    bodyRadius: 75.5,
    out: 2.7,
    front: [pill("sensor", 152.3, 11.3, 125.4, 36.7)],
    // An estimate: where Camera Control is, as far under the 16's as the body is taller.
    buttons: [...IPHONE_LEFT, ...iphoneRight(608.5)],
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
  "pixel-10": {
    bezel: sides(21, 22.1, 21.4, 22.5),
    screenRadius: 55,
    bodyRadius: 77,
    out: 3.1,
    front: [dot("sensor", 205.6, 33.9, 29.7)],
    buttons: [right(269.6, 77), right(389.3, 134.2)],
  },
  "pixel-10-pro": {
    bezel: sides(20, 20.7, 17.3, 19.7),
    screenRadius: 59,
    bodyRadius: 79,
    out: 3,
    front: [dot("sensor", 213.6, 34.3, 30.6)],
    buttons: [right(276.4, 78.4), right(399.1, 137)],
  },
  "pixel-10-pro-xl": {
    bezel: sides(18.3, 20.3, 18, 20),
    screenRadius: 52,
    bodyRadius: 71,
    out: 2.3,
    front: [dot("sensor", 224, 34.8, 30.2)],
    buttons: [right(280.5, 77), right(401.2, 134.4)],
  },
  "pixel-10a": {
    bezel: sides(24, 24.8, 24, 24.8),
    screenRadius: 55,
    bodyRadius: 79,
    out: 3.1,
    front: [dot("sensor", 205.2, 33.3, 30.5)],
    buttons: [right(273, 75.9), right(393.1, 132.7)],
  },
  "pixel-9": {
    bezel: sides(21.9, 22.2, 21.9, 22.2),
    // The frame's opening. The display config's corner is 132 px, 50.3.
    screenRadius: 55,
    // Estimates: how far the buttons stand out, and where they are.
    bodyRadius: 77,
    out: 2.5,
    front: [dot("sensor", 205.5, 33, 32)],
    buttons: [right(290, 70), right(385, 135)],
  },
  "pixel-9-pro": {
    bezel: sides(20.3, 20.3, 19, 20),
    screenRadius: 58,
    bodyRadius: 78,
    out: 2.3,
    front: [dot("sensor", 213.4, 33.7, 30.9)],
    buttons: [right(269.7, 77.7), right(392.1, 142.7)],
  },
  "pixel-9-pro-xl": {
    bezel: sides(18.7, 19.3, 17.3, 19),
    screenRadius: 57,
    bodyRadius: 76,
    out: 2.3,
    front: [dot("sensor", 224, 32.8, 30.8)],
    buttons: [right(274.1, 75.7), right(393.8, 139.4)],
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
