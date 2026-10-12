/**
 * What a feature's view is built from. The rule: a view builds its chrome,
 * its bar, filter, choices, rows, folds and empty lines, only from what is
 * here, and adds css only for the cells of its own content. So a view lines
 * up with the panel's rows and cannot drift from them: the stylesheet has one
 * rule for each of these, and a test fails where a view pads, edges or rounds
 * a head, a bar or a row's main for itself. Where its lines start is the
 * layout the view names, and no piece here says it again.
 *
 *   toolbar([filterField({ ... }).node, segments({ ... }).node]);
 *   toolbar([toolToggle({ ... }).node, filterField({ ... }).node]);
 *   rowBox({ main, glyph, title, ends, after }); sectionFold({ ... }); emptyLine("no requests");
 *   entryHead({ name: "key", value: "value" }); entryFold({ name, value, end, open }); entryRow({ name, end });
 *   sectionFold({ label, glyph, ends, open }); branch([leaf, leaf]); noteButton("3 hidden", run);
 *   emptyAction("select an element", run);
 *   group({ label, ends }); pairs(lines); codeBlock({ text, lines }); splitBar(shares, label);
 *   stack([noteLine("..."), codeBlock({ text }).node, pairs(lines).node, controls([{ label, run }]).node]);
 *   textField({ ... }); textArea({ ... }); switchLine({ ... }); confirmLine({ ... });
 */

import { button, el, field, mark, type RowBox, rowBox } from "./dom";
import { type IconName, icon } from "./icons";

export { LAYOUTS, type Layout, type RowBox, type RowParts, rowBox, rowButton, rowsLabel } from "./dom";
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

/** What a bar's toggle is built from. */
export interface ToolOptions {
  /** What it does, in a word or two: its name for assistive tech. */
  label: string;
  icon: IconName;
  /** Whether it starts on. */
  on: boolean;
  /** It was pressed. The caller says whether it is on from there. */
  onPress(): void;
}

export interface Tool {
  node: HTMLButtonElement;
  /** Show whether it is on. */
  set(on: boolean): void;
}

/**
 * The small icon button a bar starts with, a toggle: it goes first in the
 * bar, and its icon stands where the view's lines start. On, it has the
 * ground the segment that is on has.
 */
export function toolToggle(options: ToolOptions): Tool {
  const node = button("tool", "");
  node.append(icon(options.icon));
  node.setAttribute("aria-label", options.label);
  node.addEventListener("click", () => options.onPress());
  const set = (on: boolean): void => mark(node, on);
  set(options.on);
  return { node, set };
}

/** A line that says a list has nothing to show. */
export function emptyLine(text: string): HTMLElement {
  return el("div", "empty", text);
}

/**
 * An empty line that is the way to fill what it stands for: a button, quiet
 * as the line is and on its columns, whose words say what a press does.
 */
export function emptyAction(text: string, run: () => void): HTMLButtonElement {
  const node = button("empty empty-action", text);
  node.addEventListener("click", () => run());
  return node;
}

/** What a fold is built from. */
export interface FoldOptions {
  label: string;
  /** Whether it starts folded out. */
  open: boolean;
  /** The row was pressed, and the fold is out or away as `open` says. */
  onToggle?(open: boolean): void;
  /** What the row's line ends with, as a row's value is. */
  ends?: readonly HTMLElement[];
  /**
   * An icon of the row's own, for a node of a tree. It stands where a row's
   * icon does, and the chevron goes to the end of the line.
   */
  glyph?: Element;
}

export interface Fold {
  /** The row and what folds under it. */
  node: HTMLElement;
  /** The row's line, which folds it out and away. */
  main: HTMLButtonElement;
  /** The node that holds the row's label. */
  label: HTMLElement;
  /** Where the folded content goes. */
  body: HTMLElement;
  /** Fold it out or away. */
  set(open: boolean): void;
}

/**
 * A section that folds out under its row, as a knob row's editor does. Its
 * chevron stands where a row's icon does, so it starts where the view's
 * lines start. With an icon of its own the icon stands there, and the
 * chevron ends the line, so the names of a tree's nodes line up whether a
 * node folds or not.
 */
