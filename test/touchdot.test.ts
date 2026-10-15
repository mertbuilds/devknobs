import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { BARS_CSS } from "../src/engine/browserdraw";
import {
  createTouchDot,
  dotStep,
  fromPage,
  fromWindow,
  NO_DOT,
  TOUCH_DOT_CSS,
  type TouchDot,
} from "../src/engine/touchdot";
import { MARK_EVENT, readMark } from "../src/engine/touchmark";
import { VIEWPORT_CSS } from "../src/engine/viewportcss";

describe("the touch cursor's place on the screen", () => {
  test("a point of the page is that far from the page's corner on the screen", () => {
    expect(fromPage({ x: 20, y: 30 }, { x: 0, y: 0 })).toEqual({ x: 20, y: 30 });
    expect(fromPage({ x: 20, y: 30 }, { x: 0, y: 62 })).toEqual({ x: 20, y: 92 });
  });

  test("a point of the window lands in the screen's own px, whatever scale the screen is drawn at", () => {
    const size = { width: 402, height: 874 };
    const half = { x: 100, y: 50, width: 201, height: 437 };
    expect(fromWindow({ x: 100, y: 50 }, half, size)).toEqual({ x: 0, y: 0 });
    expect(fromWindow({ x: 150, y: 250 }, half, size)).toEqual({ x: 100, y: 400 });
    expect(fromWindow({ x: 301, y: 487 }, half, size)).toEqual({ x: 402, y: 874 });
    const twice = { x: -40, y: 10, width: 804, height: 1748 };
    expect(fromWindow({ x: 160, y: 210 }, twice, size)).toEqual({ x: 100, y: 100 });
  });

  test("a screen that glides is scaled by its own on each axis", () => {
    const size = { width: 400, height: 800 };
    const drawn = { x: 10, y: 20, width: 200, height: 200 };
    expect(fromWindow({ x: 110, y: 120 }, drawn, size)).toEqual({ x: 200, y: 400 });
  });

  test("a screen drawn with no size has no place for the cursor", () => {
    const size = { width: 400, height: 800 };
    expect(fromWindow({ x: 1, y: 1 }, { x: 0, y: 0, width: 0, height: 0 }, size)).toBeNull();
  });
});

describe("the touch cursor between the page and the bars", () => {
  const onPage = dotStep(NO_DOT, { from: "page", at: { x: 5, y: 6 }, pressed: false });

  test("either side shows it, with its press", () => {
    expect(onPage).toEqual({ by: "page", x: 5, y: 6, pressed: false });
    expect(dotStep(onPage, { from: "bars", at: { x: 9, y: 2 }, pressed: true })).toEqual({
      by: "bars",
      x: 9,
      y: 2,
      pressed: true,
    });
  });

  test("the side that shows it hides it", () => {
    expect(dotStep(onPage, { from: "page", at: null, pressed: false })).toEqual(NO_DOT);
  });

  test("a goodbye that comes late does not hide the cursor the other side took", () => {
    const onBars = dotStep(onPage, { from: "bars", at: { x: 9, y: 2 }, pressed: false });
    expect(dotStep(onBars, { from: "page", at: null, pressed: false })).toEqual(onBars);
    const back = dotStep(onBars, { from: "page", at: { x: 1, y: 1 }, pressed: false });
    expect(dotStep(back, { from: "bars", at: null, pressed: false })).toEqual(back);
  });

  test("a goodbye that comes first hides it until the other side's hello", () => {
    const gone = dotStep(onPage, { from: "page", at: null, pressed: false });
    expect(gone.by).toBeNull();
    expect(dotStep(gone, { from: "bars", at: { x: 9, y: 2 }, pressed: false }).by).toBe("bars");
  });
});

describe("a mark from the frame", () => {
  test("is read in its own shape only", () => {
    expect(readMark({ at: { x: 1, y: 2 }, pressed: true, held: false })).toEqual({
      at: { x: 1, y: 2 },
      pressed: true,
      held: false,
    });
    expect(readMark({ at: null, pressed: false, held: true })).toEqual({
      at: null,
      pressed: false,
      held: true,
    });
    expect(readMark(null)).toBeNull();
    expect(readMark("mark")).toBeNull();
    expect(readMark({ at: { x: 1 }, pressed: false, held: false })).toBeNull();
    expect(readMark({ at: { x: Number.NaN, y: 2 }, pressed: false, held: false })).toBeNull();
    expect(readMark({ at: null, pressed: 1, held: false })).toBeNull();
    expect(readMark({ at: null, pressed: false })).toBeNull();
  });
});

