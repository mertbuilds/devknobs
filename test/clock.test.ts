import { afterEach, describe, expect, test } from "bun:test";
import { mergeClock, virtualNow } from "../src/engine/clock";
import { setDefaultLocale } from "../src/engine/intl";
import { DEFAULT_STATE, merge, parse } from "../src/engine/store";
import { apply, reset } from "../src/engine/time";
import type { ClockValue } from "../src/types";

const HOUR = 3_600_000;
const DAY = 86_400_000;
const REAL = Date.UTC(2026, 9, 2, 12);

const NativeDate = Date;
const nativeOffset = Date.prototype.getTimezoneOffset;
const AT = Date.UTC(2026, 9, 4, 9, 30);
const WINTER = Date.UTC(2026, 0, 15, 12);

function clock(patch: Partial<ClockValue>): ClockValue {
  return { ...DEFAULT_STATE.clock, ...patch };
}

function frozen(at = AT): ClockValue {
  return clock({ mode: "frozen", at, since: REAL });
}

afterEach(() => {
  reset();
  setDefaultLocale(null);
  Reflect.deleteProperty(globalThis, "Temporal");
});

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

describe("Date on the clock", () => {
  test("Date.now, a bare constructor and Date() read the clock", () => {
    apply(null, frozen());
    expect(Date.now()).toBe(AT);
    expect(new Date().getTime()).toBe(AT);
    expect(Reflect.construct(Date, []).getTime()).toBe(AT);
    expect(Date()).toBe(new NativeDate(AT).toString());
    expect(Reflect.apply(Date, undefined, [0])).toBe(Date());
    class Stamp extends Date {}
    expect(new Stamp().getTime()).toBe(AT);
    expect(new Date() instanceof NativeDate && new Date().constructor === Date).toBe(true);
  });

  test("explicit arguments name an instant of their own", () => {
    apply(null, frozen());
    expect(new Date(0).getTime()).toBe(0);
    expect(new Date(new NativeDate(5)).getTime()).toBe(5);
    expect(new Date(2020, 0, 1).getTime()).toBe(new NativeDate(2020, 0, 1).getTime());
    expect(new Date("2020-01-01T00:00:00Z").getTime()).toBe(Date.UTC(2020, 0, 1));
    expect(new Date("2020-01-01T10:00").getTime()).toBe(NativeDate.parse("2020-01-01T10:00"));
    expect(Date.parse("2020-01-01")).toBe(Date.UTC(2020, 0, 1));
    expect(new Date(Number.NaN).getTime()).toBeNaN();
  });

  test("an offset clock runs on, at its speed", async () => {
    const real = NativeDate.now();
    apply(null, clock({ mode: "offset", at: real + 2 * DAY, since: real }));
    expect(Math.abs(Date.now() - (NativeDate.now() + 2 * DAY))).toBeLessThan(1000);
    apply(null, clock({ mode: "offset", at: real, since: real, speed: 60 }));
    const start = Date.now();
    await Bun.sleep(20);
    expect(Date.now() - start).toBeGreaterThanOrEqual(20 * 60);
  });

  test("the real clock hands the engine's own Date back", () => {
    const now = Date.now;
    apply(null, frozen());
    apply(null, DEFAULT_STATE.clock);
    expect(Date).toBe(NativeDate);
    expect(Date.now).toBe(now);
    expect(Object.getOwnPropertyDescriptor(Date.prototype, "constructor")?.value).toBe(NativeDate);
  });
});

describe("Temporal.Now on the clock", () => {
  /** A stand in for Temporal: an instant knows its ms, its readings their zone. */
  function fakeTemporal() {
    const reading = (kind: string, ms: number, zone: unknown) => `${kind} ${ms} ${zone}`;
    const instant = (ms: number) => ({
      ms,
      toZonedDateTimeISO: (zone: unknown) => ({
        ms,
        zone,
        toPlainDateTime: () => reading("datetime", ms, zone),
        toPlainDate: () => reading("date", ms, zone),
        toPlainTime: () => reading("time", ms, zone),
      }),
    });
    const host = (kind: string) => (zone?: string) => `${kind} real ${zone ?? "host"}`;
    const Now = {
      instant: () => "instant real",
      timeZoneId: () => "Europe/Berlin",
      zonedDateTimeISO: host("zoned"),
      plainDateTimeISO: host("datetime"),
      plainDateISO: host("date"),
      plainTimeISO: host("time"),
    };
    const temporal = { Now, Instant: { fromEpochMilliseconds: instant } };
    Object.defineProperty(globalThis, "Temporal", { configurable: true, value: temporal });
    return { Now, original: { ...Now } };
  }

  test("every reader reads the clock, in the host zone or the one asked for", () => {
    const { Now } = fakeTemporal();
    apply(null, frozen());
    expect(Now.instant()).toMatchObject({ ms: AT });
    expect(Now.zonedDateTimeISO()).toMatchObject({ ms: AT, zone: "Europe/Berlin" });
    expect(Now.zonedDateTimeISO("UTC")).toMatchObject({ ms: AT, zone: "UTC" });
    expect(Now.plainDateTimeISO()).toBe(`datetime ${AT} Europe/Berlin`);
    expect(Now.plainDateISO("UTC")).toBe(`date ${AT} UTC`);
    expect(Now.plainTimeISO()).toBe(`time ${AT} Europe/Berlin`);
  });

  test("the zone knob picks the zone, the clock the instant", () => {
    const { Now } = fakeTemporal();
    apply("Asia/Tokyo", frozen());
    expect(Now.timeZoneId()).toBe("Asia/Tokyo");
    expect(Now.zonedDateTimeISO()).toMatchObject({ ms: AT, zone: "Asia/Tokyo" });
    expect(Now.plainTimeISO("UTC")).toBe(`time ${AT} UTC`);
    apply("Asia/Tokyo");
    expect(Now.instant()).toBe("instant real");
    expect(Now.zonedDateTimeISO()).toBe("zoned real Asia/Tokyo");
  });

  test("reset puts every reader back", () => {
    const { Now, original } = fakeTemporal();
    apply(null, frozen());
    reset();
    expect(Now).toEqual(original);
    expect(Now.instant()).toBe("instant real");
  });

  test("an engine without Temporal is fine", () => {
    apply(null, frozen());
    expect(Date.now()).toBe(AT);
  });
});

