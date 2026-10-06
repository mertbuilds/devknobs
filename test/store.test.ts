import { afterEach, describe, expect, test } from "bun:test";
import {
  DEFAULT_PINNED,
  DEFAULT_STATE,
  keepPlace,
  load,
  merge,
  PLACE_KEY,
  parse,
  placeText,
  STORAGE_KEY,
  save,
} from "../src/engine/store";
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
          side: "up",
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
        side: "right",
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
      side: "right",
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

  test("keeps the panel on the side stored, and on the right where the session predates sides", () => {
    expect(DEFAULT_STATE.panel.side).toBe("right");
    expect(parse(JSON.stringify({ panel: { y: 40 } })).panel.side).toBe("right");
    expect(parse(JSON.stringify({ panel: { side: "top" } })).panel.side).toBe("right");
    expect(parse(JSON.stringify({ panel: { side: 1 } })).panel.side).toBe("right");
    expect(parse(JSON.stringify({ panel: { side: "left" } })).panel.side).toBe("left");
    expect(parse(JSON.stringify({ panel: { side: "right" } })).panel.side).toBe("right");
  });

  test("pins no row when the session predates pinned rows or stored junk", () => {
    expect(parse(JSON.stringify({ panel: { y: 40 } })).panel.pinned).toEqual([]);
    expect(parse(JSON.stringify({ panel: { pinned: "scheme" } })).panel.pinned).toEqual([]);
    expect(parse(JSON.stringify({ panel: { pinned: null } })).panel.pinned).toEqual([]);
    expect(parse(JSON.stringify({ panel: { pinned: ["text"] } })).panel.pinned).toEqual(["text"]);
  });

  test("lists the default rows in a fresh session, and keeps a stored list as it is", () => {
    expect(DEFAULT_PINNED).toEqual(["device", "scheme", "text", "locale"]);
    expect(parse(null).panel.pinned).toEqual([...DEFAULT_PINNED]);
    expect(parse(JSON.stringify({ scheme: "dark" })).panel.pinned).toEqual([...DEFAULT_PINNED]);
    expect(parse(JSON.stringify({ panel: { pinned: [] } })).panel.pinned).toEqual([]);
    expect(parse(JSON.stringify({ panel: { pinned: ["grab"] } })).panel.pinned).toEqual(["grab"]);
  });

  test("lists a row an older version had as the row its knobs live in now", () => {
    const pinned = ["speed", "pseudo", "timeZone", "ua", "grabColor", "viewport"];
    expect(parse(JSON.stringify({ panel: { pinned } })).panel.pinned).toEqual([
      "motion",
      "locale",
      "clock",
      "device",
      "debug",
      "viewport",
    ]);
    const twice = ["motion", "speed", "locale", "pseudo"];
    expect(parse(JSON.stringify({ panel: { pinned: twice } })).panel.pinned).toEqual([
      "motion",
      "locale",
    ]);
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

describe("the place kept across sessions", () => {
  const kept = JSON.stringify({ side: "left", y: 300, top: 240, edge: "none", tab: "none" });

  test("places the panel of a session that stored none", () => {
    for (const session of [null, "", "not json", "{}", JSON.stringify({ scheme: "dark" })]) {
      expect(parse(session, kept).panel).toEqual({
        ...DEFAULT_STATE.panel,
        side: "left",
        y: 300,
        top: 240,
      });
    }
    expect(parse(JSON.stringify({ scheme: "dark" }), kept).scheme).toBe("dark");
  });

  test("gives way to the session's own place, field by field", () => {
    const session = JSON.stringify({ panel: { open: true, side: "right", y: 40, top: 24 } });
    expect(parse(session, kept).panel).toEqual({
      ...DEFAULT_STATE.panel,
      open: true,
      side: "right",
      y: 40,
      top: 24,
      pinned: [],
    });
    // A session from before sides has a place, but takes the side kept.
    expect(parse(JSON.stringify({ panel: { y: 40 } }), kept).panel).toMatchObject({
      side: "left",
      y: 40,
      top: 40,
    });
  });

  test("brings back no more than the place: never open, pins or knobs", () => {
    const junk = JSON.stringify({
      side: "left",
      y: 300,
      top: 240,
      edge: "bottom",
      tab: "top",
      open: true,
      pinned: ["scheme"],
      scheme: "dark",
    });
    const state = parse(null, junk);
    expect(state.panel.open).toBe(false);
    expect(state.panel.pinned).toEqual([...DEFAULT_PINNED]);
    expect(state.scheme).toBe("system");
    expect(state.panel.edge).toBe("bottom");
    expect(state.panel.tab).toBe("top");
  });

  test("reads a kept place as strictly as a session, falling back to the defaults", () => {
    const place = (json: string) => parse(null, json).panel;
    for (const json of ["", "not json", "null", "[]", "3", JSON.stringify("left")]) {
      expect(place(json)).toEqual(DEFAULT_STATE.panel);
    }
    const bad = JSON.stringify({ side: "up", y: "1", top: null, edge: "middle", tab: 2 });
    expect(place(bad)).toEqual(DEFAULT_STATE.panel);
    expect(place(JSON.stringify({ y: 200 }))).toMatchObject({ y: 200, top: 200, side: "right" });
    expect(place(JSON.stringify({ y: Number.NaN }))).toEqual(DEFAULT_STATE.panel);
  });

  test("writes the place alone, the way it reads back", () => {
    const state = merge(DEFAULT_STATE, {
      scheme: "dark",
      panel: { open: true, side: "left", y: 120, top: 80, edge: "bottom", pinned: ["scheme"] },
    });
    const text = placeText(state);
    expect(JSON.parse(text)).toEqual({ side: "left", y: 120, top: 80, edge: "bottom", tab: "none" });
    expect(parse(null, text).panel).toEqual({
      ...DEFAULT_STATE.panel,
      side: "left",
      y: 120,
      top: 80,
      edge: "bottom",
    });
  });
});

/** A window with both storages, each a map the test can look into. */
function stubStorage(): { session: Map<string, string>; local: Map<string, string> } {
  const session = new Map<string, string>();
  const local = new Map<string, string>();
  const storageFor = (map: Map<string, string>) =>
    ({
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => {
        map.set(key, value);
      },
    }) as Storage;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { sessionStorage: storageFor(session), localStorage: storageFor(local) },
  });
  return { session, local };
}

describe("the kept place", () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, "window");
  });

  test("a save never writes it, whatever the panel does", () => {
    const { session, local } = stubStorage();
    const kept = { side: "left", y: 40, top: 40, edge: "none", tab: "none" };
    local.set(PLACE_KEY, JSON.stringify(kept));
    const state = load();
    save(merge(state, { panel: { side: "right", y: 300, top: 280, edge: "bottom" } }));
    expect(session.has(STORAGE_KEY)).toBe(true);
    expect(JSON.parse(local.get(PLACE_KEY) ?? "")).toEqual(kept);
  });

  test("keeping it writes the place that reads back", () => {
    const { local } = stubStorage();
    const state = merge(DEFAULT_STATE, {
      panel: { side: "left", y: 120, top: 80, edge: "bottom", tab: "top" },
    });
    keepPlace(state);
    expect(local.get(PLACE_KEY)).toBe(placeText(state));
    expect(parse(null, local.get(PLACE_KEY)).panel).toEqual({
      ...DEFAULT_STATE.panel,
      side: "left",
      y: 120,
      top: 80,
      edge: "bottom",
      tab: "top",
    });
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
