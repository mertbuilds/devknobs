import { afterEach, describe, expect, test } from "bun:test";
import { createPrefs, PREFS_KEY, PREFS_VERSION, readPrefs, resolvePrefs } from "../src/ui/prefs";

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

  test("reads its own version and one kept before versions, and leaves a newer one alone", () => {
    const prefs = { handle: false };
    expect(readPrefs(JSON.stringify({ v: PREFS_VERSION, ...prefs }))).toEqual(prefs);
    expect(readPrefs(JSON.stringify(prefs))).toEqual(prefs);
    expect(readPrefs(JSON.stringify({ v: PREFS_VERSION + 1, ...prefs }))).toEqual({});
  });
});

describe("resolvePrefs", () => {
  test("what the user set wins over the mount option", () => {
    expect(resolvePrefs({ handle: true }, { handle: false })).toEqual({ handle: false });
    expect(resolvePrefs({ handle: false }, { handle: true })).toEqual({ handle: true });
    expect(resolvePrefs({ handle: false }, {})).toEqual({ handle: false });
  });
});

function stubWindow(): {
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
