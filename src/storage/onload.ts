import { webStorage } from "../engine/fresh";
import { isDevknobsFrame } from "../engine/frame";
import { newer } from "../engine/stored";

/**
 * Presets that apply on load, and nothing more of the storage view, so the
 * early script can carry it: read the one key the presets are kept under, and
 * set what the marked ones hold. It runs once per document, before devknobs
 * does anything else, from the early script where the page has it and at
 * mount where it does not. The copy in the width knob's frame never applies:
 * the page above did, and the two share their storage.
 */

/** Where the presets are kept, in `localStorage`, through devknobs' own gateway. */
export const PRESETS_KEY = "devknobs:storage-presets";

/** The version of what `PRESETS_KEY` keeps. Bump it with a new shape, see stored.ts. */
export const PRESETS_VERSION = 1;

/**
 * Where a document keeps how many presets it applied as it loaded, on its
 * window. The early script and the full script are two copies of this module,
 * and the second finds what the first did: nothing applies twice.
 */
const DONE = Symbol.for("devknobs.presets");

type Fields = Record<string, unknown>;

function fields(value: unknown): Fields {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : {};
}

function list(value: unknown): Fields[] {
  return Array.isArray(value) ? value.map(fields) : [];
}

/** The presets as kept, each a bag of fields nothing has checked yet. Empty in fresh mode. */
export function storedPresets(): Fields[] {
  try {
    const raw: unknown = JSON.parse(webStorage("local")?.getItem(PRESETS_KEY) ?? "null");
    return newer(raw, PRESETS_VERSION) ? [] : list(fields(raw).presets);
  } catch {
    return [];
  }
}

/** A cookie as `document.cookie` takes it, with the attributes the entry gives. */
export function cookieText(entry: Fields): string {
  let text = `${String(entry.name)}=${String(entry.value)}`;
  text += `; path=${typeof entry.path === "string" ? entry.path : "/"}`;
  if (typeof entry.domain === "string") text += `; domain=${entry.domain}`;
  if (typeof entry.maxAge === "number") text += `; max-age=${entry.maxAge}`;
  if (typeof entry.expires === "string") text += `; expires=${entry.expires}`;
  if (typeof entry.sameSite === "string") text += `; samesite=${entry.sameSite}`;
  if (entry.secure === true) text += "; secure";
  return text;
}

/** The page's storage, as far as a preset writes to it. */
export interface Target {
  localStorage: Storage;
  sessionStorage: Storage;
  document: { cookie: string };
}

/** Remove every item of the page's from a storage, and leave devknobs' own. */
function empty(storage: Storage): void {
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (key !== null && key !== "devknobs" && !key.startsWith("devknobs:")) keys.push(key);
  }
  for (const key of keys) storage.removeItem(key);
}

/**
 * Set every entry of a preset, over what is there. With `clear`, the page's
 * items in both storages go first. Each write stands alone, so one the
 * browser refuses stops no other. Returns the names that were not set.
 */
export function put(target: Target, preset: Fields, clear: boolean): string[] {
  const failed: string[] = [];
  for (const kind of ["local", "session"] as const) {
    try {
      const storage = kind === "local" ? target.localStorage : target.sessionStorage;
      if (clear) empty(storage);
      for (const entry of list(preset[kind])) {
        try {
          if (typeof entry.name === "string" && typeof entry.value === "string") {
            storage.setItem(entry.name, entry.value);
          }
        } catch {
          failed.push(String(entry.name));
        }
      }
    } catch {
      failed.push(`${kind}Storage`);
    }
  }
  for (const entry of list(preset.cookies)) {
    try {
      if (typeof entry.name === "string" && typeof entry.value === "string") {
        target.document.cookie = cookieText(entry);
      }
    } catch {
      failed.push(String(entry.name));
    }
  }
  return failed;
}

/**
 * Apply the presets marked to apply on load, once per document, and say how
 * many did. Nothing applies in the width knob's frame, in fresh mode, where
 * the presets are not read, or a second time.
 */
export function applyOnLoad(): number {
  if (typeof window === "undefined") return 0;
  const known: unknown = Reflect.get(window, DONE);
  if (typeof known === "number") return known;
  let count = 0;
  try {
    if (!isDevknobsFrame()) {
      for (const preset of storedPresets()) {
        if (preset.onLoad !== true) continue;
        put(window, preset, preset.clearFirst === true);
        count++;
      }
    }
  } catch {
    // Storage that cannot be reached: nothing applies.
  }
  Reflect.set(window, DONE, count);
  return count;
}

/** How many presets applied as this document loaded, 0 before `applyOnLoad` ran. */
export function appliedOnLoad(): number {
  if (typeof window === "undefined") return 0;
  const known: unknown = Reflect.get(window, DONE);
  return typeof known === "number" ? known : 0;
}

/** Forget that any preset applied on this load, as reset all does once it turned them off. */
export function forgetApplied(): void {
  if (typeof window !== "undefined") Reflect.set(window, DONE, 0);
}

/**
 * Turn "apply on load" off for every preset, as reset all does: it is
 * emulation, as a knob is. The presets themselves stay.
 */
export function stopOnLoad(): void {
  try {
    const presets = storedPresets();
    if (presets.some((preset) => preset.onLoad === true)) {
      const off = presets.map((preset) => ({ ...preset, onLoad: false }));
      webStorage("local")?.setItem(PRESETS_KEY, JSON.stringify({ v: PRESETS_VERSION, presets: off }));
    }
  } catch {
    // Storage that cannot be written: nothing was kept there to turn off.
  }
  forgetApplied();
}
