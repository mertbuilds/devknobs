/**
 * Reads the stylesheet the panel ships and says where a part of it starts and
 * ends across, in px, the way the browser would: the rules that match the
 * part and what it is in, the later and the more specific one winning, the
 * custom properties it inherits, and the padding, the border and the margin
 * of every box down to it added up. It knows only what the panel's rows,
 * heads and kit are laid out with, and throws on anything else, so a test
 * never passes on a rule it could not read.
 */

import { rules } from "./kit-dom";

/** A node as the stylesheet sees it: its tag, classes and attributes. */
export interface Place {
  tag: string;
  classes: readonly string[];
  attrs: Readonly<Record<string, string>>;
}

/** The nodes from the wrapper down to a part, the part last. */
export type Path = readonly Place[];

/**
 * A node from a few words: its classes, a tag before them where it has one
 * that matters, and attributes as `name=value`, such as
 * `div view pane data-layout=flush`.
 */
export function place(text: string): Place {
  const words = text.split(" ").filter((word) => word !== "");
  const attrs: Record<string, string> = {};
  const classes: string[] = [];
  let tag = "div";
  words.forEach((word, at) => {
    const [name, value] = word.split("=");
    if (value !== undefined && name) attrs[name] = value;
    else if (at === 0 && TAGS.includes(word)) tag = word;
    else classes.push(word);
  });
  return { tag, classes, attrs };
}

const TAGS = ["div", "span", "button", "input", "label", "dl", "pre", "section", "svg"];

/** A path from its nodes, each as `place` reads one. */
export function path(...nodes: string[]): Path {
  return nodes.map(place);
}

/** One simple part of a selector: a tag, classes and attributes that must all be there. */
interface Compound {
  tag: string | null;
  classes: string[];
  attrs: [name: string, value: string | null][];
}

/** A selector as the resolver reads one: its compounds, and whether each must be the child of the one before. */
interface Selector {
  compounds: Compound[];
  /** For each compound after the first: true where it must be a child, false for any descendant. */
  child: boolean[];
  specificity: number;
}

interface Declared {
  selector: Selector;
  order: number;
  values: Map<string, string>;
}

/** Split at the commas that are not inside brackets. */
function list(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let part = "";
  for (const char of text) {
    if (char === "(" || char === "[") depth++;
    if (char === ")" || char === "]") depth--;
    if (char === "," && depth === 0) {
      parts.push(part.trim());
      part = "";
    } else part += char;
  }
  if (part.trim() !== "") parts.push(part.trim());
  return parts;
}

