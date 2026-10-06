import { describe, expect, test } from "bun:test";
import { DEFAULT_STATE, merge } from "../src/engine/store";
import type { DevknobsState, DevknobsStatePatch } from "../src/types";
import {
  browse,
  CATEGORIES,
  combine,
  isActive,
  KNOBS,
  knobOf,
  type Live,
  nameOf,
  parseShift,
  ROWS,
  type Row,
  type RowId,
  resetPatch,
  rowOf,
  shiftLabel,
  summary,
} from "../src/ui/catalog";

const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

const LIVE: Live = { now: 0, real: 0, overflow: null };

function row(id: RowId): Row {
  const found = ROWS.find((entry) => entry.id === id);
  if (!found) throw new Error(`no row ${id}`);
  return found;
}

function state(patch: DevknobsStatePatch): DevknobsState {
  return merge(DEFAULT_STATE, patch);
}

function says(id: RowId, patch: DevknobsStatePatch, live: Live = LIVE): string {
  return summary(row(id), state(patch), live);
}

/** Every knob off its default at once. */
const BUSY = state({
  scheme: "dark",
  motion: "reduce",
  speed: 0.25,
  contrast: "more",
  transparency: "reduce",
  locale: { lang: "tr", dir: "rtl" },
  pseudo: true,
  geo: { preset: "route", error: "denied", route: "36.9,30.7\n37,31" },
  timeZone: "Asia/Tokyo",
  clock: { mode: "frozen", at: 1_000, since: 0, speed: 60, header: true },
  network: { online: "offline", type: "3g", saveData: "on" },
  text: 17,
  spacing: true,
  width: 390,
  height: 844,
  frame: true,
  dpr: 2,
  vision: "deuteranopia",
  ua: { preset: "iphone-safari" },
  overflow: true,
  outlines: true,
  grabColor: "pink",
});

describe("catalog", () => {
  test("every knob sits in exactly one row", () => {
    for (const knob of KNOBS) {
      expect(ROWS.filter((entry) => entry.knobs.includes(knob.id))).toHaveLength(1);
      expect(rowOf(knob.id).knobs).toContain(knob.id);
    }
    const listed = ROWS.flatMap((entry) => entry.knobs);
    expect(new Set(listed).size).toBe(listed.length);
    expect(listed.length).toBe(KNOBS.length);
  });

  test("ids are unique and every category has a knob", () => {
    expect(new Set(KNOBS.map((knob) => knob.id)).size).toBe(KNOBS.length);
    expect(new Set(ROWS.map((entry) => entry.id)).size).toBe(ROWS.length);
    for (const category of CATEGORIES) {
      expect(KNOBS.some((knob) => knob.category === category)).toBe(true);
    }
  });

  test("option values are unique within a knob", () => {
    for (const knob of KNOBS) {
      const values = knob.options.map((option) => option.value);
      expect(new Set(values).size).toBe(values.length);
    }
  });

  test("a switch has two options, the default first", () => {
    for (const knob of KNOBS.filter((entry) => entry.control === "switch")) {
      expect(knob.options).toHaveLength(2);
      expect(knob.read(DEFAULT_STATE)).toBe(knob.options[0]?.value ?? "");
    }
  });

  test("every knob but the clock mode offers its default", () => {
    for (const knob of KNOBS.filter((entry) => entry.id !== "clockMode")) {
      const values = knob.options.map((option) => option.value);
      expect(values).toContain(knob.read(DEFAULT_STATE));
    }
  });

  test("nothing is active at the defaults", () => {
    for (const entry of ROWS) {
      expect(isActive(entry, DEFAULT_STATE)).toBe(false);
      expect(summary(entry, DEFAULT_STATE, LIVE)).toBe("");
    }
  });

  test("the browse list keeps the category order and has every usable knob once", () => {
    const groups = browse();
    const order = groups.map((group) => CATEGORIES.indexOf(group.category));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    const knobs = groups.flatMap((group) => group.knobs.map((knob) => knob.id));
    expect(new Set(knobs).size).toBe(knobs.length);
    expect(knobs).toContain("scheme");
    expect(knobs).toContain("outlines");
  });
});

