import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { bezelMock, foldShots, loadFoldShots } from "../src/engine/bezels";
import { DUO_FOLD } from "../src/engine/bezelurls";
import { type FoldScene, folding, foldDevice, forgetFold, stopFold } from "../src/engine/foldrun";
import { DEFAULT_STATE } from "../src/engine/store";
import type { ViewportValue } from "../src/engine/width";

/** A node of a page too small to need a browser: what a fold builds and moves. */
class FakeNode {
  className = "";
  hidden = false;
  children: FakeNode[] = [];
  parent: FakeNode | null = null;
  /** The letterbox, which is in the page. */
  root = false;
  readonly attributes = new Map<string, string>();
  readonly style = {
    setProperty(name: string, value: string): void {
      Reflect.set(this, name, value);
    },
  };

  get isConnected(): boolean {
    for (let node: FakeNode | null = this; node; node = node.parent) if (node.root) return true;
    return false;
  }

  get firstElementChild(): FakeNode | null {
    return this.children[0] ?? null;
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

  after(node: FakeNode): void {
    const parent = this.parent;
    if (!parent) return;
    node.remove();
    node.parent = parent;
    parent.children.splice(parent.children.indexOf(this) + 1, 0, node);
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
    this.parent.children = this.parent.children.filter((node) => node !== this);
    this.parent = null;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  cloneNode(): FakeNode {
    return new FakeNode();
  }

  getBoundingClientRect(): { left: number; top: number; width: number; height: number } {
    return { left: 0, top: 0, width: 400, height: 600 };
  }
}

/** Decodes when the test lets it: each waits on `release`. */
let release: () => void = () => {};
let decoded = new Promise<void>((resolve) => {
  release = resolve;
});

class FakeImage extends FakeNode {
  src = "";

  decode(): Promise<void> {
    return decoded;
  }
}

const GLOBALS = ["window", "document", "Image"] as const;
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
  };
  const doc = { createElement: () => new FakeNode(), createElementNS: () => new FakeNode() };
  Object.defineProperty(globalThis, "window", { configurable: true, value: view });
  Object.defineProperty(globalThis, "document", { configurable: true, value: doc });
  Object.defineProperty(globalThis, "Image", { configurable: true, value: FakeImage });
});

afterAll(() => {
  GLOBALS.forEach((name, index) => {
    const descriptor = saved[index];
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  });
});

const BASE = { ...DEFAULT_STATE, device: "iphone-duo", mock: true, panel: { open: false, side: "right" } } as const;
const SHUT: ViewportValue = { ...BASE, posture: "closed", orientation: "portrait", width: 466, height: 678 };
const OPEN: ViewportValue = { ...BASE, posture: "open", orientation: "landscape", width: 951, height: 669 };
const SHUT_ACROSS: ViewportValue = { ...SHUT, orientation: "landscape", width: 678, height: 466 };
const OPEN_UPRIGHT: ViewportValue = { ...OPEN, orientation: "portrait", width: 669, height: 951 };

let letterbox: FakeNode;
let unit: FakeNode;
let drawn: ViewportValue[];

/** A fake node where the fold takes an element, as the other tests pass theirs. */
function html(node: FakeNode): HTMLElement {
  return node as unknown as HTMLElement;
}

/**
 * The frame, faked: the Duo in its bezels, as the frame draws them once they
 * have loaded, at a scale of a half, its screen at 100 100.
 */
function sceneOf(): FoldScene {
  letterbox = new FakeNode();
  letterbox.root = true;
  unit = new FakeNode();
  unit.style.setProperty("transform", "translate(0px, 0px) scale(0.5)");
  const glass = new FakeNode();
  const cover = new FakeNode();
  const frame = new FakeNode();
  letterbox.append(unit);
  return {
    unit: html(unit),
    letterbox: html(letterbox),
    glass: html(glass),
    frame: frame as unknown as HTMLIFrameElement,
    cover: html(cover),
    base: 0.5,
    background: () => "#fff",
    screenRect: () => ({ x: 100, y: 100, width: 233, height: 339 }),
    place: (layer) => letterbox.append(layer as unknown as FakeNode),
    body: (value) => bezelMock(value.posture === "open" ? "iphone-duo-open" : "iphone-duo-closed", value.orientation),
    screenFor: (value) => ({
      x: 100,
      y: 100,
      width: (typeof value.width === "number" ? value.width : 0) / 2,
      height: (typeof value.height === "number" ? value.height : 0) / 2,
    }),
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

/** The frames' images that show. */
function showing(): FakeNode[] {
  return (placed()[1]?.children ?? []).filter((node) => node instanceof FakeImage && style(node, "visibility") === "");
}

/** Which frame shows whole, the one nearest the hinge's angle, by its place among the frames. */
function nearest(): number {
  const model = placed()[1];
  const whole = showing().find((node) => style(node, "opacity") === "");
  return whole && model ? model.children.indexOf(whole) - 2 : -1;
}

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
  stopFold();
});

