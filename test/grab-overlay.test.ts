import { describe, expect, test } from "bun:test";
import { boxRadius, labelPlace, LERP, parseRadius, tweenStep } from "../src/grab/overlay";

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
    expect(labelPlace(box, pill, view, 120)).toEqual({ x: 80, y: 154 });
  });

  test("is centered on the box when the keys moved it", () => {
    expect(labelPlace(box, pill, view, null)).toEqual({ x: 110, y: 154 });
  });

  test("follows the pointer no further than the box's sides", () => {
    expect(labelPlace(box, pill, view, 390).x).toBe(210);
    expect(labelPlace(box, pill, view, 0).x).toBe(10);
  });

  test("goes over a box at the bottom, and inside one as tall as the window", () => {
    expect(labelPlace({ ...box, top: 200, bottom: 290 }, pill, view, 120).y).toBe(176);
    expect(labelPlace({ ...box, top: 0, bottom: 300 }, pill, view, 120).y).toBe(8);
  });

  test("stays in the window sideways", () => {
    expect(labelPlace({ ...box, left: 300, right: 400 }, pill, view, 395).x).toBe(312);
    expect(labelPlace({ ...box, left: -40, right: 60 }, pill, view, 2).x).toBe(8);
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