describe("summary", () => {
  test("a knob says its value in its row", () => {
    expect(says("scheme", { scheme: "dark" })).toBe("dark");
    expect(says("motion", { motion: "reduce" })).toBe("reduce");
    expect(says("contrast", { contrast: "more" })).toBe("more");
    expect(says("vision", { vision: "deuteranopia" })).toBe("deuteranopia");
    expect(says("motion", { speed: 0.25 })).toBe("0.25");
    expect(says("motion", { speed: 0 })).toBe("pause");
    expect(says("locale", { pseudo: true })).toBe("on");
    expect(says("clock", { timeZone: "Asia/Tokyo" })).toBe("Asia/Tokyo");
    expect(says("clock", { timeZone: "system" })).toBe("system");
    expect(says("network", { network: { online: "offline" } })).toBe("offline");
    expect(says("device", { ua: { preset: "googlebot" } })).toBe("googlebot");
    expect(says("device", { ua: { preset: "custom", custom: "curl/8.7.1" } })).toBe("custom");
  });

  test("related knobs read as one row", () => {
    expect(says("viewport", { width: 390, dpr: 2 })).toBe("390 · dpr 2");
    expect(says("motion", { motion: "reduce", speed: 0.25 })).toBe("reduce · 0.25");
    expect(says("locale", { locale: { lang: "ar", dir: "rtl" }, pseudo: true })).toBe(
      "ar · rtl · on",
    );
    expect(says("viewport", { frame: true })).toBe("frame");
    expect(says("viewport", { frame: true, width: 390 })).toBe("390");
    expect(says("locale", { locale: { lang: "tr" } })).toBe("tr");
    expect(says("locale", { locale: { lang: "ar", dir: "rtl" } })).toBe("ar · rtl");
    expect(says("locale", { locale: { dir: "rtl" } })).toBe("rtl");
    expect(says("text", { text: 17, spacing: true })).toBe("17 · spacing");
    expect(says("location", { geo: { preset: "tokyo", error: "denied" } })).toBe("tokyo · denied");
    expect(says("location", { geo: { error: "timeout" } })).toBe("timeout");
    expect(says("location", { geo: { preset: "custom", lat: 36.8969, lng: 30.7133 } })).toBe(
      "36.9, 30.71",
    );
  });

  test("a device says its name and how it is held, and the size what the device does not", () => {
    expect(says("device", { device: "iphone-16-pro" })).toBe("iPhone 16 Pro · portrait");
    expect(says("device", { device: "iphone-16-pro", orientation: "landscape" })).toBe(
      "iPhone 16 Pro · landscape",
    );
    expect(says("device", { device: "pixel-9", dpr: 1 })).toBe("Pixel 9 · portrait");
    expect(says("viewport", { device: "pixel-9", dpr: 1 })).toBe("dpr 1");
    expect(says("viewport", { device: "pixel-9" })).toBe("");
  });

  test("the user agent a device brought says nothing, another one its name", () => {
    expect(says("device", { device: "iphone-16-pro", ua: { preset: "googlebot" } })).toBe(
      "iPhone 16 Pro · portrait · googlebot",
    );
  });

  test("the mock is on while a phone or tablet draws one, and the device says enough", () => {
    const mock = knobOf("mock");
    expect(mock.read(state({ device: "iphone-16-pro" }))).toBe("on");
    expect(mock.read(state({ device: "iphone-16-pro", mock: false }))).toBe("off");
    expect(mock.read(state({ device: "desktop" }))).toBe("off");
    expect(mock.read(state({ width: 390, height: 844 }))).toBe("off");
    expect(mock.offers?.(state({ device: "iphone-16-pro" }))).toEqual(["off", "on"]);
    expect(mock.offers?.(state({ device: "desktop" }))).toEqual([]);
    expect(isActive(row("device"), state({ mock: false }))).toBe(false);
    expect(says("device", { device: "pixel-9", mock: false })).toBe("Pixel 9 · portrait");
    expect(resetPatch(row("device"))).toMatchObject({ mock: true });
  });

  test("the touch pointer is on while the device takes touch, and the device says enough", () => {
    const pointer = knobOf("touchPointer");
    expect(pointer.read(state({ device: "pixel-9" }))).toBe("on");
    expect(pointer.read(state({ device: "pixel-9", touchPointer: false }))).toBe("off");
    expect(pointer.read(state({ device: "desktop" }))).toBe("off");
    expect(pointer.read(state({ width: 390, height: 844 }))).toBe("off");
    expect(pointer.offers?.(state({ device: "pixel-9" }))).toEqual(["off", "on"]);
    expect(pointer.offers?.(state({ device: "desktop" }))).toEqual([]);
    expect(isActive(row("device"), state({ touchPointer: false }))).toBe(false);
    expect(says("device", { device: "ipad-mini", touchPointer: false })).toBe(
      "iPad mini · portrait",
    );
    expect(pointer.write("off", DEFAULT_STATE)).toEqual({ touchPointer: false });
    expect(resetPatch(row("device"))).toMatchObject({ touchPointer: true });
  });

  test("the browser reads its layout on a phone, its default saying nothing", () => {
    const browser = knobOf("browser");
    expect(browser.read(DEFAULT_STATE)).toBe("off");
    expect(browser.read(state({ device: "iphone-16-pro" }))).toBe("compact");
    expect(browser.read(state({ device: "pixel-9" }))).toBe("top");
    expect(browser.read(state({ device: "pixel-9", browser: "compact" }))).toBe("top");
    expect(browser.read(state({ device: "ipad-mini", browser: "top" }))).toBe("off");
    expect(browser.offers?.(state({ device: "iphone-se" }))).toEqual([
      "compact",
      "bottom",
      "top",
      "off",
    ]);
    expect(browser.offers?.(state({ device: "pixel-9" }))).toEqual(["top", "bottom", "off"]);
    expect(browser.offers?.(state({ device: "desktop" }))).toEqual([]);
    expect(says("device", { device: "iphone-16-pro" })).toBe("iPhone 16 Pro · portrait");
    expect(says("device", { device: "iphone-16-pro", browser: "bottom" })).toBe(
      "iPhone 16 Pro · portrait · bottom",
    );
    expect(browser.write("top", DEFAULT_STATE)).toEqual({ browser: "top" });
    expect(resetPatch(row("device"))).toMatchObject({ browser: "auto", bars: "auto" });
  });

  test("edge to edge is on while Safari is drawn, and offered only then", () => {
    const edge = knobOf("edgeToEdge");
    expect(edge.read(DEFAULT_STATE)).toBe("off");
    expect(edge.read(state({ device: "iphone-16-pro" }))).toBe("on");
    expect(edge.read(state({ device: "iphone-16-pro", edgeToEdge: false }))).toBe("off");
    expect(edge.read(state({ device: "pixel-9" }))).toBe("off");
    expect(edge.offers?.(state({ device: "iphone-se" }))).toEqual(["off", "on"]);
    expect(edge.offers?.(state({ device: "iphone-se", browser: "off" }))).toEqual([]);
    expect(edge.offers?.(state({ device: "pixel-9" }))).toEqual([]);
    expect(says("device", { device: "iphone-16-pro", edgeToEdge: false })).toBe(
      "iPhone 16 Pro · portrait",
    );
    expect(resetPatch(row("device"))).toMatchObject({ edgeToEdge: true });
  });

  test("the bars follow the scroll by default, and read so while no browser draws them", () => {
    const bars = knobOf("bars");
    expect(bars.options.map((option) => option.value)).toEqual(["auto", "expanded", "minimized"]);
    expect(bars.read(DEFAULT_STATE)).toBe("auto");
    expect(bars.read(state({ device: "iphone-16" }))).toBe("auto");
    expect(bars.read(state({ device: "iphone-16", bars: "minimized" }))).toBe("minimized");
    expect(bars.read(state({ device: "iphone-16", bars: "minimized", browser: "off" }))).toBe("auto");
    expect(bars.read(state({ device: "desktop", bars: "expanded" }))).toBe("auto");
    expect(bars.offers?.(state({ device: "pixel-9" }))).toEqual(["auto", "expanded", "minimized"]);
    expect(bars.offers?.(state({ device: "pixel-9", browser: "off" }))).toEqual([]);
    expect(says("device", { device: "pixel-9", browser: "bottom", bars: "minimized" })).toBe(
      "Pixel 9 · portrait · bottom · minimized",
    );
    expect(says("device", { device: "pixel-9", bars: "auto" })).toBe("Pixel 9 · portrait");
    expect(bars.write("expanded", DEFAULT_STATE)).toEqual({ bars: "expanded" });
  });

  test("a zoom off fit says its percent", () => {
    expect(says("viewport", { device: "iphone-16-pro", zoom: 1.25 })).toBe("125%");
    expect(says("viewport", { width: 390, zoom: 0.8333 })).toBe("390 · 83%");
    expect(says("viewport", { width: 390, zoom: "fit" })).toBe("390");
  });

  test("a size without a device reads as width by height", () => {
    expect(says("device", { width: 390, height: 844 })).toBe("390 × 844");
    expect(says("viewport", { width: 390, height: 844 })).toBe("");
    expect(says("viewport", { width: 390, height: 844, dpr: 2 })).toBe("dpr 2");
    expect(says("device", { height: 700 })).toBe("full × 700");
    expect(says("device", { device: "iphone-se", width: 500 })).toBe(
      "500 × 667 · iphone safari",
    );
    expect(says("viewport", { device: "iphone-se", width: 500 })).toBe("dpr 2");
  });

  test("a value from outside the presets reads as itself", () => {
    expect(says("viewport", { width: 500 })).toBe("500");
    expect(says("locale", { locale: { lang: "pt-BR" } })).toBe("pt-br");
    expect(says("clock", { timeZone: "Europe/Paris" })).toBe("Europe/Paris");
  });

  test("the clock says how far it is from the real time, live", () => {
    const real = Date.UTC(2026, 9, 2, 12);
    const clock = { mode: "frozen" as const, at: real + 2 * DAY, since: real };
    expect(says("clock", { clock }, { ...LIVE, now: real + 2 * DAY, real })).toBe("+2d · frozen");
    // An hour on, a frozen clock is still about two days out.
    const later = real + HOUR;
    expect(says("clock", { clock }, { ...LIVE, now: real + 2 * DAY, real: later })).toBe(
      "+2d · frozen",
    );
    const running = {
      mode: "offset" as const,
      at: real + HOUR,
      since: real,
      speed: 60,
      header: true,
    };
    const live = { ...LIVE, now: real + HOUR, real };
    expect(says("clock", { clock: running }, live)).toBe("+1h · 60x · server");
    expect(says("clock", { clock: { header: true } })).toBe("server");
  });

  test("a clock far off says the day it shows", () => {
    const now = new Date(2026, 11, 24, 18).getTime();
    const clock = { mode: "offset" as const, at: now, since: now - 90 * DAY };
    expect(says("clock", { clock }, { ...LIVE, now, real: now - 90 * DAY })).toBe("2026-12-24");
  });

  test("the overflow count is live", () => {
    expect(says("debug", { overflow: true })).toBe("overflow");
    expect(says("debug", { overflow: true }, { ...LIVE, overflow: 3 })).toBe("overflow · 3");
    expect(says("debug", { overflow: true, outlines: true }, { ...LIVE, overflow: 0 })).toBe(
      "overflow · 0 · outlines",
    );
    expect(says("debug", { outlines: true }, { ...LIVE, overflow: 3 })).toBe("outlines");
  });
});

