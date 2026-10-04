import type { BrowserValue, OrientationValue } from "../types";
import { turn } from "./devices";
import type { Rect } from "./mock";
import { BODIES } from "./mockdata";

/**
 * The browser a phone shows the page in, drawn around it inside the screen:
 * Safari on an iPhone, Chrome on an Android phone. The numbers are iOS 26.5
 * Safari measured in the simulator, and Chrome's from the Chromium and AOSP
 * sources, in css px of the screen.
 */

export type Platform = "safari" | "chrome";

/** Where the browser keeps its bars, or none at all. */
export type BrowserLayout = "compact" | "bottom" | "top" | "off";

/** What a layout is offered as, in the order each browser's settings list them. */
const LAYOUTS: Record<Platform, readonly BrowserLayout[]> = {
  safari: ["compact", "bottom", "top", "off"],
  chrome: ["top", "bottom", "off"],
};

interface SafariSpec {
  /** The status bar's height in portrait. */
  top: number;
  /** The room each side of the page in landscape, around the island. */
  side: number;
  /** A Face ID phone: a home indicator, and the island the status bar sits around. */
  faceId: boolean;
}

const SAFARI: Record<string, SafariSpec> = {
  "iphone-16": { top: 59, side: 59, faceId: true },
  "iphone-16-pro": { top: 62, side: 62, faceId: true },
  "iphone-16-pro-max": { top: 62, side: 62, faceId: true },
  "iphone-se": { top: 20, side: 0, faceId: false },
};

interface ChromeSpec {
  /** The status bar's height in portrait, from the device's AOSP overlay. */
  top: number;
  /** The long side Chrome lays out, where the css size rounds it up. */
  tall?: number;
}

const CHROME: Record<string, ChromeSpec> = {
  // 2424 px at 2.625 is 923.4 css px, and the page gets the whole px under it.
  "pixel-9": { top: 66, tall: 923 },
  "pixel-9-pro": { top: 68 },
  "pixel-9-pro-xl": { top: 66 },
  // An estimate: Samsung publishes no status bar height.
  "galaxy-s25": { top: 40 },
  "galaxy-s25-ultra": { top: 40 },
};

/** Safari's bars, measured from the bottom of the screen or the top inset. */
export const SAFARI_BARS = {
  /** Compact's capsules and the bottom gap under them. */
  compact: 98,
  /** Bottom's card, 152 on the SE. */
  bottom: 158,
  bottomSe: 152,
  /** Top's address capsule and the gap under it, then the bottom capsule. */
  topBar: 60,
  topBottom: 92,
  /** What a minimized bar keeps: the domain pill at the bottom, or at the top. */
  pill: 58,
  topPill: 44,
  /** The single top row in landscape. */
  landscape: 64,
} as const;

/** Chrome's toolbar, the gesture area's chin under it, and the status bar in landscape. */
export const CHROME_BARS = { toolbar: 56, chin: 24, landscapeTop: 24 } as const;

export function platformOf(id: string): Platform | null {
  if (SAFARI[id]) return "safari";
  if (CHROME[id]) return "chrome";
  return null;
}

/** The layouts the device's browser offers, its default first. Empty for one with none. */
export function layoutOptions(id: string): readonly BrowserLayout[] {
  const platform = platformOf(id);
  return platform ? LAYOUTS[platform] : [];
}

/**
 * The layout the knob comes to on a device: its browser's default for auto,
 * or for one the browser does not have. Null for a device without a browser.
 */
export function layoutOf(id: string, browser: BrowserValue): BrowserLayout | null {
  const options = layoutOptions(id);
  const fallback = options[0];
  if (!fallback) return null;
  return browser !== "auto" && options.includes(browser) ? browser : fallback;
}

/** The screen a device shows, held one way. */
export interface Screen {
  id: string;
  width: number;
  height: number;
}

function rect(x: number, y: number, width: number, height: number): Rect {
  return { x, y, width, height };
}

/**
 * Where the page's viewport sits in the screen, and its size: what the page
 * reads as `innerWidth` and `innerHeight`. The whole screen without a browser.
 */
