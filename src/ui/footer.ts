import { fresh } from "../engine/fresh";
import type { GrabControl } from "../grab/control";
import { BINDING_WORDS, type LiveKeys } from "./bindings";
import { button, el } from "./dom";
import { icon, type IconName } from "./icons";
import { type Combo, comboLabel, type Keys } from "./keys";
import { COLLAPSE_WORD, pinWord, SIDE_WORD } from "./pin";

/**
 * The panel's footer: the overflow badge, the fresh mode note, the keys the
 * panel answers to, grab's and inspect's with them, each a control that does
 * what its key does, the pin that docks the panel to its side, with the two
 * controls a pinned panel has before it, and the way into the settings.
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
export type Command = "panel" | "search" | "grab" | "inspect" | "replay" | "reset";

/** A key in the footer and the words for what it does. */
export interface KeyChip {
  command: Command;
  key: string;
  word: string;
}

/** A key as a hint shows it. A binding with none shows no key, and is still a control. */
function keyLabel(combo: Combo | null, mac: boolean): string {
  return combo ? comboLabel(combo, mac) : "";
}

/**
 * The keys the footer names, most used first: the panel's, the search key,
 * the grab key where there is a grab, inspect's where there is an inspect,
 * replay's, and reset last, each as `comboLabel` shows it.
 */
export function keyChips(keys: Keys, grab: boolean, mac: boolean, inspect = false): KeyChip[] {
  const chips: KeyChip[] = [
    { command: "panel", key: comboLabel(keys.panel, mac), word: BINDING_WORDS.panel },
    { command: "search", key: "/", word: "search" },
  ];
  if (grab) {
    chips.push({ command: "grab", key: keyLabel(keys.grab, mac), word: BINDING_WORDS.grab });
  }
  if (inspect) {
    const key = keyLabel(keys.inspect, mac);
    chips.push({ command: "inspect", key, word: BINDING_WORDS.inspect });
  }
  chips.push(
    { command: "replay", key: keyLabel(keys.replay, mac), word: BINDING_WORDS.replay },
    { command: "reset", key: keyLabel(keys.reset, mac), word: BINDING_WORDS.reset },
  );
  return chips;
}

/**
 * A control of the footer that is its icon alone, as the way into the
 * settings is: a hint with no key and no word, named for assistive tech.
 */
function iconHint(className: string, label: string, glyph?: Element): HTMLButtonElement {
  const node = button(`hint ${className}`, "");
  if (glyph) node.append(glyph);
  node.setAttribute("aria-label", label);
  return node;
}

/** The footer's nodes, and the controls in it. */
export interface Footer {
  foot: HTMLElement;
  badge: HTMLElement;
  hints: Map<Command, HTMLButtonElement>;
  /** Pins the panel to its side, and lets it float again. */
  pin: HTMLButtonElement;
  /** Takes a pinned panel to the other side of the window. */
  flip: HTMLButtonElement;
  /** Closes a pinned panel, which has no handle to click while it is open. */
  collapse: HTMLButtonElement;
  keysToggle: HTMLButtonElement;
  /** Show the keys in force on the hints. */
  drawKeys(now: Keys): void;
  /**
   * Show whether the panel is pinned: the pin pressed, what it does next,
   * and the two controls only a pinned panel has.
   */
  drawPin(docked: boolean): void;
}

export function createFooter(
  keys: LiveKeys,
  grab: GrabControl | null,
  mac: boolean,
  inspect: GrabControl | null = null,
): Footer {
  const foot = el("div", "foot");
  const badge = el("span", "badge");
  // The legend of the keys, and the controls they press.
  const meta = el("div", "meta");
  const hints = new Map<Command, HTMLButtonElement>();
  const hintKeys = new Map<Command, HTMLElement>();
  for (const chip of keyChips(keys.get(), grab !== null, mac, inspect !== null)) {
    const node = button("hint", "");
    node.dataset.command = chip.command;
    const key = el("kbd", "hint-key", chip.key);
    node.append(key, chip.word);
    meta.append(node);
    hints.set(chip.command, node);
    hintKeys.set(chip.command, key);
  }
  // Pins the panel to its side. It has no key, so it is its icon alone.
  const pin = iconHint("pin-toggle", pinWord(false));
  let pinShown: boolean | null = null;
  // A pinned panel's edge changes its width, so these take it across and
  // close it. Their icons face the side the panel is on.
  const sided = (name: IconName): SVGElement => {
    const glyph = icon(name, 12);
    glyph.setAttribute("class", "glyph sided");
    return glyph;
  };
  const flip = iconHint("flip-toggle", SIDE_WORD, sided("panel-left"));
  const collapse = iconHint("collapse-toggle", COLLAPSE_WORD, sided("panel-right-close"));
  // Opens the settings, where the keys are set.
  const keysToggle = iconHint("keys-toggle", "settings", icon("settings", 12));
  meta.append(flip, collapse, pin, keysToggle);

  function drawPin(docked: boolean): void {
    if (docked === pinShown) return;
    pinShown = docked;
    flip.hidden = !docked;
    collapse.hidden = !docked;
    pin.replaceChildren(icon(docked ? "pin-off" : "pin", 12));
    pin.setAttribute("aria-label", pinWord(docked));
    pin.setAttribute("aria-pressed", docked ? "true" : "false");
  }
  drawPin(false);
  foot.append(badge);
  if (fresh()) foot.append(el("span", "fresh-note", FRESH_NOTE));
  foot.append(meta);

  return {
    foot,
    badge,
    hints,
    pin,
    flip,
    collapse,
    keysToggle,
    drawPin,
    drawKeys(now: Keys): void {
      for (const chip of keyChips(now, grab !== null, mac, inspect !== null)) {
        const key = hintKeys.get(chip.command);
        if (key) key.textContent = chip.key;
      }
    },
  };
}
