import { describe, expect, test } from "bun:test";
import { DEFAULT_PINNED, DEFAULT_STATE, merge, resetState } from "../src/engine/store";
import type { DevknobsState, DevknobsStatePatch } from "../src/types";
import { type Live, ROWS, type Row, type RowId } from "../src/ui/catalog";
import { isListed, isReset, pinPatch, removePatch, rowOrder, rowText } from "../src/ui/list";

const LIVE: Live = { now: 0, real: 0, overflow: null };

/** The defaults with every row taken off the list. */
const BARE: DevknobsState = merge(DEFAULT_STATE, { panel: { pinned: [] } });

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
  test("the default rows are listed at the defaults", () => {
    expect(DEFAULT_STATE.panel.pinned).toEqual([...DEFAULT_PINNED]);
    expect(listed(DEFAULT_STATE)).toEqual(["scheme", "text", "locale", "device"]);
    expect(rowText(row("text"), DEFAULT_STATE, LIVE)).toBe("system");
    expect(rowText(row("device"), DEFAULT_STATE, LIVE)).toBe("none");
    expect(listed(BARE)).toEqual([]);
  });

  test("the default rows stand first, in their order, and the rest in the catalog's", () => {
    const order = rowOrder();
    expect(order.slice(0, 4)).toEqual(["device", "scheme", "text", "locale"]);
    const rest = ROWS.map((entry) => entry.id).filter((id) => !DEFAULT_PINNED.includes(id));
    expect(order.slice(4)).toEqual(rest);
  });

  test("a default row's × takes it off, and the rest stay", () => {
    const removed = merge(DEFAULT_STATE, removePatch(DEFAULT_STATE, row("scheme")));
    expect(removed.panel.pinned).toEqual(["device", "text", "locale"]);
  });

  test("a row set from the panel is pinned once", () => {
    const dark = use(BARE, "scheme", { scheme: "dark" });
    expect(dark.scheme).toBe("dark");
    expect(dark.panel.pinned).toEqual(["scheme"]);
    expect(use(dark, "scheme", { scheme: "light" }).panel.pinned).toEqual(["scheme"]);
    expect(use(dark, "clock", { clock: { mode: "frozen" } }).panel.pinned).toEqual([
      "scheme",
      "clock",
    ]);
  });

  test("a pinned row stays listed back at its default", () => {
    const back = use(use(BARE, "scheme", { scheme: "dark" }), "scheme", {
      scheme: "system",
    });
    expect(back.scheme).toBe("system");
    expect(listed(back)).toEqual(["scheme"]);
    expect(rowText(row("scheme"), back, LIVE)).toBe("system");
  });

  test("a row off its default is listed, pinned or not", () => {
    const set = merge(BARE, { width: 390 });
    expect(set.panel.pinned).toEqual([]);
    expect(listed(set)).toEqual(["viewport"]);
    expect(rowText(row("viewport"), set, LIVE)).toBe("390");
  });

  test("the row's × resets it and takes it off the list", () => {
    const dark = use(BARE, "scheme", { scheme: "dark" });
    const both = use(dark, "locale", { locale: { lang: "tr" } });
    const removed = merge(both, removePatch(both, row("scheme")));
    expect(removed.scheme).toBe("system");
    expect(removed.panel.pinned).toEqual(["locale"]);
    expect(listed(removed)).toEqual(["locale"]);
  });

  test("the device's × takes a device and the size, dpr and user agent it brought", () => {
    const phone = use(BARE, "device", { device: "iphone-16-pro" });
    expect(listed(phone)).toEqual(["device", "viewport"]);
    expect(rowText(row("device"), phone, LIVE)).toBe("iPhone 16 Pro · portrait");
    const removed = merge(phone, removePatch(phone, row("device")));
    expect(removed).toMatchObject({ device: "none", width: "full", height: "full", dpr: "system" });
    expect(removed.ua.preset).toBe("system");
    expect(listed(removed)).toEqual([]);
  });

  test("the × takes a row at its default off too", () => {
    const back = use(use(BARE, "locale", { pseudo: true }), "locale", { pseudo: false });
    expect(listed(merge(back, removePatch(back, row("locale"))))).toEqual([]);
  });

  test("reset all clears every knob, lists the default rows again, and keeps the panel's place", () => {
    const busy = use(use(BARE, "scheme", { scheme: "dark" }), "text", { text: 17 });
    const place = { side: "left", y: 120, top: 80, edge: "bottom", tab: "none" } as const;
    const moved = merge(busy, { panel: { open: true, ...place } });
    const reset = resetState(moved);
    expect(listed(reset)).toEqual(["scheme", "text", "locale", "device"]);
    expect(reset.scheme).toBe("system");
    expect(reset.panel).toEqual({ open: true, ...place, pinned: [...DEFAULT_PINNED] });
    expect(resetState(BARE).panel.pinned).toEqual([...DEFAULT_PINNED]);
  });

  test("reset all has nothing to do only at the defaults with the default rows listed", () => {
    expect(isReset(DEFAULT_STATE)).toBe(true);
    expect(isReset(BARE)).toBe(false);
    expect(isReset(use(DEFAULT_STATE, "scheme", { scheme: "dark" }))).toBe(false);
    expect(isReset(use(DEFAULT_STATE, "motion", { speed: 1 }))).toBe(false);
    expect(isReset(merge(DEFAULT_STATE, { width: 390 }))).toBe(false);
  });

  test("an id no row has, such as grab's from an older version, lists nothing and changes nothing", () => {
    const old = merge(DEFAULT_STATE, { panel: { pinned: [...DEFAULT_PINNED, "grab"] } });
    expect(listed(old)).toEqual(listed(DEFAULT_STATE));
    expect(isReset(old)).toBe(true);
  });
});
