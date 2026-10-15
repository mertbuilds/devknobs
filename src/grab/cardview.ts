/**
 * The card inspect shows by the element under the pointer, as nodes: under
 * the label's own line, a row for each thing it can say. All of it is built
 * once, and a new element only changes the text in it and which rows show.
 */

import { icon } from "../ui/icons";
import { CARD_KEYS, CARD_LABELS, type CardKey, type CardRow } from "./card";

export interface CardView {
  /** The element's size, which ends the label's own line. */
  size: HTMLElement;
  /** The rows, which go under that line. */
  rows: HTMLElement;
  /**
   * Say a size and some rows. Returns the rows that show, as one text: the
   * card is as tall as they make it, whatever they say.
   */
  write(size: string, rows: readonly CardRow[]): string;
}

interface RowNodes {
  node: HTMLElement;
  swatch: HTMLElement;
  pass: HTMLElement;
  fail: HTMLElement;
  text: HTMLElement;
}

function span(className: string, text = ""): HTMLElement {
  const node = document.createElement("span");
  node.className = className;
  if (text) node.textContent = text;
  return node;
}

/** Set a text only where it changed. */
function say(node: HTMLElement, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}

function show(node: HTMLElement, on: boolean): void {
  if (node.hidden === on) node.hidden = !on;
}

function mark(className: string, name: "check" | "x"): HTMLElement {
  const node = span(className);
  node.append(icon(name, 12));
  node.hidden = true;
  return node;
}

export function createCardView(): CardView {
  const size = span("size");
  const rows = document.createElement("div");
  rows.className = "rows";
  rows.hidden = true;
  const nodes = new Map<CardKey, RowNodes>();
  for (const key of CARD_KEYS) {
    const node = document.createElement("div");
    node.className = "info";
    node.hidden = true;
    const value = span("val");
    const swatch = span("dot");
    swatch.hidden = true;
    const pass = mark("mark", "check");
    const fail = mark("mark fail", "x");
    const text = span("text");
    value.append(swatch, text, pass, fail);
    node.append(span("key", CARD_LABELS[key]), value);
    rows.append(node);
    nodes.set(key, { node, swatch, pass, fail, text });
  }

  function write(sized: string, next: readonly CardRow[]): string {
    say(size, sized);
    const shown: CardKey[] = [];
    for (const key of CARD_KEYS) {
      const parts = nodes.get(key);
      if (!parts) continue;
      const row = next.find((one) => one.key === key);
      show(parts.node, row !== undefined);
      if (!row) continue;
      shown.push(key);
      say(parts.text, row.text);
      const quiet = row.quiet ? "text quiet" : "text";
      if (parts.text.className !== quiet) parts.text.className = quiet;
      show(parts.swatch, row.swatch !== undefined);
      if (row.swatch !== undefined) parts.swatch.style.backgroundColor = row.swatch;
      show(parts.pass, row.pass === true);
      show(parts.fail, row.pass === false);
    }
    show(rows, shown.length > 0);
    return shown.join(" ");
  }

  return { size, rows, write };
}