describe("shiftLabel", () => {
  test("rounds to the largest unit", () => {
    expect(shiftLabel(30_000)).toBe("now");
    expect(shiftLabel(-5 * MINUTE)).toBe("-5m");
    expect(shiftLabel(3 * HOUR)).toBe("+3h");
    expect(shiftLabel(2 * DAY)).toBe("+2d");
    expect(shiftLabel(2 * DAY - HOUR)).toBe("+2d");
    expect(shiftLabel(-7 * DAY)).toBe("-7d");
  });
});

describe("parseShift", () => {
  test("reads a jump, short or written out", () => {
    expect(parseShift("+2d")).toEqual({ value: String(2 * DAY), label: "+2d", long: "+2 days" });
    expect(parseShift("2d")?.value).toBe(String(2 * DAY));
    expect(parseShift("2 days")?.value).toBe(String(2 * DAY));
    expect(parseShift("1 day")?.long).toBe("+1 day");
    expect(parseShift("3h")?.value).toBe(String(3 * HOUR));
    expect(parseShift("45 minutes")?.value).toBe(String(45 * MINUTE));
    expect(parseShift("-1w")).toEqual({ value: String(-7 * DAY), label: "-1w", long: "-1 week" });
  });

  test("leaves anything else alone", () => {
    expect(parseShift("dark")).toBeNull();
    expect(parseShift("2")).toBeNull();
    expect(parseShift("0d")).toBeNull();
    expect(parseShift("2x")).toBeNull();
  });
});

