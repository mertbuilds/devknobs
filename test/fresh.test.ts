import { afterEach, describe, expect, test } from "bun:test";
import { FRAME_ATTRIBUTE, FRAME_NAME } from "../src/engine/frame";
import {
  FRESH_ATTRIBUTE,
  FRESH_RELOAD_KEY,
  FRESH_RELOAD_VERSION,
  FRESH_RELOAD_WINDOW,
  fresh,
  freshIn,
  loads,
  ownReload,
  webStorage,
  wiped,
  withFresh,
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

describe("loads", () => {
  test("is true for another page, or another query", () => {
    expect(loads("http://app.test/b", "http://app.test/a")).toBe(true);
    expect(loads("http://app.test/a?x=2", "http://app.test/a?x=1")).toBe(true);
    expect(loads("http://app.test/b#top", "http://app.test/a#top")).toBe(true);
  });

  test("is false where the hash alone differs", () => {
    expect(loads("http://app.test/a#billing", "http://app.test/a")).toBe(false);
    expect(loads("http://app.test/a", "http://app.test/a#billing")).toBe(false);
    expect(loads("http://app.test/a?x=1#one", "http://app.test/a?x=1#two")).toBe(false);
    expect(loads("http://app.test/a#", "http://app.test/a")).toBe(false);
  });
});

describe("withFresh", () => {
  const ORIGIN = "http://app.test";

  test("adds the switch to an address with no query", () => {
    expect(withFresh("http://app.test/a", ORIGIN)).toBe("http://app.test/a?devknobs=fresh");
    expect(withFresh("http://app.test/", ORIGIN)).toBe("http://app.test/?devknobs=fresh");
    expect(withFresh("http://app.test/a?", ORIGIN)).toBe("http://app.test/a?devknobs=fresh");
  });

  test("adds it after the query that is there", () => {
    expect(withFresh("http://app.test/a?x=1&y=2", ORIGIN)).toBe(
      "http://app.test/a?x=1&y=2&devknobs=fresh",
    );
    expect(withFresh("http://app.test/a?devknobs=other", ORIGIN)).toBe(
      "http://app.test/a?devknobs=other&devknobs=fresh",
    );
  });

  test("leaves an address that has it", () => {
    for (const target of [
      "http://app.test/a?devknobs=fresh",
      "http://app.test/a?x=1&devknobs=fresh&y=2#top",
    ]) {
      expect(withFresh(target, ORIGIN)).toBe(target);
    }
  });

  test("keeps the hash, after the query", () => {
    expect(withFresh("http://app.test/a#billing", ORIGIN)).toBe(
      "http://app.test/a?devknobs=fresh#billing",
    );
    expect(withFresh("http://app.test/a?x=1#a?b=2", ORIGIN)).toBe(
      "http://app.test/a?x=1&devknobs=fresh#a?b=2",
    );
    // A switch in the hash is not one in the query.
    expect(withFresh("http://app.test/a#?devknobs=fresh", ORIGIN)).toBe(
      "http://app.test/a?devknobs=fresh#?devknobs=fresh",
    );
  });

  test("leaves encoded parameters as they are written", () => {
    expect(withFresh("http://app.test/a?q=a%20b+c&next=%2Fhome%3Fx%3D1&u=%C3%BC", ORIGIN)).toBe(
      "http://app.test/a?q=a%20b+c&next=%2Fhome%3Fx%3D1&u=%C3%BC&devknobs=fresh",
    );
  });

  test("turns the address it gives fresh mode on", () => {
    for (const target of ["http://app.test/a", "http://app.test/a?x=1#top"]) {
      expect(freshIn(new URL(withFresh(target, ORIGIN)).search)).toBe(true);
    }
  });

  test("leaves another origin's address, and one that does not read", () => {
    for (const target of ["http://other.test/a", "https://app.test/a", "about:blank", "/a", ""]) {
      expect(withFresh(target, ORIGIN)).toBe(target);
    }
  });
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

  test("a mark a load with the mode off did not use is gone by the next fresh visit", () => {
    open({ search: FRESH });
    save(merge(load(), { scheme: "dark" }));
    ownReload();
    // The page went on without the switch, and the mark is not this load's to use.
    open();
    expect(load().scheme).toBe("dark");
    expect(session.has(FRESH_RELOAD_KEY)).toBe(false);
    // The visit after it, inside the mark's time, is the user's.
    open({ search: FRESH });
    expect(load()).toEqual(DEFAULT_STATE);
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
    session.set("i18nextLng", "tr");
    local.set(PLACE_KEY, LEFT);
    local.set(PREFS_KEY, JSON.stringify({ v: 1, handle: false }));
    local.set(KEYS_KEY, JSON.stringify({ v: 1, panel: "alt+shift+p" }));
    const kept = new Map(session);
    for (const search of ["", "?devknobs=stale", "?fresh"]) {
      // A mark a page in fresh mode left is all such a load drops.
      session.set(FRESH_RELOAD_KEY, asked(0));
      open({ search });
      expect(fresh()).toBe(false);
      expect(webStorage("local")).toBe(window.localStorage);
      expect(webStorage("session")).toBe(window.sessionStorage);

      const state = load();
      expect(state.scheme).toBe("dark");
      expect(state.panel.side).toBe("left");
      // One read of each storage, the stale mark dropped unread, and nothing looked through.
      expect(sessionCalls()).toBe(2);
      expect(localCalls()).toBe(1);
      expect(session).toEqual(kept);

      ownReload();
      expect(sessionCalls()).toBe(2);

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
