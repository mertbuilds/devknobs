import { describe, expect, test } from "bun:test";
import { luminance, parseColor } from "../src/engine/color";

describe("luminance", () => {
  test("goes from 0 for black to 1 for white", () => {
    expect(luminance(0, 0, 0)).toBe(0);
    expect(luminance(255, 255, 255)).toBeCloseTo(1);
  });

  test("weighs green over red over blue", () => {
    expect(luminance(255, 0, 0)).toBeCloseTo(0.2126);
    expect(luminance(0, 255, 0)).toBeCloseTo(0.7152);
    expect(luminance(0, 0, 255)).toBeCloseTo(0.0722);
  });

  test("puts a middle gray near a fifth", () => {
    expect(luminance(128, 128, 128)).toBeCloseTo(0.2159, 3);
  });
});

describe("parseColor", () => {
  test("reads a computed rgb and rgba", () => {
    expect(parseColor("rgb(22, 22, 22)")).toEqual({ red: 22, green: 22, blue: 22, alpha: 1 });
    expect(parseColor("rgba(0, 0, 0, 0)")).toEqual({ red: 0, green: 0, blue: 0, alpha: 0 });
    expect(parseColor("rgba(255, 0, 10, 0.5)")).toEqual({
      red: 255,
      green: 0,
      blue: 10,
      alpha: 0.5,
    });
  });

  test("reads spaces, a slash and percents", () => {
    expect(parseColor("rgb(10 20 30 / 50%)")).toEqual({ red: 10, green: 20, blue: 30, alpha: 0.5 });
    expect(parseColor("rgb(100% 0% 0%)")).toEqual({ red: 255, green: 0, blue: 0, alpha: 1 });
  });

  test("reads color(srgb), its channels counted to 1", () => {
    expect(parseColor("color(srgb 1 0.5 0 / 0.8)")).toEqual({
      red: 255,
      green: 127.5,
      blue: 0,
      alpha: 0.8,
    });
  });

  test("leaves anything else", () => {
    expect(parseColor("transparent")).toBeNull();
    expect(parseColor("oklch(0.2 0.01 250)")).toBeNull();
    expect(parseColor("color(display-p3 1 0 0)")).toBeNull();
    expect(parseColor("rgb(srgb 1 0 0)")).toBeNull();
    expect(parseColor("rgb(1, 2)")).toBeNull();
    expect(parseColor("")).toBeNull();
  });
});
