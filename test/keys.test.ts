import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  comboLabel,
  comboMatches,
  comboText,
  defaultKeys,
  type EscapeScene,
  escapeStep,
  forwardKeys,
  highlightAt,
  hotkeyOf,
  isSearchKey,
  KEYS_FIELD,
  keyAction,
  type KeyLike,
  letterMatches,
  paletteMove,
  parseCombo,
  radioMove,
  typeAhead,
  typesInField,
  withShift,
  zoomAction,
} from "../src/ui/keys";

/** The default keys with shift and `letter` for the panel. */
function hot(letter: string) {
  return defaultKeys({ hotkey: letter });
}

function key(patch: Partial<KeyLike>): KeyLike {
  return {
    key: "k",
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    target: null,
    composedPath: () => [],
    ...patch,
  };
}

/** Just enough of an element for the editable check. */
function element(tagName: string, isContentEditable = false, keys = false): EventTarget {
  const hasAttribute = (name: string) => keys && name === KEYS_FIELD;
  return { tagName, isContentEditable, hasAttribute } as unknown as EventTarget;
}

/** Shift and a key, as the browser sends it with caps lock off. */
function shifted(patch: Partial<KeyLike>): KeyLike {
  return key({ key: "K", shiftKey: true, ...patch });
}

describe("hotkeyOf", () => {
  test("defaults to k and lower cases the rest", () => {
    expect(hotkeyOf()).toBe("k");
    expect(hotkeyOf("D")).toBe("d");
  });
});

describe("parseCombo", () => {
  test("reads modifiers by any of their names, and one key", () => {
    expect(parseCombo("Cmd + Option + K")).toEqual({
      meta: true,
      ctrl: false,
      shift: false,
      alt: true,
      key: "k",
    });
    expect(parseCombo("shift+F5")).toEqual({ ...withShift("f5") });
  });

  test("reads nothing for no key, two keys or an empty part", () => {
    expect(parseCombo(undefined)).toBeNull();
    expect(parseCombo(" ")).toBeNull();
    expect(parseCombo("alt+shift")).toBeNull();
    expect(parseCombo("a+b")).toBeNull();
    expect(parseCombo("ctrl++")).toBeNull();
  });
});

describe("comboText", () => {
  test("writes the modifiers in one order, so one key reads one way", () => {
    expect(comboText(withShift("k"))).toBe("shift+k");
    const parsed = parseCombo("shift+K+meta");
    expect(parsed && comboText(parsed)).toBe("meta+shift+k");
    const all = parseCombo("shift+alt+ctrl+cmd+x");
    expect(all && comboText(all)).toBe("meta+ctrl+alt+shift+x");
  });
});

describe("comboLabel", () => {
  const label = (spec: string, mac: boolean) => {
    const combo = parseCombo(spec);
    return combo ? comboLabel(combo, mac) : null;
  };

  test("reads as the platform writes shortcuts", () => {
    expect(label("shift+k", true)).toBe("⇧K");
    expect(label("shift+r", false)).toBe("Shift R");
    expect(label("meta+c", true)).toBe("⌘C");
    expect(label("ctrl+c", false)).toBe("Ctrl C");
    expect(label("alt+shift+g", true)).toBe("⌥⇧G");
    expect(label("alt+shift+g", false)).toBe("Alt Shift G");
    expect(label("meta+ctrl+alt+shift+k", true)).toBe("⌃⌥⇧⌘K");
  });

  test("names the keys that are not letters", () => {
    expect(label("shift+backspace", true)).toBe("⇧⌫");
    expect(label("shift+backspace", false)).toBe("Shift Backspace");
    expect(label("alt+delete", true)).toBe("⌥⌦");
    expect(label("f2", true)).toBe("F2");
    expect(label("ctrl+f2", false)).toBe("Ctrl F2");
    expect(label("shift+?", true)).toBe("⇧?");
  });
});

