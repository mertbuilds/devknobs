import { afterEach, describe, expect, test } from "bun:test";
import {
  comboOf,
  comboProblem,
  createKeys,
  isReserved,
  KEYS_KEY,
  KEYS_VERSION,
  readKeys,
  recordStep,
  resolveKeys,
} from "../src/ui/bindings";
import { type Combo, comboText, defaultKeys, type KeyLike, parseCombo } from "../src/ui/keys";

function press(patch: Partial<KeyLike>): KeyLike {
  return {
    key: "k",
    code: "KeyK",
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    target: null,
    composedPath: () => [],
    ...patch,
  };
}

/** A binding's key as text, or null where it has none. */
function textOf(key: Combo | null): string | null {
  return key ? comboText(key) : null;
}

function combo(spec: string): Combo {
  const parsed = parseCombo(spec);
  if (!parsed) throw new Error(`no combo in ${spec}`);
  return parsed;
}

/** What a press records as, in its kept form, or the reason it is not taken. */
function recorded(patch: Partial<KeyLike>, others = defaultKeys()): string {
  const step = recordStep(press(patch), "panel", others);
  if (step.type === "keep") return comboText(step.combo);
  return step.type === "refuse" ? `refused: ${step.reason}` : step.type;
}

describe("recording a key", () => {
  test("keeps a letter with a modifier, in the kept form", () => {
    expect(recorded({ key: "˚", altKey: true })).toBe("alt+k");
    expect(recorded({ key: "K", shiftKey: true, metaKey: true })).toBe("meta+shift+k");
    expect(recorded({ key: "e", code: "KeyE", ctrlKey: true, shiftKey: true })).toBe(
      "ctrl+shift+e",
    );
  });

  test("refuses a bare key, as it types", () => {
    expect(recorded({ key: "k" })).toBe("refused: add a modifier, alone it types");
    expect(recorded({ key: "1", code: "Digit1" })).toBe("refused: add a modifier, alone it types");
  });

  test("keeps a function key alone or with modifiers", () => {
    expect(recorded({ key: "F2", code: "F2" })).toBe("f2");
    expect(recorded({ key: "F9", code: "F9", altKey: true })).toBe("alt+f9");
  });

  test("refuses what the browser keeps", () => {
    const reason = "refused: the browser uses it";
    for (const letter of [..."cvxzawrtqlnfps"]) {
      const code = `Key${letter.toUpperCase()}`;
      expect(recorded({ key: letter, code, metaKey: true })).toBe(reason);
      expect(recorded({ key: letter, code, ctrlKey: true, shiftKey: true })).toBe(reason);
    }
    expect(recorded({ key: "1", code: "Digit1", metaKey: true })).toBe(reason);
    expect(recorded({ key: "=", code: "Equal", ctrlKey: true })).toBe(reason);
    expect(recorded({ key: "F5", code: "F5" })).toBe(reason);
    expect(recorded({ key: "F5", code: "F5", shiftKey: true })).toBe(reason);
    expect(recorded({ key: "F12", code: "F12" })).toBe(reason);
    expect(recorded({ key: "F4", code: "F4", altKey: true })).toBe(reason);
  });

  test("refuses a key another binding has, and names it", () => {
    expect(recorded({ key: "G", code: "KeyG", shiftKey: true })).toBe("refused: used by grab");
    expect(recorded({ key: "R", code: "KeyR", shiftKey: true })).toBe(
      "refused: used by replay animations",
    );
    // Its own key is fine, and puts it back.
    expect(recorded({ key: "K", shiftKey: true })).toBe("shift+k");
  });

  test("a binding that is not listed takes no key", () => {
    const { panel, replay, reset } = defaultKeys();
    const noGrab = { panel, replay, reset };
    expect(recordStep(press({ key: "G", code: "KeyG", shiftKey: true }), "panel", noGrab)).toEqual({
      type: "keep",
      combo: combo("shift+g"),
    });
  });

  test("reads a letter the same with caps lock on", () => {
    // Caps lock and shift type the small letter.
    expect(recorded({ key: "k", shiftKey: true })).toBe("shift+k");
    expect(recorded({ key: "X", code: "KeyX", altKey: true })).toBe("alt+x");
  });

  test("keeps the letter typed, so a layout keeps it where its letters are", () => {
    // AZERTY types a where QWERTY has q.
    expect(recorded({ key: "A", code: "KeyQ", shiftKey: true })).toBe("shift+a");
    // A layout that is not latin keeps the letter of the key's place.
    expect(recorded({ key: "Л", code: "KeyK", shiftKey: true, altKey: true })).toBe(
      "alt+shift+k",
    );
    expect(recorded({ key: "П", code: "KeyG", ctrlKey: true })).toBe("ctrl+g");
  });

  test("keeps a digit by its place, and a symbol by what it types", () => {
    expect(recorded({ key: "!", code: "Digit1", shiftKey: true })).toBe("shift+1");
    expect(recorded({ key: "?", code: "Slash", shiftKey: true })).toBe("shift+?");
  });

  test("refuses the search's key, a plus and a dead key", () => {
    expect(recorded({ key: "/", code: "Slash", shiftKey: true, ctrlKey: false })).toBe(
      "refused: / opens the search",
    );
    // German: shift and 7 types `/`, which the search takes before any binding.
    expect(recorded({ key: "/", code: "Digit7", shiftKey: true })).toBe(
      "refused: / opens the search",
    );
    expect(recorded({ key: "/", code: "Digit7", shiftKey: true, altKey: true })).toBe(
      "alt+shift+7",
    );
    expect(recorded({ key: "+", code: "Equal", shiftKey: true })).toBe(
      "refused: use a letter, digit, symbol or F1 to F12",
    );
    expect(recorded({ key: "Dead", code: "BracketLeft", shiftKey: true })).toBe(
      "refused: use a letter, digit, symbol or F1 to F12",
    );
    expect(recorded({ key: "Enter", code: "Enter", shiftKey: true })).toBe(
      "refused: use a letter, digit, symbol or F1 to F12",
    );
  });

  test("reads Turkish İ as i", () => {
    expect(recorded({ key: "İ", code: "Quote", shiftKey: true })).toBe("shift+i");
  });

  test("refuses delete where another binding has backspace, as both match it", () => {
    const step = recordStep(press({ key: "Delete", shiftKey: true }), "grab", defaultKeys());
    expect(step).toEqual({ type: "refuse", reason: "used by reset" });
  });

  test("waits through a modifier alone or an IME, and escape or tab cancels", () => {
    expect(recorded({ key: "Shift", code: "ShiftLeft", shiftKey: true })).toBe("wait");
    expect(recorded({ key: "Meta", code: "MetaLeft", metaKey: true })).toBe("wait");
    expect(recorded({ key: "k", altKey: true, isComposing: true })).toBe("wait");
    expect(recorded({ key: "Escape", code: "Escape" })).toBe("cancel");
    expect(recorded({ key: "Tab", code: "Tab" })).toBe("cancel");
  });
});

