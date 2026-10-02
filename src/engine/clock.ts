import type { ClockValue } from "../types";

const HOUR = 3_600_000;
const DAY = 86_400_000;

/** Jumps the panel offers, each from the real now. */
export const CLOCK_PRESETS = [
  { label: "+1h", ms: HOUR },
  { label: "+1d", ms: DAY },
  { label: "+2d", ms: 2 * DAY },
  { label: "+1w", ms: 7 * DAY },
  { label: "+30d", ms: 30 * DAY },
] as const;

/** What every devknobs script on the page shares. */
interface Shared {
  /** The engine's own `Date`, as the first devknobs script on the page found it. */
  Date: DateConstructor;
  /** The clock the page reads, or null for the real one. */
  clock: ClockValue | null;
}

/**
 * The early script and the full one are two copies, and the early one patches
 * `Date` before the full one loads. Both keep the engine's own `Date` and the
 * clock here, so the full one never takes the early patch for the real thing,
 * and a `Date` the page kept from the early patch follows the knob still.
 */
const SHARED = Symbol.for("devknobs.clock");
const shared: Shared = ((globalThis as unknown as Record<symbol, Shared | undefined>)[SHARED] ??= {
  Date,
  clock: null,
});

export const NativeDate: DateConstructor = shared.Date;

/** The real time, in epoch ms, whatever the clock says. */
export function realNow(): number {
  return NativeDate.now();
}

/**
 * What the clock reads at a real instant, in whole epoch ms: running from `at`
 * since `since` at its speed, stopped at `at`, or the real time.
 */
export function virtualNow(clock: ClockValue, real: number): number {
  if (clock.mode === "frozen") return clock.at;
  if (clock.mode === "offset") return Math.floor(clock.at + (real - clock.since) * clock.speed);
  return real;
}

type Anchor = "at" | "mode" | "speed";

/**
 * Patch a clock, anchoring it again whenever it moves: a new `at` runs from
 * the real now, and a new mode or speed carries on from where the clock
 * stands, so nothing jumps. A `since` of its own is taken as given.
 */
export function mergeClock(
  clock: ClockValue,
  patch: Partial<ClockValue> | undefined,
  real = realNow(),
): ClockValue {
  if (!patch) return clock;
  const next = { ...clock, ...patch };
  if (patch.since !== undefined && patch.since !== clock.since) return next;
  const moved = (key: Anchor) => patch[key] !== undefined && patch[key] !== clock[key];
  if (moved("at")) return { ...next, since: real };
  if (moved("mode") || moved("speed")) return { ...next, at: virtualNow(clock, real), since: real };
  return next;
}
