import { CLOCK_PRESETS, realNow } from "../engine/clock";
import { GEO_PRESETS, resolveGeo } from "../engine/geo";
import { sends } from "../engine/header";
import { LOCALE_PRESETS } from "../engine/locale";
import { DEFAULT_STATE } from "../engine/store";
import { canonicalZone, TIME_ZONE_PRESETS } from "../engine/time";
import type {
  ClockMode,
  ConnectionValue,
  ContrastValue,
  DirValue,
  GeoErrorValue,
  MotionValue,
  OnlineValue,
  SaveDataValue,
  SchemeValue,
  TransparencyValue,
} from "../types";
import type { Knob, Option } from "./catalog";

/**
 * The values knobs take, how a typed one is read, and the look, motion,
 * language, location and time, and network knobs.
 */

const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;
const WEEK = 7 * DAY;

/** Past this, a clock reads better as the day it shows than as a jump. */
const FAR = 60 * DAY;

export function options(...values: string[]): Option[] {
  return values.map((value) => ({ value, label: value }));
}

export const OFF_ON = options("off", "on");

export function flag(value: boolean): string {
  return value ? "on" : "off";
}

/** A number typed out, if it falls between `min` and `max`. */
export function numberIn(text: string, min: number, max: number): Option | null {
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
export function parseUserAgent(text: string): Option | null {
  const trimmed = text.trim();
  return /^[\w.!#$%&'*+^`|~-]+\/\S/.test(trimmed) ? { value: trimmed, label: trimmed } : null;
}

/** More words each user agent preset is found by. */
export const UA_ALIASES: Record<string, readonly string[]> = {
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

export const SCHEME: Knob = {
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

export const CONTRAST: Knob = {
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

export const TRANSPARENCY: Knob = {
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

export const TEXT: Knob = {
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

export const SPACING: Knob = {
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

export const MOTION: Knob = {
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

export const SPEED: Knob = {
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

export const LOCALE: Knob = {
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

export const DIRECTION: Knob = {
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

export const PSEUDO: Knob = {
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

export const GEO: Knob = {
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

export const GEO_ERROR: Knob = {
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

export const TIME_ZONE: Knob = {
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

export const CLOCK: Knob = {
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

export const CLOCK_MODE: Knob = {
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
  shown: (state) => state.clock.mode !== "system",
};

export const CLOCK_SPEED: Knob = {
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
  // A frozen clock has no speed to go at.
  shown: (state) => state.clock.mode === "offset",
};

export const HEADER: Knob = {
  id: "header",
  label: "send to server",
  category: "location and time",
  control: "switch",
  options: OFF_ON,
  aliases: ["header", "server", "x-devknobs-now", "backend"],
  read: (state) => flag(state.clock.header),
  write: (value) => ({ clock: { header: value === "on" } }),
  reset: { clock: { header: DEFAULT_STATE.clock.header } },
  brief: (state) => (sends(state.clock) ? "server" : ""),
  // The real time is never sent, so the switch waits for a clock that is set.
  shown: (state) => state.clock.mode !== "system",
};

export const ONLINE: Knob = {
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

export const CONNECTION: Knob = {
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

export const SAVE_DATA: Knob = {
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

/** What a value is called on a chip or in a summary. */
export function nameOf(knob: Knob, value: string): string {
  const option = knob.options.find((entry) => entry.value === value);
  return option?.label ?? knob.name?.(value) ?? value;
}
