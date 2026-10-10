import { afterEach, beforeEach, describe, expect, jest, test } from "bun:test";
import { type Mode, type ModePage, startMode } from "../src/grab/mode";
import type { Overlay } from "../src/grab/overlay";
import type { GrabEntry } from "../src/grab/types";
import { as, type FakeElement, node } from "./grab-tree";

/** A row of three under one parent, each 100 px wide: A, B and C from the left. */
let a: FakeElement;
let b: FakeElement;
let c: FakeElement;
let laid: FakeElement[];
/** What the overlay was told to box, with its label and the gathered ones. */
let draws: { element: Element | null; tag: string; name: string | null; picked: Element[] }[];
let toasts: number;
let warmed: Element[];
let copies: number;
let picks: Element[];
let exits: number;
let overlays: number;
/** What each overlay was made with: whether it is quiet, and whether it draws the box. */
let asked: [boolean | undefined, boolean | undefined][];
let mode: Mode | null = null;

function entryOf(element: Element): GrabEntry {
  const tagName = element.tagName.toLowerCase();
  return { tagName, content: tagName, source: null, stackContext: "", frames: [] };
}

const overlay: Overlay = {
  draw: (element, label, picked) =>
    draws.push({ element, tag: label.tag, name: label.name, picked }),
  point: () => undefined,
  toast: () => {
    toasts++;
  },
  destroy: () => {
    overlays--;
  },
};

const page: ModePage = {
  componentOf: () => "Component",
  copyGrab: async () => {
    copies++;
    return true;
  },
  createOverlay: (quiet, model) => {
    asked.push([quiet, model]);
    overlays++;
    return overlay;
  },
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

/** Inspect's use of the mode: a pick is handed over, under a label that says `styles`. */
function inspect(x: number): void {
  mode = startMode(
    {
      pointer: { x, y: 10 },
      heldKey: () => false,
      purpose: {
        label: (element) => ({ tag: "styles", name: element.tagName.toLowerCase() }),
        pick: (element) => picks.push(element),
      },
      onExit: () => exits++,
    },
    page,
  );
}

function click(x: number, shiftKey = false): Event {
  const event = Object.assign(new MouseEvent("click", { cancelable: true }), {
    clientX: x,
    clientY: 10,
    shiftKey,
  });
  window.dispatchEvent(event);
  return event;
}

/** A key, from a node of the page or of the panel by its tag. */
function press(key: string, tagName = "DIV"): Event & { stopped: boolean } {
  const target = Object.assign(new HTMLElement(), { tagName, isContentEditable: false });
  const event = Object.assign(new Event("keydown", { cancelable: true }), {
    key,
    code: key === "c" ? "KeyC" : key,
    shiftKey: false,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    repeat: false,
    stopped: false,
    composedPath: () => [target],
  });
  event.stopImmediatePropagation = () => {
    event.stopped = true;
  };
  mode?.keydown(event as unknown as KeyboardEvent);
  return event;
}

beforeEach(() => {
  jest.useFakeTimers();
  a = node("a");
  b = node("b");
  c = node("c");
  node("body", [node("section", [a, b, c])]);
  laid = [a, b, c];
  draws = [];
  toasts = 0;
  warmed = [];
  copies = 0;
  picks = [];
  exits = 0;
  overlays = 0;
  asked = [];
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

describe("the mode with inspect's purpose", () => {
  test("boxes the element under the pointer as grab does, under inspect's own label", () => {
    inspect(50);
    expect(draws.map((draw) => [draw.element, draw.tag, draw.name])).toEqual([
      [as(a), "styles", "a"],
    ]);
  });

  test("a click hands the element under the pointer over, and copies nothing", async () => {
    inspect(50);
    const event = click(250);
    expect(picks).toEqual([as(c)]);
    expect(event.defaultPrevented).toBe(true);
    jest.advanceTimersByTime(1000);
    await Promise.resolve();
    expect(copies).toBe(0);
    expect(toasts).toBe(0);
  });

  test("asks its layer for the element's box and its card, which grab does not", () => {
    inspect(50);
    expect(asked).toEqual([[false, true]]);
  });

  test("stays on after a pick, so the next click picks another", () => {
    inspect(50);
    click(50);
    click(150);
    click(250);
    expect(picks).toEqual([as(a), as(b), as(c)]);
    expect(exits).toBe(0);
    expect(overlays).toBe(1);
  });

  test("works out no context for a copy, however long the pointer rests", () => {
    inspect(50);
    jest.advanceTimersByTime(1000);
    click(50);
    jest.advanceTimersByTime(1000);
    expect(warmed).toEqual([]);
  });

  test("shift and a click picks as a click does, and gathers nothing", () => {
    inspect(50);
    click(150, true);
    expect(picks).toEqual([as(b)]);
    expect(draws.every((draw) => draw.picked.length === 0)).toBe(true);
    window.dispatchEvent(Object.assign(new Event("keyup"), { key: "Shift" }));
    expect(copies).toBe(0);
    expect(exits).toBe(0);
  });

  test("enter picks the boxed element and stays on, and c does nothing", () => {
    inspect(150);
    const letter = press("c");
    expect(picks).toEqual([]);
    expect(letter.defaultPrevented).toBe(false);
    const enter = press("Enter");
    expect(picks).toEqual([as(b)]);
    expect(enter.defaultPrevented).toBe(true);
    expect(exits).toBe(0);
    expect(copies).toBe(0);
  });

  test("enter on a button or in a field of the pane is that control's own", () => {
    inspect(150);
    for (const tag of ["BUTTON", "INPUT"]) {
      const enter = press("Enter", tag);
      expect(enter.defaultPrevented).toBe(false);
      expect(enter.stopped).toBe(false);
    }
    expect(picks).toEqual([]);
  });

  test("an arrow walks the tree from the boxed element, and enter picks where it got to", () => {
    inspect(150);
    press("ArrowRight");
    expect(draws[draws.length - 1]?.element).toBe(as(c));
    press("Enter");
    expect(picks).toEqual([as(c)]);
  });

  test("tab moves the focus as ever, and a button of the pane keeps its arrows", () => {
    inspect(150);
    const tab = press("Tab");
    const arrow = press("ArrowRight", "BUTTON");
    expect(tab.defaultPrevented).toBe(false);
    expect(arrow.defaultPrevented).toBe(false);
    expect(draws[draws.length - 1]?.element).toBe(as(b));
  });

  test("escape ends the mode and goes no further, so the pane is not closed with it", () => {
    inspect(50);
    click(50);
    const escape = press("Escape");
    expect(exits).toBe(1);
    expect(escape.stopped).toBe(true);
    expect(overlays).toBe(0);
    click(150);
    expect(picks).toEqual([as(a)]);
  });
});

describe("the mode with no purpose", () => {
  test("is grab: its own label, and a click copies and ends it", async () => {
    mode = startMode(
      { pointer: { x: 50, y: 10 }, heldKey: () => false, onExit: () => exits++ },
      page,
    );
    expect(draws[0]?.tag).toBe("a");
    expect(draws[0]?.name).toBe("Component");
    // Grab keeps its plain box: no areas, no card.
    expect(asked).toEqual([[false, false]]);
    click(50);
    await Promise.resolve();
    expect(copies).toBe(1);
    expect(exits).toBe(1);
    expect(picks).toEqual([]);
  });
});
