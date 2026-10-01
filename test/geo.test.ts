import { afterEach, describe, expect, test } from "bun:test";
import {
  apply,
  DEFAULT_ACCURACY,
  GEO_ERROR_CODES,
  GEO_PRESETS,
  geoPreset,
  positionError,
  reset,
  resolveGeo,
} from "../src/engine/geo";
import type { GeoValue } from "../src/types";

function value(patch: Partial<GeoValue>): GeoValue {
  return {
    preset: "system",
    lat: 0,
    lng: 0,
    accuracy: DEFAULT_ACCURACY,
    timeZone: "",
    error: "none",
    ...patch,
  };
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

const TOKYO = [35.6762, 139.6503];
const BERLIN = [52.52, 13.405];

function tick(ms = 0): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class FakeStatus extends EventTarget {
  readonly name = "geolocation";
  get state(): PermissionState {
    return "prompt";
  }
}

/** A device whose methods live on prototypes, as they do in browsers, and log their calls. */
function fakeDevice() {
  const calls: string[] = [];
  const geolocationProto = {
    getCurrentPosition: () => calls.push("native get"),
    watchPosition: () => calls.push("native watch"),
    clearWatch: (id: number) => calls.push(`native clear ${id}`),
  };
  const permissionsProto = {
    query: async (descriptor: PermissionDescriptor) => {
      calls.push(`query ${descriptor.name}`);
      return new FakeStatus();
    },
  };
  const geolocation = Object.create(geolocationProto) as Geolocation;
  const permissions = Object.create(permissionsProto) as Permissions;
  Object.defineProperty(navigator, "geolocation", { configurable: true, value: geolocation });
  Object.defineProperty(navigator, "permissions", { configurable: true, value: permissions });
  return { calls, geolocation, permissions, geolocationProto };
}

/** Callbacks that write down what they hear: coordinates, or an error code. */
function listener() {
  const heard: unknown[] = [];
  return {
    heard,
    success: (position: GeolocationPosition) =>
      heard.push([position.coords.latitude, position.coords.longitude]),
    error: (error: GeolocationPositionError) => heard.push(error.code),
  };
}

describe("geolocation", () => {
  afterEach(() => {
    reset();
    Reflect.deleteProperty(navigator, "geolocation");
    Reflect.deleteProperty(navigator, "permissions");
  });

  test("answers with the preset a task later", async () => {
    const { geolocation } = fakeDevice();
    apply(value({ preset: "tokyo" }));
    const { heard, success, error } = listener();
    geolocation.getCurrentPosition(success, error);
    expect(heard).toEqual([]);
    await tick();
    expect(heard).toEqual([TOKYO]);
  });

  test("the error knob calls the error callback, with or without a position", async () => {
    const { geolocation } = fakeDevice();
    const caught: GeolocationPositionError[] = [];
    apply(value({ preset: "tokyo", error: "denied" }));
    geolocation.getCurrentPosition(
      () => {},
      (error) => caught.push(error),
    );
    apply(value({ preset: "system", error: "unavailable" }));
    geolocation.getCurrentPosition(
      () => {},
      (error) => caught.push(error),
    );
    await tick();
    expect(caught.map((error) => [error.code, error.message])).toEqual([
      [1, "User denied Geolocation"],
      [2, "Position update is unavailable"],
    ]);
    const [denied] = caught;
    expect([denied!.PERMISSION_DENIED, denied!.POSITION_UNAVAILABLE, denied!.TIMEOUT]).toEqual([
      1, 2, 3,
    ]);
    expect(positionError(GEO_ERROR_CODES.timeout).code).toBe(3);
  });

  test("a timeout fires once options.timeout runs out, and never without one", async () => {
    const { geolocation } = fakeDevice();
    apply(value({ preset: "tokyo", error: "timeout" }));
    const bounded = listener();
    const open = listener();
    geolocation.getCurrentPosition(bounded.success, bounded.error, { timeout: 30 });
    geolocation.getCurrentPosition(open.success, open.error);
    await tick(10);
    expect(bounded.heard).toEqual([]);
    await tick(50);
    expect(bounded.heard).toEqual([3]);
    expect(open.heard).toEqual([]);
  });

  test("timeout 0 needs a position maximumAge allows", async () => {
    const { geolocation } = fakeDevice();
    apply(value({ preset: "tokyo" }));
    const { heard, success, error } = listener();
    geolocation.getCurrentPosition(success, error, { timeout: 0 });
    await tick();
    geolocation.getCurrentPosition(success, error);
    await tick();
    geolocation.getCurrentPosition(success, error, { timeout: 0, maximumAge: Infinity });
    await tick();
    expect(heard).toEqual([3, TOKYO, TOKYO]);
  });

  test("maximumAge hands the last position back, and a fresh one once it is too old", async () => {
    const { geolocation } = fakeDevice();
    apply(value({ preset: "tokyo" }));
    const stamps: number[] = [];
    const record = (position: GeolocationPosition) => stamps.push(position.timestamp);
    geolocation.getCurrentPosition(record);
    await tick(5);
    geolocation.getCurrentPosition(record, null, { maximumAge: 60_000 });
    await tick(5);
    geolocation.getCurrentPosition(record);
    await tick();
    expect(stamps[1]).toBe(stamps[0]!);
    expect(stamps[2]).toBeGreaterThan(stamps[0]!);
  });

  test("watches hear every knob move until they are cleared", async () => {
    const { calls, geolocation } = fakeDevice();
    apply(value({ preset: "tokyo" }));
    const { heard, success, error } = listener();
    const id = geolocation.watchPosition(success, error);
    await tick();
    apply(value({ preset: "berlin" }));
    await tick();
    apply(value({ preset: "berlin", lat: 1 }));
    await tick();
    apply(value({ preset: "berlin", error: "denied" }));
    await tick();
    expect(heard).toEqual([TOKYO, BERLIN, 1]);
    geolocation.clearWatch(id);
    apply(value({ preset: "tokyo" }));
    await tick();
    expect(heard).toEqual([TOKYO, BERLIN, 1]);
    geolocation.clearWatch(7);
    expect(calls).toEqual(["native clear 7"]);
  });

  test("a watch cleared before its first answer hears nothing", async () => {
    const { geolocation } = fakeDevice();
    apply(value({ preset: "tokyo" }));
    const { heard, success } = listener();
    geolocation.clearWatch(geolocation.watchPosition(success));
    await tick();
    expect(heard).toEqual([]);
  });

  test("the permission follows the knob and fires change when it moves", async () => {
    const { calls, permissions } = fakeDevice();
    apply(value({ preset: "tokyo" }));
    const status = await permissions.query({ name: "geolocation" });
    let changes = 0;
    status.addEventListener("change", () => changes++);
    expect(status.state).toBe("granted");
    apply(value({ preset: "berlin" }));
    expect(changes).toBe(0);
    apply(value({ preset: "berlin", error: "denied" }));
    expect([status.state, changes]).toEqual(["denied", 1]);
    apply(value({ preset: "berlin", error: "timeout" }));
    expect([status.state, changes]).toEqual(["granted", 2]);
    const other = await permissions.query({ name: "notifications" });
    expect(other.state).toBe("prompt");
    reset();
    expect([status.state, changes]).toEqual(["prompt", 3]);
    expect(Object.hasOwn(permissions, "query")).toBe(false);
    expect(calls).toEqual(["query geolocation", "query notifications"]);
  });

  test("reset hands the device back", async () => {
    const { calls, geolocation, geolocationProto } = fakeDevice();
    apply(value({ preset: "tokyo" }));
    reset();
    expect(Object.keys(geolocation)).toEqual([]);
    expect(geolocation.getCurrentPosition).toBe(geolocationProto.getCurrentPosition);
    geolocation.getCurrentPosition(() => {});
    expect(calls).toEqual(["native get"]);
  });
});
