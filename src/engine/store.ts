import type {
  ContrastValue,
  DevknobsState,
  DevknobsStatePatch,
  DirValue,
  MotionValue,
  SchemeValue,
} from "../types";
import { DEFAULT_ACCURACY } from "./geo";

export const STORAGE_KEY = "devknobs";

export const DEFAULT_STATE: DevknobsState = {
  scheme: "system",
  motion: "system",
  contrast: "system",
  locale: { lang: "system", dir: "system" },
  geo: { preset: "system", lat: 0, lng: 0, accuracy: DEFAULT_ACCURACY, timeZone: "" },
  text: "system",
  width: "full",
  outlines: false,
  panel: { open: true, y: 16, top: 16 },
};

const SCHEMES: SchemeValue[] = ["light", "dark", "system"];
const MOTIONS: MotionValue[] = ["reduce", "system"];
const CONTRASTS: ContrastValue[] = ["more", "system"];
const DIRS: DirValue[] = ["ltr", "rtl", "system"];

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
    contrast: oneOf(state.contrast, CONTRASTS, DEFAULT_STATE.contrast),
    locale: {
      lang: text(locale.lang, DEFAULT_STATE.locale.lang),
      dir: oneOf(locale.dir, DIRS, DEFAULT_STATE.locale.dir),
    },
    geo: {
      preset: text(geo.preset, DEFAULT_STATE.geo.preset),
      lat: num(geo.lat, DEFAULT_STATE.geo.lat),
      lng: num(geo.lng, DEFAULT_STATE.geo.lng),
      accuracy: num(geo.accuracy, DEFAULT_STATE.geo.accuracy),
      timeZone: text(geo.timeZone, DEFAULT_STATE.geo.timeZone),
    },
    text: numberOr(state.text, "system", DEFAULT_STATE.text),
    width: numberOr(state.width, "full", DEFAULT_STATE.width),
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
