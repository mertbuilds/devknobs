import { afterEach, describe, expect, test } from "bun:test";
import { FRAME_ATTRIBUTE, FRAME_NAME } from "../src/engine/frame";
import {
  FRESH_ATTRIBUTE,
  FRESH_RELOAD_KEY,
  FRESH_RELOAD_VERSION,
  FRESH_RELOAD_WINDOW,
  fresh,
  freshIn,
  ownReload,
  webStorage,
  wiped,
} from "../src/engine/fresh";
import { OWNER_KEY, RELOAD_KEY } from "../src/engine/locale";
import { SNAPSHOT_KEY } from "../src/engine/placeholder";
import {
  DEFAULT_STATE,
  keepPlace,
  load,
  merge,
  PLACE_KEY,
  STORAGE_KEY,
  save,
} from "../src/engine/store";
import { createKeys, KEYS_KEY } from "../src/ui/bindings";
import { comboText } from "../src/ui/keys";
import { createPrefs, PREFS_KEY } from "../src/ui/prefs";

/** A storage over a map the test can look into, which counts every call made to it. */
function storageOver(map: Map<string, string>): { storage: Storage; calls: () => number } {
  let calls = 0;
  const storage = {
    get length(): number {
      calls++;
      return map.size;
    },
    key: (index: number) => {
      calls++;
      return Array.from(map.keys())[index] ?? null;
    },
    getItem: (key: string) => {
      calls++;
      return map.get(key) ?? null;
    },
    setItem: (key: string, value: string) => {
      calls++;
      map.set(key, value);
    },
    removeItem: (key: string) => {
      calls++;
      map.delete(key);
    },
    clear: () => {
      calls++;
      map.clear();
    },
  };
  return { storage, calls: () => calls };
}

interface Page {
  /** The page's address query. */
  search?: string;
  /** The frame element's attributes, for the copy in the width knob's frame. */
  frame?: string[];
  name?: string;
}

const session = new Map<string, string>();
const local = new Map<string, string>();
let sessionCalls = () => 0;
let localCalls = () => 0;

