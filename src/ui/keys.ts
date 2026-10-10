import { type KeyAction, post, type ZoomAction } from "../engine/frame";

/** The parts of a keydown that decide what it asks of the panel. */
export type KeyLike = Pick<
  KeyboardEvent,
  "key" | "altKey" | "ctrlKey" | "metaKey" | "shiftKey" | "target" | "composedPath"
> &
  Partial<Pick<KeyboardEvent, "code" | "isComposing">>;

/** The letter that with shift toggles the panel, lower case like the keys it is matched to. */
export function hotkeyOf(hotkey?: string): string {
  return (hotkey ?? "k").toLowerCase();
}

/** A key with the modifiers that go with it, as a shortcut is kept. */
export interface Combo {
  meta: boolean;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  /**
   * Lower case: a letter, a digit, a symbol, or a named key such as
   * `backspace` or `f5`. A letter takes every key that reads as it on some layout.
   */
  key: string;
}

/** The shortcuts the panel can be told to use, and by whom. */
export type Binding = "panel" | "grab" | "replay" | "requests" | "reset";

/** Each binding's key. */
export type Keys = Record<Binding, Combo>;

const MODIFIER_NAMES: Record<string, "meta" | "ctrl" | "shift" | "alt"> = {
  meta: "meta",
  cmd: "meta",
  command: "meta",
  ctrl: "ctrl",
  control: "ctrl",
  shift: "shift",
  alt: "alt",
  option: "alt",
  opt: "alt",
};

/**
 * Read a key such as `alt+shift+g`, the modifiers by any of their names. Null
 * for one that names no key, more than one, or an empty part.
 */
export function parseCombo(spec: string | undefined): Combo | null {
  if (!spec?.trim()) return null;
  const parsed: Combo = { meta: false, ctrl: false, shift: false, alt: false, key: "" };
  for (const raw of spec.split("+")) {
    const part = raw.trim().toLowerCase();
    const modifier = MODIFIER_NAMES[part];
    if (modifier) parsed[modifier] = true;
    else if (part && !parsed.key) parsed.key = part;
    else return null;
  }
  return parsed.key ? parsed : null;
}

/** A key as it is kept, such as `meta+shift+k`, the modifiers always in one order. */
export function comboText(combo: Combo): string {
  const names = [
    combo.meta && "meta",
    combo.ctrl && "ctrl",
    combo.alt && "alt",
    combo.shift && "shift",
  ];
  return [...names.filter((name): name is string => Boolean(name)), combo.key].join("+");
}

/** Shift and a key. */
export function withShift(key: string): Combo {
  return { meta: false, ctrl: false, shift: true, alt: false, key };
}

/** F1 to F12, by the name a combination keeps. */
export function isFunctionKey(key: string): boolean {
  return /^f([1-9]|1[0-2])$/.test(key);
}

/** The keys that delete, which a field always keeps. */
function deletes(key: string): boolean {
  return key === "backspace" || key === "delete";
}

const KEY_GLYPHS: Record<string, string> = { backspace: "⌫", delete: "⌦" };
const KEY_NAMES: Record<string, string> = { backspace: "Backspace", delete: "Delete" };

/**
 * A key as the panel shows it: `⌥⇧K` or `⇧⌫` on a Mac, `Alt Shift K` or
 * `Shift Backspace` elsewhere.
 */
export function comboLabel(combo: Combo, mac: boolean): string {
  const key = combo.key;
  if (mac) {
    const marks = `${combo.ctrl ? "⌃" : ""}${combo.alt ? "⌥" : ""}${combo.shift ? "⇧" : ""}${combo.meta ? "⌘" : ""}`;
    return `${marks}${KEY_GLYPHS[key] ?? key.toUpperCase()}`;
  }
  const names = [
    combo.ctrl && "Ctrl",
    combo.alt && "Alt",
    combo.shift && "Shift",
    combo.meta && "Meta",
  ];
  const name = KEY_NAMES[key] ?? key.toUpperCase();
  return [...names.filter((part): part is string => Boolean(part)), name].join(" ");
}

/** A key as it is said, such as `shift k`. */
export function comboSpoken(combo: Combo): string {
  return comboText(combo).replaceAll("+", " ");
}

/** The panel's keys with none set: shift and the hotkey, shift g, shift r, shift n and shift backspace. */
export function defaultKeys(options: { hotkey?: string; grabKey?: string } = {}): Keys {
  return {
    panel: withShift(hotkeyOf(options.hotkey)),
    grab: parseCombo(options.grabKey) ?? withShift("g"),
    replay: withShift(REPLAY_KEY),
    requests: withShift(REQUESTS_KEY),
    reset: withShift("backspace"),
  };
}

/**
 * Marks the panel's own field where the shift letters are the panel's keys
 * and not text. Its search is one: it finds in lower case anyway.
 */
export const KEYS_FIELD = "data-devknobs-keys";

/** A field that takes typing. */
function isTyping(node: EventTarget | null): boolean {
  const element = node as HTMLElement | null;
  const tag = element?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return true;
  return element?.isContentEditable === true;
}

