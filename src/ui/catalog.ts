import { layoutOf, layoutOptions, platformOf } from "../engine/browserui";
import { CLOCK_PRESETS, realNow } from "../engine/clock";
import { DEVICES, deviceOf, formId, formOf, hasTouch, POSTURES } from "../engine/devices";
import { frameForced } from "../engine/frame";
import { GEO_PRESETS, resolveGeo } from "../engine/geo";
import { LOCALE_PRESETS } from "../engine/locale";
import { MAT_COLOR_NAMES, MAT_COLORS, matGradient } from "../engine/matcolors";
import { mockOf } from "../engine/mock";
import { DEFAULT_STATE } from "../engine/store";
import { canonicalZone, TIME_ZONE_PRESETS } from "../engine/time";
import { GRAB_COLOR_NAMES, GRAB_COLORS } from "../grab/colors";
import { UA_PRESETS, uaPreset } from "../engine/ua";
import { percent, ZOOM_MAX, ZOOM_MIN, ZOOM_PRESETS } from "../engine/zoom";
import type {
  BarsValue,
  BrowserValue,
  ClockMode,
  ConnectionValue,
  ContrastValue,
  DevknobsState,
  DevknobsStatePatch,
  DirValue,
  GeoErrorValue,
  GrabColorValue,
  MotionValue,
  OnlineValue,
  SaveDataValue,
  SchemeValue,
  TransparencyValue,
  VisionValue,
} from "../types";

/**
 * Every knob the panel offers, as data: what it is called, what it can be set
 * to and how, and how it reads back. The active rows, their editors and the
 * search all come from here.
 */

export type Category =
  | "look"
  | "motion"
  | "language"
  | "location and time"
  | "network"
  | "device"
  | "viewport"
  | "debug";

export const CATEGORIES: readonly Category[] = [
  "look",
  "motion",
  "language",
  "location and time",
  "network",
  "device",
  "viewport",
  "debug",
];

/**
 * How an editor sets the knob: on and off, a few choices, colors to pick
 * from, number chips, or a long list.
 */
export type Control = "switch" | "segments" | "swatches" | "chips" | "list";

export interface Option {
  /** What the knob is set to, as text. */
  value: string;
  /** What a chip, a segment or a list line says. */
  label: string;
  /** What a search result says after the knob's name, where the label is too short. */
  long?: string;
  /** More words search finds the option by. */
  aliases?: readonly string[];
  /** Picking it opens the knob's editor too, which has more to fill in. */
  opens?: boolean;
  /** The heading a long list shows it under. */
  group?: string;
  /** What a swatch is painted with, as a css background. */
  swatch?: string;
}

/** What changes without a knob moving. */
export interface Live {
  /** The time the page reads, in epoch ms. */
  now: number;
  /** The real time, in epoch ms. */
  real: number;
  /** How many boxes stick out sideways, null until it is known. */
  overflow: number | null;
}

export type KnobId =
  | "scheme"
  | "contrast"
  | "transparency"
  | "text"
  | "spacing"
  | "motion"
  | "speed"
  | "locale"
  | "direction"
  | "pseudo"
  | "geo"
  | "geoError"
  | "timeZone"
  | "clock"
  | "clockMode"
  | "clockSpeed"
  | "header"
  | "online"
  | "connection"
  | "saveData"
  | "device"
  | "mock"
  | "touchPointer"
  | "browser"
  | "bars"
  | "edgeToEdge"
  | "width"
  | "dpr"
  | "zoom"
  | "frame"
  | "mat"
  | "vision"
  | "ua"
  | "overflow"
  | "outlines"
  | "grabColor";

export interface Knob {
  id: KnobId;
  label: string;
  category: Category;
  control: Control;
  /** What the editor offers. A switch has two, off first. */
  options: readonly Option[];
  /** More words search finds the knob by. */
  aliases: readonly string[];
  /** The value that is on, as one of the option values where it is one. */
  read(state: DevknobsState): string;
  /** The patch that sets the knob to a value. */
  write(value: string, state: DevknobsState): DevknobsStatePatch;
  /** The patch that puts the knob back to its default. */
  reset: DevknobsStatePatch;
  /** The knob's part of its row's summary, asked only while it is off its default. */
  brief?(state: DevknobsState, live: Live): string;
  /** What a value outside the options is called. */
  name?(value: string): string;
  /** A value typed out in full that is not an option, or null. */
  parse?(text: string): Option | null;
  /** Search reads a typed value as this knob's even when the query does not name it. */
  bare?: boolean;
  /** More values search reaches than the editor lists. */
  extra?(): readonly Option[];
  /** False where the browser has nothing for the knob to act on. */
  available?(): boolean;
  /** The option values the editor shows for this state, in order, where they depend on it. */
  offers?(state: DevknobsState): readonly string[];
  /**
   * The value another knob brought, which stands in for the default while it
   * does: such a value puts the knob off nothing, and its row's `×` puts it back.
   */
  base?(state: DevknobsState): string | undefined;
}

export type RowId =
  | "scheme"
  | "contrast"
  | "transparency"
  | "vision"
  | "text"
  | "motion"
  | "locale"
  | "location"
  | "clock"
  | "network"
  | "device"
  | "viewport"
  | "debug";

/** One line of the active list, with the knobs that read best together. */
export interface Row {
  id: RowId;
  label: string;
  knobs: readonly KnobId[];
}

const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;
const WEEK = 7 * DAY;

/** Past this, a clock reads better as the day it shows than as a jump. */
const FAR = 60 * DAY;

