import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { bezelMock, bodyOf, foldShots, loadFoldShots, SHOTS_KEPT } from "../src/engine/bezels";
import { DUO_FOLD } from "../src/engine/bezelurls";
import { type FoldScene, folding, foldDevice, forgetFold, stopFold } from "../src/engine/foldrun";
import { DEFAULT_STATE } from "../src/engine/store";
import type { ViewportValue } from "../src/engine/width";

/** A node of a page too small to need a browser: what a fold builds and moves. */
class FakeNode {
  className = "";
  hidden = false;
  /** A canvas's size, and what is drawn on it. */
  width = 0;
  height = 0;
  pen: FakePen | null = null;
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

  getContext(): FakePen {
    this.pen ??= new FakePen();
    return this.pen;
  }

  getBoundingClientRect(): { left: number; top: number; width: number; height: number } {
    return { left: 0, top: 0, width: 400, height: 600 };
  }
}

/** A frame's picture, which knows its file and whether it was let go of. */
class FakeBitmap {
  closed = false;

  constructor(readonly src: string) {}

  close(): void {
    this.closed = true;
  }
}

/** What a canvas draws: each frame's picture since it was last cleared, and how faded. */
class FakePen {
  globalAlpha = 1;
  drawn: { src: string; alpha: number }[] = [];

  clearRect(): void {
    this.drawn = [];
  }

  drawImage(bitmap: FakeBitmap): void {
    // As a browser does, drawing a picture let go of.
    if (bitmap.closed) throw new Error("InvalidStateError: the bitmap is closed");
    const last = this.drawn.at(-1);
    // One entry for all of a frame's pieces.
    if (last?.src === bitmap.src && last.alpha === this.globalAlpha) return;
    this.drawn.push({ src: bitmap.src, alpha: this.globalAlpha });
  }
}

/** Loads at once, and never decodes. */
class FakeImage extends FakeNode {
  onload: (() => void) | null = null;
  #src = "";

  get src(): string {
    return this.#src;
  }

  set src(url: string) {
    this.#src = url;
    queueMicrotask(() => this.onload?.());
  }
}

/** Pictures decode when the test lets them: each waits on `letDecode`. */
let letDecode: () => void = () => {};
let decodes = new Promise<void>((resolve) => {
  letDecode = resolve;
});
let bitmaps: FakeBitmap[] = [];

function createBitmap(image: FakeImage): Promise<FakeBitmap> {
  return decodes.then(() => {
    const bitmap = new FakeBitmap(image.src);
    bitmaps.push(bitmap);
    return bitmap;
  });
}

/** Timers, which the test runs. */
let timers: { run: () => void; ms: number; id: number }[] = [];
let timer = 0;

function later(run: () => void, ms: number): number {
  timer += 1;
  timers.push({ run, ms, id: timer });
  return timer;
}

function cancel(id: number): void {
  timers = timers.filter((one) => one.id !== id);
}

/** Run the timers due by `ms`. */
function wait(ms: number): void {
  const due = timers.filter((one) => one.ms <= ms);
  timers = timers.filter((one) => one.ms > ms);
  for (const one of due) one.run();
}

const GLOBALS = ["window", "document", "Image", "createImageBitmap", "setTimeout", "clearTimeout"] as const;
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
  Object.defineProperty(globalThis, "createImageBitmap", { configurable: true, value: createBitmap });
  Object.defineProperty(globalThis, "setTimeout", { configurable: true, value: later });
  Object.defineProperty(globalThis, "clearTimeout", { configurable: true, value: cancel });
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

/** The canvases the frames are drawn on, if the fold draws them. */
function canvases(): FakeNode[] {
  const model = placed()[1]?.children ?? [];
  return model.flatMap((node) => node.children).filter((node) => node.pen !== null);
}

/** The frames shown, by their place among the frames, and how faded, the one under first. */
function showing(): { index: number; alpha: number }[] {
  const frames = DUO_FOLD?.frames ?? [];
  return canvases()
    .map((node) => {
      const src = node.pen?.drawn.at(-1)?.src ?? "";
      const opacity = style(node, "opacity");
      return {
        index: frames.findIndex((shot) => src.endsWith(shot.file)),
        alpha: opacity === "" ? 1 : Number(opacity),
        z: Number(style(node, "zIndex")),
      };
    })
    .filter((shown) => shown.index >= 0 && shown.alpha > 0)
    .sort((a, b) => a.z - b.z)
    .map(({ index, alpha }) => ({ index, alpha }));
}

/** Which frame shows whole, the nearer of the two either side of the hinge's angle, by its place among the frames. */
function nearest(): number {
  return showing().find((shown) => shown.alpha === 1)?.index ?? -1;
}