/** A new document over the same storage, as a load of the page or of its frame is. */
function open(page: Page = {}): { location: { search: string } } {
  const sessionStorage = storageOver(session);
  const localStorage = storageOver(local);
  sessionCalls = sessionStorage.calls;
  localCalls = localStorage.calls;
  const frame = page.frame;
  const value = {
    sessionStorage: sessionStorage.storage,
    localStorage: localStorage.storage,
    location: { search: page.search ?? "" },
    name: page.name ?? "",
    frameElement: frame ? { hasAttribute: (name: string) => frame.includes(name) } : null,
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  Object.defineProperty(globalThis, "window", { configurable: true, value });
  return value;
}

const FRESH = "?devknobs=fresh";
const LEFT = JSON.stringify({ v: 1, side: "left", y: 40, top: 40, edge: "none", tab: "none" });
const DARK = JSON.stringify({ v: 1, scheme: "dark" });

/** A reload devknobs asked for, `ago` ms back. */
function asked(ago: number): string {
  return JSON.stringify({ v: FRESH_RELOAD_VERSION, at: Date.now() - ago });
}

afterEach(() => {
  session.clear();
  local.clear();
  Reflect.deleteProperty(globalThis, "window");
});

describe("freshIn", () => {
  test("is on for devknobs=fresh, wherever it stands in the query", () => {
    expect(freshIn("?devknobs=fresh")).toBe(true);
    expect(freshIn("devknobs=fresh")).toBe(true);
    expect(freshIn("?a=1&devknobs=fresh&b=2")).toBe(true);
    expect(freshIn("?devknobs=other&devknobs=fresh")).toBe(true);
  });

  test("is off for anything else", () => {
    expect(freshIn("")).toBe(false);
    expect(freshIn("?")).toBe(false);
    expect(freshIn("?devknobs")).toBe(false);
    expect(freshIn("?devknobs=")).toBe(false);
    expect(freshIn("?devknobs=Fresh")).toBe(false);
    expect(freshIn("?devknobs=freshly")).toBe(false);
    expect(freshIn("?xdevknobs=fresh")).toBe(false);
    expect(freshIn("?fresh=devknobs")).toBe(false);
  });
});

describe("wiped", () => {
  test("names the knobs and the frame's drawing, and any item devknobs adds", () => {
    expect(wiped(STORAGE_KEY)).toBe(true);
    expect(wiped(SNAPSHOT_KEY)).toBe(true);
    expect(wiped(FRESH_RELOAD_KEY)).toBe(true);
    expect(wiped("devknobs:new")).toBe(true);
  });

  test("leaves the locale records, which put the page's stores back, and the page's own items", () => {
    expect(wiped(OWNER_KEY)).toBe(false);
    expect(wiped(RELOAD_KEY)).toBe(false);
    expect(wiped("devknobsish")).toBe(false);
    expect(wiped("i18nextLng")).toBe(false);
  });
});

describe("fresh mode and localStorage", () => {
  test("never reads it and never writes it, and what it keeps reads as the defaults", () => {
    local.set(PLACE_KEY, LEFT);
    local.set(PREFS_KEY, JSON.stringify({ v: 1, handle: false }));
    local.set(KEYS_KEY, JSON.stringify({ v: 1, panel: "alt+shift+p" }));
    const before = new Map(local);
    open({ search: FRESH });

    const state = load();
    expect(state).toEqual(DEFAULT_STATE);
    keepPlace(merge(state, { panel: { side: "left", y: 90, top: 90 } }));

    const prefs = createPrefs();
    expect(prefs.get().handle).toBe(true);
    prefs.setHandle(false);
    expect(prefs.get().handle).toBe(false);
    prefs.setHandle(true);
    prefs.destroy();

    const keys = createKeys();
    expect(comboText(keys.get().panel)).toBe("shift+k");
    expect(keys.custom("panel")).toBe(false);
    keys.set("panel", { key: "j", shift: true, alt: false, ctrl: false, meta: false });
    expect(comboText(keys.get().panel)).toBe("shift+j");
    keys.set("panel", null);
    keys.destroy();

    expect(webStorage("local")).toBeNull();
    expect(localCalls()).toBe(0);
    expect(local).toEqual(before);
  });
});

describe("fresh mode and sessionStorage", () => {
  test("a load of the user's starts from nothing", () => {
    session.set(STORAGE_KEY, DARK);
    session.set(SNAPSHOT_KEY, "{}");
    session.set("i18nextLng", "tr");
    open({ search: FRESH });
    expect(load()).toEqual(DEFAULT_STATE);
    expect(Array.from(session.keys())).toEqual(["i18nextLng"]);
  });

  test("keeps the record of the locale stores, for the locale knob to put them back", () => {
    session.set(STORAGE_KEY, DARK);
    session.set(OWNER_KEY, "{}");
    session.set(RELOAD_KEY, "{}");
    open({ search: FRESH });
    load();
    expect(Array.from(session.keys())).toEqual([OWNER_KEY, RELOAD_KEY]);
  });

  test("the knobs hold inside the visit", () => {
    open({ search: FRESH });
    save(merge(load(), { scheme: "dark" }));
    expect(load().scheme).toBe("dark");
  });

  test("a reload devknobs asked for keeps the session, and its mark is used up", () => {
    open({ search: FRESH });
    save(merge(load(), { scheme: "dark" }));
    ownReload();
    expect(session.has(FRESH_RELOAD_KEY)).toBe(true);

    open({ search: FRESH });
    expect(load().scheme).toBe("dark");
    expect(session.has(FRESH_RELOAD_KEY)).toBe(false);

    // The user's reload after it starts over.
    open({ search: FRESH });
    expect(load()).toEqual(DEFAULT_STATE);
  });

  test("a mark that is too old, or does not read, does not count", () => {
    for (const mark of [asked(FRESH_RELOAD_WINDOW + 1), asked(-60000), "nonsense", "5"]) {
      session.set(STORAGE_KEY, DARK);
      session.set(FRESH_RELOAD_KEY, mark);
      open({ search: FRESH });
      expect(load()).toEqual(DEFAULT_STATE);
      expect(session.size).toBe(0);
    }
  });

  test("the early script and the full script wipe once between them", async () => {
    session.set(STORAGE_KEY, DARK);
    open({ search: FRESH });
    // The early script's copy of the module settles the mode and wipes.
    expect(load()).toEqual(DEFAULT_STATE);
    // What the user sets before the full script runs is theirs.
    session.set(STORAGE_KEY, DARK);
    session.set(FRESH_RELOAD_KEY, asked(0));
    const later: typeof import("../src/engine/fresh") = await import(
      `../src/engine/fresh.ts?copy=${Date.now()}`
    );
    expect(later.fresh).not.toBe(fresh);
    expect(later.fresh()).toBe(true);
    expect(later.webStorage("local")).toBeNull();
    expect(load().scheme).toBe("dark");
    expect(session.has(FRESH_RELOAD_KEY)).toBe(true);
  });

  test("the mode holds when the address moves on after the load", () => {
    const page = open({ search: FRESH });
    expect(fresh()).toBe(true);
    page.location.search = "";
    expect(fresh()).toBe(true);
    expect(webStorage("local")).toBeNull();
  });
});

describe("fresh mode in the width knob's frame", () => {
  test("follows the page above, and never wipes", () => {
    session.set(STORAGE_KEY, DARK);
    session.set(SNAPSHOT_KEY, "{}");
    session.set(FRESH_RELOAD_KEY, asked(FRESH_RELOAD_WINDOW * 2));
    const before = new Map(session);
    local.set(PLACE_KEY, LEFT);
    open({ frame: [FRAME_ATTRIBUTE, FRESH_ATTRIBUTE], name: FRAME_NAME });
    expect(fresh()).toBe(true);
    const state = load();
    expect(state.scheme).toBe("dark");
    expect(state.panel.side).toBe("right");
    ownReload();
    expect(session).toEqual(before);
    expect(localCalls()).toBe(0);
  });

  test("is off under a page that is not fresh, whatever its own address says", () => {
    session.set(STORAGE_KEY, DARK);
    local.set(PLACE_KEY, LEFT);
    open({ search: FRESH, frame: [FRAME_ATTRIBUTE], name: FRAME_NAME });
    expect(fresh()).toBe(false);
    const state = load();
    expect(state.scheme).toBe("dark");
    expect(state.panel.side).toBe("left");
  });

  test("reads its own address where it cannot reach its frame element", () => {
    session.set(STORAGE_KEY, DARK);
    open({ search: FRESH, name: FRAME_NAME });
    expect(fresh()).toBe(true);
    expect(load().scheme).toBe("dark");
  });
});

describe("with fresh mode off", () => {
  test("both storages read and write as ever", () => {
    session.set(STORAGE_KEY, DARK);
    session.set(SNAPSHOT_KEY, "{}");
    session.set(FRESH_RELOAD_KEY, asked(FRESH_RELOAD_WINDOW * 2));
    local.set(PLACE_KEY, LEFT);
    local.set(PREFS_KEY, JSON.stringify({ v: 1, handle: false }));
    local.set(KEYS_KEY, JSON.stringify({ v: 1, panel: "alt+shift+p" }));
    const kept = new Map(session);
    for (const search of ["", "?devknobs=stale", "?fresh"]) {
      open({ search });
      expect(fresh()).toBe(false);
      expect(webStorage("local")).toBe(window.localStorage);
      expect(webStorage("session")).toBe(window.sessionStorage);

      const state = load();
      expect(state.scheme).toBe("dark");
      expect(state.panel.side).toBe("left");
      // One read of each storage, and nothing looked through or dropped.
      expect(sessionCalls()).toBe(1);
      expect(localCalls()).toBe(1);
      expect(session).toEqual(kept);

      ownReload();
      expect(sessionCalls()).toBe(1);

      const prefs = createPrefs();
      expect(prefs.get().handle).toBe(false);
      prefs.destroy();
      const keys = createKeys();
      expect(comboText(keys.get().panel)).toBe("alt+shift+p");
      keys.destroy();
      expect(localCalls()).toBe(3);
    }
  });

  test("the place, the preferences and the keys are written to localStorage", () => {
    open();
    keepPlace(merge(load(), { panel: { side: "left" } }));
    const prefs = createPrefs();
    prefs.setHandle(false);
    prefs.destroy();
    const keys = createKeys();
    keys.set("panel", { key: "j", shift: true, alt: false, ctrl: false, meta: false });
    keys.destroy();
    expect(Array.from(local.keys()).sort()).toEqual([KEYS_KEY, PLACE_KEY, PREFS_KEY].sort());
    expect(session.has(FRESH_RELOAD_KEY)).toBe(false);
  });
});
