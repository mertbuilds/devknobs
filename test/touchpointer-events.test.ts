import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { apply, pause, reset } from "../src/engine/touchpointer";

type Listener = (event: FakeEvent) => void;

/** A node of the fake page, its listeners kept in the open so a test can count them. */
class FakeTarget {
  listeners: { type: string; fn: Listener; capture: boolean }[] = [];
  parent: FakeTarget | null = null;

  addEventListener(type: string, fn: Listener, capture?: boolean | { capture?: boolean }): void {
    const phase = typeof capture === "object" ? Boolean(capture.capture) : Boolean(capture);
    this.listeners.push({ type, fn, capture: phase });
  }

  removeEventListener(type: string, fn: Listener, capture?: boolean | { capture?: boolean }): void {
    const phase = typeof capture === "object" ? Boolean(capture.capture) : Boolean(capture);
    this.listeners = this.listeners.filter(
      (entry) => !(entry.type === type && entry.fn === fn && entry.capture === phase),
    );
  }

  dispatchEvent(event: FakeEvent): boolean {
    return dispatch(this, event);
  }
}

class FakeEvent {
  type: string;
  bubbles: boolean;
  cancelable: boolean;
  isTrusted = false;
  defaultPrevented = false;
  stopped = false;
  path: FakeTarget[] = [];

  constructor(type: string, init: { bubbles?: boolean; cancelable?: boolean } = {}) {
    this.type = type;
    this.bubbles = Boolean(init.bubbles);
    this.cancelable = Boolean(init.cancelable);
  }

  preventDefault(): void {
    if (this.cancelable) this.defaultPrevented = true;
  }

  stopPropagation(): void {
    this.stopped = true;
  }

  stopImmediatePropagation(): void {
    this.stopped = true;
  }

  composedPath(): FakeTarget[] {
    return this.path;
  }
}

class FakeMouseEvent extends FakeEvent {
  clientX = 0;
  clientY = 0;
  screenX = 0;
  screenY = 0;
  pageX = 0;
  pageY = 0;
  offsetX = 5;
  offsetY = 5;
  button = 0;
  buttons = 0;
  altKey = false;
  ctrlKey = false;
  metaKey = false;
  shiftKey = false;
  relatedTarget: FakeTarget | null = null;

  constructor(type: string, init: Record<string, unknown> = {}) {
    super(type, init);
    Object.assign(this, init);
  }
}

class FakePointerEvent extends FakeMouseEvent {
  pointerId = 1;
  pointerType = "mouse";
  isPrimary = true;

  constructor(type: string, init: Record<string, unknown> = {}) {
    super(type, init);
    Object.assign(this, init);
  }
}

class FakeTouch {
  constructor(init: Record<string, unknown>) {
    Object.assign(this, init);
  }
}

class FakeTouchEvent extends FakeEvent {
  constructor(type: string, init: Record<string, unknown> = {}) {
    super(type, init);
  }
}

class FakeElement extends FakeTarget {
  tagName: string;
  attributes = new Map<string, string>();
  children: FakeElement[] = [];
  clientWidth = 100;
  clientHeight = 100;
  scrollWidth = 100;
  scrollHeight = 100;
  scrollLeft = 0;
  scrollTop = 0;
  textContent = "";
  className = "";
  hidden = false;
  shadow: { children: FakeElement[]; append(...nodes: FakeElement[]): void } | null = null;
  style = { transform: "", setProperty() {}, removeProperty() {}, getPropertyValue: () => "" };
  classList = { toggle() {} };

  constructor(tagName: string) {
    super();
    this.tagName = tagName.toUpperCase();
  }

  get parentElement(): FakeElement | null {
    return this.parent instanceof FakeElement ? this.parent : null;
  }

  getRootNode(): unknown {
    return doc;
  }

