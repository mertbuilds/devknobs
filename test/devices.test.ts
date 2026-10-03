import { describe, expect, test } from "bun:test";
import { DEVICES, deviceOf, hasTouch, hold, turn } from "../src/engine/devices";
import { DEFAULT_STATE, merge } from "../src/engine/store";
import { uaPreset } from "../src/engine/ua";
import type { DevknobsState, DevknobsStatePatch } from "../src/types";

function state(patch: DevknobsStatePatch): DevknobsState {
  return merge(DEFAULT_STATE, patch);
}

describe("DEVICES", () => {
  test("ids are unique and every kind is there", () => {
    expect(new Set(DEVICES.map((device) => device.id)).size).toBe(DEVICES.length);
    const kinds = new Set(DEVICES.map((device) => device.kind));
    expect([...kinds]).toEqual(["phone", "tablet", "laptop", "desktop"]);
  });

  test("phones and tablets stand upright and take touch, laptops and desktops lie across", () => {
    for (const device of DEVICES) {
      const handheld = device.kind === "phone" || device.kind === "tablet";
      expect(device.height > device.width).toBe(handheld);
      expect(device.touch).toBe(handheld);
      expect(device.dpr).toBeGreaterThan(0);
    }
  });

  test("knows a device by id, and its touch screen", () => {
    expect(deviceOf("iphone-16-pro")).toMatchObject({ width: 402, height: 874, dpr: 3 });
    expect(deviceOf("none")).toBeUndefined();
    expect(hasTouch("pixel-9")).toBe(true);
    expect(hasTouch("desktop")).toBe(false);
    expect(hasTouch("none")).toBe(false);
  });
});

describe("turn", () => {
  test("landscape puts the long side across, portrait up, whichever way it came", () => {
    expect(turn({ width: 402, height: 874 }, "landscape")).toEqual({ width: 874, height: 402 });
    expect(turn({ width: 402, height: 874 }, "portrait")).toEqual({ width: 402, height: 874 });
    expect(turn({ width: 1920, height: 1080 }, "portrait")).toEqual({ width: 1080, height: 1920 });
    expect(turn({ width: 1920, height: 1080 }, "landscape")).toEqual({
      width: 1920,
      height: 1080,
    });
  });
});

describe("a device", () => {
  test("brings its width, height and dpr, held its usual way", () => {
    expect(state({ device: "iphone-16-pro" })).toMatchObject({
      device: "iphone-16-pro",
      width: 402,
      height: 874,
      dpr: 3,
      orientation: "portrait",
    });
    expect(state({ device: "desktop" })).toMatchObject({
      width: 1920,
      height: 1080,
      dpr: 1,
      orientation: "landscape",
    });
  });

  test("is held the way the patch says", () => {
    expect(state({ device: "iphone-16-pro", orientation: "landscape" })).toMatchObject({
      width: 874,
      height: 402,
      orientation: "landscape",
    });
  });

  test("turns with the orientation, both ways", () => {
    const phone = state({ device: "pixel-9" });
    const across = merge(phone, { orientation: "landscape" });
    expect(across).toMatchObject({ device: "pixel-9", width: 924, height: 412, dpr: 2.625 });
    expect(merge(across, { orientation: "portrait" })).toMatchObject({
      device: "pixel-9",
      width: 412,
      height: 924,
    });
  });

  test("a phone or tablet after another is held the same way, anything else its usual way", () => {
    const across = state({ device: "iphone-16", orientation: "landscape" });
    expect(merge(across, { device: "ipad-mini" })).toMatchObject({
      width: 1133,
      height: 744,
      orientation: "landscape",
    });
    const desk = state({ device: "desktop" });
    expect(merge(desk, { device: "iphone-16" })).toMatchObject({
      width: 393,
      height: 852,
      orientation: "portrait",
    });
  });

  test("goes once the size is no longer its own, and keeps a dpr set after it", () => {
    const phone = state({ device: "iphone-se" });
    expect(merge(phone, { dpr: 1 })).toMatchObject({ device: "iphone-se", dpr: 1 });
    expect(merge(phone, { width: 500 })).toMatchObject({
      device: "none",
      width: 500,
      height: 667,
    });
    expect(merge(phone, { width: "full", height: "full" })).toMatchObject({
      device: "none",
      orientation: "portrait",
    });
  });

  test("what the patch sets itself wins over the device", () => {
    expect(state({ device: "iphone-16", dpr: 2 })).toMatchObject({ device: "iphone-16", dpr: 2 });
    expect(state({ device: "iphone-16", width: 500 })).toMatchObject({
      device: "none",
      width: 500,
      height: 852,
    });
  });

  test("an id it does not know is no device", () => {
    expect(state({ device: "nokia-3310" })).toMatchObject({ device: "none", width: "full" });
  });
});

describe("orientation", () => {
  test("turns a custom size", () => {
    const size = state({ width: 390, height: 844 });
    expect(size.orientation).toBe("portrait");
    expect(merge(size, { orientation: "landscape" })).toMatchObject({
      width: 844,
      height: 390,
      orientation: "landscape",
    });
  });

  test("follows a size set across", () => {
    expect(state({ width: 900, height: 400 }).orientation).toBe("landscape");
    expect(state({ width: 400, height: 400 }).orientation).toBe("portrait");
  });

  test("stays portrait while there is no width and height to turn", () => {
    expect(state({ orientation: "landscape" })).toMatchObject({
      orientation: "portrait",
      width: "full",
      height: "full",
    });
    expect(state({ width: 390, orientation: "landscape" })).toMatchObject({
      orientation: "portrait",
      width: 390,
      height: "full",
    });
  });
});

describe("the ua knob", () => {
  test("every device names a browser the ua knob has", () => {
    for (const device of DEVICES) expect(uaPreset(device.ua)).toBeDefined();
  });

  test("gets the device's browser, and keeps its custom string", () => {
    const typed = state({ ua: { preset: "system", custom: "curl/8.7.1" } });
    expect(merge(typed, { device: "pixel-9" }).ua).toEqual({
      preset: "android-chrome",
      custom: "curl/8.7.1",
    });
    expect(merge(state({ device: "iphone-16" }), { device: "pixel-9" }).ua.preset).toBe(
      "android-chrome",
    );
  });

  test("a browser the patch names wins over the device's", () => {
    expect(hold(DEFAULT_STATE, { device: "pixel-9", ua: { preset: "googlebot" } }).ua).toEqual({
      preset: "googlebot",
    });
  });

  test("taking the device away takes its browser, unless the ua moved since", () => {
    const phone = state({ device: "iphone-16" });
    expect(merge(phone, { device: "none" }).ua.preset).toBe("system");
    const moved = merge(phone, { ua: { preset: "googlebot" } });
    expect(merge(moved, { device: "none" }).ua.preset).toBe("googlebot");
    expect(merge(phone, { device: "none", ua: { preset: "mac-chrome" } }).ua.preset).toBe(
      "mac-chrome",
    );
  });

  test("a size that leaves the device behind keeps its browser", () => {
    const resized = merge(state({ device: "iphone-16" }), { width: 500 });
    expect(resized.device).toBe("none");
    expect(resized.ua.preset).toBe("iphone-safari");
  });
});
