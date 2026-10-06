import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  type EscapeScene,
  escapeStep,
  forwardKeys,
  highlightAt,
  hotkeyOf,
  isSearchKey,
  isShiftLetter,
  KEYS_FIELD,
  keyAction,
  type KeyLike,
  letterMatches,
  paletteMove,
  radioMove,
  shiftLabel,
  typeAhead,
  typesInField,
  zoomAction,
} from "../src/ui/keys";

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

describe("shiftLabel", () => {
  test("reads as the reset chip does, on a Mac and elsewhere", () => {
    expect(shiftLabel("k", true)).toBe("⇧K");
    expect(shiftLabel("r", false)).toBe("Shift R");
  });
});

describe("isShiftLetter", () => {
  test("takes shift and the letter, in either case for caps lock", () => {
    expect(isShiftLetter(shifted({}), "k")).toBe(true);
    expect(isShiftLetter(shifted({ key: "k" }), "k")).toBe(true);
    expect(isShiftLetter(shifted({ key: "D" }), "k")).toBe(false);
  });

  test("takes the letter's place on a layout that is not latin", () => {
    expect(isShiftLetter(shifted({ key: "Л", code: "KeyK" }), "k")).toBe(true);
    expect(isShiftLetter(shifted({ key: "D", code: "KeyK" }), "k")).toBe(false);
  });

  test("leaves a key that types another latin letter, a dead key or an IME's to the page", () => {
    // Colemak types e in k's place, Turkish F types ü in g's.
    expect(isShiftLetter(shifted({ key: "E", code: "KeyK" }), "k")).toBe(false);
    expect(isShiftLetter(shifted({ key: "Ü", code: "KeyK" }), "k")).toBe(false);
    expect(isShiftLetter(shifted({ key: "Process", code: "KeyK" }), "k")).toBe(false);
    expect(isShiftLetter(shifted({ key: "Dead", code: "KeyK" }), "k")).toBe(false);
    expect(isShiftLetter(shifted({ isComposing: true }), "k")).toBe(false);
  });

  test("needs shift and no other modifier", () => {
    expect(isShiftLetter(key({ key: "k" }), "k")).toBe(false);
    for (const modifier of ["altKey", "ctrlKey", "metaKey"] as const) {
      expect(isShiftLetter(shifted({ [modifier]: true }), "k")).toBe(false);
    }
  });
});

describe("letterMatches", () => {
  test("takes the letter, or a letter that is not latin in its place", () => {
    expect(letterMatches({ key: "G", code: "KeyT" }, "g")).toBe(true);
    expect(letterMatches({ key: "п", code: "KeyG" }, "g")).toBe(true);
    expect(letterMatches({ key: "Σ", code: "KeyS" }, "s")).toBe(true);
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
      expect(keyAction(shifted({ composedPath: () => [host] }), "k")).toBeNull();
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
      expect(keyAction(shifted({ composedPath: () => [host] }), "k")).toBe("toggle");
    });
  });
});