describe("comboMatches", () => {
  test("takes shift and the letter, in either case for caps lock", () => {
    expect(comboMatches(shifted({}), withShift("k"))).toBe(true);
    expect(comboMatches(shifted({ key: "k" }), withShift("k"))).toBe(true);
    expect(comboMatches(shifted({ key: "D" }), withShift("k"))).toBe(false);
  });

  test("takes the letter's place on a layout that is not latin", () => {
    expect(comboMatches(shifted({ key: "Л", code: "KeyK" }), withShift("k"))).toBe(true);
    expect(comboMatches(shifted({ key: "D", code: "KeyK" }), withShift("k"))).toBe(false);
  });

  test("leaves a key that types another latin letter, a dead key or an IME's to the page", () => {
    // Colemak types e in k's place, Turkish F types ü in g's.
    expect(comboMatches(shifted({ key: "E", code: "KeyK" }), withShift("k"))).toBe(false);
    expect(comboMatches(shifted({ key: "Ü", code: "KeyK" }), withShift("k"))).toBe(false);
    expect(comboMatches(shifted({ key: "Process", code: "KeyK" }), withShift("k"))).toBe(false);
    expect(comboMatches(shifted({ key: "Dead", code: "KeyK" }), withShift("k"))).toBe(false);
    expect(comboMatches(shifted({ isComposing: true }), withShift("k"))).toBe(false);
  });

  test("needs shift and no other modifier", () => {
    expect(comboMatches(key({ key: "k" }), withShift("k"))).toBe(false);
    for (const modifier of ["altKey", "ctrlKey", "metaKey"] as const) {
      expect(comboMatches(shifted({ [modifier]: true }), withShift("k"))).toBe(false);
    }
  });

  test("takes an option letter by its place, as a Mac types another character there", () => {
    const altK = parseCombo("alt+k");
    if (!altK) throw new Error("no combo");
    expect(comboMatches(key({ key: "˚", code: "KeyK", altKey: true }), altK)).toBe(true);
    expect(comboMatches(key({ key: "ß", code: "KeyS", altKey: true }), { ...altK, key: "s" })).toBe(
      true,
    );
    expect(comboMatches(key({ key: "k", code: "KeyK" }), altK)).toBe(false);
  });

  test("takes a digit by its place, a function key and backspace by name, delete as backspace", () => {
    const shift1 = withShift("1");
    expect(comboMatches(shifted({ key: "!", code: "Digit1" }), shift1)).toBe(true);
    expect(comboMatches(key({ key: "F2", code: "F2" }), { ...withShift("f2"), shift: false })).toBe(
      true,
    );
    const reset = withShift("backspace");
    expect(comboMatches(shifted({ key: "Backspace" }), reset)).toBe(true);
    expect(comboMatches(shifted({ key: "Delete" }), reset)).toBe(true);
  });
});

describe("letterMatches", () => {
  test("takes the letter, or a letter that is not latin in its place", () => {
    expect(letterMatches({ key: "G", code: "KeyT" }, "g")).toBe(true);
    expect(letterMatches({ key: "п", code: "KeyG" }, "g")).toBe(true);
    expect(letterMatches({ key: "Σ", code: "KeyS" }, "s")).toBe(true);
  });

  test("reads Turkish İ as i", () => {
    expect(letterMatches({ key: "İ", code: "Quote" }, "i")).toBe(true);
    expect(comboMatches(shifted({ key: "İ", code: "Quote" }), withShift("i"))).toBe(true);
  });

  test("leaves a latin letter in another place, a dead key and an IME's key", () => {
    expect(letterMatches({ key: "d", code: "KeyG" }, "g")).toBe(false);
    expect(letterMatches({ key: "i", code: "KeyG" }, "g")).toBe(false);
    expect(letterMatches({ key: "ü", code: "KeyG" }, "g")).toBe(false);
    expect(letterMatches({ key: "Process", code: "KeyG" }, "g")).toBe(false);
    expect(letterMatches({ key: "Dead", code: "KeyG" }, "g")).toBe(false);
  });
});

