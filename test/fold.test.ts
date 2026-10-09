import { describe, expect, test } from "bun:test";
import {
  appleSeen,
  BLURS,
  blurArea,
  blurLight,
  blurWidth,
  brightness,
  darkAt,
  edgeLight,
  flatMatrix,
  FOLD_WAIT,
  foldFrame,
  foldLayout,
  type FoldSide,
  foldWarm,
  FREE_DARK,
  freeBand,
  freeDark,
  freeDepth,
  freeShades,
  HAND_OVER,
  handOver,
  type Hinge,
  HINGE,
  HINGE_CATCH_UP,
  HINGE_STEP,
  hingeAfter,
  hingeDue,
  hingeStep,
  hingeStill,
  nearestReady,
  openOf,
  paneLook,
  type Quad,
  quadArea,
  quadFacing,
  quadMap,
  RIM,
  roundedPath,
  screenDim,
  seenAlong,
  seenAt,
  SHOTS_AHEAD,
  SHOTS_AROUND,
  shotAt,
  shotOpen,
  shotPane,
  shotPicture,
  shotQuad,
  shotsDrift,
  shotsTransform,
  shotsWindow,
  towardFrom,
  shotWindow,
  shownAt,
  uvOf,
  wipeAmount,
  wipeLight,
} from "../src/engine/fold";
import { bezelMock } from "../src/engine/bezels";
import { screenLook } from "../src/engine/foldgl";
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

  test("takes its first step in the first draw", () => {
    expect(hingeDue(0, 0)).toEqual({ steps: 1, dropped: 0 });
  });

  test("takes the steps due in a draw on time, and drops none of the fold's time", () => {
    // At 60 Hz a step a draw, at 120 Hz one every other draw.
    expect(hingeDue(HINGE_STEP * 5.5, 5)).toEqual({ steps: 1, dropped: 0 });
    expect(hingeDue(HINGE_STEP * 5.5, 6)).toEqual({ steps: 0, dropped: 0 });
    expect(hingeDue(HINGE_STEP * 6.5, 6)).toEqual({ steps: 1, dropped: 0 });
    expect(hingeDue(HINGE_STEP * (HINGE_CATCH_UP + 0.5), 1)).toEqual({ steps: HINGE_CATCH_UP, dropped: 0 });
  });

  test("takes a few steps only in a draw that comes late, and drops the time of the rest", () => {
    const late = HINGE_STEP * 30.5;
    const { steps, dropped } = hingeDue(late, 1);
    expect(steps).toBe(HINGE_CATCH_UP);
    expect(dropped).toBeCloseTo((30 - HINGE_CATCH_UP) * HINGE_STEP);
    // Begun that much later, the fold has those steps due and no more, as far between two as it was.
    expect(hingeDue(late - dropped, 1)).toEqual({ steps: HINGE_CATCH_UP, dropped: 0 });
    expect((late - dropped) / HINGE_STEP).toBeCloseTo(HINGE_CATCH_UP + 0.5);
  });

  test("a fold the knobs start goes once the pictures and the frames are in, and no sooner", () => {
    expect(foldWarm(true, true, 0)).toBe(true);
    expect(foldWarm(false, true, 0)).toBe(false);
    expect(foldWarm(true, false, 0)).toBe(false);
    expect(foldWarm(false, false, FOLD_WAIT - 1)).toBe(false);
  });

  test("a fold the knobs start goes with what it has once it has waited long enough", () => {
    expect(foldWarm(false, false, FOLD_WAIT)).toBe(true);
    expect(foldWarm(false, true, FOLD_WAIT)).toBe(true);
    expect(foldWarm(true, false, FOLD_WAIT + 16)).toBe(true);
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

/**
 * Apple's frames of the Duo's fold, over its picture of the same screen
 * lying flat, laid on it, and over what the wipe as written above shows of it
 * seen from the front: what is left is the free edge's dark. By how far open
 * the hinge is, at points across the turned screen from the hinge to its
 * free edge, measured over 210 rows of each frame.
 */
const FREE_MEASURED: [open: number, [t: number, light: number][]][] = [
  [0.9, [[0, 1], [0.5, 1], [0.9, 1.01], [1, 1.02]]],
  [0.8, [[0, 1], [0.5, 0.99], [0.9, 1.03], [0.98, 0.95], [1, 0.9]]],
  [0.7, [[0, 1], [0.5, 0.95], [0.75, 0.92], [0.9, 0.93], [1, 0.87]]],
  [0.6, [[0, 0.99], [0.5, 0.93], [0.75, 0.86], [0.95, 0.83], [0.98, 0.62], [1, 0.6]]],
  [0.2, [[0, 0.99], [0.5, 0.98], [0.9, 0.99], [1, 0.98]]],
  [0.1, [[0, 1], [0.5, 0.99], [1, 0.98]]],
];

describe("the free edge's dark", () => {
  test("is Apple's, within a tenth: the frames themselves differ by as much", () => {
    for (const [open, points] of FREE_MEASURED) {
      for (const [t, light] of points) expect(Math.abs(1 - freeDark(t, open) - light)).toBeLessThan(0.1);
    }
  });

  test("is none open and shut, and deepest with the half square to the screen", () => {
    for (const t of [0, 0.5, 0.97, 1]) {
      expect(freeDark(t, 0)).toBe(0);
      expect(freeDark(t, 1)).toBe(0);
    }
    expect(freeDepth(0.5)).toBe(FREE_DARK.most);
    expect(freeDepth(0.6)).toBeCloseTo(freeDepth(0.4));
    expect(freeShades(0, 0.8)).toEqual([]);
    expect(freeShades(1, 1)).toEqual([]);
  });

  test("is none at the hinge, and deepens all the way out to the free edge", () => {
    expect(freeBand(0)).toBe(0);
    expect(freeBand(FREE_DARK.from)).toBe(0);
    expect(freeBand(1)).toBe(1);
    let last = 0;
    for (let t = 0; t <= 1; t += 0.01) {
      expect(freeBand(t)).toBeGreaterThanOrEqual(last);
      last = freeBand(t);
    }
  });

  test("lies on the picture where the turned screen is seen to end", () => {
    const stops = freeShades(0.6, 0.5);
    expect(stops[0]).toEqual([0, 0]);
    const [at, dark] = stops.at(-1) ?? [0, 0];
    expect(at).toBe(0.5);
    expect(dark).toBeCloseTo(freeDepth(0.6), 3);
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
    // Where the first is all the way in, the blur is as wide as it, Apple's as far across what its camera sees.
    const area = blurArea("inner", uvOf("inner", seenAlong(first.to, 1, appleSeen("inner", 0.6))), wipeAmount("inner", 0.6));
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

describe("quadMap", () => {
  const RECT = { x: 20, y: 10, width: 300, height: 200 };
  const QUADS: Quad[] = [
    [[0, 0], [300, 0], [300, 200], [0, 200]],
    [[113.33, 358.02], [1559.84, 377.23], [1559.84, 2382.78], [113.33, 2401.99]],
    [[40, 30], [500, 80], [420, 600], [10, 380]],
  ];

  test("lays each corner of the rect on its corner of the quad, exactly", () => {
    for (const quad of QUADS) {
      const seen = quadMap(RECT, quad);
      if (!seen) throw new Error("no map");
      const corners = [
        [RECT.x, RECT.y],
        [RECT.x + RECT.width, RECT.y],
        [RECT.x + RECT.width, RECT.y + RECT.height],
        [RECT.x, RECT.y + RECT.height],
      ];
      corners.forEach(([x = 0, y = 0], index) => {
        const point = seen({ x, y });
        expect(point.x).toBeCloseTo(quad[index]?.[0] ?? NaN, 4);
        expect(point.y).toBeCloseTo(quad[index]?.[1] ?? NaN, 4);
      });
    }
  });

  test("keeps the middle where the quad's diagonals cross, as a flat screen in perspective", () => {
    const quad = QUADS[2];
    if (!quad) throw new Error("no quad");
    const middle = quadMap(RECT, quad)?.({ x: RECT.x + RECT.width / 2, y: RECT.y + RECT.height / 2 });
    if (!middle) throw new Error("no map");
    const [[x0, y0], , [x2, y2]] = quad;
    const [, [x1, y1], , [x3, y3]] = quad;
    // Where the lines from corner 0 to 2 and from 1 to 3 cross.
    const t = ((x1 - x0) * (y3 - y1) - (y1 - y0) * (x3 - x1)) / ((x2 - x0) * (y3 - y1) - (y2 - y0) * (x3 - x1));
    expect(middle.x).toBeCloseTo(x0 + (x2 - x0) * t, 4);
    expect(middle.y).toBeCloseTo(y0 + (y2 - y0) * t, 4);
  });

  test("is none for a screen seen edge on", () => {
    expect(quadMap(RECT, [[10, 0], [10.01, 0], [10.01, 50], [10, 50]])).toBeNull();
    expect(quadMap({ ...RECT, width: 0 }, QUADS[0] ?? [[0, 0], [0, 0], [0, 0], [0, 0]])).toBeNull();
  });
});

describe("the Duo's fold frames", () => {
  if (!DUO_FOLD) return;
  const shots = DUO_FOLD;

  test("run from open to shut every degree, 181 of them, both ends with them", () => {
    expect(shots.frames).toHaveLength(181);
    expect(shots.frames.map((shot) => shot.deg)).toEqual(Array.from({ length: 181 }, (_, index) => index));
  });

  test("show the one nearest the hinge's angle, either way it turns, the more open of two as near", () => {
    const at = (deg: number) => shots.frames[shotAt(shots, 1 - deg / 180)]?.deg;
    expect([at(0), at(0.4), at(0.6), at(1), at(1.4), at(1.6)]).toEqual([0, 0, 1, 1, 1, 2]);
    expect([at(89), at(90), at(90.4), at(90.6), at(179.6), at(180)]).toEqual([89, 90, 90, 91, 180, 180]);
    expect(at(1.5)).toBe(1);
    // Opening or shutting, the same angle shows the same frame: no pair, no fade, no warp.
    for (let deg = 0; deg <= 180; deg += 0.37) {
      const shown = at(deg) ?? NaN;
      expect(Math.abs(shown - deg)).toBeLessThanOrEqual(0.5 + 1e-9);
    }
  });

  test("where the nearest is not decoded yet, show the nearest that is, never none while one is", () => {
    const ready = [true, false, false, false, true, false];
    expect(nearestReady(ready, 0)).toBe(0);
    expect(nearestReady(ready, 1)).toBe(0);
    expect(nearestReady(ready, 3)).toBe(4);
    expect(nearestReady(ready, 2)).toBe(0);
    expect(nearestReady(ready, 5)).toBe(4);
    expect(nearestReady([null, null], 1)).toBeNull();
  });

  test("decode those round the hinge and more ahead of it as it goes, none past the ends", () => {
    expect([SHOTS_AROUND, SHOTS_AHEAD]).toEqual([10, 10]);
    expect(shotsWindow(181, 90, 0)).toEqual([80, 100]);
    // Shutting, the angle and the frames grow: ahead is after it.
    expect(shotsWindow(181, 90, 1)).toEqual([80, 110]);
    expect(shotsWindow(181, 90, -1)).toEqual([70, 100]);
    expect(shotsWindow(181, 0, 1)).toEqual([0, 20]);
    expect(shotsWindow(181, 180, -1)).toEqual([160, 180]);
    expect(shotsWindow(181, 175, 1)).toEqual([165, 180]);
    // At rest, those a fold from that end starts with: from the end, ahead toward the other.
    const resting = (rest: number) => shotsWindow(shots.frames.length, shotAt(shots, rest), towardFrom(rest));
    expect([towardFrom(0), towardFrom(1)]).toEqual([-1, 1]);
    expect(resting(1)).toEqual([0, SHOTS_AROUND + SHOTS_AHEAD]);
    expect(resting(0)).toEqual([180 - SHOTS_AROUND - SHOTS_AHEAD, 180]);
  });

  test("face the viewer by the inside up to a right angle, the outside past it, one in each frame", () => {
    for (const shot of shots.frames) {
      const pane = shotPane(shots, shot);
      expect(pane).toBe(shot.deg <= 90 ? "inner" : "cover");
      if (pane) expect(Math.abs(quadArea(shotQuad(shot, pane)))).toBeGreaterThan(1000);
    }
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
    const glued = quadMap({ x: 0, y: 0, width: rect.width, height: rect.height }, quadFacing(shotQuad(frame, pane), across));
    if (!glued) throw new Error("no map");
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
      const onFrame = glued({ x, y });
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
    for (const shot of shots.frames.filter((frame) => shotPane(shots, frame) === "inner")) {
      expect(shotPicture(shots, "inner", shotQuad(shot, "inner"))).toEqual({ x, y, width: width / 2, height });
    }
  });

  test("slide the folded screen's page along with its hinge side, as big as it lies shut", () => {
    const last = shots.frames.at(-1);
    if (!last) throw new Error("no frames");
    const [[left, top], , [right, bottom]] = shotQuad(last, "cover");
    for (const shot of shots.frames.filter((frame) => shotPane(shots, frame) === "cover")) {
      const quad = shotQuad(shot, "cover");
      expect(shotPicture(shots, "cover", quad)).toEqual({ x: quad[0][0], y: top, width: right - left, height: bottom - top });
    }
  });

  test("darken the turned screen past the page, above and below its free edge, the more the nearer it comes", () => {
    const dark = (deg: number) => {
      const shot = shots.frames.find((frame) => frame.deg === deg);
      const pane = shot && shotPane(shots, shot);
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

  test("keep the device under them on the render all the way, so the still half's live screen stays in its rendered hole", () => {
    const [x, y, width, height] = shots.open;
    const screen = [[x, y], [x + width, y], [x + width, y + height], [x, y + height]] as const;
    for (const across of [true, false]) {
      const { layout, inside, outside } = bezelled(across);
      for (const posture of ["open", "closed"] as const) {
        // At its own end the device does not move.
        const end = shotsDrift(shots, layout, inside, outside, posture === "open" ? 1 : 0, posture);
        expect(end.wide).toBeCloseTo(1, 9);
        expect(end.tall).toBeCloseTo(1, 9);
        expect(end.x).toBeCloseTo(0, 6);
        expect(end.y).toBeCloseTo(0, 6);
      }
      for (const open of [0.2, 0.5, 0.9]) {
        // The open screen, drawn open and moved on, lies where the render's does, within a hundredth of a px.
        const drift = shotsDrift(shots, layout, inside, outside, open, "open");
        const seen = boundsThrough(shotsTransform(shots, layout, inside, outside, open), screen);
        const moved = {
          x: inside.x * drift.wide + drift.x,
          y: inside.y * drift.tall + drift.y,
          width: inside.width * drift.wide,
          height: inside.height * drift.tall,
        };
        for (const key of ["x", "y", "width", "height"] as const) expect(Math.abs(moved[key] - seen[key])).toBeLessThan(0.02);
        // The render is a little smaller than the device between the ends: without moving it, they would part by px.
        expect(Math.abs(seen.width - inside.width)).toBeGreaterThan((1 - open) * 8);
      }
    }
  });

  test("draw every layer at the angle of the frame shown, so between frames nothing moves, and at one all of it does", () => {
    const all = shots.frames.map(() => true);
    // Each frame shows its own angle, so the frame it shows is itself, and the ends are exact.
    shots.frames.forEach((shot, index) => expect(shownAt(shots, all, shotOpen(shot))).toEqual({ at: index, open: shotOpen(shot) }));
    expect([shownAt(shots, all, 1), shownAt(shots, all, 0)]).toEqual([{ at: 0, open: 1 }, { at: 180, open: 0 }]);
    expect(shownAt(shots, all, 0.999).open).toBe(1);
    expect(shownAt(shots, all, 0.001).open).toBe(0);
    for (const across of [true, false]) {
      const { layout, inside, outside } = bezelled(across);
      /** Every value a layer is drawn by, with the hinge `open` of the way open. */
      const drawn = (open: number) => {
        const at = shownAt(shots, all, open).open;
        return JSON.stringify([
          foldFrame(layout, at),
          shotsTransform(shots, layout, inside, outside, at),
          shotsDrift(shots, layout, inside, outside, at, "open"),
          shotsDrift(shots, layout, inside, outside, at, "closed"),
          screenDim("inner", at),
          screenDim("cover", at),
          paneLook("inner", at, 951),
          paneLook("cover", at, 466),
          paneLook("inner", at, 951, 0.4),
          paneLook("cover", at, 466, 0.4),
          freeShades(at, 0.9),
          screenLook("inner", at, 951, 12, 0.9),
          screenLook("cover", at, 466, 12, 0.9),
        ]);
      };
      let last = drawn(0);
      let lastShot = shownAt(shots, all, 0).at;
      let changes = 0;
      // A slow hand, a fifth of a degree a frame.
      for (let open = 0; open <= 1; open += 1 / 900) {
        const now = drawn(open);
        const shot = shownAt(shots, all, open).at;
        if (shot === lastShot) expect(now).toBe(last);
        else {
          expect(now).not.toBe(last);
          changes += 1;
        }
        last = now;
        lastShot = shot;
      }
      expect(changes).toBe(180);
    }
  });

  test("draw every layer at the angle of the nearest frame decoded, while the one the hinge is at is not, and at the hinge's own with none", () => {
    const ready = shots.frames.map((shot) => shot.deg === 40 || shot.deg === 50);
    // At 44 degrees the nearest decoded is 40, at 46 it is 50: nothing moves till then.
    expect(shownAt(shots, ready, 1 - 44 / 180)).toEqual({ at: 40, open: 1 - 40 / 180 });
    expect(shownAt(shots, ready, 1 - 42 / 180)).toEqual(shownAt(shots, ready, 1 - 30 / 180));
    expect(shownAt(shots, ready, 1 - 46 / 180)).toEqual({ at: 50, open: 1 - 50 / 180 });
    expect(shownAt(shots, [], 0.37)).toEqual({ at: null, open: 0.37 });
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
