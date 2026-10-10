import { describe, expect, test } from "bun:test";
import { seenAt, seenShare } from "../src/engine/fold";

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
