import { afterEach, describe, expect, test } from "bun:test";
import { DUO_FOLD } from "../src/engine/bezelurls";
import { BLURS, blurArea, blurWidth, darkAt, freeDepth, type Pane, type Quad, shotPane, shotPicture, shotQuad, shotWindow, uvOf, wipeAmount } from "../src/engine/fold";
import {
  blurAt,
  canvasRect,
  contextOf,
  coverage,
  EDGE,
  freeOf,
  hingeLine,
  REACH,
  reachOf,
  screenGl,
  screenLook,
  wedgeOf,
} from "../src/engine/foldgl";

const EXTENT = { inner: 951, cover: 466 } as const;
/** Deep in the picture, past any end's blur. */
const DEEP = 1e4;

describe("the screen's blur", () => {
  test("is none anywhere with the screen lying flat, open or shut, so the page hands back unchanged", () => {
    const flat = [screenLook("inner", 1, EXTENT.inner, 0), screenLook("cover", 0, EXTENT.cover, 0), screenLook("cover", 1, EXTENT.cover, 0)];
    for (const look of flat) {
      for (const t of [0, 0.25, 0.5, 0.75, 1]) {
        for (const inside of [-40, 0, 3, DEEP]) expect(blurAt(look, t, inside)).toBe(0);
      }
    }
  });

  test("away from the ends is Apple's, growing from the hinge toward the free edge as the hinge sets it", () => {
    for (const pane of ["inner", "cover"] as const) {
      for (const open of [0.8, 0.6, 0.4, 0.2]) {
        const look = screenLook(pane, open, EXTENT[pane], 30);
        let last = 0;
        for (const t of [0, 0.25, 0.5, 0.75, 1]) {
          const area = blurArea(pane, uvOf(pane, t), wipeAmount(pane, open));
          const apple = area > 0 ? Math.min(BLURS[BLURS.length - 1], blurWidth(pane, area) * EXTENT[pane]) : 0;
          expect(blurAt(look, t, DEEP)).toBeCloseTo(apple, 6);
          expect(blurAt(look, t, DEEP)).toBeGreaterThanOrEqual(last);
          last = blurAt(look, t, DEEP);
        }
      }
    }
  });

  test("darkens the free edge as deep as freeDepth, and not at all lying flat", () => {
    for (const pane of ["inner", "cover"] as const) {
      expect(screenLook(pane, 0, EXTENT[pane], 0).dark).toBe(0);
      expect(screenLook(pane, 1, EXTENT[pane], 0).dark).toBe(0);
      expect(screenLook(pane, 0.6, EXTENT[pane], 12, 0.4).dark).toBe(freeDepth(0.6));
    }
  });

  test("is never wider than the widest blurred picture", () => {
    expect(blurAt(screenLook("inner", 0, EXTENT.inner, 0), 1, DEEP)).toBe(BLURS[BLURS.length - 1]);
  });

  test("blurs the page into the dark past its ends, as wide as that dark at the free edge, even at the hinge", () => {
    const wedge = 40;
    for (const pane of ["inner", "cover"] as const) {
      // Barely turned, Apple's blur is all but none near the hinge: the ends' is what shows there.
      const look = screenLook(pane, pane === "inner" ? 0.95 : 0.05, EXTENT[pane], wedge);
      expect(look.edge).toEqual([EDGE[0] * wedge, EDGE[1] * wedge]);
      expect(blurAt(look, 0, -5)).toBeCloseTo(EDGE[0] * wedge);
      expect(blurAt(look, 0, 0)).toBeCloseTo(EDGE[0] * wedge);
      expect(blurAt(look, 1, 0)).toBeCloseTo(EDGE[1] * wedge);
      expect(blurAt(look, 0.5, -20)).toBeCloseTo(((EDGE[0] + EDGE[1]) / 2) * wedge);
      // It eases off into the picture, and is gone as far in as it reaches.
      const rim = EDGE[0] * wedge;
      expect(blurAt(look, 0, rim)).toBeLessThan(rim);
      expect(blurAt(look, 0, rim)).toBeGreaterThan(0);
      expect(blurAt(look, 0, REACH * rim)).toBe(blurAt(look, 0, DEEP));
    }
    // The further the screen reaches past the page, the wider.
    expect(blurAt(screenLook("cover", 0.3, EXTENT.cover, 60), 0.2, 0)).toBeGreaterThan(
      blurAt(screenLook("cover", 0.3, EXTENT.cover, 20), 0.2, 0),
    );
  });

  test("keeps Apple's where that is the wider at the ends", () => {
    const look = screenLook("inner", 0.2, EXTENT.inner, 2);
    expect(blurAt(look, 1, 0)).toBe(blurAt(look, 1, DEEP));
  });
});

describe("coverage", () => {
  test("is the picture inside it, none past its ends, and half on them, softened either way", () => {
    expect(coverage(50, 100, 2)).toBe(1);
    expect(coverage(-3, 100, 2)).toBe(0);
    expect(coverage(103, 100, 2)).toBe(0);
    expect(coverage(0, 100, 2)).toBeCloseTo(0.5);
    expect(coverage(100, 100, 2)).toBeCloseTo(0.5);
    expect(coverage(1, 100, 2)).toBeGreaterThan(0.5);
  });
});

