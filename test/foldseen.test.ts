import { describe, expect, test } from "bun:test";
import { APPLE_SEEN, appleSeen, NEAR_BLUR, nearBlur, paneLook, seenAlong, seenAt, seenShare } from "../src/engine/fold";

/**
 * How much of the turned screen Apple's camera sees, from the hinge out, in
 * its frames of the Duo's fold, by how far open the hinge is: the open
 * screen's from 0.6 open, the folded one's to 0.4, and neither at a right
 * angle, where the turned screen is seen edge on.
 */
const SEEN_MEASURED = {
  inner: [[0.5, 0], [0.6, 0.58], [0.7, 0.88], [0.8, 0.97]],
  cover: [[0.1, 0.96], [0.2, 0.87], [0.3, 0.67], [0.4, 0.3], [0.5, 0]],
} as const;

/**
 * How wide the blur at the hinge of Apple's turned screen is, as a share of
 * the screen across the hinge, by how far open the hinge is: a gaussian
 * fitted to each frame against the picture lying flat, a strip at a time,
 * its sigma less the fit's own over frames lying flat, 1.85 times over for
 * the width of a blur as `blurAt` draws it. Each with how far off the
 * frames themselves are.
 */
const NEAR_MEASURED: Record<"inner" | "cover", [open: number, width: number, off: number][]> = {
  // Its hinge side still reads at 0.6, "Wed Apr 1" on it: at most a few px of the frame.
  inner: [[0.9, 0, 0.003], [0.8, 0.001, 0.003], [0.6, 0.004, 0.004]],
  cover: [[0.1, 0, 0.003], [0.2, 0.004, 0.003], [0.3, 0.011, 0.004], [0.4, 0.022, 0.004]],
};

describe("what Apple's camera sees and blurs", () => {
  test("sees as much of each turned screen as its frames show, all of it lying flat and none at a right angle", () => {
    for (const pane of ["inner", "cover"] as const) {
      for (const [open, seen] of SEEN_MEASURED[pane]) expect(appleSeen(pane, open)).toBeCloseTo(seen, 6);
      expect(appleSeen(pane, 0.5)).toBe(0);
    }
    expect(appleSeen("inner", 1)).toBe(1);
    expect(appleSeen("cover", 0)).toBe(1);
    expect(appleSeen("inner", 0.65)).toBeCloseTo((0.58 + 0.88) / 2, 6);
    expect(APPLE_SEEN.inner.at(-1)).toEqual([1, 1]);
  });

  test("lays what this fold shows of the turned screen over what Apple's shows", () => {
    expect(seenAlong(0, 0.3, 0.6)).toBe(0);
    expect(seenAlong(0.15, 0.3, 0.6)).toBeCloseTo(0.3);
    expect(seenAlong(0.3, 0.3, 0.6)).toBeCloseTo(0.6);
    // Past where it is seen to end, no further.
    expect(seenAlong(0.9, 0.3, 0.6)).toBeCloseTo(0.6);
    expect(seenAlong(0.5, 1, 1)).toBe(0.5);
    expect(seenAlong(0.5, 0, 0.4)).toBe(0.4);
  });

  test("blurs the whole turned screen as Apple's frames show it at the hinge, within as far as they differ", () => {
    for (const pane of ["inner", "cover"] as const) {
      for (const [open, width, off] of NEAR_MEASURED[pane]) expect(Math.abs(nearBlur(pane, open) - width)).toBeLessThanOrEqual(off);
    }
  });

  test("is none lying flat, open or shut, and grows all the way to a right angle, where nothing on the screen reads", () => {
    for (const pane of ["inner", "cover"] as const) {
      expect(nearBlur(pane, 0)).toBe(0);
      expect(nearBlur(pane, 1)).toBe(0);
      expect(nearBlur(pane, 0.5)).toBe(NEAR_BLUR[pane].most);
      let last = 0;
      for (let open = 0; open <= 0.5; open += 0.01) {
        expect(nearBlur(pane, open)).toBeGreaterThanOrEqual(last);
        expect(nearBlur(pane, 1 - open)).toBeCloseTo(nearBlur(pane, open), 9);
        last = nearBlur(pane, open);
      }
    }
    // Wider than text 12 css px tall, on the open screen and the folded one, so none of it reads.
    expect(nearBlur("inner", 0.5) * 903).toBeGreaterThan(24);
    expect(nearBlur("cover", 0.5) * 466).toBeGreaterThan(12);
    // Still so 6 degrees off it, as the open screen stands all but square to the screen.
    expect(nearBlur("inner", 0.533) * 903).toBeGreaterThan(12);
  });

  test("fades a blurrier picture in all over the turned screen near a right angle, not only toward its free edge", () => {
    const [first, second] = paneLook("inner", 0.53, 903, 0.1).blurs;
    if (!first || !second) throw new Error("no blur");
    expect(first.least).toBe(1);
    expect(second.least).toBeGreaterThan(0);
    expect(second.least).toBeLessThanOrEqual(second.most);
    // Far from it, none from the hinge.
    expect(paneLook("inner", 0.9, 903).blurs.every((blur) => !blur || blur.least === 0)).toBe(true);
  });
});

describe("seenShare", () => {
  const rect = { x: 0, y: 0, width: 100, height: 200 };
  test("is all of the turned half lying flat, and as much as seenAt shows of it standing", () => {
    expect(seenShare(rect, { x: 100, y: 100 }, 0, true, 1000)).toBe(1);
    const standing = seenAt({ x: 0, y: 100 }, { x: 100, y: 100 }, 60, true, 1000);
    expect(seenShare(rect, { x: 100, y: 100 }, 60, true, 1000)).toBeCloseTo((100 - standing.x) / 100, 9);
    expect(seenShare(rect, { x: 100, y: 100 }, 90, true, 1000)).toBeCloseTo(0, 9);
    // Held upright, from a hinge along its top, and turned the other way, as the folded body is.
    const upright = seenAt({ x: 50, y: 200 }, { x: 50, y: 0 }, -60, false, 1000);
    expect(seenShare(rect, { x: 50, y: 0 }, -60, false, 1000)).toBeCloseTo(upright.y / 200, 9);
  });
});
