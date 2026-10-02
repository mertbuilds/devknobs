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

/** Set the clock the page reads, or put the real one back with null or `system`. */
export function setClock(value: ClockValue | null): void {
  shared.clock = value && value.mode !== "system" ? { ...value } : null;
}

export function clockOn(): boolean {
  return shared.clock !== null;
}

/** What `Date.now()` reads: the clock's instant, or the real one with no clock set. */
export function now(): number {
  return shared.clock ? virtualNow(shared.clock, realNow()) : realNow();
}

/** What the time zone knob adds to the `Date` proxy. The early script goes without. */
export interface ZoneHooks {
  on(): boolean;
  /** Constructor arguments that name the same instant in the emulated zone. */
  args(args: unknown[]): unknown[];
  parse(value: unknown): number;
}

/**
 * The page's `Date`, one proxy for the clock and the time zone knob. Built
 * with no arguments it lands on the clock's instant, and `Date()` prints that
 * instant. Any argument names an instant of its own, which the clock leaves
 * alone. The prototype is the same object, so `instanceof Date` holds for
 * dates from before the patch too.
 */
export function wrapDate(original: DateConstructor, zone?: ZoneHooks): DateConstructor {
  return new Proxy(original, {
    construct(target, args: unknown[], newTarget) {
      if (args.length === 0 && shared.clock) return Reflect.construct(target, [now()], newTarget);
      return Reflect.construct(target, zone ? zone.args(args) : args, newTarget);
    },
    apply(target, thisArg, args: unknown[]) {
      if (!shared.clock && !zone?.on()) return Reflect.apply(target, thisArg, args);
      return String(new NativeDate(now()));
    },
    get(target, key, receiver) {
      if (key === "now") return now;
      if (key === "parse" && zone) return zone.parse;
      return Reflect.get(target, key, receiver);
    },
  });
}

interface ZonedDateTime {
  toPlainDateTime(): unknown;
  toPlainDate(): unknown;
  toPlainTime(): unknown;
}

interface Instant {
  toZonedDateTimeISO(timeZone: unknown): ZonedDateTime;
}

interface TemporalScope {
  Temporal?: {
    Now?: Record<string, unknown>;
    Instant?: { fromEpochMilliseconds(time: number): Instant };
  };
}

/** What each `Temporal.Now` reader makes of the current instant, in a zone. */
const READERS = {
  instant: (instant: Instant) => instant,
  zonedDateTimeISO: (instant: Instant, zone: unknown) => instant.toZonedDateTimeISO(zone),
  plainDateTimeISO: (instant: Instant, zone: unknown) =>
    instant.toZonedDateTimeISO(zone).toPlainDateTime(),
  plainDateISO: (instant: Instant, zone: unknown) => instant.toZonedDateTimeISO(zone).toPlainDate(),
  plainTimeISO: (instant: Instant, zone: unknown) => instant.toZonedDateTimeISO(zone).toPlainTime(),
};

export type NowReaderName = keyof typeof READERS;

export const NOW_READERS = Object.keys(READERS) as NowReaderName[];

export type NowReader = (this: unknown, timeZone?: unknown) => unknown;

/** `Temporal.Now`, where the engine has it. */
export function temporalNow(): Record<string, unknown> | undefined {
  return (globalThis as TemporalScope).Temporal?.Now;
}

/**
 * A `Temporal.Now` reader at the clock's instant. `zoneOf` picks the zone for
 * the zone argument a call gave, undefined included; with no zone the reader
 * takes the one `Temporal.Now.timeZoneId()` reports.
 */
export function readNow(
  key: NowReaderName,
  original: NowReader,
  zoneOf: (timeZone: unknown) => unknown,
): NowReader {
  return function (this: unknown, timeZone?: unknown) {
    const zone = zoneOf(timeZone);
    const temporal = (globalThis as TemporalScope).Temporal;
    if (!shared.clock || !temporal?.Instant) return original.call(this, zone);
    const instant = temporal.Instant.fromEpochMilliseconds(now());
    const timeZoneId = temporal.Now?.timeZoneId;
    const host = typeof timeZoneId === "function" ? timeZoneId.call(temporal.Now) : undefined;
    return READERS[key](instant, zone ?? host);
  };
}

/** What the early script leaves for the full one to take over. */
interface EarlyClock {
  /** Put the engine's own `Date` and `Temporal.Now` back. The clock stays set. */
  release(): void;
}

/**
 * Where the early script leaves its patches. The full script sets it to null
 * once it applies, so an early script that runs after it stays out.
 */
const EARLY = Symbol.for("devknobs.early.clock");

type EarlyScope = Record<symbol, EarlyClock | null | undefined>;

/**
 * The early script's part: set the stored clock before any page script reads
 * the time, with the same `Date` proxy and `Temporal.Now` readers the full
 * script puts in, less the zone.
 */
export function early(value: ClockValue): void {
  const scope = globalThis as unknown as EarlyScope;
  if (EARLY in scope || value.mode === "system") return;
  setClock(value);
  const undo: (() => void)[] = [];
  const swap = (target: object, key: string, next: unknown) => {
    const original = Reflect.get(target, key);
    if (!Reflect.set(target, key, next)) return;
    undo.push(() => {
      if (Reflect.get(target, key) === next) Reflect.set(target, key, original);
    });
  };
  swap(globalThis, "Date", wrapDate(NativeDate));
  swap(NativeDate.prototype, "constructor", globalThis.Date);
  const now = temporalNow();
  for (const key of NOW_READERS) {
    const original = now?.[key];
    if (now && typeof original === "function") {
      const reader = readNow(key, original as NowReader, (timeZone) => timeZone);
      swap(now, key, reader);
    }
  }
  scope[EARLY] = {
    release: () => {
      for (const step of undo.reverse()) step();
    },
  };
}

/** Take the early script's patches off, once, before the full script puts its own on. */
export function takeOver(): void {
  const scope = globalThis as unknown as EarlyScope;
  const patches = scope[EARLY];
  scope[EARLY] = null;
  patches?.release();
}
