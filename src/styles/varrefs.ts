/**
 * The custom properties a value reads through `var()`, found the way css
 * reads the value: a string, a comment and a bare `url()` are skipped whole,
 * so text in them that looks like a call is none. To use it:
 *
 *   varReferences("calc(var(--a) + var(--b, var(--c, 4px)))");   // --a, --b, --c
 *   resolveVars("var(--gap, 4px)", (name) => seen[name] ?? "");  // "4px"
 *
 * Nothing here touches the page.
 */

/** One `var()` of a value. */
export interface VarReference {
  /** Where the whole call starts in the value, and where it ends, past its bracket. */
  start: number;
  end: number;
  /** The custom property's name as written. Its case counts. */
  name: string;
  /** Where the name starts in the value. */
  at: number;
  /** What stands after the first comma, as written, or null where the call has none. */
  fallback: string | null;
  /** Its bracket closes. One the value's end leaves open is still read, as css reads it. */
  closed: boolean;
}

const SPACE = /\s/;
/** What an identifier is made of, so `no-var(` and `\var(` are no call of `var`. */
const IDENT = /[\w\-\\\u0080-￿]/;

/** Past the string whose quote is at `at`. */
function pastString(value: string, at: number): number {
  const quote = value[at];
  let i = at + 1;
  while (i < value.length && value[i] !== quote) i += value[i] === "\\" ? 2 : 1;
  return Math.min(i + 1, value.length);
}

/** Whether a function of this name is called at `at`, in any case, and is not the end of a longer name. */
function calls(value: string, at: number, name: string): boolean {
  if (value.slice(at, at + name.length + 1).toLowerCase() !== `${name}(`) return false;
  return at === 0 || !IDENT.test(value[at - 1] ?? "");
}

/**
 * Past what css reads as one piece at `at`: an escape, a string, a comment or
 * a `url()` with no quotes. Where none starts there, `at` itself.
 */
function past(value: string, at: number): number {
  const char = value[at];
  if (char === "\\") return Math.min(at + 2, value.length);
  if (char === '"' || char === "'") return pastString(value, at);
  if (char === "/" && value[at + 1] === "*") {
    const stop = value.indexOf("*/", at + 2);
    return stop < 0 ? value.length : stop + 2;
  }
  if (!calls(value, at, "url")) return at;
  let i = at + 4;
  while (i < value.length && SPACE.test(value[i] ?? "")) i++;
  // A quoted address is a string, which is skipped as one.
  if (value[i] === '"' || value[i] === "'") return at;
  while (i < value.length && value[i] !== ")") i += value[i] === "\\" ? 2 : 1;
  return Math.min(i + 1, value.length);
}

/** Past the spaces and comments from `at` on. */
function pastSpace(value: string, at: number): number {
  let i = at;
  while (i < value.length) {
    if (SPACE.test(value[i] ?? "")) i++;
    else if (value[i] === "/" && value[i + 1] === "*") i = past(value, i);
    else break;
  }
  return i;
}

/** Where the bracket that is open at `from` closes, or the value's end for one left open. */
function closeOf(value: string, from: number): number {
  let depth = 1;
  let i = from;
  while (i < value.length) {
    const next = past(value, i);
    if (next > i) {
      i = next;
      continue;
    }
    if (value[i] === "(") depth++;
    else if (value[i] === ")" && --depth === 0) return i;
    i++;
  }
  return value.length;
}

/** A value with its comments taken out. */
function plain(value: string): string {
  let text = "";
  let i = 0;
  while (i < value.length) {
    const next = past(value, i);
    const comment = value[i] === "/" && value[i + 1] === "*";
    if (!comment) text += value.slice(i, Math.max(next, i + 1));
    i = Math.max(next, i + 1);
  }
  return text;
}

/** The `var()` that starts at `start`, or null where what is there reads no custom property. */
function referenceAt(value: string, start: number): VarReference | null {
  const at = pastSpace(value, start + 4);
  if (!value.startsWith("--", at)) return null;
  let stop = at;
  while (stop < value.length) {
    const char = value[stop] ?? "";
    if (SPACE.test(char) || char === "," || char === ")") break;
    if (char === "/" && value[stop + 1] === "*") break;
    stop += char === "\\" ? 2 : 1;
  }
  stop = Math.min(stop, value.length);
  const name = value.slice(at, stop);
  // `--` alone names no property.
  if (name.length < 3) return null;
  const after = pastSpace(value, stop);
  if (after >= value.length || value[after] === ")") {
    const closed = after < value.length;
    return { start, end: closed ? after + 1 : value.length, name, at, fallback: null, closed };
  }
  if (value[after] !== ",") return null;
  const close = closeOf(value, after + 1);
  const fallback = plain(value.slice(after + 1, close)).trim();
  const closed = close < value.length;
  return { start, end: closed ? close + 1 : value.length, name, at, fallback, closed };
}

/**
 * Every `var()` of a value in the order they start, those in a fallback
 * after the one whose fallback it is.
 */
export function varReferences(value: string): VarReference[] {
  const found: VarReference[] = [];
  let i = 0;
  while (i < value.length) {
    const next = past(value, i);
    if (next > i) {
      i = next;
      continue;
    }
    const reference = calls(value, i, "var") ? referenceAt(value, i) : null;
    if (reference) found.push(reference);
    // On from the name, so a `var()` in the fallback is found in its turn.
    i = reference ? reference.at + reference.name.length : i + 1;
  }
  return found;
}

/**
 * A value with each `var()` put as what `read` says its property is, an
 * empty answer being one that is not set, which comes to its fallback. Null
 * where one is not set and has no fallback to come to, or is left open.
 */
export function resolveVars(value: string, read: (name: string) => string): string | null {
  let text = "";
  let at = 0;
  for (const reference of varReferences(value)) {
    // One inside a fallback, which the call around it has settled.
    if (reference.start < at) continue;
    if (!reference.closed) return null;
    const seen = read(reference.name);
    const comes =
      seen !== ""
        ? seen
        : reference.fallback === null
          ? null
          : resolveVars(reference.fallback, read);
    if (comes === null) return null;
    text += value.slice(at, reference.start) + comes;
    at = reference.end;
  }
  return text + value.slice(at);
}
