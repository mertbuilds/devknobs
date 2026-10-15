import { describe, expect, test } from "bun:test";
import { contrast, luminance, parseColor } from "../src/engine/color";
import { along, exit, MAT_CSS, numbers, SPAN, ticks, vertex } from "../src/engine/mat";
import {
  isMatName,
  MAT_COLOR_NAMES,
  MAT_COLORS,
  matGradient,
  matPaint,
  putMat,
} from "../src/engine/matcolors";

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
    for (const height of [131, 457, 900, 1333]) expect((vertex(height)?.y ?? 1) % SPAN).toBe(0);
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

describe("mat colors", () => {
  test("offers blue first, as it always was, then the others", () => {
    expect(MAT_COLOR_NAMES).toEqual(["blue", "green", "magenta", "purple", "red", "graphite"]);
    expect(Object.keys(MAT_COLORS).sort()).toEqual([...MAT_COLOR_NAMES].sort());
    expect(matGradient(MAT_COLORS.blue.srgb)).toBe(
      "radial-gradient(140% 100% at 50% 0%, rgb(20, 70, 152), rgb(12, 48, 114) 60%, rgb(7, 31, 80))",
    );
    expect(MAT_COLORS.blue.line).toBe("rgb(170, 205, 255)");
  });

  test("each is dark under light lines, lighter up top, and has its stops in P3 too", () => {
    for (const name of MAT_COLOR_NAMES) {
      const paint = MAT_COLORS[name];
      const stops = paint.srgb.map((stop) => parseColor(stop));
      const line = parseColor(paint.line);
      if (!line || stops.some((stop) => !stop)) throw new Error(`${name} does not parse`);
      const sum = (color: { red: number; green: number; blue: number } | null) =>
        color ? color.red + color.green + color.blue : 0;
      expect(sum(stops[0])).toBeGreaterThan(sum(stops[1]));
      expect(sum(stops[1])).toBeGreaterThan(sum(stops[2]));
      expect(sum(line)).toBeGreaterThan(2 * sum(stops[0]));
      for (const stop of paint.p3) expect(stop).toStartWith("color(display-p3 ");
    }
  });

  test("set as variables on the element that names the color", () => {
    for (const name of MAT_COLOR_NAMES) {
      expect(MAT_CSS).toContain(`[data-mat="${name}"] { --mat: ${matGradient(MAT_COLORS[name].srgb)};`);
    }
    expect(MAT_CSS).toContain("fill: var(--mat-line);");
  });
});

describe("a mat color of the user's own", () => {
  /** A css `rgb()` as its relative luminance. */
  const light = (css: string): number => {
    const color = parseColor(css);
    if (!color) throw new Error(`${css} does not parse`);
    return luminance(color.red, color.green, color.blue);
  };

  test("is the color itself up top and deeper toward the edges, the same in P3", () => {
    const paint = matPaint("#1e90ff");
    expect(paint.srgb).toEqual(["rgb(30, 144, 255)", "rgb(25, 118, 209)", "rgb(19, 92, 163)"]);
    expect(paint.p3).toEqual(paint.srgb);
  });

  test("has light lines on a dark color and dark lines on a light one", () => {
    for (const hex of ["#000000", "#101820", "#5a1f8a", "#144698"]) {
      const paint = matPaint(hex);
      expect(light(paint.line)).toBeGreaterThan(0.7);
    }
    for (const hex of ["#ffffff", "#ffff00", "#f5f5dc", "#9be8c2"]) {
      const paint = matPaint(hex);
      expect(light(paint.line)).toBeLessThan(0.05);
    }
  });

  test("keeps its lines and numbers legible on every stop, on white and yellow too", () => {
    for (const hex of ["#ffffff", "#ffff00", "#000000", "#144698"]) {
      const paint = matPaint(hex);
      for (const stop of paint.srgb) {
        expect(contrast(light(paint.line), light(stop))).toBeGreaterThan(4.5);
      }
    }
  });

  test("is one of the mat's own by its name, and blue for what is neither", () => {
    expect(matPaint("green")).toBe(MAT_COLORS.green);
    expect(matPaint("teal")).toBe(MAT_COLORS.blue);
    expect(matPaint("#FFF")).toBe(MAT_COLORS.blue);
    expect(matPaint("#12345g")).toBe(MAT_COLORS.blue);
    expect(isMatName("graphite")).toBe(true);
    expect(isMatName("#1e90ff")).toBe(false);
  });
});

describe("putMat", () => {
  /** A node as far as `putMat` reaches: its attributes and its own style. */
  function stubNode(): {
    node: HTMLElement;
    attributes: Map<string, string>;
    style: Map<string, string>;
  } {
    const attributes = new Map<string, string>();
    const style = new Map<string, string>();
    const node = {
      setAttribute: (name: string, value: string) => attributes.set(name, value),
      removeAttribute: (name: string) => attributes.delete(name),
      style: {
        setProperty: (name: string, value: string) => style.set(name, value),
        removeProperty: (name: string) => style.delete(name),
      },
    };
    return { node: node as unknown as HTMLElement, attributes, style };
  }

  test("names one of the mat's own, whose rule paints it", () => {
    const { node, attributes, style } = stubNode();
    putMat(node, "green");
    expect(attributes.get("data-mat")).toBe("green");
    expect(style.size).toBe(0);
  });

  test("puts the paint of one of the user's own on the node itself", () => {
    const { node, attributes, style } = stubNode();
    putMat(node, "#ffff00");
    const paint = matPaint("#ffff00");
    expect(attributes.get("data-mat")).toBe("#ffff00");
    expect(style.get("--mat")).toBe(matGradient(paint.srgb));
    expect(style.get("--mat-p3")).toBe(matGradient(paint.p3));
    expect(style.get("--mat-line")).toBe(paint.line);
  });

  test("takes the paint off again for one of the mat's own, and for none", () => {
    const { node, attributes, style } = stubNode();
    putMat(node, "#ffff00");
    putMat(node, "red");
    expect(attributes.get("data-mat")).toBe("red");
    expect(style.size).toBe(0);
    putMat(node, "#ffff00");
    putMat(node, null);
    expect(attributes.has("data-mat")).toBe(false);
    expect(style.size).toBe(0);
  });
});