describe("comboOf", () => {
  test("reads backspace and delete by name", () => {
    expect(comboOf(press({ key: "Backspace", code: "Backspace", altKey: true }))).toEqual(
      combo("alt+backspace"),
    );
  });
});

describe("isReserved", () => {
  test("a reserved letter needs meta or ctrl", () => {
    expect(isReserved(combo("meta+c"))).toBe(true);
    expect(isReserved(combo("shift+c"))).toBe(false);
    expect(isReserved(combo("alt+c"))).toBe(false);
    expect(isReserved(combo("meta+k"))).toBe(false);
  });
});

describe("comboProblem", () => {
  test("puts the default keys back without a problem", () => {
    const keys = defaultKeys();
    for (const binding of ["panel", "grab", "replay", "requests", "reset"] as const) {
      expect(comboProblem(keys[binding], binding, keys)).toBeNull();
    }
  });
});

describe("readKeys", () => {
  test("keeps the bindings that read, each in its kept form", () => {
    const json = JSON.stringify({ panel: "Option+Shift+K", grab: "shift+x", replay: "f2" });
    expect(readKeys(json)).toEqual({ panel: "alt+shift+k", grab: "shift+x", replay: "f2" });
  });

  test("drops what could not have been set in the panel", () => {
    const json = JSON.stringify({
      panel: "k",
      grab: "meta+c",
      replay: 7,
      reset: "shift+",
      other: "alt+k",
    });
    expect(readKeys(json)).toEqual({});
    expect(readKeys(JSON.stringify({ panel: "ctrl++" }))).toEqual({});
  });

  test("reads nothing from json that does not parse or is not an object", () => {
    expect(readKeys(null)).toEqual({});
    expect(readKeys("{")).toEqual({});
    expect(readKeys("[]")).toEqual({});
    expect(readKeys('"alt+k"')).toEqual({});
  });
});

describe("readKeys versions", () => {
  test("reads its own version and one kept before versions, and leaves a newer one alone", () => {
    const keys = { grab: "shift+x" };
    expect(readKeys(JSON.stringify({ v: KEYS_VERSION, ...keys }))).toEqual(keys);
    expect(readKeys(JSON.stringify(keys))).toEqual(keys);
    expect(readKeys(JSON.stringify({ v: KEYS_VERSION + 1, ...keys }))).toEqual({});
  });
});

