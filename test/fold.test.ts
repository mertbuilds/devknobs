import { describe, expect, test } from "bun:test";
import {
  blurShares,
  foldFrame,
  foldLayout,
  foldLight,
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

describe("foldLight", () => {
  test("brightens the open screen from a quarter as it opens, and the folded one as it shuts", () => {
    expect(foldLight(0).dim).toBe(0.75);
    expect(foldLight(1).dim).toBe(0);
    expect(foldLight(0.5).dim).toBeCloseTo(0.375);
    expect(foldLight(0).coverDim).toBe(0);
    expect(foldLight(1).coverDim).toBe(0.75);
  });

  test("blurs and shades the half that turns the more it stands, sharp and bright as it lands", () => {
    expect(foldLight(1)).toEqual({ dim: 0, coverDim: 0.75, edge: 0, coverEdge: 1, blur: 0, coverBlur: 1 });
    expect(foldLight(0)).toEqual({ dim: 0.75, coverDim: 0, edge: 1, coverEdge: 0, blur: 1, coverBlur: 0 });
    expect(foldLight(0.5).blur).toBeCloseTo(0.6);
    expect(foldLight(0.9).blur).toBeCloseTo(0.12);
    expect(foldLight(0.1).coverBlur).toBeCloseTo(0.12);
    let last = 2;
    for (let open = 0; open <= 1; open += 0.05) {
      expect(foldLight(open).blur).toBeLessThanOrEqual(last);
      last = foldLight(open).blur;
    }
  });

  test("shows the blurrier pictures one after the other as the blur grows", () => {
    expect(blurShares(0)).toEqual([0, 0]);
    expect(blurShares(0.2)).toEqual([0.5, 0]);
    expect(blurShares(0.4)).toEqual([1, 0.4]);
    expect(blurShares(0.65)).toEqual([1, 1]);
    expect(blurShares(1)).toEqual([1, 1]);
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