describe("the touch cursor's css", () => {
  test("hides the mouse cursor on the whole screen, over what the bars ask for", () => {
    expect(TOUCH_DOT_CSS).toContain(
      ".glass[data-touch], .glass[data-touch] * { cursor: none !important; }",
    );
    expect(VIEWPORT_CSS).toContain(TOUCH_DOT_CSS);
    // The bars' own cursors are plain declarations, which the rule above beats.
    expect(BARS_CSS).not.toMatch(/cursor:[^;]*!important/);
  });

  test("puts its layer over the bars and takes no pointer", () => {
    const layer = TOUCH_DOT_CSS.slice(TOUCH_DOT_CSS.indexOf(".touchdot {"));
    const rule = layer.slice(0, layer.indexOf("}"));
    expect(rule).toContain("z-index: 1;");
    expect(rule).toContain("pointer-events: none;");
    expect(rule).toContain("overflow: hidden;");
  });
});

interface FakeEvent {
  type: string;
  target: FakeNode;
  isTrusted: boolean;
  pointerType: string;
  clientX: number;
  clientY: number;
  buttons: number;
  detail?: unknown;
  defaultPrevented: boolean;
  preventDefault(): void;
}

/** An element, as far as the cursor's layer asks of one. */
class FakeNode {
  listeners = new Map<string, Set<(event: FakeEvent) => void>>();
  attributes = new Map<string, string>();
  children: FakeNode[] = [];
  parent: FakeNode | null = null;
  className = "";
  hidden = false;
  style: Record<string, string> = {};
  classes = new Set<string>();
  classList = {
    toggle: (name: string, on: boolean) => (on ? this.classes.add(name) : this.classes.delete(name)),
  };
  box = { left: 0, top: 0, width: 0, height: 0 };

  addEventListener(type: string, fn: (event: FakeEvent) => void): void {
    const heard = this.listeners.get(type) ?? new Set();
    heard.add(fn);
    this.listeners.set(type, heard);
  }

  removeEventListener(type: string, fn: (event: FakeEvent) => void): void {
    this.listeners.get(type)?.delete(fn);
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }

  append(...nodes: FakeNode[]): void {
    for (const node of nodes) {
      node.parent = this;
      this.children.push(node);
    }
  }

  remove(): void {
    const siblings = this.parent?.children;
    siblings?.splice(siblings.indexOf(this), 1);
    this.parent = null;
  }

  getBoundingClientRect(): FakeNode["box"] {
    return this.box;
  }

  /** Send an event to this node's listeners. True where one took it. */
  fire(type: string, init: Partial<FakeEvent> = {}): boolean {
    const event: FakeEvent = {
      type,
      target: this,
      isTrusted: true,
      pointerType: "mouse",
      clientX: 0,
      clientY: 0,
      buttons: 0,
      defaultPrevented: false,
      preventDefault() {
        event.defaultPrevented = true;
      },
      ...init,
    };
    for (const fn of Array.from(this.listeners.get(type) ?? [])) fn(event);
    return event.defaultPrevented;
  }

  heard(): number {
    return Array.from(this.listeners.values()).reduce((sum, set) => sum + set.size, 0);
  }
}

/** A phone's screen, 400 by 800 in its own px, drawn at half that from 100, 50, its page 60 down. */
const SIZE = { width: 400, height: 800 };
let glass: FakeNode;
let frame: FakeNode;
let bar: FakeNode;
let moving = false;
let touch: TouchDot;

function layer(): FakeNode {
  const found = glass.children.find((child) => child.className === "touchdot");
  if (!found) throw new Error("no cursor layer");
  return found;
}

function dot(): FakeNode {
  const found = layer().children[0];
  if (!found) throw new Error("no cursor");
  return found;
}

function mark(at: { x: number; y: number } | null, pressed = false, held = false): boolean {
  return frame.fire(MARK_EVENT, { detail: { at, pressed, held } });
}

beforeEach(() => {
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    writable: true,
    value: { createElement: () => new FakeNode() },
  });
  glass = new FakeNode();
  glass.box = { left: 100, top: 50, width: 200, height: 400 };
  frame = new FakeNode();
  bar = new FakeNode();
  glass.append(frame, bar);
  moving = false;
  touch = createTouchDot({
    glass: glass as unknown as HTMLElement,
    frame: frame as unknown as HTMLIFrameElement,
    origin: () => ({ x: 0, y: 60 }),
    moving: () => moving,
  });
  touch.fit(SIZE, 1);
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, "document");
});

