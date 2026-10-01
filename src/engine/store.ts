import type {
  ContrastValue,
  DevknobsState,
  DevknobsStatePatch,
  DirValue,
  GeoErrorValue,
  MotionValue,
  SchemeValue,
  TransparencyValue,
  VisionValue,
} from "../types";
import { DEFAULT_ACCURACY, DEFAULT_SPEED } from "./geo";

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
  text: "system",
  spacing: false,
  width: "full",
  frame: false,
  dpr: "system",
  vision: "none",
  overflow: false,
  outlines: false,
  panel: { open: true, y: 16, top: 16 },
};

const SCHEMES: SchemeValue[] = ["light", "dark", "system"];
const MOTIONS: MotionValue[] = ["reduce", "system"];
const CONTRASTS: ContrastValue[] = ["more", "system"];
const TRANSPARENCIES: TransparencyValue[] = ["reduce", "system"];
const DIRS: DirValue[] = ["ltr", "rtl", "system"];
const GEO_ERRORS: GeoErrorValue[] = ["none", "denied", "unavailable", "timeout"];
const VISIONS: VisionValue[] = [
  "none",
  "protanopia",
  "deuteranopia",
  "tritanopia",
  "achromatopsia",
  "blur",
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
  const panel = record(state.panel);
  const panelY = num(panel.y, DEFAULT_STATE.panel.y);
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
    text: numberOr(state.text, "system", DEFAULT_STATE.text),
    spacing: bool(state.spacing, DEFAULT_STATE.spacing),
    width: numberOr(state.width, "full", DEFAULT_STATE.width),
    frame: bool(state.frame, DEFAULT_STATE.frame),
    dpr: numberOr(state.dpr, "system", DEFAULT_STATE.dpr),
    vision: oneOf(state.vision, VISIONS, DEFAULT_STATE.vision),
    overflow: bool(state.overflow, DEFAULT_STATE.overflow),
    outlines: bool(state.outlines, DEFAULT_STATE.outlines),
    panel: {
      open: bool(panel.open, DEFAULT_STATE.panel.open),
      y: panelY,
      // A session stored before the panel had a place of its own only has `y`.
      top: num(panel.top, panelY),
    },
  };
}

/** Merge a patch into a state, one level deep for the object knobs. */
export function merge(state: DevknobsState, patch: DevknobsStatePatch): DevknobsState {
  return {
    ...state,
    ...patch,
    locale: { ...state.locale, ...patch.locale },
    geo: { ...state.geo, ...patch.geo },
    panel: { ...state.panel, ...patch.panel },
  };
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

export function clear(): void {
  try {
    storage()?.removeItem(STORAGE_KEY);
  } catch {
    // Same.
  }
}
