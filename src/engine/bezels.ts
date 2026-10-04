import type { OrientationValue } from "../types";
import { deviceOf, turn } from "./devices";
import { type Mock, type Radius, type Sides, turnRadius, turnSides } from "./mock";

/**
 * Apple's product bezel images as the body of an iPhone, in place of the
 * drawn mock. The images are Apple's, from Apple Design Resources, and not
 * under this project's license: see THIRD_PARTY_NOTICES.md. They all live in
 * assets/bezels, which the build copies to dist/bezels, and nothing but this
 * module names them. Each loads when its device is first shown with the mock
 * on. Delete assets/bezels and every device draws its own mock again, as it
 * does where an image does not load.
 */

/** One image, measured in its own px. */
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
 * of the opening, measured on Apple's PNGs.
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
  },
};

/**
 * Where each image is, beside the built module. Each address is written out,
 * so a bundler that moves the module finds the image and takes it along.
 */
const URLS: Record<string, () => string> = {
  "iphone-16.webp": () => new URL("./bezels/iphone-16.webp", import.meta.url).href,
  "iphone-16-plus.webp": () => new URL("./bezels/iphone-16-plus.webp", import.meta.url).href,
  "iphone-16-pro.webp": () => new URL("./bezels/iphone-16-pro.webp", import.meta.url).href,
  "iphone-16-pro-max.webp": () => new URL("./bezels/iphone-16-pro-max.webp", import.meta.url).href,
  "iphone-17.webp": () => new URL("./bezels/iphone-17.webp", import.meta.url).href,
  "iphone-17-pro.webp": () => new URL("./bezels/iphone-17-pro.webp", import.meta.url).href,
  "iphone-17-pro-max.webp": () => new URL("./bezels/iphone-17-pro-max.webp", import.meta.url).href,
  "iphone-18-pro.webp": () => new URL("./bezels/iphone-18-pro.webp", import.meta.url).href,
  "iphone-18-pro-max.webp": () => new URL("./bezels/iphone-18-pro-max.webp", import.meta.url).href,
  "iphone-air.webp": () => new URL("./bezels/iphone-air.webp", import.meta.url).href,
  "iphone-duo-outer-closed.webp": () =>
    new URL("./bezels/iphone-duo-outer-closed.webp", import.meta.url).href,
  "iphone-duo-inner-open-portrait.webp": () =>
    new URL("./bezels/iphone-duo-inner-open-portrait.webp", import.meta.url).href,
  "iphone-duo-inner-open-landscape.webp": () =>
    new URL("./bezels/iphone-duo-inner-open-landscape.webp", import.meta.url).href,
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
  else if (URLS[file]) {
    add(() => URLS[file]?.());
    add(() => new URL(`/node_modules/devknobs/dist/bezels/${file}`, location.href).href);
  }
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
  const device = deviceOf(id);
  return device ? density(device, bezel) : null;
}

function density(screen: { width: number; height: number }, bezel: Bezel): number {
  const [, , width, height] = bezel.opening;
  return (width + height) / (screen.width + screen.height);
}

/**
 * The image as the mock of a device held one way, its opening on the screen,
 * or null. The image is drawn at its density, never stretched, and the screen
 * sits in the middle of the opening.
 */
export function bezelMock(id: string, orientation: OrientationValue): Mock | null {
  const found = BEZELS[id];
  const device = deviceOf(id);
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
    bezel: sides,
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
