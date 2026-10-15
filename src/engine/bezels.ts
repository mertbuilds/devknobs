import type { DevknobsState, OrientationValue } from "../types";
import { hush } from "../requests/quiet";
import { BEZEL_URLS, DUO_FOLD } from "./bezelurls";
import { deviceOf, formId, screenOf, turn } from "./devices";
import { type FoldShots, openOf, shotAt, shotsWindow, towardFrom } from "./fold";
import {
  type Mock,
  mockOf,
  placeIn,
  type Radius,
  type Sides,
  turnRadius,
  turnSides,
} from "./mock";

/**
 * The maker's own bezel image as the body of an iPhone or a Pixel, in place
 * of the drawn mock: Apple's product bezels from Apple Design Resources and
 * its App Store marketing artwork, and Google's Android Studio emulator frames
 * from AOSP. None of them is under this project's license: see
 * THIRD_PARTY_NOTICES.md. They all live in assets/bezels, which the build
 * copies to dist/bezels, and nothing but bezelurls.ts, which the build writes
 * from the folder, names them. Each loads when its device is first shown with
 * the mock on. Delete assets/bezels and build, and every device draws its own
 * mock again, as it does where an image does not load. The Duo's fold has
 * frames of its own in assets/bezels/duo-fold, rendered from Apple's model,
 * and its half that stays, which all load once the Duo is first shown with
 * the mock on. A fold decodes only the frames round the hinge's angle and
 * ahead of it, and the half that stays, letting go of each frame it leaves
 * behind. While the Duo is shown at rest in its bezels, those a fold from
 * that end starts with stay decoded, so it has them as it starts, and all
 * are let go of once the Duo is not shown.
 */

/** One image, measured in its own px, at its own density: see `densityOf`. */
export interface Bezel {
  file: string;
  size: readonly [width: number, height: number];
  /** The transparent screen opening, which is the screen's size times the image's density. */
  opening: readonly [left: number, top: number, width: number, height: number];
  /** The body with its buttons. */
  body: readonly [left: number, top: number, right: number, bottom: number];
  /** The island or the camera hole, which the image draws. */
  cutout?: readonly [left: number, top: number, width: number, height: number];
  /**
   * What the page is clipped to, in css px. The opening's corners are not
   * arcs, so this is the biggest round corner that still shows all of the
   * opening, and the body covers the page past it.
   */
  radius: Radius;
}

/**
 * The clip of the 62 px screens, the 16 and 16 Plus, and the Duo's inner
 * screen: the biggest whole radius whose corner still holds every clear pixel
 * of the opening, measured on Apple's PNGs. Each Pixel's is measured the same
 * way on Google's, and the SE's screen is square.
 */
const PRO = 62;
const BASE = 54;
const INNER = 53;

