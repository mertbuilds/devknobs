import type {
  BarsValue,
  BrowserValue,
  ClockMode,
  ConnectionValue,
  ContrastValue,
  DevknobsState,
  DevknobsStatePatch,
  DirValue,
  EdgeValue,
  GeoErrorValue,
  GrabColorValue,
  MatColorValue,
  MotionValue,
  OnlineValue,
  OrientationValue,
  PanelValue,
  SaveDataValue,
  SchemeValue,
  SideValue,
  TransparencyValue,
  VisionValue,
} from "../types";
import { mergeClock } from "./clock";
import { deviceOf, hold, settle } from "./devices";
import { DEFAULT_ACCURACY, DEFAULT_SPEED } from "./geo";
import { clampZoom } from "./zoom";

export const STORAGE_KEY = "devknobs";

/**
 * Where the panel's place is kept beside the session, in `localStorage`, so
 * a new tab or session starts with the panel where the user last put it.
 */
export const PLACE_KEY = "devknobs:place";

/** What of the panel outlives the session: its side and where it sits on it. */
export type PanelPlace = Pick<PanelValue, "side" | "y" | "top" | "edge" | "tab">;

/**
 * The rows a fresh panel lists, in the order they stand: the device, the
 * scheme, the text size and the locale.
 */
export const DEFAULT_PINNED: readonly string[] = ["device", "scheme", "text", "locale"];

/**
 * Rows an older version had, by the row their knobs live in now. The old
 * viewport row keeps its id: its width, dpr, zoom and frame are the viewport
 * row still, and its device shows in the device row while one is set.
 */
const MOVED_ROWS = new Map([
  ["speed", "motion"],
  ["pseudo", "locale"],
  ["timeZone", "clock"],
  ["ua", "device"],
  ["grabColor", "debug"],
]);

export const DEFAULT_STATE: DevknobsState = {
  scheme: "system",
  motion: "system",
  speed: 1,
  contrast: "system",
  transparency: "system",
  locale: { lang: "system", dir: "system" },
  pseudo: false,
  geo: {
    preset: "system",
    lat: 0,
    lng: 0,
    accuracy: DEFAULT_ACCURACY,
    timeZone: "",
    error: "none",
    route: "",
    speed: DEFAULT_SPEED,
  },
  timeZone: "geo",
  clock: { mode: "system", at: 0, since: 0, speed: 1, header: false },
  network: { online: "system", type: "system", saveData: "system" },
  text: "system",
  spacing: false,
  width: "full",
  height: "full",
  device: "none",
  orientation: "portrait",
  mock: true,
  touchPointer: true,
  browser: "auto",
  bars: "auto",
  edgeToEdge: true,
  frame: false,
  dpr: "system",
  zoom: "fit",
  mat: "blue",
  vision: "none",
  ua: { preset: "system", custom: "" },
  overflow: false,
  outlines: false,
  grabColor: "auto",
  // Closed, the handle alone, until the user opens it.
  panel: {
    open: false,
    side: "right",
    y: 16,
    top: 16,
    edge: "none",
    tab: "none",
    pinned: [...DEFAULT_PINNED],
  },
};

const SCHEMES: SchemeValue[] = ["light", "dark", "system"];
const MOTIONS: MotionValue[] = ["reduce", "system"];
const CONTRASTS: ContrastValue[] = ["more", "system"];
const TRANSPARENCIES: TransparencyValue[] = ["reduce", "system"];
const DIRS: DirValue[] = ["ltr", "rtl", "system"];
const GEO_ERRORS: GeoErrorValue[] = ["none", "denied", "unavailable", "timeout"];
const CLOCK_MODES: ClockMode[] = ["system", "offset", "frozen"];
const ONLINES: OnlineValue[] = ["offline", "system"];
const CONNECTIONS: ConnectionValue[] = ["slow-2g", "2g", "3g", "4g", "system"];
const SAVE_DATAS: SaveDataValue[] = ["on", "off", "system"];
const BARS: BarsValue[] = ["auto", "expanded", "minimized"];
const BROWSERS: BrowserValue[] = ["auto", "compact", "bottom", "top", "off"];
const ORIENTATIONS: OrientationValue[] = ["portrait", "landscape"];
const EDGES: EdgeValue[] = ["top", "bottom", "none"];
const SIDES: SideValue[] = ["left", "right"];
const VISIONS: VisionValue[] = [
  "none",
  "protanopia",
  "deuteranopia",
  "tritanopia",
  "achromatopsia",
  "blur",
];

const MAT_COLORS: MatColorValue[] = ["blue", "green", "magenta", "purple", "red", "graphite"];