describe("write", () => {
  test("a clock preset jumps from the real now and keeps a frozen clock frozen", () => {
    const clock = knobOf("clock");
    const patch = clock.write(String(2 * DAY), DEFAULT_STATE).clock;
    expect(patch?.mode).toBe("offset");
    expect((patch?.at ?? 0) - (patch?.since ?? 0)).toBe(2 * DAY);
    const frozen = state({ clock: { mode: "frozen" } });
    expect(clock.write(String(DAY), frozen).clock?.mode).toBe("frozen");
    expect(clock.write("system", frozen)).toEqual({ clock: { mode: "system" } });
    expect(clock.read(merge(DEFAULT_STATE, clock.write(String(2 * DAY), DEFAULT_STATE)))).toBe(
      String(2 * DAY),
    );
  });

  test("a clock speed starts the real clock running", () => {
    expect(knobOf("clockSpeed").write("60", DEFAULT_STATE)).toEqual({
      clock: { mode: "offset", speed: 60 },
    });
    const frozen = state({ clock: { mode: "frozen" } });
    expect(knobOf("clockSpeed").write("60", frozen).clock?.mode).toBe("frozen");
  });

  test("geo takes a preset, a pair of coordinates, or custom from where it stands", () => {
    const geo = knobOf("geo");
    expect(geo.write("tokyo", DEFAULT_STATE)).toEqual({ geo: { preset: "tokyo" } });
    expect(geo.write("36.9,30.7", DEFAULT_STATE)).toEqual({
      geo: { preset: "custom", lat: 36.9, lng: 30.7 },
    });
    expect(geo.write("custom", state({ geo: { preset: "tokyo" } }))).toEqual({
      geo: { preset: "custom", lat: 35.6762, lng: 139.6503 },
    });
  });

  test("user agent takes a preset, a string typed out, or custom from the one in use", () => {
    const ua = knobOf("ua");
    expect(ua.write("googlebot", DEFAULT_STATE)).toEqual({ ua: { preset: "googlebot" } });
    expect(ua.write("system", DEFAULT_STATE)).toEqual({ ua: { preset: "system" } });
    expect(ua.write("curl/8.7.1", DEFAULT_STATE)).toEqual({
      ua: { preset: "custom", custom: "curl/8.7.1" },
    });
    const custom = ua.write("custom", state({ ua: { preset: "linux-firefox" } })).ua?.custom;
    expect(custom).toContain("Firefox/");
    const typed = state({ ua: { preset: "system", custom: "curl/8.7.1" } });
    expect(ua.write("custom", typed)).toEqual({ ua: { preset: "custom", custom: "curl/8.7.1" } });
  });

  test("zoom takes fit or a scale, and a percent typed out in reason", () => {
    const zoom = knobOf("zoom");
    expect(zoom.write("fit", DEFAULT_STATE)).toEqual({ zoom: "fit" });
    expect(zoom.write("1.25", DEFAULT_STATE)).toEqual({ zoom: 1.25 });
    expect(zoom.parse?.("80%")).toEqual({ value: "0.8", label: "80%" });
    expect(zoom.parse?.("10")).toBeNull();
    expect(zoom.parse?.("fit")).toBeNull();
    expect(nameOf(zoom, "1.5")).toBe("150");
    expect(nameOf(zoom, "0.8")).toBe("80%");
  });

  test("numbers and keywords go back to their types", () => {
    expect(knobOf("width").write("500", DEFAULT_STATE)).toEqual({ width: 500 });
    expect(knobOf("width").write("full", DEFAULT_STATE)).toEqual({ width: "full" });
    expect(knobOf("dpr").write("system", DEFAULT_STATE)).toEqual({ dpr: "system" });
    expect(knobOf("text").write("17", DEFAULT_STATE)).toEqual({ text: 17 });
    expect(knobOf("speed").write("0", DEFAULT_STATE)).toEqual({ speed: 0 });
    expect(knobOf("pseudo").write("on", DEFAULT_STATE)).toEqual({ pseudo: true });
  });
});

