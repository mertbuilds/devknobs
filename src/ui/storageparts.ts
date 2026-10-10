import { pretty, shown, sizeLabel, byteSize } from "../storage/format";
import type { Site } from "../storage/site";
import { el } from "./dom";
import {
  type ControlOption,
  codeBlock,
  confirmLine,
  controls,
  noteLine,
  stack,
  textArea,
} from "./kit";

/**
 * What the storage view's sections share: what they need from the view, the
 * shape each of them has, and the few pieces they all build with. The chrome
 * is the kit's. What is here only puts it together.
 */

/** What the view needs from the page, each a thing a test can hand in. */
export interface StorageDeps {
  site: Site;
  /** Copy a text, the one way a value leaves the view. Says whether it went. */
  copy(text: string): Promise<boolean>;
  /** Run something every `ms`. Returns the way to stop. */
  every(ms: number, run: () => void): () => void;
  /** Hear another tab change the origin's storage. Returns the way to stop. */
  onStorage(listener: () => void): () => void;
  /** Whether the view is in sight. A view out of sight reads nothing on its tick. */
  visible(): boolean;
  now(): number;
}

/** What a section needs from the view around it. */
export interface Shell {
  site: Site;
  now(): number;
  /** Copy a text, and say on the view's line that `what` was copied. */
  copy(text: string, what: string): void;
  /** Whether devknobs' own items show, and so go with a clear. */
  own(): boolean;
  /** Say something on the view's quiet line, with a control after it where one is handed in. */
  say(lines: string | readonly string[], control?: ControlOption): void;
  /** Ask a question in place, under the view's bar. */
  ask(text: string, confirm: string, run: () => void): void;
  /**
   * Put something in the place a question is asked in, instead of what is
   * there, built with the way to close it, and give `focus` the focus once
   * it is on the page. Escape closes it too.
   */
  put(build: (close: () => void) => { node: HTMLElement; focus?: HTMLElement }): void;
  /** Something escape takes back is open. Returns the way to say it closed. */
  hold(cancel: () => void): () => void;
  /** What the filter says. */
  query(): string;
  /** The section's count changed. */
  counted(): void;
  /** The view wrote to the page's storage: every section reads again. */
  touched(): void;
}

/** One kind of storage, as the view shows it. */
export interface Section {
  node: HTMLElement;
  /** Whether the view reads it again on its tick. */
  live: boolean;
  /** What its items are called, one and many. */
  noun: readonly [one: string, many: string];
  /** Read again, and draw what changed. */
  refresh(): void | Promise<void>;
  /** Draw for what the filter says now. */
  filter(): void;
  /** How many items it has, null before it is known. */
  count(): number | null;
  /** The controls it adds to the view's line of them. */
  controls?(): ControlOption[];
  /** Ask to clear the kind. A kind that is read only has none. */
  clear?(): void;
  destroy?(): void;
}

/** How many rows of a long list are built at a time. */
export const ROW_CHUNK = 200;

/** `3 items`, `1 item`. */
export function counted(count: number, noun: readonly [string, string]): string {
  return `${count} ${count === 1 ? noun[0] : noun[1]}`;
}

/**
 * Stand `nodes` in a box in their order, moving only what is out of place.
 * A row that did not change is never taken off the page, so it keeps its
 * focus and its place under the pointer while the list reads again.
 */
export function sync(box: HTMLElement, nodes: readonly HTMLElement[]): void {
  nodes.forEach((node, at) => {
    const here = box.children[at];
    if (here !== node) box.insertBefore(node, here ?? null);
  });
  for (let last = box.children[nodes.length]; last; last = box.children[nodes.length]) {
    box.removeChild(last);
  }
}

/** A row of a list, as the keys drive it. */
export interface KeyRow {
  main: HTMLElement;
  /** Ask to delete it, in place. A row that cannot be deleted has none. */
  remove?(): void;
}

/**
 * The keys over a list's rows: up and down move the focus from row to row,
 * and delete or backspace on a row asks to delete it. Enter opens a row by
 * itself, as its line is a button.
 */
