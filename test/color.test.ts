import { describe, expect, test } from "bun:test";
import {
  contrast,
  inkOn,
  isCustomColor,
  luminance,
  parseColor,
  parseHex,
  readColor,
  toHex,
} from "../src/engine/color";

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

describe("readColor", () => {
  test("reads a hex of three or six digits, in either case, with or without its #", () => {
    expect(readColor("#1e90ff")).toBe("#1e90ff");
    expect(readColor("#1E90FF")).toBe("#1e90ff");
    expect(readColor("  #fa0 ")).toBe("#ffaa00");
    expect(readColor("1e90ff")).toBe("#1e90ff");
    expect(readColor("FFF")).toBe("#ffffff");
  });

  test("reads a solid rgb(), with commas or spaces, its channels rounded", () => {
    expect(readColor("rgb(30, 144, 255)")).toBe("#1e90ff");
    expect(readColor("rgb(30 144 255)")).toBe("#1e90ff");
    expect(readColor("RGB(0, 0, 0)")).toBe("#000000");
    expect(readColor("rgb(100% 0% 0%)")).toBe("#ff0000");
    expect(readColor("rgba(30, 144, 255, 1)")).toBe("#1e90ff");
    expect(readColor("rgb(29.6, 144.4, 255)")).toBe("#1e90ff");
  });

  test("leaves what is no color, a color that is not solid and a channel out of range", () => {
    for (const text of [
      "",
      "#",
      "#12",
      "#1234",
      "#12345",
      "#1234567",
      "#ggg",
      "red",
      "rgb(1, 2)",
      "rgb(256, 0, 0)",
      "rgb(-1, 0, 0)",
      "rgba(30, 144, 255, 0.5)",
      "hsl(210 100% 56%)",
      "url(javascript:1)",
      "#fff; background: red",
    ]) {
      expect(readColor(text)).toBeNull();
    }
  });
});

describe("a custom color", () => {
  test("is a hex of six lower case digits and nothing else", () => {
    expect(isCustomColor("#1e90ff")).toBe(true);
    expect(isCustomColor("#1E90FF")).toBe(false);
    expect(isCustomColor("#fff")).toBe(false);
    expect(isCustomColor("blue")).toBe(false);
    expect(isCustomColor("#1e90ff;")).toBe(false);
    expect(isCustomColor(0x1e90ff)).toBe(false);
  });

  test("goes to a color and back", () => {
    expect(parseHex("#1e90ff")).toEqual({ red: 30, green: 144, blue: 255, alpha: 1 });
    expect(parseHex("#FA0")).toEqual({ red: 255, green: 170, blue: 0, alpha: 1 });
    expect(parseHex("1e90ff")).toBeNull();
    expect(toHex({ red: 30, green: 144, blue: 255 })).toBe("#1e90ff");
    expect(toHex({ red: -4, green: 300, blue: 7.5 })).toBe("#00ff08");
  });
});

describe("inkOn", () => {
  const ground = (hex: string) => {
    const color = parseHex(hex);
    if (!color) throw new Error(`${hex} does not parse`);
    return color;
  };
  const light = (hex: string) => {
    const ink = inkOn(ground(hex), [ground(hex)]);
    return luminance(ink.red, ink.green, ink.blue) > 0.5;
  };

  test("is light on a dark color and dark on a light one", () => {
    for (const hex of ["#000000", "#144698", "#7b2558", "#404040", "#800000"]) {
      expect(light(hex)).toBe(true);
    }
    for (const hex of ["#ffffff", "#ffff00", "#fafad2", "#c0c0c0", "#00ff00"]) {
      expect(light(hex)).toBe(false);
    }
  });

  test("keeps the hue of the color it is the ink of", () => {
    expect(toHex(inkOn(ground("#144698"), [ground("#144698")]))).toBe("#e8edf5");
    expect(toHex(inkOn(ground("#ffff00"), [ground("#ffff00")]))).toBe("#1a1a00");
  });

  /** The least an ink stands out from a color and a deeper shade of it. */
  const least = (hex: string): number => {
    const color = ground(hex);
    const deep = {
      ...color,
      red: color.red * 0.64,
      green: color.green * 0.64,
      blue: color.blue * 0.64,
    };
    const ink = inkOn(color, [color, deep]);
    const own = luminance(ink.red, ink.green, ink.blue);
    return Math.min(
      ...[color, deep].map((under) =>
        contrast(own, luminance(under.red, under.green, under.blue)),
      ),
    );
  };

  test("stands out from the ground it stands out from least", () => {
    // A color in the middle is the hardest: neither ink is far from all of it.
    for (const hex of ["#808080", "#ff0000", "#1e90ff", "#ff8c00"]) {
      expect(least(hex)).toBeGreaterThan(2.5);
    }
    for (const hex of ["#000000", "#ffffff", "#ffff00", "#144698"]) {
      expect(least(hex)).toBeGreaterThan(4.5);
    }
  });
});

describe("contrast", () => {
  test("goes from 1 for the same to 21 for black on white, either way round", () => {
    expect(contrast(0.4, 0.4)).toBe(1);
    expect(contrast(0, 1)).toBeCloseTo(21);
    expect(contrast(1, 0)).toBeCloseTo(21);
  });
});
