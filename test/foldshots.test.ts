import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { bezelMock, bodyOf, foldShots, loadFoldShots, restFoldShots, SHOTS_KEPT } from "../src/engine/bezels";
import { DUO_FOLD } from "../src/engine/bezelurls";
import {
  FOLD_TIME,
  FOLD_WAIT,
  HINGE_CATCH_UP,
  HINGE_STEP,
  hingeAfter,
  hingeLinear,
  openOf,
  SHOTS_AHEAD,
  SHOTS_AROUND,
  SHOTS_FADE,
} from "../src/engine/fold";
import {
  finishFold,
  type FoldScene,
  folding,
  foldDevice,
  foldRest,
  forgetFold,
  holdFold,
  holdingHinge,
  releaseFold,
  scrubFold,
  stopFold,
  watchFold,
  watchHinge,
} from "../src/engine/foldrun";
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

  /** A child by its class, as `:scope > .name` finds one. */
  querySelector(selector: string): FakeNode | null {
    const name = /^:scope > \.(.+)$/.exec(selector)?.[1];
    return this.children.find((node) => name !== undefined && node.className === name) ?? null;
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

/** What a canvas draws: each picture since it was last cleared, and where its first piece went, in the canvas's px. */
class FakePen {
  globalAlpha = 1;
  drawn: { src: string; alpha: number; at: [number, number] }[] = [];

  clearRect(): void {
    this.drawn = [];
  }

  drawImage(bitmap: FakeBitmap, ...args: number[]): void {
    // As a browser does, drawing a picture let go of.
    if (bitmap.closed) throw new Error("InvalidStateError: the bitmap is closed");
    const last = this.drawn.at(-1);
    // One entry for all of a picture's pieces.
    if (last?.src === bitmap.src && last.alpha === this.globalAlpha) return;
    this.drawn.push({ src: bitmap.src, alpha: this.globalAlpha, at: [args[4] ?? NaN, args[5] ?? NaN] });
  }
}

/** The page as the browser draws it comes in when the test lets it, as none, with no browser to draw it: each waits on `paints`. */
let paints: Promise<void> = Promise.resolve();

/** Loads at once, and never decodes, but as the drawing of a page, which will not draw. */
class FakeImage extends FakeNode {
  onload: (() => void) | null = null;
  #src = "";

  decode(): Promise<void> {
    return paints.then(() => {
      throw new Error("EncodingError: no browser draws the page");
    });
  }

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

/** Writes a page's copy out as nothing, as its drawing never decodes. */
class FakeSerializer {
  serializeToString(): string {
    return "";
  }
}

/** A page's root, as a fold copies it to have the browser draw it. */
class FakePage extends FakeNode {
  querySelectorAll(): FakeNode[] {
    return [];
  }

  override cloneNode(): FakeNode {
    return new FakePage();
  }
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

const GLOBALS = ["window", "document", "Image", "createImageBitmap", "setTimeout", "clearTimeout", "XMLSerializer"] as const;
const saved = GLOBALS.map((name) => Object.getOwnPropertyDescriptor(globalThis, name));
let frames: FrameRequestCallback[] = [];
/** What listens to the window's resize. */
let resizes = new Set<() => void>();

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
    addEventListener: (_type: string, listener: () => void) => resizes.add(listener),
    removeEventListener: (_type: string, listener: () => void) => resizes.delete(listener),
  };
  const doc = {
    createElement: () => new FakeNode(),
    createElementNS: () => new FakeNode(),
    importNode: (node: FakeNode) => node.cloneNode(),
  };
  Object.defineProperty(globalThis, "window", { configurable: true, value: view });
  Object.defineProperty(globalThis, "document", { configurable: true, value: doc });
  Object.defineProperty(globalThis, "Image", { configurable: true, value: FakeImage });
  Object.defineProperty(globalThis, "createImageBitmap", { configurable: true, value: createBitmap });
  Object.defineProperty(globalThis, "setTimeout", { configurable: true, value: later });
  Object.defineProperty(globalThis, "clearTimeout", { configurable: true, value: cancel });
  Object.defineProperty(globalThis, "XMLSerializer", { configurable: true, value: FakeSerializer });
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
/** The dim over the page the frame draws. */
let cover: FakeNode;
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
  cover = new FakeNode();
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

/** The fold's model of the render, if the fold draws the frames. */
function model(): FakeNode | undefined {
  const node = placed()[1];
  return node?.children.some((child) => child.pen !== null) ? node : undefined;
}

/** The canvases the frames are drawn on, if the fold draws them: the half that stays, then the frame. */
function canvases(): FakeNode[] {
  return (model()?.children ?? []).filter((node) => node.pen !== null);
}

/** The frame drawn on its canvas, by its place among the frames, or -1. */
function turned(): number {
  const src = canvases()[1]?.pen?.drawn.at(-1)?.src ?? "";
  return (DUO_FOLD?.frames ?? []).findIndex((shot) => src.endsWith(shot.file));
}

/** The pictures decoded and not let go of. */
function live(): FakeBitmap[] {
  return bitmaps.filter((bitmap) => !bitmap.closed);
}

/** Let the pictures decode, and see them in. */
async function decodeNow(): Promise<void> {
  letDecode();
  await decodes;
  await Bun.sleep(0);
}

/** As `play`, but letting what decodes come in between frames, as a browser does. */
async function playing(until: number, see: () => void = () => {}): Promise<void> {
  for (let now = 0; now <= until && frames.length > 0; now += 16) {
    for (const callback of frames.splice(0)) callback(now);
    see();
    await Bun.sleep(0);
  }
}

/** Fold from `from` to `to`, drawing what the knobs say, which puts the device back at rest as the frame does. */
function fold(from: ViewportValue, to: ViewportValue, scene: FoldScene): void {
  foldDevice(from, to, scene, (value) => {
    drawn.push(value);
    unit.style.setProperty("transform", "translate(0px, 0px) scale(0.5)");
  });
}

/** As `fold`, the knobs drawn as the frame draws the Duo in its bezels, at rest in the posture they have. */
function foldResting(from: ViewportValue, to: ViewportValue, scene: FoldScene): void {
  foldDevice(from, to, scene, (value) => {
    drawn.push(value);
    restFoldShots(openOf(value.posture));
    unit.style.setProperty("transform", "translate(0px, 0px) scale(0.5)");
  });
}

beforeEach(() => {
  frames = [];
  drawn = [];
  stopFold();
  resizes = new Set();
});

describe("a Duo folding in its frames", () => {
  if (!DUO_FOLD) return;
  const shots = DUO_FOLD;
  /** The halves that stay the frames from `first` to `last` name. */
  const stillsOf = (first: number, last: number) => new Set(shots.frames.slice(first, last + 1).map((shot) => shot.still)).size;
  /** The most decoded at once: the frames round the hinge and ahead of it, and the halves that stay they name. */
  const MOST =
    2 * SHOTS_AROUND + SHOTS_AHEAD + 1 + Math.max(...shots.frames.map((_, at) => stillsOf(at, at + 2 * SHOTS_AROUND + SHOTS_AHEAD)));
  /** The halves that stay a fold decodes as it leaves the open end. */
  const OPEN_STILLS = stillsOf(0, SHOTS_AROUND + SHOTS_AHEAD);
  /** Is a picture one of the halves that stay? */
  const isStill = (bitmap: FakeBitmap) => shots.stills.some((still) => bitmap.src.endsWith(still.file));
  /** The frames decoded and not let go of, by their place. */
  const kept = () =>
    live()
      .map((bitmap) => shots.frames.findIndex((shot) => bitmap.src.endsWith(shot.file)))
      .filter((index) => index >= 0)
      .sort((a, b) => a - b);
  const from = (first: number, last: number) => Array.from({ length: last - first + 1 }, (_, index) => first + index);
  const last = shots.frames.length - 1;
  /** Those a fold from the shut end starts with, and from the open one. */
  const SHUT_END = from(last - SHOTS_AROUND - SHOTS_AHEAD, last);
  const OPEN_END = from(0, SHOTS_AROUND + SHOTS_AHEAD);
  test("loads the frames undecoded, turns copies of the bezels till those round the hinge decode as it starts, then the frames", async () => {
    loadFoldShots();
    await Bun.sleep(0);
    expect(foldShots()).toBeNull();
    fold(SHUT, OPEN, sceneOf());
    // The copies: each side's body, window and shade, then the bend's half that stays.
    expect(placed()).toHaveLength(7);
    play(48);
    expect(placed()).toHaveLength(7);
    await decodeNow();
    // Never all of them: those round the hinge, ahead of it toward open, and the half that stays.
    expect(live().length).toBeGreaterThan(SHOTS_AROUND);
    expect(live().length).toBeLessThanOrEqual(MOST);
    expect(live().some(isStill)).toBe(true);
    expect(live().some((bitmap) => bitmap.src.endsWith(shots.frames[0]?.file ?? "-"))).toBe(false);
    play(64);
    // The bend's half that stays, under the frames.
    expect(placed()).toHaveLength(2);
    expect(canvases()).toHaveLength(2);
    expect(canvases()[1]?.width).toBeGreaterThan(0);
    expect(turned()).toBeGreaterThanOrEqual(0);
    await playing(2000);
    expect(layer()).toBeUndefined();
    // Kept a while, so the next fold has them from its first frame.
    fold(OPEN, SHUT, sceneOf());
    expect(placed()).toHaveLength(2);
    expect(turned()).toBe(0);
    // At rest the device shows as it is drawn, till the hinge moves.
    expect(style(model(), "opacity")).toBe("0");
  });

  test("shows the frame nearest the hinge exactly as rendered, never warped or faded with another, and the page on the screen that faces the viewer", async () => {
    fold(SHUT, OPEN, sceneOf());
    await Bun.sleep(0);
    let open = 0;
    const unwatch = watchHinge((at) => {
      open = at;
    });
    const seen = new Set<number>();
    let glued = false;
    await playing(2000, () => {
      const node = model();
      if (!layer() || !node) return;
      const [still, frame] = canvases();
      expect(canvases()).toHaveLength(2);
      // One frame, laid as rendered at its own crop box, and no other.
      for (const canvas of [still, frame]) {
        expect(style(canvas, "transform")).toBe("");
        expect(canvas?.pen?.drawn).toHaveLength(1);
      }
      expect(style(frame, "opacity")).toBe("");
      const index = turned();
      const shot = shots.frames[index];
      if (!shot) throw new Error("no frame");
      expect(Math.abs(shot.deg - 180 * (1 - open))).toBeLessThanOrEqual(1 + 1e-9);
      seen.add(index);
      // Where the manifest crops it, at the files' scale, from the top left of every frame's box.
      const left = Math.min(...shots.frames.map((one) => one.box[0]));
      const top = Math.min(...shots.frames.map((one) => one.box[1]));
      const [px = 0, py = 0] = shot.pieces[0] ?? [];
      expect(style(frame, "left")).toBe(`${left}px`);
      expect(style(frame, "top")).toBe(`${top}px`);
      expect(frame?.pen?.drawn[0]?.at).toEqual([Math.round((shot.box[0] - left) * shots.scale) + px, Math.round((shot.box[1] - top) * shots.scale) + py]);
      // The half that stays, from the same render as the frame, where it lies in it.
      const kept = shots.stills[shot.still];
      if (!kept) throw new Error("no half that stays");
      const stillLeft = Math.min(...shots.stills.map((one) => one.box[0]));
      const stillTop = Math.min(...shots.stills.map((one) => one.box[1]));
      const [sx = 0, sy = 0] = kept.pieces[0] ?? [];
      expect(style(still, "left")).toBe(`${stillLeft}px`);
      expect(style(still, "top")).toBe(`${stillTop}px`);
      expect(still?.pen?.drawn[0]?.src).toEndWith(kept.file);
      expect(still?.pen?.drawn[0]?.at).toEqual([
        Math.round((kept.box[0] - stillLeft) * shots.scale) + sx,
        Math.round((kept.box[1] - stillTop) * shots.scale) + sy,
      ]);
      const [, inner, outer] = node.children;
      const facing = [inner, outer].filter((one) => style(one, "visibility") === "");
      expect(facing.length).toBeLessThanOrEqual(1);
      if (facing[0]) {
        // Dark a little past the turned screen, and in it a window cut to it, onto the page laid flat, which never turns.
        const [cut] = facing[0].children;
        expect(style(facing[0], "clipPath")).toStartWith('path("M');
        expect(style(cut, "clipPath")).toStartWith('path("M');
        expect(style(cut?.children[0], "transform")).toStartWith("matrix(");
        glued = true;
      }
      expect(style(node, "transform")).toStartWith("matrix(0.3");
      expect(live().length).toBeLessThanOrEqual(MOST);
    });
    unwatch();
    // From shut to open, frames all the way along: more than a few of them, inner and cover both.
    expect(seen.size).toBeGreaterThan(10);
    expect(glued).toBe(true);
    expect(layer()).toBeUndefined();
    expect(drawn.at(-1)).toEqual(OPEN);
    expect(style(unit, "clipPath")).toBe("");
  });

  test("draws every layer at the angle of the frame shown, so a slow hand sees nothing move between frames, and all of it at one", async () => {
    foldDevice(SHUT, OPEN, sceneOf(), (value) => drawn.push(value), true);
    await Bun.sleep(0);
    /** Everything the fold draws the device by, but its fades. */
    const drawing = () => {
      const node = model();
      const [, inner, outer] = node?.children ?? [];
      const glued = [inner, outer].flatMap((one) => [
        style(one, "visibility"),
        style(one, "clipPath"),
        style(one?.children[0], "clipPath"),
        style(one?.children[0]?.children[0], "transform"),
        style(one?.children[0]?.children[0]?.children[1], "background"),
      ]);
      const place = layer()?.children[0];
      const crease = placed()[0];
      return JSON.stringify([
        style(place, "transform"),
        style(node, "transform"),
        style(unit, "transform"),
        style(unit, "clipPath"),
        style(crease, "opacity"),
        style(cover, "opacity"),
        ...glued,
      ]);
    };
    /** Have the fades done, the still half's case all in and the render all over the device? */
    const faded = () => style(canvases()[0], "opacity") === "" && style(model(), "opacity") === "";
    let now = 0;
    let last: { frame: number; drawing: string } | null = null;
    let still = 0;
    let moved = 0;
    // A slow hand: a third of a degree a frame, from shut to all but open.
    for (let target = 0; target <= 0.98; target += 1 / 540) {
      scrubFold(target);
      for (const callback of frames.splice(0)) callback(now);
      now += 16;
      await Bun.sleep(0);
      const frame = turned();
      const seen = { frame, drawing: drawing() };
      if (last && faded() && frame >= 0) {
        if (frame === last.frame) {
          expect(seen.drawing).toBe(last.drawing);
          still += 1;
        } else {
          expect(seen.drawing).not.toBe(last.drawing);
          moved += 1;
        }
      }
      last = faded() ? seen : null;
    }
    expect(still).toBeGreaterThan(100);
    expect(moved).toBeGreaterThan(100);
  });

  test("writes nothing to the page between frames, once the fades are done, and draws it all again at one", async () => {
    foldDevice(SHUT, OPEN, sceneOf(), (value) => drawn.push(value), true);
    await Bun.sleep(0);
    const faded = () => style(canvases()[0], "opacity") === "" && style(model(), "opacity") === "";
    /** Mark what the fold writes each time it draws, to see whether it does again. */
    const mark = () => {
      model()?.style.setProperty("transform", "unwritten");
      unit.style.setProperty("transform", "unwritten");
    };
    let now = 0;
    let last = -1;
    let kept = 0;
    let redrawn = 0;
    for (let target = 0; target <= 0.98; target += 1 / 540) {
      scrubFold(target);
      for (const callback of frames.splice(0)) callback(now);
      now += 16;
      await Bun.sleep(0);
      const frame = turned();
      if (last >= 0 && faded() && frame >= 0) {
        const untouched = [style(model(), "transform"), style(unit, "transform")].every((value) => value === "unwritten");
        expect(untouched).toBe(frame === last);
        if (untouched) kept += 1;
        else redrawn += 1;
      }
      last = faded() ? frame : -1;
      if (faded()) mark();
    }
    expect(kept).toBeGreaterThan(100);
    expect(redrawn).toBeGreaterThan(100);
  });

  test("fades the still half's rendered case in as the hinge leaves an end, then the whole render out once it is still at the other", async () => {
    fold(SHUT, OPEN, sceneOf());
    await Bun.sleep(0);
    const stills: string[] = [];
    const outs: string[] = [];
    const clips: string[] = [];
    await playing(2000, () => {
      const node = model();
      if (!node) return;
      stills.push(style(canvases()[0], "opacity"));
      outs.push(style(node, "opacity"));
      clips.push(style(unit, "clipPath"));
    });
    // In over SHOTS_FADE ms from none, then whole.
    expect(Number(stills[0])).toBeLessThan(0.2);
    expect(stills).toContain("");
    const firstWhole = stills.indexOf("");
    expect(firstWhole * 16).toBeGreaterThanOrEqual(SHOTS_FADE - 32);
    // The device shows only its still half while that fades in, then only its screen, under the rendered case.
    expect(clips.find((clip) => clip !== "")).toContain("100000px");
    expect(clips[firstWhole + 1]).not.toContain("100000px");
    // Out over SHOTS_FADE ms, the device at rest under it, then the layer goes.
    const fading = outs.slice(outs.lastIndexOf("") + 1).map(Number);
    expect(fading.length).toBeGreaterThanOrEqual(SHOTS_FADE / 16 - 2);
    expect(fading.every((value, index) => index === 0 || value <= (fading[index - 1] ?? 1))).toBe(true);
    expect(clips.at(-1)).toBe("");
    expect(layer()).toBeUndefined();
    expect(drawn.at(-1)).toEqual(OPEN);
  });

  test("goes back from where it got to, shutting, and turns the frames a quarter held upright", async () => {
    const scene = sceneOf();
    fold(OPEN_UPRIGHT, SHUT_ACROSS, scene);
    await Bun.sleep(0);
    expect(style(model(), "transform")).toStartWith("matrix(0, -0.3");
    const angles: number[] = [];
    const at = () => {
      if (layer()) angles.push(turned());
    };
    await playing(150, at);
    const furthest = Math.max(...angles);
    fold(SHUT_ACROSS, OPEN_UPRIGHT, scene);
    expect(folding()).toBe(true);
    await playing(2000, at);
    expect(layer()).toBeUndefined();
    expect(drawn.at(-1)).toEqual(OPEN_UPRIGHT);
    // It turned toward shut, then all the way back to the open frame.
    expect(furthest).toBeGreaterThan(0);
    expect(angles.at(-1)).toBe(0);
  });

  test("shows the nearest frame decoded where those round the hinge are not in yet, never a blank case", async () => {
    fold(SHUT, OPEN, sceneOf());
    await Bun.sleep(0);
    play(16);
    const first = turned();
    expect(first).toBeGreaterThanOrEqual(0);
    // No decode comes in between these frames: it stays on the nearest it has, and catches up once they do.
    const shown: number[] = [];
    play(200, () => shown.push(turned()));
    expect(shown.every((index) => index >= 0)).toBe(true);
    await playing(2000);
    expect(layer()).toBeUndefined();
  });

  test("lets go of the frames it leaves behind as it goes, and keeps at most those round the hinge and ahead", async () => {
    fold(SHUT, OPEN, sceneOf());
    await Bun.sleep(0);
    let most = 0;
    await playing(2000, () => {
      most = Math.max(most, live().length);
    });
    expect(most).toBeLessThanOrEqual(MOST);
    // Landed open: only those round the open end, and their halves that stay.
    const left = live().map((bitmap) => shots.frames.findIndex((shot) => bitmap.src.endsWith(shot.file)));
    expect(left.filter((index) => index > SHOTS_AROUND)).toEqual([]);
    const stills = live().filter(isStill);
    expect(left.filter((index) => index < 0)).toHaveLength(stills.length);
    const open = new Set(shots.frames.slice(0, SHOTS_AROUND + 1).map((shot) => shots.stills[shot.still]?.file));
    expect(stills.every((bitmap) => [...open].some((file) => file && bitmap.src.endsWith(file)))).toBe(true);
  });

  test("lets go of the pictures a while after it lands, or once the Duo is not shown, and decodes them again", async () => {
    fold(SHUT, OPEN, sceneOf());
    await Bun.sleep(0);
    await playing(2000);
    expect(layer()).toBeUndefined();
    wait(SHOTS_KEPT - 1);
    expect(foldShots()).not.toBeNull();
    wait(SHOTS_KEPT);
    expect(foldShots()).toBeNull();
    expect(bitmaps.every((bitmap) => bitmap.closed)).toBe(true);
    // A fold decodes those round its hinge again, and one in the while after it keeps them.
    bitmaps = [];
    fold(OPEN, SHUT, sceneOf());
    await Bun.sleep(0);
    expect(bitmaps).toHaveLength(SHOTS_AROUND + SHOTS_AHEAD + 1 + OPEN_STILLS);
    await playing(2000);
    fold(SHUT, OPEN, sceneOf());
    wait(SHOTS_KEPT);
    expect(foldShots()).not.toBeNull();
    await playing(2000);
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
    await Bun.sleep(0);
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
    await playing(2000);
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
    // Forgotten, the frame lets go of the pictures at once, and of those under way as they come in.
    expect(foldShots()).toBeNull();
    await Bun.sleep(0);
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
    await playing(2000);
    expect(layer()).toBeUndefined();
  });

  test("decodes those a fold starts with ahead of it while the Duo rests in its bezels, keeps them, and lets go of them once it is not shown", async () => {
    forgetFold();
    await Bun.sleep(0);
    const shut = { ...BASE, orientation: "portrait", posture: "closed" } as const;
    bitmaps = [];
    // As the frame does drawing the Duo shut in its bezels, which are not loaded here.
    restFoldShots(0);
    expect(bitmaps).toHaveLength(0);
    await Bun.sleep(0);
    expect(kept()).toEqual(from(last - SHOTS_AROUND - SHOTS_AHEAD, last));
    expect(live().some(isStill)).toBe(true);
    // No timer lets go of them at rest.
    wait(SHOTS_KEPT);
    expect(foldShots()).not.toBeNull();
    // A fold has them on its first draw, though the knobs draw the other posture a moment as it starts.
    const before = bitmaps.length;
    const scene = sceneOf();
    foldDevice(SHUT, OPEN, scene, (value) => {
      drawn.push(value);
      restFoldShots(openOf(value.posture));
      unit.style.setProperty("transform", "translate(0px, 0px) scale(0.5)");
    });
    expect(placed()).toHaveLength(2);
    expect(turned()).toBe(last);
    await Bun.sleep(0);
    expect(bitmaps.slice(0, before).every((bitmap) => !bitmap.closed)).toBe(true);
    await playing(2000);
    expect(layer()).toBeUndefined();
    expect(drawn.at(-1)).toEqual(OPEN);
    await Bun.sleep(0);
    // Landed open: those a fold from there starts with, and no more, with no timer to let go of them.
    expect(kept()).toEqual(from(0, SHOTS_AROUND + SHOTS_AHEAD));
    expect(live().length).toBeLessThanOrEqual(MOST);
    wait(SHOTS_KEPT);
    expect(foldShots()).not.toBeNull();
    // Drawn again at rest, nothing more decodes.
    const all = bitmaps.length;
    restFoldShots(1);
    await Bun.sleep(0);
    expect(bitmaps).toHaveLength(all);
    // Another device, or the mock off: let go of at once, and none decode for it.
    bodyOf({ ...shut, device: "iphone-16-pro" }, () => {});
    await Bun.sleep(0);
    expect(foldShots()).toBeNull();
    expect(bitmaps.every((bitmap) => bitmap.closed)).toBe(true);
    expect(bitmaps).toHaveLength(all);
    restFoldShots(1);
    bodyOf({ ...shut, mock: false }, () => {});
    await Bun.sleep(0);
    expect(foldShots()).toBeNull();
    expect(bitmaps.every((bitmap) => bitmap.closed)).toBe(true);
    // Forgotten with the frame, they go at once.
    restFoldShots(1);
    await Bun.sleep(0);
    expect(foldShots()).not.toBeNull();
    forgetFold();
    expect(foldShots()).toBeNull();
  });

  test("started by the knobs before its frames are in, stays at rest on the copies till they are, then turns the frames from its first step", async () => {
    forgetFold();
    await Bun.sleep(0);
    const opens: number[] = [];
    const unwatch = watchHinge((open) => opens.push(open));
    fold(SHUT, OPEN, sceneOf());
    expect(placed()).toHaveLength(7);
    // No decode comes in between these frames.
    play(48);
    expect(placed()).toHaveLength(7);
    expect(opens.length).toBeGreaterThan(1);
    expect(opens.every((open) => open === 0)).toBe(true);
    await Bun.sleep(0);
    play(0);
    expect(canvases()).toHaveLength(2);
    // That frame draws it at rest still, on the frames, and the next moves it.
    expect(opens.at(-1)).toBe(0);
    for (const callback of frames.splice(0)) callback(16);
    unwatch();
    expect(opens.at(-1)).toBeGreaterThan(0);
    await playing(2000);
    expect(layer()).toBeUndefined();
    expect(drawn.at(-1)).toEqual(OPEN);
  });

  test("started by the knobs with those it starts with decoded at rest, turns the frames from the click's next frame", async () => {
    forgetFold();
    await Bun.sleep(0);
    restFoldShots(0);
    await Bun.sleep(0);
    const opens: number[] = [];
    const unwatch = watchHinge((open) => opens.push(open));
    foldResting(SHUT, OPEN, sceneOf());
    expect(placed()).toHaveLength(2);
    // The click's next frame draws it at rest still, and the one after is as far on as its time takes it.
    play(0);
    expect(opens.at(-1)).toBe(0);
    for (const callback of frames.splice(0)) callback(16);
    unwatch();
    expect(opens.at(-1)).toBeCloseTo(16 / FOLD_TIME, 9);
    expect(turned()).toBeGreaterThanOrEqual(0);
    stopFold();
  });

  test("keeps those round the hinge of a fold on its way, though the Duo is drawn at rest at the other end meanwhile", async () => {
    forgetFold();
    await Bun.sleep(0);
    fold(SHUT, OPEN, sceneOf());
    await Bun.sleep(0);
    const round = live();
    expect(kept()).toEqual(SHUT_END);
    restFoldShots(1);
    await Bun.sleep(0);
    expect(round.every((bitmap) => !bitmap.closed)).toBe(true);
    expect(kept()).toEqual(SHUT_END);
    stopFold();
  });

  test("keeps those decoded at rest, though a fold that ended before the Duo was drawn at rest left a timer to let go of them", async () => {
    forgetFold();
    await Bun.sleep(0);
    // Not drawn at rest as it lands: let go of a while after.
    fold(SHUT, OPEN, sceneOf());
    await playing(2000);
    expect(layer()).toBeUndefined();
    expect(timers.length).toBeGreaterThan(0);
    restFoldShots(1);
    await Bun.sleep(0);
    wait(SHOTS_KEPT);
    expect(foldShots()).not.toBeNull();
    expect(kept()).toEqual(OPEN_END);
  });

  test("stopped on its way with the Duo at rest, keeps those a fold from the end it is drawn at starts with, with no timer to let go of them", async () => {
    forgetFold();
    await Bun.sleep(0);
    restFoldShots(0);
    await Bun.sleep(0);
    foldResting(SHUT, OPEN, sceneOf());
    await playing(32);
    // The end the device was last drawn at, which it is shown at once stopped.
    const end = drawn.at(-1)?.posture === "open" ? OPEN_END : SHUT_END;
    stopFold();
    await Bun.sleep(0);
    wait(2 * SHOTS_KEPT);
    expect(foldShots()).not.toBeNull();
    expect(kept()).toEqual(end);
  });

  test("let go of in the middle of a fold, then drawn at rest again before it ends, keeps those a fold from there starts with once it has", async () => {
    forgetFold();
    await Bun.sleep(0);
    fold(SHUT, OPEN, sceneOf());
    await Bun.sleep(0);
    play(100);
    // As the frame does drawing the knobs with the mock off, then on again.
    bodyOf({ ...BASE, mock: false, orientation: "portrait", posture: "closed" }, () => {});
    restFoldShots(1);
    await playing(2000);
    expect(layer()).toBeUndefined();
    await Bun.sleep(0);
    expect(foldShots()).not.toBeNull();
    expect(kept()).toEqual(OPEN_END);
    wait(2 * SHOTS_KEPT);
    expect(kept()).toEqual(OPEN_END);
  });
});

describe("a fold the knobs start, waiting for the pictures of the page", () => {
  /** Let the pictures the test's folds wait for come in. */
  let letPaint: () => void = () => {};
  let now = 0;
  /** Where the hinge was drawn each time, and whether a hand sent it there. */
  let seen: { open: number; hand: boolean }[] = [];
  let unwatch: () => void = () => {};

  beforeEach(() => {
    paints = new Promise<void>((resolve) => {
      letPaint = resolve;
    });
    now = 0;
    seen = [];
    unwatch = watchHinge((open, hand) => seen.push({ open, hand }));
  });

  afterEach(() => {
    unwatch();
    stopFold();
  });

  /** The frame with a page in it the browser is asked to draw, and no bezels, so the fold turns copies. */
  function paged(): FoldScene {
    const page = {
      documentElement: new FakePage(),
      styleSheets: [],
      implementation: { createHTMLDocument: () => ({ importNode: () => new FakePage(), createElement: () => new FakeNode() }) },
      querySelectorAll: () => [],
    };
    const frame = Object.assign(new FakeNode(), {
      contentDocument: page,
      contentWindow: { innerWidth: 400, innerHeight: 600, scrollX: 0, scrollY: 0 },
    });
    return { ...sceneOf(), frame: frame as unknown as HTMLIFrameElement, body: () => null };
  }

  /** Run `count` frames, 16 ms apart, on from the last, letting what settles come in after each. */
  async function run(count: number): Promise<void> {
    for (let index = 0; index < count; index += 1) {
      for (const callback of frames.splice(0)) callback(now);
      now += 16;
      await Bun.sleep(0);
    }
  }

  /** Everything the fold draws: its layer, the frame's own device, and the dim over the page. */
  function look(): string {
    const styles = (node: FakeNode): unknown => [node.style, node.hidden, node.children.map(styles)];
    const up = layer();
    return JSON.stringify([up ? styles(up) : null, unit.style, cover.style, cover.hidden]);
  }

  /** A hand takes the hinge of a fold from `from` toward `to`, drawing what the knobs say. */
  function hold(from: ViewportValue, to: ViewportValue, scene: FoldScene): boolean {
    return foldDevice(from, to, scene, (value) => drawn.push(value), true);
  }

  const moved = () => seen.some((at) => at.open !== 0);

  test("stays at rest, drawn as a hand holding it there has it, till the pictures are in, then folds from the next frame", async () => {
    hold(SHUT, OPEN, paged());
    const rest = look();
    stopFold();
    seen = [];
    fold(SHUT, OPEN, paged());
    expect(look()).toBe(rest);
    for (let frame = 0; frame < 5; frame += 1) {
      await run(1);
      expect(frames).toHaveLength(1);
      expect(look()).toBe(rest);
    }
    expect(moved()).toBe(false);
    // Nothing of the page's pictures, the dim or a cut shows: the side that lies shut has its screen, window and shade clear.
    const [, , , side, window, shade] = placed();
    expect([style(side?.children[0], "opacity"), style(window, "opacity"), style(shade, "opacity")]).toEqual(["0", "0", "0"]);
    expect(cover.hidden).toBe(true);
    expect(style(unit, "clipPath")).toBe("");
    letPaint();
    await Bun.sleep(0);
    // The frame they are in by draws it at rest still, and each after as far on as its time takes it.
    await run(1);
    expect(moved()).toBe(false);
    expect(look()).toBe(rest);
    await run(1);
    expect(seen.at(-1)?.open).toBeCloseTo(16 / FOLD_TIME, 9);
    await run(1);
    expect(seen.at(-1)?.open).toBeCloseTo(32 / FOLD_TIME, 9);
    expect(seen.every((at) => !at.hand)).toBe(true);
    await run(200);
    expect(folding()).toBe(false);
    expect(drawn.at(-1)).toEqual(OPEN);
  });

  test("folds with what it has once it has waited long enough, where the pictures do not come in", async () => {
    fold(SHUT, OPEN, paged());
    // Its first frame, then each of the wait but the last.
    await run(Math.ceil(FOLD_WAIT / 16));
    expect(now - 16).toBeLessThan(FOLD_WAIT);
    expect(moved()).toBe(false);
    // The frame its wait ends draws it at rest still, and the next moves it.
    await run(1);
    expect(moved()).toBe(false);
    await run(1);
    expect(seen.at(-1)?.open).toBeGreaterThan(0);
    await run(200);
    expect(folding()).toBe(false);
    expect(drawn.at(-1)).toEqual(OPEN);
  });

  test("pressed again the same way while it waits, waits on, and folded back, lands where it started without moving", async () => {
    const scene = paged();
    fold(SHUT, OPEN, scene);
    const rest = look();
    await run(2);
    fold(SHUT, OPEN, scene);
    await run(2);
    expect(folding()).toBe(true);
    expect(look()).toBe(rest);
    const before = drawn.length;
    fold(OPEN, SHUT, scene);
    expect(look()).toBe(rest);
    await run(1);
    expect(folding()).toBe(false);
    expect(layer()).toBeUndefined();
    expect(drawn.slice(before)).toEqual([SHUT]);
    expect(moved()).toBe(false);
    // The pictures in after it, nothing folds or draws.
    letPaint();
    await Bun.sleep(0);
    await run(20);
    expect(frames).toHaveLength(0);
    expect(drawn).toHaveLength(before + 1);
    expect(moved()).toBe(false);
  });

  test("folded back while it waits, then on again, waits on and folds once the pictures are in", async () => {
    const scene = paged();
    fold(SHUT, OPEN, scene);
    await run(2);
    fold(OPEN, SHUT, scene);
    fold(SHUT, OPEN, scene);
    await run(2);
    expect(folding()).toBe(true);
    expect(moved()).toBe(false);
    letPaint();
    await Bun.sleep(0);
    await run(200);
    expect(folding()).toBe(false);
    expect(drawn.at(-1)).toEqual(OPEN);
  });

  test("taken by a hand while it waits, follows the hand at once, and lands where it is let go", async () => {
    const scene = paged();
    fold(SHUT, OPEN, scene);
    await run(2);
    expect(hold(SHUT, OPEN, scene)).toBe(true);
    expect(holdingHinge()).toBe(true);
    expect(scrubFold(0.5)).toBe(true);
    expect(frames).toHaveLength(1);
    await run(1);
    expect(seen.at(-1)?.open).toBeGreaterThan(0);
    expect(seen.at(-1)?.hand).toBe(true);
    // It stays where the hand holds it, and its steps stop, the pictures in or not.
    await run(200);
    expect(folding()).toBe(true);
    expect(frames).toHaveLength(0);
    expect(seen.at(-1)?.open).toBe(0.5);
    letPaint();
    await Bun.sleep(0);
    await run(5);
    expect(frames).toHaveLength(0);
    expect(releaseFold(0, false)).toBe(true);
    await run(200);
    expect(folding()).toBe(false);
    expect(drawn.at(-1)).toEqual(SHUT);
  });

  test("started by a hand, does not wait: it follows the hand from the next frame, the pictures in or not", async () => {
    expect(hold(SHUT, OPEN, paged())).toBe(true);
    expect(scrubFold(0.5)).toBe(true);
    await run(1);
    expect(seen.at(-1)?.open).toBeGreaterThan(0);
    expect(seen.at(-1)?.hand).toBe(true);
  });

  test("let go of by a hand while it waits, goes where it is let go from the next frame, the pictures in or not", async () => {
    fold(SHUT, OPEN, paged());
    await run(1);
    expect(moved()).toBe(false);
    expect(releaseFold(1, false)).toBe(true);
    // The next frame draws it at rest still, and the one after moves it.
    await run(1);
    expect(now - 16).toBeLessThan(FOLD_WAIT);
    expect(moved()).toBe(false);
    await run(1);
    expect(seen.at(-1)?.open).toBeGreaterThan(0);
    await run(200);
    expect(folding()).toBe(false);
    expect(drawn.at(-1)).toEqual(OPEN);
  });

  test("let go of while it waits, landed, stopped or forgotten, goes at once and nothing folds after", async () => {
    fold(SHUT, OPEN, paged());
    await run(1);
    // With less motion, it lands the next frame.
    expect(releaseFold(1, true)).toBe(true);
    await run(1);
    expect(folding()).toBe(false);
    expect(drawn.at(-1)).toEqual(OPEN);
    fold(SHUT, OPEN, paged());
    await run(1);
    holdFold(OPEN);
    expect(folding()).toBe(true);
    finishFold();
    expect(folding()).toBe(false);
    expect(layer()).toBeUndefined();
    expect(drawn.at(-1)).toEqual(OPEN);
    fold(SHUT, OPEN, paged());
    await run(1);
    stopFold();
    expect(layer()).toBeUndefined();
    expect(style(unit, "transform")).toBe("translate(0px, 0px) scale(0.5)");
    fold(SHUT, OPEN, paged());
    await run(1);
    forgetFold();
    expect(folding()).toBe(false);
    const before = drawn.length;
    letPaint();
    await Bun.sleep(0);
    await run(20);
    expect(drawn).toHaveLength(before);
    expect(moved()).toBe(false);
  });
});

describe("a fold no hand holds", () => {
  /** How far the hinge goes in a step. */
  const stride = HINGE_STEP / FOLD_TIME;
  const draw = (now: number) => {
    for (const callback of frames.splice(0)) callback(now);
  };
  /** No bezels, so it turns copies, and no page to wait for the pictures of. */
  const bare = (): FoldScene => ({ ...sceneOf(), body: () => null });
  /** A hand takes the hinge of a fold from `from` toward `to`. */
  const hold = (from: ViewportValue, to: ViewportValue, scene: FoldScene) =>
    foldDevice(from, to, scene, (value) => drawn.push(value), true);

  for (const rate of [60, 120, 144]) {
    for (const [from, to] of [
      [SHUT, OPEN],
      [OPEN, SHUT],
    ] as const) {
      test(`at ${rate} Hz, ${to.posture}, is drawn at rest in its first frame, then as far on as the time since takes it, and lands a whole fold's time in`, () => {
        const opens: number[] = [];
        const unwatch = watchHinge((open) => opens.push(open));
        const start = openOf(from.posture);
        const toward = openOf(to.posture) - start;
        const gap = 1000 / rate;
        fold(from, to, bare());
        expect(opens).toEqual([start]);
        // Its first frame, whenever it comes, draws it where it rests.
        const first = 1000;
        draw(first);
        expect(opens).toEqual([start, start]);
        let frame = 1;
        for (; frame < 2 * rate && folding(); frame += 1) {
          const before = opens.at(-1) ?? start;
          draw(first + frame * gap);
          if (!folding()) break;
          expect(opens.at(-1)).toBeCloseTo(start + (toward * frame * gap) / FOLD_TIME, 9);
          // No frame moves it further than its own time takes it.
          expect(((opens.at(-1) ?? start) - before) * toward).toBeCloseTo(gap / FOLD_TIME, 9);
        }
        unwatch();
        // It lands in the first frame a whole fold's time in, and the one before drew it short of there.
        expect(frame * gap).toBeGreaterThan(FOLD_TIME - 0.1);
        expect(frame * gap).toBeLessThan(FOLD_TIME + gap);
        expect(Math.abs((opens.at(-1) ?? start) - start)).toBeLessThan(1);
        expect(frames).toHaveLength(0);
        expect(drawn.at(-1)).toEqual(to);
      });
    }
  }

  for (const rate of [60, 120, 144]) {
    const gap = 1000 / rate;

    test(`at ${rate} Hz, folded back on its way, turns round where it is drawn and goes back at the same speed`, () => {
      const opens: number[] = [];
      const unwatch = watchHinge((open) => opens.push(open));
      const scene = bare();
      fold(SHUT, OPEN, scene);
      // Turned between two steps of its hinge, where its frames are not its steps.
      const turn = Math.ceil((10.3 * HINGE_STEP) / gap);
      for (let frame = 0; frame <= turn; frame += 1) draw(frame * gap);
      const there = opens.at(-1) ?? 0;
      expect(there).toBeCloseTo((turn * gap) / FOLD_TIME, 9);
      if (rate !== 60) expect((there / stride) % 1).toBeGreaterThan(0.01);
      fold(OPEN, SHUT, scene);
      expect(opens.at(-1)).toBe(there);
      let frame = 1;
      for (; frame < 2 * rate; frame += 1) {
        draw((turn + frame) * gap);
        if (!folding()) break;
        expect(opens.at(-1)).toBeCloseTo(there - (frame * gap) / FOLD_TIME, 9);
      }
      unwatch();
      // As long back as it took there.
      expect(frame * gap).toBeGreaterThan(turn * gap - 0.1);
      expect(frame * gap).toBeLessThan((turn + 1) * gap);
      expect(drawn.at(-1)).toEqual(SHUT);
    });

    test(`at ${rate} Hz, taken by a hand on its way, goes on from where it is drawn, a spring's step at most`, () => {
      const opens: number[] = [];
      const unwatch = watchHinge((open) => opens.push(open));
      const scene = bare();
      fold(SHUT, OPEN, scene);
      const taken = Math.ceil((10.3 * HINGE_STEP) / gap);
      for (let frame = 0; frame <= taken; frame += 1) draw(frame * gap);
      const there = opens.at(-1) ?? 0;
      expect(hold(SHUT, OPEN, scene)).toBe(true);
      expect(scrubFold(1)).toBe(true);
      // The spring's step from there, as fast as the fold went.
      const step = hingeAfter({ position: there, velocity: 1000 / FOLD_TIME }, 1, 1).position - there;
      draw((taken + 1) * gap);
      const next = opens.at(-1) ?? 0;
      expect(next).toBeGreaterThanOrEqual(there);
      expect(next - there).toBeCloseTo((step * gap) / HINGE_STEP, 9);
      for (let frame = 2; frame < 20; frame += 1) {
        const before = opens.at(-1) ?? 0;
        draw((taken + frame) * gap);
        expect(opens.at(-1)).toBeGreaterThan(before);
        expect((opens.at(-1) ?? 0) - before).toBeLessThan(2 * stride);
      }
      unwatch();
      expect(holdingHinge()).toBe(true);
    });
  }
});

describe("a fold whose draw comes late", () => {
  test("takes a few steps of its hinge in that draw, not all those due, and goes on from there a step a draw", () => {
    const opens: number[] = [];
    const unwatch = watchHinge((open) => opens.push(open));
    /** Where the hinge is after `steps` steps from shut toward open. */
    const after = (steps: number) => hingeAfter({ position: 0, velocity: 0 }, 1, steps, hingeLinear).position;
    const draw = (now: number) => {
      for (const callback of frames.splice(0)) callback(now);
    };
    // No bezels, so it turns copies, and no page to wait for the pictures of.
    fold(SHUT, OPEN, { ...sceneOf(), body: () => null });
    for (const now of [0, 16, 33]) draw(now);
    // A step taken, and on its way to the second, as its first draw drew it at rest.
    const before = opens.at(-1) ?? 0;
    expect(before).toBeGreaterThan(after(1));
    expect(before).toBeLessThanOrEqual(after(2));
    // A second late, a whole number of steps: sixty are due.
    draw(1033);
    expect(folding()).toBe(true);
    expect(opens.at(-1)).toBeGreaterThan(after(1 + HINGE_CATCH_UP));
    expect(opens.at(-1)).toBeLessThanOrEqual(after(2 + HINGE_CATCH_UP));
    expect((opens.at(-1) ?? 0) - before).toBeCloseTo((HINGE_CATCH_UP * HINGE_STEP) / FOLD_TIME, 9);
    // On time again, a step a draw from where it got to.
    for (let step = 1; step <= 5; step += 1) {
      draw(1033 + step * HINGE_STEP);
      expect(opens.at(-1)).toBeGreaterThan(after(1 + HINGE_CATCH_UP + step));
      expect(opens.at(-1)).toBeLessThanOrEqual(after(2 + HINGE_CATCH_UP + step));
    }
    unwatch();
    for (let now = 1133; now < 4000 && frames.length > 0; now += 16) draw(now);
    expect(folding()).toBe(false);
    expect(drawn.at(-1)).toEqual(OPEN);
  });
});

describe("a hand on a foldable's hinge", () => {
  /** A hand takes the hinge of a fold from `from` toward `to`, drawing what the knobs say. */
  function hold(from: ViewportValue, to: ViewportValue, scene: FoldScene): boolean {
    return foldDevice(
      from,
      to,
      scene,
      (value) => {
        drawn.push(value);
        unit.style.setProperty("transform", "translate(0px, 0px) scale(0.5)");
      },
      true,
    );
  }

  test("takes it where it is, and holds it there till the hand moves", () => {
    expect(hold(SHUT, OPEN, sceneOf())).toBe(true);
    play(1000);
    expect(folding()).toBe(true);
    expect(layer()).toBeDefined();
    // The steps stop while it stays, and the device is drawn shut as the knobs have it.
    expect(frames).toHaveLength(0);
    expect(drawn.at(-1)).toEqual(SHUT);
    expect(foldRest()).toBeNull();
  });

  test("takes nothing without a frame to fold in, and draws nothing", () => {
    const scene = { ...sceneOf(), screenFor: () => null };
    expect(hold(SHUT, OPEN, scene)).toBe(false);
    expect(folding()).toBe(false);
    expect(drawn).toHaveLength(0);
  });

  test("follows the hand through the spring, and lands at the end it is let go at", async () => {
    hold(SHUT, OPEN, sceneOf());
    expect(scrubFold(0.6)).toBe(true);
    await playing(48);
    // On its way, the device is drawn open past the hand over, as a fold draws it, at the frame shown where it draws the frames.
    expect(drawn.at(-1)).toEqual(OPEN);
    play(2000);
    expect(layer()).toBeDefined();
    expect(frames).toHaveLength(0);
    // Moved on, it wakes and goes there.
    expect(scrubFold(1)).toBe(true);
    expect(frames).toHaveLength(1);
    expect(releaseFold(1, false)).toBe(true);
    expect(scrubFold(0.5)).toBe(false);
    play(2000);
    expect(folding()).toBe(false);
    expect(layer()).toBeUndefined();
    expect(drawn.at(-1)).toEqual(OPEN);
  });

  test("follows the hand through its spring, slower at first than a fold no hand holds", () => {
    const opens: number[] = [];
    hold(SHUT, OPEN, { ...sceneOf(), body: () => null });
    const unwatch = watchHinge((open) => opens.push(open));
    scrubFold(0.9);
    // Drawn as each step is due, its first in its first draw.
    for (let step = 0; step < 12; step += 1) {
      for (const callback of frames.splice(0)) callback(step * HINGE_STEP);
    }
    unwatch();
    expect(opens).toHaveLength(12);
    opens.forEach((open, step) => {
      expect(open).toBeCloseTo(hingeAfter({ position: 0, velocity: 0 }, 0.9, step + 1).position, 9);
    });
    expect(opens[0]).toBeGreaterThan(0);
    expect(opens[0]).toBeLessThan(HINGE_STEP / FOLD_TIME);
    // It speeds up, as no fold at one speed does.
    expect((opens[5] ?? 0) - (opens[4] ?? 0)).toBeGreaterThan(2 * (opens[0] ?? 0));
  });

  for (const rate of [120, 144]) {
    test(`at ${rate} Hz, let go of a fast spring, goes on from where it is drawn, never back`, () => {
      const opens: number[] = [];
      const gap = 1000 / rate;
      hold(SHUT, OPEN, { ...sceneOf(), body: () => null });
      const unwatch = watchHinge((open) => opens.push(open));
      scrubFold(1);
      for (let frame = 0; frame < 13; frame += 1) {
        for (const callback of frames.splice(0)) callback(frame * gap);
      }
      const there = opens.at(-1) ?? 0;
      expect(there).toBeGreaterThan(0.2);
      releaseFold(1, false);
      for (let frame = 1; frame <= 10; frame += 1) {
        for (const callback of frames.splice(0)) callback((12 + frame) * gap);
        expect(opens.at(-1)).toBeCloseTo(there + (frame * gap) / FOLD_TIME, 9);
      }
      unwatch();
      for (let now = 23 * gap; now < 2000 && frames.length > 0; now += gap) {
        for (const callback of frames.splice(0)) callback(now);
      }
      expect(folding()).toBe(false);
      expect(drawn.at(-1)).toEqual(OPEN);
    });
  }

  test("let go on its way, goes on to the stop at a fold's one speed, whatever the spring's was", () => {
    const opens: number[] = [];
    hold(SHUT, OPEN, { ...sceneOf(), body: () => null });
    scrubFold(0.9);
    play(96);
    const unwatch = watchHinge((open) => opens.push(open));
    releaseFold(1, false);
    for (let now = 112; now <= 2000 && frames.length > 0; now += 16) {
      for (const callback of frames.splice(0)) callback(now);
    }
    unwatch();
    expect(folding()).toBe(false);
    expect(drawn.at(-1)).toEqual(OPEN);
    // Between the ends when let go, with the spring at speed, then as far each draw, but for a last shorter step.
    expect(opens[0]).toBeGreaterThan(0.1);
    expect(opens[0]).toBeLessThan(0.7);
    expect(opens.length).toBeGreaterThan(10);
    const steps = opens.slice(1).map((open, index) => open - (opens[index] ?? 0));
    for (const step of steps.slice(0, -2)) expect(step).toBeCloseTo(16 / FOLD_TIME, 9);
    for (const step of steps) expect(step).toBeGreaterThan(0);
    expect(opens.at(-1)).toBeLessThanOrEqual(1);
  });

  test("let go back at the end it came from, lands there", () => {
    hold(SHUT, OPEN, sceneOf());
    scrubFold(0.5);
    play(200);
    releaseFold(0, false);
    play(2000);
    expect(folding()).toBe(false);
    expect(drawn.at(-1)).toEqual(SHUT);
  });

  test("let go between the ends, rests there half open till the knobs change", () => {
    hold(SHUT, OPEN, sceneOf());
    scrubFold(0.7);
    play(100);
    releaseFold(0.333, false);
    expect(foldRest()).toBe(0.333);
    play(3000);
    expect(folding()).toBe(true);
    expect(layer()).toBeDefined();
    expect(frames).toHaveLength(0);
    expect(foldRest()).toBe(0.333);
    // Any other change of the knobs lands it as they have it, shut.
    holdFold(SHUT);
    expect(folding()).toBe(false);
    expect(layer()).toBeUndefined();
    expect(drawn.at(-1)).toEqual(SHUT);
  });

  test("resting half open, lands as the knobs have it once the window changes size", () => {
    hold(OPEN, SHUT, sceneOf());
    releaseFold(0.333, false);
    play(3000);
    expect(resizes.size).toBe(1);
    for (const listener of Array.from(resizes)) listener();
    expect(folding()).toBe(false);
    expect(drawn.at(-1)).toEqual(OPEN);
    expect(resizes.size).toBe(0);
  });

  test("with less motion, lands the next frame once let go", () => {
    hold(SHUT, OPEN, sceneOf());
    scrubFold(0.4);
    play(100);
    releaseFold(1, true);
    play(16);
    expect(folding()).toBe(false);
    expect(drawn.at(-1)).toEqual(OPEN);
  });

  test("with less motion, taken again at the stop before the next frame, is drawn there and rests", () => {
    const opens: number[] = [];
    const scene = { ...sceneOf(), body: () => null };
    hold(SHUT, OPEN, scene);
    const unwatch = watchHinge((open) => opens.push(open));
    scrubFold(0.6);
    for (let frame = 0; frame < 13; frame += 1) {
      for (const callback of frames.splice(0)) callback(frame * 16);
    }
    expect(opens.at(-1)).toBeGreaterThan(0.34);
    releaseFold(0.333, true);
    // No frame between: the hand finds the hinge at the stop, not where it was last drawn.
    expect(hold(SHUT, OPEN, scene)).toBe(true);
    scrubFold(0.333);
    for (let frame = 13; frame < 16; frame += 1) {
      for (const callback of frames.splice(0)) callback(frame * 16);
      expect(opens.at(-1)).toBe(0.333);
    }
    unwatch();
    expect(frames).toHaveLength(0);
  });

  test("let go of by the knobs folding it, goes where they say", () => {
    const scene = sceneOf();
    hold(SHUT, OPEN, scene);
    scrubFold(0.3);
    play(100);
    fold(SHUT, OPEN, scene);
    expect(scrubFold(0.1)).toBe(false);
    play(2000);
    expect(folding()).toBe(false);
    expect(drawn.at(-1)).toEqual(OPEN);
  });

  test("takes a fold on its way, which then stays where the hand holds it", () => {
    const scene = sceneOf();
    fold(SHUT, OPEN, scene);
    play(100);
    expect(hold(SHUT, OPEN, scene)).toBe(true);
    scrubFold(0.5);
    play(3000);
    expect(folding()).toBe(true);
    releaseFold(0, false);
    play(2000);
    expect(drawn.at(-1)).toEqual(SHUT);
  });

  test("lets whoever watches know once a fold is over, however it ends", () => {
    let told = 0;
    const unwatch = watchFold(() => {
      told += 1;
    });
    hold(SHUT, OPEN, sceneOf());
    releaseFold(0.333, false);
    play(3000);
    expect(told).toBe(0);
    holdFold(SHUT);
    expect(told).toBe(1);
    fold(SHUT, OPEN, sceneOf());
    stopFold();
    expect(told).toBe(2);
    unwatch();
    fold(SHUT, OPEN, sceneOf());
    play(2000);
    expect(told).toBe(2);
  });
});

describe("the fold chip beside a hand on the hinge", () => {
  /** A hand takes the hinge of a fold from `from` toward `to`, drawing what the knobs say. */
  function hold(from: ViewportValue, to: ViewportValue, scene: FoldScene): boolean {
    return foldDevice(from, to, scene, (value) => drawn.push(value), true);
  }

  /** Where the hinge is drawn each time, and whether a hand sent it there, while `run` runs. */
  function hinged(run: () => void): { open: number; hand: boolean }[] {
    const seen: { open: number; hand: boolean }[] = [];
    const unwatch = watchHinge((open, hand) => seen.push({ open, hand }));
    run();
    unwatch();
    return seen;
  }

  test("tells the thumb where the hinge is each frame of a fold the knobs start, so it goes along", () => {
    const seen = hinged(() => {
      fold(SHUT, OPEN, sceneOf());
      play(2000);
    });
    expect(seen.length).toBeGreaterThan(10);
    expect(seen.every((at) => !at.hand)).toBe(true);
    expect(seen[0]?.open).toBe(0);
    const opens = seen.map((at) => at.open);
    expect(Math.max(...opens)).toBeGreaterThan(0.9);
  });

  test("tells it the hinge goes where a hand sends it, so the thumb stays under the hand", () => {
    const seen = hinged(() => {
      hold(SHUT, OPEN, sceneOf());
      scrubFold(0.6);
      play(200);
    });
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((at) => at.hand)).toBe(true);
  });

  test("pressed while the hand holds the hinge, takes it from the hand toward the other posture", () => {
    const scene = sceneOf();
    hold(SHUT, OPEN, scene);
    scrubFold(0.4);
    play(100);
    expect(holdingHinge()).toBe(true);
    const seen = hinged(() => {
      fold(SHUT, OPEN, scene);
      play(32);
    });
    expect(holdingHinge()).toBe(false);
    expect(scrubFold(0.1)).toBe(false);
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((at) => !at.hand)).toBe(true);
    play(2000);
    expect(folding()).toBe(false);
    expect(drawn.at(-1)).toEqual(OPEN);
  });

  test("pressed while the hinge goes back where a hand let it go, turns it round", () => {
    const scene = sceneOf();
    hold(SHUT, OPEN, scene);
    scrubFold(0.6);
    play(100);
    releaseFold(0, false);
    play(32);
    const seen = hinged(() => {
      fold(SHUT, OPEN, scene);
      play(32);
    });
    expect(seen.every((at) => !at.hand)).toBe(true);
    play(2000);
    expect(drawn.at(-1)).toEqual(OPEN);
  });

  test("pressed half open, goes to the posture opposite the one the knobs hold", () => {
    const scene = sceneOf();
    hold(SHUT, OPEN, scene);
    scrubFold(0.7);
    play(100);
    releaseFold(0.333, false);
    play(3000);
    expect(foldRest()).toBe(0.333);
    fold(SHUT, OPEN, scene);
    expect(foldRest()).toBeNull();
    play(2000);
    expect(folding()).toBe(false);
    expect(drawn.at(-1)).toEqual(OPEN);
  });

  test("a hand let go at an end the knobs then take keeps the hinge its own, so the thumb stays at the stop", () => {
    const scene = sceneOf();
    hold(SHUT, OPEN, scene);
    scrubFold(0.95);
    play(100);
    releaseFold(1, false);
    const seen = hinged(() => {
      fold(SHUT, OPEN, scene);
      play(32);
    });
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((at) => at.hand)).toBe(true);
    play(2000);
    expect(folding()).toBe(false);
    expect(drawn.at(-1)).toEqual(OPEN);
  });
});

