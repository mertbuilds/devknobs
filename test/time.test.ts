import { afterEach, describe, expect, test } from "bun:test";
import {
  apply,
  canonicalZone,
  fromWall,
  offsetMinutesFor,
  reset,
  resolveTimeZone,
  TIME_ZONE_PRESETS,
} from "../src/engine/time";
import { DEFAULT_STATE } from "../src/engine/store";
import type { GeoValue } from "../src/types";

const WINTER = new Date("2026-01-15T12:00:00Z");
const SUMMER = new Date("2026-07-15T12:00:00Z");

const NativeDate = Date;
const nativeGetHours = Date.prototype.getHours;
const nativeToString = Date.prototype.toString;
const HOST = new Intl.DateTimeFormat().resolvedOptions().timeZone;

/**
 * Run with the process itself in another zone. Bun follows `TZ` at runtime, so
 * the engine's own answers in that zone are what the emulation must match.
 */
function inZone<T>(zone: string, run: () => T): T {
  process.env.TZ = zone;
  try {
    return run();
  } finally {
    process.env.TZ = HOST;
  }
}

/** Emulate `zone` while the process sits in a zone far from it. */
function emulated<T>(zone: string, run: () => T): T {
  const host = zone === "Pacific/Auckland" ? "America/Los_Angeles" : "Pacific/Auckland";
  return inZone(host, () => {
    apply(zone);
    try {
      return run();
    } finally {
      reset();
    }
  });
}

function geo(patch: Partial<GeoValue>): GeoValue {
  return { ...DEFAULT_STATE.geo, ...patch };
}

afterEach(() => {
  reset();
  process.env.TZ = HOST;
});

describe("offsetMinutesFor", () => {
  test("reads whole hour zones", () => {
    expect(offsetMinutesFor(WINTER, "Europe/Istanbul")).toBe(-180);
    expect(offsetMinutesFor(SUMMER, "Europe/Istanbul")).toBe(-180);
    expect(offsetMinutesFor(WINTER, "Asia/Tokyo")).toBe(-540);
    expect(offsetMinutesFor(WINTER, "UTC")).toBe(0);
  });

  test("follows daylight saving", () => {
    expect(offsetMinutesFor(WINTER, "America/New_York")).toBe(300);
    expect(offsetMinutesFor(SUMMER, "America/New_York")).toBe(240);
    expect(offsetMinutesFor(WINTER, "Europe/Berlin")).toBe(-60);
    expect(offsetMinutesFor(SUMMER, "Europe/Berlin")).toBe(-120);
  });

  test("reads half hour and quarter hour zones", () => {
    expect(offsetMinutesFor(WINTER, "Asia/Kolkata")).toBe(-330);
    expect(offsetMinutesFor(WINTER, "Asia/Kathmandu")).toBe(-345);
    expect(offsetMinutesFor(WINTER, "Australia/Lord_Howe")).toBe(-660);
    expect(offsetMinutesFor(SUMMER, "Australia/Lord_Howe")).toBe(-630);
  });

  test("a bad zone reads as UTC", () => {
    expect(offsetMinutesFor(WINTER, "Not/AZone")).toBe(0);
  });
});

describe("resolveTimeZone", () => {
  test("geo follows the geolocation preset", () => {
    expect(resolveTimeZone("geo", geo({ preset: "tokyo" }))).toBe("Asia/Tokyo");
    expect(resolveTimeZone("geo", geo({ preset: "custom", timeZone: "Asia/Kathmandu" }))).toBe(
      "Asia/Kathmandu",
    );
    expect(resolveTimeZone("geo", geo({ preset: "system" }))).toBeNull();
    expect(resolveTimeZone("geo", geo({ preset: "custom", timeZone: "" }))).toBeNull();
  });

  test("system emulates nothing, whatever geo says", () => {
    expect(resolveTimeZone("system", geo({ preset: "tokyo" }))).toBeNull();
  });

  test("an explicit zone wins over geo", () => {
    expect(resolveTimeZone("America/New_York", geo({ preset: "tokyo" }))).toBe("America/New_York");
  });

  test("an unknown zone emulates nothing, so a half typed one never throws", () => {
    expect(resolveTimeZone("Europe/Ist", geo({ preset: "tokyo" }))).toBeNull();
    expect(resolveTimeZone("geo", geo({ preset: "custom", timeZone: "Nope" }))).toBeNull();
  });

  test("every preset is a zone the engine knows", () => {
    for (const zone of TIME_ZONE_PRESETS) expect(canonicalZone(zone)).not.toBeNull();
  });
});

