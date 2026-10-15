import { fresh, webStorage } from "../engine/fresh";
import { newer, stamped } from "../engine/stored";
import { LIST_WIDTH, type Showing, VIEW_WIDTH } from "./size";

/**
 * Where the panel's preferences the user set are kept, in `localStorage`, so
 * they hold across reloads and in new tabs of the origin. Reset all leaves them.
 */
export const PREFS_KEY = "devknobs:prefs";

/** The version of the preferences `PREFS_KEY` keeps. Bump it with a new shape, see stored.ts. */
export const PREFS_VERSION = 4;

/** How the styles view shows an element: what applies to it, or every rule in cascade order. */
export type StylesMode = "simple" | "advanced";

/** The mode the styles view starts in. */
export const STYLES_MODE: StylesMode = "simple";

/** Whether the styles view starts with the element's box folded out. */
export const STYLES_BOX = true;

/**
 * The panel's preferences: whether the handle shows while the panel is
 * closed, how wide the panel is with the rows or the settings in it and
 * with a feature's view, in px, the mode of the styles view, and whether the
 * box in it is folded out. Version 1 kept the handle alone, version 2 had no
 * mode, and version 3 had no word on the box.
 */
export interface Prefs {
  handle: boolean;
  listWidth: number;
  viewWidth: number;
  stylesMode: StylesMode;
  stylesBox: boolean;
}

/** The preference that keeps the width of what the panel shows. */
const WIDTH_OF = { list: "listWidth", view: "viewWidth" } as const;

/** The preferences the user set, over the mount options. */
export type StoredPrefs = Partial<Prefs>;

/** Read the stored preferences, keeping only the ones that read. */
export function readPrefs(json: string | null | undefined): StoredPrefs {
  let value: unknown = null;
  try {
    value = json ? JSON.parse(json) : null;
  } catch {
    return {};
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  if (newer(value, PREFS_VERSION)) return {};
  const prefs: StoredPrefs = {};
  const handle: unknown = Reflect.get(value, "handle");
  if (typeof handle === "boolean") prefs.handle = handle;
  for (const key of [WIDTH_OF.list, WIDTH_OF.view]) {
    const width: unknown = Reflect.get(value, key);
    if (typeof width === "number" && Number.isFinite(width) && width > 0) prefs[key] = width;
  }
  const mode: unknown = Reflect.get(value, "stylesMode");
  if (mode === "simple" || mode === "advanced") prefs.stylesMode = mode;
  const box: unknown = Reflect.get(value, "stylesBox");
  if (typeof box === "boolean") prefs.stylesBox = box;
  return prefs;
}

/** The preferences in force: one the user set wins over `base`, the mount options. */
export function resolvePrefs(base: Prefs, stored: StoredPrefs): Prefs {
  return { ...base, ...stored };
}

function loadPrefs(): StoredPrefs {
  try {
    return readPrefs(webStorage("local")?.getItem(PREFS_KEY));
  } catch {
    return {};
  }
}

function keepPrefs(prefs: StoredPrefs): void {
  try {
    if (Object.keys(prefs).length === 0) webStorage("local")?.removeItem(PREFS_KEY);
    else webStorage("local")?.setItem(PREFS_KEY, JSON.stringify(stamped(prefs, PREFS_VERSION)));
  } catch {
    // Private mode, disabled storage: the preference holds until the page goes.
  }
}

/** The preferences in force, kept in step with the ones the user sets, here or in another tab. */
export interface LivePrefs {
  get(): Prefs;
  /** Show or hide the handle of a closed panel. One the same as the mount's is not kept. */
  setHandle(on: boolean): void;
  /** Keep the width of the rows and the settings, or of a view. The one a panel starts with is not kept. */
  setWidth(showing: Showing, px: number): void;
  /** Keep the mode of the styles view. The one it starts in is not kept. */
  setStylesMode(mode: StylesMode): void;
  /** Keep whether the box in the styles view is folded out. The way it starts is not kept. */
  setStylesBox(open: boolean): void;
  /** Hear the preferences change. Returns the way to stop. */
  subscribe(listener: () => void): () => void;
  destroy(): void;
}

/** The preferences for a mount's options, with the ones the user set on top. */
export function createPrefs(options: { handle?: boolean } = {}): LivePrefs {
  const base: Prefs = {
    handle: options.handle !== false,
    listWidth: LIST_WIDTH,
    viewWidth: VIEW_WIDTH,
    stylesMode: STYLES_MODE,
    stylesBox: STYLES_BOX,
  };
  let stored = loadPrefs();
  let prefs = resolvePrefs(base, stored);
  const listeners = new Set<() => void>();

  function changed(): void {
    prefs = resolvePrefs(base, stored);
    for (const listener of Array.from(listeners)) listener();
  }

  /** Keep what the user set, and say so. */
  function keep(next: StoredPrefs): void {
    stored = next;
    keepPrefs(stored);
    changed();
  }

  function onStorage(event: StorageEvent): void {
    if (event.key !== PREFS_KEY && event.key !== null) return;
    // In fresh mode nothing kept is read: a choice made here holds, whatever another tab keeps.
    if (fresh()) return;
    stored = loadPrefs();
    changed();
  }

  if (typeof window !== "undefined") window.addEventListener("storage", onStorage);

  return {
    get: () => prefs,
    setHandle(on) {
      const next = { ...stored };
      if (on === base.handle) delete next.handle;
      else next.handle = on;
      keep(next);
    },
    setWidth(showing, px) {
      const key = WIDTH_OF[showing];
      const next = { ...stored };
      if (px === base[key]) delete next[key];
      else next[key] = px;
      keep(next);
    },
    setStylesMode(mode) {
      const next = { ...stored };
      if (mode === base.stylesMode) delete next.stylesMode;
      else next.stylesMode = mode;
      keep(next);
    },
    setStylesBox(open) {
      const next = { ...stored };
      if (open === base.stylesBox) delete next.stylesBox;
      else next.stylesBox = open;
      keep(next);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    destroy() {
      listeners.clear();
      if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
    },
  };
}
