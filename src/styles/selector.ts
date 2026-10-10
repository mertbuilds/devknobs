import type { Specificity } from "./types";

/** Pseudo-elements that CSS 2 wrote with one colon, and browsers still take that way. */
const LEGACY = new Set(["before", "after", "first-line", "first-letter"]);

/** Pseudo-classes that weigh as much as the heaviest selector in their brackets. */
const HEAVIEST = new Set(["is", "not", "has", "matches", "-webkit-any", "-moz-any"]);

const HEX = /[0-9a-f]/i;

function isIdentChar(char: string): boolean {
  return /[\w-]/.test(char) || char > "\u007f";
}

/** Past an escape that starts at `at`: a backslash and a character, or up to six hex digits. */
function skipEscape(text: string, at: number): number {
  let i = at + 1;
  if (!HEX.test(text[i] ?? "")) return i + 1;
  for (let count = 0; count < 6 && HEX.test(text[i] ?? ""); count++) i++;
  return text[i] === " " ? i + 1 : i;
}

function skipIdent(text: string, at: number): number {
  let i = at;
  while (i < text.length) {
    const char = text[i] ?? "";
    if (char === "\\") i = skipEscape(text, i);
    else if (isIdentChar(char)) i++;
    else break;
  }
  return i;
}

/** Past the string whose quote is at `at`. */
function skipString(text: string, at: number): number {
  const quote = text[at];
  let i = at + 1;
  while (i < text.length && text[i] !== quote) i += text[i] === "\\" ? 2 : 1;
  return i + 1;
}

/** Past the bracket that opens at `at`, round or square, and all it holds. */
function skipBlock(text: string, at: number): number {
  let depth = 0;
  let i = at;
  while (i < text.length) {
    const char = text[i];
    if (char === "\\") {
      i += 2;
      continue;
    }
    if (char === '"' || char === "'") {
      i = skipString(text, i);
      continue;
    }
    if (char === "(" || char === "[") depth++;
    else if (char === ")" || char === "]") depth--;
    i++;
    if (depth === 0) break;
  }
  return i;
}

/** Split a selector list on its top-level commas, past strings, brackets and escapes. */
export function splitList(text: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let i = 0;
  while (i < text.length) {
    const char = text[i];
    if (char === "\\") i += 2;
    else if (char === '"' || char === "'") i = skipString(text, i);
    else if (char === "(" || char === "[") i = skipBlock(text, i);
    else {
      if (char === ",") {
        parts.push(text.slice(start, i));
        start = i + 1;
      }
      i++;
    }
  }
  parts.push(text.slice(start));
  return parts.map((part) => part.trim()).filter((part) => part.length > 0);
}

/** A pseudo-class or pseudo-element at the top level of a selector. */
interface Pseudo {
  start: number;
  end: number;
  /** Lower case, without its colons. */
  name: string;
  /** What its brackets hold, or null when it has none. */
  args: string | null;
  element: boolean;
}

/** The pseudo that starts at the colon at `at`. */
function readPseudo(text: string, at: number): Pseudo {
  const double = text[at + 1] === ":";
  const nameStart = at + (double ? 2 : 1);
  const nameEnd = skipIdent(text, nameStart);
  const name = text.slice(nameStart, nameEnd).toLowerCase();
  let end = nameEnd;
  let args: string | null = null;
  if (text[nameEnd] === "(") {
    end = skipBlock(text, nameEnd);
    args = text.slice(nameEnd + 1, text[end - 1] === ")" ? end - 1 : end).trim();
  }
  return { start: at, end, name, args, element: double || (args === null && LEGACY.has(name)) };
}