describe("the device knob", () => {
  const device = knobOf("device");

  test("picks a device, a size or a way to hold it", () => {
    expect(device.write("iphone-16", DEFAULT_STATE)).toEqual({ device: "iphone-16" });
    expect(device.write("390x844", DEFAULT_STATE)).toEqual({ width: 390, height: 844 });
    expect(device.write("fullx700", DEFAULT_STATE)).toEqual({ width: "full", height: 700 });
    expect(device.write("landscape", DEFAULT_STATE)).toEqual({ orientation: "landscape" });
  });

  test("none takes the device's size away, and its dpr unless one was set since", () => {
    const phone = state({ device: "iphone-16" });
    const none = { device: "none", width: "full", height: "full" } as const;
    expect(device.write("none", phone)).toEqual({ ...none, dpr: "system" });
    expect(device.write("none", merge(phone, { dpr: 1 }))).toEqual(none);
    expect(merge(phone, device.write("none", phone))).toEqual(DEFAULT_STATE);
  });

  test("reads the device, else the size, and names a size", () => {
    expect(device.read(state({ device: "pixel-9" }))).toBe("pixel-9");
    expect(device.read(state({ width: 390, height: 844 }))).toBe("390x844");
    expect(device.read(state({ width: 390 }))).toBe("none");
    expect(nameOf(device, "390x844")).toBe("390 × 844");
    expect(nameOf(device, "pixel-9")).toBe("Pixel 9");
  });

  test("takes a size typed out, in reason", () => {
    expect(device.parse?.("390x844")).toEqual({ value: "390x844", label: "390 × 844" });
    expect(device.parse?.("1920 × 1080 px")?.value).toBe("1920x1080");
    expect(device.parse?.("390*844")?.value).toBe("390x844");
    expect(device.parse?.("390")).toBeNull();
    expect(device.parse?.("10x844")).toBeNull();
  });

  test("lists its devices under their kind", () => {
    const groups = device.options.map((option) => option.group ?? "");
    expect(groups.filter((group, index) => group !== groups[index - 1])).toEqual([
      "",
      "phone",
      "tablet",
      "laptop",
      "desktop",
    ]);
  });
});