describe("typesInField", () => {
  test("a field of the page, or of the panel unmarked, takes the key", () => {
    expect(typesInField(key({ target: element("INPUT") }))).toBe(true);
    expect(typesInField(key({ target: element("SELECT") }))).toBe(true);
    expect(typesInField(key({ composedPath: () => [element("TEXTAREA")] }))).toBe(true);
    expect(typesInField(key({ target: element("DIV", true) }))).toBe(true);
  });

  test("the panel's search and anything not a field do not", () => {
    expect(typesInField(key({ composedPath: () => [element("INPUT", false, true)] }))).toBe(false);
    expect(typesInField(key({ target: element("DIV") }))).toBe(false);
    expect(typesInField(key({}))).toBe(false);
  });

  describe("with the focus in a closed shadow root", () => {
    const names = ["HTMLElement", "Document", "ShadowRoot"] as const;

    beforeEach(() => {
      for (const name of names) {
        Object.defineProperty(globalThis, name, { configurable: true, value: class {} });
      }
    });

    afterEach(() => {
      for (const name of names) Reflect.deleteProperty(globalThis, name);
    });

    /** A page element as the event shows it, the root it sits in and that root's focus. */
    function scene(
      patch: { tagName?: string; tabindex?: string; tabIndex?: number; active?: boolean } = {},
    ) {
      const root: { activeElement: unknown; body: unknown; documentElement: unknown } =
        Object.assign(new Document(), { activeElement: null, body: null, documentElement: null });
      const host = Object.assign(new HTMLElement(), {
        tagName: patch.tagName ?? "MY-FIELD",
        isContentEditable: false,
        shadowRoot: null,
        tabIndex: patch.tabIndex ?? -1,
        hasAttribute: (name: string) => name === "tabindex" && patch.tabindex !== undefined,
        getRootNode: () => root,
      });
      if (patch.active !== false) root.activeElement = host;
      return { root, host };
    }

    test("an element that cannot take the focus yet has it hides a field", () => {
      const { host } = scene();
      expect(typesInField(key({ composedPath: () => [host] }))).toBe(true);
      expect(keyAction(shifted({ composedPath: () => [host] }), hot("k"))).toBeNull();
    });

    test("one that takes the focus, does not have it, or is the body does not", () => {
      for (const patch of [{ tabIndex: 0 }, { tabindex: "-1" }, { active: false }]) {
        const { host } = scene(patch);
        expect(typesInField(key({ composedPath: () => [host] }))).toBe(false);
      }
      const { root, host } = scene();
      root.body = host;
      expect(typesInField(key({ composedPath: () => [host] }))).toBe(false);
    });

    test("a plain element with the focus, such as a scroll box, does not", () => {
      const { host } = scene({ tagName: "DIV" });
      expect(typesInField(key({ composedPath: () => [host] }))).toBe(false);
      expect(keyAction(shifted({ composedPath: () => [host] }), hot("k"))).toBe("toggle");
    });
  });
});

