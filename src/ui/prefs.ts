import { newer, stamped } from "../engine/stored";

/**
 * Where the panel's preferences the user set are kept, in `localStorage`, so
 * they hold across reloads and in new tabs of the origin. Reset all leaves them.
 */
export const PREFS_KEY = "devknobs:prefs";

/** The version of the preferences `PREFS_KEY` keeps. Bump it with a new shape, see stored.ts. */
export const PREFS_VERSION = 1;

/** The panel's preferences: whether the handle shows while the panel is closed. */
export interface Prefs {
  handle: boolean;
}

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
  const handle: unknown = Reflect.get(value, "handle");
  return typeof handle === "boolean" ? { handle } : {};
}

/** The preferences in force: one the user set wins over `base`, the mount options. */
export function resolvePrefs(base: Prefs, stored: StoredPrefs): Prefs {
  return { handle: stored.handle ?? base.handle };
}

function local(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function loadPrefs(): StoredPrefs {
  try {
    return readPrefs(local()?.getItem(PREFS_KEY));
  } catch {
    return {};
  }
}

function keepPrefs(prefs: StoredPrefs): void {
  try {
    if (Object.keys(prefs).length === 0) local()?.removeItem(PREFS_KEY);
    else local()?.setItem(PREFS_KEY, JSON.stringify(stamped(prefs, PREFS_VERSION)));
  } catch {
    // Private mode, disabled storage: the preference holds until the page goes.
  }
}

/** The preferences in force, kept in step with the ones the user sets, here or in another tab. */
export interface LivePrefs {
  get(): Prefs;
  /** Show or hide the handle of a closed panel. One the same as the mount's is not kept. */
  setHandle(on: boolean): void;
  /** Hear the preferences change. Returns the way to stop. */
  subscribe(listener: () => void): () => void;
  destroy(): void;
}

/** The preferences for a mount's options, with the ones the user set on top. */
export function createPrefs(options: { handle?: boolean } = {}): LivePrefs {
  const base: Prefs = { handle: options.handle !== false };
  let stored = loadPrefs();
  let prefs = resolvePrefs(base, stored);
  const listeners = new Set<() => void>();

  function changed(): void {
    prefs = resolvePrefs(base, stored);
    for (const listener of Array.from(listeners)) listener();
  }

  function onStorage(event: StorageEvent): void {
    if (event.key !== PREFS_KEY && event.key !== null) return;
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
      stored = next;
      keepPrefs(stored);
      changed();
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