export function rowKeys(box: HTMLElement, rows: () => readonly KeyRow[]): void {
  box.addEventListener("keydown", (event: KeyboardEvent) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const list = rows();
    const at = list.findIndex((row) => row.main === event.target);
    const row = list[at];
    if (!row) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      const next = list[at + (event.key === "ArrowDown" ? 1 : -1)];
      event.preventDefault();
      next?.main.focus({ preventScroll: false });
    } else if ((event.key === "Delete" || event.key === "Backspace") && row.remove) {
      event.preventDefault();
      row.remove();
    }
  });
}

/**
 * A value, laid out where it is json that loses nothing by it, and cut where
 * it is long. A click copies all of it, cut or not.
 */
export function valueBlock(shell: Shell, text: string, what: string): HTMLElement {
  const box = el("div", "ask");
  const draw = (all: boolean): void => {
    const part = shown(pretty(text) ?? text, all);
    const code = codeBlock(part.text);
    code.title = "click to copy";
    code.addEventListener("click", () => {
      // A click that ends a selection is the selection's, not a copy.
      const picked = typeof getSelection === "function" ? String(getSelection() ?? "") : "";
      if (picked === "") shell.copy(text, what);
    });
    const rest: HTMLElement[] = [];
    if (part.more > 0 && part.canShowAll) {
      rest.push(
        noteLine(`${part.more.toLocaleString("en-US")} more characters`),
        controls([{ label: "show all", run: () => draw(true) }]).node,
      );
    } else if (part.more > 0) {
      rest.push(
        noteLine(`${sizeLabel(byteSize(text))} in all, too long to show: copy it to read the rest`),
      );
    }
    box.replaceChildren(code, ...rest);
  };
  draw(false);
  return box;
}

/** What follows a long list: how much of it shows, and the control that shows more. */
export function pager(
  showing: number,
  total: number,
  step: number,
  more: () => void,
): HTMLElement[] {
  if (showing >= total) return [];
  return [
    stack([
      noteLine(`${showing.toLocaleString("en-US")} of ${total.toLocaleString("en-US")}`),
      controls([{ label: `show ${Math.min(step, total - showing)} more`, run: more }]).node,
    ]),
  ];
}

/** What a box to edit text in place is built from. */
export interface EditOptions {
  label: string;
  value?: string;
  placeholder?: string;
  /** What the control that keeps the text says. Defaults to `save`. */
  action?: string;
  /** Keep the text. Returns the line that says why not, or null once kept. */
  save(text: string): string | null;
  /** The box closed, kept or not. */
  close(saved: boolean): void;
}

export interface EditBox {
  node: HTMLElement;
  area: HTMLTextAreaElement;
  /** Close the box and keep nothing, as its cancel does. */
  cancel(): void;
}

/**
 * A text box with save and cancel under it. Enter with meta or ctrl saves,
 * and escape cancels and leaves the view open. What cannot be saved is said
 * under the box, which stays as it is.
 */
export function editBox(shell: Shell, options: EditOptions): EditBox {
  const problem = el("div", "ask");
  const cancel = (): void => {
    release();
    options.close(false);
  };
  const save = (): void => {
    const error = options.save(area.value);
    if (error !== null) {
      problem.replaceChildren(noteLine(error));
      return;
    }
    release();
    options.close(true);
  };
  const area = textArea({
    label: options.label,
    value: options.value,
    placeholder: options.placeholder,
    onSave: save,
  });
  const release = shell.hold(cancel);
  const node = stack([
    area,
    problem,
    controls([
      { label: options.action ?? "save", run: save },
      { label: "cancel", run: cancel },
    ]).node,
  ]);
  return { node, area, cancel };
}

/** A question asked in a row's own fold, which escape takes back. */
export function askIn(
  shell: Shell,
  box: HTMLElement,
  text: string,
  confirm: string,
  run: () => void,
  back: () => void,
): void {
  const release = shell.hold(() => {
    release();
    back();
  });
  const asked = confirmLine({
    text,
    confirm,
    onConfirm: () => {
      release();
      run();
    },
    onCancel: () => {
      release();
      back();
    },
  });
  box.replaceChildren(stack([asked.node]));
  asked.buttons[0]?.focus({ preventScroll: true });
}
