import { describe, expect, test } from "bun:test";
import {
  barsOf,
  type BrowserLayout,
  layoutOf,
  layoutOptions,
  platformOf,
  type Screen,
  viewportOf,
} from "../src/engine/browserui";
import { DEVICES, deviceOf } from "../src/engine/devices";
import type { OrientationValue } from "../src/types";

function device(id: string): Screen {
  const found = deviceOf(id);
  if (!found) throw new Error(`no device ${id}`);
  return found;
}

/** Pixel 9 Pro and Pro XL are not presets, but the browser knows their screens. */
const PIXEL_9_PRO: Screen = { id: "pixel-9-pro", width: 427, height: 952 };
const PIXEL_9_PRO_XL: Screen = { id: "pixel-9-pro-xl", width: 448, height: 997 };

function size(
  screen: Screen,
  layout: BrowserLayout | null,
  minimized: boolean,
  orientation: OrientationValue = "portrait",
): string {
  const page = viewportOf(screen, orientation, layout, minimized);
  return `${page.width}x${page.height}`;
}

/** Expanded and minimized `innerHeight` per layout, measured in iOS 26.5 Safari. */
const SAFARI_TABLE: [string, number, Record<"compact" | "bottom" | "top", [number, number]>][] = [
  ["iphone-16-pro", 402, { compact: [714, 754], bottom: [654, 754], top: [660, 768] }],
  ["iphone-16", 393, { compact: [695, 735], bottom: [635, 735], top: [641, 749] }],
  ["iphone-16-pro-max", 440, { compact: [796, 836], bottom: [736, 836], top: [742, 850] }],
  ["iphone-se", 375, { compact: [549, 589], bottom: [495, 589], top: [495, 603] }],
];

describe("viewportOf", () => {
  test("gives Safari's measured viewport in every layout, expanded and minimized", () => {
    for (const [id, width, layouts] of SAFARI_TABLE) {
      for (const [layout, [expanded, minimized]] of Object.entries(layouts)) {
        const kind = layout as BrowserLayout;
        expect(size(device(id), kind, false)).toBe(`${width}x${expanded}`);
        expect(size(device(id), kind, true)).toBe(`${width}x${minimized}`);
      }
    }
  });

  test("places Safari's viewport under the status bar, and under Top's address bar", () => {
    const pro = device("iphone-16-pro");
    expect(viewportOf(pro, "portrait", "compact", false)).toEqual({
      x: 0,
      y: 62,
      width: 402,
      height: 714,
    });
    expect(viewportOf(pro, "portrait", "bottom", true).y).toBe(62);
    expect(viewportOf(pro, "portrait", "top", false).y).toBe(122);
    const top = viewportOf(pro, "portrait", "top", true);
    expect(top.y).toBe(106);
    expect(top.y + top.height).toBe(874);
  });

  test("gives Safari's landscape viewport, the same in every layout", () => {
    const landscape: [string, string, string][] = [
      ["iphone-16-pro", "750x338", "750x402"],
      ["iphone-16", "734x329", "734x393"],
      ["iphone-16-pro-max", "832x376", "832x440"],
      ["iphone-se", "667x311", "667x375"],
    ];
    for (const [id, expanded, minimized] of landscape) {
      for (const layout of ["compact", "bottom", "top"] as const) {
        expect(size(device(id), layout, false, "landscape")).toBe(expanded);
        expect(size(device(id), layout, true, "landscape")).toBe(minimized);
      }
    }
    const pro = viewportOf(device("iphone-16-pro"), "landscape", "compact", false);
    expect(pro.x).toBe(62);
    expect(pro.y).toBe(64);
  });

  test("gives Chrome's viewport from its toolbar, chin and status bar", () => {
    expect(size(device("pixel-9"), "top", false)).toBe("412x777");
    expect(size(device("pixel-9"), "top", true)).toBe("412x857");
    expect(size(PIXEL_9_PRO, "top", false)).toBe("427x804");
    expect(size(PIXEL_9_PRO, "top", true)).toBe("427x884");
    expect(size(PIXEL_9_PRO_XL, "top", false)).toBe("448x851");
    expect(size(PIXEL_9_PRO_XL, "top", true)).toBe("448x931");
    expect(size(device("pixel-9"), "bottom", false)).toBe("412x777");
    // The Galaxy status bar of 40 is an estimate.
    expect(size(device("galaxy-s25"), "top", false)).toBe("360x660");
    expect(size(device("galaxy-s25-ultra"), "top", true)).toBe("384x792");
  });

  test("puts Chrome's toolbar over the page at the top, and under it at the bottom", () => {
    const pixel = device("pixel-9");
    expect(viewportOf(pixel, "portrait", "top", false).y).toBe(66 + 56);
    expect(viewportOf(pixel, "portrait", "bottom", false).y).toBe(66);
    expect(viewportOf(pixel, "portrait", "top", true).y).toBe(66);
    expect(viewportOf(pixel, "landscape", "bottom", false)).toEqual({
      x: 0,
      y: 80,
      width: 924,
      height: 332,
    });
  });

  test("gives the whole screen with the browser off, and without one", () => {
    expect(size(device("iphone-16-pro"), "off", false)).toBe("402x874");
    expect(size(device("pixel-9"), "off", true)).toBe("412x924");
    expect(size(device("ipad-mini"), null, false)).toBe("744x1133");
    expect(size(device("iphone-16-pro"), "off", false, "landscape")).toBe("874x402");
  });
});