describe("resolveKeys", () => {
  test("a key the user set wins over the mount's, which wins over the default", () => {
    const base = defaultKeys({ hotkey: "d", grabKey: "alt+shift+g" });
    const keys = resolveKeys(base, { panel: "alt+k" });
    expect(comboText(keys.panel)).toBe("alt+k");
    expect(textOf(keys.grab)).toBe("alt+shift+g");
    expect(textOf(keys.replay)).toBe("shift+r");
    expect(comboText(resolveKeys(base, {}).panel)).toBe("shift+d");
  });

  test("a set key wins over another binding's default, which is left with no key", () => {
    const keys = resolveKeys(defaultKeys(), { panel: "shift+g" });
    expect(comboText(keys.panel)).toBe("shift+g");
    expect(keys.grab).toBeNull();
  });

  test("a key set before another binding got it as its default stays the user's", () => {
    // Replay was on shift n before the requests log came with that default.
    const keys = resolveKeys(defaultKeys(), { replay: "shift+n" });
    expect(textOf(keys.replay)).toBe("shift+n");
    expect(keys.requests).toBeNull();
    // The binding left without one takes a key of its own, and can have its default back.
    const set = resolveKeys(defaultKeys(), { replay: "shift+n", requests: "alt+n" });
    expect([textOf(set.replay), textOf(set.requests)]).toEqual(["shift+n", "alt+n"]);
    expect(textOf(resolveKeys(defaultKeys(), {}).requests)).toBe("shift+n");
  });

  test("the panel always keeps a key: one set on it for another binding gives way", () => {
    const keys = resolveKeys(defaultKeys(), { replay: "shift+k" });
    expect(comboText(keys.panel)).toBe("shift+k");
    expect(textOf(keys.replay)).toBe("shift+r");
  });

  test("a set delete is a backspace, and takes it from the binding that had it by default", () => {
    const keys = resolveKeys(defaultKeys(), { grab: "shift+delete" });
    expect(textOf(keys.grab)).toBe("shift+delete");
    expect(keys.reset).toBeNull();
  });

  test("without grab, grab's key is free for another binding", () => {
    const keys = resolveKeys(defaultKeys(), { panel: "shift+g" }, false);
    expect(comboText(keys.panel)).toBe("shift+g");
    expect(textOf(keys.grab)).toBe("shift+g");
  });

  test("two set keys can swap", () => {
    const keys = resolveKeys(defaultKeys(), { panel: "shift+g", grab: "shift+k" });
    expect(comboText(keys.panel)).toBe("shift+g");
    expect(textOf(keys.grab)).toBe("shift+k");
  });

  test("two set keys that are the same: the first gives way to its base", () => {
    const keys = resolveKeys(defaultKeys(), { replay: "alt+x", reset: "alt+x" });
    expect([textOf(keys.replay), textOf(keys.reset)]).toEqual(["shift+r", "alt+x"]);
  });
});

/** A window with local storage the test can look into, and the storage events it listens for. */
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

describe("createKeys", () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, "window");
  });

  test("starts from the stored keys over the mount's", () => {
    const { local } = stubWindow();
    local.set(KEYS_KEY, JSON.stringify({ panel: "alt+k", grab: "k" }));
    const keys = createKeys({ hotkey: "d" });
    expect(comboText(keys.get().panel)).toBe("alt+k");
    expect(textOf(keys.get().grab)).toBe("shift+g");
    expect(keys.custom("panel")).toBe(true);
    expect(keys.custom("grab")).toBe(false);
    keys.destroy();
  });

  test("without grab, keeps grab's key set for the panel", () => {
    stubWindow();
    const keys = createKeys({ grab: false });
    keys.set("panel", combo("shift+g"));
    expect(comboText(keys.get().panel)).toBe("shift+g");
    expect(keys.custom("panel")).toBe(true);
    keys.destroy();
  });

  test("keeps a key set, and drops it when put back or set to its base", () => {
    const { local } = stubWindow();
    const keys = createKeys();
    let heard = 0;
    keys.subscribe(() => heard++);
    keys.set("grab", combo("shift+x"));
    expect(JSON.parse(local.get(KEYS_KEY) ?? "")).toEqual({ v: KEYS_VERSION, grab: "shift+x" });
    expect(textOf(keys.get().grab)).toBe("shift+x");
    keys.set("grab", null);
    expect(local.has(KEYS_KEY)).toBe(false);
    expect(textOf(keys.get().grab)).toBe("shift+g");
    keys.set("panel", combo("shift+k"));
    expect(local.has(KEYS_KEY)).toBe(false);
    expect(heard).toBe(3);
    keys.destroy();
  });

  test("hears a key another document of the origin set", () => {
    const { local, fire, listening } = stubWindow();
    const keys = createKeys();
    local.set(KEYS_KEY, JSON.stringify({ panel: "alt+k" }));
    fire("devknobs");
    expect(comboText(keys.get().panel)).toBe("shift+k");
    fire(KEYS_KEY);
    expect(comboText(keys.get().panel)).toBe("alt+k");
    keys.destroy();
    expect(listening()).toBe(0);
  });

  test("in fresh mode, a key set here holds through what another tab keeps", () => {
    const { local, fire } = stubWindow("?devknobs=fresh");
    const keys = createKeys();
    let heard = 0;
    keys.subscribe(() => heard++);
    keys.set("panel", combo("shift+j"));
    local.set(KEYS_KEY, JSON.stringify({ panel: "alt+k" }));
    fire(KEYS_KEY);
    fire(null);
    expect(comboText(keys.get().panel)).toBe("shift+j");
    expect(keys.custom("panel")).toBe(true);
    expect(heard).toBe(1);
    keys.destroy();
  });

  test("works without storage, the keys just do not stick", () => {
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
    const keys = createKeys();
    keys.set("panel", combo("alt+k"));
    expect(comboText(keys.get().panel)).toBe("alt+k");
    keys.destroy();
  });
});