describe("the touch cursor over the screen", () => {
  test("is not there, and leaves the frame's mark alone, until the touch pointer is on", () => {
    expect(layer().hidden).toBe(true);
    expect(glass.attributes.has("data-touch")).toBe(false);
    expect(mark({ x: 10, y: 10 })).toBe(false);
    glass.fire("pointermove", { target: bar, clientX: 150, clientY: 60 });
    expect(dot().hidden).toBe(true);
  });

  test("on, it hides the mouse cursor on the screen and takes the frame's marks", () => {
    touch.apply(true);
    expect(layer().hidden).toBe(false);
    expect(glass.attributes.has("data-touch")).toBe(true);
    expect(mark({ x: 10, y: 20 })).toBe(true);
    expect(dot().hidden).toBe(false);
    expect(dot().style.transform).toBe("translate(10px, 80px)");
    expect(mark({ x: 10, y: 20 }, true)).toBe(true);
    expect(dot().classes.has("pressed")).toBe(true);
    mark(null);
    expect(dot().hidden).toBe(true);
    expect(dot().classes.has("pressed")).toBe(false);
  });

  test("is drawn at the screen's zoom, in the screen's own px", () => {
    touch.fit(SIZE, 1.5);
    expect(layer().style).toMatchObject({ width: "400px", height: "800px", transform: "scale(1.5)" });
    touch.fit(SIZE, 1);
    expect(layer().style.transform).toBe("");
  });

  test("follows the mouse over the bars, through the scale the screen is drawn at", () => {
    touch.apply(true);
    glass.fire("pointermove", { target: bar, clientX: 150, clientY: 70 });
    expect(dot().hidden).toBe(false);
    expect(dot().style.transform).toBe("translate(100px, 40px)");
    glass.fire("pointerdown", { target: bar, clientX: 150, clientY: 70, buttons: 1 });
    expect(dot().classes.has("pressed")).toBe(true);
    glass.fire("pointerup", { target: bar, clientX: 150, clientY: 70 });
    expect(dot().classes.has("pressed")).toBe(false);
    expect(dot().hidden).toBe(false);
    glass.fire("pointerleave", { target: glass });
    expect(dot().hidden).toBe(true);
  });

  test("leaves a finger on a real touch screen, and an event a script made, alone", () => {
    touch.apply(true);
    glass.fire("pointermove", { target: bar, clientX: 150, clientY: 70, pointerType: "touch" });
    glass.fire("pointermove", { target: bar, clientX: 150, clientY: 70, isTrusted: false });
    expect(dot().hidden).toBe(true);
  });

  test("stays one cursor as the pointer crosses from the page onto a bar, in either order", () => {
    touch.apply(true);
    mark({ x: 10, y: 20 });
    glass.fire("pointerover", { target: bar, clientX: 150, clientY: 70 });
    mark(null);
    expect(dot().hidden).toBe(false);
    expect(dot().style.transform).toBe("translate(100px, 40px)");
    mark({ x: 10, y: 20 });
    mark(null);
    glass.fire("pointerover", { target: bar, clientX: 150, clientY: 70 });
    expect(dot().hidden).toBe(false);
  });

  test("stays one cursor as the pointer crosses from a bar onto the page, in either order", () => {
    touch.apply(true);
    glass.fire("pointermove", { target: bar, clientX: 150, clientY: 70 });
    mark({ x: 10, y: 20 });
    glass.fire("pointerover", { target: frame, clientX: 150, clientY: 200 });
    expect(dot().hidden).toBe(false);
    expect(dot().style.transform).toBe("translate(10px, 80px)");
    glass.fire("pointermove", { target: bar, clientX: 150, clientY: 70 });
    glass.fire("pointerover", { target: frame, clientX: 150, clientY: 200 });
    expect(dot().hidden).toBe(true);
    mark({ x: 10, y: 20 });
    expect(dot().hidden).toBe(false);
  });

  test("gives the mouse back on the bars while the frame holds the touch pointer", () => {
    touch.apply(true);
    mark({ x: 10, y: 20 });
    expect(mark(null, false, true)).toBe(true);
    expect(dot().hidden).toBe(true);
    expect(layer().hidden).toBe(true);
    expect(glass.attributes.has("data-touch")).toBe(false);
    glass.fire("pointermove", { target: bar, clientX: 150, clientY: 70 });
    expect(dot().hidden).toBe(true);
    mark(null);
    expect(glass.attributes.has("data-touch")).toBe(true);
    glass.fire("pointermove", { target: bar, clientX: 150, clientY: 70 });
    expect(dot().hidden).toBe(false);
  });

  test("shows nothing on a screen that turns or folds, and comes back with the next move", () => {
    touch.apply(true);
    mark({ x: 10, y: 20 });
    touch.rest();
    expect(dot().hidden).toBe(true);
    moving = true;
    mark({ x: 10, y: 20 });
    glass.fire("pointermove", { target: bar, clientX: 150, clientY: 70 });
    expect(dot().hidden).toBe(true);
    moving = false;
    mark({ x: 10, y: 20 });
    expect(dot().hidden).toBe(false);
  });

  test("off, it takes the cursor away and gives the mouse back", () => {
    touch.apply(true);
    mark({ x: 10, y: 20 });
    touch.apply(false);
    expect(dot().hidden).toBe(true);
    expect(layer().hidden).toBe(true);
    expect(glass.attributes.has("data-touch")).toBe(false);
    expect(mark({ x: 10, y: 20 })).toBe(false);
  });

  test("leaves nothing behind when the frame goes", () => {
    touch.apply(true);
    expect(glass.heard()).toBeGreaterThan(0);
    expect(frame.heard()).toBe(1);
    touch.remove();
    expect(glass.heard()).toBe(0);
    expect(frame.heard()).toBe(0);
    expect(glass.attributes.has("data-touch")).toBe(false);
    expect(glass.children.some((child) => child.className === "touchdot")).toBe(false);
  });
});