/** A device's images: held upright, and held across where that is not the upright one turned. */
export const BEZELS: Record<string, { portrait: Bezel; landscape?: Bezel }> = {
  "iphone-18-pro": {
    portrait: {
      file: "iphone-18-pro.webp",
      size: [1350, 2760],
      opening: [72, 69, 1206, 2622],
      body: [16, 22, 1334, 2738],
      cutout: [534, 111.79, 282.02, 108.33],
      radius: PRO,
    },
  },
  "iphone-18-pro-max": {
    portrait: {
      file: "iphone-18-pro-max.webp",
      size: [1470, 3000],
      opening: [75, 66, 1320, 2868],
      body: [21, 20, 1449, 2979],
      cutout: [594.67, 109.55, 280.91, 107.44],
      radius: PRO,
    },
  },
  "iphone-duo-closed": {
    portrait: {
      file: "iphone-duo-outer-closed.webp",
      size: [1574, 2194],
      opening: [88, 80, 1398, 2034],
      body: [11, 24, 1542, 2162],
      cutout: [1288.6, 168.75, 108.89, 108.98],
      radius: [8, 58, 58, 8],
    },
  },
  // Apple turns the open Duo the other way, its top to the right, in an image of its own.
  "iphone-duo-open": {
    portrait: {
      file: "iphone-duo-inner-open-portrait.webp",
      size: [2247, 3093],
      opening: [120, 120, 2007, 2853],
      body: [50, 50, 2189, 3035],
      radius: INNER,
    },
    landscape: {
      file: "iphone-duo-inner-open-landscape.webp",
      size: [3093, 2247],
      opening: [120, 120, 2853, 2007],
      body: [58, 50, 3043, 2189],
      radius: INNER,
    },
  },
  "iphone-air": {
    portrait: {
      file: "iphone-air.webp",
      size: [1380, 2880],
      opening: [60, 72, 1260, 2736],
      body: [6, 26, 1375, 2854],
      cutout: [503.25, 133.05, 373.76, 107.91],
      radius: PRO,
    },
  },
  "iphone-17": {
    portrait: {
      file: "iphone-17.webp",
      size: [1350, 2760],
      opening: [72, 69, 1206, 2622],
      body: [19, 26, 1330, 2734],
      cutout: [488.37, 111.95, 373.49, 107.58],
      radius: PRO,
    },
  },
  "iphone-17-pro": {
    portrait: {
      file: "iphone-17-pro.webp",
      size: [1350, 2760],
      opening: [72, 69, 1206, 2622],
      body: [16, 22, 1334, 2738],
      cutout: [488.48, 112.18, 373.16, 107.42],
      radius: PRO,
    },
  },
  "iphone-17-pro-max": {
    portrait: {
      file: "iphone-17-pro-max.webp",
      size: [1470, 3000],
      opening: [75, 66, 1320, 2868],
      body: [21, 20, 1449, 2979],
      cutout: [548.52, 109.57, 373.07, 107.28],
      radius: PRO,
    },
  },
  "iphone-16": {
    portrait: {
      file: "iphone-16.webp",
      size: [1359, 2736],
      opening: [90, 90, 1179, 2556],
      body: [23, 31, 1336, 2705],
      cutout: [492.09, 123.99, 374.82, 110.02],
      radius: BASE,
    },
  },
  "iphone-16-plus": {
    portrait: {
      file: "iphone-16-plus.webp",
      size: [1470, 2970],
      opening: [90, 87, 1290, 2796],
      body: [23, 28, 1447, 2942],
      cutout: [547, 121, 376.05, 110],
      radius: BASE,
    },
  },
  "iphone-16-pro": {
    portrait: {
      file: "iphone-16-pro.webp",
      size: [1350, 2760],
      opening: [72, 69, 1206, 2622],
      body: [21, 25, 1329, 2735],
      cutout: [488.25, 112.07, 373.49, 107.33],
      radius: PRO,
    },
  },
  "iphone-16-pro-max": {
    portrait: {
      file: "iphone-16-pro-max.webp",
      size: [1470, 3000],
      opening: [75, 66, 1320, 2868],
      body: [23, 22, 1447, 2978],
      cutout: [548.05, 109, 373.9, 107.98],
      radius: PRO,
    },
  },  "iphone-se": {
    portrait: {
      file: "iphone-se.webp",
      size: [1536, 3120],
      opening: [109, 387, 1320, 2346],
      body: [0, 0, 1536, 3119],
      radius: 0,
    },
  },
  // Google's frames: each opening is the panel in its own px, the punch hole in the frame.
  "pixel-10": {
    portrait: {
      file: "pixel-10.webp",
      size: [1205, 2535],
      opening: [59, 55, 1080, 2424],
      body: [0, 0, 1205, 2535],
      cutout: [559.13, 105.06, 77.96, 77.93],
      radius: 55,
    },
  },
  "pixel-10-pro": {
    portrait: {
      file: "pixel-10-pro.webp",
      size: [1410, 2968],
      opening: [59, 60, 1280, 2856],
      body: [0, 0, 1410, 2968],
      cutout: [653.66, 117.05, 91.8, 91.89],
      radius: 59,
    },
  },
  "pixel-10-pro-xl": {
    portrait: {
      file: "pixel-10-pro-xl.webp",
      size: [1472, 3111],
      opening: [60, 55, 1344, 2992],
      body: [0, 0, 1472, 3101],
      cutout: [686.41, 113.94, 90.67, 90.58],
      radius: 52,
    },
  },
  "pixel-10a": {
    portrait: {
      file: "pixel-10a.webp",
      size: [1218, 2553],
      opening: [65, 64, 1080, 2424],
      body: [1, 1, 1217, 2551],
      cutout: [562.3, 112.19, 81.94, 78.28],
      radius: 55,
    },
  },
  "pixel-9": {
    portrait: {
      file: "pixel-9.webp",
      size: [1198, 2531],
      opening: [55, 58, 1080, 2424],
      body: [0, 0, 1198, 2531],
      cutout: [554.1, 101.98, 82.13, 82.11],
      radius: 55,
    },
  },
  "pixel-9-pro": {
    portrait: {
      file: "pixel-9-pro.webp",
      size: [1408, 2974],
      opening: [60, 61, 1280, 2856],
      body: [0, 0, 1408, 2974],
      cutout: [654.07, 115.62, 92, 93.16],
      radius: 58,
    },
  },
  "pixel-9-pro-xl": {
    portrait: {
      file: "pixel-9-pro-xl.webp",
      size: [1466, 3101],
      opening: [57, 56, 1344, 2992],
      body: [0, 0, 1466, 3100],
      cutout: [682.72, 108.15, 92.21, 92.29],
      radius: 57,
    },
  },
};

