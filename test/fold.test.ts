import { describe, expect, test } from "bun:test";
import {
  BLURS,
  blurArea,
  blurLight,
  blurWidth,
  brightness,
  edgeLight,
  foldFrame,
  foldLayout,
  type FoldSide,
  HAND_OVER,
  handOver,
  type Hinge,
  HINGE,
  HINGE_STEP,
  hingeAfter,
  hingeStep,
  hingeStill,
  openOf,
  outline,
  paneLook,
  RIM,
  screenDim,
  seenAt,
  uvOf,
  wipeAmount,
  wipeLight,
} from "../src/engine/fold";
import { mockOf } from "../src/engine/mock";

/** The Duo's two sides as fitted at 87% and 58%, each body where the frame draws it. */
function sides(across: boolean): { closed: FoldSide; open: FoldSide } {
  const shutBody = mockOf("iphone-duo-closed", across ? "portrait" : "landscape");
  const openBody = mockOf("iphone-duo-open", across ? "landscape" : "portrait");
  if (!shutBody || !openBody) throw new Error("no Duo");
  const shutSize = across ? { width: 466, height: 678 } : { width: 678, height: 466 };
  const openSize = across ? { width: 951, height: 669 } : { width: 669, height: 951 };
  return {
    closed: {
      body: shutBody,
      size: shutSize,
      screen: { x: 450, y: 72, width: shutSize.width * 0.87, height: shutSize.height * 0.87 },
    },
    open: {
      body: openBody,
      size: openSize,
      screen: { x: 300, y: 60, width: openSize.width * 0.58, height: openSize.height * 0.58 },
    },
  };
}

describe("foldLayout", () => {
  test("lays the folded body right of the hinge, in the middle of the open screen, held across", () => {
    const { closed, open } = sides(true);
    const layout = foldLayout(closed, open, true);
    const body = open.body;
    if (!body || !closed.body) throw new Error("no body");
    const hinge = body.inset.left + 951 / 2;
    expect(layout.shut.x).toBeCloseTo(hinge);
    // The screens' middles line up along the hinge.
    expect(layout.shut.y + closed.body.inset.top + 678 / 2).toBeCloseTo(body.inset.top + 669 / 2);
    expect(layout.hinge).toBeCloseTo(hinge);
    expect(layout.clip).toBe(`inset(0 ${Math.round((body.width - hinge - 1) * 100) / 100}px 0 0)`);
    expect(layout.open).toEqual({ width: body.width, height: body.height });
    // Seen from about three widths of the open screen away, as Apple's camera sees it.
    expect(layout.depth).toBeCloseTo(2.75 * 951);
  });

  test("lays it above the hinge held upright open, as the folded phone turned a quarter", () => {
    const { closed, open } = sides(false);
    const layout = foldLayout(closed, open, false);
    const body = open.body;
    if (!body || !closed.body) throw new Error("no body");
    const hinge = body.inset.top + 951 / 2;
    expect(layout.shut.y + layout.shut.height).toBeCloseTo(hinge);
    expect(layout.shut.x + closed.body.inset.left + 678 / 2).toBeCloseTo(body.inset.left + 669 / 2);
    expect(layout.clip).toBe(`inset(${Math.round((hinge - 1) * 100) / 100}px 0 0 0)`);
  });

  test("places the fold shut where the folded body is drawn, and open where the open one is", () => {
    for (const across of [true, false]) {
      const { closed, open } = sides(across);
      const layout = foldLayout(closed, open, across);
      const at = (place: { x: number; y: number; scale: number }, x: number, y: number) => ({
        x: place.x + x * place.scale,
        y: place.y + y * place.scale,
      });
      const shutInset = closed.body?.inset ?? { left: 0, top: 0 };
      const shutScreen = at(
        layout.folded,
        layout.shut.x + shutInset.left,
        layout.shut.y + shutInset.top,
      );
      expect(shutScreen.x).toBeCloseTo(closed.screen.x);
      expect(shutScreen.y).toBeCloseTo(closed.screen.y);
      expect(layout.folded.scale).toBeCloseTo(0.87);
      const openInset = open.body?.inset ?? { left: 0, top: 0 };
      const openScreen = at(layout.unfolded, openInset.left, openInset.top);
      expect(openScreen.x).toBeCloseTo(open.screen.x);
      expect(openScreen.y).toBeCloseTo(open.screen.y);
      expect(layout.unfolded.scale).toBeCloseTo(0.58);
    }
  });

  test("takes a bare screen as its own body", () => {
    const { closed, open } = sides(true);
    const layout = foldLayout({ ...closed, body: null }, { ...open, body: null }, true);
    expect(layout.open).toEqual({ width: 951, height: 669 });
    expect(layout.shut).toEqual({ x: 475.5, y: (669 - 678) / 2, width: 466, height: 678 });
  });
});