describe("grab color", () => {
  const knob = knobOf("grabColor");

  test("sits in the debug row, with a swatch for auto and for each color", () => {
    expect(rowOf("grabColor").id).toBe("debug");
    expect(knob.control).toBe("swatches");
    expect(knob.options.map((option) => option.value)).toEqual([
      "auto",
      "blue",
      "green",
      "pink",
      "orange",
      "purple",
      "cyan",
    ]);
    for (const option of knob.options) expect(option.swatch).toBeTruthy();
    expect(knob.options.find((option) => option.value === "pink")?.swatch).toBe(
      "rgb(210, 57, 192)",
    );
  });

  test("reads and writes the state, and goes back to auto", () => {
    expect(knob.read(DEFAULT_STATE)).toBe("auto");
    const pink = merge(DEFAULT_STATE, knob.write("pink", DEFAULT_STATE));
    expect(pink.grabColor).toBe("pink");
    expect(merge(pink, knob.reset).grabColor).toBe("auto");
  });

  test("says the name of the color in its row", () => {
    expect(says("debug", { grabColor: "pink" })).toBe("pink");
    expect(says("debug", { grabColor: "blue" })).toBe("blue");
    expect(says("debug", { grabColor: "auto" })).toBe("");
  });
});

describe("resetPatch", () => {
  test("puts one row back and leaves the rest", () => {
    for (const entry of ROWS) {
      const after = merge(BUSY, resetPatch(entry));
      expect(isActive(entry, after)).toBe(false);
      for (const other of ROWS.filter((candidate) => candidate !== entry)) {
        expect(isActive(other, after)).toBe(isActive(other, BUSY));
      }
    }
  });

  test("the clock goes back whole: mode, speed and header", () => {
    const after = merge(BUSY, resetPatch(row("clock")));
    expect(after.clock.mode).toBe("system");
    expect(after.clock.speed).toBe(1);
    expect(after.clock.header).toBe(false);
  });

  test("the device and the viewport take the frame down", () => {
    const after = merge(BUSY, combine([resetPatch(row("device")), resetPatch(row("viewport"))]));
    expect(after.width).toBe("full");
    expect(after.height).toBe("full");
    expect(after.dpr).toBe("system");
    expect(after.frame).toBe(false);
    expect(after.vision).toBe("deuteranopia");
    expect(after.scheme).toBe("dark");
    const phone = merge(BUSY, { device: "ipad-mini", orientation: "landscape" });
    expect(merge(phone, resetPatch(row("device")))).toMatchObject({
      device: "none",
      orientation: "portrait",
      width: "full",
      height: "full",
      dpr: "system",
    });
  });

  test("location keeps the route that was typed", () => {
    const after = merge(BUSY, resetPatch(row("location")));
    expect(after.geo.preset).toBe("system");
    expect(after.geo.error).toBe("none");
    expect(after.geo.route).toBe(BUSY.geo.route);
  });
});

describe("combine", () => {
  test("merges object knobs a level deep, later patches winning", () => {
    const patches: DevknobsStatePatch[] = [
      { clock: { mode: "system" } },
      { clock: { speed: 1 } },
      { scheme: "dark" },
      { scheme: "light" },
    ];
    expect(combine(patches)).toEqual({ clock: { mode: "system", speed: 1 }, scheme: "light" });
  });
});