export function viewportOf(
  device: Screen,
  orientation: OrientationValue,
  layout: BrowserLayout | null,
  minimized: boolean,
): Rect {
  const { width: W, height: H } = turn(device, orientation);
  const whole = rect(0, 0, W, H);
  if (!layout || layout === "off") return whole;
  const safari = SAFARI[device.id];
  if (safari) {
    if (orientation === "landscape") {
      const top = minimized ? 0 : SAFARI_BARS.landscape;
      return rect(safari.side, top, W - 2 * safari.side, H - top);
    }
    const T = safari.top;
    if (layout === "top") {
      const top = T + (minimized ? SAFARI_BARS.topPill : SAFARI_BARS.topBar);
      const bottom = minimized ? H : H - SAFARI_BARS.topBottom;
      return rect(0, top, W, bottom - top);
    }
    const card = safari.faceId ? SAFARI_BARS.bottom : SAFARI_BARS.bottomSe;
    const bar = minimized ? SAFARI_BARS.pill : layout === "bottom" ? card : SAFARI_BARS.compact;
    return rect(0, T, W, H - bar - T);
  }
  const chrome = CHROME[device.id];
  if (!chrome) return whole;
  const toolbar = minimized ? 0 : CHROME_BARS.toolbar;
  if (orientation === "landscape") {
    // Derived: the research gives the status bar alone, so the toolbar goes over the page.
    const top = CHROME_BARS.landscapeTop + toolbar;
    return rect(0, top, W, H - top);
  }
  const tall = chrome.tall ?? H;
  const chin = minimized ? 0 : CHROME_BARS.chin;
  const height = tall - chrome.top - toolbar - chin;
  return rect(0, chrome.top + (layout === "top" ? toolbar : 0), W, height);
}

/** A glyph the bars draw. */
export type Glyph =
  | "back"
  | "forward"
  | "share"
  | "bookmarks"
  | "tabs"
  | "reload"
  | "page"
  | "more"
  | "plus"
  | "home"
  | "tune"
  | "switcher"
  | "menu";

/** A glyph centered on `x`, `y`. */
export interface Mark {
  glyph: Glyph;
  x: number;
  y: number;
}

/**
 * A shape of a bar: a glass capsule, Bottom's card, the address field inside
 * it, or the minimized domain pill, whose width follows its text. Glyphs and
 * the domain sit in it, in screen coordinates.
 */
export interface Shape extends Rect {
  kind: "glass" | "card" | "field" | "pill" | "toolbar";
  radius: number;
  marks: Mark[];
  /** Where the shape shows the domain: its center in Safari, its start in Chrome. */
  text?: { x: number; y: number; size: number };
}

/** A shape with fully round ends. */
function capsule(kind: Shape["kind"], box: Rect, marks: Mark[] = []): Shape {
  return { kind, ...box, radius: Math.min(box.width, box.height) / 2, marks };
}

function mark(glyph: Glyph, x: number, y: number): Mark {
  return { glyph, x, y };
}

/** The status bar and what is in it. */
export interface StatusBar {
  height: number;
  /** The time's center. */
  time: { x: number; y: number; size: number };
  /** The right edge of the icons and their center line, or their left edge where `start`. */
  icons: { x: number; y: number; align: "end" | "start" };
  /** The SE keeps the battery alone on the right, the bars and wifi on the left. */
  battery?: { x: number; y: number };
}

export interface Bars {
  platform: Platform;
  layout: BrowserLayout;
  status: StatusBar | null;
  shapes: Shape[];
  /** The home indicator, or Android's gesture handle. */
  handle: Rect | null;
  /** Chrome's chin under the toolbar, in the toolbar's color. */
  chin: Rect | null;
  /** Chrome's hairline between the toolbar and the page. */
  hairline: Rect | null;
}

/** The middle of the island or the punch hole, which the status bar lines up with. */
function sensorMiddle(id: string): { x: number; y: number; width: number } | null {
  const sensor = BODIES[id]?.front.find((front) => front.kind === "sensor");
  if (!sensor) return null;
  return { x: sensor.x + sensor.width / 2, y: sensor.y + sensor.height / 2, width: sensor.width };
}

/** The domain's size in Safari's address field and in the minimized pill. */
export const SAFARI_TEXT = { field: 17, pill: 13 } as const;

/** The glyph centers across Bottom's card and Top's bottom capsule, as a share of it (16 Pro). */
const BOTTOM_ROW = [0.1032, 0.3056, 0.4965, 0.6925, 0.8872];
const TOP_ROW = [0.0884, 0.2986, 0.4962, 0.6994, 0.9012];
const ROW: Glyph[] = ["back", "forward", "share", "bookmarks", "tabs"];

