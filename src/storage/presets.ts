import { webStorage } from "../engine/fresh";
import { stamped } from "../engine/stored";
import { byteSize } from "./format";
import { PRESETS_KEY, PRESETS_VERSION, put, storedPresets, type Target } from "./onload";
import type { Cookie } from "./cookies";
import type { Entry, WebItem } from "./web";

/**
 * Presets: named sets of values to put into the page's storage. They are
 * kept in devknobs' own storage, under one versioned key, through the
 * gateway: so they are per origin, and in fresh mode they are neither read
 * nor written. Values are kept as text, exactly as they were read.
 */

/** The most entries a preset holds, over its three kinds. */
export const PRESET_MAX_ENTRIES = 200;

/** The most a preset weighs as json, in bytes. */
export const PRESET_MAX_BYTES = 256 * 1024;

/** A cookie a preset sets. What is left out is the browser's default, but for the path, which is `/`. */
export interface CookieEntry extends Entry {
  path?: string;
  /** How long it is kept, in seconds. A session cookie without. */
  maxAge?: number;
  sameSite?: "strict" | "lax" | "none";
  secure?: boolean;
}

export interface Preset {
  name: string;
  local: Entry[];
  session: Entry[];
  cookies: CookieEntry[];
  /** Apply it on every load of the page, before the page's own scripts where the early script is there. */
  onLoad: boolean;
  /** On load, empty the page's local and session storage before it applies. */
  clearFirst: boolean;
}

/** A preset read from text, or the line that says what is wrong with it. */
export type PresetResult = { preset: Preset; error: null } | { preset: null; error: string };

function fail(error: string): PresetResult {
  return { preset: null, error };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const SAME_SITE = ["strict", "lax", "none"] as const;

function sameSiteOf(value: unknown): CookieEntry["sameSite"] | null {
  if (typeof value !== "string") return null;
  return SAME_SITE.find((entry) => entry === value.toLowerCase()) ?? null;
}

/** The entries of one kind, or the line that says which one is wrong. */
function entriesOf(value: unknown, kind: string): Entry[] | string {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return `"${kind}" must be a list of entries`;
  const entries: Entry[] = [];
  for (const [at, raw] of value.entries()) {
    if (!isRecord(raw)) return `${kind} entry ${at + 1} must be an object with a name and a value`;
    if (typeof raw.name !== "string" || raw.name === "") return `${kind} entry ${at + 1} needs a name`;
    if (typeof raw.value !== "string") return `${kind} entry "${raw.name}" needs a value that is text`;
    entries.push({ name: raw.name, value: raw.value });
  }
  return entries;
}

function cookiesOf(value: unknown): CookieEntry[] | string {
  const entries = entriesOf(value, "cookies");
  if (typeof entries === "string" || !Array.isArray(value)) return entries;
  const cookies: CookieEntry[] = [];
  for (const [at, entry] of entries.entries()) {
    const raw: unknown = value[at];
    const cookie: CookieEntry = { ...entry };
    if (!isRecord(raw)) continue;
    if (raw.path !== undefined) {
      if (typeof raw.path !== "string" || !raw.path.startsWith("/")) {
        return `cookie "${entry.name}": path must start with /`;
      }
      cookie.path = raw.path;
    }
    if (raw.maxAge !== undefined) {
      if (typeof raw.maxAge !== "number" || !Number.isFinite(raw.maxAge)) {
        return `cookie "${entry.name}": maxAge must be a number of seconds`;
      }
      cookie.maxAge = raw.maxAge;
    }
    if (raw.sameSite !== undefined) {
      const sameSite = sameSiteOf(raw.sameSite);
      if (!sameSite) return `cookie "${entry.name}": sameSite must be strict, lax or none`;
      cookie.sameSite = sameSite;
    }
    if (raw.secure !== undefined) {
      if (typeof raw.secure !== "boolean") return `cookie "${entry.name}": secure must be true or false`;
      cookie.secure = raw.secure;
    }
    cookies.push(cookie);
  }
  return cookies;
}

/** How many entries a preset holds over its three kinds. */
export function entryCount(preset: Pick<Preset, "local" | "session" | "cookies">): number {
  return preset.local.length + preset.session.length + preset.cookies.length;
}

/** A preset as its json says it: what is edited, exported and imported. Nothing of when it applies. */
export function presetText(preset: Preset): string {
  const { name, local, session, cookies } = preset;
  return JSON.stringify({ name, local, session, cookies }, null, 2);
}

/**
 * Check a preset read from json. The automation marks are taken only with
 * `trusted`, for what devknobs kept itself: a preset pasted in from someone
 * else never starts applying on load by itself.
 */
export function checkPreset(raw: unknown, trusted = false): PresetResult {
  if (!isRecord(raw)) return fail("a preset is a json object with a name");
  if (typeof raw.name !== "string" || raw.name.trim() === "") return fail("the preset needs a name");
  const local = entriesOf(raw.local, "local");
  if (typeof local === "string") return fail(local);
  const session = entriesOf(raw.session, "session");
  if (typeof session === "string") return fail(session);
  const cookies = cookiesOf(raw.cookies);
  if (typeof cookies === "string") return fail(cookies);
  const preset: Preset = {
    name: raw.name.trim(),
    local,
    session,
    cookies,
    onLoad: trusted && raw.onLoad === true,
    clearFirst: trusted && raw.clearFirst === true,
  };
  if (entryCount(preset) > PRESET_MAX_ENTRIES) {
    return fail(`a preset holds at most ${PRESET_MAX_ENTRIES} entries, this has ${entryCount(preset)}`);
  }
  if (byteSize(presetText(preset)) > PRESET_MAX_BYTES) {
    return fail(`a preset is at most ${PRESET_MAX_BYTES / 1024} KB as json`);
  }
  return { preset, error: null };
}

/** A preset from the text of its json, or what is wrong with it, the json's own error first. */
export function parsePreset(text: string): PresetResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    return fail(`not valid json${error instanceof Error ? `: ${error.message}` : ""}`);
  }
  return checkPreset(raw);
}