  hasAttribute(name: string): boolean {
    return this.attributes.has(name);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  append(...nodes: FakeElement[]): void {
    for (const node of nodes) {
      node.parent = this;
      this.children.push(node);
    }
  }

  appendChild(node: FakeElement): FakeElement {
    this.append(node);
    return node;
  }

  remove(): void {
    if (this.parent instanceof FakeElement) {
      this.parent.children.splice(this.parent.children.indexOf(this), 1);
    }
    this.parent = null;
  }

  attachShadow(): NonNullable<FakeElement["shadow"]> {
    const shadow = {
      children: [] as FakeElement[],
      append(...nodes: FakeElement[]) {
        shadow.children.push(...nodes);
      },
    };
    this.shadow = shadow;
    return shadow;
  }

  scrollBy(): void {}
}

class FakeHTMLElement extends FakeElement {
  isContentEditable = false;
}

class FakeHTMLInputElement extends FakeHTMLElement {
  type = "text";
}

class FakeHTMLTextAreaElement extends FakeHTMLElement {}

class FakeSVGElement extends FakeElement {}

/** Capture down to the target, then bubble back up, as a browser does. */
function dispatch(target: FakeTarget, event: FakeEvent): boolean {
  const path: FakeTarget[] = [];
  for (let node: FakeTarget | null = target; node; node = node.parent) path.push(node);
  if (path[path.length - 1] !== win) path.push(win);
  event.path = path;
  const call = (node: FakeTarget, capture: boolean | null) => {
    for (const entry of [...node.listeners]) {
      if (event.stopped) return;
      if (entry.type !== event.type) continue;
      if (capture !== null && entry.capture !== capture) continue;
      entry.fn(event);
    }
  };
  for (const node of [...path].reverse().slice(0, -1)) {
    call(node, true);
    if (event.stopped) return !event.defaultPrevented;
  }
  call(target, null);
  if (event.bubbles) {
    for (const node of path.slice(1)) {
      if (event.stopped) break;
      call(node, false);
    }
  }
  return !event.defaultPrevented;
}

let win: FakeTarget;
let doc: {
  documentElement: FakeElement;
  head: FakeElement;
  body: FakeElement;
  scrollingElement: FakeElement;
  activeElement: FakeElement | null;
  createElement(tag: string): FakeElement;
  querySelector(selector: string): FakeElement | null;
};

function all(element: FakeElement): FakeElement[] {
  return [element, ...element.children.flatMap(all)];
}

function sheets(): string[] {
  return all(doc.documentElement)
    .filter((element) => element.tagName === "STYLE")
    .map((element) => element.getAttribute("data-devknobs") ?? "");
}

function dotHost(): FakeElement | undefined {
  return doc.documentElement.children.find(
    (element) => element.getAttribute("data-devknobs") === "touch-pointer",
  );
}

const GLOBALS = {
  Element: FakeElement,
  HTMLElement: FakeHTMLElement,
  HTMLInputElement: FakeHTMLInputElement,
  HTMLTextAreaElement: FakeHTMLTextAreaElement,
  SVGElement: FakeSVGElement,
  MouseEvent: FakeMouseEvent,
  PointerEvent: FakePointerEvent,
  Touch: FakeTouch,
  TouchEvent: FakeTouchEvent,
  getComputedStyle: () => ({
    overflowX: "visible",
    overflowY: "visible",
    touchAction: "auto",
    direction: "ltr",
  }),
  requestAnimationFrame: () => 0,
  cancelAnimationFrame: () => {},
};

const saved = new Map<string, PropertyDescriptor | undefined>();

function install(name: string, value: unknown): void {
  if (!saved.has(name)) saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}

beforeEach(() => {
  win = Object.assign(new FakeTarget(), {
    setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
    getSelection: () => ({ removeAllRanges() {} }),
  });
  const root = new FakeHTMLElement("html");
  const head = new FakeHTMLElement("head");
  const body = new FakeHTMLElement("body");
  root.append(head, body);
  doc = {
    documentElement: root,
    head,
    body,
    scrollingElement: root,
    activeElement: body,
    createElement: (tag) =>
      tag === "input" ? new FakeHTMLInputElement(tag) : new FakeHTMLElement(tag),
    querySelector(selector) {
      return (
        all(root).find(
          (element) =>
            element.tagName === "STYLE" &&
            selector === `style[data-devknobs="${element.getAttribute("data-devknobs")}"]`,
        ) ?? null
      );
    },
  };
  root.parent = win;
  for (const [name, value] of Object.entries(GLOBALS)) install(name, value);
  install("window", win);
  install("document", doc);
});

afterEach(() => {
  pause(false);
  reset();
  for (const [name, descriptor] of saved) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
  saved.clear();
});

/** What the page's own listeners on an element hear, pointer events with their pointer type. */
function listen(element: FakeElement, types: string[]): string[] {
  const heard: string[] = [];
  for (const type of types) {
    element.addEventListener(type, (event) => {
      heard.push(event instanceof FakePointerEvent ? `${type}:${event.pointerType}` : type);
    });
  }
  return heard;
}

const ALL = [
  "pointerdown",
  "pointermove",
  "pointerup",
  "touchstart",
  "touchmove",
  "touchend",
  "mousemove",
  "mousedown",
  "mouseup",
  "click",
];

/** The browser sends a trusted event, and does its own default where nothing prevented it. */
function fire(
  target: FakeElement,
  type: string,
  init: Record<string, unknown> = {},
): FakeMouseEvent {
  const event = type.startsWith("pointer")
    ? new FakePointerEvent(type, { bubbles: true, cancelable: true, ...init })
    : new FakeMouseEvent(type, { bubbles: true, cancelable: true, ...init });
  event.isTrusted = true;
  dispatch(target, event);
  if (type === "mousedown" && !event.defaultPrevented) doc.activeElement = target;
  return event;
}

/** A pointerdown the page prevented keeps the browser's mouse events away until the button is up. */
let mouseHeld = false;

function press(target: FakeElement, x = 10, y = 10, button = 0): void {
  const buttons = button === 0 ? 1 : button === 2 ? 2 : 4;
  mouseHeld = !fire(target, "pointerdown", { clientX: x, clientY: y, button, buttons })
    .defaultPrevented;
  if (mouseHeld) fire(target, "mousedown", { clientX: x, clientY: y, button, buttons });
}

function move(target: FakeElement, x: number, y: number, buttons = 1): void {
  fire(target, "pointermove", { clientX: x, clientY: y, buttons });
  if (mouseHeld || buttons === 0) fire(target, "mousemove", { clientX: x, clientY: y, buttons });
}

function release(target: FakeElement, x = 10, y = 10, button = 0): void {
  fire(target, "pointerup", { clientX: x, clientY: y, button });
  if (mouseHeld) fire(target, "mouseup", { clientX: x, clientY: y, button });
  mouseHeld = false;
  if (button === 0) fire(target, "click", { clientX: x, clientY: y });
}

function element(tag = "div"): FakeHTMLElement {
  const made = tag === "input" ? new FakeHTMLInputElement(tag) : new FakeHTMLElement(tag);
  doc.body.append(made);
  return made;
}

/** Let the gesture's wait for its click go by. */
function task(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("touch pointer in a page", () => {
  test("puts its cursor, sheet and listeners in while on and takes all of them away when off", () => {
    apply(true);
    expect(sheets()).toEqual(["touch-pointer"]);
    expect(dotHost()).toBeDefined();
    expect(win.listeners.length).toBeGreaterThan(0);
    apply(false);
    expect(sheets()).toEqual([]);
    expect(dotHost()).toBeUndefined();
    expect(win.listeners).toEqual([]);
  });

  test("a tap sends touch events, then the mouse events a phone sends, then one click", async () => {
    apply(true);
    const input = element("input");
    const heard = listen(input, ALL);
    press(input);
    release(input);
    expect(heard).toEqual([
      "touchstart",
      "pointerdown:touch",
      "touchend",
      "pointerup:touch",
      "mousemove",
      "mousedown",
      "mouseup",
      "click",
    ]);
    // Only propagation is stopped on the browser's own mousedown, so the input still takes focus.
    expect(doc.activeElement).toBe(input);
    await task();
  });

  test("a drag sends no mouse events and no click", async () => {
    apply(true);
    const target = element();
    const heard = listen(target, ALL);
    press(target);
    move(target, 10, 40);
    release(target, 10, 40);
    expect(heard).toEqual([
      "touchstart",
      "pointerdown:touch",
      "touchmove",
      "pointermove:touch",
      "touchend",
      "pointerup:touch",
    ]);
    await task();
  });

  test("a touchstart that prevents the default stops the mouse events and the click", async () => {
    apply(true);
    const target = element();
    target.addEventListener("touchstart", (event) => event.preventDefault());
    const heard = listen(target, ALL);
    press(target);
    release(target);
    expect(heard).toEqual(["touchstart", "pointerdown:touch", "touchend", "pointerup:touch"]);
    await task();
  });

  test("a pointerdown that prevents the default stops the mouse events, not the click", async () => {
    apply(true);
    const target = element();
    target.addEventListener("pointerdown", (event) => event.preventDefault());
    const heard = listen(target, ALL);
    press(target);
    release(target);
    expect(heard).toEqual([
      "touchstart",
      "pointerdown:touch",
      "touchend",
      "pointerup:touch",
      "click",
    ]);
    await task();
  });

  test("no move reaches the page without a press", () => {
    apply(true);
    const target = element();
    const heard = listen(target, ALL);
    move(target, 20, 20, 0);
    expect(heard).toEqual([]);
  });

  test("a press on a range slider is left to the browser, its moves with it", async () => {
    apply(true);
    const range = element("input");
    if (range instanceof FakeHTMLInputElement) range.type = "range";
    const heard = listen(range, ALL);
    press(range);
    move(range, 30, 10);
    release(range, 30, 10);
    expect(heard).toEqual([
      "pointerdown:mouse",
      "mousedown",
      "pointermove:mouse",
      "mousemove",
      "pointerup:mouse",
      "mouseup",
      "click",
    ]);
    // Once the button is up, the finger stops hovering again.
    move(range, 40, 10, 0);
    expect(heard).toHaveLength(7);
    await task();
  });

  test("a drag that selects in editable text keeps its pointer and mouse moves", async () => {
    apply(true);
    const editable = element();
    editable.isContentEditable = true;
    const heard = listen(editable, ["pointermove", "mousemove", "touchstart"]);
    press(editable);
    move(editable, 30, 10);
    move(editable, 60, 10);
    release(editable, 60, 10);
    expect(heard).toEqual([
      "pointermove:mouse",
      "mousemove",
      "pointermove:mouse",
      "mousemove",
    ]);
    await task();
  });

  test("a press with another button keeps its moves", async () => {
    apply(true);
    const target = element();
    const heard = listen(target, ["pointermove", "mousemove", "touchstart"]);
    press(target, 10, 10, 1);
    move(target, 30, 10, 4);
    release(target, 30, 10, 1);
    expect(heard).toEqual(["pointermove:mouse", "mousemove"]);
    await task();
  });

  test("pause gives the mouse back, and unpausing makes it a finger again", async () => {
    apply(true);
    const target = element();
    pause(true);
    expect(sheets()).toEqual([]);
    expect(dotHost()).toBeUndefined();
    const heard = listen(target, ALL);
    move(target, 20, 20, 0);
    press(target);
    release(target);
    expect(heard).toEqual([
      "pointermove:mouse",
      "mousemove",
      "pointerdown:mouse",
      "mousedown",
      "pointerup:mouse",
      "mouseup",
      "click",
    ]);
    pause(false);
    expect(sheets()).toEqual(["touch-pointer"]);
    heard.length = 0;
    press(target);
    expect(heard).toEqual(["touchstart", "pointerdown:touch"]);
    release(target);
    await task();
  });
});