describe("the hinge", () => {
  /** Where the hinge is `ms` into a fold from `from` to `to`, as the frame steps it. */
  const at = (from: number, to: number, ms: number) =>
    hingeAfter({ position: from, velocity: 0 }, to, Math.round(ms / HINGE_STEP)).position;

  test("is Apple's spring, of 0.75 s and a bounce of 0.15, stepped 60 times a second", () => {
    expect(HINGE.stiffness).toBeCloseTo(70.18, 1);
    expect(HINGE.damping).toBeCloseTo(14.24, 1);
    expect(HINGE_STEP).toBeCloseTo(16.67, 1);
  });

  test("opens as fast as Apple's, measured, and moves from its first step", () => {
    expect(at(0, 1, HINGE_STEP)).toBeGreaterThan(0.01);
    expect(at(0, 1, 67)).toBeCloseTo(0.15, 1);
    expect(at(0, 1, 167)).toBeCloseTo(0.49, 1);
    expect(at(0, 1, 267)).toBeCloseTo(0.75, 1);
    expect(at(0, 1, 417)).toBeCloseTo(0.93, 1);
    expect(Math.abs(at(0, 1, 167) - 0.49)).toBeLessThan(0.03);
    expect(Math.abs(at(0, 1, 267) - 0.75)).toBeLessThan(0.03);
    expect(Math.abs(at(0, 1, 417) - 0.93)).toBeLessThan(0.03);
  });

  test("shuts the same way back", () => {
    expect(at(1, 0, 167)).toBeCloseTo(1 - 0.49, 1);
    expect(at(1, 0, 417)).toBeCloseTo(1 - 0.93, 1);
  });

  test("lands in under half a second, exactly, and never goes past", () => {
    for (const [from, to] of [
      [0, 1],
      [1, 0],
    ] as const) {
      let hinge: Hinge = { position: from, velocity: 0 };
      let steps = 0;
      while (!hingeStill(hinge, to) && steps < 120) {
        hinge = hingeStep(hinge, to);
        steps++;
        expect(hinge.position).toBeGreaterThanOrEqual(0);
        expect(hinge.position).toBeLessThanOrEqual(1);
      }
      expect(hinge).toEqual({ position: to, velocity: 0 });
      expect(steps * HINGE_STEP).toBeGreaterThan(420);
      expect(steps * HINGE_STEP).toBeLessThan(520);
    }
  });

  test("is snapped home by a magnet within 0.08, keeping its speed toward it", () => {
    const near = hingeStep({ position: 0.95, velocity: 0.3 }, 1);
    expect(near.position).toBeGreaterThan(0.95);
    expect(near.velocity).toBeGreaterThan(0.3);
    // Moving away inside the reach, it is turned back toward it at the same speed.
    expect(hingeStep({ position: 0.95, velocity: -0.3 }, 1).velocity).toBeGreaterThan(0.3);
    expect(hingeStep({ position: 0.999, velocity: 2 }, 1)).toEqual({ position: 1, velocity: 0 });
    // Out of reach, the spring alone.
    expect(hingeStep({ position: 0.5, velocity: 0 }, 1).velocity).toBeCloseTo(HINGE.stiffness * 0.5 * HINGE.step);
  });

  test("turned back on its way, goes back from there as fast as it was going", () => {
    const going = hingeAfter({ position: 0, velocity: 0 }, 1, 10);
    expect(going.velocity).toBeGreaterThan(1);
    const back = hingeStep(going, 0);
    expect(back.position).toBeGreaterThan(going.position);
    expect(back.velocity).toBeLessThan(going.velocity);
    const home = hingeAfter(going, 0, 60);
    expect(home).toEqual({ position: 0, velocity: 0 });
  });

  test("a posture's opening", () => {
    expect(openOf("open")).toBe(1);
    expect(openOf("closed")).toBe(0);
  });
});

