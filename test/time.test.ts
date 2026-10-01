import { afterEach, describe, expect, test } from "bun:test";
import { DEFAULT_ACCURACY } from "../src/engine/geo";
import {
  apply,
  canonicalZone,
  offsetMinutesFor,
  reset,
  resolveTimeZone,
  TIME_ZONE_PRESETS,
} from "../src/engine/time";
import type { GeoValue } from "../src/types";

const WINTER = new Date("2026-01-15T12:00:00Z");
const SUMMER = new Date("2026-07-15T12:00:00Z");

function geo(patch: Partial<GeoValue>): GeoValue {
  return { preset: "system", lat: 0, lng: 0, accuracy: DEFAULT_ACCURACY, timeZone: "", ...patch };
}

afterEach(() => {
  reset();
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