describe("the turned screen's free edge", () => {
  const picture = { x: 100, y: 50, width: 400, height: 600 };
  const box = (left: number, right: number): Quad => [
    [left, 50],
    [right, 50],
    [right, 650],
    [left, 650],
  ];

  test("is the picture's own lying flat, so the page hands back unchanged", () => {
    expect(freeOf(box(100, 500), "cover", picture)).toBe(1);
    expect(freeOf(box(100, 500), "inner", picture)).toBe(1);
  });

  test("cuts the page lying flat where it is seen, from the hinge, the cover's on its right and the open screen's on its left", () => {
    expect(freeOf(box(100, 300), "cover", picture)).toBe(0.5);
    expect(freeOf(box(400, 500), "inner", picture)).toBe(0.25);
  });

  test("never reaches past the picture's own, nor back past the hinge", () => {
    expect(freeOf(box(100, 560), "cover", picture)).toBe(1);
    expect(freeOf(box(40, 500), "inner", picture)).toBe(1);
    expect(freeOf(box(100, 80), "cover", picture)).toBe(0);
  });

  test("leaves the look's free edge at the picture's own where none is given", () => {
    expect(screenLook("cover", 0.4, EXTENT.cover, 10).free).toBe(1);
    expect(screenLook("cover", 0.4, EXTENT.cover, 10, 0.6).free).toBe(0.6);
  });
});

describe("the dark past the page's ends", () => {
  test("is the turned screen's reach past the picture at its free edge, in the picture's css px", () => {
    const picture = { x: 0, y: 0, width: 100, height: 200 };
    const window: Quad = [[0, -10], [100, 0], [100, 200], [0, 216]];
    expect(wedgeOf(window, "inner", picture, 400)).toBe(32);
    expect(wedgeOf(window, "inner", { ...picture, height: 0 }, 400)).toBe(0);
  });

  test("reaches at most as far as any frame of the fold has it, and the canvas that far past the ends", () => {
    if (!DUO_FOLD) return;
    const shots = DUO_FOLD;
    for (const pane of ["inner", "cover"] as const) {
      const reach = reachOf(shots, pane);
      expect(reach).toBeGreaterThan(0.05);
      expect(reach).toBeLessThan(0.2);
      for (const shot of shots.frames.filter((frame) => shotPane(shots, frame) === pane)) {
        const quad = shotQuad(shot, pane);
        const picture = shotPicture(shots, pane, quad);
        const { top, bottom } = darkAt(shotWindow(quad, pane, picture), pane, picture);
        expect(Math.max(top, bottom) / picture.height).toBeLessThanOrEqual(reach + 1e-9);
      }
    }
  });
});

describe("the canvas", () => {
  const stage = { width: 951, height: 669 };
  const half = { x: 0, y: 0, width: 475.5, height: 669 };

  test("lies over the part that turns, and past the screen's ends along the hinge", () => {
    const place = { pane: "inner" as const, across: true, stage, part: half, margin: 80, density: 2 };
    expect(canvasRect(place)).toEqual({ x: 0, y: -80, width: 475.5, height: 829 });
    const upright = { width: 669, height: 951 };
    const lower = { x: 0, y: 475.5, width: 669, height: 475.5 };
    expect(canvasRect({ ...place, across: false, stage: upright, part: lower })).toEqual({
      x: -80,
      y: 475.5,
      width: 829,
      height: 475.5,
    });
  });

  test("runs from the hinge to the free edge the way each screen's shade does", () => {
    const at = (pane: Pane, across: boolean, part: typeof half, x: number, y: number) => {
      const [a, b, c] = hingeLine(pane, across, part);
      return a * x + b * y + c;
    };
    // Held across, the open screen's hinge is its middle, its free edge its left; the folded one's hinge is its left.
    expect(at("inner", true, half, 475.5, 300)).toBeCloseTo(0);
    expect(at("inner", true, half, 0, 300)).toBeCloseTo(1);
    const cover = { x: 0, y: 0, width: 466, height: 678 };
    expect(at("cover", true, cover, 0, 300)).toBeCloseTo(0);
    expect(at("cover", true, cover, 466, 300)).toBeCloseTo(1);
    // Held upright, the open screen's lower half turns from the middle down; the folded one from its bottom up.
    const lower = { x: 0, y: 475.5, width: 669, height: 475.5 };
    expect(at("inner", false, lower, 300, 475.5)).toBeCloseTo(0);
    expect(at("inner", false, lower, 300, 951)).toBeCloseTo(1);
    const upright = { x: 0, y: 0, width: 678, height: 466 };
    expect(at("cover", false, upright, 300, 466)).toBeCloseTo(0);
    expect(at("cover", false, upright, 300, 0)).toBeCloseTo(1);
  });
});

describe("WebGL2", () => {
  const saved = ["WebGL2RenderingContext", "document"].map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);

  afterEach(() => {
    for (const [name, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  });

  class FakeGl {}

  test("is the canvas's context only where the browser has it, so the pictures are laid over each other otherwise", () => {
    Reflect.deleteProperty(globalThis, "WebGL2RenderingContext");
    expect(contextOf({ getContext: () => new FakeGl() })).toBeNull();
    Object.defineProperty(globalThis, "WebGL2RenderingContext", { configurable: true, value: FakeGl });
    const gl = new FakeGl();
    expect(Object.is(contextOf({ getContext: () => gl }), gl)).toBe(true);
    expect(contextOf({ getContext: () => null })).toBeNull();
    expect(contextOf({ getContext: () => ({}) })).toBeNull();
  });

  test("draws nothing where there is none, and the layers take over", () => {
    Object.defineProperty(globalThis, "WebGL2RenderingContext", { configurable: true, value: FakeGl });
    const canvas = { getContext: () => null, style: {} };
    Object.defineProperty(globalThis, "document", { configurable: true, value: { createElement: () => canvas } });
    const place = { pane: "inner" as const, across: true, stage: { width: 951, height: 669 }, part: { x: 0, y: 0, width: 475.5, height: 669 }, margin: 80, density: 2 };
    expect(screenGl(place, () => {})).toBeNull();
  });
});
