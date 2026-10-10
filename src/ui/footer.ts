import { fresh } from "../engine/fresh";
import type { GrabControl } from "../grab/control";
import { BINDING_WORDS, type LiveKeys } from "./bindings";
import { button, el } from "./dom";
import { icon } from "./icons";
import { comboLabel, type Keys } from "./keys";

/**
 * The panel's footer: the overflow badge, the fresh mode note, the keys the
 * panel answers to, each a control that does what its key does, and the way
 * into the settings.
 */

/** What the footer says while fresh mode is on, so a panel back at its defaults is no surprise. */
export const FRESH_NOTE = "fresh mode: nothing is kept";

/**
 * What the footer says about the overflow knob, such as `2 overflowing`.
 * Nothing while the knob is off, or before the count is known.
 */
export function overflowBadge(on: boolean, count: number | null): string {
  return on && count !== null ? `${count} overflowing` : "";
}

/** What a footer hint does when it is clicked or its key is pressed. */
export type Command = "panel" | "search" | "grab" | "replay" | "reset";

/** A key in the footer and the words for what it does. */
export interface KeyChip {
  command: Command;
  key: string;
  word: string;
}

/**
 * The keys the footer names, most used first: the panel's, the search key,
 * the grab key where there is a grab, replay's, and reset last, each as
 * `comboLabel` shows it.
 */
export function keyChips(keys: Keys, grab: boolean, mac: boolean): KeyChip[] {
  const chips: KeyChip[] = [
    { command: "panel", key: comboLabel(keys.panel, mac), word: BINDING_WORDS.panel },
    { command: "search", key: "/", word: "search" },
  ];
  if (grab) {
    chips.push({ command: "grab", key: comboLabel(keys.grab, mac), word: BINDING_WORDS.grab });
  }
  chips.push(
    { command: "replay", key: comboLabel(keys.replay, mac), word: BINDING_WORDS.replay },
    { command: "reset", key: comboLabel(keys.reset, mac), word: BINDING_WORDS.reset },
  );
  return chips;
}

/** The footer's nodes, and the controls in it. */
export interface Footer {
  foot: HTMLElement;
  badge: HTMLElement;
  hints: Map<Command, HTMLButtonElement>;
  keysToggle: HTMLButtonElement;
  /** Show the keys in force on the hints. */
  drawKeys(now: Keys): void;
}

export function createFooter(keys: LiveKeys, grab: GrabControl | null, mac: boolean): Footer {
  const foot = el("div", "foot");
  const badge = el("span", "badge");
  // The legend of the keys, and the controls they press.
  const meta = el("div", "meta");
  const hints = new Map<Command, HTMLButtonElement>();
  const hintKeys = new Map<Command, HTMLElement>();
  for (const chip of keyChips(keys.get(), grab !== null, mac)) {
    const node = button("hint", "");
    node.dataset.command = chip.command;
    const key = el("kbd", "hint-key", chip.key);
    node.append(key, chip.word);
    meta.append(node);
    hints.set(chip.command, node);
    hintKeys.set(chip.command, key);
  }
  // Opens the settings, where the keys are set.
  const keysToggle = button("hint keys-toggle", "");
  keysToggle.append(icon("settings", 12));
  keysToggle.setAttribute("aria-label", "settings");
  meta.append(keysToggle);
  foot.append(badge);
  if (fresh()) foot.append(el("span", "fresh-note", FRESH_NOTE));
  foot.append(meta);

  return {
    foot,
    badge,
    hints,
    keysToggle,
    drawKeys(now: Keys): void {
      for (const chip of keyChips(now, grab !== null, mac)) {
        const key = hintKeys.get(chip.command);
        if (key) key.textContent = chip.key;
      }
    },
  };
}
