import { describe, expect, test } from "bun:test";
import { along, exit, numbers, SPAN, ticks, vertex } from "../src/engine/mat";

describe("ticks", () => {
  test("has one every cell, longer on the major lines and longest on the spans", () => {
    const sizes = ticks(101).map((tick) => [tick.at, tick.size]);
    expect(sizes).toEqual([
      [10, 3],
      [20, 3],
      [30, 3],
      [40, 3],
      [50, 5],
      [60, 3],
      [70, 3],
      [80, 3],
      [90, 3],
      [100, 9],
    ]);
  });

  test("has none at the edge itself or past the end", () => {
    expect(ticks(10)).toEqual([]);
    expect(ticks(0)).toEqual([]);
    expect(ticks(35).map((tick) => tick.at)).toEqual([10, 20, 30]);
  });
});

describe("numbers", () => {
  test("numbers every span that has room for its number", () => {
    expect(numbers(450)).toEqual([100, 200, 300, 400]);
    expect(numbers(420)).toEqual([100, 200, 300]);
    expect(numbers(100)).toEqual([]);
  });

  test("leaves out a number that would run into the stretch something else holds", () => {
    expect(numbers(1000, { from: 390, to: 610 })).toEqual([100, 200, 300, 700, 800, 900]);
    expect(numbers(1000, { from: 425, to: 600 })).toEqual([100, 200, 300, 400, 600, 700, 800, 900]);
  });
});

describe("angle guides", () => {
  const size = { width: 1200, height: 640 };
  const origin = { x: 0, y: 600 };

  test("start on the left edge at the lowest span crossing clear of the bottom", () => {
    expect(vertex(640)).toEqual(origin);
    expect(vertex(629)).toEqual({ x: 0, y: 500 });
    expect(vertex(130)).toEqual({ x: 0, y: 100 });
    expect(vertex(129)).toBeNull();
    for (const height of [131, 457, 900, 1333]) expect(vertex(height)!.y % SPAN).toBe(0);
  });

  test("the 45 degree guide runs through every span crossing on its way", () => {
    for (let k = 1; k <= 6; k++) {
      const at = along(origin, 45, Math.SQRT2 * SPAN * k);
      expect(at.x).toBeCloseTo(SPAN * k, 9);
      expect(at.y).toBeCloseTo(origin.y - SPAN * k, 9);
    }
    const end = exit(origin, 45, size);
    expect(end.y).toBe(0);
    expect(end.x).toBeCloseTo(600, 9);
  });

  test("the 30 and 60 degree guides leave the box where trigonometry says", () => {
    const thirty = exit(origin, 30, size);
    expect(thirty.y).toBe(0);
    expect(Math.abs(thirty.x - 600 * Math.sqrt(3))).toBeLessThan(1e-6);
    const sixty = exit(origin, 60, size);
    expect(sixty.y).toBe(0);
    expect(Math.abs(sixty.x - 600 / Math.sqrt(3))).toBeLessThan(1e-6);
    const wide = exit(origin, 30, { width: 500, height: 640 });
    expect(wide.x).toBe(500);
    expect(Math.abs(wide.y - (600 - 500 / Math.sqrt(3)))).toBeLessThan(1e-6);
  });

  test("end exactly on an edge of the box", () => {
    for (const angle of [15, 30, 45, 60, 75]) {
      const end = exit(origin, angle, size);
      expect(end.x === size.width || end.y === 0).toBe(true);
      expect(end.x).toBeLessThanOrEqual(size.width);
      expect(end.y).toBeGreaterThanOrEqual(0);
    }
  });

  test("set a label off the line to its left", () => {
    const at = along(origin, 0, 240, 3);
    expect(at).toEqual({ x: 240, y: 597 });
    const up = along(origin, 90, 240, 3);
    expect(up.x).toBeCloseTo(-3, 9);
    expect(up.y).toBeCloseTo(360, 9);
  });
});
