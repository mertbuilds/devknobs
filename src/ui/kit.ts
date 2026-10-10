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
 *   group({ label, ends }); pairs(lines); codeBlock({ text, lines }); splitBar(shares, label);
 */

import { button, el, field, mark, rowBox } from "./dom";
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

/** What a labelled group is built from. */
export interface GroupOptions {
  label: string;
  /** What its first line ends with, in order: small controls for what the group holds. */
  ends?: readonly HTMLElement[];
}

/**
 * A group of a view's content under a small quiet label, with no fold: its
 * first line is the label and what it ends with, and what it holds is
 * appended to the node after that.
 */
export function group(options: GroupOptions): HTMLElement {
  const node = el("div", "group");
  node.setAttribute("role", "group");
  node.setAttribute("aria-label", options.label);
  const head = el("div", "group-head");
  head.append(el("span", "group-label", options.label), ...(options.ends ?? []));
  node.append(head);
  return node;
}

export interface Pairs {
  node: HTMLElement;
  /** Show only the pairs `match` keeps, and say how many those are. */
  keep(match: (name: string, value: string) => boolean): number;
}

/**
 * A list of names and their values in two columns, the names quiet and the
 * values in the text's color, both in mono and wrapping anywhere. Where the
 * view is narrow a name stands over its value.
 */
export function pairs(lines: readonly (readonly [name: string, value: string])[]): Pairs {
  const node = el("dl", "pairs");
  const rows = lines.map(([name, value]) => {
    const cells = [el("dt", "pair-name", name), el("dd", "pair-value", value)];
    node.append(...cells);
    return { name, value, cells };
  });
  return {
    node,
    keep(match): number {
      let kept = 0;
      for (const row of rows) {
        const shows = match(row.name, row.value);
        if (shows) kept++;
        for (const cell of row.cells) cell.hidden = !shows;
      }
      return kept;
    },
  };
}

/** A line of a code block past this many characters is a long one, which gets the choice not to wrap. */
export const LONG_LINE = 80;

/** What a code block is built from. */
export interface CodeOptions {
  text: string;
  /** Show only this many lines of a longer text at first, with the way to show all of it. */
  lines?: number;
}

export interface Code {
  node: HTMLElement;
  /** Turns wrapping off and on. Only there where the text has a long line. */
  wrap: HTMLButtonElement | null;
}

/**
 * A block of text in mono, as it was written. It wraps, so it never makes
 * its view scroll sideways: with wrapping off, the block scrolls in itself.
 * The caller says where the wrap control goes.
 */
export function codeBlock(options: CodeOptions): Code {
  const node = el("div", "code");
  const all = options.text.split("\n");
  const folded = options.lines !== undefined && all.length > options.lines;
  const text = el("pre", "code-text", folded ? all.slice(0, options.lines).join("\n") : options.text);
  node.append(text);
  if (folded) {
    const more = button("chip code-all", "show all");
    more.addEventListener("click", () => {
      text.textContent = options.text;
      more.remove();
    });
    node.append(more);
  }
  let wrap: HTMLButtonElement | null = null;
  if (all.some((line) => line.length > LONG_LINE)) {
    const toggle = button("chip code-wrap", "wrap");
    let wrapped = true;
    mark(toggle, wrapped);
    toggle.addEventListener("click", () => {
      wrapped = !wrapped;
      mark(toggle, wrapped);
      text.classList.toggle("nowrap", !wrapped);
    });
    wrap = toggle;
  }
  return { node, wrap };
}

/**
 * A tiny bar split into parts, each as wide as its share of the whole: the
 * track is the ground and the parts are in the text's color. `label` says
 * what it shows, for assistive tech.
 */
export function splitBar(shares: readonly number[], label: string): HTMLElement {
  const node = el("div", "split");
  node.setAttribute("role", "img");
  node.setAttribute("aria-label", label);
  for (const share of shares) {
    const part = el("span", "split-part");
    part.style.flexGrow = String(share);
    node.append(part);
  }
  return node;
}