describe("with the time zone and locale knobs", () => {
  const ZONE = "Asia/Kathmandu";
  type Knob = "zone" | "clock";

  /** Everything the knobs patch on Date and Intl, as it sits right now. */
  function members(): (PropertyDescriptor | undefined)[] {
    const keys = ["constructor", "getHours", "toString", "toLocaleString", "getTimezoneOffset"];
    return [
      Object.getOwnPropertyDescriptor(globalThis, "Date"),
      Object.getOwnPropertyDescriptor(Intl, "DateTimeFormat"),
      ...keys.map((key) => Object.getOwnPropertyDescriptor(Date.prototype, key)),
    ];
  }

  const NATIVE_MEMBERS = members();

  function expectNatives(): void {
    const after = members();
    NATIVE_MEMBERS.forEach((native, index) => {
      expect(after[index]).toEqual(native);
      expect(after[index]?.value).toBe(native?.value);
    });
    expect(Date).toBe(NativeDate);
  }

  /** Turn the knobs on in this order, as the engine would. */
  function turnOn(order: Knob[]): void {
    const on = new Set<Knob>();
    for (const knob of order) {
      on.add(knob);
      apply(on.has("zone") ? ZONE : null, on.has("clock") ? frozen(WINTER) : undefined);
    }
  }

  test("both apply at once, through one Date", () => {
    apply(ZONE);
    const zoned = Date;
    apply(ZONE, frozen(WINTER));
    expect(Date).toBe(zoned);
    const now = new Date();
    expect([now.getHours(), now.getMinutes()]).toEqual([17, 45]);
    expect(Date()).toBe("Thu Jan 15 2026 17:45:00 GMT+0545 (Nepal Time)");
    expect(new Date(2026, 0, 15, 17, 45).getTime()).toBe(WINTER);
    expect(new Date().toLocaleString("en-US")).toBe("1/15/2026, 5:45:00 PM");
  });

  for (const order of [
    ["zone", "clock"],
    ["clock", "zone"],
  ] as Knob[][]) {
    for (const off of ["zone", "clock"] as Knob[]) {
      test(`${order[0]} on first, ${off} off first: the other stays, then the natives`, () => {
        turnOn(order);
        const both = Date;
        expect(Date.now()).toBe(WINTER);
        if (off === "zone") {
          apply(null, frozen(WINTER));
          expect(Date).toBe(both);
          expect(new Date().getTimezoneOffset()).toBe(nativeOffset.call(new NativeDate(WINTER)));
          expect(Date.now()).toBe(WINTER);
        } else {
          apply(ZONE);
          expect(Date).toBe(both);
          expect(new Date(WINTER).getTimezoneOffset()).toBe(-345);
          expect(Math.abs(Date.now() - NativeDate.now())).toBeLessThan(1000);
        }
        apply(null);
        expectNatives();
      });
    }
  }

  for (const localeFirst of [true, false]) {
    test(`with the locale knob ${localeFirst ? "before" : "after"}, all three come off clean`, () => {
      if (localeFirst) setDefaultLocale("tr");
      apply(ZONE, frozen(WINTER));
      if (!localeFirst) setDefaultLocale("tr");
      const expected = new Intl.DateTimeFormat("tr", {
        timeZone: ZONE,
        dateStyle: "short",
        timeStyle: "short",
      }).format(WINTER);
      expect(new Date().toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })).toBe(
        expected,
      );
      setDefaultLocale(null);
      apply(null);
      expectNatives();
    });
  }
});
