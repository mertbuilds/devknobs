import { type KeyAction, post } from "../engine/frame";

/** The parts of a keydown that decide what it asks of the panel. */
export type KeyLike = Pick<
  KeyboardEvent,
  "key" | "altKey" | "ctrlKey" | "metaKey" | "shiftKey" | "target" | "composedPath"
>;

/** The key that toggles the panel, lower case like the keys it is matched to. */
export function hotkeyOf(hotkey?: string): string {
  return (hotkey ?? "d").toLowerCase();
}

function isEditable(node: EventTarget | null): boolean {
  const element = node as HTMLElement | null;
  const tag = element?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return element?.isContentEditable === true;
}

/** What a keydown asks of the panel, if anything. Typing in a field never asks. */
export function keyAction(event: KeyLike, hotkey: string): KeyAction | null {
  if (event.key === "Escape") return "close";
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return null;
  const target = event.composedPath?.()[0] ?? event.target;
  if (isEditable(target)) return null;
  return event.key.toLowerCase() === hotkey ? "toggle" : null;
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
 * Inside the width knob's frame the keys stay in the frame while it has focus,
 * so send the panel's keys up to the page that has the panel. Returns the way
 * to stop.
 */
export function forwardKeys(hotkey?: string): () => void {
  const key = hotkeyOf(hotkey);
  function onKeydown(event: KeyboardEvent): void {
    const action = keyAction(event, key);
    if (action) post(window.parent, { source: "devknobs", type: "key", action });
  }
  window.addEventListener("keydown", onKeydown, true);
  return () => window.removeEventListener("keydown", onKeydown, true);
}
