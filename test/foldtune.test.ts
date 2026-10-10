import { afterEach, describe, expect, test } from "bun:test";
import { blurReach, blurShare, freeBand, freeDepth, freeShades, paneLook, turnBlur } from "../src/engine/fold";
import { blurAt, screenLook } from "../src/engine/foldgl";
import {
  foldTune,
  installTune,
  resetTune,
  TUNE_DEFAULTS,
  TUNE_KEY,
  tune,
  tuneChanges,
} from "../src/engine/foldtune";

afterEach(() => {
  resetTune();
});

describe("the fold's numbers", () => {
  test("start as they ship, and are handed out as a copy", () => {
    expect(foldTune.get()).toEqual(TUNE_DEFAULTS);
    expect(tune).toEqual(TUNE_DEFAULTS);
    foldTune.get().blurMost = 1;
    expect(tune.blurMost).toBe(TUNE_DEFAULTS.blurMost);
    // The hinge side all but sharp, and the widest blur three eighths of the 128 css px it was.
    expect(TUNE_DEFAULTS.blurMost).toBe(48);
    expect(TUNE_DEFAULTS.blurHinge).toBe(0.04);
    expect(TUNE_DEFAULTS.blurRise).toBe(2);
    expect(TUNE_DEFAULTS.blurAngle).toBe(90);
  });

  test("lists every number once, as it ships and as it is, in a range that holds both", () => {
    const { spec } = foldTune;
    expect(spec.map((row): string => row.key).sort()).toEqual(Object.keys(TUNE_DEFAULTS).sort());
    for (const row of spec) {
      expect(row.default).toBe(TUNE_DEFAULTS[row.key]);
      expect(row.value).toBe(row.default);
      expect(row.min).toBeLessThan(row.max);
      expect(row.default).toBeGreaterThanOrEqual(row.min);
      expect(row.default).toBeLessThanOrEqual(row.max);
      expect(row.step).toBeGreaterThan(0);
      expect(row.step).toBeLessThanOrEqual((row.max - row.min) / 10);
      expect(row.label).toMatch(/^[a-z]+( [a-z]+){1,3}$/);
      expect(row.hint.length).toBeGreaterThan(10);
    }
    // From no blur to well past the 128 css px it was at its widest.
    const most = spec.find((row) => row.key === "blurMost");
    expect(most?.min).toBe(0);
    expect(most?.max).toBeGreaterThan(128);
    foldTune.set("blurMost", 100);
    expect(foldTune.spec.find((row) => row.key === "blurMost")?.value).toBe(100);
  });

  test("are held to their range, and tell who listens of each change, once", () => {
    let heard = 0;
    const stop = foldTune.subscribe(() => heard++);
    const before = tuneChanges();
    foldTune.set("blurMost", 1e6);
    expect(tune.blurMost).toBe(256);
    foldTune.set("blurHinge", -3);
    expect(tune.blurHinge).toBe(0);
    expect(heard).toBe(2);
    expect(tuneChanges()).toBe(before + 2);
    // What changes nothing tells no one: the same value, a key it does not have, what is not a number.
    foldTune.set("blurHinge", 0);
    foldTune.set("nothing", 3);
    foldTune.set("blurMost", Number.NaN);
    expect(heard).toBe(2);
    expect(foldTune.get()).not.toHaveProperty("nothing");
    foldTune.reset();
    expect(heard).toBe(3);
    expect(tune).toEqual(TUNE_DEFAULTS);
    foldTune.reset();
    expect(heard).toBe(3);
    stop();
    foldTune.set("blurMost", 10);
    expect(heard).toBe(3);
  });

  test("are what the blur is drawn by, by WebGL2 and by the layers", () => {
    foldTune.set("blurMost", 100);
    expect(turnBlur(0.5)).toBe(100);
    expect(blurAt(screenLook(0.5, 0), 1, 1e4)).toBe(100);
    expect(paneLook("inner", 0.5).blurs[2]?.most).toBeCloseTo(Math.log2(100 / 32) / 2, 3);
    foldTune.set("blurHinge", 0.5);
    expect(blurShare(0)).toBe(0.5);
    expect(blurAt(screenLook(0.5, 0), 0, 1e4)).toBe(50);
    expect(paneLook("inner", 0.5).blurs[0]?.least).toBe(1);
    foldTune.set("blurRise", 1);
    expect(blurShare(0.5)).toBe(0.75);
    expect(blurReach(0.75)).toBeCloseTo(0.5, 9);
    // Widest where the hinge is set to have it, and still none lying flat.
    foldTune.set("blurAngle", 120);
    expect(turnBlur(120 / 180)).toBe(100);
    expect(turnBlur(0.5)).toBeLessThan(100);
    expect(turnBlur(0)).toBe(0);
    expect(turnBlur(1)).toBe(0);
    foldTune.set("blurStand", 1);
    expect(turnBlur(5 / 6)).toBeCloseTo(50, 9);
    foldTune.set("blurMost", 0);
    expect(paneLook("inner", 0.5).blurs).toEqual([null, null, null]);
    expect(blurAt(screenLook(0.5, 0), 1, 1e4)).toBe(0);
  });

  test("are what the ends' blur and the free edge's dark are drawn by", () => {
    foldTune.set("edgeHinge", 1);
    foldTune.set("edgeFree", 2);
    expect(screenLook(0.9, 10).edge).toEqual([10, 20]);
    foldTune.set("darkMost", 0.2);
    expect(freeDepth(0.5)).toBe(0.2);
    expect(screenLook(0.5, 0).dark).toBe(0.2);
    foldTune.set("darkFrom", 0.6);
    expect(freeBand(0.6)).toBe(0);
    expect(freeBand(0.7)).toBeGreaterThan(0);
    // Its stops stay in order along the half, however wide its strip.
    foldTune.set("darkBand", 0.5);
    const stops = freeShades(0.5, 1).map(([at]) => at);
    expect(stops).toEqual([...stops].sort((a, b) => a - b));
  });

  test("go on the page's window, where it has one", () => {
    const own = Object.getOwnPropertyDescriptor(globalThis, "window");
    const page = {};
    try {
      Reflect.deleteProperty(globalThis, "window");
      expect(() => installTune()).not.toThrow();
      Object.defineProperty(globalThis, "window", { configurable: true, value: page });
      installTune();
      expect(Reflect.get(page, TUNE_KEY)).toBe(foldTune);
      expect(TUNE_KEY === Symbol.for("devknobs.foldtune")).toBe(true);
    } finally {
      if (own) Object.defineProperty(globalThis, "window", own);
      else Reflect.deleteProperty(globalThis, "window");
    }
  });
});
