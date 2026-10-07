// adapted from react-grab (MIT, Copyright (c) 2025 Aiden Bai)
import { type Combo, isFunctionKey, keyIs, parseCombo, withShift } from "../ui/keys";

/** The parts of a key event that decide whether it is the grab key. */
export type GrabKeyLike = Pick<
  KeyboardEvent,
  "key" | "code" | "altKey" | "ctrlKey" | "metaKey" | "shiftKey"
> &
  Partial<Pick<KeyboardEvent, "isComposing">>;

/**
 * The keys that start a grab, with only these modifiers down. `c` takes every
 * key that reads as a c on some layout.
 */
export type GrabKey = Combo;

/** How long a grab key that copies is held before grab turns on, in ms. */
export const HOLD = 100;

/** Longer while a field has the focus, where the key is likely a copy. */
export const HOLD_INPUT = 400;

/** Longer again while text is selected, which the key most likely copies. */
export const HOLD_SELECTION = 600;

/** After a copy, a release only turns grab on once the key was held this long, in ms. */
export const HOLD_AFTER_COPY = 200;

const C_LIKE = new Set([
  "c",
  "C",
  "с",
  "С",
  "ȼ",
  "Ȼ",
  "ↄ",
  "Ↄ",
  "ᴄ",
  "ᶜ",
  "ⱼ",
  "ⅽ",
  "Ⅽ",
  "ç",
  "Ç",
  "ć",
  "Ć",
  "č",
  "Č",
  "ĉ",
  "Ĉ",
  "ċ",
  "Ċ",
]);

/** The c key, by its place on the keyboard or by what it types on any layout. */
export function isCLike(key: string, code?: string): boolean {
  if (code === "KeyC") return true;
  return key.length === 1 && C_LIKE.has(key);
}

/** Shift and g. */
export function defaultGrabKey(): GrabKey {
  return withShift("g");
}

/**
 * Read a key such as `alt+shift+g`. One that names no key, or more than one,
 * is the default.
 */
export function parseGrabKey(spec: string | undefined): GrabKey {
  return parseCombo(spec) ?? defaultGrabKey();
}

/** The key alone, whatever modifiers are down. */
export function keyMatches(event: GrabKeyLike, key: string): boolean {
  return key === "c" ? isCLike(event.key, event.code) : keyIs(event, key);
}

/**
 * A key with no modifier but shift, or a function key, copies nothing, so a
 * press turns grab on, and off again. One with meta, ctrl or alt is held.
 */
export function pressTurnsOn(key: GrabKey): boolean {
  return isFunctionKey(key.key) || (!key.meta && !key.ctrl && !key.alt);
}

/**
 * A key with no modifier but shift types, so it is a field's, the panel's
 * search aside, and never grab's there. A function key types nothing.
 */
export function grabKeyTypes(key: GrabKey): boolean {
  return !isFunctionKey(key.key) && !key.meta && !key.ctrl && !key.alt;
}

/** The grab key with exactly its own modifiers down, never while an IME composes. */
export function isGrabKey(event: GrabKeyLike, key: GrabKey): boolean {
  return (
    event.isComposing !== true &&
    event.metaKey === key.meta &&
    event.ctrlKey === key.ctrl &&
    event.shiftKey === key.shift &&
    event.altKey === key.alt &&
    keyMatches(event, key.key)
  );
}

/** A keyup that lets go of the grab key or one of its modifiers. */
export function releasesGrabKey(event: GrabKeyLike, key: GrabKey): boolean {
  if (keyMatches(event, key.key)) return true;
  return (
    (key.meta && event.key === "Meta") ||
    (key.ctrl && event.key === "Control") ||
    (key.shift && event.key === "Shift") ||
    (key.alt && event.key === "Alt")
  );
}

/** How long the key is held before grab turns on, by what it might be copying. */
export function holdDuration(scene: { input: boolean; selection: boolean }, base = HOLD): number {
  if (scene.selection) return base + HOLD_SELECTION;
  return scene.input ? base + HOLD_INPUT : base;
}

/**
 * A hold of the grab key. While it is held nothing is taken from the page, so
 * a quick press still copies. Once the hold has lasted, grab turns on. A copy
 * the press made holds that back until the key repeats or is let go, so a
 * plain copy with the key down a little long stays a copy.
 */
export interface Hold {
  /** When the key went down, in ms. */
  start: number;
  /** How long it has to be held. */
  duration: number;
  /** The press copied something. */
  copied: boolean;
  /** The time is up, with a copy holding grab back. */
  due: boolean;
}

export type HoldEvent =
  | { type: "down"; at: number; duration: number }
  | { type: "repeat" }
  | { type: "copy" }
  | { type: "timer" }
  | { type: "release"; at: number }
  | { type: "cancel" };

/** Where the hold goes next, and whether grab turns on with it. */
export interface HoldStep {
  hold: Hold | null;
  activate: boolean;
}

export function holdStep(hold: Hold | null, event: HoldEvent): HoldStep {
  if (event.type === "down") {
    return {
      hold: hold ?? { start: event.at, duration: event.duration, copied: false, due: false },
      activate: false,
    };
  }
  if (!hold) return { hold: null, activate: false };
  switch (event.type) {
    case "copy":
      return { hold: { ...hold, copied: true }, activate: false };
    case "timer":
      return hold.copied ? { hold: { ...hold, due: true }, activate: false } : done(true);
    case "repeat":
      return hold.due ? done(true) : { hold, activate: false };
    case "release":
      return done(hold.due && event.at - hold.start >= HOLD_AFTER_COPY);
    case "cancel":
      return done(false);
  }
}

function done(activate: boolean): HoldStep {
  return { hold: null, activate };
}
