import { afterEach, beforeEach, describe, expect, jest, test } from "bun:test";
import { DWELL, SLOW, settles, speedOf } from "../src/grab/dwell";
import { type Mode, type ModePage, startMode } from "../src/grab/mode";
import type { Overlay } from "../src/grab/overlay";
import type { GrabEntry } from "../src/grab/types";
import { as, type FakeElement, node } from "./grab-tree";

describe("settles", () => {
  const fast = 4 * SLOW;

  test("the first box is up at once, however fast the pointer goes", () => {
    expect(settles({ boxed: false, held: 0, speed: fast })).toBe(true);
  });

  test("a slow pointer takes the box with it at once", () => {
    expect(settles({ boxed: true, held: 0, speed: 0 })).toBe(true);
    expect(settles({ boxed: true, held: 0, speed: SLOW / 2 })).toBe(true);
  });

  test("a fast pointer leaves the box where it is", () => {
    expect(settles({ boxed: true, held: 0, speed: SLOW })).toBe(false);
    expect(settles({ boxed: true, held: DWELL - 1, speed: fast })).toBe(false);
  });

  test("a fast pointer that stays on one element takes the box there", () => {
    expect(settles({ boxed: true, held: DWELL, speed: fast })).toBe(true);
  });
});

describe("speedOf", () => {
  test("is the way gone over the time it took", () => {
    expect(speedOf({ x: 0, y: 0 }, { x: 30, y: 40 }, 100)).toBe(0.5);
    expect(speedOf({ x: 5, y: 5 }, { x: 5, y: 5 }, 32)).toBe(0);
  });

  test("takes no time at all as a millisecond", () => {
    expect(speedOf({ x: 0, y: 0 }, { x: 3, y: 0 }, 0)).toBe(3);
  });
});

/** A row of three under one parent, each 100 px wide: A, B and C from the left. */
let a: FakeElement;
let b: FakeElement;
let c: FakeElement;
let row: FakeElement;
/** The elements along the x axis, as the page is laid out now. */
let laid: FakeElement[];
/** Every element the overlay was told to box, with the tag on its label and the gathered ones. */
let draws: { element: Element | null; tag: string; picked: Element[] }[];
let toasts: (Element | null)[];
let warmed: Element[];
let copies: string[][];
let exits: number;
let mode: Mode | null = null;

function entryOf(element: Element): GrabEntry {
  const tagName = element.tagName.toLowerCase();
  return { tagName, content: tagName, source: null, stackContext: "", frames: [] };
}

const overlay: Overlay = {
  draw: (element, label, picked) => draws.push({ element, tag: label.tag, picked }),
  point: () => undefined,
  toast: (_text, near) => toasts.push(near),
  destroy: () => undefined,
};

const page: ModePage = {
  componentOf: () => null,
  copyGrab: async (payload) => {
    copies.push(payload.entries.map((entry) => entry.tagName));
    return true;
  },
  createOverlay: () => overlay,
  grabEntry: async (element) => {
    warmed.push(element);
    return entryOf(element);
  },
  grabTargetAt: (_root, x) => {
    const element = laid[Math.floor(x / 100)];
    return element ? as(element) : null;
  },
  quickEntry: entryOf,
};

/** The element the box is on, as the overlay was last told. */
function boxed(): Element | null {
  return draws[draws.length - 1]?.element ?? null;
}

function shown(): (Element | null)[] {
  return draws.map((draw) => draw.element);
}

function start(x: number): void {
  mode = startMode({ pointer: { x, y: 10 }, heldKey: () => false, onExit: () => exits++ }, page);
}

function move(x: number): void {
  const event = Object.assign(new Event("pointermove"), {
    isPrimary: true,
    clientX: x,
    clientY: 10,
  });
  window.dispatchEvent(event);
}

function click(x: number, shiftKey = false): void {
  const event = Object.assign(new MouseEvent("click", { cancelable: true }), {
    clientX: x,
    clientY: 10,
    shiftKey,
  });
  window.dispatchEvent(event);
}

function press(key: string): void {
  const event = Object.assign(new Event("keydown", { cancelable: true }), {
    key,
    code: key,
    shiftKey: false,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    repeat: false,
  });
  mode?.keydown(event as unknown as KeyboardEvent);
}

function wait(ms: number): void {
  jest.advanceTimersByTime(ms);
}

/** From the middle of A to the middle of C in two moves, faster than a pointer at rest goes. */
function sweep(): void {
  wait(40);
  move(150);
  wait(16);
  move(250);
}