describe("foldFrame", () => {
  const { closed, open } = sides(true);
  const layout = foldLayout(closed, open, true);

  test("is the folded body alone when shut, and the open body flat when open", () => {
    const shut = foldFrame(layout, 0);
    expect(shut.inner).toBeNull();
    expect(shut.outer).toBe(`perspective(${Math.round(layout.depth * 100) / 100}px) rotateY(0deg)`);
    expect(shut.place).toEqual(layout.folded);
    expect(shut.lift).toBe(0);
    const flat = foldFrame(layout, 1);
    expect(flat.outer).toBeNull();
    expect(flat.inner).toEndWith("rotateY(0deg)");
    expect(flat.place).toEqual(layout.unfolded);
  });

  test("turns the half toward the viewer about the hinge, its inside up to a right angle, its outside past", () => {
    const rising = foldFrame(layout, 2 / 3);
    expect(rising.inner).toEndWith("rotateY(60deg)");
    expect(rising.outer).toBeNull();
    expect(rising.lift).toBeCloseTo(Math.sin(Math.PI / 3), 2);
    const past = foldFrame(layout, 1 / 3);
    expect(past.inner).toBeNull();
    expect(past.outer).toEndWith("rotateY(-60deg)");
    expect(foldFrame(foldLayout(sides(false).closed, sides(false).open, false), 2 / 3).inner).toEndWith(
      "rotateX(60deg)",
    );
  });

  test("moves from where it is drawn shut to where open as it opens", () => {
    const half = foldFrame(layout, 0.5).place;
    expect(half.x).toBeCloseTo((layout.folded.x + layout.unfolded.x) / 2);
    expect(half.scale).toBeCloseTo((layout.folded.scale + layout.unfolded.scale) / 2);
  });
});

describe("seenAt", () => {
  const pivot = { x: 100, y: 50 };

  test("leaves the half where it is, flat", () => {
    expect(seenAt({ x: 0, y: 0 }, pivot, 0, true, 1000)).toEqual({ x: 0, y: 0 });
  });

  test("brings the free edge nearer, so bigger, as the half stands, and edge on at a right angle", () => {
    const standing = seenAt({ x: 0, y: 0 }, pivot, 60, true, 1000);
    // A hundred px out, turned 60 degrees: half as far across, and seen 87 px nearer.
    const grow = 1 / (1 - (100 * Math.sin(Math.PI / 3)) / 1000);
    expect(standing.x).toBeCloseTo(100 - 50 * grow);
    expect(standing.y).toBeCloseTo(50 - 50 * grow);
    expect(seenAt({ x: 0, y: 80 }, pivot, 90, true, 1000).x).toBeCloseTo(100);
    // The folded body turns the other way, its free edge to the right of the hinge.
    expect(seenAt({ x: 200, y: 0 }, pivot, -60, true, 1000).y).toBeCloseTo(50 - 50 * grow);
    // Along, it turns about the hinge running across.
    const along = seenAt({ x: 0, y: 150 }, pivot, 60, false, 1000);
    expect(along.x).toBeCloseTo(100 - 100 * grow);
    expect(along.y).toBeCloseTo(50 + 100 * 0.5 * grow);
  });
});