const GRAB_COLORS: GrabColorValue[] = [
  "auto",
  "blue",
  "green",
  "pink",
  "orange",
  "purple",
  "cyan",
];

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function oneOf<T extends string>(value: unknown, allowed: T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function text(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function num(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/** A positive number, or the keyword that means "leave it alone". */
function numberOr<T extends string>(value: unknown, keyword: T, fallback: number | T): number | T {
  if (value === keyword) return keyword;
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  return fallback;
}

/** A playback rate. Zero pauses, so only a negative or a non-number falls back. */
function rate(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}

/**
 * The row ids of a stored list, a moved row under its row of today, each
 * once. Anything but a list reads as an empty one.
 */
function rowIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids = value.filter((item): item is string => typeof item === "string");
  return Array.from(new Set(ids.map((id) => MOVED_ROWS.get(id) ?? id)));
}

/** Stored json as a value, or null where there is none or it does not read. */
function read(json: string | null | undefined): unknown {
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/**
 * The place fields of a stored panel, each one that is not valid taken from
 * `fallback`. One stored before the panel had a top of its own only has `y`,
 * and one stored before it had sides lives on the right, unless `fallback`
 * says otherwise.
 */
function placeOf(value: unknown, fallback: PanelPlace): PanelPlace {
  const panel = record(value);
  return {
    side: oneOf(panel.side, SIDES, fallback.side),
    y: num(panel.y, fallback.y),
    top: num(panel.top, num(panel.y, fallback.top)),
    // One stored before the panel stuck to edges sticks to none, until the
    // panel next lays itself out and finds the edges it sits flush with.
    edge: oneOf(panel.edge, EDGES, fallback.edge),
    tab: oneOf(panel.tab, EDGES, fallback.tab),
  };
}

/** The place of a state's panel, as `PLACE_KEY` keeps it. */
export function placeText(state: DevknobsState): string {
  const { side, y, top, edge, tab } = state.panel;
  return JSON.stringify({ side, y, top, edge, tab });
}

/**
 * Read a stored state, falling back to the defaults field by field. The
 * panel's place falls back to `place`, the one kept across sessions, before
 * the defaults, so the session's own place wins where it has one.
 */
export function parse(json: string | null | undefined, place?: string | null): DevknobsState {
  const home = placeOf(read(place), DEFAULT_STATE.panel);
  const state = record(read(json));
  const locale = record(state.locale);
  const geo = record(state.geo);
  const clock = record(state.clock);
  const network = record(state.network);
  const ua = record(state.ua);
  const panel = record(state.panel);
  const device = text(state.device, DEFAULT_STATE.device);
  const zoom = numberOr(state.zoom, "fit", DEFAULT_STATE.zoom);
  return {
    scheme: oneOf(state.scheme, SCHEMES, DEFAULT_STATE.scheme),
    motion: oneOf(state.motion, MOTIONS, DEFAULT_STATE.motion),
    speed: rate(state.speed, DEFAULT_STATE.speed),
    contrast: oneOf(state.contrast, CONTRASTS, DEFAULT_STATE.contrast),
    transparency: oneOf(state.transparency, TRANSPARENCIES, DEFAULT_STATE.transparency),
    locale: {
      lang: text(locale.lang, DEFAULT_STATE.locale.lang),
      dir: oneOf(locale.dir, DIRS, DEFAULT_STATE.locale.dir),
    },
    pseudo: bool(state.pseudo, DEFAULT_STATE.pseudo),
    geo: {
      preset: text(geo.preset, DEFAULT_STATE.geo.preset),
      lat: num(geo.lat, DEFAULT_STATE.geo.lat),
      lng: num(geo.lng, DEFAULT_STATE.geo.lng),
      accuracy: num(geo.accuracy, DEFAULT_STATE.geo.accuracy),
      timeZone: text(geo.timeZone, DEFAULT_STATE.geo.timeZone),
      error: oneOf(geo.error, GEO_ERRORS, DEFAULT_STATE.geo.error),
      route: text(geo.route, DEFAULT_STATE.geo.route),
      speed: num(geo.speed, DEFAULT_STATE.geo.speed),
    },
    // A session stored before the knob had a field of its own follows geo, as it did then.
    timeZone: text(state.timeZone, "") || DEFAULT_STATE.timeZone,
    // A session stored before the clock had a knob reads the real one.
    clock: {
      mode: oneOf(clock.mode, CLOCK_MODES, DEFAULT_STATE.clock.mode),
      at: num(clock.at, DEFAULT_STATE.clock.at),
      since: num(clock.since, DEFAULT_STATE.clock.since),
      speed: rate(clock.speed, DEFAULT_STATE.clock.speed),
      header: bool(clock.header, DEFAULT_STATE.clock.header),
    },
    network: {
      online: oneOf(network.online, ONLINES, DEFAULT_STATE.network.online),
      type: oneOf(network.type, CONNECTIONS, DEFAULT_STATE.network.type),
      saveData: oneOf(network.saveData, SAVE_DATAS, DEFAULT_STATE.network.saveData),
    },
    text: numberOr(state.text, "system", DEFAULT_STATE.text),
    spacing: bool(state.spacing, DEFAULT_STATE.spacing),
    width: numberOr(state.width, "full", DEFAULT_STATE.width),
    height: numberOr(state.height, "full", DEFAULT_STATE.height),
    device: deviceOf(device) ? device : DEFAULT_STATE.device,
    orientation: oneOf(state.orientation, ORIENTATIONS, DEFAULT_STATE.orientation),
    // A session stored before the mock draws one.
    mock: bool(state.mock, DEFAULT_STATE.mock),
    // A session stored before the touch pointer has the mouse act as a finger.
    touchPointer: bool(state.touchPointer, DEFAULT_STATE.touchPointer),
    // A session stored before the browser bars shows the device's browser.
    browser: oneOf(state.browser, BROWSERS, DEFAULT_STATE.browser),
    // One stored when the bars were a minimized flag keeps them minimized.
    bars: state.browserMin === true ? "minimized" : oneOf(state.bars, BARS, DEFAULT_STATE.bars),
    // A session stored before the switch draws the page under Safari's bars.
    edgeToEdge: bool(state.edgeToEdge, DEFAULT_STATE.edgeToEdge),
    frame: bool(state.frame, DEFAULT_STATE.frame),
    dpr: numberOr(state.dpr, "system", DEFAULT_STATE.dpr),
    // A session stored before the zoom knob fits the frame, as it did then.
    zoom: zoom === "fit" ? zoom : clampZoom(zoom),
    // A session stored before the mat had colors lies on the blue one.
    mat: oneOf(state.mat, MAT_COLORS, DEFAULT_STATE.mat),
    vision: oneOf(state.vision, VISIONS, DEFAULT_STATE.vision),
    ua: {
      preset: text(ua.preset, DEFAULT_STATE.ua.preset),
      custom: text(ua.custom, DEFAULT_STATE.ua.custom),
    },
    overflow: bool(state.overflow, DEFAULT_STATE.overflow),
    outlines: bool(state.outlines, DEFAULT_STATE.outlines),
    // A session stored before grab had a color to pick lets grab pick it.
    grabColor: oneOf(state.grabColor, GRAB_COLORS, DEFAULT_STATE.grabColor),
    panel: {
      open: bool(panel.open, DEFAULT_STATE.panel.open),
      ...placeOf(panel, home),
      // A stored panel keeps its list as it is, an empty one too, and one stored
      // before rows stayed listed has none pinned. With no panel stored, a
      // fresh session, the default rows are listed.
      pinned: state.panel === undefined ? [...DEFAULT_PINNED] : rowIds(panel.pinned),
    },
  };
}

/**
 * What reset all leaves: every knob at its default and the default rows
 * listed, with the panel where it is.
 */
export function resetState(state: DevknobsState): DevknobsState {
  return { ...DEFAULT_STATE, panel: { ...state.panel, pinned: [...DEFAULT_PINNED] } };
}

/**
 * Merge a patch into a state, one level deep for the object knobs. The clock
 * takes a new anchor when it moves. A device brings its size, and the device
 * fields follow the size the frame ends up with.
 */
export function merge(state: DevknobsState, patch: DevknobsStatePatch): DevknobsState {
  const held = hold(state, patch);
  return settle({
    ...state,
    ...held,
    locale: { ...state.locale, ...held.locale },
    geo: { ...state.geo, ...held.geo },
    clock: mergeClock(state.clock, held.clock),
    network: { ...state.network, ...held.network },
    ua: { ...state.ua, ...held.ua },
    panel: { ...state.panel, ...held.panel },
  });
}

function storage(kind: "session" | "local"): Storage | null {
  try {
    return kind === "session" ? window.sessionStorage : window.localStorage;
  } catch {
    return null;
  }
}

/** Either storage's value under a key, or null where it cannot be read. */
function item(kind: "session" | "local", key: string): string | null {
  try {
    return storage(kind)?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function load(): DevknobsState {
  return parse(item("session", STORAGE_KEY), item("local", PLACE_KEY));
}

export function save(state: DevknobsState): void {
  try {
    storage("session")?.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Private mode, disabled storage: knobs still work, they just do not stick.
  }
}

/**
 * Keep the panel's place across sessions. Only a move the user makes writes
 * it, so a tab that merely lays the panel out again leaves the place another
 * tab put there alone.
 */
export function keepPlace(state: DevknobsState): void {
  try {
    storage("local")?.setItem(PLACE_KEY, placeText(state));
  } catch {
    // The same: the panel just starts on the right in a new session.
  }
}