describe("keyAction", () => {
  test("toggles on shift and the hotkey, caps lock or not", () => {
    expect(keyAction(shifted({}), hot("k"))).toBe("toggle");
    expect(keyAction(shifted({ key: "k" }), hot("k"))).toBe("toggle");
    expect(keyAction(shifted({ key: "D" }), hot("k"))).toBeNull();
    expect(keyAction(shifted({ key: "D" }), hot("d"))).toBe("toggle");
  });

  test("leaves the bare hotkey and the bare r alone", () => {
    expect(keyAction(key({ key: "k" }), hot("k"))).toBeNull();
    expect(keyAction(key({ key: "K" }), hot("k"))).toBeNull();
    expect(keyAction(key({ key: "r" }), hot("k"))).toBeNull();
  });

  test("closes on escape, even with a modifier or in a field", () => {
    expect(keyAction(key({ key: "Escape" }), hot("k"))).toBe("close");
    expect(keyAction(key({ key: "Escape", shiftKey: true }), hot("k"))).toBe("close");
    expect(keyAction(key({ key: "Escape", target: element("INPUT") }), hot("k"))).toBe("close");
  });

  test("leaves the hotkey alone with another modifier", () => {
    expect(keyAction(shifted({ altKey: true }), hot("k"))).toBeNull();
    expect(keyAction(shifted({ ctrlKey: true }), hot("k"))).toBeNull();
    expect(keyAction(shifted({ metaKey: true }), hot("k"))).toBeNull();
  });

  test("replays on shift r, caps lock or not, and resets on shift backspace or delete", () => {
    expect(keyAction(shifted({ key: "R" }), hot("k"))).toBe("replay");
    expect(keyAction(shifted({ key: "r" }), hot("k"))).toBe("replay");
    expect(keyAction(key({ key: "Backspace", shiftKey: true }), hot("k"))).toBe("reset");
    expect(keyAction(key({ key: "Delete", shiftKey: true }), hot("k"))).toBe("reset");
  });

  test("backspace alone does nothing", () => {
    expect(keyAction(key({ key: "Backspace" }), hot("k"))).toBeNull();
    expect(keyAction(key({ key: "Delete" }), hot("k"))).toBeNull();
  });

  test("leaves shift r alone with another modifier, so hard reload stays the browser's", () => {
    expect(keyAction(shifted({ key: "R", metaKey: true }), hot("k"))).toBeNull();
    expect(keyAction(shifted({ key: "R", ctrlKey: true }), hot("k"))).toBeNull();
    expect(keyAction(shifted({ key: "R", altKey: true }), hot("k"))).toBeNull();
    expect(keyAction(key({ key: "r", metaKey: true }), hot("k"))).toBeNull();
  });

  test("leaves reset alone with another modifier", () => {
    for (const modifier of ["altKey", "ctrlKey", "metaKey"] as const) {
      for (const name of ["Backspace", "Delete"]) {
        expect(keyAction(key({ key: name, shiftKey: true, [modifier]: true }), hot("k"))).toBeNull();
      }
    }
  });

  test("leaves the keys to a field of the page, so shift types a capital", () => {
    for (const tag of ["INPUT", "TEXTAREA", "SELECT"]) {
      expect(keyAction(shifted({ target: element(tag) }), hot("k"))).toBeNull();
      expect(keyAction(shifted({ key: "R", target: element(tag) }), hot("k"))).toBeNull();
      const reset = key({ key: "Backspace", shiftKey: true, target: element(tag) });
      expect(keyAction(reset, hot("k"))).toBeNull();
    }
    expect(keyAction(shifted({ target: element("DIV", true) }), hot("k"))).toBeNull();
    expect(keyAction(shifted({ composedPath: () => [element("INPUT")] }), hot("k"))).toBeNull();
    expect(keyAction(shifted({ target: element("DIV") }), hot("k"))).toBe("toggle");
  });

  test("takes the shift letters in the panel's search, where backspace still deletes", () => {
    const search = () => [element("INPUT", false, true)];
    expect(keyAction(shifted({ composedPath: search }), hot("k"))).toBe("toggle");
    expect(keyAction(shifted({ key: "R", composedPath: search }), hot("k"))).toBe("replay");
    expect(keyAction(key({ key: "k", composedPath: search }), hot("k"))).toBeNull();
    expect(keyAction(key({ key: "r", composedPath: search }), hot("k"))).toBeNull();
    const reset = key({ key: "Backspace", shiftKey: true, composedPath: search });
    expect(keyAction(reset, hot("k"))).toBeNull();
  });

  test("takes the keys the user set, and lets the old ones go", () => {
    const altK = parseCombo("alt+k");
    const f2 = parseCombo("f2");
    if (!altK || !f2) throw new Error("no combo");
    const keys = { ...hot("k"), panel: altK, replay: f2 };
    expect(keyAction(key({ key: "˚", code: "KeyK", altKey: true }), keys)).toBe("toggle");
    expect(keyAction(shifted({}), keys)).toBeNull();
    expect(keyAction(key({ key: "F2" }), keys)).toBe("replay");
    expect(keyAction(shifted({ key: "R" }), keys)).toBeNull();
  });

  test("a set key with alt, ctrl or meta stays a page field's, and is the panel's in its search", () => {
    const altK = parseCombo("alt+k");
    if (!altK) throw new Error("no combo");
    const keys = { ...hot("k"), panel: altK };
    const press = { key: "˚", code: "KeyK", altKey: true };
    expect(keyAction(key({ ...press, target: element("INPUT") }), keys)).toBeNull();
    const search = () => [element("INPUT", false, true)];
    expect(keyAction(key({ ...press, composedPath: search }), keys)).toBe("toggle");
  });

  test("a function key types nothing, so it is the panel's in a field too", () => {
    const f2 = parseCombo("f2");
    if (!f2) throw new Error("no combo");
    const keys = { ...hot("k"), panel: f2 };
    expect(keyAction(key({ key: "F2", target: element("INPUT") }), keys)).toBe("toggle");
  });

  test("the hotkey wins over replay where they are the same key", () => {
    expect(keyAction(shifted({ key: "R" }), hot("r"))).toBe("toggle");
    expect(keyAction(key({ key: "Backspace", shiftKey: true }), hot("r"))).toBe("reset");
  });
});

