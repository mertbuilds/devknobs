import { button, el, mark } from "./dom";
import { radioMove } from "./keys";

/**
 * The one way to draw a small choice: a radio group, and the segments that
 * are the panel's own. The editors' controls and the views' are built here.
 */

/** A choice of a radio group: its node and the value it stands for. */
export interface RadioItem {
  node: HTMLButtonElement;
  value: string;
}

/**
 * A radio group is one tab stop, on the choice that is on, and the arrows
 * move the choice as they move the focus. Returns the way to show which
 * value is on.
 */
export function radioGroup(
  track: HTMLElement,
  items: readonly RadioItem[],
  pick: (value: string) => void,
): (current: string) => void {
  // The choices shown, in the order they stand.
  const shown = () =>
    Array.from(track.children).flatMap((node) => {
      const item = items.find((entry) => entry.node === node);
      return item && !item.node.hidden ? [item] : [];
    });
  track.addEventListener("keydown", (event: KeyboardEvent) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const list = shown();
    const at = list.findIndex((item) => item.node === event.target);
    const next = at < 0 ? null : radioMove(event.key, at, list.length);
    const item = next === null ? undefined : list[next];
    if (!item) return;
    event.preventDefault();
    item.node.focus();
    pick(item.value);
  });
  return (current) => {
    const list = shown();
    const known = list.some((item) => item.value === current);
    for (const item of items) {
      const on = item.value === current;
      mark(item.node, on, "aria-checked");
      item.node.tabIndex = on || (!known && item === list[0]) ? 0 : -1;
    }
  };
}

/** What a set of segments is built from. */
export interface SegmentsOptions {
  /** The choices, in order. */
  options: readonly { value: string; label: string }[];
  /** The group's name, for assistive tech. */
  label: string;
  /** The value that is on to begin with. Without one, `set` says which. */
  value?: string;
  /** A choice picked, by a click or the arrows. The caller says what is on from there. */
  onChange(value: string): void;
}

export interface Segments {
  node: HTMLElement;
  items: readonly RadioItem[];
  /** Show which value is on. */
  set(value: string): void;
}

/** The panel's segments: a few choices in a row, one of them on. */
export function segments(options: SegmentsOptions): Segments {
  const node = el("div", "seg");
  node.setAttribute("role", "radiogroup");
  node.setAttribute("aria-label", options.label);
  const items = options.options.map((option) => {
    const item = button("seg-item", option.label);
    item.setAttribute("role", "radio");
    item.addEventListener("click", () => options.onChange(option.value));
    node.append(item);
    return { node: item, value: option.value };
  });
  const set = radioGroup(node, items, options.onChange);
  if (options.value !== undefined) set(options.value);
  return { node, items, set };
}
