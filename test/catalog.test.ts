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
  overflow: true,
  outlines: true,
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
  test("a knob of its own says its value", () => {
    expect(says("scheme", { scheme: "dark" })).toBe("dark");
    expect(says("motion", { motion: "reduce" })).toBe("reduce");
    expect(says("contrast", { contrast: "more" })).toBe("more");
    expect(says("speed", { speed: 0.25 })).toBe("0.25");
    expect(says("speed", { speed: 0 })).toBe("pause");
    expect(says("pseudo", { pseudo: true })).toBe("on");
    expect(says("timeZone", { timeZone: "Asia/Tokyo" })).toBe("Asia/Tokyo");
    expect(says("timeZone", { timeZone: "system" })).toBe("system");
    expect(says("network", { network: { online: "offline" } })).toBe("offline");
  });

  test("related knobs read as one row", () => {
    expect(says("viewport", { width: 390, dpr: 2 })).toBe("390 · dpr 2");
    expect(says("viewport", { width: 390, dpr: 2, vision: "deuteranopia" })).toBe(
      "390 · dpr 2 · deuteranopia",
    );
    expect(says("viewport", { frame: true })).toBe("frame");
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
    expect(says("viewport", { device: "iphone-16-pro" })).toBe("iPhone 16 Pro · portrait");
    expect(says("viewport", { device: "iphone-16-pro", orientation: "landscape" })).toBe(
      "iPhone 16 Pro · landscape",
    );
    expect(says("viewport", { device: "pixel-9", dpr: 1 })).toBe("Pixel 9 · portrait · dpr 1");
    expect(says("viewport", { device: "desktop", vision: "blur" })).toBe(
      "desktop · landscape · blur",
    );
  });

  test("a size without a device reads as width by height", () => {
    expect(says("viewport", { width: 390, height: 844 })).toBe("390 × 844");
    expect(says("viewport", { width: 390, height: 844, dpr: 2 })).toBe("390 × 844 · dpr 2");
    expect(says("viewport", { height: 700 })).toBe("full × 700");
    expect(says("viewport", { device: "iphone-se", width: 500 })).toBe("500 × 667 · dpr 2");
  });

  test("a value from outside the presets reads as itself", () => {
    expect(says("viewport", { width: 500 })).toBe("500");
    expect(says("locale", { locale: { lang: "pt-BR" } })).toBe("pt-br");
    expect(says("timeZone", { timeZone: "Europe/Paris" })).toBe("Europe/Paris");
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

  test("the viewport takes the frame down", () => {
    const after = merge(BUSY, resetPatch(row("viewport")));
    expect(after.width).toBe("full");
    expect(after.height).toBe("full");
    expect(after.dpr).toBe("system");
    expect(after.frame).toBe(false);
    expect(after.vision).toBe("none");
    expect(after.scheme).toBe("dark");
    const phone = merge(BUSY, { device: "ipad-mini", orientation: "landscape" });
    expect(merge(phone, resetPatch(row("viewport")))).toMatchObject({
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