/** What a new preset starts as: one example entry of each kind. */
export function templateText(): string {
  return presetText({
    name: "new preset",
    local: [{ name: "example-key", value: "example value" }],
    session: [{ name: "example-key", value: "example value" }],
    cookies: [{ name: "example", value: "1", path: "/", maxAge: 86400, sameSite: "lax" }],
    onLoad: false,
    clearFirst: false,
  });
}

/**
 * A preset of what the page holds now: the items and cookies handed in, as
 * the view's filter left them, less devknobs' own. A cookie keeps the path
 * and the rest where the browser told them.
 */
export function capture(
  name: string,
  local: readonly WebItem[],
  session: readonly WebItem[],
  cookies: readonly Cookie[],
  now = Date.now(),
): PresetResult {
  const entries = (items: readonly WebItem[]): Entry[] =>
    items.filter((item) => !item.own).map((item) => ({ name: item.key, value: item.value }));
  return checkPreset({
    name,
    local: entries(local),
    session: entries(session),
    cookies: cookies
      .filter((cookie) => cookie.name !== "")
      .map((cookie) => {
        const entry: CookieEntry = { name: cookie.name, value: cookie.value };
        if (cookie.path !== null) entry.path = cookie.path;
        if (cookie.expires !== null) {
          entry.maxAge = Math.max(Math.round((cookie.expires - now) / 1000), 1);
        }
        const sameSite = sameSiteOf(cookie.sameSite);
        if (sameSite) entry.sameSite = sameSite;
        if (cookie.secure === true) entry.secure = true;
        return entry;
      }),
  });
}

/** Whether presets can be kept here: not in fresh mode, nor where storage is off. */
export function canKeep(): boolean {
  return webStorage("local") !== null;
}

/** The presets devknobs keeps for this origin. One that no longer checks out is left out. */
export function loadPresets(): Preset[] {
  return storedPresets().flatMap((raw) => checkPreset(raw, true).preset ?? []);
}

/** Keep the presets. Returns the line that says why not, or null. */
export function savePresets(presets: readonly Preset[]): string | null {
  const storage = webStorage("local");
  if (!storage) return "presets are not kept here";
  try {
    if (presets.length === 0) storage.removeItem(PRESETS_KEY);
    else storage.setItem(PRESETS_KEY, JSON.stringify(stamped({ presets }, PRESETS_VERSION)));
    return null;
  } catch {
    return "cannot keep the preset: the storage is full";
  }
}

/** A name no other preset has: the name, or the name and a number. */
export function freeName(name: string, presets: readonly Preset[], but?: Preset): string {
  const taken = new Set(presets.filter((preset) => preset !== but).map((preset) => preset.name));
  if (!taken.has(name)) return name;
  let count = 2;
  while (taken.has(`${name} ${count}`)) count++;
  return `${name} ${count}`;
}

/** How applying a preset treats what is there: over it, or in its place. */
export type ApplyMode = "add" | "replace";

/**
 * Set every entry of a preset. `replace` empties the page's local and
 * session storage first, devknobs' own items aside; cookies are set over
 * what is there either way. Returns the names that were not set.
 */
export function applyPreset(target: Target, preset: Preset, mode: ApplyMode): string[] {
  return put(target, { ...preset }, mode === "replace");
}

/** What a preset holds, as its row says it: `2 local, 1 session, 3 cookies`. */
export function presetCounts(preset: Preset): string {
  const parts = [
    preset.local.length > 0 ? `${preset.local.length} local` : "",
    preset.session.length > 0 ? `${preset.session.length} session` : "",
    preset.cookies.length > 0
      ? `${preset.cookies.length} ${preset.cookies.length === 1 ? "cookie" : "cookies"}`
      : "",
  ].filter((part) => part !== "");
  return parts.length > 0 ? parts.join(", ") : "empty";
}

/** The presets a filter leaves: those whose name has the text, in any case. */
export function filterPresets(presets: readonly Preset[], query: string): Preset[] {
  const text = query.trim().toLowerCase();
  return text === "" ? [...presets] : presets.filter((preset) => preset.name.toLowerCase().includes(text));
}
