import { describe, expect, test } from "bun:test";
import { DEFAULT_ACCURACY, GEO_PRESETS, geoPreset, resolveGeo } from "../src/engine/geo";
import type { GeoValue } from "../src/types";

function value(patch: Partial<GeoValue>): GeoValue {
  return { preset: "system", lat: 0, lng: 0, accuracy: DEFAULT_ACCURACY, timeZone: "", ...patch };
}

describe("presets", () => {
  test("every city is there with its coordinates", () => {
    expect(GEO_PRESETS.map((preset) => preset.id)).toEqual([
      "antalya",
      "istanbul",
      "berlin",
      "london",
      "new-york",
      "san-francisco",
      "tokyo",
      "sydney",
      "sao-paulo",
    ]);
    expect(geoPreset("antalya")).toEqual({
      id: "antalya",
      label: "Antalya",
      lat: 36.8969,
      lng: 30.7133,
      timeZone: "Europe/Istanbul",
    });
    expect(geoPreset("tokyo")?.lat).toBe(35.6762);
    expect(geoPreset("tokyo")?.lng).toBe(139.6503);
    expect(geoPreset("sao-paulo")?.timeZone).toBe("America/Sao_Paulo");
    expect(geoPreset("nowhere")).toBeUndefined();
  });
});

describe("resolveGeo", () => {
  test("system and unknown presets emulate nothing", () => {
    expect(resolveGeo(value({ preset: "system" }))).toBeNull();
    expect(resolveGeo(value({ preset: "nowhere" }))).toBeNull();
  });

  test("a preset wins over the stored coordinates", () => {
    expect(resolveGeo(value({ preset: "tokyo", lat: 1, lng: 2 }))).toEqual({
      lat: 35.6762,
      lng: 139.6503,
      accuracy: DEFAULT_ACCURACY,
      timeZone: "Asia/Tokyo",
    });
  });

  test("custom uses the explicit fields", () => {
    expect(
      resolveGeo(value({ preset: "custom", lat: 1.5, lng: -2.5, accuracy: 5, timeZone: "UTC" })),
    ).toEqual({ lat: 1.5, lng: -2.5, accuracy: 5, timeZone: "UTC" });
  });

  test("a bad accuracy falls back to the default", () => {
    expect(resolveGeo(value({ preset: "berlin", accuracy: 0 }))?.accuracy).toBe(DEFAULT_ACCURACY);
  });
});