describe("outline", () => {
  test("goes round the rect clockwise from its top left, a few points along each rounded corner", () => {
    const points = outline({ x: 0, y: 0, width: 100, height: 50 }, [10, 0, 0, 10]);
    expect(points).toHaveLength(4 + 1 + 1 + 4);
    expect(points[0]?.x).toBeCloseTo(0);
    expect(points[0]?.y).toBeCloseTo(10);
    expect(points[3]?.x).toBeCloseTo(10);
    expect(points[3]?.y).toBeCloseTo(0);
    expect(points[4]).toEqual({ x: 100, y: 0 });
    expect(points[5]).toEqual({ x: 100, y: 50 });
    expect(points[9]?.x).toBeCloseTo(0);
  });
});

/** Apple's uniforms as recorded, the hinge's position the frame before with each, while dragged slowly. */
const RECORDED = {
  inner: [
    [0.146, 1],
    [0.333, 0.8],
    [0.488, 0.615],
    [0.69, 0.372],
    [0.913, 0.105],
    [1, 0],
  ],
  cover: [
    [0, 0],
    [0.333, 0.333],
    [0.488, 0.488],
    [0.662, 0.337],
    [0.913, 0.087],
  ],
  light: [
    [0.021, 0.156],
    [0.109, 0.18],
    [0.333, 0.25],
    [0.414, 0.33],
    [0.509, 0.433],
    [0.608, 0.54],
    [0.717, 0.662],
    [0.814, 0.783],
    [0.913, 0.897],
    [1, 1],
  ],
} as const;

describe("Apple's wipe", () => {
  test("is as strong on each screen as recorded", () => {
    for (const [open, amount] of RECORDED.inner) expect(Math.abs(wipeAmount("inner", open) - amount)).toBeLessThan(0.005);
    for (const [open, amount] of RECORDED.cover) expect(Math.abs(wipeAmount("cover", open) - amount)).toBeLessThan(0.005);
  });

  test("brightens the open screen as recorded, and keeps the folded one bright", () => {
    for (const [open, light] of RECORDED.light) expect(Math.abs(brightness("inner", open) - light)).toBeLessThan(0.025);
    expect(brightness("cover", 0.5)).toBe(1);
  });

  test("darkens the half that turns from the hinge out, and the open screen's other half not at all", () => {
    expect(uvOf("inner", 0)).toBe(0.5);
    expect(uvOf("inner", 1)).toBe(0);
    expect(uvOf("cover", 1)).toBe(1);
    // Half open, the open screen's wipe is 0.6 strong: dark to 0.9 of its light at its free edge.
    expect(wipeLight("inner", 0.5, 0.6)).toBe(1);
    expect(wipeLight("inner", 0.75, 0.6)).toBe(1);
    expect(wipeLight("inner", 0, 0.6)).toBeCloseTo(0.1);
    expect(wipeLight("inner", 0.25, 0.6)).toBeCloseTo(1 - 0.5 * 0.9);
    // The folded screen's from its hinge, at most to a quarter.
    expect(wipeLight("cover", 0, 0.5)).toBe(1);
    expect(wipeLight("cover", 1, 0.5)).toBeCloseTo(0.25);
  });

  test("blurs past its bounds, to a mip level 8 times the area, and darkens what it blurs most", () => {
    expect(blurArea("inner", 0.55, 1)).toBe(0);
    expect(blurArea("inner", 0, 0.3)).toBeCloseTo(((0.55 / 0.55) * 0.3 * 2.5) / 0.75);
    expect(blurArea("inner", 0, 1)).toBeCloseTo(4 / 3);
    expect(blurArea("cover", 0.45, 0.4)).toBeCloseTo((0.5 * 0.4 * 2.5) / 0.75);
    expect(blurLight(0.9)).toBe(1);
    expect(blurLight(1.1)).toBeCloseTo(0.25);
    expect(blurLight(1.3)).toBe(0);
    // A level is twice the texels of the one before; the inner texture is 2853 px across.
    expect(blurWidth("inner", 0.5) / blurWidth("inner", 0.375)).toBeCloseTo(2);
    expect(blurWidth("inner", 0)).toBeCloseTo((Math.SQRT2 * 1.12) / 2853);
  });

  test("shades the open screen's far side the more the wipe is on", () => {
    expect(edgeLight("inner", 0.5, 1)).toBe(1);
    expect(edgeLight("inner", 0.05, 1)).toBe(0);
    expect(edgeLight("inner", 0.05, 0)).toBe(1);
    expect(edgeLight("cover", 0, 1)).toBe(1);
  });

  test("softens the dark past the picture's ends over as much as the texture goes past the screen", () => {
    expect(RIM).toBeCloseTo(0.06);
  });
});

