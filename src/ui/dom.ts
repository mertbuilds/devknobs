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

/**
 * A row: its line, with the grip's column kept in the main's leading padding
 * whether a grip is in it or not, its icon, its title and what it ends with,
 * its value or a control, and its x after the main. The knob rows and the
 * settings are all built here, so they line up and take the same styles.
 */
export function rowBox(
  main: HTMLElement,
  glyph: Element,
  title: string,
  value?: HTMLElement,
  clear?: HTMLElement,
  grip?: HTMLElement,
): HTMLElement {
  const box = el("div", "row");
  const line = el("div", "line");
  main.append(glyph, el("span", "row-label", title));
  if (value) main.append(value);
  if (grip) line.append(grip);
  line.append(main);
  if (clear) line.append(clear);
  box.append(line);
  return box;
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