/** The domain pill a minimized Safari keeps, centered at `y`. Its width follows the text. */
function domainPill(W: number, top: number): Shape {
  return {
    kind: "pill",
    x: W / 2,
    y: top,
    width: 0,
    height: 32,
    radius: 16,
    marks: [],
    text: { x: W / 2, y: top + 16, size: SAFARI_TEXT.pill },
  };
}

/** The address field: page menu, domain, reload, `page` and `reload` px in from its ends. */
function address(kind: Shape["kind"], box: Rect, page: number, reload: number): Shape {
  const y = box.y + box.height / 2;
  return {
    ...capsule(kind, box, [
      mark("page", box.x + page, y),
      mark("reload", box.x + box.width - reload, y),
    ]),
    text: { x: box.x + box.width / 2, y, size: SAFARI_TEXT.field },
  };
}

function safariBars(
  device: Screen,
  spec: SafariSpec,
  orientation: OrientationValue,
  layout: BrowserLayout,
  minimized: boolean,
): Bars {
  const { width: W, height: H } = turn(device, orientation);
  const handle = spec.faceId
    ? orientation === "portrait"
      ? rect((W - 140) / 2, H - 13, 140, 5)
      : rect((W - 225) / 2, H - 13, 225, 5)
    : null;
  const bars: Bars = {
    platform: "safari",
    layout,
    status: null,
    shapes: [],
    handle,
    chin: null,
    hairline: null,
  };
  if (orientation === "landscape") {
    // Measured on the 16 Pro: one row 10 under the top, starting 10 in from the side inset.
    if (minimized) return bars;
    const s = spec.side;
    const y = 10;
    const row = (x: number, width: number) => rect(x, y, width, 44);
    const right = row(W - s - 10 - 132, 132);
    const middle = y + 22;
    bars.shapes = [
      capsule("glass", row(s + 10, 44), [mark("back", s + 32, middle)]),
      capsule("glass", row(s + 66, 44), [mark("bookmarks", s + 88, middle)]),
      address("glass", row((W - 318) / 2, 318), 24, 22),
      capsule("glass", right, [
        mark("share", right.x + 22, middle),
        mark("plus", right.x + 66, middle),
        mark("tabs", right.x + 110, middle),
      ]),
    ];
    return bars;
  }
  bars.status = safariStatus(device.id, spec, W);
  const T = spec.top;
  if (minimized) {
    bars.shapes = [layout === "top" ? domainPill(W, T) : domainPill(W, H - 46)];
    return bars;
  }
  if (layout === "compact") {
    const y = H - 82;
    const middle = y + 24;
    bars.shapes = [
      capsule("glass", rect(34, y, 48, 48), [mark("back", 58, middle)]),
      address("glass", rect(90, y, W - 180, 48), 24, 22),
      capsule("glass", rect(W - 82, y, 48, 48), [mark("more", W - 58, middle)]),
    ];
    return bars;
  }
  if (layout === "bottom") {
    const inset = spec.faceId ? 14 : 8;
    const card = rect(inset, H - inset - 128, W - 2 * inset, 128);
    const field = rect(card.x + 22, card.y + 16, card.width - 44, 48);
    const row = card.y + 92;
    bars.shapes = [
      // An estimate: the card's radius, the field's 24 and the 16 around it.
      {
        kind: "card",
        ...card,
        radius: 40,
        marks: ROW.map((glyph, at) => {
          return mark(glyph, card.x + card.width * (BOTTOM_ROW[at] ?? 0), row);
        }),
      },
      address("field", field, 18, 16),
    ];
    return bars;
  }
  const top = rect(16, T, W - 32, 44);
  const bottom = rect(28, H - 76, W - 56, 48);
  const row = bottom.y + 24;
  bars.shapes = [
    address("glass", top, 23, 18),
    capsule(
      "glass",
      bottom,
      ROW.map((glyph, at) => mark(glyph, bottom.x + bottom.width * (TOP_ROW[at] ?? 0), row)),
    ),
  ];
  return bars;
}

