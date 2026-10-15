import { describe, expect, test } from "bun:test";
import type { Color } from "../src/engine/color";
import {
  aaRatio,
  composite,
  contrastRatio,
  effectiveBackground,
  parseCss,
  passesAA,
  shortColor,
  WALK_CAP,
  walkBackgrounds,
} from "../src/grab/colorvalue";

const rgb = (red: number, green: number, blue: number, alpha = 1): Color => ({ red, green, blue, alpha });
const WHITE = rgb(255, 255, 255);
const BLACK = rgb(0, 0, 0);

/** A color with its channels on whole numbers and its alpha on hundredths, to compare by. */
function whole(color: Color | null): Color | null {
  if (!color) return null;
  return {
    red: Math.round(color.red),
    green: Math.round(color.green),
    blue: Math.round(color.blue),
    alpha: Math.round(color.alpha * 100) / 100,
  };
}

describe("a css color", () => {
  const table: [string, Color | null][] = [
    ["#fff", WHITE],
    ["#000000", BLACK],
    ["#2563eb", rgb(37, 99, 235)],
    ["#2563EB", rgb(37, 99, 235)],
    ["#f00a", rgb(255, 0, 0, 0.67)],
    ["#11223380", rgb(17, 34, 51, 0.5)],
    ["rgb(37, 99, 235)", rgb(37, 99, 235)],
    ["rgba(37, 99, 235, 0.5)", rgb(37, 99, 235, 0.5)],
    ["rgb(37 99 235 / 50%)", rgb(37, 99, 235, 0.5)],
    ["rgb(100% 0% 0%)", rgb(255, 0, 0)],
    ["rgba(0, 0, 0, 0)", rgb(0, 0, 0, 0)],
    ["  RGB(1, 2, 3)  ", rgb(1, 2, 3)],
    ["hsl(0, 100%, 50%)", rgb(255, 0, 0)],
    ["hsl(120 100% 25%)", rgb(0, 128, 0)],
    ["hsla(240, 100%, 50%, 0.25)", rgb(0, 0, 255, 0.25)],
    ["hsl(0.5turn 100% 50% / 50%)", rgb(0, 255, 255, 0.5)],
    ["hsl(-120deg 100% 50%)", rgb(0, 0, 255)],
    ["hsl(210 40% 96%)", rgb(241, 245, 249)],
    ["color(srgb 1 0.5 0)", rgb(255, 128, 0)],
    ["color(srgb 0 0 0 / 0.4)", rgb(0, 0, 0, 0.4)],
    ["transparent", rgb(0, 0, 0, 0)],
    ["red", rgb(255, 0, 0)],
    ["White", WHITE],
    ["rebeccapurple", rgb(102, 51, 153)],
    ["grey", rgb(128, 128, 128)],
    // What only the browser can paint, or is no color at all.
    ["color(display-p3 1 0 0)", null],
    ["oklch(0.7 0.2 30)", null],
    ["#12", null],
    ["#ggg", null],
    ["hsl(120)", null],
    ["currentcolor", null],
    ["constructor", null],
    ["", null],
  ];

  test.each(table)("%s", (text, color) => {
    expect(whole(parseCss(text))).toEqual(color);
  });

  test("the table has more than twenty that read", () => {
    expect(table.filter(([, color]) => color !== null).length).toBeGreaterThan(20);
  });
});

describe("one color over another", () => {
  test("a solid one covers what is under it, and a clear one leaves it", () => {
    expect(composite(rgb(10, 20, 30), WHITE)).toEqual(rgb(10, 20, 30));
    expect(composite(rgb(10, 20, 30, 0), WHITE)).toEqual(WHITE);
  });

  test("half of black over white is the grey between them", () => {
    expect(composite(rgb(0, 0, 0, 0.5), WHITE)).toEqual(rgb(127.5, 127.5, 127.5));
  });

  test("two clear ones are more solid together, each by its share", () => {
    const both = composite(rgb(255, 0, 0, 0.5), rgb(0, 0, 255, 0.5));
    expect(both.alpha).toBe(0.75);
    expect(whole(both)).toEqual(rgb(170, 0, 85, 0.75));
    expect(composite(rgb(1, 2, 3, 0), rgb(4, 5, 6, 0)).alpha).toBe(0);
  });
});

describe("a color's short form", () => {
  test("is a hex where it is solid, rgb with its alpha where it is not", () => {
    expect(shortColor(rgb(37, 99, 235))).toBe("#2563eb");
    expect(shortColor(rgb(0, 0, 0))).toBe("#000000");
    expect(shortColor(rgb(127.5, 0.4, 254.6))).toBe("#8000ff");
    expect(shortColor(rgb(37, 99, 235, 0.5))).toBe("rgb(37 99 235 / 0.5)");
    expect(shortColor(rgb(0, 0, 0, 0.123))).toBe("rgb(0 0 0 / 0.12)");
    expect(shortColor(rgb(0, 0, 0, 0))).toBe("transparent");
  });
});

