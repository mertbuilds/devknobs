import { describe, expect, test } from "bun:test";
import { pillPlace, toastPlace } from "../src/grab/overlay";

const view = { width: 400, height: 300 };
const pill = { width: 80, height: 20 };

describe("pillPlace", () => {
  test("sits above the box, at its left edge", () => {
    expect(pillPlace({ top: 100, bottom: 150, left: 50 }, pill, view)).toEqual({ x: 50, y: 76 });
  });

  test("goes below a box at the top, and inside one as tall as the window", () => {
    expect(pillPlace({ top: 10, bottom: 50, left: 50 }, pill, view)).toEqual({ x: 50, y: 54 });
    expect(pillPlace({ top: 0, bottom: 300, left: 50 }, pill, view)).toEqual({ x: 50, y: 4 });
  });

  test("stays in the window sideways", () => {
    expect(pillPlace({ top: 100, bottom: 150, left: 380 }, pill, view).x).toBe(316);
    expect(pillPlace({ top: 100, bottom: 150, left: -40 }, pill, view).x).toBe(4);
  });
});

describe("toastPlace", () => {
  test("sits below the box, or above it at the bottom of the window", () => {
    expect(toastPlace({ top: 100, bottom: 150, left: 50 }, pill, view)).toEqual({ x: 50, y: 154 });
    expect(toastPlace({ top: 200, bottom: 290, left: 50 }, pill, view)).toEqual({ x: 50, y: 176 });
  });
});
