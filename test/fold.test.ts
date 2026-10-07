import { describe, expect, test } from "bun:test";
import {
  BLURS,
  blurArea,
  blurLight,
  blurWidth,
  brightness,
  darkAt,
  EDGE_ON,
  edgeLight,
  flatMatrix,
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
  laidQuad,
  openOf,
  paneAt,
  paneLook,
  type Quad,
  quadBetween,
  quadFacing,
  quadMap,
  quadToMatrix3d,
  quadToQuad,
  RIM,
  roundedPath,
  screenDim,
  seenAt,
  SHOTS_HAND_OVER,
  shotPicture,
  shotPose,
  shotQuad,
  shotsBetween,
  shotsTransform,
  shotWindow,
  uvOf,
  wipeAmount,
  wipeLight,
} from "../src/engine/fold";
import { bezelMock } from "../src/engine/bezels";
import { DUO_FOLD } from "../src/engine/bezelurls";
import { mockOf, type Rect } from "../src/engine/mock";
import { corners } from "../src/engine/mockdraw";

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

  test("follows a hand anywhere between the ends through the spring alone, lagging it", () => {
    // No magnet pulls it at a landing a hand sets, however near.
    const step = hingeStep({ position: 0.3, velocity: 0 }, 0.333);
    expect(step.velocity).toBeCloseTo(HINGE.stiffness * 0.033 * HINGE.step);
    // A hand that moves on retargets it from where it is, as fast as it was going.
    const going = hingeAfter({ position: 0, velocity: 0 }, 0.6, 6);
    expect(going.position).toBeGreaterThan(0);
    expect(going.position).toBeLessThan(0.6);
    expect(hingeStep(going, 0.2).position).toBeGreaterThan(going.position);
  });

  test("let go between the ends, rests there exactly, all but without going past", () => {
    let hinge: Hinge = { position: 1, velocity: 0 };
    let steps = 0;
    while (!hingeStill(hinge, 0.333) && steps < 240) {
      hinge = hingeStep(hinge, 0.333);
      steps++;
      expect(hinge.position).toBeGreaterThan(0.333 - 0.01);
    }
    expect(hinge).toEqual({ position: 0.333, velocity: 0 });
    expect(steps * HINGE_STEP).toBeLessThan(2000);
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

describe("roundedPath", () => {
  const flat = (point: { x: number; y: number }) => point;

  test("goes round the rect clockwise from its top left, each rounded corner a quarter circle's cubic", () => {
    const path = roundedPath({ x: 0, y: 0, width: 100, height: 50 }, [10, 0, 0, 10], flat);
    expect(path).toBe("M10 0L100 0L100 50L10 50C4.48 50 0 45.52 0 40L0 10C0 4.48 4.48 0 10 0Z");
  });

  test("shrinks corners that would overlap, as css draws them", () => {
    const path = roundedPath({ x: 0, y: 0, width: 40, height: 100 }, [30, 30, 0, 0], flat);
    expect(path.startsWith("M20 0L20 0C")).toBe(true);
  });

  test("puts every point and handle where the turn sees it", () => {
    const rect = { x: 20, y: 10, width: 200, height: 300 };
    const pivot = { x: 220, y: 160 };
    const seen = (point: { x: number; y: number }) => seenAt(point, pivot, 40, true, 2000);
    const path = roundedPath(rect, [55, 0, 0, 55], seen);
    const numbers = (path.match(/-?[\d.]+/g) ?? []).map(Number);
    const start = seen({ x: 75, y: 10 });
    expect(numbers[0]).toBeCloseTo(start.x, 1);
    expect(numbers[1]).toBeCloseTo(start.y, 1);
    // The top left corner ends on the seen top edge, where the path started.
    expect(path.endsWith(`${numbers[0]} ${numbers[1]}Z`)).toBe(true);
    // Its last handle lies on the seen top edge, so the curve meets it without a kink.
    const handle = seen({ x: 20 + 55 * (1 - 0.5523), y: 10 });
    expect(path).toContain(`${Math.round(handle.x * 100) / 100} ${Math.round(handle.y * 100) / 100} ${numbers[0]}`);
  });

  test("keeps a corner's curve on the circle it rounds, flat", () => {
    const path = roundedPath({ x: 0, y: 0, width: 200, height: 200 }, [0, 50, 0, 0], flat);
    const curve = /C([\d. ]+)/.exec(path)?.[1]?.split(" ").map(Number) ?? [];
    const [x1 = 0, y1 = 0, x2 = 0, y2 = 0, x3 = 0, y3 = 0] = curve;
    // The cubic's middle, from (150, 0), is within a hair of the circle about (150, 50).
    const mid = { x: (150 + 3 * x1 + 3 * x2 + x3) / 8, y: (0 + 3 * y1 + 3 * y2 + y3) / 8 };
    expect(Math.hypot(mid.x - 150, mid.y - 50)).toBeCloseTo(50, 1);
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
    // The fold's frames, all but flat by then, over the last 2%.
    expect(SHOTS_HAND_OVER).toBe(0.02);
    expect(handOver(0.03, "closed", SHOTS_HAND_OVER)).toBe(0);
    expect(handOver(0.01, "closed", SHOTS_HAND_OVER)).toBeCloseTo(0.5);
    expect(handOver(0.99, "open", SHOTS_HAND_OVER)).toBeCloseTo(0.5);
  });
});

/** Where a css `matrix3d` or `matrix` with its origin at 0 0 puts a point. */
function through(transform: string, x: number, y: number): { x: number; y: number } {
  const m = (/\(([^)]*)\)/.exec(transform)?.[1] ?? "").split(",").map(Number);
  if (m.length === 6) {
    const [a = 0, b = 0, c = 0, d = 0, e = 0, f = 0] = m;
    return { x: a * x + c * y + e, y: b * x + d * y + f };
  }
  const at = (row: number) => (m[row] ?? 0) * x + (m[row + 4] ?? 0) * y + (m[row + 12] ?? 0);
  const w = at(3);
  return { x: at(0) / w, y: at(1) / w };
}

describe("quadToMatrix3d", () => {
  const RECT = { x: 20, y: 10, width: 300, height: 200 };
  const QUADS: Quad[] = [
    [[0, 0], [300, 0], [300, 200], [0, 200]],
    [[113.33, 358.02], [1559.84, 377.23], [1559.84, 2382.78], [113.33, 2401.99]],
    [[40, 30], [500, 80], [420, 600], [10, 380]],
  ];

  test("lays each corner of the rect on its corner of the quad, exactly", () => {
    for (const quad of QUADS) {
      const matrix = quadToMatrix3d(RECT, quad);
      if (!matrix) throw new Error("no matrix");
      expect(matrix).toStartWith("matrix3d(");
      const corners = [
        [RECT.x, RECT.y],
        [RECT.x + RECT.width, RECT.y],
        [RECT.x + RECT.width, RECT.y + RECT.height],
        [RECT.x, RECT.y + RECT.height],
      ];
      corners.forEach(([x = 0, y = 0], index) => {
        const seen = through(matrix, x, y);
        expect(seen.x).toBeCloseTo(quad[index]?.[0] ?? NaN, 4);
        expect(seen.y).toBeCloseTo(quad[index]?.[1] ?? NaN, 4);
      });
    }
  });

  test("keeps the middle where the quad's diagonals cross, as a flat screen in perspective", () => {
    const quad = QUADS[2];
    if (!quad) throw new Error("no quad");
    const matrix = quadToMatrix3d(RECT, quad) ?? "";
    const middle = through(matrix, RECT.x + RECT.width / 2, RECT.y + RECT.height / 2);
    const [[x0, y0], , [x2, y2]] = quad;
    const [, [x1, y1], , [x3, y3]] = quad;
    // Where the lines from corner 0 to 2 and from 1 to 3 cross.
    const t = ((x1 - x0) * (y3 - y1) - (y1 - y0) * (x3 - x1)) / ((x2 - x0) * (y3 - y1) - (y2 - y0) * (x3 - x1));
    expect(middle.x).toBeCloseTo(x0 + (x2 - x0) * t, 4);
    expect(middle.y).toBeCloseTo(y0 + (y2 - y0) * t, 4);
  });

  test("is none for a screen seen edge on", () => {
    expect(quadToMatrix3d(RECT, [[10, 0], [10.01, 0], [10.01, 50], [10, 50]])).toBeNull();
    expect(quadToMatrix3d({ ...RECT, width: 0 }, QUADS[0] ?? [[0, 0], [0, 0], [0, 0], [0, 0]])).toBeNull();
  });

  test("lays a quad onto another corner on corner, as the plane they are seen on turns", () => {
    const [flat, turned, other] = QUADS;
    if (!flat || !turned || !other) throw new Error("no quads");
    for (const [from, to] of [[turned, other], [other, turned], [flat, other]] as const) {
      const matrix = quadToQuad(from, to);
      if (!matrix) throw new Error("no matrix");
      from.forEach(([x, y], index) => {
        const seen = through(matrix, x, y);
        expect(seen.x).toBeCloseTo(to[index]?.[0] ?? NaN, 4);
        expect(seen.y).toBeCloseTo(to[index]?.[1] ?? NaN, 4);
      });
    }
    expect(quadToQuad(turned, [[10, 0], [10.01, 0], [10.01, 50], [10, 50]])).toBeNull();
  });

  test("keeps w at 1 at the origin, so css draws it, laid onto a quad round the other way too", () => {
    const [, turned, other] = QUADS;
    if (!turned || !other) throw new Error("no quads");
    const [a, b, c, d] = other;
    const mirrored: Quad = [b, a, d, c];
    for (const to of [other, mirrored]) {
      const matrix = quadToQuad(turned, to) ?? "";
      expect(Number(matrix.slice(0, -1).split(",").at(-1))).toBe(1);
      turned.forEach(([x, y], index) => {
        expect(through(matrix, x, y).x).toBeCloseTo(to[index]?.[0] ?? NaN, 4);
        expect(laidQuad(turned, to, turned)?.[index]?.[0]).toBeCloseTo(to[index]?.[0] ?? NaN, 4);
      });
    }
  });
});

describe("the Duo's fold frames", () => {
  if (!DUO_FOLD) return;
  const shots = DUO_FOLD;

  test("run from open to shut every 6 degrees, and every 3 within 24 of a right angle, where the half turns edge on", () => {
    const every = (step: number, from: number, to: number) =>
      Array.from({ length: (to - from) / step + 1 }, (_, index) => from + index * step);
    const degs = [...new Set([...every(6, 0, 180), ...every(3, 66, 114)])].sort((a, b) => a - b);
    expect(shots.frames.map((shot) => shot.deg)).toEqual(degs);
  });

  test("go over from one to the next as the hinge turns, evenly all the way, either way", () => {
    // 20 degrees: a third of the way from 18 to 24.
    expect(shotsBetween(shots, 1 - 20 / 180)).toMatchObject({ from: { deg: 18 }, to: { deg: 24 } });
    expect(shotsBetween(shots, 1 - 20 / 180)?.share).toBeCloseTo(1 / 3);
    // 23.9 degrees: all but at 24, still over 18, so nothing jumps at the middle.
    expect(shotsBetween(shots, 1 - 23.9 / 180)).toMatchObject({ from: { deg: 18 }, to: { deg: 24 } });
    expect(shotsBetween(shots, 1 - 23.9 / 180)?.share).toBeCloseTo(59 / 60);
    expect(shotsBetween(shots, 0.5)).toMatchObject({ from: { deg: 90 }, to: { deg: 90 }, share: 0 });
    expect(shotsBetween(shots, 1)).toMatchObject({ from: { deg: 0 }, to: { deg: 0 }, share: 0 });
    expect(shotsBetween(shots, 0)).toMatchObject({ from: { deg: 180 }, to: { deg: 180 }, share: 0 });
    expect(shotsBetween({ ...shots, frames: [] }, 0.5)).toBeNull();
    expect([paneAt(0), paneAt(89.9), paneAt(90), paneAt(90.1), paneAt(180)]).toEqual(["inner", "inner", null, "cover", "cover"]);
    const from: Quad = [[0, 0], [10, 0], [10, 10], [0, 10]];
    const to: Quad = [[2, 2], [12, 0], [10, 14], [0, 10]];
    expect(quadBetween(from, to, 0.5)).toEqual([[1, 1], [11, 0], [10, 12], [0, 10]]);
  });

  test("start each screen's corners from its top left as the layout shows it, held upright", () => {
    const quad: Quad = [[0, 0], [1, 0], [1, 1], [0, 1]];
    expect(quadFacing(quad, true)).toBe(quad);
    expect(quadFacing(quad, false)).toEqual([[1, 0], [1, 1], [0, 1], [0, 0]]);
  });

  /** The Duo laid out in its bezels, and where its open and folded screens lie in the layout. */
  function bezelled(across: boolean): {
    layout: ReturnType<typeof foldLayout>;
    inside: Rect;
    outside: Rect;
    radii: { open: number[]; closed: number[] };
  } {
    const shutBody = bezelMock("iphone-duo-closed", across ? "portrait" : "landscape");
    const openBody = bezelMock("iphone-duo-open", across ? "landscape" : "portrait");
    const { closed, open } = sides(across);
    if (!shutBody || !openBody) throw new Error("no bezels");
    const layout = foldLayout({ ...closed, body: shutBody }, { ...open, body: openBody }, across);
    return {
      layout,
      inside: { x: openBody.inset.left, y: openBody.inset.top, ...open.size },
      outside: {
        x: layout.shut.x + shutBody.inset.left,
        y: layout.shut.y + shutBody.inset.top,
        ...closed.size,
      },
      radii: { open: corners(openBody.screenRadius), closed: corners(shutBody.screenRadius) },
    };
  }

  /** The bounds of points as a transform puts them. */
  function boundsThrough(transform: string, points: readonly (readonly [number, number])[]): Rect {
    const seen = points.map(([px, py]) => through(transform, px, py));
    const xs = seen.map((point) => point.x);
    const ys = seen.map((point) => point.y);
    const left = Math.min(...xs);
    const top = Math.min(...ys);
    return { x: left, y: top, width: Math.max(...xs) - left, height: Math.max(...ys) - top };
  }

  /** That `seen` lies on `on`, each side within a quarter of a css px. */
  function expectOn(seen: Rect, on: Rect): void {
    for (const key of ["x", "y", "width", "height"] as const) expect(Math.abs(seen[key] - on[key])).toBeLessThan(0.25);
  }

  test("lie on the open screen open and on the folded one shut, exactly, either way it is held", () => {
    const [x, y, width, height] = shots.open;
    const last = shots.frames.at(-1);
    if (!last) throw new Error("no frames");
    const screen = [[x, y], [x + width, y], [x + width, y + height], [x, y + height]] as const;
    for (const across of [true, false]) {
      const { layout, inside, outside } = bezelled(across);
      expectOn(boundsThrough(shotsTransform(shots, layout, inside, outside, 1), screen), inside);
      const shut = shotsTransform(shots, layout, inside, outside, 0);
      expectOn(boundsThrough(shut, last.cover), outside);
      expect(shut).toStartWith(across ? "matrix(0.3" : "matrix(0, -0.3");
    }
  });

  /**
   * That the page glued onto a frame's screen of `pane`, `rect` in its own
   * css px with corners `radii`, lies exactly where the device draws that
   * screen, `rect` in the layout, with the hinge `open` of the way open:
   * each corner, the middle of each side and each rounded corner's arc.
   */
  function expectGlued(across: boolean, open: number, pane: "inner" | "cover", rect: Rect, radii: number[]): void {
    const { layout, inside, outside } = bezelled(across);
    const frame = open === 1 ? shots.frames[0] : shots.frames.at(-1);
    if (!frame) throw new Error("no frame");
    const glued = quadToMatrix3d({ x: 0, y: 0, width: rect.width, height: rect.height }, quadFacing(shotQuad(frame, pane), across));
    if (!glued) throw new Error("no matrix");
    const model = shotsTransform(shots, layout, inside, outside, open);
    const { width, height } = rect;
    const [a = 0, b = 0, c = 0, d = 0] = radii;
    const arc = (radius: number) => radius * (1 - Math.SQRT1_2);
    const points: [number, number][] = [
      [0, 0], [width, 0], [width, height], [0, height],
      [width / 2, 0], [width, height / 2], [width / 2, height], [0, height / 2],
      [arc(a), arc(a)], [width - arc(b), arc(b)], [width - arc(c), height - arc(c)], [arc(d), height - arc(d)],
    ];
    for (const [x, y] of points) {
      const onFrame = through(glued, x, y);
      const seen = through(model, onFrame.x, onFrame.y);
      expect(Math.abs(seen.x - (rect.x + x))).toBeLessThan(0.25);
      expect(Math.abs(seen.y - (rect.y + y))).toBeLessThan(0.25);
    }
  }

  test("glue the page exactly where the device draws its screens, open and shut, either way it is held", () => {
    for (const across of [true, false]) {
      const { layout, inside, outside, radii } = bezelled(across);
      const [topLeft = 0, topRight = 0, bottomRight = 0, bottomLeft = 0] = radii.open;
      // Open, the half that turns lies on the open screen's half past the hinge, square at the hinge.
      const half = across
        ? { ...inside, width: layout.hinge - inside.x }
        : { ...inside, y: layout.hinge, height: inside.y + inside.height - layout.hinge };
      expectGlued(across, 1, "inner", half, across ? [topLeft, 0, 0, bottomLeft] : [0, 0, bottomRight, bottomLeft]);
      // Shut, its outside lies on the folded screen, its corners as the folded body's.
      expectGlued(across, 0, "cover", outside, radii.closed);
    }
  });

  test("show the page flat and still behind the turned screen, the open one's where it lies open", () => {
    const [x, y, width, height] = shots.open;
    for (const shot of shots.frames.filter((frame) => paneAt(frame.deg) === "inner")) {
      expect(shotPicture(shots, "inner", shotQuad(shot, "inner"))).toEqual({ x, y, width: width / 2, height });
    }
  });

  test("slide the folded screen's page along with its hinge side, as big as it lies shut", () => {
    const last = shots.frames.at(-1);
    if (!last) throw new Error("no frames");
    const [[left, top], , [right, bottom]] = shotQuad(last, "cover");
    for (const shot of shots.frames.filter((frame) => paneAt(frame.deg) === "cover")) {
      const quad = shotQuad(shot, "cover");
      expect(shotPicture(shots, "cover", quad)).toEqual({ x: quad[0][0], y: top, width: right - left, height: bottom - top });
    }
  });

  test("darken the turned screen past the page, above and below its free edge, the more the nearer it comes", () => {
    const dark = (deg: number) => {
      const shot = shots.frames.find((frame) => frame.deg === deg);
      const pane = paneAt(deg);
      if (!shot || !pane) throw new Error("no frame");
      const quad = shotQuad(shot, pane);
      return darkAt(shotWindow(quad, pane, shotPicture(shots, pane, quad)), pane, shotPicture(shots, pane, quad));
    };
    for (const flat of [dark(0), dark(180)]) {
      expect(flat.top).toBeCloseTo(0, 6);
      expect(flat.bottom).toBeCloseTo(0, 6);
    }
    // As much above as below, growing toward a right angle from either end.
    for (const [nearer, further] of [[6, 30], [30, 60], [60, 84], [174, 150], [150, 120], [120, 96]] as const) {
      const a = dark(nearer);
      const b = dark(further);
      expect(Math.abs(a.top - a.bottom)).toBeLessThan(0.1);
      expect(a.top).toBeGreaterThan(0);
      expect(b.top).toBeGreaterThan(a.top);
    }
    // Darkness only where the screen reaches past the page: none where it stays inside.
    const picture = { x: 0, y: 0, width: 100, height: 100 };
    expect(darkAt([[10, 10], [90, 10], [90, 90], [10, 90]], "inner", picture)).toEqual({ top: 0, bottom: 0 });
    expect(darkAt([[0, -5], [100, 0], [100, 100], [0, 108]], "inner", picture)).toEqual({ top: 5, bottom: 8 });
    expect(darkAt([[0, 0], [100, -5], [100, 108], [0, 100]], "cover", picture)).toEqual({ top: 5, bottom: 8 });
  });

  test("put the open screen's window on the page's hinge side, so no dark line runs down the hinge", () => {
    const quad: Quad = [[100, 40], [1561.6, 60], [1561.6, 300], [100, 320]];
    const picture = { x: 133.5, y: 50, width: 1426.5, height: 260 };
    expect(shotWindow(quad, "inner", picture)).toEqual([[100, 40], [1560, 60], [1560, 300], [100, 320]]);
    expect(shotWindow(quad, "cover", picture)).toBe(quad);
  });

  test("lay the page flat, never in perspective, turned a quarter held upright as the frames are", () => {
    const size = { width: 300, height: 200 };
    const picture = { x: 10, y: 20, width: 600, height: 800 };
    for (const across of [true, false]) {
      const matrix = flatMatrix(size, picture, across);
      expect(matrix).toStartWith("matrix(");
      const facing = quadFacing([[10, 20], [610, 20], [610, 820], [10, 820]], across);
      const corners = [[0, 0], [300, 0], [300, 200], [0, 200]] as const;
      corners.forEach(([x, y], index) => {
        const seen = through(matrix, x, y);
        expect(seen.x).toBeCloseTo(facing[index]?.[0] ?? NaN, 3);
        expect(seen.y).toBeCloseTo(facing[index]?.[1] ?? NaN, 3);
      });
    }
  });

  test("lay the flat page and its window exactly where the device draws its screens, open and shut, either way it is held", () => {
    const first = shots.frames[0];
    const last = shots.frames.at(-1);
    if (!first || !last) throw new Error("no frames");
    for (const across of [true, false]) {
      const { layout, inside, outside } = bezelled(across);
      const half = across
        ? { ...inside, width: layout.hinge - inside.x }
        : { ...inside, y: layout.hinge, height: inside.y + inside.height - layout.hinge };
      for (const [open, pane, shot, rect] of [[1, "inner", first, half], [0, "cover", last, outside]] as const) {
        const model = shotsTransform(shots, layout, inside, outside, open);
        const quad = shotQuad(shot, pane);
        const picture = shotPicture(shots, pane, quad);
        const size = { width: rect.width, height: rect.height };
        const flat = flatMatrix(size, picture, across);
        const seen = quadMap({ x: 0, y: 0, ...size }, quadFacing(shotWindow(quad, pane, picture), across));
        if (!seen) throw new Error("no window");
        for (const [x, y] of [[0, 0], [size.width, 0], [size.width, size.height], [0, size.height], [size.width / 2, size.height / 2]] as const) {
          for (const onFrame of [through(flat, x, y), seen({ x, y })]) {
            const shown = through(model, onFrame.x, onFrame.y);
            expect(Math.abs(shown.x - (rect.x + x))).toBeLessThan(0.25);
            expect(Math.abs(shown.y - (rect.y + y))).toBeLessThan(0.25);
          }
        }
      }
    }
  });

  /** Where the frames are drawn, `deg` turned: the free edge where each of the two lays it, and where it shows, by how far the next is faded in. */
  function drawnAt(deg: number) {
    const posed = shotPose(shots, 1 - deg / 180);
    if (!posed) throw new Error("no frames");
    const { from, to, share, lay } = posed;
    const under = laidQuad(lay.from, lay.onto, from.side);
    const over = laidQuad(lay.to, lay.onto, to.side);
    if (!under || !over) throw new Error("edge on");
    const ghost = Math.max(...under.map(([x, y], index) => Math.hypot(x - (over[index]?.[0] ?? x), y - (over[index]?.[1] ?? y))));
    const edge = quadBetween(under, over, from === to ? 0 : share);
    const clock = shots.frames.indexOf(from) + (from === to ? 0 : share);
    return { posed, ghost, edge, clock };
  }

  /** Does no step of `values` stand out of the steps next to it, by more than three times and `slack`? */
  function smooth(values: number[], slack: number): boolean {
    const steps = values.slice(1).map((value, index) => Math.abs(value - (values[index] ?? value)));
    return steps.every((step, index) => step <= 3 * Math.max(steps[index - 1] ?? 0, steps[index + 1] ?? 0) + slack);
  }

  test("near edge on, lay both frames from their free edge's side, so it moves as one and never shows twice", () => {
    for (let deg = 90 - 2 * EDGE_ON; deg <= 90 + 2 * EDGE_ON; deg += 0.25) {
      const { posed, ghost } = drawnAt(deg);
      const near = [posed.from, posed.to].every((shot) => Math.abs(shot.deg - 90) <= EDGE_ON);
      if (near) expect(ghost).toBeLessThan(0.01);
      // Else from the screen that faces the viewer, whose hole each lays on the window, exactly.
      else expect(posed.holes).toEqual([null, null]);
      for (const hole of posed.holes) expect(hole === null || hole.flat().every(Number.isFinite)).toBe(true);
    }
  });

  test("pass a right angle without a step: the case, the frames' fade, the window and the page all move smoothly", () => {
    const degs = Array.from({ length: 401 }, (_, index) => 80 + index * 0.05);
    const seen = degs.map(drawnAt);
    expect(smooth(seen.map(({ clock }) => clock), 0.01)).toBe(true);
    for (const corner of [0, 1, 2, 3]) {
      for (const axis of [0, 1]) expect(smooth(seen.map(({ edge }) => edge[corner]?.[axis] ?? NaN), 0.5)).toBe(true);
    }
    // The window and the page behind it, either side of the right angle, where each screen faces the viewer.
    for (const pane of ["inner", "cover"] as const) {
      const facing = seen.filter(({ posed }) => posed.pane === pane);
      expect(facing.length).toBeGreaterThan(150);
      for (const corner of [0, 1, 2, 3]) {
        for (const axis of [0, 1]) {
          expect(smooth(facing.map(({ posed }) => posed.quad?.[corner]?.[axis] ?? NaN), 0.5)).toBe(true);
        }
      }
      const pictures = facing.map(({ posed }) => (posed.quad ? shotPicture(shots, pane, posed.quad) : null));
      for (const key of ["x", "y", "width", "height"] as const) {
        expect(smooth(pictures.map((picture) => picture?.[key] ?? NaN), 0.5)).toBe(true);
      }
    }
  });

  test("lie flat open and shut, their screens the rects their corners bound", () => {
    const first = shots.frames[0];
    const last = shots.frames.at(-1);
    if (!first || !last) throw new Error("no frames");
    const [[x0, y0], , [x2, y2]] = shotQuad(last, "cover");
    expect(shotQuad(last, "cover")).toEqual([[x0, y0], [x2, y0], [x2, y2], [x0, y2]]);
    expect(shotQuad(first, "inner")).toEqual(first.inner);
    const turned = shots.frames[10];
    if (!turned) throw new Error("no frame");
    expect(shotQuad(turned, "cover")).toBe(turned.cover);
  });
});