describe("a Duo whose frames do not decode", () => {
  if (!DUO_FOLD) return;
  /** Do the pictures asked for from now on not decode? */
  let failing = false;

  beforeAll(() => {
    const decodeOrFail = (image: FakeImage) =>
      failing ? Promise.reject(new Error("EncodingError: the picture does not decode")) : createBitmap(image);
    Object.defineProperty(globalThis, "createImageBitmap", { configurable: true, value: decodeOrFail });
  });

  afterAll(() => {
    Object.defineProperty(globalThis, "createImageBitmap", { configurable: true, value: createBitmap });
  });

  afterEach(() => {
    stopFold();
  });

  test("lets go of every picture once a fold one failed in ends, though the Duo rests in its bezels, and turns copies after", async () => {
    forgetFold();
    await Bun.sleep(0);
    bitmaps = [];
    failing = false;
    foldResting(SHUT, OPEN, sceneOf());
    await Bun.sleep(0);
    // The first decode, and on its way the frames ahead do not.
    for (let now = 0; now <= 2000 && frames.length > 0; now += 16) {
      failing = now >= 320;
      for (const callback of frames.splice(0)) callback(now);
      await Bun.sleep(0);
    }
    expect(bitmaps.length).toBeGreaterThan(0);
    expect(layer()).toBeUndefined();
    expect(drawn.at(-1)).toEqual(OPEN);
    await Bun.sleep(0);
    wait(2 * SHOTS_KEPT);
    await Bun.sleep(0);
    expect(live()).toHaveLength(0);
    expect(foldShots()).toBeNull();
    // None decodes again: the next fold turns the copies all the way.
    const all = bitmaps.length;
    foldResting(OPEN, SHUT, sceneOf());
    expect(placed()).toHaveLength(7);
    await playing(2000, () => {
      expect(canvases()).toHaveLength(0);
    });
    expect(layer()).toBeUndefined();
    expect(drawn.at(-1)).toEqual(SHUT);
    expect(bitmaps).toHaveLength(all);
  });

  test("started by the knobs, does not wait for frames that cannot come in: its hinge moves on the click's next frame", async () => {
    forgetFold();
    await Bun.sleep(0);
    // One fails as the Duo is drawn at rest, where none has yet.
    failing = true;
    loadFoldShots();
    await Bun.sleep(0);
    restFoldShots(0);
    await Bun.sleep(0);
    await Bun.sleep(0);
    const opens: number[] = [];
    const unwatch = watchHinge((open) => opens.push(open));
    // No page to wait for the pictures of.
    foldResting(SHUT, OPEN, sceneOf());
    expect(placed()).toHaveLength(7);
    // That frame draws it at rest still, and the next moves it.
    play(0);
    expect(opens.at(-1)).toBe(0);
    for (const callback of frames.splice(0)) callback(16);
    unwatch();
    expect(opens.at(-1)).toBeGreaterThan(0);
    await playing(2000);
    expect(layer()).toBeUndefined();
    expect(drawn.at(-1)).toEqual(OPEN);
  });
});
