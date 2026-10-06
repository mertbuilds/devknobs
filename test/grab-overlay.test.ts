import { describe, expect, test } from "bun:test";
import {
  type BoxParts,
  boxParts,
  boxRadius,
  labelPlace,
  LERP,
  parseRadius,
  snap,
  TOAST_TIME,
  tweenStep,
} from "../src/grab/overlay";

const view = { width: 400, height: 300 };
const pill = { width: 80, height: 20 };
const frame = 1000 / 60;

describe("tweenStep", () => {
  test("goes a share of the way in one frame at 60 a second", () => {
    const step = tweenStep([0, 0, 100, 100, 2], [100, 50, 200, 100, 12], frame, false);
    expect(step.done).toBe(false);
    expect(step.values[0]).toBeCloseTo(100 * LERP);
    expect(step.values[1]).toBeCloseTo(50 * LERP);
    expect(step.values[2]).toBeCloseTo(100 + 100 * LERP);
    expect(step.values[3]).toBe(100);
    expect(step.values[4]).toBeCloseTo(2 + 10 * LERP);
  });

  test("covers the same ground in one long frame as in two short ones", () => {
    const once = tweenStep([0], [100], 2 * frame, false);
    const half = tweenStep([0], [100], frame, false);
    const twice = tweenStep(half.values, [100], frame, false);
    expect(once.values[0]).toBeCloseTo(twice.values[0] ?? 0);
  });

  test("takes a frame with no time in it as one of a millisecond", () => {
    expect(tweenStep([0], [100], 0, false).values).toEqual(tweenStep([0], [100], 1, false).values);
  });

  test("snaps and is done within half a pixel", () => {
    expect(tweenStep([99.4, 10], [100, 10], frame, false)).toEqual({ values: [100, 10], done: true });
    expect(tweenStep([0, 10], [100, 10], frame, false).done).toBe(false);
  });

  test("settles in about a sixth of a second", () => {
    let values = [0, 0];
    let frames = 0;
    for (let done = false; !done && frames < 100; frames++) {
      ({ values, done } = tweenStep(values, [200, 100], frame, false));
    }
    expect(values).toEqual([200, 100]);
    expect(frames * frame).toBeGreaterThan(100);
    expect(frames * frame).toBeLessThan(300);
  });

  test("is there at once with reduced motion", () => {
    expect(tweenStep([0, 0], [100, 50], frame, true)).toEqual({ values: [100, 50], done: true });
  });
});

describe("labelPlace", () => {
  const box = { top: 100, bottom: 150, left: 50, right: 250 };

  test("sits under the box, centered on the pointer", () => {
    expect(labelPlace(box, pill, view, 120)).toEqual({ x: 80, y: 156 });
  });

  test("is centered on the box when the keys moved it", () => {
    expect(labelPlace(box, pill, view, null)).toEqual({ x: 110, y: 156 });
  });

  test("follows the pointer no further than the box's sides", () => {
    expect(labelPlace(box, pill, view, 390).x).toBe(210);
    expect(labelPlace(box, pill, view, 0).x).toBe(10);
  });

  test("goes over a box at the bottom, and inside one as tall as the window", () => {
    expect(labelPlace({ ...box, top: 200, bottom: 290 }, pill, view, 120).y).toBe(174);
    expect(labelPlace({ ...box, top: 0, bottom: 300 }, pill, view, 120).y).toBe(8);
  });

  test("stays in the window sideways", () => {
    expect(labelPlace({ ...box, left: 300, right: 400 }, pill, view, 395).x).toBe(312);
    expect(labelPlace({ ...box, left: -40, right: 60 }, pill, view, 2).x).toBe(8);
  });
});

describe("toast", () => {
  test("stays a second and a half, and the box with it", () => {
    expect(TOAST_TIME).toBe(1500);
  });
});

describe("radius", () => {
  test("reads the first px length of a computed radius", () => {
    expect(parseRadius("8px")).toBe(8);
    expect(parseRadius("12.5px 4px")).toBe(12.5);
    expect(parseRadius("0px")).toBe(0);
    expect(parseRadius("50%")).toBe(0);
    expect(parseRadius("")).toBe(0);
  });

  test("keeps to a half of the short side, and to the least", () => {
    expect(boxRadius(8, 100, 40)).toBe(8);
    expect(boxRadius(9999, 100, 40)).toBe(20);
    expect(boxRadius(0, 100, 40)).toBe(2);
    expect(boxRadius(8, 100, 2)).toBe(2);
  });
});

describe("snap", () => {
  test("puts a length on a whole device pixel", () => {
    expect(snap(10.3, 1)).toBe(10);
    expect(snap(10.3, 2)).toBe(10.5);
    expect(snap(10.2, 2)).toBe(10);
    expect(snap(-0.3, 2)).toBe(-0.5);
  });
});

/** The pieces of the box that are stretched. */
const STRETCHED = ["top", "bottom", "left", "right", "middle", "west", "east"] as const;

/** A length in device pixels, whole where it was a hair off one. */
function device(px: number, ratio: number): number {
  const value = px * ratio;
  return Math.abs(value - Math.round(value)) < 1e-6 ? Math.round(value) : value;
}

/** Every piece of a box in device pixels from the box's corner: left, top, right and bottom. */
function deviceRects(parts: BoxParts, ratio: number): [number, number, number, number][] {
  const rect = (transform: string): [number, number, number, number] => {
    const [x = 0, y = 0, across, down] = (transform.match(/-?[\d.]+(?:e-?\d+)?/g) ?? []).map(Number);
    const left = device(x, ratio);
    const top = device(y, ratio);
    return [
      left,
      top,
      left + (across ?? device(parts.corner.width, ratio)),
      top + (down ?? device(parts.corner.height, ratio)),
    ];
  };
  return [
    rect("translate(0px, 0px)"),
    ...(["top right", "bottom left", "bottom right"] as const).map((piece) => rect(parts.pieces[piece])),
    ...STRETCHED.map((piece) => rect(parts.pieces[piece])),
  ];
}