/**
 * A custom element of the page that cannot take the focus, yet has it: the
 * focus is in its closed shadow root, where a field the key reaches cannot be
 * seen. A plain element such as a scroll box can have the focus on its own.
 */
function focusInClosedRoot(node: EventTarget | null): boolean {
  // Off the browser, as in a server render, there are no elements.
  if (typeof HTMLElement === "undefined" || !(node instanceof HTMLElement)) return false;
  if (!node.tagName.includes("-")) return false;
  if (node.shadowRoot !== null || node.hasAttribute("tabindex") || node.tabIndex >= 0) return false;
  const root = node.getRootNode();
  if (root instanceof Document) {
    // With nothing focused the body is the active element.
    if (node === root.body || node === root.documentElement) return false;
  } else if (!(root instanceof ShadowRoot)) {
    return false;
  }
  return root.activeElement === node;
}

function isEditable(node: EventTarget | null): boolean {
  return (
    isTyping(node) ||
    (node as HTMLElement | null)?.tagName === "SELECT" ||
    focusInClosedRoot(node)
  );
}

/**
 * Whether a key goes into a field: one of the page's, or one of the panel's
 * other than those marked with `KEYS_FIELD`.
 */
export function typesInField(event: Pick<KeyLike, "target" | "composedPath">): boolean {
  const target = event.composedPath?.()[0] ?? event.target;
  if (!isEditable(target)) return false;
  return (target as HTMLElement | null)?.hasAttribute?.(KEYS_FIELD) !== true;
}

/**
 * A key in lower case. Turkish `İ` is `i`, where `toLowerCase` gives `i` and a
 * dot above.
 */
export function lowerKey(key: string): string {
  return key === "İ" ? "i" : key.toLowerCase();
}

/**
 * A key that types the letter `a` to `z`, in either case for caps lock, or on
 * a layout whose letters are not latin the key in the letter's place. A latin
 * letter elsewhere, a dead key or a keystroke an IME takes is not the letter.
 */
export function letterMatches(event: { key: string; code?: string }, letter: string): boolean {
  const key = lowerKey(event.key);
  if (key === letter) return true;
  return (
    [...key].length === 1 &&
    !/\p{Script=Latin}/u.test(key) &&
    event.code === `Key${letter.toUpperCase()}`
  );
}

/**
 * The key alone, whatever modifiers are down: a letter as `letterMatches`
 * reads it, a digit by what it types or where it sits, any other key by its
 * name. Delete is the same as backspace, as reset has always taken it.
 */
export function keyIs(
  event: { key: string; code?: string; altKey: boolean },
  key: string,
): boolean {
  if (/^[a-z]$/.test(key)) {
    // Option on a Mac types another character, a latin one too, in the letter's place.
    return letterMatches(event, key) || (event.altKey && event.code === `Key${key.toUpperCase()}`);
  }
  if (event.key.toLowerCase() === key) return true;
  if (/^[0-9]$/.test(key)) return event.code === `Digit${key}`;
  return key === "backspace" && event.key === "Delete";
}

/** The key with exactly its own modifiers down, never while an IME composes. */
export function comboMatches(event: KeyLike, combo: Combo): boolean {
  return (
    event.isComposing !== true &&
    event.metaKey === combo.meta &&
    event.ctrlKey === combo.ctrl &&
    event.shiftKey === combo.shift &&
    event.altKey === combo.alt &&
    keyIs(event, combo.key)
  );
}

/**
 * Where a key the panel took does its action. A function key types nothing,
 * so it does so everywhere. One that deletes is any field's, the panel's
 * search too. Every other key is a field's on the page and the panel's in a
 * field marked with `KEYS_FIELD`, with alt, ctrl or meta as well, so a
 * page's own shortcuts in its fields stay the page's.
 */
function actsHere(event: KeyLike, combo: Combo): boolean {
  if (isFunctionKey(combo.key)) return true;
  if (deletes(combo.key)) return !isEditable(event.composedPath?.()[0] ?? event.target);
  return !typesInField(event);
}

/** The letter that with shift replays the page's animations. */
export const REPLAY_KEY = "r";

/** The letter that with shift shows the requests log, and hides it. */
export const REQUESTS_KEY = "n";

/**
 * What a keydown asks of the panel, if anything: escape closes, and the
 * panel's, replay's, requests' and reset's keys do theirs, the panel's
 * winning where they are the same. In a field, `actsHere` says whether the
 * key is its.
 */
export function keyAction(
  event: KeyLike,
  keys: Pick<Keys, "panel" | "replay" | "requests" | "reset">,
): KeyAction | null {
  if (event.key === "Escape") return "close";
  const steps = [
    ["toggle", keys.panel],
    ["replay", keys.replay],
    ["requests", keys.requests],
    ["reset", keys.reset],
  ] as const;
  for (const [action, combo] of steps) {
    if (comboMatches(event, combo)) return actsHere(event, combo) ? action : null;
  }
  return null;
}

/**
 * Whether a keydown is the `/` that focuses the panel's search. Shift is fine,
 * as some layouts need it for `/`, but no other modifier, and never in a field.
 * Every other key belongs to the page.
 */