describe("paneLook", () => {
  test("is bright and sharp on a screen lying flat", () => {
    const flat = paneLook("inner", 1, 951);
    expect(flat.turned.every((dark) => dark === 0)).toBe(true);
    expect(flat.flat.every((dark) => dark === 0)).toBe(true);
    expect(flat.blurs).toEqual([null, null, null]);
    expect(paneLook("cover", 0, 466).blurs).toEqual([null, null, null]);
  });

  test("darkens the half that turns toward its free edge, from the dark of the half that stays", () => {
    const look = paneLook("inner", 0.6, 951);
    expect(look.turned).toHaveLength(9);
    expect(look.turned[0]).toBeCloseTo(screenDim("inner", 0.6), 2);
    for (let step = 1; step < look.turned.length; step++) {
      expect(look.turned[step] ?? 0).toBeGreaterThanOrEqual(look.turned[step - 1] ?? 0);
    }
    expect(look.turned.at(-1) ?? 0).toBeGreaterThan(0.5);
    expect(look.flat.at(-1) ?? 0).toBeGreaterThan(look.flat[0] ?? 0);
  });

  test("fades the blurrier pictures in one after the other along the half, as wide as Apple's blur", () => {
    const { blurs } = paneLook("inner", 0.6, 951);
    const [first, second] = blurs;
    if (!first || !second) throw new Error("no blur");
    expect(first.from).toBeLessThan(first.to);
    expect(first.to).toBeCloseTo(second.from, 2);
    expect(first.most).toBe(1);
    // Where the first is all the way in, the blur is as wide as it.
    const area = blurArea("inner", uvOf("inner", first.to), wipeAmount("inner", 0.6));
    expect(blurWidth("inner", area) * 951).toBeCloseTo(BLURS[1], 0);
  });

  test("dims the screens as Apple lights them, through the display's gamma", () => {
    expect(screenDim("inner", 1)).toBe(0);
    expect(screenDim("cover", 0)).toBe(0);
    // A third of the way open the open screen is set a quarter bright: 0.074 of its light, shown as 0.31.
    const set = (0.15 / 0.9) ** 2 * (3 - 2 * (0.15 / 0.9));
    expect(screenDim("inner", 1 / 3)).toBeCloseTo(1 - set ** (1 / 2.2), 2);
    expect(screenDim("inner", 0)).toBeGreaterThan(0.8);
  });
});

describe("handOver", () => {
  test("hands the screen to the page itself over the last 8% of the way, only where it is drawn", () => {
    expect(HAND_OVER).toBe(0.08);
    expect(handOver(0.9, "open")).toBe(0);
    expect(handOver(0.92, "open")).toBe(0);
    expect(handOver(0.96, "open")).toBeCloseTo(0.5);
    expect(handOver(1, "open")).toBe(1);
    expect(handOver(0.1, "closed")).toBe(0);
    expect(handOver(0.04, "closed")).toBeCloseTo(0.5);
    expect(handOver(0, "closed")).toBe(1);
    // Drawn open, the picture keeps the screen all the way shut.
    expect(handOver(0.02, "open")).toBe(0);
  });
});