describe("isSearchKey", () => {
  test("takes the slash, shift included for layouts that need it", () => {
    expect(isSearchKey(key({ key: "/" }))).toBe(true);
    expect(isSearchKey(key({ key: "/", shiftKey: true }))).toBe(true);
  });

  test("leaves every other key to the page", () => {
    expect(isSearchKey(key({ key: "o" }))).toBe(false);
    expect(isSearchKey(key({ key: "K", shiftKey: true }))).toBe(false);
    expect(isSearchKey(key({ key: "+" }))).toBe(false);
    expect(isSearchKey(key({ key: " " }))).toBe(false);
    expect(isSearchKey(key({ key: "Enter" }))).toBe(false);
  });

  test("leaves the slash alone with a modifier", () => {
    expect(isSearchKey(key({ key: "/", metaKey: true }))).toBe(false);
    expect(isSearchKey(key({ key: "/", ctrlKey: true }))).toBe(false);
    expect(isSearchKey(key({ key: "/", altKey: true }))).toBe(false);
  });

  test("leaves typing in a field alone", () => {
    expect(isSearchKey(key({ key: "/", target: element("INPUT") }))).toBe(false);
    expect(isSearchKey(key({ key: "/", composedPath: () => [element("TEXTAREA")] }))).toBe(false);
    expect(isSearchKey(key({ key: "/", target: element("DIV", true) }))).toBe(false);
  });
});

describe("typeAhead", () => {
  test("a character on one of the panel's controls is typed into the search", () => {
    const control = element("BUTTON");
    expect(typeAhead(key({ key: "d", target: control }))).toBe("d");
    expect(typeAhead(key({ key: "D", shiftKey: true, composedPath: () => [control] }))).toBe("D");
    expect(typeAhead(key({ key: "4", target: control }))).toBe("4");
    expect(typeAhead(key({ key: "ı", target: control }))).toBe("ı");
  });

  test("a space presses the control, and the slash opens the search empty", () => {
    expect(typeAhead(key({ key: " " }))).toBeNull();
    expect(typeAhead(key({ key: "/" }))).toBeNull();
  });

  test("named keys, modifiers and an IME type nothing", () => {
    expect(typeAhead(key({ key: "ArrowDown" }))).toBeNull();
    expect(typeAhead(key({ key: "Enter" }))).toBeNull();
    expect(typeAhead(key({ key: "Dead" }))).toBeNull();
    expect(typeAhead(key({ key: "d", metaKey: true }))).toBeNull();
    expect(typeAhead(key({ key: "d", ctrlKey: true }))).toBeNull();
    expect(typeAhead(key({ key: "d", altKey: true }))).toBeNull();
    expect(typeAhead(key({ key: "d", isComposing: true }))).toBeNull();
  });

  test("a field types its own", () => {
    expect(typeAhead(key({ key: "d", target: element("INPUT") }))).toBeNull();
    expect(typeAhead(key({ key: "d", composedPath: () => [element("TEXTAREA")] }))).toBeNull();
    expect(typeAhead(key({ key: "d", target: element("INPUT", false, true) }))).toBeNull();
  });
});

describe("zoomAction", () => {
  test("zooms in on plus, out on minus and back to fit on 0, with meta or ctrl", () => {
    expect(zoomAction(key({ key: "=", metaKey: true }))).toBe("zoom-in");
    expect(zoomAction(key({ key: "+", metaKey: true, shiftKey: true }))).toBe("zoom-in");
    expect(zoomAction(key({ key: "-", ctrlKey: true }))).toBe("zoom-out");
    expect(zoomAction(key({ key: "_", ctrlKey: true, shiftKey: true }))).toBe("zoom-out");
    expect(zoomAction(key({ key: "0", metaKey: true }))).toBe("zoom-fit");
  });

  test("leaves the keys alone without meta or ctrl, with alt, and for other keys", () => {
    expect(zoomAction(key({ key: "=" }))).toBeNull();
    expect(zoomAction(key({ key: "0", shiftKey: true }))).toBeNull();
    expect(zoomAction(key({ key: "0", metaKey: true, altKey: true }))).toBeNull();
    expect(zoomAction(key({ key: "9", metaKey: true }))).toBeNull();
    expect(zoomAction(key({ key: "k", metaKey: true }))).toBeNull();
  });

  test("leaves them to the browser while typing, but not on a select", () => {
    expect(zoomAction(key({ key: "0", metaKey: true, target: element("INPUT") }))).toBeNull();
    const typing = { key: "-", ctrlKey: true, composedPath: () => [element("TEXTAREA")] };
    expect(zoomAction(key(typing))).toBeNull();
    expect(zoomAction(key({ key: "=", metaKey: true, target: element("DIV", true) }))).toBeNull();
    expect(zoomAction(key({ key: "0", metaKey: true, target: element("SELECT") }))).toBe(
      "zoom-fit",
    );
  });
});

