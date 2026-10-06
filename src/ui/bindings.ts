import {
  type Binding,
  type Combo,
  comboText,
  defaultKeys,
  isFunctionKey,
  type KeyLike,
  type Keys,
  lowerKey,
  parseCombo,
} from "./keys";

/**
 * Where the keys the user set in the panel are kept, in `localStorage`, so they
 * hold across reloads and in new tabs of the origin. Reset all leaves them.
 */
export const KEYS_KEY = "devknobs:keys";

/** The bindings in the order the panel lists them. */
export const BINDINGS: readonly Binding[] = ["panel", "grab", "replay", "reset"];

/** What each binding does, in the words the footer uses. */
export const BINDING_WORDS: Record<Binding, string> = {
  panel: "panel",
  grab: "grab",
  replay: "replay animations",
  reset: "reset",
};

/** The keys the user set, by binding, as `comboText` writes them. */
export type StoredKeys = Partial<Record<Binding, string>>;

/**
 * Letters that with meta or ctrl are the browser's or the system's: copy,
 * paste, cut, undo, select all, close, reload, new tab, quit, the address bar,
 * new window, find, print, save, hide and minimize.
 */
const RESERVED_LETTERS = new Set([..."cvxzawrtqlnfpshm"]);

/** Keys that with meta or ctrl zoom, devknobs' frame included. */
const ZOOM_KEYS = new Set(["=", "-", "_", "0"]);

function bare(combo: Combo): boolean {
  return !combo.meta && !combo.ctrl && !combo.alt && !combo.shift;
}

/**
 * A combination the browser or the system keeps for itself: the reserved
 * letters, the tab digits and the zoom keys with meta or ctrl, F5 that
 * reloads, F11 and F12 alone, and alt or ctrl with F4 that close.
 */
export function isReserved(combo: Combo): boolean {
  const key = combo.key;
  if (key === "f5") return true;
  if ((key === "f11" || key === "f12") && bare(combo)) return true;
  if (key === "f4" && (combo.alt || combo.ctrl)) return true;
  if (!combo.meta && !combo.ctrl) return false;
  return RESERVED_LETTERS.has(key) || /^[0-9]$/.test(key) || ZOOM_KEYS.has(key);
}

/**
 * A key a combination can keep: one character other than `+` and space, a
 * function key, or one that deletes.
 */
function keepable(key: string): boolean {
  if (isFunctionKey(key) || key === "backspace" || key === "delete") return true;
  return [...key].length === 1 && key !== "+" && key.trim() !== "";
}

/**
 * A combination as two bindings clash on it. Delete is backspace, as `keyIs`
 * matches a backspace binding on either.
 */
function clashText(combo: Combo): string {
  return comboText(combo.key === "delete" ? { ...combo, key: "backspace" } : combo);
}

/**
 * Why a combination cannot be a binding's, or null where it can: a key alone
 * types, so it needs a modifier unless it is a function key, the browser keeps
 * some, `/` is the search's, and no two bindings share one. `others` are the
 * keys the other bindings have now.
 */
export function comboProblem(
  combo: Combo,
  binding: Binding,
  others: Partial<Keys> = {},
): string | null {
  if (!keepable(combo.key)) return "use a letter, digit, symbol or F1 to F12";
  if (bare(combo) && !isFunctionKey(combo.key)) return "add a modifier, alone it types";
  if (isReserved(combo)) return "the browser uses it";
  if (combo.key === "/" && !combo.meta && !combo.ctrl && !combo.alt) return "/ opens the search";
  const text = clashText(combo);
  for (const other of BINDINGS) {
    const taken = others[other];
    if (other !== binding && taken && clashText(taken) === text) {
      return `used by ${BINDING_WORDS[other]}`;
    }
  }
  return null;
}

const MODIFIER_KEYS = new Set(["Shift", "Alt", "Control", "Meta", "AltGraph", "CapsLock", "Fn"]);

/**
 * The combination a keydown is, as a binding keeps it, or null for a key no
 * binding can take. A latin letter is kept by what it types, so layouts keep
 * working. With option, or on a layout whose letters are not latin, it is the
 * letter of the key's place, as `letterMatches` reads it back. A digit is kept
 * by its place, so shift and 1 is not `!`.
 */
export function comboOf(event: KeyLike): Combo | null {
  const typed = event.key;
  const code = event.code ?? "";
  const modifiers = {
    meta: event.metaKey,
    ctrl: event.ctrlKey,
    shift: event.shiftKey,
    alt: event.altKey,
  };
  let key: string | null = null;
  if (/^F([1-9]|1[0-2])$/.test(typed)) key = typed.toLowerCase();
  else if (typed === "Backspace" || typed === "Delete") key = typed.toLowerCase();
  else if (/^[a-z]$/.test(lowerKey(typed))) key = lowerKey(typed);
  else if (
    /^Key[A-Z]$/.test(code) &&
    (event.altKey || ([...typed].length === 1 && !/\p{Script=Latin}/u.test(typed)))
  ) {
    key = code.slice(3).toLowerCase();
  } else if (/^Digit[0-9]$/.test(code)) key = code.slice(5);
  else if ([...typed].length === 1) key = lowerKey(typed);
  return key !== null && keepable(key) ? { ...modifiers, key } : null;
}

