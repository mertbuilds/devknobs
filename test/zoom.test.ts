import { describe, expect, test } from "bun:test";
import { type Fit, fit, origin, STRIP } from "../src/engine/width";
import {
  anchorScroll,
  clampZoom,
  percent,
  type Point,
  stepZoom,
  wheelZoom,
  ZOOM_MAX,
  ZOOM_MIN,
} from "../src/engine/zoom";

const BOX = { width: 1200, height: 800 + STRIP };
const ROOM = { width: 1200, height: 800 };
const PHONE = { width: 402, height: 874 } as const;
const DESKTOP = { width: 1920, height: 1080 } as const;

describe("percent", () => {
  test("says a scale as a whole percent", () => {
    expect(percent(1)).toBe("100%");
    expect(percent(1.25)).toBe("125%");
    expect(percent(0.54463)).toBe("54%");
  });
});

describe("clampZoom", () => {
  test("keeps a scale between the smallest and the largest", () => {
    expect(clampZoom(0.01)).toBe(ZOOM_MIN);
    expect(clampZoom(1.3)).toBe(1.3);
    expect(clampZoom(40)).toBe(ZOOM_MAX);
  });
});

describe("stepZoom", () => {
  test("steps through the browser's zoom levels", () => {
    expect(stepZoom(1, 1)).toBe(1.1);
    expect(stepZoom(1, -1)).toBe(0.9);
    expect(stepZoom(1.25, 1)).toBe(1.5);
    expect(stepZoom(0.5, -1)).toBe(0.33);
  });

  test("steps from a scale between levels, such as a fit, to the next one", () => {
    expect(stepZoom(0.57, 1)).toBe(0.67);
    expect(stepZoom(0.57, -1)).toBe(0.5);
  });

  test("stops at the ends", () => {
    expect(stepZoom(ZOOM_MAX, 1)).toBe(ZOOM_MAX);
    expect(stepZoom(ZOOM_MIN, -1)).toBe(ZOOM_MIN);
  });
});

describe("wheelZoom", () => {
  test("zooms in on a wheel up and out on a wheel down", () => {
    expect(wheelZoom(1, -4)).toBeGreaterThan(1);
    expect(wheelZoom(1, 4)).toBeLessThan(1);
  });

  test("moves a pinch a little, and a mouse notch no more than a tenth", () => {
    expect(wheelZoom(1, -2)).toBeCloseTo(Math.exp(0.02));
    expect(wheelZoom(1, 100)).toBeCloseTo(Math.exp(-0.1));
    expect(wheelZoom(1, -100)).toBeCloseTo(Math.exp(0.1));
  });

  test("stays between the smallest and the largest", () => {
    expect(wheelZoom(ZOOM_MIN, 100)).toBe(ZOOM_MIN);
    expect(wheelZoom(ZOOM_MAX, -100)).toBe(ZOOM_MAX);
  });
});

/** The point of the frame, in its css px, under `pointer` with the stage scrolled to `scroll`. */
function under(place: Fit, scroll: Point, pointer: Point): Point {
  const at = origin(place, ROOM);
  return {
    x: (scroll.x + pointer.x - at.x) / place.scale,
    y: (scroll.y + pointer.y - at.y) / place.scale,
  };
}

/** Zoom from one place to another around `pointer`, and say what is under it before and after. */
function zoom(from: Fit, to: Fit, scroll: Point, pointer: Point): { before: Point; after: Point } {
  const next = anchorScroll(
    pointer,
    scroll,
    { origin: origin(from, ROOM), scale: from.scale },
    { origin: origin(to, ROOM), scale: to.scale },
  );
  return { before: under(from, scroll, pointer), after: under(to, next, pointer) };
}

describe("anchorScroll", () => {
  test("keeps the point under the pointer from fit to a zoom bigger than the room", () => {
    const from = fit({ ...PHONE, zoom: "fit" }, BOX);
    const to = fit({ ...PHONE, zoom: 1.5 }, BOX);
    const { before, after } = zoom(from, to, { x: 0, y: 0 }, { x: 640, y: 300 });
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  test("keeps it while scrolled, zooming further in and back out", () => {
    const at = fit({ ...DESKTOP, zoom: 1.25 }, BOX);
    const closer = fit({ ...DESKTOP, zoom: 2 }, BOX);
    const scroll = { x: 700, y: 400 };
    const pointer = { x: 300, y: 500 };
    const inward = zoom(at, closer, scroll, pointer);
    expect(inward.after.x).toBeCloseTo(inward.before.x);
    expect(inward.after.y).toBeCloseTo(inward.before.y);
    const outward = zoom(closer, at, scroll, pointer);
    expect(outward.after.x).toBeCloseTo(outward.before.x);
    expect(outward.after.y).toBeCloseTo(outward.before.y);
  });

  test("scrolls to the edges a zoom adds, with the middle of a frame at the middle", () => {
    const from = fit({ ...DESKTOP, zoom: "fit" }, BOX);
    const to = fit({ ...DESKTOP, zoom: 1 }, BOX);
    const middle = { x: ROOM.width / 2, y: ROOM.height / 2 };
    const next = anchorScroll(
      middle,
      { x: 0, y: 0 },
      { origin: origin(from, ROOM), scale: from.scale },
      { origin: origin(to, ROOM), scale: to.scale },
    );
    expect(next.x).toBeCloseTo((to.box.width - ROOM.width) / 2);
    expect(next.y).toBeCloseTo((to.box.height - ROOM.height) / 2);
  });
});