describe("apply", () => {
  test("Intl reports the emulated zone and gives it back on reset", () => {
    const host = new Intl.DateTimeFormat().resolvedOptions().timeZone;
    apply("Asia/Kathmandu");
    expect(new Intl.DateTimeFormat().resolvedOptions().timeZone).toBe("Asia/Kathmandu");
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe("Asia/Kathmandu");
    expect(new Intl.DateTimeFormat("en", { timeZone: "UTC" }).resolvedOptions().timeZone).toBe(
      "UTC",
    );
    expect(WINTER.getTimezoneOffset()).toBe(-345);
    apply("America/New_York");
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe("America/New_York");
    expect(SUMMER.getTimezoneOffset()).toBe(240);
    reset();
    expect(new Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(host);
  });
});

const iso = (date: Date) => date.toISOString();

describe("Intl.DateTimeFormat", () => {
  const NativeDateTimeFormat = Intl.DateTimeFormat;

  /** What a locale knob might install: a default locale for formatters that name none. */
  function localeProxy(target: typeof Intl.DateTimeFormat): typeof Intl.DateTimeFormat {
    return new Proxy(target, {
      construct(inner, args: unknown[], newTarget) {
        const [locales, options] = args as [Intl.LocalesArgument?, Intl.DateTimeFormatOptions?];
        return Reflect.construct(inner, [locales ?? "tr", options], newTarget);
      },
    });
  }

  afterEach(() => {
    Intl.DateTimeFormat = NativeDateTimeFormat;
  });

  test("resolvedOptions follows the time zone knob, then geo, then the host", () => {
    const zoneOf = (timeZone: string, preset: string) => {
      apply(resolveTimeZone(timeZone, geo({ preset })));
      return new Intl.DateTimeFormat().resolvedOptions().timeZone;
    };
    expect(zoneOf("geo", "tokyo")).toBe("Asia/Tokyo");
    expect(zoneOf("geo", "new-york")).toBe("America/New_York");
    expect(zoneOf("Asia/Kathmandu", "new-york")).toBe("Asia/Kathmandu");
    expect(zoneOf("system", "new-york")).toBe(HOST);
    expect(zoneOf("geo", "system")).toBe(HOST);
  });

  test("composes with a locale proxy installed before it", () => {
    const before = localeProxy(NativeDateTimeFormat);
    Intl.DateTimeFormat = before;
    apply("Asia/Tokyo");
    const resolved = new Intl.DateTimeFormat().resolvedOptions();
    expect([resolved.locale, resolved.timeZone]).toEqual(["tr", "Asia/Tokyo"]);
    reset();
    expect(Intl.DateTimeFormat).toBe(before);
  });

  test("composes with a locale proxy installed after it", () => {
    apply("Asia/Tokyo");
    const after = localeProxy(Intl.DateTimeFormat);
    Intl.DateTimeFormat = after;
    const resolved = new Intl.DateTimeFormat().resolvedOptions();
    expect([resolved.locale, resolved.timeZone]).toEqual(["tr", "Asia/Tokyo"]);
    reset();
    expect(Intl.DateTimeFormat).toBe(after);
    expect(new Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(HOST);
  });
});

describe("fromWall", () => {
  test("a gap moves the reading forward by the size of the gap", () => {
    expect(fromWall(Date.UTC(2026, 2, 8, 2, 30), "America/New_York")).toBe(
      Date.UTC(2026, 2, 8, 7, 30),
    );
    expect(fromWall(Date.UTC(2026, 9, 4, 2, 15), "Australia/Lord_Howe")).toBe(
      Date.UTC(2026, 9, 3, 15, 45),
    );
  });

  test("an overlap takes the earlier instant", () => {
    expect(fromWall(Date.UTC(2026, 10, 1, 1, 30), "America/New_York")).toBe(
      Date.UTC(2026, 10, 1, 5, 30),
    );
    expect(fromWall(Date.UTC(2026, 3, 5, 1, 45), "Australia/Lord_Howe")).toBe(
      Date.UTC(2026, 3, 4, 14, 45),
    );
  });

  test("an invalid reading stays invalid", () => {
    expect(fromWall(NaN, "UTC")).toBeNaN();
  });
});

describe("Date in an emulated zone", () => {
  test("New York springs forward over 02:30", () => {
    emulated("America/New_York", () => {
      const date = new Date(2026, 2, 8, 2, 30);
      expect(iso(date)).toBe("2026-03-08T07:30:00.000Z");
      expect(date.getHours()).toBe(3);
      expect(date.getTimezoneOffset()).toBe(240);
      expect(date.toString()).toBe("Sun Mar 08 2026 03:30:00 GMT-0400 (Eastern Daylight Time)");
    });
  });

  test("New York reads 01:30 twice and builds the first one", () => {
    emulated("America/New_York", () => {
      expect(iso(new Date(2026, 10, 1, 1, 30))).toBe("2026-11-01T05:30:00.000Z");
      const second = new Date("2026-11-01T06:30:00Z");
      expect(second.getHours()).toBe(1);
      expect(second.getTimezoneOffset()).toBe(300);
    });
  });

  test("Istanbul stays at +3 all year", () => {
    emulated("Europe/Istanbul", () => {
      expect(WINTER.getTimezoneOffset()).toBe(-180);
      expect(SUMMER.getTimezoneOffset()).toBe(-180);
      expect(iso(new Date(2026, 6, 1))).toBe("2026-06-30T21:00:00.000Z");
    });
  });

  test("Lord Howe moves by half an hour", () => {
    emulated("Australia/Lord_Howe", () => {
      const gap = new Date(2026, 9, 4, 2, 15);
      expect([gap.getHours(), gap.getMinutes(), gap.getTimezoneOffset()]).toEqual([2, 45, -660]);
      expect(iso(gap)).toBe("2026-10-03T15:45:00.000Z");
      const overlap = new Date(2026, 3, 5, 1, 45);
      expect(overlap.getTimezoneOffset()).toBe(-660);
      expect(iso(overlap)).toBe("2026-04-04T14:45:00.000Z");
      expect(SUMMER.getTimezoneOffset()).toBe(-630);
    });
  });

  test("Kathmandu sits at +5:45", () => {
    emulated("Asia/Kathmandu", () => {
      expect([WINTER.getHours(), WINTER.getMinutes()]).toEqual([17, 45]);
      expect(WINTER.toString()).toBe("Thu Jan 15 2026 17:45:00 GMT+0545 (Nepal Time)");
      expect(iso(new Date(2026, 0, 15, 17, 45))).toBe(iso(WINTER));
    });
  });

  test("old dates carry the zone's name of today, like the engine's own", () => {
    emulated("America/New_York", () => {
      expect(new Date("1900-06-01T00:00:00Z").toString()).toBe(
        "Thu May 31 1900 19:00:00 GMT-0500 (Eastern Standard Time)",
      );
    });
    emulated("America/St_Johns", () => {
      const lmt = new Date("1900-06-01T00:00:00Z");
      expect(lmt.getTimezoneOffset()).toBe(210);
      expect(lmt.toString()).toBe("Thu May 31 1900 20:29:08 GMT-0330 (Newfoundland Standard Time)");
    });
    emulated("Europe/London", () => {
      expect(new Date(0).toString()).toBe(
        "Thu Jan 01 1970 01:00:00 GMT+0100 (Greenwich Mean Time)",
      );
    });
  });

  test("local setters land on the emulated wall clock", () => {
    emulated("America/New_York", () => {
      const date = new Date(2026, 2, 7, 2, 30);
      date.setDate(8);
      expect(iso(date)).toBe("2026-03-08T07:30:00.000Z");
      expect(date.setHours(1, 59, 59, 999)).toBe(Date.UTC(2026, 2, 8, 6, 59, 59, 999));
      date.setMonth(10, 1);
      expect(date.getTimezoneOffset()).toBe(240);
      date.setFullYear(2027, 0, 1);
      expect(date.toString()).toBe("Fri Jan 01 2027 01:59:59 GMT-0500 (Eastern Standard Time)");
    });
  });

  test("an invalid date stays invalid, except setFullYear, which starts it over", () => {
    emulated("Asia/Tokyo", () => {
      const date = new Date(NaN);
      expect(date.getHours()).toBeNaN();
      expect(date.getTimezoneOffset()).toBeNaN();
      expect(date.setHours(1)).toBeNaN();
      expect(date.toString()).toBe("Invalid Date");
      date.setFullYear(2026);
      expect(iso(date)).toBe("2025-12-31T15:00:00.000Z");
    });
  });

  test("UTC methods are untouched", () => {
    emulated("Asia/Kathmandu", () => {
      expect(WINTER.getUTCHours()).toBe(12);
      expect(WINTER.toISOString()).toBe("2026-01-15T12:00:00.000Z");
      expect(WINTER.toUTCString()).toBe("Thu, 15 Jan 2026 12:00:00 GMT");
      expect(JSON.stringify({ at: WINTER })).toBe('{"at":"2026-01-15T12:00:00.000Z"}');
      expect(Date.UTC(2026, 0, 15, 12)).toBe(WINTER.getTime());
    });
  });

  test("parses local strings in the zone and leaves zoned ones alone", () => {
    emulated("America/New_York", () => {
      const at = Date.UTC(2026, 2, 8, 7, 30);
      expect(Date.parse("2026-03-08T02:30")).toBe(at);
      expect(Date.parse("2026-03-08T03:30:00.000")).toBe(at);
      expect(Date.parse("2026/03/08 03:30")).toBe(at);
      expect(new Date("March 8, 2026 03:30").getTime()).toBe(at);
      expect(Date.parse("2026-03-08")).toBe(Date.UTC(2026, 2, 8));
      expect(Date.parse("2026-03-08T07:30Z")).toBe(at);
      expect(Date.parse("2026-03-08T10:30:00+03:00")).toBe(at);
      expect(Date.parse("Sun, 08 Mar 2026 07:30:00 GMT")).toBe(at);
      expect(Date.parse(new Date(at).toString())).toBe(at);
      expect(Date.parse("not a date")).toBeNaN();
    });
  });

  test("stays the Date every caller expects", () => {
    const before = new NativeDate(0);
    emulated("Asia/Tokyo", () => {
      expect(Date).not.toBe(NativeDate);
      expect(before instanceof Date).toBe(true);
      expect(new Date() instanceof NativeDate).toBe(true);
      expect(new Date().constructor).toBe(Date);
      expect(Date.prototype).toBe(NativeDate.prototype);
      expect(Date.name).toBe("Date");
      expect(Date.length).toBe(7);
      expect(Math.abs(Date.now() - NativeDate.now())).toBeLessThan(1000);
      expect(Object.prototype.toString.call(new Date())).toBe("[object Date]");
      expect(before.getHours()).toBe(9);
      expect(new Date(before).getTime()).toBe(0);
      expect(new Date(0).getTime()).toBe(0);
      expect(new Date(2026, 0).getTime()).toBe(Date.UTC(2025, 11, 31, 15));
      expect(new Date(99, 0).getFullYear()).toBe(1999);
    });
  });

  test("a subclass builds from local fields too", () => {
    emulated("America/New_York", () => {
      class Stamp extends Date {}
      const stamp = new Stamp(2026, 2, 8, 2, 30);
      expect(stamp instanceof Stamp && stamp instanceof Date).toBe(true);
      expect(stamp.getHours()).toBe(3);
    });
  });

  test("strings and primitives follow the zone", () => {
    emulated("Asia/Kathmandu", () => {
      expect(`${WINTER}`).toBe(WINTER.toString());
      expect(String(WINTER)).toBe("Thu Jan 15 2026 17:45:00 GMT+0545 (Nepal Time)");
      expect(+WINTER).toBe(WINTER.getTime());
      expect(WINTER.toDateString()).toBe("Thu Jan 15 2026");
      expect(WINTER.toTimeString()).toBe("17:45:00 GMT+0545 (Nepal Time)");
      expect(Date()).toMatch(/GMT\+0545 \(Nepal Time\)$/);
      expect(WINTER.toLocaleString("en-US")).toBe("1/15/2026, 5:45:00 PM");
      expect(WINTER.toLocaleTimeString("en-US", { timeZone: "UTC" })).toBe("12:00:00 PM");
    });
  });

  test("reset hands the engine's own Date back", () => {
    apply("Asia/Tokyo");
    reset();
    expect(Date).toBe(NativeDate);
    expect(Date.prototype.getHours).toBe(nativeGetHours);
    expect(Date.prototype.toString).toBe(nativeToString);
    expect(Date.prototype.constructor).toBe(NativeDate);
  });

  test("leaves a wrapper someone added on top in place, passing through", () => {
    apply("Asia/Tokyo");
    const ours = Date.prototype.getHours;
    const theirs = function (this: Date) {
      return ours.call(this);
    };
    Date.prototype.getHours = theirs;
    reset();
    expect(Date.prototype.getHours).toBe(theirs);
    inZone("UTC", () => expect(new Date(0).getHours()).toBe(0));
    Date.prototype.getHours = nativeGetHours;
  });
});

describe("Temporal", () => {
  /** A stand in for `Temporal.Now` that reports the zone each helper was asked for. */
  function fakeNow() {
    const call = (name: string) => (timeZone?: string) => `${name} ${timeZone ?? "host"}`;
    return {
      instant: () => "instant",
      timeZoneId: () => "Europe/Berlin",
      zonedDateTimeISO: call("zoned"),
      plainDateTimeISO: call("datetime"),
      plainDateISO: call("date"),
      plainTimeISO: call("time"),
    };
  }

  afterEach(() => {
    Reflect.deleteProperty(globalThis, "Temporal");
  });

  test("Now defaults to the emulated zone and keeps an explicit one", () => {
    const now = fakeNow();
    const original = { ...now };
    Object.defineProperty(globalThis, "Temporal", { configurable: true, value: { Now: now } });
    apply("Asia/Kathmandu");
    expect(now.timeZoneId()).toBe("Asia/Kathmandu");
    expect(now.zonedDateTimeISO()).toBe("zoned Asia/Kathmandu");
    expect(now.plainDateTimeISO()).toBe("datetime Asia/Kathmandu");
    expect(now.plainDateISO()).toBe("date Asia/Kathmandu");
    expect(now.plainTimeISO()).toBe("time Asia/Kathmandu");
    expect(now.plainTimeISO("UTC")).toBe("time UTC");
    expect(now.instant()).toBe("instant");
    apply("America/New_York");
    expect(now.timeZoneId()).toBe("America/New_York");
    reset();
    expect(now).toEqual(original);
    expect(now.timeZoneId()).toBe("Europe/Berlin");
    expect(now.zonedDateTimeISO()).toBe("zoned host");
  });

  test("an engine without Temporal is fine", () => {
    apply("Asia/Tokyo");
    expect(new Date(0).getHours()).toBe(9);
  });
});

/**
 * Everything a page can read off a date that depends on the zone. Before 1970
 * the zone name in `toString` is left out: a zone with no daylight time today
 * has no name Intl can give for its old daylight time, such as Sao Paulo's in
 * 1950, so there it reads `GMT-02:00` where the engine says `Brasilia Summer Time`.
 */
function readings(date: Date): unknown[] {
  const name = (text: string) => (date.getTime() < 0 ? text.replace(/ \(.*\)$/, "") : text);
  return [
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    date.getDay(),
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
    date.getMilliseconds(),
    date.getTimezoneOffset(),
    name(date.toString()),
    date.toDateString(),
    name(date.toTimeString()),
    date.toLocaleString("en-US"),
    date.toLocaleDateString("en-US"),
    date.toLocaleTimeString("en-US"),
  ];
}

/** Instants a zone changes offset at in 2026, found the engine's own way. */
function transitions(): number[] {
  const found: number[] = [];
  let previous = new Date(Date.UTC(2026, 0, 1)).getTimezoneOffset();
  for (let time = Date.UTC(2026, 0, 1); time < Date.UTC(2027, 0, 1); time += 3_600_000) {
    const offset = new Date(time).getTimezoneOffset();
    if (offset !== previous) found.push(time);
    previous = offset;
  }
  return found;
}

const ZONES = [
  "America/New_York",
  "Europe/Istanbul",
  "Australia/Lord_Howe",
  "Asia/Kathmandu",
  "Europe/London",
  "America/St_Johns",
  "Pacific/Chatham",
  "America/Sao_Paulo",
  "UTC",
];

const STEP = 5 * 60_000;

/** Instants worth reading: every few hours of 2026, densely around each jump, and some history. */
function instants(jumps: number[]): number[] {
  const list = [
    Date.UTC(1900, 5, 1),
    Date.UTC(1950, 0, 1, 12),
    0,
    Date.UTC(1999, 11, 31, 23, 59, 59, 999),
    Date.UTC(2038, 0, 19, 3, 14, 7),
    Date.UTC(2100, 6, 1),
  ];
  for (let time = Date.UTC(2026, 0, 1); time < Date.UTC(2027, 0, 1); time += 7 * 3_600_000) {
    list.push(time);
  }
  for (const jump of jumps) {
    for (let time = jump - 4 * 3_600_000; time <= jump + 4 * 3_600_000; time += STEP) {
      list.push(time);
    }
  }
  return list;
}

/** Local days worth building on: each jump's day, and two days far from any. */
function days(jumps: number[]): number[][] {
  const list = [
    [2026, 0, 15],
    [2026, 5, 15],
  ];
  for (const jump of jumps) {
    const day = new Date(jump);
    list.push([day.getFullYear(), day.getMonth(), day.getDate()]);
  }
  return list;
}

/** Wall clock fields worth building: odd shapes, and every quarter hour of each day. */
function walls(jumps: number[]): number[][] {
  const list: number[][] = [
    [2026, 0, 1],
    [99, 0, 1],
    [5, 11, 31, 23, 59],
    [2026, 0, 32],
    [2026, 13, 1],
    [2026, 2, 8, -1],
    [2026.7, 2.5, 8.9, 2.5],
    [1900, 0, 1],
    [1883, 10, 18, 12],
  ];
  for (const day of days(jumps)) {
    for (let minutes = 0; minutes < 24 * 60; minutes += 15) list.push([...day, 0, minutes]);
  }
  return list;
}

/** Local strings in the shapes engines read as local time, built from wall fields. */
function strings(fields: number[][]): string[] {
  const list = ["2026-03-08", "2026-03", "Mar 8 2026", "2026/03/08", "03/08/2026"];
  for (const [year, month, date, hours, minutes] of fields.slice(9)) {
    const day = new Date(Date.UTC(year!, month!, date!, hours!, minutes!));
    const stamp = day.toISOString().slice(0, 16);
    list.push(
      stamp,
      `${stamp}:30.250`,
      stamp.replace("T", " "),
      stamp.replace(/-/g, "/").replace("T", " "),
    );
  }
  return list;
}

/** Annex B, so not in the Date type. */
type LegacyDate = Date & { getYear(): number; setYear(year: number): number };

/** Every local setter in turn, each from where the last one left the date. */
function setters(time: number): number[] {
  const date = new Date(time) as LegacyDate;
  return [
    date.setHours(2, 30),
    date.setMinutes(90),
    date.setDate(date.getDate() + 1),
    date.setMonth(date.getMonth() - 1),
    date.setFullYear(2027),
    date.setSeconds(-1),
    date.setMilliseconds(1500),
    date.setYear(99),
    date.getYear(),
  ];
}

/** Everything zone dependent a page can do with these instants, fields and strings. */
function run(times: number[], fields: number[][], texts: string[]) {
  return {
    readings: times.map((time) => readings(new Date(time))),
    built: fields.map((args) => Reflect.construct(Date, args).getTime()),
    parsed: texts.map((text) => [Date.parse(text), new Date(text).getTime()]),
    set: times.filter((_, index) => index % 7 === 0).map(setters),
    roundTrip: times.map((time) => Date.parse(new Date(time).toString())),
  };
}

describe("matches the engine's own zone handling", () => {
  for (const zone of ZONES) {
    test(zone, () => {
      const { times, fields, texts, expected } = inZone(zone, () => {
        const jumps = transitions();
        const times = instants(jumps);
        const fields = walls(jumps);
        const texts = strings(fields);
        return { times, fields, texts, expected: run(times, fields, texts) };
      });
      const actual = emulated(zone, () => run(times, fields, texts));
      expect(actual.readings).toEqual(expected.readings);
      expect(actual.built).toEqual(expected.built);
      expect(actual.parsed).toEqual(expected.parsed);
      expect(actual.set).toEqual(expected.set);
      expect(actual.roundTrip).toEqual(expected.roundTrip);
    });
  }
});
