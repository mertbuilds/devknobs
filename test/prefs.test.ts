import { afterEach, describe, expect, test } from "bun:test";
import {
  createPrefs,
  type Prefs,
  PREFS_KEY,
  PREFS_VERSION,
  readPrefs,
  resolvePrefs,
} from "../src/ui/prefs";

/** A mount's preferences, with the widths a panel starts with. */
const BASE: Prefs = {
  handle: true,
  listWidth: 240,
  viewWidth: 340,
  stylesMode: "simple",
  stylesBox: true,
};

describe("readPrefs", () => {
  test("keeps a handle that is a boolean", () => {
    expect(readPrefs(JSON.stringify({ handle: false }))).toEqual({ handle: false });
    expect(readPrefs(JSON.stringify({ handle: true }))).toEqual({ handle: true });
  });

  test("drops what does not read", () => {
    expect(readPrefs(null)).toEqual({});
    expect(readPrefs("")).toEqual({});
    expect(readPrefs("{")).toEqual({});
    expect(readPrefs("[false]")).toEqual({});
    expect(readPrefs("false")).toEqual({});
    expect(readPrefs(JSON.stringify({ handle: "no", other: 1 }))).toEqual({});
  });

  test("keeps the widths that are numbers of px, each on its own", () => {
    expect(readPrefs(JSON.stringify({ listWidth: 300, viewWidth: 520 }))).toEqual({
      listWidth: 300,
      viewWidth: 520,
    });
    expect(readPrefs(JSON.stringify({ handle: false, viewWidth: 400 }))).toEqual({
      handle: false,
      viewWidth: 400,
    });
    expect(readPrefs(JSON.stringify({ listWidth: "300", viewWidth: 0 }))).toEqual({});
    expect(readPrefs(JSON.stringify({ listWidth: -4, viewWidth: null }))).toEqual({});
    expect(readPrefs('{"listWidth":1e999}')).toEqual({});
  });

  test("keeps a mode of the styles view that is one of the two", () => {
    expect(readPrefs(JSON.stringify({ stylesMode: "advanced" }))).toEqual({
      stylesMode: "advanced",
    });
    expect(readPrefs(JSON.stringify({ stylesMode: "simple" }))).toEqual({ stylesMode: "simple" });
    expect(readPrefs(JSON.stringify({ stylesMode: "expert" }))).toEqual({});
    expect(readPrefs(JSON.stringify({ stylesMode: true, handle: false }))).toEqual({
      handle: false,
    });
  });

  test("is at version 4, and takes up one kept at version 1, which had no widths", () => {
    expect(PREFS_VERSION).toBe(4);
    expect(readPrefs(JSON.stringify({ v: 1, handle: false }))).toEqual({ handle: false });
    expect(resolvePrefs(BASE, readPrefs(JSON.stringify({ v: 1, handle: false })))).toEqual({
      handle: false,
      listWidth: 240,
      viewWidth: 340,
      stylesMode: "simple",
      stylesBox: true,
    });
    expect(readPrefs(JSON.stringify({ v: 5, handle: false, listWidth: 300 }))).toEqual({});
  });

  test("takes up one kept at version 2, which had no mode: the styles view is simple", () => {
    const kept = JSON.stringify({ v: 2, handle: false, viewWidth: 500 });
    expect(readPrefs(kept)).toEqual({ handle: false, viewWidth: 500 });
    expect(resolvePrefs(BASE, readPrefs(kept))).toEqual({
      handle: false,
      listWidth: 240,
      viewWidth: 500,
      stylesMode: "simple",
      stylesBox: true,
    });
  });

  test("reads its own version and one kept before versions, and leaves a newer one alone", () => {
    const prefs = { handle: false };
    expect(readPrefs(JSON.stringify({ v: PREFS_VERSION, ...prefs }))).toEqual(prefs);
    expect(readPrefs(JSON.stringify(prefs))).toEqual(prefs);
    expect(readPrefs(JSON.stringify({ v: PREFS_VERSION + 1, ...prefs }))).toEqual({});
  });
});