describe("boxParts", () => {
  test("puts the box and its far corners where the shape is", () => {
    const parts = boxParts([20, 40, 200, 100, 8], 8, 1);
    expect(parts.at).toBe("translate(20px, 40px)");
    expect(parts.corner).toEqual({ width: 8, height: 8, radius: 8 });
    expect(parts.pieces["top right"]).toBe("translate(192px, 0px)");
    expect(parts.pieces["bottom left"]).toBe("translate(0px, 92px)");
    expect(parts.pieces["bottom right"]).toBe("translate(192px, 92px)");
  });

  test("stretches the lines and the fills between the corners, with none over another", () => {
    const { pieces } = boxParts([20, 40, 200, 100, 8], 8, 1);
    expect(pieces.top).toBe("translate(8px, 0px) scale(184, 1)");
    expect(pieces.bottom).toBe("translate(8px, 99px) scale(184, 1)");
    expect(pieces.left).toBe("translate(0px, 8px) scale(1, 84)");
    expect(pieces.right).toBe("translate(199px, 8px) scale(1, 84)");
    expect(pieces.middle).toBe("translate(8px, 1px) scale(184, 98)");
    expect(pieces.west).toBe("translate(1px, 8px) scale(7, 84)");
    expect(pieces.east).toBe("translate(192px, 8px) scale(7, 84)");
  });

  test("keeps every side on a whole device pixel", () => {
    const parts = boxParts([20.3, 40.6, 100.2, 50.3, 4], 4, 2);
    expect(parts.at).toBe("translate(20.5px, 40.5px)");
    // The right side is at 120.5 and the bottom at 91, as the element's own are.
    expect(parts.pieces["bottom right"]).toBe("translate(96px, 46.5px)");
    expect(parts.pieces.top).toBe("translate(4px, 0px) scale(184, 2)");
  });

  test("draws a line a whole device pixel wide, and at least one", () => {
    expect(boxParts([0, 0, 100, 100, 4], 4, 2).pieces.left).toBe("translate(0px, 4px) scale(2, 184)");
    expect(boxParts([0, 0, 90, 90, 6], 6, 1.5).pieces.left).toBe("translate(0px, 6px) scale(1, 117)");
    expect(boxParts([0, 0, 100, 100, 4], 4, 0.5).pieces.left).toBe("translate(0px, 4px) scale(1, 46)");
  });

  test("stretches one device pixel, by whole device pixels", () => {
    expect(boxParts([0, 0, 100, 100, 4], 4, 1).unit).toBe(1);
    expect(boxParts([0, 0, 100, 100, 4], 4, 2).unit).toBe(0.5);
    for (const ratio of [1.25, 1.5, 2.2]) {
      const parts = boxParts([20.3, 40.6, 100.2, 50.3, 6], 6, ratio);
      expect(parts.unit).toBe(1 / ratio);
      for (const piece of STRETCHED) {
        const [across = "", down = ""] = /scale\((.+), (.+)\)/.exec(parts.pieces[piece])?.slice(1) ?? [];
        expect(across).toMatch(/^\d+$/);
        expect(down).toMatch(/^\d+$/);
      }
    }
  });

  test("the pieces meet with no gap and none over another, where a px is no whole device pixel", () => {
    for (const ratio of [1.25, 1.5, 2.2]) {
      const shape = [20.3, 40.6, 100.2, 50.3, 6];
      const rects = deviceRects(boxParts(shape, 6, ratio), ratio);
      const wide = Math.round((snap(20.3 + 100.2, ratio) - snap(20.3, ratio)) * ratio);
      const tall = Math.round((snap(40.6 + 50.3, ratio) - snap(40.6, ratio)) * ratio);
      let area = 0;
      for (const [index, [left, top, right, bottom]] of rects.entries()) {
        for (const side of [left, top, right, bottom]) expect(Number.isInteger(side)).toBe(true);
        expect(left).toBeGreaterThanOrEqual(0);
        expect(top).toBeGreaterThanOrEqual(0);
        expect(right).toBeLessThanOrEqual(wide);
        expect(bottom).toBeLessThanOrEqual(tall);
        area += (right - left) * (bottom - top);
        for (const [otherLeft, otherTop, otherRight, otherBottom] of rects.slice(index + 1)) {
          const apart =
            right <= otherLeft || otherRight <= left || bottom <= otherTop || otherBottom <= top;
          expect(apart).toBe(true);
        }
      }
      // Inside the box, none over another, and as much as the box in all: every pixel once.
      expect(area).toBe(wide * tall);
    }
  });

  test("takes the radius it is given, not the shape's own", () => {
    expect(boxParts([0, 0, 200, 100, 2], 12, 1).corner.radius).toBe(12);
  });

  test("rounds no more than half of the short side, while the box is still small", () => {
    const parts = boxParts([0, 0, 200, 30, 2], 100, 1);
    expect(parts.corner).toEqual({ width: 15, height: 15, radius: 15 });
    expect(parts.pieces.left).toBe("translate(0px, 15px) scale(1, 0)");
  });

  test("is two lines wide and tall at the least, as a box with a border is", () => {
    const parts = boxParts([10, 10, 0, 0, 2], 2, 1);
    expect(parts.corner).toEqual({ width: 1, height: 1, radius: 1 });
    expect(parts.pieces["bottom right"]).toBe("translate(1px, 1px)");
  });
});