const COMPOUND = /^([a-z]+|\*)?((?:\.[\w-]+|\[[\w-]+(?:="[^"]*")?\])*)$/;

/**
 * Read a selector of tags, classes and attributes joined by descent. Null for
 * one with a state, a pseudo-element or a sibling in it, which says nothing
 * of where a part stands at rest.
 */
export function readSelector(text: string): Selector | null {
  const tokens = text.replace(/\s*>\s*/g, " > ").split(/\s+/).filter((token) => token !== "");
  const compounds: Compound[] = [];
  const child: boolean[] = [];
  let next = false;
  let specificity = 0;
  for (const token of tokens) {
    if (token === ">") {
      next = true;
      continue;
    }
    const found = COMPOUND.exec(token);
    if (!found) return null;
    const compound: Compound = { tag: found[1] && found[1] !== "*" ? found[1] : null, classes: [], attrs: [] };
    for (const [, name, attr, value] of (found[2] ?? "").matchAll(/\.([\w-]+)|\[([\w-]+)(?:="([^"]*)")?\]/g)) {
      if (name) compound.classes.push(name);
      else if (attr) compound.attrs.push([attr, value ?? null]);
    }
    specificity += (compound.classes.length + compound.attrs.length) * 100 + (compound.tag ? 1 : 0);
    if (compounds.length > 0) child.push(next);
    compounds.push(compound);
    next = false;
  }
  return compounds.length > 0 ? { compounds, child, specificity } : null;
}

function fits(compound: Compound, node: Place): boolean {
  if (compound.tag !== null && compound.tag !== node.tag) return false;
  if (!compound.classes.every((name) => node.classes.includes(name))) return false;
  return compound.attrs.every(([name, value]) => name in node.attrs && (value === null || node.attrs[name] === value));
}

/** Whether a selector matches the last node of a path. */
function matches(selector: Selector, nodes: Path): boolean {
  const { compounds, child } = selector;
  /** Match the compounds up to `at` against the nodes up to `end`, the last of each to each other. */
  const from = (at: number, end: number): boolean => {
    const node = nodes[end];
    const compound = compounds[at];
    if (!node || !compound || !fits(compound, node)) return false;
    if (at === 0) return true;
    if (child[at - 1]) return from(at - 1, end - 1);
    for (let up = end - 1; up >= 0; up--) if (from(at - 1, up)) return true;
    return false;
  };
  return from(compounds.length - 1, nodes.length - 1);
}

const SIDES = ["top", "right", "bottom", "left"] as const;

/** The parts of a value, split at the spaces that are not inside brackets. */
function words(value: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let part = "";
  for (const char of value.trim()) {
    if (char === "(") depth++;
    if (char === ")") depth--;
    if (char === " " && depth === 0) {
      if (part !== "") parts.push(part);
      part = "";
    } else part += char;
  }
  if (part !== "") parts.push(part);
  return parts;
}

/** A shorthand's four sides, as css fills in the ones left out. */
function fourSides(value: string): Record<(typeof SIDES)[number], string> {
  const [top = "0", right = top, bottom = top, left = right] = words(value);
  return { top, right, bottom, left };
}

/** What a rule declares, its shorthands for the box spelled out a side at a time. */
export function declarations(body: string): Map<string, string> {
  const values = new Map<string, string>();
  for (const part of body.split(";")) {
    const at = part.indexOf(":");
    if (at < 0) continue;
    const name = part.slice(0, at).trim();
    const value = part.slice(at + 1).trim();
    if (name === "padding" || name === "margin") {
      const sides = fourSides(value);
      for (const side of SIDES) values.set(`${name}-${side}`, sides[side]);
    } else if (name === "border" || /^border-(top|right|bottom|left)$/.test(name)) {
      const width = words(value).find((word) => /^(0|[\d.]+px)$/.test(word)) ?? (value === "none" ? "0" : "3px");
      for (const side of name === "border" ? SIDES : [name.slice(7)]) values.set(`border-${side}-width`, width);
    } else if (name === "border-width") {
      const sides = fourSides(value);
      for (const side of SIDES) values.set(`border-${side}-width`, sides[side]);
    } else if (name === "gap") {
      const [row = "0", column = row] = words(value);
      values.set("row-gap", row);
      values.set("column-gap", column);
    } else values.set(name, value);
  }
  return values;
}

/** A stylesheet, read once. */
export interface Sheet {
  /** What a property comes to on the last node of a path, or null where no rule sets it there. */
  declared(nodes: Path, property: string): string | null;
  /** A length on the last node of a path, in px: 0 where nothing sets it. */
  px(nodes: Path, property: string): number;
  /** How far the part's box starts from the wrapper's left edge, in px. */
  boxLeft(nodes: Path): number;
  /** How far what is in the part starts from the wrapper's left edge: its box, its border and its padding. */
  left(nodes: Path): number;
  /** How far the part's box ends from the wrapper's right edge. */
  boxRight(nodes: Path): number;
  /** How far what is in the part ends from the wrapper's right edge. */
  right(nodes: Path): number;
}

export function readSheet(css: string): Sheet {
  const all: Declared[] = [];
  rules(css).forEach((rule, order) => {
    const values = declarations(rule.body);
    for (const text of list(rule.selector)) {
      const selector = readSelector(text);
      if (selector) all.push({ selector, order, values });
    }
  });

  function declared(nodes: Path, property: string): string | null {
    let best: Declared | null = null;
    for (const rule of all) {
      if (!rule.values.has(property) || !matches(rule.selector, nodes)) continue;
      const wins =
        best === null ||
        rule.selector.specificity > best.selector.specificity ||
        (rule.selector.specificity === best.selector.specificity && rule.order >= best.order);
      if (wins) best = rule;
    }
    return best?.values.get(property) ?? null;
  }

  /** A custom property as a part inherits it: from the nearest node that sets it, read as that node reads it. */
  function variable(nodes: Path, name: string): number {
    for (let end = nodes.length; end > 0; end--) {
      const here = nodes.slice(0, end);
      const value = declared(here, name);
      if (value !== null) return length(here, value);
    }
    throw new Error(`${name} is set nowhere above ${nodes.map((node) => node.classes.join(".")).join(" > ")}`);
  }

  /** What a length comes to: a number of px, a custom property, or a sum of them. */
  function length(nodes: Path, value: string): number {
    const tokens = value.match(/var\(--[\w-]+\)|calc|[\d.]+(?:px)?|[-+*/()]|\S+/g) ?? [];
    let at = 0;
    const atom = (): number => {
      const token = tokens[at++];
      if (token === undefined) throw new Error(`cannot read ${value}`);
      if (token === "calc") return atom();
      if (token === "(") {
        const inner = sum();
        if (tokens[at++] !== ")") throw new Error(`cannot read ${value}`);
        return inner;
      }
      if (token === "-") return -atom();
      const named = /^var\((--[\w-]+)\)$/.exec(token);
      if (named?.[1]) return variable(nodes, named[1]);
      if (token === "auto") return 0;
      if (/^[\d.]+(px)?$/.test(token)) return Number.parseFloat(token);
      throw new Error(`cannot read ${token} in ${value}`);
    };
    const product = (): number => {
      let total = atom();
      while (tokens[at] === "*" || tokens[at] === "/") {
        const by = tokens[at++];
        const other = atom();
        total = by === "*" ? total * other : total / other;
      }
      return total;
    };
    const sum = (): number => {
      let total = product();
      while (tokens[at] === "+" || tokens[at] === "-") {
        const by = tokens[at++];
        const other = product();
        total = by === "+" ? total + other : total - other;
      }
      return total;
    };
    const total = sum();
    if (at !== tokens.length) throw new Error(`cannot read ${value}`);
    return total;
  }

  function px(nodes: Path, property: string): number {
    const value = declared(nodes, property);
    return value === null ? 0 : length(nodes, value);
  }

  /** What a box keeps clear on a side, inside its own edge: its border and its padding. */
  function inside(nodes: Path, side: "left" | "right"): number {
    return px(nodes, `border-${side}-width`) + px(nodes, `padding-${side}`);
  }

  /**
   * Where a part's box starts or ends. One placed by `position: absolute` is
   * measured from the box it is placed in, the nearest above it that says
   * `position`, and every other from its parent's content.
   */
  function box(nodes: Path, side: "left" | "right"): number {
    if (nodes.length === 1) return px(nodes, `margin-${side}`);
    if (declared(nodes, "position") === "absolute") {
      for (let end = nodes.length - 1; end > 0; end--) {
        const holder = nodes.slice(0, end);
        const placed = declared(holder, "position");
        if (placed === null || placed === "static") continue;
        return box(holder, side) + px(holder, `border-${side}-width`) + px(nodes, side);
      }
      throw new Error("an absolute part with nothing to be placed in");
    }
    const parent = nodes.slice(0, -1);
    return box(parent, side) + inside(parent, side) + px(nodes, `margin-${side}`);
  }

  return {
    declared,
    px,
    boxLeft: (nodes) => box(nodes, "left"),
    left: (nodes) => box(nodes, "left") + inside(nodes, "left"),
    boxRight: (nodes) => box(nodes, "right"),
    right: (nodes) => box(nodes, "right") + inside(nodes, "right"),
  };
}

/**
 * The lengths a rule sets across, by the property that sets each: its padding
 * and margin on the left and the right, an inline inset and a text indent.
 */
export function across(body: string): [property: string, value: string][] {
  const found: [string, string][] = [];
  for (const [name, value] of declarations(body)) {
    if (/^(padding|margin)-(left|right)$|^(padding|margin)-inline|^inset-inline|^text-indent$/.test(name)) {
      found.push([name, value]);
    }
  }
  return found;
}

/** Whether a length is written out, as `6px` is, and not read from the columns. */
export function literal(value: string): boolean {
  return /\d(px|em|rem|ch|%|vw|vh)/.test(value.replace(/var\(--[\w-]+\)/g, ""));
}
