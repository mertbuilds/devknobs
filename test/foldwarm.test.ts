import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { DUO_FOLD } from "../src/engine/bezelurls";
import { SHOTS_AHEAD, SHOTS_AROUND } from "../src/engine/fold";

type Bezels = typeof import("../src/engine/bezels");

let instances = 0;

/**
 * The bezels' module anew, with nothing loaded. The module keeps every image
 * it has loaded for good, and a Duo whose bezels have loaded folds another
 * way, so what a test loads here no other test, here or in another file, sees.
 */
async function fresh(): Promise<Bezels> {
  instances += 1;
  const path = `../src/engine/bezels.ts?foldwarm=${instances}`;
  return import(path);
}

/** A frame's picture, which knows its file and whether it was let go of. */
class FakeBitmap {
  closed = false;

  constructor(readonly src: string) {}

  close(): void {
    this.closed = true;
  }
}

/** Which images wait till the test lets them load, and those that wait. */
let holds: (url: string) => boolean = () => false;
let held: (() => void)[] = [];

/** Loads a task after it is asked for, or once the test lets it. */
class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  #src = "";

  get src(): string {
    return this.#src;
  }

  set src(url: string) {
    this.#src = url;
    const load = () => this.onload?.();
    if (holds(url)) held.push(load);
    else queueMicrotask(load);
  }
}

/** Let the images that wait load, and any asked for after. */
function letLoad(): void {
  holds = () => false;
  for (const load of held.splice(0)) load();
}

let bitmaps: FakeBitmap[] = [];

function createBitmap(image: FakeImage): Promise<FakeBitmap> {
  const bitmap = new FakeBitmap(image.src);
  bitmaps.push(bitmap);
  return Promise.resolve(bitmap);
}

const GLOBALS = ["Image", "createImageBitmap"] as const;
const saved = GLOBALS.map((name) => Object.getOwnPropertyDescriptor(globalThis, name));

beforeAll(() => {
  Object.defineProperty(globalThis, "Image", { configurable: true, value: FakeImage });
  Object.defineProperty(globalThis, "createImageBitmap", { configurable: true, value: createBitmap });
});

afterAll(() => {
  GLOBALS.forEach((name, index) => {
    const descriptor = saved[index];
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  });
});

beforeEach(() => {
  holds = () => false;
  held = [];
  bitmaps = [];
});

describe("the Duo drawn at rest in its bezels", () => {
  if (!DUO_FOLD) return;
  const shots = DUO_FOLD;
  const SHUT = { mock: true, device: "iphone-duo", orientation: "portrait", posture: "closed" } as const;
  /** The picture the Duo is drawn in shut, held upright. */
  const SHUT_FILE = "iphone-duo-outer-closed.webp";
  const last = shots.frames.length - 1;
  /** The frames a fold from the shut end starts with, by their place. */
  const SHUT_END = Array.from({ length: SHOTS_AROUND + SHOTS_AHEAD + 1 }, (_, index) => last - SHOTS_AROUND - SHOTS_AHEAD + index);
  /** The frames decoded and not let go of, by their place. */
  const kept = () =>
    bitmaps
      .filter((bitmap) => !bitmap.closed)
      .map((bitmap) => shots.frames.findIndex((shot) => bitmap.src.endsWith(shot.file)))
      .filter((index) => index >= 0)
      .sort((a, b) => a - b);

  test("decodes those a fold from the end it is drawn at starts with, its bezel and the frames' files in", async () => {
    const bezels = await fresh();
    bezels.loadBezel(SHUT_FILE, () => {});
    bezels.loadFoldShots();
    await Bun.sleep(0);
    expect(bezels.bezelUrl(SHUT_FILE)).not.toBeNull();
    expect(bitmaps).toHaveLength(0);
    expect(bezels.bodyOf(SHUT, () => {})?.image?.file).toBe(SHUT_FILE);
    await Bun.sleep(0);
    expect(kept()).toEqual(SHUT_END);
    // A fold has a frame and its half that stays to draw as it starts.
    expect(bezels.foldShots()?.frames[last]).toBeTruthy();
  });

  test("decodes them once the frames' files are in, where it was drawn before they were", async () => {
    const bezels = await fresh();
    bezels.loadBezel(SHUT_FILE, () => {});
    await Bun.sleep(0);
    holds = (url) => url.includes("duo-fold/");
    bezels.bodyOf(SHUT, () => {});
    await Bun.sleep(0);
    expect(held.length).toBeGreaterThan(0);
    expect(bitmaps).toHaveLength(0);
    letLoad();
    await Bun.sleep(0);
    expect(kept()).toEqual(SHUT_END);
    expect(bezels.foldShots()).not.toBeNull();
  });

  test("lets go of those decoded where it is drawn before its bezel is in, as its own mock", async () => {
    const bezels = await fresh();
    bezels.loadFoldShots();
    await Bun.sleep(0);
    bezels.restFoldShots(0);
    await Bun.sleep(0);
    expect(kept()).toEqual(SHUT_END);
    holds = (url) => !url.includes("duo-fold/");
    expect(bezels.bodyOf(SHUT, () => {})?.image).toBeUndefined();
    await Bun.sleep(0);
    expect(bezels.bezelUrl(SHUT_FILE)).toBeNull();
    expect(bezels.foldShots()).toBeNull();
    expect(bitmaps.length > 0 && bitmaps.every((bitmap) => bitmap.closed)).toBe(true);
  });
});
