import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { clipped } from "../src/engine/overflow";

interface Overflow {
  overflowX: string;
  overflowY: string;
}

/** The computed overflow of every element made here. */
const styles = new Map<Element, Overflow>();

/** An element under `parent`, computing to `overflowX` and `overflowY`. */
function box(parent: Element | null, overflowX = "visible", overflowY = overflowX): Element {
  const element = {
    assignedSlot: null,
    parentElement: parent,
    getRootNode: () => document,
  } as unknown as Element;
  styles.set(element, { overflowX, overflowY });
  return element;
}

/** `<html>` and `<body>` with these overflows, and a box in the body that sticks out. */
function page(html: [string, string?], body: [string, string?] = ["visible"]): Element {
  const root = box(null, ...html);
  const main = box(root, ...body);
  define("document", { documentElement: root, body: main });
  return box(box(main));
}

function define(name: string, value: unknown): void {
  Object.defineProperty(globalThis, name, { configurable: true, value });
}

beforeEach(() => {
  define("getComputedStyle", (element: Element) => styles.get(element));
  define("ShadowRoot", class {});
});

afterEach(() => {
  styles.clear();
  for (const name of ["document", "getComputedStyle", "ShadowRoot"]) {
    Reflect.deleteProperty(globalThis, name);
  }
});

describe("clipped", () => {
  test("is false when only the viewport scrolls, as with html{overflow-y:scroll}", () => {
    expect(clipped(page(["auto", "scroll"]))).toBe(false);
    expect(clipped(page(["visible"]))).toBe(false);
  });

  test("is true when the root hides or clips the overflow", () => {
    expect(clipped(page(["hidden"]))).toBe(true);
    expect(clipped(page(["clip", "visible"]))).toBe(true);
  });

  test("reads the body as the viewport while the root is visible", () => {
    expect(clipped(page(["visible"], ["auto", "scroll"]))).toBe(false);
    expect(clipped(page(["visible"], ["hidden"]))).toBe(true);
  });

  test("reads the body as a box of its own once the root is not visible", () => {
    expect(clipped(page(["auto", "scroll"], ["auto"]))).toBe(true);
  });

  test("is true for a box on the way up that scrolls sideways", () => {
    const root = box(null);
    const main = box(root);
    define("document", { documentElement: root, body: main });
    expect(clipped(box(box(main, "auto")))).toBe(true);
  });
});
