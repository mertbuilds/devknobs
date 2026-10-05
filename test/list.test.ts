import { describe, expect, test } from "bun:test";
import { DEFAULT_STATE, merge, resetState } from "../src/engine/store";
import type { DevknobsState, DevknobsStatePatch } from "../src/types";
import { type Live, ROWS, type Row, type RowId } from "../src/ui/catalog";
import { isListed, pinPatch, removePatch, rowText } from "../src/ui/list";

const LIVE: Live = { now: 0, real: 0, overflow: null };

function row(id: RowId): Row {
  const found = ROWS.find((entry) => entry.id === id);
  if (!found) throw new Error(`no row ${id}`);
  return found;
}

/** Set knobs the way the panel does, pinning their row. */
function use(state: DevknobsState, id: RowId, patch: DevknobsStatePatch): DevknobsState {
  return merge(state, pinPatch(state, id, patch));
}

function listed(state: DevknobsState): RowId[] {
  return ROWS.filter((entry) => isListed(entry, state)).map((entry) => entry.id);
}

describe("pinned rows", () => {
  test("nothing is listed at the defaults", () => {
    expect(listed(DEFAULT_STATE)).toEqual([]);
  });

  test("a row set from the panel is pinned once", () => {
    const dark = use(DEFAULT_STATE, "scheme", { scheme: "dark" });
    expect(dark.scheme).toBe("dark");
    expect(dark.panel.pinned).toEqual(["scheme"]);
    expect(use(dark, "scheme", { scheme: "light" }).panel.pinned).toEqual(["scheme"]);
    expect(use(dark, "clock", { clock: { mode: "frozen" } }).panel.pinned).toEqual([
      "scheme",
      "clock",
    ]);
  });

  test("a pinned row stays listed back at its default", () => {
    const back = use(use(DEFAULT_STATE, "scheme", { scheme: "dark" }), "scheme", {
      scheme: "system",
    });
    expect(back.scheme).toBe("system");
    expect(listed(back)).toEqual(["scheme"]);
    expect(rowText(row("scheme"), back, LIVE)).toBe("system");
  });

  test("a row off its default is listed, pinned or not", () => {
    const set = merge(DEFAULT_STATE, { width: 390 });
    expect(set.panel.pinned).toEqual([]);
    expect(listed(set)).toEqual(["viewport"]);
    expect(rowText(row("viewport"), set, LIVE)).toBe("390");
  });

  test("the row's × resets it and takes it off the list", () => {
    const dark = use(DEFAULT_STATE, "scheme", { scheme: "dark" });
    const both = use(dark, "locale", { locale: { lang: "tr" } });
    const removed = merge(both, removePatch(both, row("scheme")));
    expect(removed.scheme).toBe("system");
    expect(removed.panel.pinned).toEqual(["locale"]);
    expect(listed(removed)).toEqual(["locale"]);
  });

  test("the viewport's × takes a device and the user agent it brought", () => {
    const phone = use(DEFAULT_STATE, "viewport", { device: "iphone-16-pro" });
    expect(listed(phone)).toEqual(["viewport", "ua"]);
    expect(rowText(row("ua"), phone, LIVE)).toBe("iphone safari");
    const removed = merge(phone, removePatch(phone, row("viewport")));
    expect(removed).toMatchObject({ device: "none", width: "full", height: "full" });
    expect(removed.ua.preset).toBe("system");
    expect(listed(removed)).toEqual([]);
  });

  test("the × takes a row at its default off too", () => {
    const back = use(use(DEFAULT_STATE, "pseudo", { pseudo: true }), "pseudo", { pseudo: false });
    expect(listed(merge(back, removePatch(back, row("pseudo"))))).toEqual([]);
  });

  test("reset all clears every knob and every pin, and keeps the panel's place", () => {
    const busy = use(use(DEFAULT_STATE, "scheme", { scheme: "dark" }), "text", { text: 17 });
    const place = { side: "left", y: 120, top: 80, edge: "bottom", tab: "none" } as const;
    const moved = merge(busy, { panel: { open: true, ...place } });
    const reset = resetState(moved);
    expect(listed(reset)).toEqual([]);
    expect(reset.scheme).toBe("system");
    expect(reset.panel).toEqual({ open: true, ...place, pinned: [] });
  });
});