describe("escapeStep", () => {
  const idle: EscapeScene = { search: false, filter: false, editor: false };

  test("leaves the search in one step, query and all", () => {
    expect(escapeStep({ ...idle, search: true })).toBe("search");
    expect(escapeStep({ search: true, filter: true, editor: true })).toBe("search");
  });

  test("then clears a list filter, then closes the editor", () => {
    expect(escapeStep({ ...idle, filter: true, editor: true })).toBe("filter");
    expect(escapeStep({ ...idle, editor: true })).toBe("editor");
  });

  test("leaves the shortcuts before an editor", () => {
    expect(escapeStep({ ...idle, keys: true, editor: true })).toBe("keys");
  });

  test("leaves a search opened from the settings before the settings", () => {
    expect(escapeStep({ ...idle, search: true, keys: true })).toBe("search");
  });

  test("closes the panel when nothing else is open", () => {
    expect(escapeStep(idle)).toBe("panel");
  });
});

describe("highlightAt", () => {
  test("a new query puts the highlight back on the first entry", () => {
    expect(highlightAt(4, 10, true)).toBe(0);
    expect(highlightAt(0, 3, true)).toBe(0);
  });

  test("the same query keeps it where it was, inside the entries", () => {
    expect(highlightAt(4, 10)).toBe(4);
    expect(highlightAt(4, 3)).toBe(2);
    expect(highlightAt(-1, 3)).toBe(0);
  });

  test("no entries, nothing highlighted", () => {
    expect(highlightAt(0, 0, true)).toBe(-1);
    expect(highlightAt(2, 0)).toBe(-1);
  });
});

describe("paletteMove", () => {
  test("the arrows move the highlight one entry, held at the ends", () => {
    expect(paletteMove("ArrowDown", 0, 3)).toEqual({ cursor: 1, pick: false });
    expect(paletteMove("ArrowUp", 1, 3)).toEqual({ cursor: 0, pick: false });
    expect(paletteMove("ArrowDown", 2, 3)).toEqual({ cursor: 2, pick: false });
    expect(paletteMove("ArrowUp", 0, 3)).toEqual({ cursor: 0, pick: false });
  });

  test("enter picks the highlighted entry", () => {
    expect(paletteMove("Enter", 0, 3)).toEqual({ cursor: 0, pick: true });
    expect(paletteMove("Enter", 2, 3)).toEqual({ cursor: 2, pick: true });
  });

  test("enter picks nothing with no entries", () => {
    expect(paletteMove("Enter", 0, 0)).toEqual({ cursor: -1, pick: false });
  });

  test("other keys are the field's", () => {
    expect(paletteMove("a", 0, 3)).toBeNull();
    expect(paletteMove("ArrowLeft", 0, 3)).toBeNull();
    expect(paletteMove("Tab", 0, 3)).toBeNull();
  });
});

describe("radioMove", () => {
  test("right and down go to the next choice, round past the end", () => {
    expect(radioMove("ArrowRight", 0, 3)).toBe(1);
    expect(radioMove("ArrowDown", 1, 3)).toBe(2);
    expect(radioMove("ArrowRight", 2, 3)).toBe(0);
  });

  test("left and up go to the one before, round past the start", () => {
    expect(radioMove("ArrowLeft", 2, 3)).toBe(1);
    expect(radioMove("ArrowUp", 0, 3)).toBe(2);
  });

  test("home and end go to the ends, other keys nowhere", () => {
    expect(radioMove("Home", 2, 3)).toBe(0);
    expect(radioMove("End", 0, 3)).toBe(2);
    expect(radioMove("Enter", 0, 3)).toBeNull();
    expect(radioMove("ArrowRight", 0, 0)).toBeNull();
  });
});

