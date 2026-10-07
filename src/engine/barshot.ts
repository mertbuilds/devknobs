import { BARS_CSS } from "./browserdraw";
import { type Bars, barsOf, layoutOf } from "./browserui";
import { formOf } from "./devices";
import type { Rect } from "./mock";
import { pillBox } from "./safaridraw";
import type { ViewportValue } from "./width";

/**
 * The browser's bars drawn into a picture of the page, for the screen that
 * turns as a foldable folds, so they blur, darken and spread into the dark
 * with the page, as on the phone, where they are pixels of the same screen.
 * They are the bars shown at rest, copied as they are and drawn by the
 * browser through an svg, and where Safari's glass blurs the page under it,
 * the picture under it is blurred the same way first.
 */

/** Safari's glass, as its css blurs the page under it. */
const GLASS = "blur(10px) saturate(1.8)";

/** How far past a glass shape the picture under it is blurred from, in css px, three times the blur. */
const REACH = 30;

/**
 * What the drawing of the bars leaves out: the zoom the frame scales them
 * by, what moves them, and the backdrop filter, drawn on the picture instead.
 */
const STILL_CSS = `
.browser { transform: none !important; }
.browser, .browser * {
  transition: none !important;
  animation: none !important;
  -webkit-backdrop-filter: none !important;
  backdrop-filter: none !important;
}`;

/** A shape of the bars that blurs the page under it, in the screen's css px, and its corners. */
export interface Glass {
  rect: Rect;
  radius: number;
}

/** The knobs that say which bars a screen shows. */
export type BarsKnobs = Pick<ViewportValue, "device" | "posture" | "orientation" | "browser" | "edgeToEdge">;

/** The bars a screen shows for `value`, expanded or `minimized`, or null where its browser draws none. */
export function barsFor(value: BarsKnobs, minimized: boolean): Bars | null {
  const device = formOf(value.device, value.posture);
  if (!device) return null;
  return barsOf(device, value.orientation, layoutOf(device.id, value.browser), minimized, value.edgeToEdge);
}

/**
 * Where Safari's bars are glass, as it draws them: expanded, every shape but
 * the field in Bottom's card, and minimized, the pill as wide as `host` sets
 * in it, the rest faded out. None of Chrome's, which hide the page.
 */
export function glassOf(bars: Bars, host: string): Glass[] {
  if (bars.platform !== "safari") return [];
  if (!bars.minimized) {
    return bars.shapes
      .filter((shape) => shape.kind !== "field")
      .map(({ x, y, width, height, radius }) => ({ rect: { x, y, width, height }, radius }));
  }
  const pill = bars.shapes.find((shape) => shape.kind === "pill");
  return pill ? [{ rect: pillBox(pill, host), radius: pill.radius }] : [];
}

/** The bars as a screen shows them: their drawing on its way, the screen's css px, and their glass. */
export interface BarsCopy {
  drawing: Promise<HTMLImageElement | null>;
  size: { width: number; height: number };
  glass: Glass[];
}

/** A picture of a screen as the browser draws it, and are its bars drawn in it? */
export interface Drawn {
  shot: HTMLCanvasElement;
  bars: boolean;
}

/**
 * A copy of the bars `shown` over a screen `size` css px, as they are now,
 * drawn by the browser, which it starts at once, and their glass as the knobs
 * `value` have it.
 */
export function copyBars(shown: HTMLElement, value: BarsKnobs, size: { width: number; height: number }): BarsCopy {
  const minimized = shown.querySelector("[data-state]")?.getAttribute("data-state") === "min";
  const bars = barsFor(value, minimized);
  const host = shown.querySelector(".domain")?.textContent ?? "";
  // Their own css, as they live in a shadow root, which a drawing of them is not in.
  const root = document.createElement("div");
  root.setAttribute("style", `all: initial; position: absolute; left: 0; top: 0; width: ${size.width}px; height: ${size.height}px`);
  const style = document.createElement("style");
  style.textContent = BARS_CSS + STILL_CSS;
  root.append(style, shown.cloneNode(true));
  const markup = new XMLSerializer().serializeToString(root);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size.width}" height="${size.height}">` +
    `<foreignObject width="100%" height="100%">${markup}</foreignObject></svg>`;
  const image = new Image();
  // As data, as the page's is, so the picture they go on can still go to the GPU.
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  const drawing = image.decode().then(
    () => image,
    () => null,
  );
  return { drawing, size, glass: bars ? glassOf(bars, host) : [] };
}

/**
 * Draw `bars` over `shot`, a picture of the page on their screen, the
 * picture under their glass blurred first. False where they will not draw.
 */
export async function paintBars(shot: HTMLCanvasElement, bars: BarsCopy): Promise<boolean> {
  const image = await bars.drawing;
  const pen = shot.getContext("2d");
  if (!image || !pen) return false;
  const scale = shot.width / bars.size.width;
  pen.save();
  pen.setTransform(scale, 0, 0, scale, 0, 0);
  // The page as it is, which each glass blurs, before any of the bars go on it.
  const under = bars.glass.length > 0 ? document.createElement("canvas") : null;
  const underPen = under?.getContext("2d");
  if (under && underPen) {
    under.width = shot.width;
    under.height = shot.height;
    underPen.drawImage(shot, 0, 0);
    for (const { rect, radius } of bars.glass) {
      pen.save();
      pen.beginPath();
      pen.roundRect(rect.x, rect.y, rect.width, rect.height, radius);
      pen.clip();
      pen.filter = GLASS;
      const [x, y] = [rect.x - REACH, rect.y - REACH];
      const [width, height] = [rect.width + 2 * REACH, rect.height + 2 * REACH];
      pen.drawImage(under, x * scale, y * scale, width * scale, height * scale, x, y, width, height);
      pen.restore();
    }
  }
  pen.drawImage(image, 0, 0, bars.size.width, bars.size.height);
  pen.restore();
  return true;
}

/** The page once it is painted, `page`, with `bars` drawn over it, where there are any and they draw. */
export async function withBars(page: Promise<HTMLCanvasElement | null>, bars: BarsCopy | null): Promise<Drawn | null> {
  const shot = await page;
  if (!shot) return null;
  return { shot, bars: bars ? await paintBars(shot, bars) : false };
}
