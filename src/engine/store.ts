import type {
  ClockMode,
  ConnectionValue,
  ContrastValue,
  DevknobsState,
  DevknobsStatePatch,
  DirValue,
  EdgeValue,
  GeoErrorValue,
  GrabColorValue,
  MotionValue,
  OnlineValue,
  OrientationValue,
  SaveDataValue,
  SchemeValue,
  TransparencyValue,
  VisionValue,
} from "../types";
import { mergeClock } from "./clock";
import { deviceOf, hold, settle } from "./devices";
import { DEFAULT_ACCURACY, DEFAULT_SPEED } from "./geo";
import { clampZoom } from "./zoom";

export const STORAGE_KEY = "devknobs";

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
  frame: false,
  dpr: "system",
  zoom: "fit",
  vision: "none",
  ua: { preset: "system", custom: "" },
  overflow: false,
  outlines: false,
  grabColor: "auto",
  // Closed, the handle alone, until the user opens it.
  panel: { open: false, y: 16, top: 16, edge: "none", tab: "none", pinned: [] },
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
const ORIENTATIONS: OrientationValue[] = ["portrait", "landscape"];
const EDGES: EdgeValue[] = ["top", "bottom", "none"];
const VISIONS: VisionValue[] = [
  "none",
  "protanopia",
  "deuteranopia",
  "tritanopia",
  "achromatopsia",
  "blur",
];

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

/** The strings of a list, each once. Anything but a list reads as an empty one. */
function strings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter((item): item is string => typeof item === "string")));
}

/** Read a stored state, falling back to the defaults field by field. */
export function parse(json: string | null | undefined): DevknobsState {
  if (!json) return { ...DEFAULT_STATE };
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ...DEFAULT_STATE };
  }
  if (typeof raw !== "object" || raw === null) return { ...DEFAULT_STATE };
  const state = raw as Record<string, unknown>;
  const locale = record(state.locale);
  const geo = record(state.geo);
  const clock = record(state.clock);
  const network = record(state.network);
  const ua = record(state.ua);
  const panel = record(state.panel);
  const panelY = num(panel.y, DEFAULT_STATE.panel.y);
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
    frame: bool(state.frame, DEFAULT_STATE.frame),
    dpr: numberOr(state.dpr, "system", DEFAULT_STATE.dpr),
    // A session stored before the zoom knob fits the frame, as it did then.
    zoom: zoom === "fit" ? zoom : clampZoom(zoom),
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
      y: panelY,
      // A session stored before the panel had a place of its own only has `y`.
      top: num(panel.top, panelY),
      // One stored before the panel stuck to edges sticks to none, until the
      // panel next lays itself out and finds the edges it sits flush with.
      edge: oneOf(panel.edge, EDGES, DEFAULT_STATE.panel.edge),
      tab: oneOf(panel.tab, EDGES, DEFAULT_STATE.panel.tab),
      // One stored before rows stayed listed has none pinned.
      pinned: strings(panel.pinned),
    },
  };
}

/**
 * What reset all leaves: every knob at its default and no row pinned, with
 * the panel where it is.
 */
export function resetState(state: DevknobsState): DevknobsState {
  return { ...DEFAULT_STATE, panel: { ...state.panel, pinned: [] } };
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

function storage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function load(): DevknobsState {
  try {
    return parse(storage()?.getItem(STORAGE_KEY));
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export function save(state: DevknobsState): void {
  try {
    storage()?.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Private mode, disabled storage: knobs still work, they just do not stick.
  }
}