describe("forwardKeys", () => {
  /** What the frame posted to the page above, and where to. */
  const posted: unknown[][] = [];
  let listener: ((event: KeyLike) => void) | null = null;

  beforeEach(() => {
    posted.length = 0;
    listener = null;
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        parent: {
          postMessage: (message: unknown, target: string) => posted.push([message, target]),
        },
        addEventListener: (type: string, handler: (event: KeyLike) => void, capture: boolean) => {
          if (type === "keydown" && capture) listener = handler;
        },
        removeEventListener: (type: string, handler: unknown, capture: boolean) => {
          if (type === "keydown" && capture && handler === listener) listener = null;
        },
      },
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, "window");
  });

  test("posts the panel's keys up, on this origin only, and keeps them from the browser", () => {
    forwardKeys(() => hot("d"));
    let prevented = 0;
    const send = (event: KeyLike) =>
      listener?.(Object.assign(event, { preventDefault: () => prevented++ }));
    send(shifted({ key: "D" }));
    send(key({ key: "Escape" }));
    send(key({ key: "d" }));
    send(shifted({ key: "K" }));
    send(shifted({ key: "D", target: element("INPUT") }));
    send(shifted({ key: "R" }));
    send(key({ key: "r" }));
    send(key({ key: "Backspace", shiftKey: true }));
    send(shifted({ key: "R", target: element("INPUT") }));
    send(key({ key: "Backspace", shiftKey: true, target: element("TEXTAREA") }));
    send(shifted({ key: "R", metaKey: true }));
    expect(prevented).toBe(3);
    expect(posted).toEqual([
      [{ source: "devknobs", type: "key", action: "toggle" }, "/"],
      [{ source: "devknobs", type: "key", action: "close" }, "/"],
      [{ source: "devknobs", type: "key", action: "replay" }, "/"],
      [{ source: "devknobs", type: "key", action: "reset" }, "/"],
    ]);
  });

  test("posts the zoom keys up too, and keeps them from the browser's own zoom", () => {
    forwardKeys();
    let prevented = 0;
    const zoomKey = (patch: Partial<KeyLike>) =>
      Object.assign(key({ metaKey: true, ...patch }), { preventDefault: () => prevented++ });
    listener?.(zoomKey({ key: "=" }));
    listener?.(zoomKey({ key: "0" }));
    listener?.(zoomKey({ key: "-", target: element("INPUT") }));
    listener?.(zoomKey({ key: "r" }));
    expect(posted).toEqual([
      [{ source: "devknobs", type: "key", action: "zoom-in" }, "/"],
      [{ source: "devknobs", type: "key", action: "zoom-fit" }, "/"],
    ]);
    expect(prevented).toBe(2);
  });

  test("posts / up to focus the search while the panel is open, and types it nowhere", () => {
    let open = true;
    forwardKeys(undefined, () => open);
    let prevented = 0;
    const slash = (patch: Partial<KeyLike> = {}) =>
      Object.assign(key({ key: "/", ...patch }), { preventDefault: () => prevented++ });
    listener?.(slash());
    listener?.(slash({ shiftKey: true }));
    listener?.(slash({ target: element("INPUT") }));
    listener?.(slash({ target: element("DIV", true) }));
    listener?.(slash({ metaKey: true }));
    open = false;
    listener?.(slash());
    expect(posted).toEqual([
      [{ source: "devknobs", type: "key", action: "search" }, "/"],
      [{ source: "devknobs", type: "key", action: "search" }, "/"],
    ]);
    expect(prevented).toBe(2);
  });

  test("reads the keys on each press, so a key set above takes at once", () => {
    let keys = hot("k");
    forwardKeys(() => keys);
    const send = (event: KeyLike) => listener?.(Object.assign(event, { preventDefault() {} }));
    send(shifted({ key: "K" }));
    const altK = parseCombo("alt+k");
    if (!altK) throw new Error("no combo");
    keys = { ...keys, panel: altK };
    send(shifted({ key: "K" }));
    send(key({ key: "˚", code: "KeyK", altKey: true }));
    expect(posted).toEqual([
      [{ source: "devknobs", type: "key", action: "toggle" }, "/"],
      [{ source: "devknobs", type: "key", action: "toggle" }, "/"],
    ]);
  });

  test("stops listening when told to", () => {
    const stop = forwardKeys();
    expect(listener).not.toBeNull();
    stop();
    expect(listener).toBeNull();
  });
});
