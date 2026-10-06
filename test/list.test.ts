import { describe, expect, test } from "bun:test";
import { DEFAULT_PINNED, DEFAULT_STATE, merge, resetState } from "../src/engine/store";
import type { DevknobsState, DevknobsStatePatch } from "../src/types";
import { knobOf, type Live, ROWS, type Row, type RowId } from "../src/ui/catalog";
import {
  isListed,
  isReset,
  listedOrder,
  movePatch,
  moveItem,
  pinPatch,
  removePatch,
  rowOrder,
  rowText,
  showsLabel,
} from "../src/ui/list";

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

  test("the pinned rows stand first, in their order, and the rest in the catalog's", () => {
    const order = rowOrder(DEFAULT_STATE);
    expect(order.slice(0, 4)).toEqual(["device", "scheme", "text", "locale"]);
    const rest = ROWS.map((entry) => entry.id).filter((id) => !DEFAULT_PINNED.includes(id));
    expect(order.slice(4)).toEqual(rest);
    const moved = merge(DEFAULT_STATE, { panel: { pinned: ["locale", "clock", "device"] } });
    expect(rowOrder(moved).slice(0, 3)).toEqual(["locale", "clock", "device"]);
  });

  test("a row added from the panel stands last", () => {
    const added = use(DEFAULT_STATE, "clock", { clock: { mode: "frozen" } });
    expect(listedOrder(added)).toEqual(["device", "scheme", "text", "locale", "clock"]);
  });

  test("a row listed for being off its default, but not pinned, stands after the pinned ones", () => {
    const set = merge(DEFAULT_STATE, { vision: "blur" });
    expect(listedOrder(set)).toEqual(["device", "scheme", "text", "locale", "vision"]);
    const old = merge(DEFAULT_STATE, { panel: { pinned: ["grab", "text"] } });
    expect(listedOrder(old)).toEqual(["text"]);
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
    expect(listed(phone)).toEqual(["device"]);
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

  test("reset all has the default rows' order to put back after a drag", () => {
    const moved = merge(DEFAULT_STATE, movePatch(DEFAULT_STATE, 0, 3));
    expect(moved.panel.pinned).toEqual(["scheme", "text", "locale", "device"]);
    expect(isReset(moved)).toBe(false);
    expect(isReset(resetState(moved))).toBe(true);
  });

  test("an id no row has, such as grab's from an older version, lists nothing and changes nothing", () => {
    const old = merge(DEFAULT_STATE, { panel: { pinned: [...DEFAULT_PINNED, "grab"] } });
    expect(listed(old)).toEqual(listed(DEFAULT_STATE));
    expect(isReset(old)).toBe(true);
  });
});

describe("moving a row", () => {
  test("moveItem takes an item out and puts it back at a place, held inside the list", () => {
    expect(moveItem(["a", "b", "c", "d"], 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(moveItem(["a", "b", "c", "d"], 3, 0)).toEqual(["d", "a", "b", "c"]);
    expect(moveItem(["a", "b", "c"], 1, 1)).toEqual(["a", "b", "c"]);
    expect(moveItem(["a", "b", "c"], 0, 9)).toEqual(["b", "c", "a"]);
    expect(moveItem(["a", "b", "c"], 2, -1)).toEqual(["c", "a", "b"]);
    expect(moveItem([], 0, 1)).toEqual([]);
  });

  test("the list is pinned in its new order, a row off its default included", () => {
    const set = merge(DEFAULT_STATE, { vision: "blur" });
    const moved = merge(set, movePatch(set, 4, 0));
    expect(moved.panel.pinned).toEqual(["vision", "device", "scheme", "text", "locale"]);
    expect(moved.panel.pinned).toEqual(listedOrder(moved));
  });

  test("a row's × keeps the order of the rest", () => {
    const moved = merge(DEFAULT_STATE, movePatch(DEFAULT_STATE, 3, 0));
    const removed = merge(moved, removePatch(moved, row("scheme")));
    expect(listedOrder(removed)).toEqual(["locale", "device", "text"]);
  });
});

describe("a phone and the viewport", () => {
  const phone = use(BARE, "device", { device: "iphone-16-pro" });

  test("the size and dpr a device brought leave the viewport row idle", () => {
    expect(phone.width).toBe(402);
    expect(listed(phone)).toEqual(["device"]);
    expect(rowText(row("viewport"), phone, LIVE)).toBe("402");
  });

  test("a value set on the viewport row lists it", () => {
    expect(listed(use(phone, "viewport", { zoom: 1.25 }))).toEqual(["device", "viewport"]);
    const dpr = merge(phone, { dpr: 1 });
    expect(listed(dpr)).toEqual(["device", "viewport"]);
    expect(rowText(row("viewport"), dpr, LIVE)).toBe("dpr 1");
  });

  test("the viewport's × leaves the device, and puts its dpr back", () => {
    const busy = use(merge(phone, { dpr: 1 }), "viewport", { zoom: 1.25 });
    const removed = merge(busy, removePatch(busy, row("viewport")));
    expect(removed).toMatchObject({ device: "iphone-16-pro", width: 402, dpr: 3, zoom: "fit" });
    expect(listed(removed)).toEqual(["device"]);
  });
});

describe("showsLabel", () => {
  test("a knob named as its row leaves the name to the row's title", () => {
    expect(showsLabel(row("scheme"), knobOf("scheme"))).toBe(false);
    expect(showsLabel(row("locale"), knobOf("locale"))).toBe(false);
    expect(showsLabel(row("locale"), knobOf("direction"))).toBe(true);
    expect(showsLabel(row("locale"), knobOf("pseudo"))).toBe(true);
    expect(showsLabel(row("text"), knobOf("text"))).toBe(true);
  });
});
