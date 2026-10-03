import { describe, expect, test } from "bun:test";
import { DEFAULT_STATE, merge, parse } from "../src/engine/store";
import type { ClockValue, DevknobsState } from "../src/types";

describe("parse", () => {
  test("falls back to the defaults", () => {
    expect(parse(null)).toEqual(DEFAULT_STATE);
    expect(parse("")).toEqual(DEFAULT_STATE);
    expect(parse("not json")).toEqual(DEFAULT_STATE);
    expect(parse("[]")).toEqual(DEFAULT_STATE);
    expect(parse("null")).toEqual(DEFAULT_STATE);
    expect(parse("{}")).toEqual(DEFAULT_STATE);
  });

  test("keeps the valid fields and drops the rest", () => {
    const state = parse(
      JSON.stringify({
        scheme: "dark",
        motion: "loud",
        speed: "fast",
        contrast: "more",
        transparency: "clear",
        locale: { lang: "tr", dir: "sideways" },
        pseudo: "yes",
        geo: { preset: "tokyo", lat: "x", error: "lost" },
        network: { online: "offline", type: "5g" },
        text: 20,
        spacing: 1,
        width: "full",
        height: "tall",
        device: "pixel-42",
        orientation: "sideways",
        frame: true,
        dpr: 2,
        vision: "tritanopia",
        overflow: true,
        outlines: "yes",
        panel: { open: false, y: 40, top: 24 },
        stray: 1,
      }),
    );
    expect(state).toEqual({
      scheme: "dark",
      motion: "system",
      speed: 1,
      contrast: "more",
      transparency: "system",
      locale: { lang: "tr", dir: "system" },
      pseudo: false,
      geo: { ...DEFAULT_STATE.geo, preset: "tokyo" },
      timeZone: "geo",
      clock: DEFAULT_STATE.clock,
      network: { online: "offline", type: "system", saveData: "system" },
      text: 20,
      spacing: false,
      width: "full",
      height: "full",
      device: "none",
      orientation: "portrait",
      frame: true,
      dpr: 2,
      vision: "tritanopia",
      overflow: true,
      outlines: false,
      panel: { open: false, y: 40, top: 24 },
    });
  });

  test("keeps a device it knows, with its height and orientation", () => {
    const stored = { width: 874, height: 402, device: "iphone-16-pro", orientation: "landscape" };
    expect(parse(JSON.stringify(stored))).toMatchObject(stored);
    expect(parse(JSON.stringify({ height: 0 })).height).toBe("full");
  });

  test("drops a vision deficiency it does not know", () => {
    expect(parse(JSON.stringify({ vision: "colorblind" })).vision).toBe("none");
  });

  test("puts the panel where the handle is when the session predates its top", () => {
    expect(parse(JSON.stringify({ panel: { y: 200 } })).panel).toEqual({
      open: DEFAULT_STATE.panel.open,
      y: 200,
      top: 200,
    });
  });

  test("follows geo for the time zone when the session predates the knob", () => {
    const old = parse(JSON.stringify({ geo: { preset: "custom", timeZone: "Asia/Tokyo" } }));
    expect(old.timeZone).toBe("geo");
    expect(old.geo.timeZone).toBe("Asia/Tokyo");
    expect(parse(JSON.stringify({ timeZone: "" })).timeZone).toBe("geo");
    expect(parse(JSON.stringify({ timeZone: 3 })).timeZone).toBe("geo");
    expect(parse(JSON.stringify({ timeZone: "Asia/Kathmandu" })).timeZone).toBe("Asia/Kathmandu");
  });

  test("reads the real clock when the session predates the knob, and keeps a set one", () => {
    expect(parse(JSON.stringify({ scheme: "dark" })).clock).toEqual(DEFAULT_STATE.clock);
    const clock: ClockValue = {
      mode: "offset",
      at: 1_800_000_000_000,
      since: 1_700_000_000_000,
      speed: 60,
      header: true,
    };
    expect(parse(JSON.stringify({ clock })).clock).toEqual(clock);
    const junk = { mode: "backwards", at: "soon", speed: -60, header: 1 };
    expect(parse(JSON.stringify({ clock: junk })).clock).toEqual(DEFAULT_STATE.clock);
  });

  test("keeps a speed of zero, which pauses, and drops a negative one", () => {
    expect(parse(JSON.stringify({ speed: 0 })).speed).toBe(0);
    expect(parse(JSON.stringify({ speed: 0.25 })).speed).toBe(0.25);
    expect(parse(JSON.stringify({ speed: -1 })).speed).toBe(1);
  });

  test("rejects sizes that are not positive numbers", () => {
    expect(parse(JSON.stringify({ text: 0, width: -10, dpr: 0 }))).toMatchObject({
      text: "system",
      width: "full",
      dpr: "system",
    });
    expect(parse(JSON.stringify({ text: "16px", width: 420 }))).toMatchObject({
      text: "system",
      width: 420,
    });
  });

  test("reads back every valid value it was given", () => {
    const state: DevknobsState = {
      ...DEFAULT_STATE,
      motion: "reduce",
      speed: 0.1,
      transparency: "reduce",
      pseudo: true,
      spacing: true,
    };
    expect(parse(JSON.stringify(state))).toEqual(state);
  });
});

describe("merge", () => {
  test("patches object knobs field by field", () => {
    const state = merge(DEFAULT_STATE, { geo: { preset: "tokyo" } });
    expect(state.geo).toEqual({ ...DEFAULT_STATE.geo, preset: "tokyo" });
    expect(state.locale).toEqual(DEFAULT_STATE.locale);
  });

  test("patches the network field by field", () => {
    const state = merge(DEFAULT_STATE, { network: { online: "offline" } });
    expect(merge(state, { network: { type: "3g" } }).network).toEqual({
      online: "offline",
      type: "3g",
      saveData: "system",
    });
  });

  test("leaves the panel top alone when only the handle moves", () => {
    expect(merge(DEFAULT_STATE, { panel: { y: 300 } }).panel).toEqual({
      ...DEFAULT_STATE.panel,
      y: 300,
    });
  });

  test("replaces scalar knobs", () => {
    expect(merge(DEFAULT_STATE, { scheme: "dark", width: 420 })).toMatchObject({
      scheme: "dark",
      width: 420,
    });
  });

  test("leaves the source state alone", () => {
    merge(DEFAULT_STATE, { scheme: "dark", locale: { lang: "ar" } });
    expect(DEFAULT_STATE.scheme).toBe("system");
    expect(DEFAULT_STATE.locale.lang).toBe("system");
  });
});
