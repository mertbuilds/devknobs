import type { DevknobsState } from "../types";
import { deviceOf } from "./devices";
import type { Sides } from "./mock";
import type { Point } from "./zoom";

/** The room over the readout's row, so it stands clear of the window's top edge, in px. */
export const STRIP_TOP = 8;

/** The readout strip over the frame, in px. The frame is fitted to the room under it. */
export const STRIP = 24 + STRIP_TOP;

/** The room kept around a frame of a set size, fitted or scrolled to its edge, in px. */
const MARGIN = 24;

/** No mock: the frame takes no room beyond its own. */
const BARE: Sides = { top: 0, right: 0, bottom: 0, left: 0 };

/** Where the frame goes in the letterbox. */
export interface Fit {
  /** The frame's css size, which is the viewport the page inside sees. */
  width: number;
  height: number;
  /** `zoom` on the frame. The page inside gets that many more device pixels per css pixel. */
  zoom: number;
  /** What the frame is drawn at: the zoom picked, or the fit. */
  scale: number;
  /** What the frame is drawn at to fit, 1 or less. */
  fit: number;
  /** `transform: scale()` on the frame's wrapper: the scale, and the zoom undone. */
  transform: number;
  /** The room the drawing takes, margins included. Bigger than the letterbox, it scrolls. */
  box: { width: number; height: number };
  /** Where the frame sits in that box. */
  left: number;
  top: number;
}

/** Does the letterbox read the frame out? A frame the window's size, fitted, is the window. */
export function hasStrip(knobs: Pick<DevknobsState, "width" | "height" | "zoom">): boolean {
  const sized = typeof knobs.width === "number" || typeof knobs.height === "number";
  return sized || knobs.zoom !== "fit";
}

/** The margin on an axis of `size` px, less where the letterbox is too small to spare it. */
function margin(size: number): number {
  return Math.min(MARGIN, size / 4);
}

/**
 * Place a frame in a letterbox of `size`, under its readout strip. A width or
 * height of the frame's own keeps a margin around it, and the window's own
 * size has none, as it is the window. To fit, a frame wider or taller than the
 * room is drawn smaller, and one without a height of its own is made taller by
 * as much, so it still fills the height. An open panel covers `aside` px of
 * the right edge, and a frame of a set width that would reach under it is
 * fitted to the room left of it, while that is most of the room. A zoom draws
 * the frame at that scale instead, and none of it changes the css size. The
 * device pixel ratio's `zoom` on the frame keeps its css size too, and the
 * wrapper takes it back out of the drawing. A device's mock takes `mock` px
 * of the frame's on each side, drawn at the same scale, and the whole of it
 * is fitted and centered.
 */
export function fit(
  knobs: Pick<DevknobsState, "width" | "height" | "zoom">,
  size: { width: number; height: number },
  options: { frameZoom?: number; aside?: number; mock?: Sides } = {},
): Fit {
  const { frameZoom = 1, aside = 0, mock = BARE } = options;
  const room = {
    width: size.width,
    height: Math.max(0, size.height - (hasStrip(knobs) ? STRIP : 0)),
  };
  const sized = typeof knobs.width === "number";
  const width = typeof knobs.width === "number" ? knobs.width : room.width;
  const x = sized ? margin(room.width) : 0;
  const y = typeof knobs.height === "number" ? margin(room.height) : 0;
  const sides = { width: mock.left + mock.right, height: mock.top + mock.bottom };
  const across = width > 0 && room.width > 0 ? (room.width - 2 * x) / (width + sides.width) : 1;
  const tall = typeof knobs.height === "number" && knobs.height > 0 && room.height > 0;
  const upright = (room.height - 2 * y) / (Number(knobs.height) + sides.height);
  const whole = Math.min(1, across, tall ? upright : 1);
  const height = typeof knobs.height === "number" ? knobs.height : room.height / whole;
  const outer = { width: width + sides.width, height: height + sides.height };
  const covered =
    sized &&
    aside > 0 &&
    aside <= room.width / 2 &&
    (room.width + outer.width * whole) / 2 + x > room.width - aside;
  const fitted = covered ? Math.min(whole, (room.width - aside - 2 * x) / outer.width) : whole;
  const scale = knobs.zoom === "fit" ? fitted : knobs.zoom;
  // The room under the panel stays in the box, so centering it centers the frame left of the panel.
  const beside = knobs.zoom === "fit" && covered ? aside : 0;
  return {
    width,
    height,
    zoom: frameZoom,
    scale,
    fit: fitted,
    transform: scale / frameZoom,
    box: { width: outer.width * scale + 2 * x + beside, height: outer.height * scale + 2 * y },
    left: x + mock.left * scale,
    top: y + mock.top * scale,
  };
}

/**
 * Where the frame's top left sits in the scrolled content of a stage of
 * `room`: its box centered while it is smaller, else at the start.
 */
export function origin(place: Fit, room: { width: number; height: number }): Point {
  return {
    x: Math.max(0, (room.width - place.box.width) / 2) + place.left,
    y: Math.max(0, (room.height - place.box.height) / 2) + place.top,
  };
}

/**
 * What the letterbox says about the frame, such as `1440 · 2x`, or
 * `iPhone 16 Pro · 402 × 874 · 3x` for a device. A height of its own is named.
 * A phone's browser leaves the page less of the screen, and that is the size
 * it says. The zoom control beside it says the scale.
 */
export function label(
  place: Fit,
  knobs: Pick<DevknobsState, "dpr" | "height" | "device">,
  page: { width: number; height: number } = place,
): string {
  const name = deviceOf(knobs.device)?.label;
  let text = name ? `${name} · ${page.width}` : String(page.width);
  if (typeof knobs.height === "number") text += ` × ${page.height}`;
  if (typeof knobs.dpr === "number") text += ` · ${knobs.dpr}x`;
  return text;
}
