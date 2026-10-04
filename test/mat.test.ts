import { describe, expect, test } from "bun:test";
import { numbers, ticks } from "../src/engine/mat";

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