/** What a key pressed while a binding records does. */
export type RecordStep =
  | { type: "wait" }
  | { type: "cancel" }
  | { type: "keep"; combo: Combo }
  | { type: "refuse"; reason: string };

/**
 * A key pressed while a binding records: a modifier alone, or a key an IME
 * takes, waits for the rest, escape and tab cancel, and any other key is kept
 * or refused with the reason `comboProblem` gives.
 */
export function recordStep(event: KeyLike, binding: Binding, others: Partial<Keys>): RecordStep {
  if (event.key === "Escape" || event.key === "Tab") return { type: "cancel" };
  if (MODIFIER_KEYS.has(event.key) || event.isComposing === true || event.key === "Process") {
    return { type: "wait" };
  }
  // On a layout where `/` takes shift and a digit, the digit is still the search's.
  if (event.key === "/" && !event.ctrlKey && !event.metaKey && !event.altKey) {
    return { type: "refuse", reason: "/ opens the search" };
  }
  const combo = comboOf(event);
  if (!combo) return { type: "refuse", reason: "use a letter, digit, symbol or F1 to F12" };
  const reason = comboProblem(combo, binding, others);
  return reason ? { type: "refuse", reason } : { type: "keep", combo };
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : {};
}

/**
 * Read the stored keys, keeping only the bindings with a combination that
 * reads and could have been set in the panel, each in its kept form.
 */
export function readKeys(json: string | null | undefined): StoredKeys {
  let value: unknown = null;
  try {
    value = json ? JSON.parse(json) : null;
  } catch {
    return {};
  }
  const stored = record(value);
  const keys: StoredKeys = {};
  for (const binding of BINDINGS) {
    const text = stored[binding];
    const combo = typeof text === "string" ? parseCombo(text) : null;
    if (combo && comboProblem(combo, binding) === null) keys[binding] = comboText(combo);
  }
  return keys;
}

/**
 * The keys in force: a key the user set wins over `base`, the mount options
 * or the defaults. One that another binding has as well gives way to its base.
 * Without grab, its key is no other binding's to clash with.
 */
export function resolveKeys(base: Keys, stored: StoredKeys, grab = true): Keys {
  const keys: Keys = { ...base };
  for (const binding of BINDINGS) {
    const combo = parseCombo(stored[binding]);
    if (combo) keys[binding] = combo;
  }
  const live = BINDINGS.filter((binding) => grab || binding !== "grab");
  for (const binding of live) {
    if (stored[binding] === undefined) continue;
    const text = clashText(keys[binding]);
    const shared = live.some((other) => other !== binding && clashText(keys[other]) === text);
    if (shared) keys[binding] = base[binding];
  }
  return keys;
}

function local(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function loadKeys(): StoredKeys {
  try {
    return readKeys(local()?.getItem(KEYS_KEY));
  } catch {
    return {};
  }
}

function keepKeys(keys: StoredKeys): void {
  try {
    if (Object.keys(keys).length === 0) local()?.removeItem(KEYS_KEY);
    else local()?.setItem(KEYS_KEY, JSON.stringify(keys));
  } catch {
    // Private mode, disabled storage: the key holds until the page goes.
  }
}

/** The keys in force, kept in step with the ones the user sets, here or in another tab. */
export interface LiveKeys {
  get(): Keys;
  /** Whether the user set the binding's key in the panel, over the mount option or the default. */
  custom(binding: Binding): boolean;
  /** Set a binding's key, or with null put it back to the mount option or the default. */
  set(binding: Binding, combo: Combo | null): void;
  /** Hear the keys change. Returns the way to stop. */
  subscribe(listener: () => void): () => void;
  /** True while the panel records a key, so nothing else takes the keys pressed. */
  recording: boolean;
  destroy(): void;
}

/**
 * The keys for a mount's options, with the ones the user set on top. Another
 * document of the origin that sets them, as the page above the width knob's
 * frame does, is heard through the storage event.
 */
export function createKeys(
  options: { hotkey?: string; grabKey?: string; grab?: boolean } = {},
): LiveKeys {
  const base = defaultKeys(options);
  const grab = options.grab !== false;
  let stored = loadKeys();
  let keys = resolveKeys(base, stored, grab);
  const listeners = new Set<() => void>();

  function changed(): void {
    keys = resolveKeys(base, stored, grab);
    for (const listener of Array.from(listeners)) listener();
  }

  function onStorage(event: StorageEvent): void {
    if (event.key !== KEYS_KEY && event.key !== null) return;
    stored = loadKeys();
    changed();
  }

  if (typeof window !== "undefined") window.addEventListener("storage", onStorage);

  return {
    get: () => keys,
    custom: (binding) =>
      stored[binding] !== undefined && comboText(keys[binding]) === stored[binding],
    set(binding, combo) {
      const next = { ...stored };
      if (combo === null || comboText(combo) === comboText(base[binding])) delete next[binding];
      else next[binding] = comboText(combo);
      stored = next;
      keepKeys(stored);
      changed();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    recording: false,
    destroy() {
      listeners.clear();
      if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
    },
  };
}
