import { describe, expect, test } from "bun:test";
import {
  FRAME_GLIDE,
  FRAME_GLIDE_MAX,
  flipOf,
  frameGlideTime,
  type GlideCue,
  glides,
  placeKey,
} from "../src/engine/frameglide";

const RIGHT = { open: true, side: "right" } as const;
const LEFT = { open: true, side: "left" } as const;
const CUE: GlideCue = { first: false, still: false, moving: false, from: RIGHT, to: LEFT };

describe("glides", () => {
  test("glides when the panel goes to the other side", () => {
    expect(glides(CUE)).toBe(true);
  });

  test("glides when the panel opens or closes", () => {
    expect(glides({ ...CUE, to: { ...RIGHT, open: false } })).toBe(true);
    expect(glides({ ...CUE, from: { ...RIGHT, open: false }, to: RIGHT })).toBe(true);
  });

  test("stays put when the panel did not change", () => {
    expect(glides({ ...CUE, to: RIGHT })).toBe(false);
  });

  test("glides when the panel covers more or less beside itself, as its side pane comes and goes", () => {
    expect(glides({ ...CUE, to: { ...RIGHT, beside: 339 } })).toBe(true);
    expect(glides({ ...CUE, from: { ...RIGHT, beside: 339 }, to: RIGHT })).toBe(true);
    expect(glides({ ...CUE, from: { ...RIGHT, beside: 339 }, to: { ...RIGHT, beside: 339 } })).toBe(
      false,
    );
    expect(glides({ ...CUE, to: { ...RIGHT, beside: 0 } })).toBe(false);
    expect(glides({ ...CUE, to: { ...RIGHT, beside: 339 }, first: true })).toBe(false);
  });

  test("never on the first paint, such as a reload", () => {
    expect(glides({ ...CUE, first: true })).toBe(false);
  });

  test("never with less motion", () => {
    expect(glides({ ...CUE, still: true })).toBe(false);
  });

  test("never while a device change, turn or fold moves the frame", () => {
    expect(glides({ ...CUE, moving: true })).toBe(false);
  });
});

describe("flipOf", () => {
  test("moves the frame back to where it showed", () => {
    const before = { x: 100, y: 40, width: 400, height: 800 };
    const after = { x: 360, y: 40, width: 400, height: 800 };
    expect(flipOf(before, after)).toEqual({ x: -260, y: 0, sx: 1, sy: 1 });
  });

  test("scales it back to the size it showed at", () => {
    const before = { x: 100, y: 40, width: 400, height: 800 };
    const after = { x: 80, y: 60, width: 200, height: 400 };
    expect(flipOf(before, after)).toEqual({ x: 20, y: -20, sx: 2, sy: 2 });
  });

  test("is nothing where the frame did not move", () => {
    const rect = { x: 100, y: 40, width: 400, height: 800 };
    expect(flipOf(rect, { ...rect, x: 100.2 })).toBeNull();
  });

  test("leaves the scale alone for a frame with no size", () => {
    const before = { x: 0, y: 0, width: 400, height: 800 };
    expect(flipOf(before, { x: 10, y: 0, width: 0, height: 0 })).toEqual({
      x: -10,
      y: 0,
      sx: 1,
      sy: 1,
    });
  });
});

describe("frameGlideTime", () => {
  test("takes the panel's glide times, longer the farther it goes", () => {
    expect(frameGlideTime(0)).toBe(FRAME_GLIDE);
    expect(frameGlideTime(1800)).toBe(300);
    expect(frameGlideTime(100000)).toBe(FRAME_GLIDE_MAX);
  });
});

describe("placeKey", () => {
  test("changes when the place or the scale does", () => {
    const key = placeKey({ x: 10, y: 20 }, 0.5);
    expect(placeKey({ x: 10, y: 20 }, 0.5)).toBe(key);
    expect(placeKey({ x: 11, y: 20 }, 0.5)).not.toBe(key);
    expect(placeKey({ x: 10, y: 20 }, 0.6)).not.toBe(key);
  });
});
