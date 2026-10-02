import { afterEach, describe, expect, test } from "bun:test";
import { apply, reset } from "../src/engine/time";
import { overflowBadge, wallInput } from "../src/ui/panel";

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

describe("wallInput", () => {
  afterEach(() => {
    reset();
  });

  test("writes an instant the way a datetime-local input reads it", () => {
    expect(wallInput(new Date(2026, 9, 4, 9, 5, 30).getTime())).toBe("2026-10-04T09:05");
    expect(wallInput(new Date(999, 0, 1).getTime())).toBe("0999-01-01T00:00");
  });

  test("on the clock face of the emulated zone", () => {
    apply("Asia/Tokyo");
    expect(wallInput(Date.UTC(2026, 9, 4, 0, 5))).toBe("2026-10-04T09:05");
  });
});