export function sectionFold(options: FoldOptions): Fold {
  const main = button("main", "");
  const turn = el("span", "turn");
  turn.append(icon("chevron-left"));
  const { box, label } = options.glyph
    ? rowBox({ main, glyph: options.glyph, title: options.label, ends: [...(options.ends ?? []), turn] })
    : rowBox({ main, glyph: turn, title: options.label, ends: options.ends });
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
  return { node: box, main, label, body, set };
}

/**
 * What a node of a tree holds, under the node: its own nodes, a step in, so
 * each starts under the name of the node it is in.
 */
export function branch(children: readonly HTMLElement[]): HTMLElement {
  const node = el("div", "branch");
  node.append(...children);
  return node;
}

/** What a line of a table is built from. */
export interface EntryOptions {
  /** The line's number in the table, on a narrow column before the name. */
  index?: string;
  /** What the line is of: a key, a name. Cut short where it is long, and whole in its tooltip. */
  name: string;
  /** What it holds, on one line. With one, the name stands on a column every line of the table has. */
  value?: string;
  /** What the line ends with, quiet: a size, a count. */
  end?: string;
  /** Whether the name is as quiet as the value is. */
  quiet?: boolean;
}

/** Make a row's label the name of a line of a table, with the line's other cells around it. */
function entryCells(main: HTMLElement, label: HTMLElement, options: EntryOptions): void {
  const columned = options.value !== undefined;
  label.className = `${label.className} cell-name${columned ? " columned" : ""}${options.quiet ? " quiet" : ""}`;
  label.title = options.name;
  if (options.index !== undefined) main.insertBefore(el("span", "cell-index", options.index), label);
  if (options.value !== undefined) main.append(el("span", "cell-value", options.value));
  if (options.end !== undefined && options.end !== "") main.append(el("span", "cell-end", options.end));
}

/**
 * The head of a table: what each column of its lines is, in small quiet
 * words, on the columns `entryFold` puts its cells on. It takes the options
 * a line does, each saying its column's name, and leaves the room of a
 * line's chevron empty. It has no ground and no line under it.
 */
export function entryHead(options: EntryOptions): HTMLElement {
  const node = el("div", "cells-head");
  node.setAttribute("aria-hidden", "true");
  node.append(el("span", "cell-lead"));
  if (options.index !== undefined) node.append(el("span", "cell-index", options.index));
  node.append(el("span", `cell-name${options.value !== undefined ? " columned" : ""}`, options.name));
  if (options.value !== undefined) node.append(el("span", "cell-value", options.value));
  if (options.end !== undefined && options.end !== "") node.append(el("span", "cell-end", options.end));
  return node;
}

/**
 * A line of a table that folds out under itself: a name, its value and what
 * the line ends with. The names of every line stand on one column and the
 * values on the next, so they line up down the list.
 */
export function entryFold(options: EntryOptions & Omit<FoldOptions, "label" | "ends">): Fold {
  const fold = sectionFold({ label: options.name, open: options.open, onToggle: options.onToggle });
  entryCells(fold.main, fold.label, options);
  return fold;
}

/** A line of a table that does nothing: a name, its value and what the line ends with. */
export function entryRow(options: EntryOptions): RowBox {
  const main = el("div", "main");
  const row = rowBox({ main, title: options.name });
  entryCells(main, row.label, options);
  return row;
}

/** A quiet line: a note on what a view shows, or what just happened in it. */
export function noteLine(text: string): HTMLElement {
  return el("div", "note", text);
}

