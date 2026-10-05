import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  type EscapeScene,
  escapeStep,
  forwardKeys,
  highlightAt,
  hotkeyOf,
  isSearchKey,
  keyAction,
  type KeyLike,
  paletteMove,
  radioMove,
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
function element(tagName: string, isContentEditable = false): EventTarget {
  return { tagName, isContentEditable } as unknown as EventTarget;
}

describe("hotkeyOf", () => {
  test("defaults to k and lower cases the rest", () => {
    expect(hotkeyOf()).toBe("k");
    expect(hotkeyOf("D")).toBe("d");
  });
});

describe("keyAction", () => {
  test("toggles on the hotkey, whatever its case", () => {
    expect(keyAction(key({}), "k")).toBe("toggle");
    expect(keyAction(key({ key: "K" }), "k")).toBe("toggle");
    expect(keyAction(key({ key: "d" }), "k")).toBeNull();
  });

  test("closes on escape, even with a modifier or in a field", () => {
    expect(keyAction(key({ key: "Escape" }), "k")).toBe("close");
    expect(keyAction(key({ key: "Escape", shiftKey: true }), "k")).toBe("close");
    expect(keyAction(key({ key: "Escape", target: element("INPUT") }), "k")).toBe("close");
  });

  test("leaves the hotkey alone with a modifier", () => {
    expect(keyAction(key({ altKey: true }), "k")).toBeNull();
    expect(keyAction(key({ ctrlKey: true }), "k")).toBeNull();
    expect(keyAction(key({ metaKey: true }), "k")).toBeNull();
    expect(keyAction(key({ shiftKey: true }), "k")).toBeNull();
  });

  test("replays on r, whatever the case, and resets on shift backspace or delete", () => {
    expect(keyAction(key({ key: "r" }), "k")).toBe("replay");
    expect(keyAction(key({ key: "R" }), "k")).toBe("replay");
    expect(keyAction(key({ key: "Backspace", shiftKey: true }), "k")).toBe("reset");
    expect(keyAction(key({ key: "Delete", shiftKey: true }), "k")).toBe("reset");
  });

  test("shift r and backspace alone do nothing", () => {
    expect(keyAction(key({ key: "R", shiftKey: true }), "k")).toBeNull();
    expect(keyAction(key({ key: "r", shiftKey: true }), "k")).toBeNull();
    expect(keyAction(key({ key: "Backspace" }), "k")).toBeNull();
    expect(keyAction(key({ key: "Delete" }), "k")).toBeNull();
  });

  test("leaves r alone with a modifier, so reload and hard reload stay the browser's", () => {
    expect(keyAction(key({ key: "r", metaKey: true }), "k")).toBeNull();
    expect(keyAction(key({ key: "r", ctrlKey: true }), "k")).toBeNull();
    expect(keyAction(key({ key: "r", altKey: true }), "k")).toBeNull();
    expect(keyAction(key({ key: "R", metaKey: true, shiftKey: true }), "k")).toBeNull();
    expect(keyAction(key({ key: "R", ctrlKey: true, shiftKey: true }), "k")).toBeNull();
  });

  test("leaves reset alone with another modifier", () => {
    for (const modifier of ["altKey", "ctrlKey", "metaKey"] as const) {
      for (const name of ["Backspace", "Delete"]) {
        expect(keyAction(key({ key: name, shiftKey: true, [modifier]: true }), "k")).toBeNull();
      }
    }
  });

  test("leaves replay and reset alone while typing, so shift backspace deletes", () => {
    expect(keyAction(key({ key: "r", target: element("INPUT") }), "k")).toBeNull();
    for (const tag of ["INPUT", "TEXTAREA", "SELECT"]) {
      const shifted = key({ key: "Backspace", shiftKey: true, target: element(tag) });
      expect(keyAction(shifted, "k")).toBeNull();
    }
    expect(keyAction(key({ key: "r", target: element("DIV", true) }), "k")).toBeNull();
    const editable = key({ key: "Backspace", shiftKey: true, target: element("DIV", true) });
    expect(keyAction(editable, "k")).toBeNull();
    const inShadow = key({ key: "Backspace", shiftKey: true, composedPath: () => [element("INPUT")] });
    expect(keyAction(inShadow, "k")).toBeNull();
  });

  test("the hotkey wins over replay where they are the same key", () => {
    expect(keyAction(key({ key: "r" }), "r")).toBe("toggle");
    expect(keyAction(key({ key: "Backspace", shiftKey: true }), "r")).toBe("reset");
  });

  test("leaves the hotkey alone while typing", () => {
    expect(keyAction(key({ target: element("INPUT") }), "k")).toBeNull();
    expect(keyAction(key({ target: element("TEXTAREA") }), "k")).toBeNull();
    expect(keyAction(key({ target: element("SELECT") }), "k")).toBeNull();
    expect(keyAction(key({ target: element("DIV", true) }), "k")).toBeNull();
    expect(keyAction(key({ composedPath: () => [element("INPUT")] }), "k")).toBeNull();
    expect(keyAction(key({ target: element("DIV") }), "k")).toBe("toggle");
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
    listener?.(key({ key: "d" }));
    listener?.(key({ key: "Escape" }));
    listener?.(key({ key: "k" }));
    listener?.(key({ key: "d", target: element("INPUT") }));
    listener?.(key({ key: "r" }));
    listener?.(key({ key: "Backspace", shiftKey: true }));
    listener?.(key({ key: "r", target: element("INPUT") }));
    listener?.(key({ key: "Backspace", shiftKey: true, target: element("TEXTAREA") }));
    listener?.(key({ key: "r", metaKey: true }));
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
