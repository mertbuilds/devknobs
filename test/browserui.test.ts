import { describe, expect, test } from "bun:test";
import {
  BARS_DOWN,
  BARS_LOCK,
  BARS_START,
  BARS_UP,
  type BarsEvent,
  type BarsMotion,
  barsOf,
  barsStep,
  endRoom,
  type BrowserLayout,
  layoutOf,
  layoutOptions,
  platformOf,
  type Screen,
  viewportOf,
} from "../src/engine/browserui";
import { SCREENS, screenOf } from "../src/engine/devices";
import type { OrientationValue } from "../src/types";

function device(id: string): Screen {
  const found = screenOf(id);
  if (!found) throw new Error(`no device ${id}`);
  return found;
}

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

/**
 * Derived, not measured: the same formulas with each device's size and top
 * inset, 62 on the 17 and 18 families, 68 on the Air, 59 on the 16 Plus, 82
 * on the Duo's cover screen and 40 on its inner one.
 */
const SAFARI_DERIVED: typeof SAFARI_TABLE = [
  ["iphone-18-pro", 402, { compact: [714, 754], bottom: [654, 754], top: [660, 768] }],
  ["iphone-18-pro-max", 440, { compact: [796, 836], bottom: [736, 836], top: [742, 850] }],
  ["iphone-duo-closed", 466, { compact: [498, 538], bottom: [438, 538], top: [444, 552] }],
  ["iphone-duo-open", 669, { compact: [813, 853], bottom: [753, 853], top: [759, 867] }],
  ["iphone-air", 420, { compact: [746, 786], bottom: [686, 786], top: [692, 800] }],
  ["iphone-17", 402, { compact: [714, 754], bottom: [654, 754], top: [660, 768] }],
  ["iphone-17-pro", 402, { compact: [714, 754], bottom: [654, 754], top: [660, 768] }],
  ["iphone-17-pro-max", 440, { compact: [796, 836], bottom: [736, 836], top: [742, 850] }],
  ["iphone-16-plus", 430, { compact: [775, 815], bottom: [715, 815], top: [721, 829] }],
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

  test("gives the newer iPhones the same viewport formulas with their own top inset", () => {
    for (const [id, width, layouts] of SAFARI_DERIVED) {
      for (const [layout, [expanded, minimized]] of Object.entries(layouts)) {
        const kind = layout as BrowserLayout;
        expect(size(device(id), kind, false)).toBe(`${width}x${expanded}`);
        expect(size(device(id), kind, true)).toBe(`${width}x${minimized}`);
      }
    }
    const tops = SAFARI_DERIVED.map(([id]) => viewportOf(device(id), "portrait", "compact", false).y);
    expect(tops).toEqual([62, 62, 82, 40, 68, 62, 62, 62, 59]);
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

  test("gives the newer iPhones' landscape viewport from their side inset", () => {
    // Derived: the side inset is the top inset, and 24 on the Duo's inner screen.
    const landscape: [string, string, string][] = [
      ["iphone-18-pro", "750x338", "750x402"],
      ["iphone-18-pro-max", "832x376", "832x440"],
      ["iphone-duo-closed", "514x402", "514x466"],
      ["iphone-duo-open", "903x605", "903x669"],
      ["iphone-air", "776x356", "776x420"],
      ["iphone-17", "750x338", "750x402"],
      ["iphone-16-plus", "814x366", "814x430"],
    ];
    for (const [id, expanded, minimized] of landscape) {
      expect(size(device(id), "compact", false, "landscape")).toBe(expanded);
      expect(size(device(id), "compact", true, "landscape")).toBe(minimized);
    }
  });

  test("gives Chrome's viewport from its toolbar, chin and status bar", () => {
    expect(size(device("pixel-9"), "top", false)).toBe("412x777");
    expect(size(device("pixel-9"), "top", true)).toBe("412x857");
    expect(size(device("pixel-9-pro"), "top", false)).toBe("427x804");
    expect(size(device("pixel-9-pro"), "top", true)).toBe("427x884");
    // 998 css px on the screen, 997 whole ones for the page.
    expect(size(device("pixel-9-pro-xl"), "top", false)).toBe("448x851");
    expect(size(device("pixel-9-pro-xl"), "top", true)).toBe("448x931");
    expect(size(device("pixel-9"), "bottom", false)).toBe("412x777");
  });

  test("gives the Pixel 10 family a status bar derived from its punch hole", () => {
    // Derived, not measured: 69, 69, 70 and 68 dp.
    const derived: [string, string, string][] = [
      ["pixel-10", "412x774", "412x854"],
      ["pixel-10-pro", "427x803", "427x883"],
      ["pixel-10-pro-xl", "448x847", "448x927"],
      ["pixel-10a", "412x775", "412x855"],
    ];
    for (const [id, expanded, minimized] of derived) {
      expect(size(device(id), "top", false)).toBe(expanded);
      expect(size(device(id), "top", true)).toBe(minimized);
      expect(size(device(id), "bottom", false)).toBe(expanded);
    }
    const tops = derived.map(([id]) => viewportOf(device(id), "portrait", "bottom", false).y);
    expect(tops).toEqual([69, 69, 70, 68]);
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

describe("edge to edge", () => {
  test("Safari's page runs to the bottom of the screen in every layout and state", () => {
    for (const layout of ["compact", "bottom", "top"] as const) {
      for (const minimized of [false, true]) {
        const pro = viewportOf(device("iphone-16-pro"), "portrait", layout, minimized, true);
        expect(pro).toEqual({ x: 0, y: 62, width: 402, height: 812 });
        const se = viewportOf(device("iphone-se"), "portrait", layout, minimized, true);
        expect(`${se.width}x${se.height}`).toBe("375x647");
        const across = viewportOf(device("iphone-16-pro"), "landscape", layout, minimized, true);
        expect(across).toEqual({ x: 62, y: 0, width: 750, height: 402 });
      }
    }
    expect(viewportOf(device("iphone-16"), "portrait", "compact", false, true).height).toBe(793);
  });

  test("Chrome keeps its true viewport, and off is the whole screen either way", () => {
    expect(size(device("pixel-9"), "top", false)).toBe("412x777");
    const pixel = viewportOf(device("pixel-9"), "portrait", "top", false, true);
    expect(`${pixel.width}x${pixel.height}`).toBe("412x777");
    const off = viewportOf(device("iphone-16-pro"), "portrait", "off", false, true);
    expect(`${off.width}x${off.height}`).toBe("402x874");
  });

  test("the page's end gets the room the frame runs past Safari's viewport, bars as they are", () => {
    for (const [id, , heights] of SAFARI_TABLE) {
      const drawn = viewportOf(device(id), "portrait", "compact", false, true).height;
      for (const layout of ["compact", "bottom"] as const) {
        const [expanded, minimized] = heights[layout];
        expect(endRoom(device(id), "portrait", layout, false, true)).toBe(drawn - expanded);
        expect(endRoom(device(id), "portrait", layout, true, true)).toBe(drawn - minimized);
      }
    }
    const pro = device("iphone-16-pro");
    expect(endRoom(pro, "portrait", "compact", true, true)).toBe(58);
    expect(endRoom(pro, "portrait", "compact", false, true)).toBe(98);
    expect(endRoom(pro, "portrait", "bottom", true, true)).toBe(58);
    expect(endRoom(pro, "portrait", "bottom", false, true)).toBe(158);
    expect(endRoom(device("iphone-se"), "portrait", "bottom", false, true)).toBe(152);
  });

  test("Top's room is its bottom capsule's alone, and none under its pill or turned across", () => {
    for (const [id] of SAFARI_TABLE) {
      expect(endRoom(device(id), "portrait", "top", false, true)).toBe(92);
      expect(endRoom(device(id), "portrait", "top", true, true)).toBe(0);
      for (const layout of ["compact", "bottom", "top"] as const) {
        expect(endRoom(device(id), "landscape", layout, false, true)).toBe(0);
        expect(endRoom(device(id), "landscape", layout, true, true)).toBe(0);
      }
    }
  });

  test("no room with edge to edge off, the browser off, on Chrome or without a browser", () => {
    const pro = device("iphone-16-pro");
    for (const minimized of [false, true]) {
      expect(endRoom(pro, "portrait", "compact", minimized, false)).toBe(0);
      expect(endRoom(pro, "portrait", "off", minimized, true)).toBe(0);
      expect(endRoom(pro, "portrait", null, minimized, true)).toBe(0);
      expect(endRoom(device("pixel-9"), "portrait", "top", minimized, true)).toBe(0);
      expect(endRoom(device("pixel-9"), "portrait", "bottom", minimized, true)).toBe(0);
      expect(endRoom(device("ipad-mini"), "portrait", null, minimized, true)).toBe(0);
    }
  });

  test("the scroll edge is light, 0.55 at the bottom at most, and short when minimized", () => {
    const pro = device("iphone-16-pro");
    const full = barsOf(pro, "portrait", "compact", false, true);
    expect(full?.edge).toBe(true);
    expect(full?.fade).toMatchObject({ y: 792 - 40, height: 122 });
    expect(full?.fade?.stops.at(-1)).toEqual({ at: 122, alpha: 0.55 });
    expect(Math.max(...(full?.fade?.stops.map((stop) => stop.alpha) ?? []))).toBeLessThan(1);
    const mini = barsOf(pro, "portrait", "compact", true, true);
    expect(mini?.fade).toMatchObject({ y: 850, height: 24 });
    expect(barsOf(pro, "portrait", "bottom", false, true)?.fade?.y).toBe(732 - 40);
    expect(barsOf(pro, "landscape", "compact", false, true)?.fade).toBeNull();
    expect(barsOf(device("pixel-9"), "portrait", "top", false, true)?.edge).toBe(false);
  });
});

describe("layouts", () => {
  test("Safari offers compact, bottom, top and off, Chrome top, bottom and off", () => {
    expect(layoutOptions("iphone-16")).toEqual(["compact", "bottom", "top", "off"]);
    expect(layoutOptions("iphone-se")).toEqual(["compact", "bottom", "top", "off"]);
    expect(layoutOptions("pixel-9")).toEqual(["top", "bottom", "off"]);
    expect(layoutOptions("ipad-mini")).toEqual([]);
    expect(layoutOptions("desktop")).toEqual([]);
    expect(layoutOptions("none")).toEqual([]);
  });

  test("every phone has a browser, and nothing else does", () => {
    for (const preset of SCREENS) {
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

  test("the status bar goes around each island, and clear of the Duo's camera hole", () => {
    const status = (id: string) => barsOf(device(id), "portrait", "compact", false)?.status;
    // The 18 Pro's island is narrower, so its left ear is wider and the time further in.
    expect(status("iphone-18-pro")?.time.x).toBeCloseTo(154 * 0.535);
    expect(status("iphone-17-pro")?.time.x).toBeCloseTo(138.8 * 0.535);
    expect(status("iphone-18-pro")?.time.y).toBeCloseTo(14.3 + 36.1 / 2);
    // The Air's island sits 6 lower, and its status bar is 6 taller.
    expect(status("iphone-air")).toMatchObject({ height: 68 });
    expect(status("iphone-air")?.time.y).toBeCloseTo(38.4);
    // The cover screen: everything left of the hole, on its center line.
    const cover = status("iphone-duo-closed");
    expect(cover).toMatchObject({ height: 82, icons: { align: "end" } });
    expect(cover?.icons.x).toBeLessThan(400.2);
    expect(cover?.time.x).toBeLessThan(cover?.icons.x ?? 0);
    expect(cover?.time.y).toBeCloseTo(47.75);
    expect(cover?.icons.y).toBeCloseTo(47.75);
    // The inner screen has no cut-out: a plain bar, clear of the round corners.
    const inner = status("iphone-duo-open");
    expect(inner).toMatchObject({ height: 40, time: { x: 58, y: 22 }, icons: { x: 633, y: 22 } });
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
    expect(barsOf(pixel, "landscape", "bottom", false)?.shapes[0]).toMatchObject({ y: 24 });
  });

  test("Safari fades the page into its color from over the viewport's end to the bottom", () => {
    const fade = barsOf(pro, "portrait", "compact", false)?.fade;
    // From 64 over the viewport's end at 776 to the bottom.
    expect(fade).toMatchObject({ y: 712, height: 162 });
    expect(fade?.stops[0]).toEqual({ at: 0, alpha: 0 });
    expect(fade?.stops).toContainEqual({ at: 64, alpha: 0.85 });
    expect(fade?.stops.at(-1)).toEqual({ at: 162, alpha: 0.92 });
    const alphas = fade?.stops.map((stop) => stop.alpha) ?? [];
    expect(alphas).toEqual([...alphas].sort((a, b) => a - b));
    expect(barsOf(pro, "portrait", "bottom", false)?.fade?.y).toBe(716 - 64);
    expect(barsOf(pro, "portrait", "top", false)?.fade?.y).toBe(782 - 64);
    expect(barsOf(pro, "portrait", "bottom", true)?.fade?.y).toBe(816 - 64);
    expect(barsOf(pro, "portrait", "top", true)?.fade).toBeNull();
    expect(barsOf(pro, "landscape", "compact", false)?.fade).toBeNull();
    expect(barsOf(device("pixel-9"), "portrait", "bottom", false)?.fade).toBeNull();
  });

  test("nothing for the browser off or a device without one", () => {
    expect(barsOf(pro, "portrait", "off", false)).toBeNull();
    expect(barsOf(device("ipad-mini"), "portrait", null, false)).toBeNull();
  });
});

describe("barsStep", () => {
  const run = (events: BarsEvent[], from: BarsMotion = BARS_START) =>
    events.reduce((state, event) => barsStep(state, event), from);
  const scroll = (y: number, time = 1000): BarsEvent => ({ type: "scroll", y, time });

  test("minimizes once the page has gone down far enough, not before", () => {
    expect(run([scroll(5), scroll(10)]).minimized).toBe(false);
    expect(run([scroll(5), scroll(10), scroll(BARS_DOWN)]).minimized).toBe(true);
    expect(run([scroll(300)]).minimized).toBe(true);
  });

  test("counts the way down from the lowest point, so jitter does not minimize", () => {
    const jitter = [scroll(100), scroll(95), scroll(102), scroll(97), scroll(104)];
    const expanded = { ...BARS_START, y: 100, anchor: 100 };
    expect(run(jitter, expanded).minimized).toBe(false);
  });

  test("comes back on a deliberate scroll up, not on a small one", () => {
    const down = run([scroll(400)]);
    expect(down.minimized).toBe(true);
    expect(run([scroll(420), scroll(390)], down).minimized).toBe(true);
    expect(run([scroll(420), scroll(420 - BARS_UP + 1)], down).minimized).toBe(true);
    expect(run([scroll(420), scroll(420 - BARS_UP)], down).minimized).toBe(false);
  });

  test("comes back at the top of the page, on a tap and on a new page", () => {
    const down = run([scroll(30)]);
    expect(run([scroll(0)], down).minimized).toBe(false);
    expect(run([{ type: "tap" }], down).minimized).toBe(false);
    expect(run([{ type: "navigate" }], down)).toEqual(BARS_START);
  });

  test("a tap counts the next way down from where the page is", () => {
    const tapped = run([scroll(500), { type: "tap" }]);
    expect(run([scroll(510)], tapped).minimized).toBe(false);
    expect(run([scroll(500 + BARS_DOWN)], tapped).minimized).toBe(true);
  });

  test("the scroll clamped by a smaller end room never brings the bars back", () => {
    // Expanded at the end of the page, 40 px of room past where minimized bars end it.
    const end = 2000;
    const tapped = run([scroll(end, 1000), { type: "tap" }]);
    const down = run([scroll(end + 40, 2000)], tapped);
    expect(down.minimized).toBe(true);
    // Unlocked, the clamp back reads as a scroll up of 40.
    expect(run([scroll(end, 2010)], down).minimized).toBe(false);
    const roomed = run([{ type: "resize", time: 2000 }, scroll(end, 2010)], down);
    expect(roomed.minimized).toBe(true);
    expect(roomed.anchor).toBe(end);
    expect(run([scroll(end - 10, 2000 + BARS_LOCK)], roomed).minimized).toBe(true);
  });

  test("the page settling into a resized frame never flips the bars", () => {
    const down = run([scroll(400, 1000), { type: "resize", time: 1000 }]);
    // The taller viewport clamps the scroll up by 100: still minimized.
    const settled = run([scroll(300, 1100), scroll(300, 1300)], down);
    expect(settled.minimized).toBe(true);
    // After the lock the user's way up counts from where the page settled.
    expect(run([scroll(300 - BARS_UP + 1, 1000 + BARS_LOCK)], settled).minimized).toBe(true);
    expect(run([scroll(300 - BARS_UP, 1000 + BARS_LOCK)], settled).minimized).toBe(false);
    const up = run([scroll(10, 1000), { type: "resize", time: 1000 }, scroll(90, 1200)]);
    expect(up.minimized).toBe(false);
  });
});
