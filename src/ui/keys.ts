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
 * The character a keydown would type into the panel's search, or null. Only a
 * printable key outside any field counts, and never space, which pages scroll
 * and press buttons with. The hotkey is the caller's to rule out first.
 */
export function typedKey(event: KeyLike): string | null {
  if (event.altKey || event.ctrlKey || event.metaKey) return null;
  if (event.key.length !== 1 || event.key === " ") return null;
  const target = event.composedPath?.()[0] ?? event.target;
  return isEditable(target) ? null : event.key;
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