/** A quiet line that is a control: it says what a list leaves out, and a press shows it. */
export function noteButton(text: string, run: () => void): HTMLButtonElement {
  const node = button("note note-button", text);
  node.addEventListener("click", run);
  return node;
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

/**
 * What folds out under a row, or stands between a view's bar and its rows,
 * one thing under another: padded as a row's editor is, so what is in it
 * lines up with the editors' controls.
 */
export function stack(children: readonly HTMLElement[]): HTMLElement {
  const node = el("div", "stack");
  node.append(...children);
  return node;
}

/** A small text control, such as copy, edit or delete. */
export interface ControlOption {
  label: string;
  run(): void;
}

export interface Controls {
  node: HTMLElement;
  /** The controls, in the order they were handed in. */
  buttons: readonly HTMLButtonElement[];
}

/** A line of small text controls, the editors' chips, each doing one thing. */
export function controls(options: readonly ControlOption[]): Controls {
  const node = el("div", "chips");
  const buttons = options.map((option) => {
    const control = button("chip", option.label);
    control.addEventListener("click", () => option.run());
    node.append(control);
    return control;
  });
  return { node, buttons };
}

/** What a one-line field is built from. */
export interface TextFieldOptions {
  placeholder: string;
  /** The field's name, for assistive tech. Defaults to the placeholder. */
  label?: string;
  value?: string;
  /** Enter was pressed in it. */
  onEnter?(): void;
}

/** A field for one line of text, as wide as its place. */
export function textField(options: TextFieldOptions): HTMLInputElement {
  const node = field("field-line", options.placeholder, options.label ?? options.placeholder);
  node.value = options.value ?? "";
  node.addEventListener("keydown", (event: KeyboardEvent) => {
    if (event.key === "Enter" && !event.isComposing) options.onEnter?.();
  });
  return node;
}

/** What a text box is built from. */
export interface TextAreaOptions {
  /** The box's name, for assistive tech. */
  label: string;
  value?: string;
  placeholder?: string;
  /** Enter with meta or ctrl was pressed in it. */
  onSave?(): void;
}

/** The most lines a text box grows to before it scrolls. */
export const AREA_ROWS = 14;

/**
 * A box for text over lines, in the type code is read in. It is as tall as
 * what it holds, up to `AREA_ROWS` lines, and scrolls past that.
 */
export function textArea(options: TextAreaOptions): HTMLTextAreaElement {
  const node = document.createElement("textarea");
  node.className = "field field-area";
  node.value = options.value ?? "";
  node.placeholder = options.placeholder ?? "";
  node.spellcheck = false;
  node.setAttribute("aria-label", options.label);
  const fit = (): void => {
    node.rows = Math.min(Math.max(node.value.split("\n").length, 2), AREA_ROWS);
  };
  fit();
  node.addEventListener("input", fit);
  node.addEventListener("keydown", (event: KeyboardEvent) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      options.onSave?.();
    }
  });
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

/** What a switch on a line of its own is built from. */
export interface SwitchOptions {
  label: string;
  on: boolean;
  /** It was pressed, and is now as `on` says. */
  onChange(on: boolean): void;
}

export interface SwitchLine {
  node: HTMLElement;
  control: HTMLButtonElement;
  set(on: boolean): void;
}

/** A switch with its label before it, as a knob's switch stands in its editor. */
export function switchLine(options: SwitchOptions): SwitchLine {
  const node = el("div", "knob knob-switch");
  const control = button("switch", "");
  control.setAttribute("role", "switch");
  control.setAttribute("aria-label", options.label);
  let on = false;
  const set = (next: boolean): void => {
    on = next;
    mark(control, next, "aria-checked");
  };
  control.addEventListener("click", () => {
    set(!on);
    options.onChange(on);
  });
  set(options.on);
  node.append(el("span", "knob-label", options.label), control);
  return { node, control, set };
}

/** What a question asked in place is built from. */
export interface ConfirmOptions {
  /** The question, such as `clear 12 items?`. */
  text: string;
  /** What the control that goes ahead says. */
  confirm: string;
  onConfirm(): void;
  onCancel(): void;
}

/**
 * A question asked where the thing is, in the view and never in a dialog of
 * the browser: its words, then the control that goes ahead and the one that
 * does not.
 */
export function confirmLine(options: ConfirmOptions): Controls {
  const node = el("div", "ask");
  const answers = controls([
    { label: options.confirm, run: options.onConfirm },
    { label: "cancel", run: options.onCancel },
  ]);
  node.append(noteLine(options.text), answers.node);
  return { node, buttons: answers.buttons };
}