function add(a: Specificity, b: Specificity): Specificity {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

/** Above zero when `a` is the more specific, below when `b` is. */
export function compareSpecificity(a: Specificity, b: Specificity): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

/** The most specific selector of a list decides, as it does for `:is()`. */
function heaviest(list: string): Specificity {
  let best: Specificity = [0, 0, 0];
  for (const selector of splitList(list)) {
    const found = specificity(selector);
    if (compareSpecificity(found, best) > 0) best = found;
  }
  return best;
}

function pseudoWeight(pseudo: Pseudo): Specificity {
  const { name, args } = pseudo;
  if (pseudo.element) {
    // `::slotted(.a)` weighs as a pseudo-element and what it is handed.
    return name === "slotted" && args ? add([0, 0, 1], specificity(args)) : [0, 0, 1];
  }
  if (args === null) return [0, 1, 0];
  if (name === "where") return [0, 0, 0];
  if (HEAVIEST.has(name)) return heaviest(args);
  if (name === "nth-child" || name === "nth-last-child") {
    const of = args.search(/\sof\s/i);
    return of < 0 ? [0, 1, 0] : add([0, 1, 0], heaviest(args.slice(of + 4)));
  }
  if (name === "host" || name === "host-context") return add([0, 1, 0], heaviest(args));
  return [0, 1, 0];
}

/**
 * A selector's specificity. A nested `&` is taken to be resolved by now (see
 * `resolveNesting`): one still here stands for nothing and weighs nothing.
 */
export function specificity(selector: string): Specificity {
  let total: Specificity = [0, 0, 0];
  let i = 0;
  while (i < selector.length) {
    const char = selector[i] ?? "";
    if (char === "#") {
      total = add(total, [1, 0, 0]);
      i = skipIdent(selector, i + 1);
    } else if (char === ".") {
      total = add(total, [0, 1, 0]);
      i = skipIdent(selector, i + 1);
    } else if (char === "[") {
      total = add(total, [0, 1, 0]);
      i = skipBlock(selector, i);
    } else if (char === ":") {
      const pseudo = readPseudo(selector, i);
      total = add(total, pseudoWeight(pseudo));
      i = Math.max(pseudo.end, i + 1);
    } else if (char === "\\" || (isIdentChar(char) && !/[\d]/.test(char))) {
      const end = Math.max(skipIdent(selector, i), i + 1);
      // `svg|rect`: the namespace before the bar is not a type of its own.
      const namespace = selector[end] === "|" && selector[end + 1] !== "|";
      if (!namespace) total = add(total, [0, 0, 1]);
      i = end;
    } else {
      i++;
    }
  }
  return total;
}

/** The top-level pseudos of a selector, and where its last compound starts. */
function scan(selector: string): { pseudos: Pseudo[]; combinators: number[] } {
  const pseudos: Pseudo[] = [];
  const combinators: number[] = [];
  let i = 0;
  while (i < selector.length) {
    const char = selector[i] ?? "";
    if (char === "\\") i += 2;
    else if (char === "[" || char === "(") i = skipBlock(selector, i);
    else if (char === ":") {
      const pseudo = readPseudo(selector, i);
      pseudos.push(pseudo);
      i = Math.max(pseudo.end, i + 1);
    } else {
      if (/[\s>+~]/.test(char)) combinators.push(i);
      i++;
    }
  }
  return { pseudos, combinators };
}

function isEdge(char: string | undefined): boolean {
  return char === undefined || /[\s>+~]/.test(char);
}

/** The selector without the stretch from `start` to `end`. A compound left empty reads `*`. */
function cut(selector: string, start: number, end: number): string {
  const empty = isEdge(selector[start - 1]) && isEdge(selector[end]);
  return `${selector.slice(0, start)}${empty ? "*" : ""}${selector.slice(end)}`;
}

/** A pseudo-element's name as it is compared: two colons, lower case, its brackets kept. */
export function normalizePseudo(pseudo: string): string {
  const text = pseudo.trim();
  const colons = text.startsWith("::") ? 2 : text.startsWith(":") ? 1 : 0;
  const open = text.indexOf("(");
  const name = (open < 0 ? text : text.slice(0, open)).slice(colons).toLowerCase();
  return `::${name}${open < 0 ? "" : text.slice(open)}`;
}

/** A selector taken apart for `Element.matches`, which takes none with a pseudo-element in it. */
export interface Subject {
  /** The selector without its pseudo-elements, to hand to `matches`. */
  match: string;
  /** The pseudo-element it styles, as `::before`, or null for the element itself. */
  pseudo: string | null;
  /** What `::slotted()` holds: `match` then names the slot, and this the element in it. */
  slotted: string | null;
  /**
   * For a selector that is the shadow host alone, `:host(.open):hover` say: the
   * same test written for the host as seen from outside, where `:host` matches nothing.
   */
  host: string | null;
}

/** `:host` written so that `matches` on the host itself answers it. */
function hostForm(selector: string): string | null {
  const { pseudos, combinators } = scan(selector);
  const hosts = pseudos.filter(({ name }) => name === "host" || name === "host-context");
  if (hosts.length === 0 || combinators.length > 0) return null;
  let next = selector;
  for (const host of hosts.reverse()) {
    let own = ":scope";
    if (host.args !== null && host.name === "host") own = `:scope:is(${host.args})`;
    // An ancestor in the tree the host is in. One past a shadow root above is not seen.
    if (host.args !== null && host.name === "host-context") {
      own = `:scope:is(${host.args}, :is(${host.args}) *)`;
    }
    next = `${next.slice(0, host.start)}${own}${next.slice(host.end)}`;
  }
  return next;
}

export function parseSubject(selector: string): Subject {
  const text = selector.trim();
  const elements = scan(text).pseudos.filter((pseudo) => pseudo.element);
  let match = text;
  let pseudo: string | null = null;
  let slotted: string | null = null;
  for (const found of elements.reverse()) {
    if (found.name === "slotted" && found.args !== null) slotted = found.args;
    else pseudo ??= normalizePseudo(text.slice(found.start, found.end));
    match = cut(match, found.start, found.end);
  }
  return { match, pseudo, slotted, host: slotted === null ? hostForm(match) : null };
}

/** Does the selector name its parent rule with `&`, outside of strings and attributes? */
export function hasNesting(selector: string): boolean {
  let i = 0;
  while (i < selector.length) {
    const char = selector[i];
    if (char === "\\") i += 2;
    else if (char === "[") i = skipBlock(selector, i);
    else if (char === '"' || char === "'") i = skipString(selector, i);
    else if (char === "&") return true;
    else i++;
  }
  return false;
}

function replaceNesting(selector: string, parent: string): string {
  let next = "";
  let i = 0;
  while (i < selector.length) {
    const char = selector[i] ?? "";
    let end = i + 1;
    if (char === "\\") end = i + 2;
    else if (char === "[") end = skipBlock(selector, i);
    else if (char === '"' || char === "'") end = skipString(selector, i);
    next += char === "&" ? parent : selector.slice(i, end);
    i = end;
  }
  return next;
}

/**
 * A nested rule's selector as one that stands alone. Its `&` is the parent
 * rule's selector list, in `:is()` so it weighs as its heaviest. Without `&`
 * the selector is relative, and the parent goes in front. With no parent rule
 * `&` is the scoping root.
 */
export function resolveNesting(selector: string, parent: string | null): string {
  const text = selector.trim();
  const stands = parent === null ? ":scope" : `:is(${parent})`;
  if (hasNesting(text)) return replaceNesting(text, stands);
  if (parent === null) return text;
  return `${stands} ${text}`;
}
