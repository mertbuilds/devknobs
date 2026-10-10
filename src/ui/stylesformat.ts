/**
 * What the styles view says, as text: the names, the lines and the marks it
 * shows for an inspection. Nothing here touches the page.
 */

import type {
  HiddenSheet,
  RuleOrigin,
  StyleDeclaration,
  VariableValue,
} from "../styles/types";

/** The most characters the view's head, a crumb and a file name show. */
export const TITLE_MAX = 44;
export const CRUMB_MAX = 24;
export const FILE_MAX = 32;

/** A text cut in its middle, so both its start and its end stay to be read. */
export function middle(text: string, max: number): string {
  const chars = [...text];
  if (chars.length <= max) return text;
  const head = Math.ceil((max - 1) / 2);
  const tail = max - 1 - head;
  return `${chars.slice(0, head).join("")}…${chars.slice(chars.length - tail).join("")}`;
}

/** An element in a line of crumbs: its tag with its id, or with its first class. */
export function crumbText(label: string): string {
  const match = /^([^#.]+)(#[^.]+)?(\.[^.]+)?/.exec(label);
  if (!match) return middle(label, CRUMB_MAX);
  return middle(`${match[1] ?? ""}${match[2] ?? match[3] ?? ""}`, CRUMB_MAX);
}

/** The last segment of a stylesheet's address. One with no address keeps its name. */
export function fileName(sheet: string): string {
  if (sheet === "<style>" || sheet === "constructed") return sheet;
  const path = sheet.split(/[?#]/)[0] ?? sheet;
  const segments = path.split("/").filter((segment) => segment !== "");
  return middle(segments[segments.length - 1] ?? sheet, FILE_MAX);
}

/** Where a rule comes from: the file's name to show, and the whole of it for the tooltip. */
export function sourceOf(origin: RuleOrigin): { text: string; tip: string } {
  const text = fileName(origin.sheet);
  if (origin.sheet === "constructed") return { text, tip: "a stylesheet made by script" };
  if (origin.sheet === "<style>") {
    return { text, tip: origin.owner ? `a style element, ${origin.owner}` : "a style element" };
  }
  return { text, tip: origin.sheet };
}

/** Whether a filter keeps a declaration: by its name or its value, in any case. Empty keeps all. */
export function matchesFilter(declaration: StyleDeclaration, filter: string): boolean {
  const needle = filter.trim().toLowerCase();
  if (needle === "") return true;
  return (
    declaration.name.toLowerCase().includes(needle) ||
    declaration.value.toLowerCase().includes(needle)
  );
}

/** What the view says of a stylesheet whose rules it may not read. */
export function hiddenLine(hidden: HiddenSheet): string {
  const why = hidden.reason === "cross-origin" ? "another origin" : "could not be read";
  return `rules hidden: ${fileName(hidden.sheet)} (${why})`;
}

/** What a custom property's tooltip says: what the element sees for it. */
export function variableTip(name: string, variable: VariableValue): string {
  return variable.value === "" ? `${name} is not set` : `${name}: ${variable.value}`;
}

/** A piece of a value: plain text, or the name of a custom property it reads. */
export interface ValuePart {
  kind: "text" | "var";
  text: string;
}

const VAR = /var\(\s*(--[^\s,)]+)/g;

/** A value in pieces, each name read through `var()` a piece of its own. */
export function valueParts(value: string): ValuePart[] {
  const parts: ValuePart[] = [];
  let at = 0;
  for (const match of value.matchAll(VAR)) {
    const name = match[1] ?? "";
    const start = match.index + match[0].length - name.length;
    if (start > at) parts.push({ kind: "text", text: value.slice(at, start) });
    parts.push({ kind: "var", text: name });
    at = start + name.length;
  }
  if (at < value.length) parts.push({ kind: "text", text: value.slice(at) });
  return parts;
}

const HEX = /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})(?![0-9a-z])/i;
const COLOR_FUNCTION = /(?:^|[\s,(])((?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix|light-dark)\()/i;

/** Properties a bare word can be a color in. Elsewhere `tan` is a font or a name. */
const TAKES_COLOR = /color|background|border|outline|shadow|fill|stroke|caret|decoration|^--/;

/** Words that parse as a color and name none to paint. */
const NO_COLOR = new Set(["inherit", "initial", "unset", "revert", "revert-layer", "currentcolor"]);

/** The function call that starts at `start`, to its closing bracket, or null where it has none. */
export function callAt(value: string, start: number): string | null {
  let depth = 0;
  for (let at = start; at < value.length; at += 1) {
    if (value[at] === "(") depth += 1;
    else if (value[at] === ")" && --depth === 0) return value.slice(start, at + 1);
  }
  return null;
}

/** A value with every bracketed part taken out, so only its bare words are left. */
function bare(value: string): string {
  let text = value;
  for (let last = ""; last !== text; ) {
    last = text;
    text = text.replace(/[\w-]*\([^()]*\)/g, " ");
  }
  return text;
}

/**
 * The first color a value names, to paint a swatch with: a hex, a color
 * function, or a named color where the property takes one. `supports` is the
 * browser's word on each candidate, so nothing is painted that is no color.
 * One that reads a custom property cannot be painted from here, and is none.
 */
export function colorIn(
  name: string,
  value: string,
  supports: (color: string) => boolean,
): string | null {
  if (value.includes("url(")) return null;
  const candidates: string[] = [];
  const hex = HEX.exec(value);
  if (hex) candidates.push(hex[0]);
  const call = COLOR_FUNCTION.exec(value);
  if (call?.[1]) {
    const found = callAt(value, call.index + call[0].length - call[1].length);
    if (found && !found.includes("var(")) candidates.push(found);
  }
  if (TAKES_COLOR.test(name)) {
    for (const word of bare(value).split(/[\s,/]+/)) {
      if (/^[a-z]+$/i.test(word) && !NO_COLOR.has(word.toLowerCase())) candidates.push(word);
    }
  }
  // The one that comes first in the value, as that is the one the swatch sits by.
  candidates.sort((a, b) => value.indexOf(a) - value.indexOf(b));
  return candidates.find((candidate) => supports(candidate)) ?? null;
}

const WHOLE_VAR = /^var\(\s*(--[^\s,)]+)\s*\)$/;

/**
 * The color a declaration's swatch shows, or null for none: the one its value
 * names, or the one the custom property resolves to where the value is one
 * `var()` and nothing else.
 */
export function swatchOf(
  declaration: Pick<StyleDeclaration, "name" | "value">,
  variables: Record<string, VariableValue>,
  supports: (color: string) => boolean,
): string | null {
  const whole = WHOLE_VAR.exec(declaration.value.trim());
  const value = whole?.[1] ? (variables[whole[1]]?.value ?? "") : declaration.value;
  return colorIn(declaration.name, value, supports);
}