export function isSearchKey(event: KeyLike): boolean {
  if (event.key !== "/" || event.altKey || event.ctrlKey || event.metaKey) return false;
  const target = event.composedPath?.()[0] ?? event.target;
  return !isEditable(target);
}

/**
 * The character a keydown types into the panel's search when the focus is on
 * one of the panel's controls rather than in a field, so a knob's name can be
 * typed from anywhere in it. A space presses the control, `/` opens the search
 * empty, and a key with a modifier other than shift, a named key such as an
 * arrow, or one an IME takes types nothing.
 */
export function typeAhead(event: KeyLike): string | null {
  if (event.altKey || event.ctrlKey || event.metaKey || event.isComposing === true) return null;
  if ([...event.key].length !== 1 || event.key === " " || event.key === "/") return null;
  return isEditable(event.composedPath?.()[0] ?? event.target) ? null : event.key;
}

/**
 * What a zoom key asks of the frame: meta or ctrl with plus steps in, with
 * minus out, and with 0 goes back to fit, as the browser's own zoom keys do.
 * In a field that takes typing they are the browser's.
 */
export function zoomAction(event: KeyLike): ZoomAction | null {
  if ((!event.metaKey && !event.ctrlKey) || event.altKey) return null;
  if (isTyping(event.composedPath?.()[0] ?? event.target)) return null;
  if (event.key === "=" || event.key === "+") return "zoom-in";
  if (event.key === "-" || event.key === "_") return "zoom-out";
  return event.key === "0" ? "zoom-fit" : null;
}

/**
 * What escape takes back: the search, a list filter, the shortcuts, the open
 * editor or the panel.
 */
export type EscapeStep = "search" | "filter" | "keys" | "editor" | "panel";

/** Where things stand when escape comes. */
export interface EscapeScene {
  /** The search has the focus or a query. */
  search: boolean;
  /** The focus is in a list filter with text in it. */
  filter: boolean;
  /** The shortcuts show in place of the rows. */
  keys?: boolean;
  /** An editor is open and the focus is in the panel. */
  editor: boolean;
}

/**
 * Escape takes one step back at a time: it leaves the search, query and all,
 * clears a list filter, leaves the shortcuts, closes the open editor, and only
 * then the panel.
 */
export function escapeStep(scene: EscapeScene): EscapeStep {
  if (scene.search) return "search";
  if (scene.filter) return "filter";
  if (scene.keys) return "keys";
  if (scene.editor) return "editor";
  return "panel";
}

/**
 * Where the search's highlight sits among `count` entries: on the first for a
 * new query, else where it was, held inside the entries. -1 with no entries.
 */
export function highlightAt(cursor: number, count: number, newQuery = false): number {
  return Math.min(Math.max(newQuery ? 0 : cursor, 0), count - 1);
}

/** Where a key in the search puts the highlight, and whether it picks the entry there. */
export interface PaletteMove {
  cursor: number;
  pick: boolean;
}

/**
 * The arrows move the search's highlight one entry, held at the ends, and
 * Enter picks the entry it is on. Every other key is the field's.
 */
export function paletteMove(key: string, cursor: number, count: number): PaletteMove | null {
  if (key === "ArrowDown" || key === "ArrowUp") {
    return { cursor: highlightAt(cursor + (key === "ArrowDown" ? 1 : -1), count), pick: false };
  }
  if (key === "Enter") return { cursor: highlightAt(cursor, count), pick: count > 0 };
  return null;
}

/**
 * Where a key moves the choice in a radio group of `count`: right or down to
 * the next, left or up to the one before, round past the ends, Home and End
 * to the ends. Null for every other key.
 */
export function radioMove(key: string, index: number, count: number): number | null {
  if (count === 0) return null;
  if (key === "ArrowRight" || key === "ArrowDown") return (index + 1) % count;
  if (key === "ArrowLeft" || key === "ArrowUp") return (index - 1 + count) % count;
  if (key === "Home") return 0;
  return key === "End" ? count - 1 : null;
}

/**
 * Inside the width knob's frame the keys stay in the frame while it has focus,
 * so send the panel's keys up to the page that has the panel, and the zoom
 * keys up to the letterbox, which the browser's own zoom does not get. `/`
 * goes up while the panel is open, as it does on the page, and is then typed
 * nowhere. The keys are read on each press, so one set in the panel above
 * takes here at once. Returns the way to stop.
 */
export function forwardKeys(
  keys: () => Keys = () => defaultKeys(),
  open: () => boolean = () => true,
): () => void {
  function onKeydown(event: KeyboardEvent): void {
    const zoom = zoomAction(event);
    const search = isSearchKey(event) && open();
    const panelAction = keyAction(event, keys());
    // A key the panel acts on is only the panel's, never the browser's too.
    if (zoom || search || (panelAction && panelAction !== "close")) event.preventDefault();
    const action = panelAction ?? zoom ?? (search ? "search" : null);
    if (action) post(window.parent, { source: "devknobs", type: "key", action });
  }
  window.addEventListener("keydown", onKeydown, true);
  return () => window.removeEventListener("keydown", onKeydown, true);
}