function options(...values: string[]): Option[] {
  return values.map((value) => ({ value, label: value }));
}

const OFF_ON = options("off", "on");

function flag(value: boolean): string {
  return value ? "on" : "off";
}

/** A number typed out, if it falls between `min` and `max`. */
function numberIn(text: string, min: number, max: number): Option | null {
  const trimmed = text.trim();
  const value = Number(trimmed);
  if (trimmed === "" || !Number.isFinite(value) || value < min || value > max) return null;
  return { value: String(value), label: String(value) };
}

/**
 * `2026-10-04T09:30`, an instant the way a `datetime-local` input reads it,
 * on the page's own clock face.
 */
export function wallInput(time: number): string {
  const date = new Date(time);
  const pad = (value: number, length = 2) => String(value).padStart(length, "0");
  const day = `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return `${day}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** A jump of the clock in its largest unit, rounded: `+2d`, `-5m`, `now` under a minute. */
export function shiftLabel(ms: number): string {
  const sign = ms < 0 ? "-" : "+";
  const size = Math.abs(ms);
  if (size < MINUTE) return "now";
  if (size < HOUR) return `${sign}${Math.round(size / MINUTE)}m`;
  if (size < DAY) return `${sign}${Math.round(size / HOUR)}h`;
  return `${sign}${Math.round(size / DAY)}d`;
}

const UNITS: readonly { pattern: RegExp; ms: number; short: string; word: string }[] = [
  { pattern: /^(m|mins?|minutes?)$/, ms: MINUTE, short: "m", word: "minute" },
  { pattern: /^(h|hrs?|hours?)$/, ms: HOUR, short: "h", word: "hour" },
  { pattern: /^(d|days?)$/, ms: DAY, short: "d", word: "day" },
  { pattern: /^(w|wks?|weeks?)$/, ms: WEEK, short: "w", word: "week" },
];

/** `+2d`, `2 days` or `-3h` as a jump of the clock, in ms from the real now. */
export function parseShift(text: string): Option | null {
  const match = /^([+-]?)\s*(\d+(?:\.\d+)?)\s*([a-z]+)$/i.exec(text.trim());
  if (!match) return null;
  const [, sign = "", amount = "", unitText = ""] = match;
  const unit = UNITS.find((entry) => entry.pattern.test(unitText.toLowerCase()));
  const count = Number(amount);
  if (!unit || !(count > 0)) return null;
  const prefix = sign === "-" ? "-" : "+";
  const ms = Math.round(count * unit.ms) * (sign === "-" ? -1 : 1);
  return {
    value: String(ms),
    label: `${prefix}${count}${unit.short}`,
    long: `${prefix}${count} ${unit.word}${count === 1 ? "" : "s"}`,
  };
}

let languageNames: Intl.DisplayNames | null | undefined;

/** The English name of a language tag, lower case, or undefined when Intl does not know it. */
function languageName(tag: string): string | undefined {
  if (languageNames === undefined) {
    try {
      languageNames = new Intl.DisplayNames(["en"], { type: "language" });
    } catch {
      languageNames = null;
    }
  }
  try {
    const name = languageNames?.of(tag);
    return name && name.toLowerCase() !== tag.toLowerCase() ? name.toLowerCase() : undefined;
  } catch {
    return undefined;
  }
}

/** A language tag typed out, such as `pt-BR`, in its canonical spelling. */
function parseTag(text: string): Option | null {
  const trimmed = text.trim();
  // Two letters up front, so a word such as `geo` is not read as a three letter code.
  if (!/^[a-z]{2}(-[a-z0-9]{2,8})*$/i.test(trimmed)) return null;
  try {
    const [tag] = Intl.getCanonicalLocales(trimmed);
    if (!tag || !languageName(tag)) return null;
    return { value: tag, label: tag.toLowerCase(), aliases: [languageName(tag) ?? ""] };
  } catch {
    return null;
  }
}

/** `36.9, 30.7` as a custom position. */
function parseLatLng(text: string): Option | null {
  const match = /^(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)$/.exec(text.trim());
  if (!match) return null;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { value: `${lat},${lng}`, label: `${lat}, ${lng}` };
}

/** Two decimals are a street or so, plenty for a summary. */
function coordinate(value: number): string {
  return String(Math.round(value * 100) / 100);
}

const PRESET_ZONES = new Set<string>(TIME_ZONE_PRESETS);
let zones: Option[] | null = null;

/** Every zone the engine knows, past the presets, for search to reach. */
function allZones(): readonly Option[] {
  if (!zones) {
    let names: string[] = [];
    try {
      names = Intl.supportedValuesOf("timeZone");
    } catch {
      // An engine without the list still takes a zone typed out in full.
    }
    zones = names
      .filter((zone) => !PRESET_ZONES.has(zone))
      .map((zone) => ({ value: zone, label: zone }));
  }
  return zones;
}

/** A user agent typed out: a product and its version up front, such as `curl/8.7.1`. */
function parseUserAgent(text: string): Option | null {
  const trimmed = text.trim();
  return /^[\w.!#$%&'*+^`|~-]+\/\S/.test(trimmed) ? { value: trimmed, label: trimmed } : null;
}

/** More words each user agent preset is found by. */
const UA_ALIASES: Record<string, readonly string[]> = {
  "iphone-safari": ["ios", "mobile"],
  "android-chrome": ["mobile", "pixel"],
  "ipad-safari": ["ipados", "tablet"],
  "mac-safari": ["macos"],
  "mac-chrome": ["macos"],
  "windows-chrome": ["pc"],
  "windows-edge": ["microsoft", "pc"],
  "linux-firefox": ["gecko", "mozilla"],
  googlebot: ["bot", "crawler", "google", "seo"],
};

function hasConnection(): boolean {
  return typeof navigator !== "undefined" && "connection" in navigator;
}

const SCHEME: Knob = {
  id: "scheme",
  label: "scheme",
  category: "look",
  control: "segments",
  options: options("system", "light", "dark"),
  aliases: ["color", "theme", "mode", "appearance"],
  read: (state) => state.scheme,
  write: (value) => ({ scheme: value as SchemeValue }),
  reset: { scheme: DEFAULT_STATE.scheme },
};

const CONTRAST: Knob = {
  id: "contrast",
  label: "contrast",
  category: "look",
  control: "segments",
  options: [
    { value: "system", label: "system" },
    { value: "more", label: "more", aliases: ["high"] },
  ],
  aliases: [],
  read: (state) => state.contrast,
  write: (value) => ({ contrast: value as ContrastValue }),
  reset: { contrast: DEFAULT_STATE.contrast },
};

const TRANSPARENCY: Knob = {
  id: "transparency",
  label: "transparency",
  category: "look",
  control: "segments",
  options: options("system", "reduce"),
  aliases: ["reduced", "blur"],
  read: (state) => state.transparency,
  write: (value) => ({ transparency: value as TransparencyValue }),
  reset: { transparency: DEFAULT_STATE.transparency },
};

const TEXT: Knob = {
  id: "text",
  label: "text size",
  category: "look",
  control: "chips",
  options: options("system", "13", "15", "17", "20"),
  aliases: ["font", "font size", "root"],
  read: (state) => String(state.text),
  write: (value) => ({ text: value === "system" ? "system" : Number(value) }),
  reset: { text: DEFAULT_STATE.text },
  parse: (text) => numberIn(text, 6, 72),
};

const SPACING: Knob = {
  id: "spacing",
  label: "text spacing",
  category: "look",
  control: "switch",
  options: OFF_ON,
  aliases: ["wcag", "letter", "line height"],
  read: (state) => flag(state.spacing),
  write: (value) => ({ spacing: value === "on" }),
  reset: { spacing: DEFAULT_STATE.spacing },
  brief: () => "spacing",
};

const MOTION: Knob = {
  id: "motion",
  label: "motion",
  category: "motion",
  control: "segments",
  options: [
    { value: "system", label: "system" },
    { value: "reduce", label: "reduce", aliases: ["reduced"] },
  ],
  aliases: ["reduced", "animation", "animations"],
  read: (state) => state.motion,
  write: (value) => ({ motion: value as MotionValue }),
  reset: { motion: DEFAULT_STATE.motion },
};

const SPEED: Knob = {
  id: "speed",
  label: "speed",
  category: "motion",
  control: "chips",
  options: [
    { value: "1", label: "1" },
    { value: "0.25", label: "0.25", aliases: ["slow"] },
    { value: "0.1", label: "0.1", aliases: ["slower"] },
    { value: "0", label: "pause", aliases: ["paused", "stop"] },
  ],
  aliases: ["animation speed", "playback", "rate"],
  read: (state) => String(state.speed),
  write: (value) => ({ speed: Number(value) }),
  reset: { speed: DEFAULT_STATE.speed },
  parse: (text) => numberIn(text, 0, 16),
};

const LOCALE: Knob = {
  id: "locale",
  label: "locale",
  category: "language",
  control: "list",
  options: [
    { value: "system", label: "system" },
    ...LOCALE_PRESETS.map((tag) => ({
      value: tag,
      label: tag.toLowerCase(),
      aliases: [languageName(tag) ?? ""],
    })),
  ],
  aliases: ["language", "lang", "i18n"],
  read: (state) => state.locale.lang,
  write: (value) => ({ locale: { lang: value } }),
  reset: { locale: { lang: DEFAULT_STATE.locale.lang } },
  name: (value) => value.toLowerCase(),
  parse: parseTag,
  bare: true,
};

const DIRECTION: Knob = {
  id: "direction",
  label: "direction",
  category: "language",
  control: "segments",
  options: options("system", "ltr", "rtl"),
  aliases: ["dir", "writing"],
  read: (state) => state.locale.dir,
  write: (value) => ({ locale: { dir: value as DirValue } }),
  reset: { locale: { dir: DEFAULT_STATE.locale.dir } },
};

const PSEUDO: Knob = {
  id: "pseudo",
  label: "pseudo",
  category: "language",
  control: "switch",
  options: OFF_ON,
  aliases: ["pseudo-localization", "pseudolocalization", "accents"],
  read: (state) => flag(state.pseudo),
  write: (value) => ({ pseudo: value === "on" }),
  reset: { pseudo: DEFAULT_STATE.pseudo },
};

const GEO: Knob = {
  id: "geo",
  label: "geo",
  category: "location and time",
  control: "list",
  options: [
    { value: "system", label: "system" },
    ...GEO_PRESETS.map((preset) => ({ value: preset.id, label: preset.label.toLowerCase() })),
    { value: "custom", label: "custom", opens: true },
    { value: "route", label: "route", opens: true },
  ],
  aliases: ["location", "geolocation", "gps", "position", "city"],
  read: (state) => state.geo.preset,
  write: (value, state) => {
    if (value.includes(",")) {
      const [lat = 0, lng = 0] = value.split(",").map(Number);
      return { geo: { preset: "custom", lat, lng } };
    }
    // Custom starts from where the position is now, so it can be nudged from there.
    const fix = value === "custom" ? resolveGeo(state.geo) : null;
    return { geo: fix ? { preset: value, lat: fix.lat, lng: fix.lng } : { preset: value } };
  },
  reset: { geo: { preset: DEFAULT_STATE.geo.preset } },
  brief: (state) => {
    const { preset, lat, lng } = state.geo;
    if (preset === "custom") return `${coordinate(lat)}, ${coordinate(lng)}`;
    return GEO.options.find((option) => option.value === preset)?.label ?? preset;
  },
  parse: parseLatLng,
  bare: true,
};

const GEO_ERROR: Knob = {
  id: "geoError",
  label: "geo error",
  category: "location and time",
  control: "segments",
  options: options("none", "denied", "unavailable", "timeout"),
  aliases: ["permission", "fail"],
  read: (state) => state.geo.error,
  write: (value) => ({ geo: { error: value as GeoErrorValue } }),
  reset: { geo: { error: DEFAULT_STATE.geo.error } },
};

const TIME_ZONE: Knob = {
  id: "timeZone",
  label: "time zone",
  category: "location and time",
  control: "list",
  options: [
    { value: "geo", label: "follow geo" },
    { value: "system", label: "system" },
    ...options(...TIME_ZONE_PRESETS),
  ],
  aliases: ["timezone", "tz", "zone"],
  read: (state) => state.timeZone,
  write: (value) => ({ timeZone: value }),
  reset: { timeZone: DEFAULT_STATE.timeZone },
  parse: (text) => {
    const zone = text.trim() ? canonicalZone(text.trim()) : null;
    return zone ? { value: zone, label: zone } : null;
  },
  bare: true,
  extra: allZones,
};

const CLOCK: Knob = {
  id: "clock",
  label: "clock",
  category: "location and time",
  // Segments, not chips: six presets wrap as chips at the panel's width.
  control: "segments",
  options: [
    { value: "system", label: "system" },
    ...CLOCK_PRESETS.map((preset) => ({
      value: String(preset.ms),
      label: preset.label,
      long: parseShift(preset.label)?.long,
    })),
  ],
  aliases: ["time", "date", "now", "travel"],
  // A preset stays on until the clock moves some other way.
  read: (state) =>
    state.clock.mode === "system" ? "system" : String(state.clock.at - state.clock.since),
  write: (value, state) => {
    if (value === "system") return { clock: { mode: "system" } };
    const real = realNow();
    const mode: ClockMode = state.clock.mode === "frozen" ? "frozen" : "offset";
    return { clock: { mode, at: real + Number(value), since: real } };
  },
  reset: { clock: { mode: DEFAULT_STATE.clock.mode } },
  brief: (_state, live) => {
    const shift = live.now - live.real;
    return Math.abs(shift) > FAR ? wallInput(live.now).slice(0, 10) : shiftLabel(shift);
  },
  name: (value) => shiftLabel(Number(value)),
  parse: parseShift,
  bare: true,
};

const CLOCK_MODE: Knob = {
  id: "clockMode",
  label: "clock mode",
  category: "location and time",
  control: "segments",
  options: [
    { value: "offset", label: "running", aliases: ["offset", "run"] },
    { value: "frozen", label: "frozen", aliases: ["freeze", "stopped"] },
  ],
  aliases: [],
  read: (state) => state.clock.mode,
  write: (value) => ({ clock: { mode: value as ClockMode } }),
  reset: { clock: { mode: DEFAULT_STATE.clock.mode } },
  brief: (state) => (state.clock.mode === "frozen" ? "frozen" : ""),
};

const CLOCK_SPEED: Knob = {
  id: "clockSpeed",
  label: "clock speed",
  category: "location and time",
  control: "segments",
  options: [
    { value: "1", label: "1x" },
    { value: "60", label: "60x" },
    { value: "3600", label: "3600x" },
  ],
  aliases: ["fast", "forward"],
  read: (state) => String(state.clock.speed),
  // A speed only shows on a running clock, so the real one starts running from here.
  write: (value, state) => {
    const { mode } = state.clock;
    return { clock: { mode: mode === "system" ? "offset" : mode, speed: Number(value) } };
  },
  reset: { clock: { speed: DEFAULT_STATE.clock.speed } },
  name: (value) => `${value}x`,
  parse: (text) => {
    const option = numberIn(text.replace(/x$/i, ""), 0.001, 1_000_000);
    return option && { ...option, label: `${option.value}x` };
  },
};

const HEADER: Knob = {
  id: "header",
  label: "send to server",
  category: "location and time",
  control: "switch",
  options: OFF_ON,
  aliases: ["header", "server", "x-devknobs-now", "backend"],
  read: (state) => flag(state.clock.header),
  write: (value) => ({ clock: { header: value === "on" } }),
  reset: { clock: { header: DEFAULT_STATE.clock.header } },
  brief: () => "server",
};

const ONLINE: Knob = {
  id: "online",
  label: "network",
  category: "network",
  control: "segments",
  options: options("system", "offline"),
  aliases: ["online", "internet"],
  read: (state) => state.network.online,
  write: (value) => ({ network: { online: value as OnlineValue } }),
  reset: { network: { online: DEFAULT_STATE.network.online } },
};

const CONNECTION: Knob = {
  id: "connection",
  label: "connection",
  category: "network",
  control: "segments",
  options: options("system", "slow-2g", "2g", "3g", "4g"),
  aliases: ["effective type", "slow", "throttle"],
  read: (state) => state.network.type,
  write: (value) => ({ network: { type: value as ConnectionValue } }),
  reset: { network: { type: DEFAULT_STATE.network.type } },
  available: hasConnection,
};

const SAVE_DATA: Knob = {
  id: "saveData",
  label: "save data",
  category: "network",
  control: "segments",
  options: options("system", "on", "off"),
  aliases: ["data saver", "lite"],
  read: (state) => state.network.saveData,
  write: (value) => ({ network: { saveData: value as SaveDataValue } }),
  reset: { network: { saveData: DEFAULT_STATE.network.saveData } },
  brief: (state) => `save data ${state.network.saveData}`,
  available: hasConnection,
};

/** The smallest and largest frame a size typed out can ask for, in px. */
const MIN_SIZE = 120;
const MAX_SIZE = 8192;

/** `390x844`, `390 × 844` or `390*844` as a width and a height. */
function parseSize(text: string): Option | null {
  const match = /^(\d+)\s*[x×*]\s*(\d+)(?:\s*px)?$/i.exec(text.trim());
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if ([width, height].some((size) => size < MIN_SIZE || size > MAX_SIZE)) return null;
  return { value: `${width}x${height}`, label: `${width} × ${height}` };
}

const ORIENTATIONS = options("portrait", "landscape");

/** What search finds each posture by, beside its name. */
const POSTURE_ALIASES = { closed: ["fold", "folded", "shut"], open: ["unfold", "unfolded"] } as const;

/** A foldable in each of its postures, as search finds them: `iphone-duo:open` unfolds the Duo. */
const POSTURE_OPTIONS: readonly Option[] = DEVICES.flatMap((device) =>
  device.postures
    ? POSTURES.map((posture) => ({
        value: `${device.id}:${posture}`,
        label: `${device.label} ${posture}`,
        aliases: POSTURE_ALIASES[posture],
      }))
    : [],
);

/** The screen in use, a foldable's in its posture. */
function screenNow(state: DevknobsState): string {
  return formId(state.device, state.posture);
}

/** The frame's size as the device knob reads it, such as `390x844` or `fullx700`. */
function sizeValue(state: DevknobsState): string {
  return typeof state.height === "number" ? `${state.width}x${state.height}` : "none";
}

const DEVICE: Knob = {
  id: "device",
  label: "device",
  category: "device",
  control: "list",
  options: [
    { value: "none", label: "none" },
    ...DEVICES.map((device) => ({
      value: device.id,
      label: device.label,
      aliases: [device.kind, ...device.ua.split("-")],
      group: device.kind,
    })),
  ],
  aliases: ["devices", "height", "orientation", "rotate"],
  read: (state) => (state.device === "none" ? sizeValue(state) : state.device),
  write: (value, state) => {
    if (value === "portrait" || value === "landscape") return { orientation: value };
    const posture = POSTURES.find((name) => value.endsWith(`:${name}`));
    if (posture) return { device: value.slice(0, -posture.length - 1), posture };
    const size = /^(\d+|full)x(\d+)$/.exec(value);
    if (size) {
      return { width: size[1] === "full" ? "full" : Number(size[1]), height: Number(size[2]) };
    }
    if (value !== "none") return { device: value };
    // None takes away what the device brought, a dpr set since too.
    const device = formOf(state.device, state.posture);
    return device && state.dpr === device.dpr
      ? { device: "none", width: "full", height: "full", dpr: "system" }
      : { device: "none", width: "full", height: "full" };
  },
  // Back to no device, without the size and dpr the device brought.
  reset: {
    device: DEFAULT_STATE.device,
    width: DEFAULT_STATE.width,
    height: DEFAULT_STATE.height,
    dpr: DEFAULT_STATE.dpr,
    posture: DEFAULT_STATE.posture,
  },
  brief: (state) => {
    const device = deviceOf(state.device);
    if (!device) return nameOf(DEVICE, sizeValue(state));
    const posture = device.postures ? ` · ${state.posture}` : "";
    return `${device.label}${posture} · ${state.orientation}`;
  },
  name: (value) => value.replace("x", " × "),
  parse: parseSize,
  bare: true,
  extra: () => [...ORIENTATIONS, ...POSTURE_OPTIONS],
};

/** Does the device in use have a mock to draw? */
export function hasMock(state: DevknobsState): boolean {
  return mockOf(screenNow(state), state.orientation) !== null;
}

const MOCK: Knob = {
  id: "mock",
  label: "mock",
  category: "device",
  control: "switch",
  options: OFF_ON,
  aliases: ["mockup", "bezel", "body"],
  // On while it is drawn, so a phone or tablet is what puts it off its default.
  read: (state) => flag(state.mock && hasMock(state)),
  write: (value) => ({ mock: value === "on" }),
  reset: { mock: DEFAULT_STATE.mock },
  // The device says enough.
  brief: () => "",
  offers: (state) => (hasMock(state) ? ["off", "on"] : []),
};

const TOUCH_POINTER: Knob = {
  id: "touchPointer",
  label: "touch pointer",
  category: "device",
  control: "switch",
  options: OFF_ON,
  aliases: ["finger", "tap", "swipe", "drag", "cursor", "touch events"],
  // On while the device takes touch, so a phone or tablet is what puts it off its default.
  read: (state) => flag(state.touchPointer && hasTouch(state.device)),
  write: (value) => ({ touchPointer: value === "on" }),
  reset: { touchPointer: DEFAULT_STATE.touchPointer },
  brief: () => "",
  offers: (state) => (hasTouch(state.device) ? ["off", "on"] : []),
};

/** The layout of the phone's browser in use, or off for a device without one. */
function layoutNow(state: DevknobsState): string {
  return layoutOf(screenNow(state), state.browser) ?? "off";
}

const BROWSER: Knob = {
  id: "browser",
  label: "browser",
  category: "device",
  control: "segments",
  options: [
    { value: "compact", label: "compact", aliases: ["floating"] },
    { value: "bottom", label: "bottom" },
    { value: "top", label: "top" },
    { value: "off", label: "off", aliases: ["fullscreen"] },
  ],
  aliases: ["safari", "chrome", "address bar", "url bar", "search bar", "toolbar", "browser ui"],
  // The browser's own default while it is drawn, so a phone is what puts it off its default.
  read: layoutNow,
  write: (value) => ({ browser: value as BrowserValue }),
  reset: { browser: DEFAULT_STATE.browser },
  // The browser's own default says nothing.
  brief: (state) =>
    layoutNow(state) === layoutOptions(screenNow(state))[0] ? "" : layoutNow(state),
  offers: (state) => layoutOptions(screenNow(state)),
};

/** Are the browser's bars drawn, so they can be minimized? */
function barsShown(state: DevknobsState): boolean {
  return layoutNow(state) !== "off";
}

const BARS: Knob = {
  id: "bars",
  label: "bars",
  category: "device",
  control: "segments",
  options: [
    { value: "auto", label: "auto", aliases: ["scroll", "follow"] },
    { value: "expanded", label: "expanded" },
    { value: "minimized", label: "minimized", aliases: ["scrolled", "collapsed"] },
  ],
  aliases: ["browser bars", "minimize", "collapse"],
  read: (state) => (barsShown(state) ? state.bars : "auto"),
  write: (value) => ({ bars: value as BarsValue }),
  reset: { bars: DEFAULT_STATE.bars },
  offers: (state) => (barsShown(state) ? ["auto", "expanded", "minimized"] : []),
};

/** Is Safari drawn, so its page can run under its bars? */
function safariShown(state: DevknobsState): boolean {
  return platformOf(screenNow(state)) === "safari" && barsShown(state);
}

const EDGE_TO_EDGE: Knob = {
  id: "edgeToEdge",
  label: "edge to edge",
  category: "device",
  control: "switch",
  options: OFF_ON,
  aliases: ["edge", "under bars", "true height", "full height"],
  // On while Safari is drawn, so an iPhone is what puts it off its default.
  read: (state) => flag(state.edgeToEdge && safariShown(state)),
  write: (value) => ({ edgeToEdge: value === "on" }),
  reset: { edgeToEdge: DEFAULT_STATE.edgeToEdge },
  brief: () => "",
  offers: (state) => (safariShown(state) ? ["off", "on"] : []),
};

const WIDTH: Knob = {
  id: "width",
  label: "width",
  category: "viewport",
  control: "chips",
  options: [
    { value: "full", label: "full" },
    { value: "1024", label: "1024", aliases: ["laptop"] },
    { value: "768", label: "768", aliases: ["tablet", "ipad"] },
    { value: "390", label: "390", aliases: ["phone", "mobile", "iphone"] },
  ],
  aliases: ["viewport", "responsive", "breakpoint", "device"],
  read: (state) => String(state.width),
  write: (value) => ({ width: value === "full" ? "full" : Number(value) }),
  reset: { width: DEFAULT_STATE.width },
  // A device's size is the device row's.
  base: (state) => (deviceOf(state.device) ? String(state.width) : undefined),
  // With a height too, the device knob says the size.
  brief: (state) => (typeof state.height === "number" ? "" : String(state.width)),
  parse: (text) => {
    const match = /^(\d+)(?:\s*px)?$/i.exec(text.trim());
    return match ? numberIn(match[1] ?? "", MIN_SIZE, MAX_SIZE) : null;
  },
  bare: true,
};

const DPR: Knob = {
  id: "dpr",
  label: "dpr",
  category: "viewport",
  control: "chips",
  options: [
    { value: "system", label: "system" },
    { value: "1", label: "1" },
    { value: "2", label: "2", aliases: ["retina"] },
    { value: "3", label: "3" },
  ],
  aliases: ["pixel ratio", "device pixel ratio", "density", "resolution"],
  read: (state) => String(state.dpr),
  write: (value) => ({ dpr: value === "system" ? "system" : Number(value) }),
  reset: { dpr: DEFAULT_STATE.dpr },
  // A device's dpr is the device row's.
  base: (state) => {
    const device = formOf(state.device, state.posture);
    return device ? String(device.dpr) : undefined;
  },
  brief: (state) => `dpr ${state.dpr}`,
  parse: (text) => numberIn(text, 0.25, 5),
};

/** `80` or `80%` as a zoom, in reason. */
function parseZoom(text: string): Option | null {
  const match = /^(\d+(?:\.\d+)?)\s*%?$/.exec(text.trim());
  const scale = Number(match?.[1]) / 100;
  if (!match || !(scale >= ZOOM_MIN && scale <= ZOOM_MAX)) return null;
  return { value: String(scale), label: percent(scale) };
}

const ZOOM: Knob = {
  id: "zoom",
  label: "zoom",
  category: "viewport",
  // Segments, not chips: six presets wrap as chips at the panel's width.
  control: "segments",
  options: [
    { value: "fit", label: "fit", aliases: ["window"] },
    ...ZOOM_PRESETS.map((scale) => ({
      value: String(scale),
      label: String(Math.round(scale * 100)),
      long: percent(scale),
    })),
  ],
  aliases: ["scale", "magnify", "magnification"],
  read: (state) => String(state.zoom),
  write: (value) => ({ zoom: value === "fit" ? "fit" : Number(value) }),
  reset: { zoom: DEFAULT_STATE.zoom },
  brief: (state) => percent(Number(state.zoom)),
  name: (value) => percent(Number(value)),
  parse: parseZoom,
};

const FRAME: Knob = {
  id: "frame",
  label: "frame",
  category: "viewport",
  control: "switch",
  options: OFF_ON,
  aliases: ["iframe"],
  read: (state) => flag(state.frame),
  write: (value) => ({ frame: value === "on" }),
  reset: { frame: DEFAULT_STATE.frame },
  brief: (state) => (frameForced(state) ? "" : "frame"),
};

/** More words search finds each mat color by. */
const MAT_ALIASES: Partial<Record<string, readonly string[]>> = {
  green: ["classic"],
  graphite: ["black", "gray", "grey", "dark"],
};

const MAT: Knob = {
  id: "mat",
  label: "mat",
  category: "viewport",
  control: "swatches",
  options: MAT_COLOR_NAMES.map((name) => ({
    value: name,
    label: name,
    aliases: MAT_ALIASES[name],
    swatch: matGradient(MAT_COLORS[name].srgb),
  })),
  aliases: ["background", "cutting mat", "mat color", "letterbox"],
  read: (state) => state.mat,
  write: (value) => ({ mat: MAT_COLOR_NAMES.find((name) => name === value) ?? DEFAULT_STATE.mat }),
  reset: { mat: DEFAULT_STATE.mat },
};

const VISION: Knob = {
  id: "vision",
  label: "vision",
  category: "look",
  control: "list",
  options: [
    { value: "none", label: "none" },
    { value: "protanopia", label: "protanopia", aliases: ["red"] },
    { value: "deuteranopia", label: "deuteranopia", aliases: ["green"] },
    { value: "tritanopia", label: "tritanopia", aliases: ["blue"] },
    {
      value: "achromatopsia",
      label: "achromatopsia",
      aliases: ["gray", "grayscale", "monochrome"],
    },
    { value: "blur", label: "blur", aliases: ["blurry"] },
  ],
  aliases: ["color blind", "colorblind", "blindness", "deficiency"],
  read: (state) => state.vision,
  write: (value) => ({ vision: value as VisionValue }),
  reset: { vision: DEFAULT_STATE.vision },
};

const UA: Knob = {
  id: "ua",
  label: "user agent",
  category: "device",
  control: "list",
  options: [
    { value: "system", label: "system" },
    ...UA_PRESETS.map((preset) => ({
      value: preset.id,
      label: preset.label.toLowerCase(),
      aliases: UA_ALIASES[preset.id] ?? [],
    })),
    { value: "custom", label: "custom", opens: true },
  ],
  aliases: ["ua", "useragent", "browser"],
  read: (state) => state.ua.preset,
  write: (value, state) => {
    if (value === "system" || uaPreset(value)) return { ua: { preset: value } };
    if (value !== "custom") return { ua: { preset: "custom", custom: value } };
    // Custom starts from the user agent in use, so it can be edited from there.
    const real = typeof navigator === "undefined" ? "" : navigator.userAgent;
    const custom = uaPreset(state.ua.preset)?.userAgent || state.ua.custom || real;
    return { ua: { preset: "custom", custom } };
  },
  reset: { ua: { preset: DEFAULT_STATE.ua.preset } },
  // A device says its own.
  brief: (state) =>
    formOf(state.device, state.posture)?.ua === state.ua.preset ? "" : nameOf(UA, state.ua.preset),
  parse: parseUserAgent,
};

const OVERFLOW: Knob = {
  id: "overflow",
  label: "overflow",
  category: "debug",
  control: "switch",
  options: OFF_ON,
  aliases: ["horizontal", "scroll", "sideways"],
  read: (state) => flag(state.overflow),
  write: (value) => ({ overflow: value === "on" }),
  reset: { overflow: DEFAULT_STATE.overflow },
  brief: (_state, live) => (live.overflow === null ? "overflow" : `overflow · ${live.overflow}`),
};

const OUTLINES: Knob = {
  id: "outlines",
  label: "outlines",
  category: "debug",
  control: "switch",
  options: OFF_ON,
  aliases: ["outline", "borders", "boxes"],
  read: (state) => flag(state.outlines),
  write: (value) => ({ outlines: value === "on" }),
  reset: { outlines: DEFAULT_STATE.outlines },
  brief: () => "outlines",
};

/** Half blue and half green: the two colors grab picks from on its own. */
const AUTO_SWATCH = [
  "linear-gradient(135deg",
  `${GRAB_COLORS.blue.srgb} 50%`,
  `${GRAB_COLORS.green.srgb} 50%)`,
].join(", ");

const GRAB_COLOR: Knob = {
  id: "grabColor",
  label: "grab color",
  category: "debug",
  control: "swatches",
  options: [
    {
      value: "auto",
      label: "auto",
      aliases: ["automatic"],
      swatch: AUTO_SWATCH,
    },
    ...GRAB_COLOR_NAMES.map((name) => ({
      value: name,
      label: name,
      swatch: GRAB_COLORS[name].srgb,
    })),
  ],
  aliases: ["highlight", "overlay"],
  read: (state) => state.grabColor,
  write: (value) => ({ grabColor: value as GrabColorValue }),
  reset: { grabColor: DEFAULT_STATE.grabColor },
};

/**
 * Every knob, in the order search breaks ties by, the most asked for first:
 * `reduce` is motion before it is transparency. The browse list keeps this
 * order inside each category.
 */
export const KNOBS: readonly Knob[] = [
  SCHEME,
  MOTION,
  SPEED,
  CONTRAST,
  TRANSPARENCY,
  TEXT,
  SPACING,
  LOCALE,
  DIRECTION,
  PSEUDO,
  GEO,
  GEO_ERROR,
  TIME_ZONE,
  CLOCK,
  CLOCK_MODE,
  CLOCK_SPEED,
  HEADER,
  ONLINE,
  CONNECTION,
  SAVE_DATA,
  DEVICE,
  MOCK,
  TOUCH_POINTER,
  BROWSER,
  BARS,
  EDGE_TO_EDGE,
  WIDTH,
  DPR,
  ZOOM,
  FRAME,
  MAT,
  VISION,
  UA,
  OVERFLOW,
  OUTLINES,
  GRAB_COLOR,
];

export const ROWS: readonly Row[] = [
  { id: "scheme", label: "scheme", knobs: ["scheme"] },
  { id: "contrast", label: "contrast", knobs: ["contrast"] },
  { id: "transparency", label: "transparency", knobs: ["transparency"] },
  { id: "vision", label: "vision", knobs: ["vision"] },
  { id: "text", label: "text", knobs: ["text", "spacing"] },
  { id: "motion", label: "motion", knobs: ["motion", "speed"] },
  { id: "locale", label: "locale", knobs: ["locale", "direction", "pseudo"] },
  { id: "location", label: "location", knobs: ["geo", "geoError"] },
  {
    id: "clock",
    label: "time",
    knobs: ["clock", "clockMode", "clockSpeed", "timeZone", "header"],
  },
  { id: "network", label: "network", knobs: ["online", "connection", "saveData"] },
  {
    id: "device",
    label: "device",
    knobs: ["device", "mock", "touchPointer", "browser", "bars", "edgeToEdge", "ua"],
  },
  { id: "viewport", label: "viewport", knobs: ["width", "dpr", "zoom", "frame", "mat"] },
  { id: "debug", label: "debug", knobs: ["overflow", "outlines", "grabColor"] },
];

export function knobOf(id: KnobId): Knob {
  const knob = KNOBS.find((entry) => entry.id === id);
  if (!knob) throw new Error(`devknobs: no knob ${id}`);
  return knob;
}

export function rowOf(id: KnobId): Row {
  const row = ROWS.find((entry) => entry.knobs.includes(id));
  if (!row) throw new Error(`devknobs: no row for ${id}`);
  return row;
}

/** The knobs this browser can use. */
export function availableKnobs(): Knob[] {
  return KNOBS.filter((knob) => knob.available?.() ?? true);
}

/** The knobs of a row this browser can use. */
export function knobsOf(row: Row): Knob[] {
  return row.knobs.map(knobOf).filter((knob) => knob.available?.() ?? true);
}

/** What a value is called on a chip or in a summary. */
export function nameOf(knob: Knob, value: string): string {
  const option = knob.options.find((entry) => entry.value === value);
  return option?.label ?? knob.name?.(value) ?? value;
}

export function offDefault(knob: Knob, state: DevknobsState): boolean {
  return knob.read(state) !== (knob.base?.(state) ?? knob.read(DEFAULT_STATE));
}

/** The knob's part of a row summary, empty while it is at its default. */
export function brief(knob: Knob, state: DevknobsState, live: Live): string {
  if (!offDefault(knob, state)) return "";
  return knob.brief?.(state, live) ?? nameOf(knob, knob.read(state));
}

/** Does any knob of the row differ from its default? */
export function isActive(row: Row, state: DevknobsState): boolean {
  return knobsOf(row).some((knob) => offDefault(knob, state));
}

/** What the row says it emulates, such as `390 · dpr 2`. Empty while it emulates nothing. */
export function summary(row: Row, state: DevknobsState, live: Live): string {
  return knobsOf(row)
    .map((knob) => brief(knob, state, live))
    .filter((part) => part !== "")
    .join(" · ");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Patches as one, merged a level deep like the store merges them. */
export function combine(patches: readonly DevknobsStatePatch[]): DevknobsStatePatch {
  const out: Record<string, unknown> = {};
  for (const patch of patches) {
    for (const [key, value] of Object.entries(patch)) {
      const before = out[key];
      out[key] = isRecord(value) && isRecord(before) ? { ...before, ...value } : value;
    }
  }
  return out as DevknobsStatePatch;
}

/** The patch that puts every knob of the row back to its default. */
export function resetPatch(row: Row): DevknobsStatePatch {
  return combine(row.knobs.map((id) => knobOf(id).reset));
}

/** Something the panel does rather than a knob it sets. */
export interface Action {
  id: "grab" | "replay";
  label: string;
  /** What a search result says after the name. */
  long: string;
  /** More words search finds the action by. */
  aliases: readonly string[];
}

export const ACTIONS: readonly Action[] = [
  {
    id: "grab",
    label: "grab",
    long: "pick an element to copy",
    aliases: ["inspect", "pick", "element", "component", "select", "agent"],
  },
  {
    id: "replay",
    label: "replay animations",
    long: "restart every animation from the start",
    aliases: ["restart", "animation", "rerun"],
  },
];

/** The browse list: every knob the browser can use, by category. */
export function browse(): { category: Category; knobs: Knob[] }[] {
  const knobs = availableKnobs();
  return CATEGORIES.map((category) => ({
    category,
    knobs: knobs.filter((knob) => knob.category === category),
  })).filter((group) => group.knobs.length > 0);
}