describe("keyAction", () => {
  test("toggles on shift and the hotkey, caps lock or not", () => {
    expect(keyAction(shifted({}), "k")).toBe("toggle");
    expect(keyAction(shifted({ key: "k" }), "k")).toBe("toggle");
    expect(keyAction(shifted({ key: "D" }), "k")).toBeNull();
    expect(keyAction(shifted({ key: "D" }), "d")).toBe("toggle");
  });

  test("leaves the bare hotkey and the bare r alone", () => {
    expect(keyAction(key({ key: "k" }), "k")).toBeNull();
    expect(keyAction(key({ key: "K" }), "k")).toBeNull();
    expect(keyAction(key({ key: "r" }), "k")).toBeNull();
  });

  test("closes on escape, even with a modifier or in a field", () => {
    expect(keyAction(key({ key: "Escape" }), "k")).toBe("close");
    expect(keyAction(key({ key: "Escape", shiftKey: true }), "k")).toBe("close");
    expect(keyAction(key({ key: "Escape", target: element("INPUT") }), "k")).toBe("close");
  });

  test("leaves the hotkey alone with another modifier", () => {
    expect(keyAction(shifted({ altKey: true }), "k")).toBeNull();
    expect(keyAction(shifted({ ctrlKey: true }), "k")).toBeNull();
    expect(keyAction(shifted({ metaKey: true }), "k")).toBeNull();
  });

  test("replays on shift r, caps lock or not, and resets on shift backspace or delete", () => {
    expect(keyAction(shifted({ key: "R" }), "k")).toBe("replay");
    expect(keyAction(shifted({ key: "r" }), "k")).toBe("replay");
    expect(keyAction(key({ key: "Backspace", shiftKey: true }), "k")).toBe("reset");
    expect(keyAction(key({ key: "Delete", shiftKey: true }), "k")).toBe("reset");
  });

  test("backspace alone does nothing", () => {
    expect(keyAction(key({ key: "Backspace" }), "k")).toBeNull();
    expect(keyAction(key({ key: "Delete" }), "k")).toBeNull();
  });

  test("leaves shift r alone with another modifier, so hard reload stays the browser's", () => {
    expect(keyAction(shifted({ key: "R", metaKey: true }), "k")).toBeNull();
    expect(keyAction(shifted({ key: "R", ctrlKey: true }), "k")).toBeNull();
    expect(keyAction(shifted({ key: "R", altKey: true }), "k")).toBeNull();
    expect(keyAction(key({ key: "r", metaKey: true }), "k")).toBeNull();
  });

  test("leaves reset alone with another modifier", () => {
    for (const modifier of ["altKey", "ctrlKey", "metaKey"] as const) {
      for (const name of ["Backspace", "Delete"]) {
        expect(keyAction(key({ key: name, shiftKey: true, [modifier]: true }), "k")).toBeNull();
      }
    }
  });

  test("leaves the keys to a field of the page, so shift types a capital", () => {
    for (const tag of ["INPUT", "TEXTAREA", "SELECT"]) {
      expect(keyAction(shifted({ target: element(tag) }), "k")).toBeNull();
      expect(keyAction(shifted({ key: "R", target: element(tag) }), "k")).toBeNull();
      const reset = key({ key: "Backspace", shiftKey: true, target: element(tag) });
      expect(keyAction(reset, "k")).toBeNull();
    }
    expect(keyAction(shifted({ target: element("DIV", true) }), "k")).toBeNull();
    expect(keyAction(shifted({ composedPath: () => [element("INPUT")] }), "k")).toBeNull();
    expect(keyAction(shifted({ target: element("DIV") }), "k")).toBe("toggle");
  });

  test("takes the shift letters in the panel's search, where backspace still deletes", () => {
    const search = () => [element("INPUT", false, true)];
    expect(keyAction(shifted({ composedPath: search }), "k")).toBe("toggle");
    expect(keyAction(shifted({ key: "R", composedPath: search }), "k")).toBe("replay");
    expect(keyAction(key({ key: "k", composedPath: search }), "k")).toBeNull();
    expect(keyAction(key({ key: "r", composedPath: search }), "k")).toBeNull();
    const reset = key({ key: "Backspace", shiftKey: true, composedPath: search });
    expect(keyAction(reset, "k")).toBeNull();
  });

  test("the hotkey wins over replay where they are the same key", () => {
    expect(keyAction(shifted({ key: "R" }), "r")).toBe("toggle");
    expect(keyAction(key({ key: "Backspace", shiftKey: true }), "r")).toBe("reset");
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

  test("posts the panel's keys to the page above, on this origin only", () => {
    forwardKeys("D");
    listener?.(shifted({ key: "D" }));
    listener?.(key({ key: "Escape" }));
    listener?.(key({ key: "d" }));
    listener?.(shifted({ key: "K" }));
    listener?.(shifted({ key: "D", target: element("INPUT") }));
    listener?.(shifted({ key: "R" }));
    listener?.(key({ key: "r" }));
    listener?.(key({ key: "Backspace", shiftKey: true }));
    listener?.(shifted({ key: "R", target: element("INPUT") }));
    listener?.(key({ key: "Backspace", shiftKey: true, target: element("TEXTAREA") }));
    listener?.(shifted({ key: "R", metaKey: true }));
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

  test("stops listening when told to", () => {
    const stop = forwardKeys();
    expect(listener).not.toBeNull();
    stop();
    expect(listener).toBeNull();
  });
});
