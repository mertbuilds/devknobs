import { describe, expect, test } from "bun:test";
import { overflowBadge } from "../src/ui/panel";

describe("overflowBadge", () => {
  test("counts while the overflow knob is on", () => {
    expect(overflowBadge(true, 0)).toBe(" · 0 overflowing");
    expect(overflowBadge(true, 2)).toBe(" · 2 overflowing");
  });

  test("says nothing while the knob is off", () => {
    expect(overflowBadge(false, 0)).toBe("");
    expect(overflowBadge(false, 2)).toBe("");
  });

  test("says nothing before the frame reports a count", () => {
    expect(overflowBadge(true, null)).toBe("");
  });
});