describe("a Duo folding in its frames", () => {
  if (!DUO_FOLD) return;

  test("turns copies of the bezels while the frames load, and the frames once they are in", async () => {
    loadFoldShots();
    expect(foldShots()).toBeNull();
    fold(SHUT, OPEN, sceneOf());
    // The copies: each side's body, window and shade, then the bend's half that stays.
    expect(placed()).toHaveLength(7);
    play(2000);
    expect(layer()).toBeUndefined();
    release();
    await decoded;
    await Bun.sleep(0);
    expect(foldShots()?.images).toHaveLength(31);
    fold(OPEN, SHUT, sceneOf());
    // The bend's half that stays, under the frames.
    expect(placed()).toHaveLength(2);
    const model = placed()[1];
    expect(model?.children.filter((node) => node instanceof FakeImage)).toHaveLength(31);
    // The open end's frame, under the device till the fold leaves it.
    expect(showing().map((node) => model?.children.indexOf(node))).toEqual([2]);
    expect(nearest()).toBe(0);
    expect(style(model, "opacity")).toBe("0");
  });

  test("shows the frame nearest the hinge and the next over it, and the page on the screen that faces the viewer", () => {
    fold(SHUT, OPEN, sceneOf());
    const model = placed()[1];
    const [inner, outer] = model?.children ?? [];
    const seen = new Set<number>();
    let glued = false;
    play(2000, () => {
      if (!layer()) return;
      const shown = showing();
      expect(shown.length).toBeGreaterThanOrEqual(1);
      expect(shown.length).toBeLessThanOrEqual(2);
      // The next one over it, faded in at most half way, as the hinge gets to it.
      const over = shown.filter((node) => style(node, "opacity") !== "");
      for (const node of over) expect(Number(style(node, "opacity"))).toBeLessThanOrEqual(0.5);
      seen.add(nearest());
      const facing = [inner, outer].filter((node) => style(node, "visibility") === "");
      expect(facing.length).toBeLessThanOrEqual(1);
      if (facing[0]) {
        expect(style(facing[0], "transform")).toStartWith("matrix3d(");
        glued = true;
      }
      expect(style(model, "transform")).toStartWith("matrix(0.3");
    });
    // From shut to open, frames all the way along: more than a few of them, inner and cover both.
    expect(seen.size).toBeGreaterThan(5);
    expect(glued).toBe(true);
    expect(layer()).toBeUndefined();
    expect(drawn.at(-1)).toEqual(OPEN);
    expect(style(unit, "clipPath")).toBe("");
  });

  test("goes back from where it got to, shutting, and turns the frames a quarter held upright", () => {
    const scene = sceneOf();
    fold(OPEN_UPRIGHT, SHUT_ACROSS, scene);
    expect(style(placed()[1], "transform")).toStartWith("matrix(0, -0.3");
    const angles: number[] = [];
    const at = () => {
      if (layer()) angles.push(nearest());
    };
    play(150, at);
    const furthest = Math.max(...angles);
    fold(SHUT_ACROSS, OPEN_UPRIGHT, scene);
    expect(folding()).toBe(true);
    play(2000, at);
    expect(layer()).toBeUndefined();
    expect(drawn.at(-1)).toEqual(OPEN_UPRIGHT);
    // It turned toward shut, then all the way back to the open frame.
    expect(furthest).toBeGreaterThan(0);
    expect(angles.at(-1)).toBeLessThan(furthest);
  });

  test("leaves nothing behind when stopped or forgotten mid fold", () => {
    fold(SHUT, OPEN, sceneOf());
    play(150);
    expect(layer()).toBeDefined();
    stopFold();
    expect(layer()).toBeUndefined();
    expect(style(unit, "transform")).toBe("translate(0px, 0px) scale(0.5)");
    expect(style(unit, "clipPath")).toBe("");
    fold(SHUT, OPEN, sceneOf());
    play(150);
    forgetFold();
    expect(folding()).toBe(false);
    const before = drawn.length;
    play(2000);
    expect(drawn).toHaveLength(before);
    // A new fold takes the frames' images back from the one forgotten.
    fold(SHUT, OPEN, sceneOf());
    expect(placed()[1]?.children.filter((node) => node instanceof FakeImage)).toHaveLength(31);
    play(2000);
    expect(layer()).toBeUndefined();
  });
});
