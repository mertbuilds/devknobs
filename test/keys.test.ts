import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { forwardKeys, hotkeyOf, keyAction, type KeyLike } from "../src/ui/keys";

function key(patch: Partial<KeyLike>): KeyLike {
  return {
    key: "d",
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
  test("defaults to d and lower cases the rest", () => {
    expect(hotkeyOf()).toBe("d");
    expect(hotkeyOf("K")).toBe("k");
  });
});

describe("keyAction", () => {
  test("toggles on the hotkey, whatever its case", () => {
    expect(keyAction(key({}), "d")).toBe("toggle");
    expect(keyAction(key({ key: "D" }), "d")).toBe("toggle");
    expect(keyAction(key({ key: "k" }), "d")).toBeNull();
  });

  test("closes on escape, even with a modifier or in a field", () => {
    expect(keyAction(key({ key: "Escape" }), "d")).toBe("close");
    expect(keyAction(key({ key: "Escape", shiftKey: true }), "d")).toBe("close");
    expect(keyAction(key({ key: "Escape", target: element("INPUT") }), "d")).toBe("close");
  });

  test("leaves the hotkey alone with a modifier", () => {
    expect(keyAction(key({ altKey: true }), "d")).toBeNull();
    expect(keyAction(key({ ctrlKey: true }), "d")).toBeNull();
    expect(keyAction(key({ metaKey: true }), "d")).toBeNull();
    expect(keyAction(key({ shiftKey: true }), "d")).toBeNull();
  });

  test("leaves the hotkey alone while typing", () => {
    expect(keyAction(key({ target: element("INPUT") }), "d")).toBeNull();
    expect(keyAction(key({ target: element("TEXTAREA") }), "d")).toBeNull();
    expect(keyAction(key({ target: element("SELECT") }), "d")).toBeNull();
    expect(keyAction(key({ target: element("DIV", true) }), "d")).toBeNull();
    expect(keyAction(key({ composedPath: () => [element("INPUT")] }), "d")).toBeNull();
    expect(keyAction(key({ target: element("DIV") }), "d")).toBe("toggle");
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
    forwardKeys("K");
    listener?.(key({ key: "k" }));
    listener?.(key({ key: "Escape" }));
    listener?.(key({ key: "d" }));
    listener?.(key({ key: "k", target: element("INPUT") }));
    expect(posted).toEqual([
      [{ source: "devknobs", type: "key", action: "toggle" }, "/"],
      [{ source: "devknobs", type: "key", action: "close" }, "/"],
    ]);
  });

  test("stops listening when told to", () => {
    const stop = forwardKeys();
    expect(listener).not.toBeNull();
    stop();
    expect(listener).toBeNull();
  });
});
