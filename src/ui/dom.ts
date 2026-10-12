/**
 * The small pieces the panel's views are built from: nodes, buttons, fields
 * and the row line they all share, and the marks and scrolls that keep them
 * in step.
 */

export function el(tag: string, className: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function button(className: string, label: string): HTMLButtonElement {
  const node = document.createElement("button");
  node.type = "button";
  node.className = className;
  node.textContent = label;
  return node;
}

/** What a row is built from. Every part but the main and the title may be left out. */
export interface RowParts {
  /** The row's control: a button, or a plain box where the line itself does nothing. */
  main: HTMLElement;
  /** A control of its own in the leading slot, as a knob row's grip is. */
  grip?: HTMLElement;
  /** A drawing in the leading slot that is part of the main, as a fold's chevron is. */
  lead?: Element;
  /** The icon before the title. */
  glyph?: Element;
  title: string;
  /** What the main ends with, in order: the row's value, its key or a control. */
  ends?: readonly HTMLElement[];
  /** What stands after the main, in order: the row's x, or a head's actions. */
  after?: readonly HTMLElement[];
}

/** A row as built: its box, and the node that holds its title. */
export interface RowBox {
  box: HTMLElement;
  label: HTMLElement;
}

/**
 * A row: its line, with the leading slot kept in the main's leading padding
 * whether anything stands in it or not, then its icon, its title and what it
 * ends with, and what stands after the main. The knob rows, the actions'
 * rows, the settings and the head of a view are all built here and differ
 * only by what is in their slots, so they line up and take the same styles.
 */
export function rowBox(parts: RowParts): RowBox {
  const { main, grip, lead, glyph } = parts;
  const box = el("div", "row");
  const line = el("div", "line");
  const label = el("span", "row-label", parts.title);
  if (lead) {
    const slot = el("span", "lead");
    slot.append(lead);
    main.append(slot);
  }
  if (glyph) main.append(glyph);
  main.append(label, ...(parts.ends ?? []));
  if (grip) {
    grip.className = `lead ${grip.className}`;
    line.append(grip);
  }
  line.append(main, ...(parts.after ?? []));
  box.append(line);
  return { box, label };
}

/**
 * A title over a run of rows, such as the settings' shortcuts: it starts
 * past the leading slot, over the rows' icons.
 */
export function rowsLabel(text: string): HTMLElement {
  return el("div", "rows-label", text);
}

/**
 * A small icon button a row ends with: a knob row's x, or an action in the
 * head of a view. `className` names which, for the code that looks for it.
 */
export function rowButton(className: string, glyph: Element, label: string): HTMLButtonElement {
  const node = button(`row-button ${className}`, "");
  node.append(glyph);
  node.setAttribute("aria-label", label);
  return node;
}

export function field(className: string, placeholder: string, label: string): HTMLInputElement {
  const node = document.createElement("input");
  node.className = `field ${className}`;
  node.placeholder = placeholder;
  node.autocomplete = "off";
  node.spellcheck = false;
  node.setAttribute("aria-label", label);
  return node;
}

export function numberField(placeholder: string, label = placeholder): HTMLInputElement {
  const node = field("field-num", placeholder, label);
  node.type = "number";
  node.step = "any";
  node.inputMode = "decimal";
  return node;
}

/** Mark a control as on or off, for the eye and for assistive tech. */
export function mark(node: HTMLElement, on: boolean, attribute = "aria-pressed"): void {
  node.classList.toggle("on", on);
  node.setAttribute(attribute, on ? "true" : "false");
}

/**
 * Scroll a box just enough to show a node in it, its top first where all of
 * it does not fit. The box is the node's offset parent.
 */
export function reveal(node: HTMLElement, box: HTMLElement): void {
  const top = node.offsetTop;
  const bottom = top + node.offsetHeight;
  if (top < box.scrollTop) box.scrollTop = top;
  else if (bottom > box.scrollTop + box.clientHeight) {
    box.scrollTop = Math.min(top, bottom - box.clientHeight);
  }
}

/** The first control in a box that the tab key stops at and that shows. */
export function firstControl(box: Element | null): HTMLElement | null {
  if (!box) return null;
  const controls = Array.from(box.querySelectorAll<HTMLElement>("button, input, textarea"));
  return controls.find((node) => node.tabIndex >= 0 && node.getClientRects().length > 0) ?? null;
}

/** Scroll a box to put a node in its middle. The box is the node's offset parent. */
export function center(node: HTMLElement, box: HTMLElement): void {
  box.scrollTop = node.offsetTop - (box.clientHeight - node.offsetHeight) / 2;
}
