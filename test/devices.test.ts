import { describe, expect, test } from "bun:test";
import {
  DEVICES,
  deviceOf,
  formOf,
  formParent,
  hasTouch,
  hold,
  SCREENS,
  screenOf,
  turn,
} from "../src/engine/devices";
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

  test("lists the iPhones newest first, each at its own size and ratio", () => {
    const iphones = DEVICES.filter((device) => device.id.startsWith("iphone-"));
    expect(iphones.map(({ id, width, height, dpr }) => `${id} ${width}x${height}@${dpr}`)).toEqual([
      "iphone-18-pro 402x874@3",
      "iphone-18-pro-max 440x956@3",
      "iphone-duo 466x678@3",
      "iphone-air 420x912@3",
      "iphone-17 402x874@3",
      "iphone-17-pro 402x874@3",
      "iphone-17-pro-max 440x956@3",
      "iphone-16 393x852@3",
      "iphone-16-plus 430x932@3",
      "iphone-16-pro 402x874@3",
      "iphone-16-pro-max 440x956@3",
      "iphone-se 375x667@2",
    ]);
    expect(DEVICES.slice(0, iphones.length)).toEqual(iphones);
  });

  test("lists the Pixels newest first, each at its own size and ratio", () => {
    const android = DEVICES.filter((device) => device.ua === "android-chrome");
    expect(android.map(({ id, width, height, dpr }) => `${id} ${width}x${height}@${dpr}`)).toEqual([
      "pixel-10 412x924@2.625",
      "pixel-10-pro 427x952@3",
      "pixel-10-pro-xl 448x998@3",
      "pixel-10a 412x924@2.625",
      "pixel-9 412x924@2.625",
      "pixel-9-pro 427x952@3",
      "pixel-9-pro-xl 448x998@3",
    ]);
  });

  test("gives each Pixel the size of its panel at its ratio, rounded up", () => {
    const panels: [string, number, number][] = [
      ["pixel-10", 1080, 2424],
      ["pixel-10-pro", 1280, 2856],
      ["pixel-10-pro-xl", 1344, 2992],
      ["pixel-10a", 1080, 2424],
      ["pixel-9", 1080, 2424],
      ["pixel-9-pro", 1280, 2856],
      ["pixel-9-pro-xl", 1344, 2992],
    ];
    for (const [id, across, down] of panels) {
      const device = deviceOf(id);
      if (!device) throw new Error(`no device ${id}`);
      expect(device.width).toBe(Math.ceil(across / device.dpr - 1e-9));
      expect(device.height).toBe(Math.ceil(down / device.dpr - 1e-9));
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

  test("a phone or tablet after another turned is turned too, anything else its usual way", () => {
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

  test("the iPhone Duo comes up folded, and open across, or upright after a phone turned across", () => {
    expect(state({ device: "iphone-duo" })).toMatchObject({
      width: 466,
      height: 678,
      orientation: "portrait",
      posture: "closed",
    });
    expect(state({ device: "iphone-duo", posture: "open" })).toMatchObject({
      width: 951,
      height: 669,
      orientation: "landscape",
      posture: "open",
    });
    const upright = state({ device: "iphone-16" });
    expect(merge(upright, { device: "iphone-duo", posture: "open" })).toMatchObject({
      device: "iphone-duo",
      width: 951,
      height: 669,
      orientation: "landscape",
    });
    const across = state({ device: "iphone-16", orientation: "landscape" });
    expect(merge(across, { device: "iphone-duo", posture: "open" })).toMatchObject({
      device: "iphone-duo",
      width: 669,
      height: 951,
      orientation: "portrait",
    });
  });

  test("a fold is not a turn: the next phone comes up its usual way", () => {
    const shut = state({ device: "iphone-duo" });
    const open = merge(shut, { posture: "open" });
    expect(merge(open, { device: "iphone-18-pro" })).toMatchObject({
      width: 402,
      height: 874,
      orientation: "portrait",
    });
    const folded = merge(open, { posture: "closed" });
    expect(merge(folded, { device: "iphone-18-pro" })).toMatchObject({ orientation: "portrait" });
    // Picked again after a reload, the state as stored does the same.
    expect(merge(state({ device: "iphone-duo", posture: "open" }), { device: "iphone-18-pro" })).toMatchObject({
      orientation: "portrait",
    });
  });

  test("a turn of the iPhone Duo goes on to the next phone, in either posture", () => {
    const shut = state({ device: "iphone-duo" });
    const turnedShut = merge(shut, { orientation: "landscape" });
    expect(merge(turnedShut, { device: "iphone-18-pro" })).toMatchObject({
      width: 874,
      height: 402,
      orientation: "landscape",
    });
    // Turned shut, it opens upright, still turned from the way it is held open.
    const turnedOpen = merge(turnedShut, { posture: "open" });
    expect(turnedOpen).toMatchObject({ orientation: "portrait" });
    expect(merge(turnedOpen, { device: "iphone-18-pro" })).toMatchObject({ orientation: "landscape" });
    const open = merge(shut, { posture: "open" });
    expect(merge(merge(open, { orientation: "portrait" }), { device: "iphone-18-pro" })).toMatchObject({
      orientation: "landscape",
    });
  });

  test("folds the iPhone Duo open and shut about its hinge, which turns the screen it goes to", () => {
    const shut = state({ device: "iphone-duo" });
    const open = merge(shut, { posture: "open" });
    expect(open).toMatchObject({
      device: "iphone-duo",
      posture: "open",
      width: 951,
      height: 669,
      orientation: "landscape",
      dpr: 3,
      ua: { preset: "iphone-safari" },
    });
    expect(merge(open, { posture: "closed" })).toMatchObject({
      device: "iphone-duo",
      posture: "closed",
      width: 466,
      height: 678,
      orientation: "portrait",
    });
    // Held across folded, its hinge is at the bottom, and it opens upright.
    const across = merge(shut, { orientation: "landscape" });
    expect(across).toMatchObject({ device: "iphone-duo", width: 678, height: 466 });
    expect(merge(across, { posture: "open" })).toMatchObject({
      device: "iphone-duo",
      width: 669,
      height: 951,
      orientation: "portrait",
    });
    // Picked again with a posture, it folds the same way.
    expect(merge(shut, { device: "iphone-duo", posture: "open" })).toMatchObject({
      width: 951,
      height: 669,
    });
    // A dpr and a browser of the user's own stay as they were.
    const own = merge(shut, { dpr: 2, ua: { preset: "android-chrome" } });
    expect(merge(own, { posture: "open" })).toMatchObject({ dpr: 2, ua: { preset: "android-chrome" } });
  });

  test("turns the iPhone Duo in either posture, which stays", () => {
    const shut = state({ device: "iphone-duo" });
    expect(merge(shut, { orientation: "landscape" })).toMatchObject({
      device: "iphone-duo",
      posture: "closed",
      width: 678,
      height: 466,
    });
    const open = merge(shut, { posture: "open" });
    expect(merge(open, { orientation: "portrait" })).toMatchObject({
      device: "iphone-duo",
      posture: "open",
      width: 669,
      height: 951,
    });
  });

  test("a posture alone does nothing to a device that does not fold", () => {
    const phone = state({ device: "iphone-16" });
    expect(merge(phone, { posture: "open" })).toMatchObject({
      device: "iphone-16",
      width: 393,
      height: 852,
    });
  });

  test("the iPhone Duo goes once the size is no longer its posture's, and comes back folded", () => {
    const shut = state({ device: "iphone-duo" });
    expect(merge(shut, { width: 669, height: 951 })).toMatchObject({ device: "none" });
    const open = merge(shut, { posture: "open" });
    const none = merge(open, { device: "none", width: "full", height: "full" });
    expect(none).toMatchObject({ device: "none", posture: "closed" });
    expect(merge(none, { device: "iphone-duo" })).toMatchObject({ posture: "closed", width: 466 });
    const phone = merge(open, { device: "iphone-16" });
    expect(phone).toMatchObject({ device: "iphone-16", posture: "closed" });
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

describe("postures", () => {
  test("a foldable's screens each have an id, a label and a size of their own", () => {
    expect(SCREENS.filter((screen) => screen.id.startsWith("iphone-duo")).map(
      ({ id, label, width, height, usual }) => `${id} ${label} ${width}x${height} ${usual ?? "-"}`,
    )).toEqual([
      "iphone-duo-closed iPhone Duo (closed) 466x678 -",
      "iphone-duo-open iPhone Duo (open) 669x951 landscape",
    ]);
    expect(new Set(SCREENS.map((screen) => screen.id)).size).toBe(SCREENS.length);
    expect(SCREENS.some((screen) => screen.id === "iphone-duo")).toBe(false);
  });

  test("finds the screen a device shows in a posture, and the foldable a screen belongs to", () => {
    expect(formOf("iphone-duo", "open")?.id).toBe("iphone-duo-open");
    expect(formOf("iphone-duo")?.id).toBe("iphone-duo-closed");
    expect(formOf("iphone-16", "open")?.id).toBe("iphone-16");
    expect(formOf("nokia-3310")).toBeUndefined();
    expect(formParent("iphone-duo-open")).toEqual({ device: "iphone-duo", posture: "open" });
    expect(formParent("iphone-duo-closed")).toEqual({ device: "iphone-duo", posture: "closed" });
    expect(formParent("iphone-16")).toBeUndefined();
    expect(screenOf("iphone-duo-open")?.touch).toBe(true);
    expect(deviceOf("iphone-duo-open")).toBeUndefined();
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
