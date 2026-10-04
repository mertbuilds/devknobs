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
  /** A Face ID phone: the island the status bar sits around, and its bars higher off the bottom. */
  faceId: boolean;
}

/**
 * The 16 family and the SE are measured. The 17 family and the Air have the
 * simulator's insets. Estimates: the 18 Pro's, whose island keeps the 17
 * Pro's top and height, and the 16 Plus's, the 16's. Derived, as no one has
 * measured Safari on a Duo: the cover screen's top inset is the simulator's
 * 82 under its camera hole, at both sides too when turned, and the inner
 * screen, which has no cut-out, gets a plain bar 40 high and 24 at each side
 * when held across, clear of its round corners.
 */
const SAFARI: Record<string, SafariSpec> = {
  "iphone-18-pro": { top: 62, side: 62, faceId: true },
  "iphone-18-pro-max": { top: 62, side: 62, faceId: true },
  "iphone-duo-closed": { top: 82, side: 82, faceId: true },
  "iphone-duo-open": { top: 40, side: 24, faceId: true },
  "iphone-air": { top: 68, side: 68, faceId: true },
  "iphone-17": { top: 62, side: 62, faceId: true },
  "iphone-17-pro": { top: 62, side: 62, faceId: true },
  "iphone-17-pro-max": { top: 62, side: 62, faceId: true },
  "iphone-16": { top: 59, side: 59, faceId: true },
  "iphone-16-plus": { top: 59, side: 59, faceId: true },
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
  edge = false,
): Rect {
  const { width: W, height: H } = turn(device, orientation);
  const whole = rect(0, 0, W, H);
  if (!layout || layout === "off") return whole;
  const safari = SAFARI[device.id];
  if (safari) {
    // Edge to edge, the page runs under the bars to the bottom of the screen,
    // in both states, as it looks on the phone. The top keeps the status bar.
    if (edge) {
      return orientation === "landscape"
        ? rect(safari.side, 0, W - 2 * safari.side, H)
        : rect(0, safari.top, W, H - safari.top);
    }
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

/**
 * The room the end of a page drawn edge to edge needs so its last content
 * scrolls clear of the bars: how far the frame runs past the bottom of the
 * viewport Safari gives the page, bars as they are. On the phone the page
 * ends there, and under the bars is its plain background. None where the
 * frame is that viewport, and none for the bars at the top.
 */
export function endRoom(
  device: Screen,
  orientation: OrientationValue,
  layout: BrowserLayout | null,
  minimized: boolean,
  edge: boolean,
): number {
  if (!edge) return 0;
  const drawn = viewportOf(device, orientation, layout, minimized, true);
  const real = viewportOf(device, orientation, layout, minimized);
  return drawn.y + drawn.height - (real.y + real.height);
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
  /** The screen and the way it is held, so the bars' other state can be drawn too. */
  screen: Screen;
  orientation: OrientationValue;
  minimized: boolean;
  status: StatusBar | null;
  shapes: Shape[];
  /** Chrome's chin under the toolbar, in the toolbar's color. */
  chin: Rect | null;
  /** Chrome's hairline between the toolbar and the page. */
  hairline: Rect | null;
  /** Safari's scroll edge under its bottom bars. */
  fade: Fade | null;
  /** Safari draws the page under its bars, to the bottom of the screen. */
  edge: boolean;
}

/**
 * A fade from clear into the page's background, `y` to the screen's bottom,
 * with how opaque it is `at` px down it.
 */
export interface Fade {
  y: number;
  height: number;
  stops: { at: number; alpha: number }[];
}

/**
 * Safari's bottom scroll edge, by distance from the bottom of the viewport.
 * On the phone the page runs on under the bars and the fade lies over it:
 * measured on the 16 Pro over a blue and a green line, in light and dark, it
 * is 0.09 opaque at the viewport's end and 0.55 38 px under it, about 0.9 at
 * the bottom. The frame cannot draw the page past its end, so the same eased
 * curve is moved up to end near opaque at the frame's edge, and the page
 * dissolves into its color there instead of stopping at a line.
 */
const FADE: readonly [number, number][] = [
  [-64, 0],
  [-52, 0.05],
  [-40, 0.12],
  [-28, 0.24],
  [-18, 0.4],
  [-9, 0.6],
  [0, 0.85],
]

/** How opaque the fade is at the screen's bottom. */
const FADE_EDGE = 0.92;

/**
 * The scroll edge over a page drawn to the bottom of the screen, as a real
 * iPhone shows it: clear 40 px over the top of the bottom bars, rising to
 * 0.55 of the page's color at the bottom, and only over the last 24 px,
 * weaker, while the bars are minimized. Never opaque. Estimates from a
 * screenshot of a real iPhone.
 */
function edgeFade(bars: Bars, H: number): Fade {
  const low = bars.shapes.filter((shape) => shape.kind !== "pill" && shape.y > H / 2);
  if (bars.minimized || low.length === 0) {
    const stops = [
      { at: 0, alpha: 0 },
      { at: 12, alpha: 0.12 },
      { at: 24, alpha: 0.35 },
    ];
    return { y: H - 24, height: 24, stops };
  }
  const y = Math.min(...low.map((shape) => shape.y)) - 40;
  const height = H - y;
  const eased: [number, number][] = [
    [0, 0],
    [0.33, 0.06],
    [0.6, 0.18],
    [0.8, 0.33],
    [1, 0.55],
  ];
  return { y, height, stops: eased.map(([at, alpha]) => ({ at: Math.round(at * height), alpha })) };
}

/** The fade under the bottom bars, from just over the viewport's end at `end`. */
function fadeFrom(end: number, H: number): Fade | null {
  if (end >= H) return null;
  const y = end + (FADE[0]?.[0] ?? 0);
  const stops = FADE.filter(([at]) => end + at < H).map(([at, alpha]) => {
    return { at: end + at - y, alpha };
  });
  return { y, height: H - y, stops: [...stops, { at: H - y, alpha: FADE_EDGE }] };
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
  const bars: Bars = {
    platform: "safari",
    layout,
    screen: device,
    orientation,
    minimized,
    status: null,
    shapes: [],
    chin: null,
    hairline: null,
    fade: null,
    edge: false,
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
  const page = viewportOf(device, orientation, layout, minimized);
  bars.fade = fadeFrom(page.y + page.height, H);
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
 * Derived for the Duo: on its cover screen the time on the left and the icons
 * left of the camera hole, on the hole's center line, and on its inner screen
 * a plain bar, the time and the icons clear of the round corners.
 */
function safariStatus(id: string, spec: SafariSpec, W: number): StatusBar {
  const island = sensorMiddle(id);
  if (!spec.faceId) {
    return {
      height: spec.top,
      time: { x: W / 2, y: 10, size: 15 },
      icons: { x: 6, y: 10, align: "start" },
      battery: { x: W - 7, y: 10 },
    };
  }
  if (!island) {
    const y = spec.top / 2 + 2;
    return {
      height: spec.top,
      time: { x: 58, y, size: 17 },
      icons: { x: W - 36, y, align: "end" },
    };
  }
  const left = island.x - island.width / 2;
  if (left > W / 2) {
    return {
      height: spec.top,
      time: { x: 52, y: island.y, size: 17 },
      icons: { x: left - 12, y: island.y, align: "end" },
    };
  }
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
  const bars: Bars = {
    platform: "chrome",
    layout,
    screen: device,
    orientation,
    minimized,
    status: chromeStatus(device.id, statusHeight, W, orientation),
    shapes: [],
    chin: null,
    hairline: null,
    fade: null,
    edge: false,
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
  edge = false,
): Bars | null {
  if (!layout || layout === "off") return null;
  const safari = SAFARI[device.id];
  if (safari) {
    const bars = safariBars(device, safari, orientation, layout, minimized);
    if (!edge) return bars;
    const { height: H } = turn(device, orientation);
    return { ...bars, edge, fade: orientation === "portrait" ? edgeFade(bars, H) : null };
  }
  const chrome = CHROME[device.id];
  if (chrome) return chromeBars(device, chrome, orientation, layout, minimized);
  return null;
}

/**
 * How the bars follow the page's scroll, as Safari and Chrome do: a scroll
 * down minimizes them, a deliberate scroll up or the top of the page brings
 * them back, and so do a tap on the minimized bar and a new page.
 */
export interface BarsMotion {
  minimized: boolean;
  /** The scroll position the travel since the last turn counts from. */
  anchor: number;
  /** The scroll position last seen. */
  y: number;
  /** Until when scrolls are the page settling into a new viewport, not the user's. */
  lockUntil: number;
}

export type BarsEvent =
  | { type: "scroll"; y: number; time: number }
  | { type: "tap" }
  | { type: "navigate" }
  /** The frame was resized for the bars, or its page given another end room, at `time`. */
  | { type: "resize"; time: number };

/** Downward travel that minimizes, and upward travel that brings the bars back, in css px. */
export const BARS_DOWN = 16;
export const BARS_UP = 40;
/** At or above this the page is at its top, where the bars always show. */
const BARS_TOP = 1;
/** How long the scrolls after a resize of the frame are its own, in ms. */
export const BARS_LOCK = 450;

export const BARS_START: BarsMotion = { minimized: false, anchor: 0, y: 0, lockUntil: 0 };

export function barsStep(state: BarsMotion, event: BarsEvent): BarsMotion {
  if (event.type === "navigate") return BARS_START;
  if (event.type === "tap") return { ...state, minimized: false, anchor: state.y };
  if (event.type === "resize") return { ...state, lockUntil: event.time + BARS_LOCK };
  const { y, time } = event;
  // The page moving under a resize is not the user scrolling: count from here.
  if (time < state.lockUntil) return { ...state, y, anchor: y };
  if (y <= BARS_TOP) return { ...state, minimized: false, y, anchor: y };
  if (state.minimized) {
    const anchor = Math.max(state.anchor, y);
    if (anchor - y >= BARS_UP) return { ...state, minimized: false, y, anchor: y };
    return { ...state, y, anchor };
  }
  const anchor = Math.min(state.anchor, y);
  if (y - anchor >= BARS_DOWN) return { ...state, minimized: true, y, anchor: y };
  return { ...state, y, anchor };
}
