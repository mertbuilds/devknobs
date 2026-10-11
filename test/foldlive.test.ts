import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { type LiveCopies, liveCopies, loadLive, placeLive } from "../src/engine/foldlive";
import { type FoldScene, foldDevice, stopFold } from "../src/engine/foldrun";
import { DEFAULT_STATE } from "../src/engine/store";
import type { ViewportValue } from "../src/engine/width";

/**
 * A fold of an outside page where copies of the half turn, as they do for
 * any foldable out of its bezels. The same where the Duo's frames draw the
 * half is with the tests of those frames, which load once for them all.
 */

/** A node of a page too small to need a browser: what a fold builds and moves. */
class FakeNode {
  className = "";
  hidden = false;
  children: FakeNode[] = [];
  parent: FakeNode | null = null;
  /** The letterbox, which is in the page. */
  root = false;
  /** Set once it may never leave the box it is in, as a frame that did would load its page again. */
  fixed = false;
  inert = false;
  readonly attributes = new Map<string, string>();
  readonly style = {
    setProperty(name: string, value: string): void {
      Reflect.set(this, name, value);
    },
    removeProperty(name: string): void {
      Reflect.deleteProperty(this, name);
    },
  };

  get isConnected(): boolean {
    for (let node: FakeNode | null = this; node; node = node.parent) if (node.root) return true;
    return false;
  }

  append(...nodes: FakeNode[]): void {
    for (const node of nodes) {
      node.remove();
      node.parent = this;
      this.children.push(node);
    }
  }

  prepend(...nodes: FakeNode[]): void {
    for (const node of nodes) node.remove();
    for (const node of nodes) node.parent = this;
    this.children.unshift(...nodes);
  }

  insertBefore(node: FakeNode, before: FakeNode | null): FakeNode {
    node.remove();
    node.parent = this;
    const at = before ? this.children.indexOf(before) : -1;
    if (at < 0) this.children.push(node);
    else this.children.splice(at, 0, node);
    return node;
  }

