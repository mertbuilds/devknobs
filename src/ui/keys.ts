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

/** A shift letter as the panel shows it: `⇧K` on a Mac, `Shift K` elsewhere. */
export function shiftLabel(letter: string, mac: boolean): string {
  return `${mac ? "⇧" : "Shift "}${letter.toUpperCase()}`;
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
 * A key that types the letter `a` to `z`, in either case for caps lock, or on
 * a layout whose letters are not latin the key in the letter's place. A latin
 * letter elsewhere, a dead key or a keystroke an IME takes is not the letter.
 */
export function letterMatches(event: { key: string; code?: string }, letter: string): boolean {
  const key = event.key.toLowerCase();
  if (key === letter) return true;
  return (
    [...key].length === 1 &&
    !/\p{Script=Latin}/u.test(key) &&
    event.code === `Key${letter.toUpperCase()}`
  );
}

/** Shift and the letter with no other modifier, never while an IME composes. */
export function isShiftLetter(event: KeyLike, letter: string): boolean {
  if (!event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return false;
  return event.isComposing !== true && letterMatches(event, letter);
}

/** The letter that with shift replays the page's animations. */
export const REPLAY_KEY = "r";

/** The keys that with shift reset every knob, delete the same as backspace. */
const RESET_KEYS = new Set(["Backspace", "Delete"]);

/**
 * What a keydown asks of the panel, if anything. Shift and the hotkey toggles
 * it, shift r replays the animations, which the hotkey wins over, and shift
 * backspace resets. Typing in a field never asks, except for the shift
 * letters in a field marked with `KEYS_FIELD`, where backspace still deletes.
 */
export function keyAction(event: KeyLike, hotkey: string): KeyAction | null {
  if (event.key === "Escape") return "close";
  if (event.altKey || event.ctrlKey || event.metaKey || !event.shiftKey) return null;
  const target = event.composedPath?.()[0] ?? event.target;
  if (RESET_KEYS.has(event.key)) return isEditable(target) ? null : "reset";
  if (typesInField(event)) return null;
  if (isShiftLetter(event, hotkey)) return "toggle";
  return isShiftLetter(event, REPLAY_KEY) ? "replay" : null;
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

/** What escape takes back: the search, a list filter, the open editor or the panel. */
export type EscapeStep = "search" | "filter" | "editor" | "panel";

/** Where things stand when escape comes. */
export interface EscapeScene {
  /** The search has the focus or a query. */
  search: boolean;
  /** The focus is in a list filter with text in it. */
  filter: boolean;
  /** An editor is open and the focus is in the panel. */
  editor: boolean;
}

/**
 * Escape takes one step back at a time: it leaves the search, query and all,
 * clears a list filter, closes the open editor, and only then the panel.
 */
export function escapeStep(scene: EscapeScene): EscapeStep {
  if (scene.search) return "search";
  if (scene.filter) return "filter";
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
 * nowhere. Returns the way to stop.
 */
export function forwardKeys(hotkey?: string, open: () => boolean = () => true): () => void {
  const key = hotkeyOf(hotkey);
  function onKeydown(event: KeyboardEvent): void {
    const zoom = zoomAction(event);
    const search = isSearchKey(event) && open();
    if (zoom || search) event.preventDefault();
    const action = keyAction(event, key) ?? zoom ?? (search ? "search" : null);
    if (action) post(window.parent, { source: "devknobs", type: "key", action });
  }
  window.addEventListener("keydown", onKeydown, true);
  return () => window.removeEventListener("keydown", onKeydown, true);
}