/** The script the global build runs as, which is no module and has no address of its own. */
let script: string | null = null;

/** The global build's images are in the folder beside its script. */
export function bezelsBeside(src: string): void {
  script = src;
}

/**
 * Where an image may be, in the order to try: beside the module, then in the
 * page's own node_modules. A dev server such as Vite's will not serve a file
 * of a linked copy of the package that is outside its root, and does serve
 * the same file through the link.
 */
function urlsOf(file: string): string[] {
  const urls: string[] = [];
  const add = (make: () => string | undefined) => {
    try {
      const url = make();
      if (url && !urls.includes(url)) urls.push(url);
    } catch {
      // No address to start from: nothing to try.
    }
  };
  if (script !== null) add(() => new URL(`bezels/${file}`, script ?? "").href);
  else if (BEZEL_URLS[file]) {
    add(() => BEZEL_URLS[file]?.());
    add(() => new URL(`/node_modules/devknobs/dist/bezels/${file}`, location.href).href);
  }
  // Devknobs' own pictures, which the requests log leaves out.
  for (const url of urls) hush(url);
  return urls;
}

/**
 * Image px per css px of an image on its device's screen. An image is at its
 * own scale, which need not be 3, and its opening is the screen at that scale
 * give or take a px, so the density takes the opening's width and height
 * together and neither side is more off than the other. Null for a device
 * that is not in the list.
 */
export function densityOf(id: string, bezel: Bezel): number | null {
  const device = screenOf(id);
  return device ? density(device, bezel) : null;
}

function density(screen: { width: number; height: number }, bezel: Bezel): number {
  const [, , width, height] = bezel.opening;
  return (width + height) / (screen.width + screen.height);
}

/**
 * The image as the mock of a device, or a foldable's screen, held one way, its
 * opening on the screen, or null. The image is drawn at its density, never
 * stretched, and the screen sits in the middle of the opening.
 */
export function bezelMock(id: string, orientation: OrientationValue): Mock | null {
  const found = BEZELS[id];
  const device = screenOf(id);
  if (!found || !device) return null;
  const own = orientation === "landscape" ? found.landscape : undefined;
  const bezel = own ?? found.portrait;
  const turned = orientation === "landscape" && !own;
  const screen = turn(device, own ? "landscape" : "portrait");
  const scale = density(screen, bezel);
  const [x, y, w, h] = bezel.opening;
  const [left, top, right, bottom] = bezel.body;
  // The screen's top left in the image.
  const at = {
    x: x + (w - screen.width * scale) / 2,
    y: y + (h - screen.height * scale) / 2,
  };
  const inset: Sides = {
    top: (at.y - top) / scale,
    right: (right - at.x) / scale - screen.width,
    bottom: (bottom - at.y) / scale - screen.height,
    left: (at.x - left) / scale,
  };
  const width = (right - left) / scale;
  const height = (bottom - top) / scale;
  const sides = turned ? turnSides(inset) : inset;
  const size = turned ? { width: height, height: width } : { width, height };
  return {
    ...size,
    inset: sides,
    body: { x: 0, y: 0, ...size },
    screenRadius: turned ? turnRadius(bezel.radius) : bezel.radius,
    bodyRadius: 0,
    parts: [],
    image: {
      file: bezel.file,
      x: -left / scale,
      y: -top / scale,
      width: bezel.size[0] / scale,
      height: bezel.size[1] / scale,
      turn: turned ? width : null,
    },
  };
}