beforeEach(() => {
  jest.useFakeTimers();
  a = node("a");
  b = node("b");
  c = node("c");
  row = node("section", [a, b, c]);
  node("body", [row]);
  laid = [a, b, c];
  draws = [];
  toasts = [];
  warmed = [];
  copies = [];
  exits = 0;
  const style = { setAttribute: () => undefined, remove: () => undefined, textContent: "" };
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: Object.assign(new EventTarget(), {
      setTimeout: (run: () => void, delay: number) => setTimeout(run, delay),
    }),
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      querySelector: () => null,
      createElement: () => style,
      head: { appendChild: () => undefined },
    },
  });
  for (const name of ["Element", "HTMLElement"]) {
    Object.defineProperty(globalThis, name, { configurable: true, value: class {} });
  }
  Object.defineProperty(globalThis, "MouseEvent", {
    configurable: true,
    value: class extends Event {},
  });
});

afterEach(() => {
  mode?.stop();
  mode = null;
  jest.useRealTimers();
  for (const name of ["window", "document", "Element", "HTMLElement", "MouseEvent"]) {
    Reflect.deleteProperty(globalThis, name);
  }
});

describe("grab's box", () => {
  test("is on the element under the pointer as grab turns on", () => {
    start(50);
    expect(shown()).toEqual([as(a)]);
  });

  test("goes straight to where a fast pointer stops, and never to what it passed", () => {
    start(50);
    sweep();
    expect(shown()).toEqual([as(a)]);
    // The pointer stopped on C. The box sets off within 64 ms of its last move.
    wait(64);
    expect(shown()).toEqual([as(a), as(c)]);
    wait(500);
    expect(shown()).toEqual([as(a), as(c)]);
    expect(warmed).not.toContain(as(b));
    expect(warmed).toContain(as(c));
  });

  test("goes with a slow pointer at once", () => {
    start(95);
    wait(40);
    move(98);
    wait(40);
    move(102);
    expect(shown()).toEqual([as(a), as(b)]);
  });

  test("goes to an element a fast pointer stays on", () => {
    start(50);
    wait(40);
    let x = 110;
    move(x);
    for (let time = 16; time < DWELL; time += 16) {
      wait(16);
      move((x += 16));
      expect(boxed()).toBe(as(a));
    }
    wait(16);
    move((x += 16));
    expect(boxed()).toBe(as(b));
  });

  test("always has the label of the element it is on", () => {
    start(50);
    sweep();
    wait(64);
    move(205);
    wait(40);
    move(198);
    wait(40);
    expect(boxed()).toBe(as(b));
    for (const draw of draws) expect(draw.tag).toBe(draw.element?.tagName.toLowerCase() ?? "");
  });

  test("lets go at once where a fast pointer leaves every element", () => {
    start(50);
    wait(40);
    move(150);
    wait(16);
    move(450);
    wait(16);
    expect(shown()).toEqual([as(a), null]);
    wait(500);
    expect(shown()).toEqual([as(a), null]);
  });

  test("takes what a scroll put under a pointer that waits", () => {
    start(50);
    wait(40);
    move(150);
    laid = [a, c, b];
    wait(32);
    expect(shown()).toEqual([as(a), as(c)]);
  });
});

describe("a click or a key while the box waits", () => {
  test("a click copies the element under the pointer, not the one boxed", () => {
    start(50);
    sweep();
    click(250);
    expect(boxed()).toBe(as(c));
    expect(copies).toEqual([["c"]]);
    expect(toasts).toEqual([as(c)]);
    expect(exits).toBe(1);
  });

  test("shift and a click gather the element under the pointer, and the box goes to it", () => {
    start(50);
    sweep();
    click(250, true);
    expect(draws[draws.length - 1]).toEqual({ element: as(c), tag: "c", picked: [as(c)] });
    wait(500);
    expect(boxed()).toBe(as(c));
    expect(shown()).not.toContain(as(b));
  });

  test("enter copies the element under the pointer", () => {
    start(50);
    sweep();
    press("Enter");
    expect(boxed()).toBe(as(c));
    expect(copies).toEqual([["c"]]);
  });

  test("an arrow moves the box from where it is, and the pointer's element is let be", () => {
    start(50);
    wait(40);
    move(150);
    press("ArrowUp");
    expect(shown()).toEqual([as(a), as(row)]);
    wait(500);
    expect(shown()).toEqual([as(a), as(row)]);
  });

  test("grab turned off leaves nothing to run", () => {
    start(50);
    sweep();
    mode?.stop();
    wait(500);
    expect(shown()).toEqual([as(a)]);
    expect(warmed).toEqual([]);
    expect(jest.getTimerCount()).toBe(0);
  });
});
