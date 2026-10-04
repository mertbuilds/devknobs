import { describe, expect, test } from "bun:test";
import { DEFAULT_STATE, merge, parse } from "../src/engine/store";
import { ZOOM_MAX, ZOOM_MIN } from "../src/engine/zoom";
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
        mock: "no",
        touchPointer: "no",
        browser: "floating",
        bars: "sometimes",
        edgeToEdge: "yes",
        frame: true,
        dpr: 2,
        zoom: "huge",
        vision: "tritanopia",
        ua: { preset: "iphone-safari", custom: 3 },
        overflow: true,
        outlines: "yes",
        grabColor: "teal",
        panel: {
          open: false,
          y: 40,
          top: 24,
          edge: "bottom",
          tab: "middle",
          pinned: ["scheme", 3, "clock", "scheme"],
        },
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
      mock: true,
      touchPointer: true,
      browser: "auto",
      bars: "auto",
      edgeToEdge: true,
      frame: true,
      dpr: 2,
      zoom: "fit",
      vision: "tritanopia",
      ua: { preset: "iphone-safari", custom: "" },
      overflow: true,
      outlines: false,
      grabColor: "auto",
      panel: {
        open: false,
        y: 40,
        top: 24,
        edge: "bottom",
        tab: "none",
        pinned: ["scheme", "clock"],
      },
    });
  });

  test("lets grab pick its color, and keeps one stored", () => {
    expect(DEFAULT_STATE.grabColor).toBe("auto");
    expect(parse(JSON.stringify({ scheme: "dark" })).grabColor).toBe("auto");
    expect(parse(JSON.stringify({ grabColor: "magenta" })).grabColor).toBe("auto");
    expect(parse(JSON.stringify({ grabColor: 3 })).grabColor).toBe("auto");
    for (const color of ["auto", "blue", "green", "pink", "orange", "purple", "cyan"] as const) {
      expect(parse(JSON.stringify({ grabColor: color })).grabColor).toBe(color);
    }
  });

  test("starts the panel closed, and keeps one stored open", () => {
    expect(parse(null).panel.open).toBe(false);
    expect(parse(JSON.stringify({ panel: { y: 40 } })).panel.open).toBe(false);
    expect(parse(JSON.stringify({ panel: { open: "yes" } })).panel.open).toBe(false);
    expect(parse(JSON.stringify({ panel: { open: true } })).panel.open).toBe(true);
  });

  test("keeps a device it knows, with its height and orientation", () => {
    const stored = { width: 874, height: 402, device: "iphone-16-pro", orientation: "landscape" };
    expect(parse(JSON.stringify(stored))).toMatchObject(stored);
    expect(parse(JSON.stringify({ height: 0 })).height).toBe("full");
  });

  test("keeps the size of a stored device that is no longer a preset, as a plain frame", () => {
    const stored = { width: 390, height: 844, device: "iphone-14", orientation: "portrait" };
    expect(parse(JSON.stringify(stored))).toMatchObject({ ...stored, device: "none" });
    const galaxy = { width: 360, height: 780, device: "galaxy-s25", orientation: "portrait" };
    expect(parse(JSON.stringify(galaxy))).toMatchObject({ ...galaxy, device: "none" });
    for (const id of ["iphone-16", "iphone-16-pro", "iphone-16-pro-max", "iphone-se"]) {
      expect(parse(JSON.stringify({ device: id })).device).toBe(id);
    }
  });

  test("draws a mock when the session predates it, and keeps one turned off", () => {
    expect(parse(JSON.stringify({ device: "pixel-9" })).mock).toBe(true);
    expect(parse(JSON.stringify({ mock: false })).mock).toBe(false);
  });

  test("has the mouse act as a finger when the session predates it, and keeps it turned off", () => {
    expect(parse(JSON.stringify({ device: "pixel-9" })).touchPointer).toBe(true);
    expect(parse(JSON.stringify({ touchPointer: false })).touchPointer).toBe(false);
  });

  test("shows the device's browser following the scroll when the session predates it, and keeps a pick", () => {
    expect(DEFAULT_STATE.browser).toBe("auto");
    expect(DEFAULT_STATE.bars).toBe("auto");
    expect(parse(JSON.stringify({ device: "pixel-9" })).browser).toBe("auto");
    expect(parse(JSON.stringify({ device: "pixel-9" })).bars).toBe("auto");
    for (const browser of ["auto", "compact", "bottom", "top", "off"] as const) {
      expect(parse(JSON.stringify({ browser })).browser).toBe(browser);
    }
    for (const bars of ["auto", "expanded", "minimized"] as const) {
      expect(parse(JSON.stringify({ bars })).bars).toBe(bars);
    }
    expect(DEFAULT_STATE.edgeToEdge).toBe(true);
    expect(parse(JSON.stringify({ device: "iphone-16" })).edgeToEdge).toBe(true);
    expect(parse(JSON.stringify({ edgeToEdge: false })).edgeToEdge).toBe(false);
    // A session from when the bars were a minimized flag.
    expect(parse(JSON.stringify({ browserMin: true })).bars).toBe("minimized");
    expect(parse(JSON.stringify({ browserMin: false })).bars).toBe("auto");
  });

  test("fits the frame when the session predates the zoom, and keeps a zoom in reason", () => {
    expect(parse(JSON.stringify({ width: 390 })).zoom).toBe("fit");
    expect(parse(JSON.stringify({ zoom: "fit" })).zoom).toBe("fit");
    expect(parse(JSON.stringify({ zoom: 1.25 })).zoom).toBe(1.25);
    expect(parse(JSON.stringify({ zoom: 0 })).zoom).toBe("fit");
    expect(parse(JSON.stringify({ zoom: -1 })).zoom).toBe("fit");
    expect(parse(JSON.stringify({ zoom: "125%" })).zoom).toBe("fit");
    expect(parse(JSON.stringify({ zoom: 0.01 })).zoom).toBe(ZOOM_MIN);
    expect(parse(JSON.stringify({ zoom: 40 })).zoom).toBe(ZOOM_MAX);
  });

  test("drops a vision deficiency it does not know", () => {
    expect(parse(JSON.stringify({ vision: "colorblind" })).vision).toBe("none");
  });

  test("puts the panel where the handle is when the session predates its top", () => {
    expect(parse(JSON.stringify({ panel: { y: 200 } })).panel).toEqual({
      open: DEFAULT_STATE.panel.open,
      y: 200,
      top: 200,
      edge: "none",
      tab: "none",
      pinned: [],
    });
  });

  test("sticks the panel to no edge when the session predates edges", () => {
    const { panel } = parse(JSON.stringify({ panel: { y: 40, top: 24 } }));
    expect(panel.edge).toBe("none");
    expect(panel.tab).toBe("none");
    const stored = parse(JSON.stringify({ panel: { edge: "top", tab: "bottom" } })).panel;
    expect(stored.edge).toBe("top");
    expect(stored.tab).toBe("bottom");
  });

  test("pins no row when the session predates pinned rows or stored junk", () => {
    expect(parse(JSON.stringify({ panel: { y: 40 } })).panel.pinned).toEqual([]);
    expect(parse(JSON.stringify({ panel: { pinned: "scheme" } })).panel.pinned).toEqual([]);
    expect(parse(JSON.stringify({ panel: { pinned: null } })).panel.pinned).toEqual([]);
    expect(parse(JSON.stringify({ panel: { pinned: ["text"] } })).panel.pinned).toEqual(["text"]);
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

  test("leaves the user agent alone when the session predates the knob, and keeps a set one", () => {
    expect(parse(JSON.stringify({ scheme: "dark" })).ua).toEqual({ preset: "system", custom: "" });
    expect(parse(JSON.stringify({ ua: "googlebot" })).ua).toEqual(DEFAULT_STATE.ua);
    expect(parse(JSON.stringify({ ua: { preset: 1, custom: null } })).ua).toEqual(DEFAULT_STATE.ua);
    const ua = { preset: "custom", custom: "curl/8.7.1" };
    expect(parse(JSON.stringify({ ua })).ua).toEqual(ua);
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
      zoom: 1.5,
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

  test("patches the user agent field by field", () => {
    const state = merge(DEFAULT_STATE, { ua: { preset: "custom", custom: "curl/8.7.1" } });
    expect(merge(state, { ua: { preset: "googlebot" } }).ua).toEqual({
      preset: "googlebot",
      custom: "curl/8.7.1",
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