interface Load {
  state: "loading" | "ready" | "failed";
  url: string;
  waiting: Set<() => void>;
}

const loads = new Map<string, Load>();

/**
 * Load an image, once. `settled` hears when a load that is still under way
 * ends, either way. Failed where there is no image to load, or nothing to
 * load one with.
 */
export function loadBezel(file: string, settled: () => void): Load["state"] {
  let load = loads.get(file);
  if (!load) {
    const [first = "", ...rest] = urlsOf(file);
    if (!first || typeof Image === "undefined") return "failed";
    const started: Load = { state: "loading", url: first, waiting: new Set() };
    load = started;
    loads.set(file, started);
    const settle = (state: Load["state"]) => {
      started.state = state;
      const waiting = [...started.waiting];
      started.waiting.clear();
      for (const tell of waiting) tell();
    };
    const attempt = (url: string) => {
      const image = new Image();
      image.onload = () => {
        started.url = url;
        settle("ready");
      };
      image.onerror = () => {
        const next = rest.shift();
        if (next) attempt(next);
        else settle("failed");
      };
      image.src = url;
    };
    attempt(first);
  }
  if (load.state === "loading") load.waiting.add(settled);
  return load.state;
}

/** The address of an image that has loaded, or null. */
export function bezelUrl(file: string): string | null {
  const load = loads.get(file);
  return load?.state === "ready" ? load.url : null;
}

/**
 * Load each of `files`, each from the first of its addresses that loads, in
 * order, without decoding it. Rejects where one of them loads from none.
 */
export async function loadAll(files: readonly string[]): Promise<HTMLImageElement[]> {
  const loaded = async (file: string) => {
    for (const url of urlsOf(file)) {
      const image = new Image();
      const ok = await new Promise<boolean>((resolve) => {
        image.onload = () => resolve(true);
        image.onerror = () => resolve(false);
        image.src = url;
      });
      if (ok) return image;
    }
    throw new Error(`devknobs: ${file} did not load`);
  };
  return Promise.all(files.map(loaded));
}

/**
 * The Duo's fold frames and its halves that stay: their files as they load,
 * which then wait in the browser undecoded, and the pictures of those a fold
 * wants, the halves that stay after the frames.
 */
interface ShotsLoad {
  state: Load["state"];
  images: HTMLImageElement[];
  /** Each one's picture while it is decoded, else null, in the same order. */
  bitmaps: (ImageBitmap | null)[];
  /** Those under way. */
  decoding: Set<number>;
  /** Those to keep, by their place, or null where none are: any others are let go of, also as they come in. */
  keep: Set<number> | null;
  release: ReturnType<typeof setTimeout> | null;
  /** Is a fold drawing them, so they are let go of only once it ends, and were they let go of meanwhile? */
  held: boolean;
  pending: boolean;
  /** How far open the Duo shown rests, 0 shut or 1 open, or null where none is shown in its bezels. */
  rest: number | null;
}

let shotsLoad: ShotsLoad | null = null;

/** How long the pictures stay once a fold is over, in ms, so one fold after another needs them only once. */
export const SHOTS_KEPT = 4000;

/**
 * Load every frame of the Duo's fold and its half that stays, once, so they
 * are in the browser when a fold wants them. Where one fails, a fold turns
 * copies of the bezels for good.
 */
export function loadFoldShots(): void {
  // Nothing to load or draw them with: try again later.
  if (shotsLoad || !DUO_FOLD || typeof Image === "undefined" || typeof createImageBitmap !== "function") return;
  const files = [...DUO_FOLD.frames.map((shot) => shot.file), ...DUO_FOLD.stills.map((still) => still.file)];
  const started: ShotsLoad = {
    state: "loading",
    images: [],
    bitmaps: files.map(() => null),
    decoding: new Set(),
    keep: null,
    release: null,
    held: false,
    pending: false,
    rest: null,
  };
  shotsLoad = started;
  loadAll(files).then(
    (images) => {
      started.images = images;
      started.state = "ready";
      warmFoldShots(started);
    },
    () => {
      started.state = "failed";
    },
  );
}