describe("resolvePrefs", () => {
  test("what the user set wins over the mount option", () => {
    expect(resolvePrefs(BASE, { handle: false })).toEqual({ ...BASE, handle: false });
    expect(resolvePrefs({ ...BASE, handle: false }, { handle: true })).toEqual(BASE);
    expect(resolvePrefs({ ...BASE, handle: false }, {})).toEqual({ ...BASE, handle: false });
  });

  test("a width the user set wins over the one a panel starts with, each on its own", () => {
    expect(resolvePrefs(BASE, { viewWidth: 500 })).toEqual({ ...BASE, viewWidth: 500 });
    expect(resolvePrefs(BASE, { listWidth: 280 })).toEqual({ ...BASE, listWidth: 280 });
  });
});

function stubWindow(search = ""): {
  local: Map<string, string>;
  fire: (key: string | null) => void;
  listening: () => number;
} {
  const local = new Map<string, string>();
  const listeners = new Set<(event: { key: string | null }) => void>();
  const localStorage = {
    getItem: (key: string) => local.get(key) ?? null,
    setItem: (key: string, value: string) => {
      local.set(key, value);
    },
    removeItem: (key: string) => {
      local.delete(key);
    },
  };
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage,
      location: { search },
      addEventListener: (type: string, listener: (event: { key: string | null }) => void) => {
        if (type === "storage") listeners.add(listener);
      },
      removeEventListener: (type: string, listener: (event: { key: string | null }) => void) => {
        if (type === "storage") listeners.delete(listener);
      },
    },
  });
  return {
    local,
    fire: (key) => {
      for (const listener of listeners) listener({ key });
    },
    listening: () => listeners.size,
  };
}

