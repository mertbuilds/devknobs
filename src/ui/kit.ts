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
 *   stack([noteLine("..."), codeBlock(text), fieldList(pairs), controls([{ label, run }]).node]);
 *   textField({ ... }); textArea({ ... }); switchLine({ ... }); confirmLine({ ... });
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
  /** Whether it starts folded out. */
  open: boolean;
  /** The row was pressed, and the fold is out or away as `open` says. */
  onToggle?(open: boolean): void;
  /** What the row's line ends with, as a row's value is. */
  ends?: readonly HTMLElement[];
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
 * chevron stands in the leading slot, so its label starts where a row's
 * content does.
 */
export function sectionFold(options: FoldOptions): Fold {
  const main = button("main", "");
  const turn = el("span", "turn");
  turn.append(icon("chevron-left"));
  const { box, label } = rowBox({ main, lead: turn, title: options.label, ends: options.ends });
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

/** A quiet line: a note on what a view shows, or what just happened in it. */
export function noteLine(text: string): HTMLElement {
  return el("div", "note", text);
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

/** Text shown as it is, in the type code is read in, wrapped and scrolled where it is long. */
export function codeBlock(text: string): HTMLElement {
  return el("pre", "code", text);
}

/** A list of names and what each is, in two columns. */
export function fieldList(pairs: readonly (readonly [name: string, value: string])[]): HTMLElement {
  const node = el("dl", "defs");
  for (const [name, value] of pairs) node.append(el("dt", "", name), el("dd", "", value));
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