describe("layouts", () => {
  test("Safari offers compact, bottom, top and off, Chrome top, bottom and off", () => {
    expect(layoutOptions("iphone-16")).toEqual(["compact", "bottom", "top", "off"]);
    expect(layoutOptions("iphone-se")).toEqual(["compact", "bottom", "top", "off"]);
    expect(layoutOptions("pixel-9")).toEqual(["top", "bottom", "off"]);
    expect(layoutOptions("galaxy-s25-ultra")).toEqual(["top", "bottom", "off"]);
    expect(layoutOptions("ipad-mini")).toEqual([]);
    expect(layoutOptions("desktop")).toEqual([]);
    expect(layoutOptions("none")).toEqual([]);
  });

  test("every phone has a browser, and nothing else does", () => {
    for (const preset of DEVICES) {
      expect(platformOf(preset.id) !== null).toBe(preset.kind === "phone");
    }
    expect(platformOf("iphone-16-pro")).toBe("safari");
    expect(platformOf("pixel-9")).toBe("chrome");
  });

  test("auto and a layout the browser lacks come to its default", () => {
    expect(layoutOf("iphone-16-pro", "auto")).toBe("compact");
    expect(layoutOf("pixel-9", "auto")).toBe("top");
    expect(layoutOf("pixel-9", "compact")).toBe("top");
    expect(layoutOf("pixel-9", "bottom")).toBe("bottom");
    expect(layoutOf("iphone-16", "off")).toBe("off");
    expect(layoutOf("ipad-mini", "top")).toBeNull();
  });
});