describe("createPrefs", () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, "window");
  });

  test("shows the handle by default, and hides it for handle: false", () => {
    stubWindow();
    const shown = createPrefs();
    expect(shown.get().handle).toBe(true);
    const hidden = createPrefs({ handle: false });
    expect(hidden.get().handle).toBe(false);
    shown.destroy();
    hidden.destroy();
  });

  test("the stored choice wins over the mount option", () => {
    const { local } = stubWindow();
    local.set(PREFS_KEY, JSON.stringify({ handle: true }));
    const prefs = createPrefs({ handle: false });
    expect(prefs.get().handle).toBe(true);
    prefs.destroy();
  });

  test("keeps a choice, and drops it when set back to the mount's", () => {
    const { local } = stubWindow();
    const prefs = createPrefs();
    let heard = 0;
    prefs.subscribe(() => heard++);
    prefs.setHandle(false);
    expect(JSON.parse(local.get(PREFS_KEY) ?? "")).toEqual({ v: PREFS_VERSION, handle: false });
    expect(prefs.get().handle).toBe(false);
    prefs.setHandle(true);
    expect(local.has(PREFS_KEY)).toBe(false);
    expect(prefs.get().handle).toBe(true);
    expect(heard).toBe(2);
    prefs.destroy();
  });

  test("starts 240 wide, and 340 with a view", () => {
    stubWindow();
    const prefs = createPrefs();
    expect(prefs.get()).toMatchObject({ listWidth: 240, viewWidth: 340 });
    prefs.destroy();
  });

  test("keeps each width, beside the other and the handle, and drops one set back", () => {
    const { local } = stubWindow();
    const prefs = createPrefs();
    let heard = 0;
    prefs.subscribe(() => heard++);
    prefs.setWidth("view", 500);
    expect(JSON.parse(local.get(PREFS_KEY) ?? "")).toEqual({ v: PREFS_VERSION, viewWidth: 500 });
    prefs.setWidth("list", 280);
    prefs.setHandle(false);
    expect(JSON.parse(local.get(PREFS_KEY) ?? "")).toEqual({
      v: PREFS_VERSION,
      handle: false,
      listWidth: 280,
      viewWidth: 500,
    });
    expect(prefs.get()).toEqual({
      handle: false,
      listWidth: 280,
      viewWidth: 500,
      stylesMode: "simple",
      stylesBox: true,
    });
    prefs.setWidth("view", 340);
    prefs.setWidth("list", 240);
    expect(JSON.parse(local.get(PREFS_KEY) ?? "")).toEqual({ v: PREFS_VERSION, handle: false });
    prefs.setHandle(true);
    expect(local.has(PREFS_KEY)).toBe(false);
    expect(heard).toBe(6);
    prefs.destroy();
  });

  test("reads the widths that were kept", () => {
    const { local } = stubWindow();
    local.set(PREFS_KEY, JSON.stringify({ v: 2, listWidth: 300, viewWidth: 600 }));
    const prefs = createPrefs();
    expect(prefs.get()).toEqual({
      handle: true,
      listWidth: 300,
      viewWidth: 600,
      stylesMode: "simple",
      stylesBox: true,
    });
    prefs.destroy();
  });

  test("in fresh mode the widths are a first visit's, and one set here is not written", () => {
    const { local } = stubWindow("?devknobs=fresh");
    const kept = JSON.stringify({ v: 2, listWidth: 300, viewWidth: 600 });
    local.set(PREFS_KEY, kept);
    const prefs = createPrefs();
    expect(prefs.get()).toMatchObject({ listWidth: 240, viewWidth: 340 });
    prefs.setWidth("view", 480);
    prefs.setWidth("list", 260);
    expect(prefs.get()).toMatchObject({ listWidth: 260, viewWidth: 480 });
    expect(local.get(PREFS_KEY)).toBe(kept);
    prefs.destroy();
  });

  test("the styles view is simple by default, and its mode is kept and dropped when set back", () => {
    const { local } = stubWindow();
    const prefs = createPrefs();
    let heard = 0;
    prefs.subscribe(() => heard++);
    expect(prefs.get().stylesMode).toBe("simple");
    prefs.setStylesMode("advanced");
    expect(JSON.parse(local.get(PREFS_KEY) ?? "")).toEqual({ v: 4, stylesMode: "advanced" });
    expect(prefs.get().stylesMode).toBe("advanced");
    prefs.destroy();
    const next = createPrefs();
    expect(next.get().stylesMode).toBe("advanced");
    next.setStylesMode("simple");
    expect(local.has(PREFS_KEY)).toBe(false);
    expect(next.get().stylesMode).toBe("simple");
    expect(heard).toBe(1);
    next.destroy();
  });

  test("in fresh mode the styles view is simple, and a mode set here is not written", () => {
    const { local } = stubWindow("?devknobs=fresh");
    const kept = JSON.stringify({ v: 3, stylesMode: "advanced" });
    local.set(PREFS_KEY, kept);
    const prefs = createPrefs();
    expect(prefs.get().stylesMode).toBe("simple");
    prefs.setStylesMode("advanced");
    expect(prefs.get().stylesMode).toBe("advanced");
    prefs.setStylesMode("simple");
    expect(local.get(PREFS_KEY)).toBe(kept);
    prefs.destroy();
    const { local: empty } = stubWindow("?devknobs=fresh");
    const first = createPrefs();
    first.setStylesMode("advanced");
    expect(empty.size).toBe(0);
    first.destroy();
  });

  test("hears a choice another document of the origin made", () => {
    const { local, fire, listening } = stubWindow();
    const prefs = createPrefs();
    local.set(PREFS_KEY, JSON.stringify({ handle: false }));
    fire("devknobs:keys");
    expect(prefs.get().handle).toBe(true);
    fire(PREFS_KEY);
    expect(prefs.get().handle).toBe(false);
    prefs.destroy();
    expect(listening()).toBe(0);
  });

  test("in fresh mode, a choice made here holds through what another tab keeps", () => {
    const { local, fire } = stubWindow("?devknobs=fresh");
    const prefs = createPrefs();
    let heard = 0;
    prefs.subscribe(() => heard++);
    prefs.setHandle(false);
    local.set(PREFS_KEY, JSON.stringify({ handle: true }));
    fire(PREFS_KEY);
    fire(null);
    expect(prefs.get().handle).toBe(false);
    expect(heard).toBe(1);
    prefs.destroy();
  });

  test("works without storage, the choice just does not stick", () => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        get localStorage(): Storage {
          throw new Error("denied");
        },
        addEventListener: () => {},
        removeEventListener: () => {},
      },
    });
    const prefs = createPrefs();
    prefs.setHandle(false);
    expect(prefs.get().handle).toBe(false);
    prefs.destroy();
  });
});