/**
 * Decode, for a fold drawing the hinge `open` of the way open and going
 * `toward` shut, 1, open, -1, or neither, 0, the frames `shotsWindow` keeps
 * round it and the halves that stay they name, nearest first, and let go of
 * every other, each time it draws. The fold holds them till `endFoldShots`: the pictures stay till then,
 * and after, till `releaseFoldShots`. Till the first are in, a fold turns
 * copies of the bezels.
 */
export function decodeFoldShots(open: number, toward: number): void {
  const load = shotsLoad;
  if (!load || load.state !== "ready" || !DUO_FOLD) return;
  // A fold starts: it holds them, and they are not let go of meanwhile. Asked each frame after, a release it was asked for waits.
  if (!load.held) {
    if (load.release !== null) clearTimeout(load.release);
    load.release = null;
    load.held = true;
    load.pending = false;
  }
  keepRound(load, DUO_FOLD, open, toward);
}

/** Decode the frames `shotsWindow` keeps round the hinge `open` of the way open, going `toward`, and the halves that stay they name, nearest first, and let go of every other. */
function keepRound(load: ShotsLoad, shots: FoldShots, open: number, toward: number): void {
  const { frames } = shots;
  const at = shotAt(shots, open);
  // Each by how far its frame, or the nearest frame that names it, is from the hinge's, a half that stays before its frame.
  const far = new Map<number, number>();
  const want = (index: number, away: number) => far.set(index, Math.min(far.get(index) ?? Infinity, away));
  const [first, last] = shotsWindow(frames.length, at, toward);
  for (let index = first; index <= last; index++) {
    want(frames.length + (frames[index]?.still ?? 0), Math.abs(index - at));
    want(index, Math.abs(index - at) + 0.5);
  }
  load.keep = new Set(far.keys());
  load.bitmaps.forEach((bitmap, index) => {
    if (!bitmap || far.has(index)) return;
    bitmap.close();
    load.bitmaps[index] = null;
  });
  for (const [index] of [...far].sort((a, b) => a[1] - b[1])) decode(load, index);
}

/**
 * The Duo is shown in its bezels, at rest `rest` of the way open, 0 or 1:
 * the frames a fold from that end starts with decode ahead of it, once what
 * draws it now is done, and stay till `releaseFoldShots`. A fold asked for in
 * the same turn takes them as they are, and they decode once it ends.
 */
export function restFoldShots(rest: number): void {
  const load = shotsLoad;
  if (!load) return;
  load.rest = rest;
  load.pending = false;
  queueMicrotask(() => warmFoldShots(load));
}

/** Decode those a fold from the end the Duo rests at starts with, and keep them, unless none is shown at rest, a fold draws them, or their files are not in. */
function warmFoldShots(load: ShotsLoad): void {
  if (load.rest === null || load.held || load.state !== "ready" || !DUO_FOLD) return;
  if (load.release !== null) clearTimeout(load.release);
  load.release = null;
  keepRound(load, DUO_FOLD, load.rest, towardFrom(load.rest));
}

/** Is the frame or the half that stays at `index` one to keep? */
function kept(load: ShotsLoad, index: number): boolean {
  return load.keep?.has(index) ?? false;
}

/** Decode one, unless it is in or under way, and keep it where it is still wanted once it is in. Where it does not decode, none decodes again, and all are let go of: at once, or while a fold draws them, once it ends. */
function decode(load: ShotsLoad, index: number): void {
  const image = load.images[index];
  if (!image || load.bitmaps[index] || load.decoding.has(index)) return;
  load.decoding.add(index);
  createImageBitmap(image).then(
    (bitmap) => {
      load.decoding.delete(index);
      // Let go of, or left behind, while it decoded.
      if (!kept(load, index) || load.bitmaps[index]) bitmap.close();
      else load.bitmaps[index] = bitmap;
    },
    () => {
      load.decoding.delete(index);
      load.state = "failed";
      // No fold holds them, so none lets go of them once it ends.
      if (!load.held) releaseFoldShots();
    },
  );
}

/**
 * Let go of the frames' pictures `after` ms from now, or at once, and of any
 * under way as they come in: while a fold draws them, once it ends. At once,
 * the Duo is not shown at rest any more. Their files stay loaded for the
 * next fold.
 */