/** Let the pictures decode, and see them in. */
async function decodeNow(): Promise<void> {
  letDecode();
  await decodes;
  await Bun.sleep(0);
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
  const FRAMES = DUO_FOLD.frames.length;

  test("loads the frames undecoded, turns copies of the bezels till they decode as it starts, then the frames", async () => {
    loadFoldShots();
    await Bun.sleep(0);
    expect(foldShots()).toBeNull();
    fold(SHUT, OPEN, sceneOf());
    // The copies: each side's body, window and shade, then the bend's half that stays.
    expect(placed()).toHaveLength(7);
    play(48);
    expect(placed()).toHaveLength(7);
    await decodeNow();
    expect(bitmaps).toHaveLength(FRAMES);
    expect(foldShots()?.bitmaps).toHaveLength(FRAMES);
    play(64);
    // The bend's half that stays, under the frames.
    expect(placed()).toHaveLength(2);
    expect(canvases()).toHaveLength(2);
    expect(canvases()[0]?.width).toBeGreaterThan(0);
    expect(nearest()).toBeGreaterThanOrEqual(0);
    play(2000);
    expect(layer()).toBeUndefined();
    // Kept a while, so the next fold has them from its first frame.
    fold(OPEN, SHUT, sceneOf());
    expect(placed()).toHaveLength(2);
    expect(nearest()).toBe(0);
    expect(showing()).toHaveLength(1);
    expect(style(placed()[1], "opacity")).toBe("0");
    expect(bitmaps).toHaveLength(FRAMES);
  });

  test("shows the frames either side of the hinge, the next over the last, and the page on the screen that faces the viewer", () => {
    fold(SHUT, OPEN, sceneOf());
    const model = placed()[1];
    // Under them, the dark of each frame's screen where it is laid off the windows.
    const [, , inner, outer] = model?.children ?? [];
    const seen = new Set<number>();
    let glued = false;
    play(2000, () => {
      if (!layer()) return;
      const shown = showing();
      expect(shown.length).toBeGreaterThanOrEqual(1);
      expect(shown.length).toBeLessThanOrEqual(2);
      // The next one over it, faded in as the hinge gets to it while the last fades out, one of them always whole, each drawn once on a canvas of its own.
      expect(shown.some(({ alpha }) => alpha === 1)).toBe(true);
      for (const node of canvases()) expect(node.pen?.drawn.length).toBeLessThanOrEqual(1);
      seen.add(nearest());
      const facing = [inner, outer].filter((node) => style(node, "visibility") === "");
      expect(facing.length).toBeLessThanOrEqual(1);
      if (facing[0]) {
        // Dark a little past the turned screen, and in it a window cut to it, onto the page laid flat, which never turns.
        const [cut] = facing[0].children;
        expect(style(facing[0], "clipPath")).toStartWith('path("M');
        expect(style(cut, "clipPath")).toStartWith('path("M');
        expect(style(cut?.children[0], "transform")).toStartWith("matrix(");
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

  test("lets go of the pictures a while after it lands, or once the Duo is not shown, and decodes them again", async () => {
    fold(SHUT, OPEN, sceneOf());
    play(2000);
    expect(layer()).toBeUndefined();
    wait(SHOTS_KEPT - 1);
    expect(foldShots()).not.toBeNull();
    wait(SHOTS_KEPT);
    expect(foldShots()).toBeNull();
    expect(bitmaps.every((bitmap) => bitmap.closed)).toBe(true);
    // A fold decodes them again, and one in the while after it keeps them.
    bitmaps = [];
    fold(OPEN, SHUT, sceneOf());
    await Bun.sleep(0);
    expect(bitmaps).toHaveLength(FRAMES);
    play(2000);
    fold(SHUT, OPEN, sceneOf());
    wait(SHOTS_KEPT);
    expect(foldShots()).not.toBeNull();
    play(2000);
    // Another device, or the mock off: let go of at once.
    bodyOf({ ...BASE, device: "iphone-16-pro", orientation: "portrait", posture: "closed" }, () => {});
    expect(foldShots()).toBeNull();
    expect(bitmaps.every((bitmap) => bitmap.closed)).toBe(true);
    bitmaps = [];
    fold(SHUT, OPEN, sceneOf());
    await Bun.sleep(0);
    bodyOf({ ...BASE, mock: false, orientation: "portrait", posture: "closed" }, () => {});
    // Still drawn by the fold, so kept till it ends, then let go of at once.
    expect(foldShots()).not.toBeNull();
    stopFold();
    expect(foldShots()).toBeNull();
    expect(bitmaps.every((bitmap) => bitmap.closed)).toBe(true);
  });

  test("lands a fold the mock is turned off in the middle of, and lets go of the pictures once it has", async () => {
    bitmaps = [];
    fold(SHUT, OPEN, sceneOf());
    await Bun.sleep(0);
    play(100);
    expect(canvases()).toHaveLength(2);
    // As the frame does drawing the knobs with the mock off, while the fold goes on.
    bodyOf({ ...BASE, mock: false, orientation: "portrait", posture: "closed" }, () => {});
    play(2000);
    expect(folding()).toBe(false);
    expect(layer()).toBeUndefined();
    expect(foldShots()).toBeNull();
    expect(bitmaps.length > 0 && bitmaps.every((bitmap) => bitmap.closed)).toBe(true);
  });

  test("leaves nothing behind when stopped or forgotten mid fold", async () => {
    bitmaps = [];
    fold(SHUT, OPEN, sceneOf());
    await Bun.sleep(0);
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
    // Forgotten, the frame lets go of the pictures at once.
    expect(foldShots()).toBeNull();
    expect(bitmaps.length > 0 && bitmaps.every((bitmap) => bitmap.closed)).toBe(true);
    const before = drawn.length;
    play(2000);
    expect(drawn).toHaveLength(before);
    // A new fold decodes them again, and turns the copies till they are in.
    fold(SHUT, OPEN, sceneOf());
    expect(placed()).toHaveLength(7);
    await Bun.sleep(0);
    play(32);
    expect(canvases()).toHaveLength(2);
    play(2000);
    expect(layer()).toBeUndefined();
  });
});
