import { describe, expect, test } from "bun:test";
import {
  angleOf,
  blurOf,
  FOLD_BLUR,
  FOLD_CURVE,
  foldAt,
  foldBlurAt,
  foldFrame,
  foldLayout,
  type FoldSide,
  foldTime,
  unblurAt,
} from "../src/engine/fold";
import { mockOf } from "../src/engine/mock";
import { ease, MORPH_TIME } from "../src/engine/morph";

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
    expect(layout.clips.rest).toBe(`inset(0 0 0 ${Math.round(hinge * 100) / 100}px)`);
    expect(layout.open).toEqual({ width: body.width, height: body.height });
    expect(layout.depth).toBeCloseTo(4.5 * hinge);
  });

  test("lays it above the hinge held upright open, as the folded phone turned a quarter", () => {
    const { closed, open } = sides(false);
    const layout = foldLayout(closed, open, false);
    const body = open.body;
    if (!body || !closed.body) throw new Error("no body");
    const hinge = body.inset.top + 951 / 2;
    expect(layout.shut.y + layout.shut.height).toBeCloseTo(hinge);
    expect(layout.shut.x + closed.body.inset.left + 678 / 2).toBeCloseTo(body.inset.left + 669 / 2);
    expect(layout.clips.inner).toBe(`inset(${Math.round((hinge - 1) * 100) / 100}px 0 0 0)`);
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

describe("foldFrame", () => {
  const { closed, open } = sides(true);
  const layout = foldLayout(closed, open, true);

  test("is the folded body alone when shut, and the open body flat when open", () => {
    const shut = foldFrame(layout, 180);
    expect(shut.inner).toBeNull();
    expect(shut.outer).toEqual({ transform: "perspective(" + Math.round(layout.depth * 100) / 100 + "px) rotateY(0deg)", shade: 1 });
    expect(shut.rest).toBe(0);
    expect(shut.place).toBe(`translate(${Math.round(layout.folded.x * 100) / 100}px, ${Math.round(layout.folded.y * 100) / 100}px) scale(${layout.folded.scale})`);
    const flat = foldFrame(layout, 0);
    expect(flat.outer).toBeNull();
    expect(flat.inner?.transform).toEndWith("rotateY(0deg)");
    expect(flat.inner?.shade).toBe(1);
    expect(flat.rest).toBe(1);
    expect(flat.place).toContain(`scale(${layout.unfolded.scale})`);
  });

  test("turns the half toward the viewer about the hinge, its inside up to a right angle and its outside past it, darker as it stands", () => {
    const rising = foldFrame(layout, 60);
    expect(rising.inner?.transform).toEndWith("rotateY(60deg)");
    expect(rising.outer).toBeNull();
    expect(rising.inner?.shade).toBeCloseTo(1 - 0.5 * Math.sin(Math.PI / 3), 2);
    const past = foldFrame(layout, 120);
    expect(past.inner).toBeNull();
    expect(past.outer?.transform).toEndWith("rotateY(-60deg)");
    expect(past.outer?.shade).toBeCloseTo(1 - 0.35 * Math.sin(Math.PI / 3), 2);
    expect(foldFrame(foldLayout(sides(false).closed, sides(false).open, false), 60).inner?.transform).toEndWith(
      "rotateX(60deg)",
    );
  });

  test("brings the half that stays out from under the folded body over the first 30 degrees", () => {
    expect(foldFrame(layout, 165).rest).toBeCloseTo(0.5);
    expect(foldFrame(layout, 150).rest).toBe(1);
  });
});

describe("timing", () => {
  test("a posture's angle, and a half turn takes the whole time", () => {
    expect(angleOf("open")).toBe(0);
    expect(angleOf("closed")).toBe(180);
    expect(foldTime(180, 0)).toBe(MORPH_TIME.fold);
    expect(foldTime(90, 0)).toBe(MORPH_TIME.fold / 2);
    expect(MORPH_TIME.fold).toBeGreaterThanOrEqual(450);
    expect(MORPH_TIME.fold + MORPH_TIME.foldCover).toBeLessThanOrEqual(600);
  });

  test("turns on the hinge's curve, and lands exactly", () => {
    expect(foldAt(180, 0, 0)).toBe(180);
    expect(foldAt(180, 0, MORPH_TIME.fold / 2)).toBeCloseTo(180 * (1 - ease(FOLD_CURVE, 0.5)));
    expect(foldAt(47.3, 180, foldTime(47.3, 180))).toBe(180);
    expect(foldAt(47.3, 180, 10000)).toBe(180);
    let last = 180;
    for (let elapsed = 0; elapsed <= MORPH_TIME.fold; elapsed += 16) {
      const angle = foldAt(180, 0, elapsed);
      expect(angle).toBeLessThanOrEqual(last);
      last = angle;
    }
    // Slow out of the hinge, and settling long at the end.
    expect(foldAt(180, 0, 32)).toBeGreaterThan(170);
    expect(foldAt(180, 0, MORPH_TIME.fold * 0.75)).toBeLessThan(18);
  });

  test("blurs the page quickly before a fold, from as far as it is blurred", () => {
    expect(foldBlurAt(0, 0)).toBe(0);
    expect(foldBlurAt(0, MORPH_TIME.foldCover)).toBe(1);
    expect(foldBlurAt(0.5, MORPH_TIME.foldCover / 2)).toBe(1);
    expect(foldBlurAt(1, 0)).toBe(1);
    expect(foldBlurAt(0, MORPH_TIME.foldCover / 2)).toBeGreaterThan(0.5);
    expect(MORPH_TIME.foldCover).toBeGreaterThanOrEqual(90);
    expect(MORPH_TIME.foldCover).toBeLessThanOrEqual(120);
  });

  test("sharpens the page once laid out, over 200 ms, and lands sharp", () => {
    expect(MORPH_TIME.uncover).toBe(200);
    expect(unblurAt(1, 0)).toBe(1);
    expect(unblurAt(1, MORPH_TIME.uncover / 2)).toBeLessThan(0.5);
    expect(unblurAt(0.4, MORPH_TIME.uncover / 2)).toBeLessThan(0.2);
    expect(unblurAt(1, MORPH_TIME.uncover)).toBe(0);
    expect(unblurAt(1, 10000)).toBe(0);
    let last = 1;
    for (let elapsed = 0; elapsed <= MORPH_TIME.uncover; elapsed += 16) {
      const share = unblurAt(1, elapsed);
      expect(share).toBeLessThanOrEqual(last);
      last = share;
    }
  });
});

describe("blurOf", () => {
  test("blurs hard all the way, a little brighter and more colorful", () => {
    expect(FOLD_BLUR.radius).toBeGreaterThanOrEqual(20);
    expect(FOLD_BLUR.radius).toBeLessThanOrEqual(30);
    expect(blurOf(1)).toBe(`blur(${FOLD_BLUR.radius}px) saturate(1.3) brightness(1.05)`);
    expect(blurOf(0.5)).toBe(`blur(${FOLD_BLUR.radius / 2}px) saturate(1.15) brightness(1.02)`);
  });

  test("scales the radius with the px of the layer it is drawn on", () => {
    expect(blurOf(1, 1.5)).toStartWith(`blur(${FOLD_BLUR.radius * 1.5}px)`);
    expect(blurOf(1, 0.5)).toStartWith(`blur(${FOLD_BLUR.radius / 2}px)`);
  });

  test("is no filter at all at rest, so nothing is left on the page", () => {
    expect(blurOf(0)).toBe("");
    expect(blurOf(0, 3)).toBe("");
    expect(blurOf(unblurAt(1, MORPH_TIME.uncover), 1.5)).toBe("");
    expect(blurOf(-0.1)).toBe("");
  });

  test("blurs in, holds, then sharpens to nothing, over a whole fold", () => {
    const radius = (filter: string) => Number(/blur\(([\d.]+)px\)/.exec(filter)?.[1] ?? 0);
    const seen: number[] = [];
    for (let now = 0; now <= MORPH_TIME.foldCover; now += 16) seen.push(radius(blurOf(foldBlurAt(0, now), 1)));
    seen.push(radius(blurOf(foldBlurAt(0, MORPH_TIME.foldCover), 1)));
    expect(seen[0]).toBe(0);
    expect(seen.at(-1)).toBe(FOLD_BLUR.radius);
    for (let now = 0; now <= MORPH_TIME.uncover; now += 16) seen.push(radius(blurOf(unblurAt(1, now), 1)));
    seen.push(radius(blurOf(unblurAt(1, MORPH_TIME.uncover), 1)));
    expect(Math.max(...seen)).toBe(FOLD_BLUR.radius);
    expect(seen.at(-1)).toBe(0);
  });
});