describe("the background behind an element", () => {
  /** A chain of elements, each with its background, the first the element itself. */
  function chain(colors: (Color | null)[]) {
    const reads: number[] = [];
    const found = walkBackgrounds(
      0,
      (at) => {
        reads.push(at);
        return colors[at] ?? null;
      },
      (at) => (at + 1 < colors.length ? at + 1 : null),
    );
    return { found, reads };
  }

  test("is walked up to the first solid one, and no further", () => {
    const clear = rgb(0, 0, 0, 0);
    const { found, reads } = chain([clear, null, rgb(0, 0, 0, 0.5), rgb(20, 20, 20), WHITE]);
    expect(reads).toEqual([0, 1, 2, 3]);
    expect(found).toEqual([clear, null, rgb(0, 0, 0, 0.5), rgb(20, 20, 20)]);
  });

  test("the walk stops after twenty ancestors, however deep the page is", () => {
    expect(WALK_CAP).toBe(20);
    const { found, reads } = chain(Array.from({ length: 60 }, () => rgb(0, 0, 0, 0)));
    // The element itself, and twenty above it.
    expect(reads).toHaveLength(21);
    expect(found).toHaveLength(21);
  });

  test("the walk ends with the page where nothing is solid", () => {
    expect(chain([null, null]).reads).toEqual([0, 1]);
  });

  test("is the layers one over another, the nearest on top", () => {
    expect(effectiveBackground([rgb(0, 0, 0, 0), rgb(20, 20, 20)])).toEqual(rgb(20, 20, 20));
    expect(whole(effectiveBackground([rgb(255, 255, 255, 0.5), BLACK]))).toEqual(rgb(128, 128, 128));
    expect(whole(effectiveBackground([rgb(255, 0, 0, 0.5), rgb(0, 0, 255, 0.5), WHITE]))).toEqual(
      rgb(191, 64, 128),
    );
  });

  test("is white where no layer is solid, as an empty page is", () => {
    expect(effectiveBackground([])).toEqual(WHITE);
    expect(effectiveBackground([null, rgb(0, 0, 0, 0)])).toEqual(WHITE);
    expect(whole(effectiveBackground([rgb(0, 0, 0, 0.5)]))).toEqual(rgb(128, 128, 128));
  });
});

describe("contrast", () => {
  const grey = (level: number) => rgb(level, level, level);

  test("black on white is 21, either way round, and a color on itself is 1", () => {
    expect(contrastRatio(BLACK, WHITE)).toBeCloseTo(21, 10);
    expect(contrastRatio(WHITE, BLACK)).toBeCloseTo(21, 10);
    expect(contrastRatio(grey(119), grey(119))).toBe(1);
  });

  test("known pairs come to the ratios the checkers give", () => {
    const pairs: [Color, Color, string][] = [
      [grey(0x77), WHITE, "4.48"],
      [grey(0x76), WHITE, "4.54"],
      [grey(0x59), WHITE, "7.00"],
      [grey(0x94), WHITE, "3.03"],
      [rgb(255, 0, 0), WHITE, "4.00"],
      [rgb(0, 0, 255), WHITE, "8.59"],
      [rgb(37, 99, 235), WHITE, "5.17"],
      [rgb(255, 255, 0), BLACK, "19.56"],
    ];
    for (const [text, ground, ratio] of pairs) {
      expect(contrastRatio(text, ground).toFixed(2)).toBe(ratio);
    }
  });

  test("level AA asks 4.5 of text, and 3 of large text: 24px, or 18.66px where it is bold", () => {
    expect(aaRatio(16, 400)).toBe(4.5);
    expect(aaRatio(23.99, 400)).toBe(4.5);
    expect(aaRatio(24, 400)).toBe(3);
    expect(aaRatio(18.66, 700)).toBe(3);
    expect(aaRatio(18.66, 600)).toBe(4.5);
    expect(aaRatio(18.65, 700)).toBe(4.5);
    expect(aaRatio(18.66, 900)).toBe(3);
  });

  test("a ratio passes where it meets what its size asks", () => {
    expect(passesAA(4.48, 16, 400)).toBe(false);
    expect(passesAA(4.5, 16, 400)).toBe(true);
    expect(passesAA(4.48, 24, 400)).toBe(true);
    expect(passesAA(3, 19, 700)).toBe(true);
    expect(passesAA(2.99, 32, 700)).toBe(false);
  });
});
