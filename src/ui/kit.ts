/**
 * What a feature's view is built from. The rule: a view builds its chrome,
 * its bar, filter, choices, rows, folds and empty lines, only from what is
 * here, and adds css only for the cells of its own content. So a view lines
 * up with the panel's rows and cannot drift from them: the stylesheet has one
 * rule for each of these, and a test fails where a view pads, edges or rounds
 * a head, a bar or a row's main for itself.
 *
 *   toolbar([filterField({ ... }).node, segments({ ... }).node]);
 *   rowBox({ main, glyph, title, ends, after }); sectionFold({ ... }); emptyLine("no requests");
 */

import { button, el, field, rowBox } from "./dom";
import { icon } from "./icons";

export { type RowBox, type RowParts, rowBox, rowButton } from "./dom";
export { type Segments, type SegmentsOptions, segments } from "./radio";

/** What a filter is built from. */
export interface FilterOptions {
  placeholder: string;
  /** The field's name, for assistive tech. Defaults to the placeholder. */
  label?: string;
  /** What is typed, as it changes, and empty once it is cleared. */
  onInput(text: string): void;
}

export interface Filter {
  node: HTMLInputElement;
  /**
   * Empty the field, and say whether there was anything in it. A view hands
   * this to its `escape`, so escape clears the filter before it goes back.
   */
  clear(): boolean;
}

/** The field that filters a list, as the device list's does. */
export function filterField(options: FilterOptions): Filter {
  const node = field("filter", options.placeholder, options.label ?? options.placeholder);
  node.addEventListener("input", () => options.onInput(node.value));
  return {
    node,
    clear(): boolean {
      if (node.value === "") return false;
      node.value = "";
      options.onInput("");
      return true;
    },
  };
}

/**
 * The bar a view keeps over what scrolls under it: its filter and its
 * segments, flush with the rows' edges.
 */
export function toolbar(children: readonly HTMLElement[]): HTMLElement {
  const node = el("div", "toolbar");
  node.append(...children);
  return node;
}

/** A line that says a list has nothing to show. */
export function emptyLine(text: string): HTMLElement {
  return el("div", "empty", text);
}

/** What a fold is built from. */
export interface FoldOptions {
  label: string;
  /** What its row ends with, as a row's value is. */
  ends?: readonly HTMLElement[];
  /** Whether it starts folded out. */
  open: boolean;
  /** The row was pressed, and the fold is out or away as `open` says. */
  onToggle?(open: boolean): void;
}

export interface Fold {
  /** The row and what folds under it. */
  node: HTMLElement;
  /** Where the folded content goes. */
  body: HTMLElement;
  /** Fold it out or away. */
  set(open: boolean): void;
}

/**
 * A section that folds out under its row, as a knob row's editor does. Its
 * chevron stands in the leading slot, so its label starts where a row's
 * content does.
 */
export function sectionFold(options: FoldOptions): Fold {
  const main = button("main", "");
  const turn = el("span", "turn");
  turn.append(icon("chevron-left"));
  const { box } = rowBox({ main, lead: turn, title: options.label, ends: options.ends });
  const fold = el("div", "fold");
  const body = el("div", "fold-body");
  fold.append(body);
  box.append(fold);
  let open = false;
  const set = (next: boolean): void => {
    open = next;
    box.className = next ? "row open" : "row";
    fold.inert = !next;
    main.setAttribute("aria-expanded", next ? "true" : "false");
  };
  main.addEventListener("click", () => {
    set(!open);
    options.onToggle?.(open);
  });
  set(options.open);
  return { node: box, body, set };
}