export function releaseFoldShots(after = 0): void {
  const load = shotsLoad;
  if (!load) return;
  if (load.release !== null) clearTimeout(load.release);
  load.release = null;
  if (after > 0) {
    load.release = setTimeout(() => releaseFoldShots(), after);
    return;
  }
  load.rest = null;
  if (load.held) {
    load.pending = true;
    return;
  }
  load.pending = false;
  load.keep = null;
  load.bitmaps.forEach((bitmap, index) => {
    bitmap?.close();
    load.bitmaps[index] = null;
  });
}

/**
 * A fold is done with the frames' pictures: where the Duo is shown at rest,
 * those a fold from the end it rests at starts with are kept, once it is
 * drawn there. Else let go of them `SHOTS_KEPT` ms from now, so the next
 * fold has them, or at once where they were let go of while it drew them,
 * where one did not decode, or `now`.
 */
export function endFoldShots(now = false): void {
  const load = shotsLoad;
  if (!load) return;
  load.held = false;
  const gone = now || load.pending || load.state !== "ready";
  if (gone || load.rest === null) releaseFoldShots(gone ? 0 : SHOTS_KEPT);
  else queueMicrotask(() => warmFoldShots(load));
}

/** The Duo's fold frames, and the pictures of those decoded and of the halves that stay, each by its place, else null. */
export interface FoldPictures {
  shots: FoldShots;
  frames: readonly (ImageBitmap | null)[];
  stills: readonly (ImageBitmap | null)[];
}

/**
 * The Duo's fold frames and the pictures of them and of their halves that
 * stay: once a frame and its half that stays are in, else null. Asked again
 * each time a fold draws, as pictures come and go.
 */
export function foldShots(): FoldPictures | null {
  const load = shotsLoad;
  if (!DUO_FOLD || !load) return null;
  const count = DUO_FOLD.frames.length;
  const frames = load.bitmaps.slice(0, count);
  const stills = load.bitmaps.slice(count);
  const whole = DUO_FOLD.frames.some((shot, index) => frames[index] && stills[shot.still]);
  return whole ? { shots: DUO_FOLD, frames, stills } : null;
}

/** May the Duo's fold frames still come in for a fold: are they loading or loaded, and has none failed? */
export function foldShotsDue(): boolean {
  return shotsLoad !== null && shotsLoad.state !== "failed";
}

/** What picks the body drawn around the frame. */
export type BodyKnobs = Pick<DevknobsState, "mock" | "device" | "orientation" | "posture">;

/**
 * The picture a foldable shows in its other posture, held the other way, as
 * it is once folded, loads ahead, so a fold has it to draw, and so do the
 * frames of its fold. Those a fold starts with decode ahead too, while the
 * Duo is shown in its bezels, and are let go of where it is not.
 */
function loadOther(knobs: BodyKnobs): void {
  if (!deviceOf(knobs.device)?.postures) {
    releaseFoldShots();
    return;
  }
  loadFoldShots();
  const shown = bezelMock(formId(knobs.device, knobs.posture), knobs.orientation)?.image;
  if (shown?.file.startsWith("iphone-duo-") && bezelUrl(shown.file)) restFoldShots(openOf(knobs.posture));
  else releaseFoldShots();
  const other = formId(knobs.device, knobs.posture === "open" ? "closed" : "open");
  const image = bezelMock(other, knobs.orientation === "portrait" ? "landscape" : "portrait")?.image;
  if (image) loadBezel(image.file, () => {});
}

/**
 * The body around the frame: the maker's bezel image where the device has
 * one, and the drawn mock where it has none or the image does not load. While
 * the image loads the drawn mock stands in its room, so the frame never moves
 * as it comes in, and `settled` hears once it is in.
 */
export function bodyOf(knobs: BodyKnobs, settled: () => void): Mock | null {
  if (!knobs.mock) {
    releaseFoldShots();
    return null;
  }
  const id = formId(knobs.device, knobs.posture);
  const drawn = mockOf(id, knobs.orientation);
  const bezel = bezelMock(id, knobs.orientation);
  loadOther(knobs);
  if (!bezel?.image) return drawn;
  const state = loadBezel(bezel.image.file, settled);
  if (state === "ready") return bezel;
  return state === "loading" && drawn ? placeIn(drawn, bezel) : drawn;
}