describe("bars", () => {
  const pro = device("iphone-16-pro");

  test("Compact floats three capsules 34 over the bottom, 8 apart", () => {
    const bars = barsOf(pro, "portrait", "compact", false);
    const [back, field, more] = bars?.shapes ?? [];
    expect(back).toMatchObject({ x: 34, y: 792, width: 48, height: 48, radius: 24 });
    expect(field).toMatchObject({ x: 90, width: 222, height: 48, radius: 24 });
    expect(more).toMatchObject({ x: 320, width: 48 });
    expect(field?.marks.map((entry) => entry.glyph)).toEqual(["page", "reload"]);
    expect(field?.marks[0]?.x).toBe(114);
    expect(field?.marks[1]?.x).toBe(290);
    expect(more?.marks[0]?.glyph).toBe("more");
    expect(bars?.handle).toEqual({ x: 131, y: 861, width: 140, height: 5 });
  });

  test("Bottom draws a card with the address field and five buttons", () => {
    const bars = barsOf(pro, "portrait", "bottom", false);
    const [card, field] = bars?.shapes ?? [];
    expect(card).toMatchObject({ kind: "card", x: 14, y: 732, width: 374, height: 128 });
    expect(field).toMatchObject({ kind: "field", x: 36, y: 748, width: 330, height: 48 });
    expect(card?.marks.map((entry) => entry.glyph)).toEqual([
      "back",
      "forward",
      "share",
      "bookmarks",
      "tabs",
    ]);
    expect(card?.marks[0]?.x).toBeCloseTo(52.6, 0);
    expect(card?.marks[4]?.x).toBeCloseTo(345.8, 0);
    expect(card?.marks[0]?.y).toBe(824);
    const se = barsOf(device("iphone-se"), "portrait", "bottom", false);
    expect(se?.shapes[0]).toMatchObject({ x: 8, y: 531, width: 359 });
    expect(se?.handle).toBeNull();
  });

  test("Top puts the address under the status bar and the buttons in a capsule", () => {
    const bars = barsOf(pro, "portrait", "top", false);
    const [field, buttons] = bars?.shapes ?? [];
    expect(field).toMatchObject({ x: 16, y: 62, width: 370, height: 44, radius: 22 });
    expect(buttons).toMatchObject({ x: 28, y: 798, width: 346, height: 48 });
    expect(buttons?.marks[0]?.x).toBeCloseTo(58.6, 0);
    expect(buttons?.marks[0]?.y).toBe(822);
  });

  test("minimized leaves the domain pill, at the bottom or under the status bar", () => {
    expect(barsOf(pro, "portrait", "compact", true)?.shapes).toMatchObject([
      { kind: "pill", y: 828, height: 32 },
    ]);
    expect(barsOf(pro, "portrait", "bottom", true)?.shapes).toMatchObject([{ y: 828 }]);
    expect(barsOf(pro, "portrait", "top", true)?.shapes).toMatchObject([{ y: 62 }]);
  });

  test("landscape is one row at the top, and nothing minimized", () => {
    const bars = barsOf(pro, "landscape", "bottom", false);
    expect(bars?.status).toBeNull();
    expect(bars?.shapes.map(({ x, width }) => [x, width])).toEqual([
      [72, 44],
      [128, 44],
      [278, 318],
      [670, 132],
    ]);
    expect(bars?.handle).toEqual({ x: 324.5, y: 389, width: 225, height: 5 });
    expect(barsOf(pro, "landscape", "top", true)?.shapes).toEqual([]);
  });

  test("the status bar is the top inset, its time on the island's line", () => {
    expect(barsOf(pro, "portrait", "compact", false)?.status).toMatchObject({ height: 62 });
    expect(barsOf(pro, "portrait", "compact", false)?.status?.time.y).toBeCloseTo(31.85);
    expect(barsOf(device("iphone-se"), "portrait", "top", false)?.status).toMatchObject({
      height: 20,
      time: { x: 187.5 },
    });
  });

  test("Chrome draws its toolbar, pill, chin and hairline per layout", () => {
    const pixel = device("pixel-9");
    const top = barsOf(pixel, "portrait", "top", false);
    expect(top?.shapes[0]).toMatchObject({ kind: "toolbar", y: 66, height: 56 });
    expect(top?.shapes[1]).toMatchObject({ kind: "field", height: 40, radius: 20 });
    expect(top?.hairline?.y).toBe(122);
    expect(top?.chin).toMatchObject({ y: 899 });
    const bottom = barsOf(pixel, "portrait", "bottom", false);
    expect(bottom?.shapes[0]).toMatchObject({ y: 843 });
    expect(bottom?.chin).toMatchObject({ y: 899 });
    expect(bottom?.hairline?.y).toBe(843);
    const hidden = barsOf(pixel, "portrait", "top", true);
    expect(hidden?.shapes).toEqual([]);
    expect(hidden?.status?.height).toBe(66);
    expect(hidden?.handle).toMatchObject({ width: 108 });
    expect(barsOf(pixel, "landscape", "bottom", false)?.shapes[0]).toMatchObject({ y: 24 });
  });

  test("nothing for the browser off or a device without one", () => {
    expect(barsOf(pro, "portrait", "off", false)).toBeNull();
    expect(barsOf(device("ipad-mini"), "portrait", null, false)).toBeNull();
  });
});
