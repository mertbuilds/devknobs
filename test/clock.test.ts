import { describe, expect, test } from "bun:test";
import { mergeClock, virtualNow } from "../src/engine/clock";
import { DEFAULT_STATE, merge, parse } from "../src/engine/store";
import type { ClockValue } from "../src/types";

const HOUR = 3_600_000;
const DAY = 86_400_000;
const REAL = Date.UTC(2026, 9, 2, 12);

function clock(patch: Partial<ClockValue>): ClockValue {
  return { ...DEFAULT_STATE.clock, ...patch };
}

describe("virtualNow", () => {
  test("the system clock is the real one", () => {
    expect(virtualNow(DEFAULT_STATE.clock, REAL)).toBe(REAL);
  });

  test("an offset clock runs on from where it was set", () => {
    const ahead = clock({ mode: "offset", at: REAL + 2 * DAY, since: REAL });
    expect(virtualNow(ahead, REAL)).toBe(REAL + 2 * DAY);
    expect(virtualNow(ahead, REAL + HOUR)).toBe(REAL + 2 * DAY + HOUR);
  });

  test("speed scales the time since the anchor, not the offset", () => {
    const fast = clock({ mode: "offset", at: REAL + DAY, since: REAL, speed: 60 });
    expect(virtualNow(fast, REAL)).toBe(REAL + DAY);
    expect(virtualNow(fast, REAL + 1000)).toBe(REAL + DAY + 60_000);
    const slow = clock({ mode: "offset", at: REAL, since: REAL, speed: 0.5 });
    expect(virtualNow(slow, REAL + 3)).toBe(REAL + 1);
  });

  test("a frozen clock stays put, whatever the speed", () => {
    const frozen = clock({ mode: "frozen", at: REAL - DAY, since: REAL, speed: 3600 });
    expect(virtualNow(frozen, REAL)).toBe(REAL - DAY);
    expect(virtualNow(frozen, REAL + DAY)).toBe(REAL - DAY);
  });
});

describe("mergeClock", () => {
  const running = clock({ mode: "offset", at: REAL + DAY, since: REAL, speed: 60 });

  test("a new instant runs from the real now", () => {
    const next = mergeClock(running, { at: REAL + 7 * DAY }, REAL + 1000);
    expect(next).toEqual({ ...running, at: REAL + 7 * DAY, since: REAL + 1000 });
  });

  test("a new speed or mode carries on from where the clock stands", () => {
    const later = REAL + 1000;
    const standing = virtualNow(running, later);
    const slower = mergeClock(running, { speed: 1 }, later);
    expect(slower).toMatchObject({ at: standing, since: later, speed: 1 });
    expect(virtualNow(slower, later + 1000)).toBe(standing + 1000);
    const frozen = mergeClock(running, { mode: "frozen" }, later);
    expect(virtualNow(frozen, later + DAY)).toBe(standing);
    const resumed = mergeClock(frozen, { mode: "offset" }, later + DAY);
    expect(virtualNow(resumed, later + DAY)).toBe(standing);
  });

  test("leaving the system clock starts from the real now", () => {
    const next = mergeClock(DEFAULT_STATE.clock, { mode: "offset", speed: 3600 }, REAL);
    expect(next).toEqual({
      ...DEFAULT_STATE.clock,
      mode: "offset",
      at: REAL,
      since: REAL,
      speed: 3600,
    });
  });

  test("a clock spread back with one field changed still takes a new anchor", () => {
    const next = mergeClock(running, { ...running, speed: 1 }, REAL + 1000);
    expect(next.since).toBe(REAL + 1000);
    expect(next.at).toBe(virtualNow(running, REAL + 1000));
  });

  test("a since of its own is taken as given", () => {
    const next = mergeClock(running, { at: REAL, since: REAL - HOUR }, REAL);
    expect(next).toMatchObject({ at: REAL, since: REAL - HOUR });
  });

  test("the header, or nothing at all, leaves the anchor alone", () => {
    expect(mergeClock(running, undefined, REAL + DAY)).toBe(running);
    expect(mergeClock(running, { header: true }, REAL + DAY)).toEqual({ ...running, header: true });
    expect(mergeClock(running, { mode: "offset", speed: 60 }, REAL + DAY)).toEqual(running);
  });
});

describe("the stored clock", () => {
  test("a reload carries on from the same anchors, time having moved meanwhile", () => {
    const set = merge(DEFAULT_STATE, { clock: { mode: "offset", at: REAL + 2 * DAY, speed: 60 } });
    expect(set.clock.since).toBeGreaterThan(0);
    const reloaded = merge(parse(JSON.stringify(set)), {});
    expect(reloaded.clock).toEqual(set.clock);
    const closedFor = 10_000;
    expect(virtualNow(reloaded.clock, set.clock.since + closedFor)).toBe(
      REAL + 2 * DAY + closedFor * 60,
    );
  });
});