  remove(): void {
    if (!this.parent) return;
    if (this.fixed) moved += 1;
    this.parent.children = this.parent.children.filter((node) => node !== this);
    this.parent = null;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  hasAttribute(name: string): boolean {
    return this.attributes.has(name);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  addEventListener(): void {}

  cloneNode(): FakeNode {
    return new FakeNode();
  }

  /** A child by its class, as `:scope > .name` finds one. */
  querySelector(selector: string): FakeNode | null {
    const name = /^:scope > \.(.+)$/.exec(selector)?.[1];
    return this.children.find((node) => name !== undefined && node.className === name) ?? null;
  }

  getBoundingClientRect(): { left: number; top: number; width: number; height: number } {
    return { left: 0, top: 0, width: 400, height: 600 };
  }
}

/** How many times a node that may never leave its box was taken out of it. */
let moved = 0;
/** How many times a copy's window or document was asked for. */
let touched = 0;

/** A frame with a page of another origin in it: its window and its document throw when asked for. */
class FakeFrame extends FakeNode {
  src = "";

  get contentWindow(): never {
    touched += 1;
    throw new Error("SecurityError");
  }

  get contentDocument(): never {
    touched += 1;
    throw new Error("SecurityError");
  }
}

const GLOBALS = ["window", "document"] as const;
const saved = GLOBALS.map((name) => Object.getOwnPropertyDescriptor(globalThis, name));
let frames: FrameRequestCallback[] = [];

/** Run the frames asked for, 16 ms apart, until none is asked for or `until` ms, seeing each. */
function play(until: number, see: () => void = () => {}): void {
  for (let now = 0; now <= until && frames.length > 0; now += 16) {
    for (const callback of frames.splice(0)) callback(now);
    see();
  }
}

beforeAll(() => {
  const view = {
    requestAnimationFrame: (callback: FrameRequestCallback) => frames.push(callback),
    cancelAnimationFrame: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  const doc = {
    createElement: (tag: string) => (tag === "iframe" ? new FakeFrame() : new FakeNode()),
    createElementNS: () => new FakeNode(),
    importNode: (node: FakeNode) => node.cloneNode(),
  };
  Object.defineProperty(globalThis, "window", { configurable: true, value: view });
  Object.defineProperty(globalThis, "document", { configurable: true, value: doc });
});

afterAll(() => {
  GLOBALS.forEach((name, index) => {
    const descriptor = saved[index];
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  });
});

const BASE = { ...DEFAULT_STATE, device: "iphone-duo", mock: true, panel: { open: false, side: "right", docked: false } } as const;
const SHUT: ViewportValue = { ...BASE, posture: "closed", orientation: "portrait", width: 466, height: 678 };
const OPEN: ViewportValue = { ...BASE, posture: "open", orientation: "landscape", width: 951, height: 669 };

const OUTSIDE = "https://example.com/pricing";
const GROUND = "rgb(18, 18, 18)";
/** Marks a frame with an outside page in it, as the frame's own is marked. */
const OUTSIDE_ATTRIBUTE = "data-devknobs-outside";

let letterbox: FakeNode;
let unit: FakeNode;
let drawn: ViewportValue[];

/** A fake node where the fold takes an element, as the other tests pass theirs. */
function html(node: FakeNode): HTMLElement {
  return node as unknown as HTMLElement;
}

/** The fake node an element the fold was given is. */
function fake(node: HTMLElement | undefined): FakeNode | undefined {
  return node as unknown as FakeNode | undefined;
}

/** The frame, faked: a foldable out of its bezels, at a scale of a half, its screen at 100 100, so a fold turns copies of its half. */
function sceneOf(): FoldScene {
  letterbox = new FakeNode();
  letterbox.root = true;
  unit = new FakeNode();
  unit.style.setProperty("transform", "translate(0px, 0px) scale(0.5)");
  letterbox.append(unit);
  return {
    unit: html(unit),
    letterbox: html(letterbox),
    glass: html(new FakeNode()),
    frame: new FakeNode() as unknown as HTMLIFrameElement,
    cover: html(new FakeNode()),
    base: 0.5,
    background: () => "#fff",
    screenRect: () => ({ x: 100, y: 100, width: 233, height: 339 }),
    place: (layer) => letterbox.append(layer as unknown as FakeNode),
    body: () => null,
    screenFor: (value) => ({
      x: 100,
      y: 100,
      width: (typeof value.width === "number" ? value.width : 0) / 2,
      height: (typeof value.height === "number" ? value.height : 0) / 2,
    }),
  };
}

/** Where the browser leaves the page on a screen: all of it but 24 px at each side. */
function pageOf(value: ViewportValue): { x: number; y: number; width: number; height: number } {
  return { x: 24, y: 0, width: Number(value.width) - 48, height: Number(value.height) };
}

/** Every node under one, itself too. */
function under(node: FakeNode): FakeNode[] {
  return [node, ...node.children.flatMap(under)];
}

/**
 * The same frame with an outside page in it, as the frame has one on the
 * Duo: its own frame out of reach, and a live copy of the page for each
 * screen, loading, on a layer of their own over the fold's. Nothing of the
 * copies may leave its box from here on.
 */
function outsideOf(open: ViewportValue, shut: ViewportValue): { scene: FoldScene; copies: LiveCopies } {
  const scene = sceneOf();
  const own = new FakeFrame();
  own.setAttribute(OUTSIDE_ATTRIBUTE, OUTSIDE);
  const copies = liveCopies(new FakeFrame() as unknown as HTMLIFrameElement, new FakeFrame() as unknown as HTMLIFrameElement);
  placeLive(copies.open, pageOf(open), 1, GROUND, "dark", "");
  placeLive(copies.closed, pageOf(shut), 1, GROUND, "dark", "");
  loadLive(copies, OUTSIDE);
  const over = fake(copies.layer);
  if (!over) throw new Error("no layer");
  letterbox.append(over);
  for (const copy of [copies.open, copies.closed]) {
    for (const node of [...copy.boxes, copy.ground, copy.page, copy.frame]) (node as unknown as FakeNode).fixed = true;
  }
  return {
    scene: {
      ...scene,
      frame: own as unknown as HTMLIFrameElement,
      place: (layer) => letterbox.insertBefore(layer as unknown as FakeNode, over),
      live: copies,
    },
    copies,
  };
}

/** The fold's layer, if it is up. */
function layer(): FakeNode | undefined {
  return letterbox.children.find((node) => node.className === "fold");
}

/** What the fold has put on its place: copies of the half that turns, or the frames' model. */
function placed(): FakeNode[] {
  return layer()?.children[0]?.children ?? [];
}

const style = (node: FakeNode | undefined, key: string) => String(Reflect.get(node?.style ?? {}, key) ?? "");

/** Fold from `from` to `to`, drawing what the knobs say, which puts the device back at rest as the frame does. */
function fold(from: ViewportValue, to: ViewportValue, scene: FoldScene): void {
  foldDevice(from, to, scene, (value) => {
    drawn.push(value);
    unit.style.setProperty("transform", "translate(0px, 0px) scale(0.5)");
  });
}

beforeEach(() => {
  frames = [];
  drawn = [];
  moved = 0;
  touched = 0;
  stopFold();
});

afterEach(() => {
  // Nothing of a copy ever left its box, which would load its page again, and no one asked for its window or its document.
  expect(moved).toBe(0);
  expect(touched).toBe(0);
});

describe("an outside page folding where copies of the half turn", () => {
  test("lays each live copy in the copy's window onto the page, with the window's dark under its own page and none of the fold's", () => {
    const { scene, copies } = outsideOf(OPEN, SHUT);
    fold(SHUT, OPEN, scene);
    // Each side's body, window and shade, as for the window's own page.
    expect(placed()).toHaveLength(6);
    let seen = 0;
    play(2000, () => {
      if (!layer()) return;
      seen += 1;
      const sides = [
        [copies.open, placed().slice(0, 3)],
        [copies.closed, placed().slice(3, 6)],
      ] as const;
      for (const [copy, [, opening, veil]] of sides) {
        const boxes = copy.boxes.map(fake);
        // The fold's own window is not drawn, so its dark is under no edge of the copy.
        expect(style(opening, "display")).toBe("none");
        for (const one of boxes) expect(style(one, "background")).toBe("");
        expect(style(boxes[0], "transform")).toBe(style(layer()?.children[0], "transform"));
        for (const key of ["left", "top", "width", "height", "clipPath", "visibility", "opacity"]) {
          expect(style(boxes[2], key)).toBe(style(opening, key));
        }
        const [dark, stage, flat] = opening?.children ?? [];
        for (const key of ["left", "top", "width", "height", "borderRadius", "overflow"]) expect(style(boxes[5], key)).toBe(style(stage, key));
        // No box of the frames' between them.
        for (const at of [1, 3, 4]) for (const key of ["transform", "clipPath", "left", "width"]) expect(style(boxes[at], key)).toBe("");
        // The window's dark is the copy's own, cut with its page as one, and the picture's dark over the page.
        const [under, , over] = boxes[2]?.children ?? [];
        expect([style(under, "background"), style(under, "inset")]).toEqual([style(dark, "background"), "-100%"]);
        expect(style(under, "background")).toBe("#000");
        expect(style(over, "background")).toBe(style(flat, "background"));
        // The dark its ends go toward as the half stands, over the page.
        const rim = boxes[5]?.children.at(-1);
        const real = stage?.children.at(-1);
        expect(style(rim, "background")).toStartWith("linear-gradient(");
        expect([style(rim, "background"), style(rim, "opacity")]).toEqual([style(real, "background"), style(real, "opacity")]);
        // The turned screen's shade, turned with the body as the fold's own is.
        const shade = boxes[0]?.children.at(-1);
        expect(shade?.className).toBe("face");
        for (const key of ["transform", "transformOrigin", "visibility", "opacity", "width", "height"]) expect(style(shade, key)).toBe(style(veil, key));
        expect(shade?.children).toHaveLength(2);
      }
      // One of the two faces the viewer, turned in depth as its body is, and its page lies flat in its window.
      const turned = [placed()[2], placed()[5]].filter((veil) => style(veil, "visibility") === "");
      expect(turned).toHaveLength(1);
      expect(style(turned[0], "transform")).toStartWith("perspective(");
    });
    expect(seen).toBeGreaterThan(20);
    expect(layer()).toBeUndefined();
    expect(drawn.at(-1)).toEqual(OPEN);
    expect(style(fake(copies.layer), "visibility")).toBe("hidden");
  });

  test("folds the window's own page with no copy, no layer and no frame of its own", () => {
    const scene = sceneOf();
    fold(SHUT, OPEN, scene);
    const all = () => under(letterbox);
    expect(all().some((node) => node instanceof FakeFrame || node.className === "live")).toBe(false);
    // Its window onto the page is drawn, with the fold's own dark in it.
    expect(style(placed()[1], "display")).toBe("");
    play(2000, () => {
      expect(all().some((node) => node instanceof FakeFrame || node.className === "live")).toBe(false);
    });
    expect(drawn.at(-1)).toEqual(OPEN);
  });
});