/**
 * iOS's status bar: on a Face ID phone the time in the left ear and the
 * icons in the right, both on the island's center line; on the SE the time in
 * the middle, the bars and wifi on the left and the battery on the right.
 */
function safariStatus(id: string, spec: SafariSpec, W: number): StatusBar {
  const island = sensorMiddle(id);
  if (!spec.faceId || !island) {
    return {
      height: spec.top,
      time: { x: W / 2, y: 10, size: 15 },
      icons: { x: 6, y: 10, align: "start" },
      battery: { x: W - 7, y: 10 },
    };
  }
  const left = island.x - island.width / 2;
  // Measured on the 16 Pro: the time a little right of the ear's middle, the
  // battery 35.4 in from the edge.
  return {
    height: spec.top,
    time: { x: left * 0.535, y: island.y, size: 17 },
    icons: { x: W - 35.4, y: island.y, align: "end" },
  };
}

/** Chrome's status bar: the clock on the left, the icons on the right, on the punch hole's line. */
function chromeStatus(
  id: string,
  height: number,
  W: number,
  orientation: OrientationValue,
): StatusBar {
  const hole = orientation === "portrait" ? sensorMiddle(id) : null;
  const y = hole?.y ?? height / 2;
  // An estimate: the side padding, clear of the screen's round corners, and in
  // landscape of the punch hole on the left too.
  const side = orientation === "portrait" ? 26 : 56;
  return {
    height,
    time: { x: side, y, size: 14 },
    icons: { x: W - side, y, align: "end" },
  };
}

function chromeBars(
  device: Screen,
  spec: ChromeSpec,
  orientation: OrientationValue,
  layout: BrowserLayout,
  minimized: boolean,
): Bars {
  const { width: W, height: H } = turn(device, orientation);
  const portrait = orientation === "portrait";
  const statusHeight = portrait ? spec.top : CHROME_BARS.landscapeTop;
  const page = viewportOf(device, orientation, layout, minimized);
  // Gesture navigation: a 108 wide handle, 10 over the bottom. Its height is an estimate.
  const handle = rect((W - 108) / 2, H - 14, 108, 4);
  const bars: Bars = {
    platform: "chrome",
    layout,
    status: chromeStatus(device.id, statusHeight, W, orientation),
    shapes: [],
    handle,
    chin: null,
    hairline: null,
  };
  if (minimized) return bars;
  const atTop = layout === "top" || !portrait;
  const toolbarY = atTop ? statusHeight : page.y + page.height;
  const toolbar = rect(0, toolbarY, W, CHROME_BARS.toolbar);
  const under = toolbarY + CHROME_BARS.toolbar;
  const chin = atTop ? page.y + page.height : under;
  bars.chin = portrait ? rect(0, chin, W, H - chin) : null;
  bars.hairline = rect(0, atTop ? under : toolbarY, W, 1);
  const middle = toolbarY + CHROME_BARS.toolbar / 2;
  // Buttons 48 wide and the menu's 8 of end padding, a 52 wide new tab shortcut.
  const menu = W - 8 - 24;
  const tabs = menu - 48;
  const plus = tabs - 24 - 26;
  const pillLeft = 48 + 4;
  const pillRight = plus - 26 - 4;
  const pill = rect(pillLeft, middle - 20, pillRight - pillLeft, 40);
  bars.shapes = [
    {
      kind: "toolbar",
      ...toolbar,
      radius: 0,
      marks: [
        mark("home", 24, middle),
        mark("plus", plus, middle),
        mark("switcher", tabs, middle),
        mark("menu", menu, middle),
      ],
    },
    {
      ...capsule("field", pill, [mark("tune", pill.x + 4 + 14, middle)]),
      // The url starts after the 28 wide status icon and its margin.
      text: { x: pill.x + 4 + 28 + 4, y: middle, size: 16 },
    },
  ];
  return bars;
}

/** Everything the browser draws around the page, or null for a device without a browser. */
export function barsOf(
  device: Screen,
  orientation: OrientationValue,
  layout: BrowserLayout | null,
  minimized: boolean,
): Bars | null {
  if (!layout || layout === "off") return null;
  const safari = SAFARI[device.id];
  if (safari) return safariBars(device, safari, orientation, layout, minimized);
  const chrome = CHROME[device.id];
  if (chrome) return chromeBars(device, chrome, orientation, layout, minimized);
  return null;
}
