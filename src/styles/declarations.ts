import { varReferences } from "./varrefs";

/** A declaration as a rule's `cssText` has it. */
export interface Written {
  name: string;
  value: string;
  important: boolean;
}

const IMPORTANT = /!\s*important\s*$/i;

/** Past the string whose quote is at `at`. */
function skipString(text: string, at: number): number {
  const quote = text[at];
  let i = at + 1;
  while (i < text.length && text[i] !== quote) i += text[i] === "\\" ? 2 : 1;
  return i + 1;
}

/**
 * Cut a declaration list at its top-level semicolons, and each declaration at
 * its first colon. A semicolon or colon in a string, a `url()`, any bracket or
 * a comment is part of the value. Comments are dropped.
 */
function split(text: string): { name: string; value: string }[] {
  const found: { name: string; value: string }[] = [];
  let name: string | null = null;
  let piece = "";
  let depth = 0;
  const close = () => {
    if (name !== null && name.trim()) found.push({ name: name.trim(), value: piece.trim() });
    name = null;
    piece = "";
  };
  let i = 0;
  while (i < text.length) {
    const char = text[i] ?? "";
    let end = i + 1;
    if (char === "\\") end = i + 2;
    else if (char === '"' || char === "'") end = skipString(text, i);
    else if (char === "/" && text[i + 1] === "*") {
      const stop = text.indexOf("*/", i + 2);
      i = stop < 0 ? text.length : stop + 2;
      continue;
    } else if (char === "(" || char === "[" || char === "{") depth++;
    else if (char === ")" || char === "]" || char === "}") depth = Math.max(0, depth - 1);
    else if (depth === 0 && char === ";") {
      close();
      i = end;
      continue;
    } else if (depth === 0 && char === ":" && name === null) {
      name = piece;
      piece = "";
      i = end;
      continue;
    }
    piece += text.slice(i, end);
    i = end;
  }
  close();
  return found;
}

/**
 * The declarations of a rule, read back from its `cssText`. That is where the
 * browser keeps a shorthand as one declaration and a `var()` as written, where
 * the declaration's own list of properties has only longhands.
 */
export function parseDeclarations(cssText: string): Written[] {
  return split(cssText).map(({ name, value }) => {
    const important = IMPORTANT.test(value);
    return {
      // A custom property's name is case sensitive. Any other is not.
      name: name.startsWith("--") ? name : name.toLowerCase(),
      value: important ? value.replace(IMPORTANT, "").trim() : value,
      important,
    };
  });
}

/** The custom properties a value reads through `var()`, those in fallbacks too, each once. */
export function variableNames(value: string): string[] {
  return [...new Set(varReferences(value).map((reference) => reference.name))];
}

/** What reading a declaration block takes: the longhands it lists and what each is set to. */
export interface StyleLike {
  readonly cssText: string;
  readonly length: number;
  item(index: number): string;
  getPropertyValue(name: string): string;
}

/** The longhand names a declaration block lists. */
export function listed(style: StyleLike): string[] {
  const names: string[] = [];
  for (let i = 0; i < style.length; i++) {
    const name = style.item(i);
    if (name) names.push(name);
  }
  return names;
}

/**
 * The longhands a written declaration sets. One the block lists by name is a
 * longhand. Any other is a shorthand: `expand` gives all it can set, and those
 * the block lists are the ones it set here. Where `expand` knows nothing, the
 * listed names under the shorthand's own (`margin-top` under `margin`) stand in.
 */
export function longhandsOf(
  name: string,
  names: readonly string[],
  expand: (shorthand: string) => readonly string[],
): string[] {
  if (name.startsWith("--") || names.includes(name)) return [name];
  const known = expand(name).filter((longhand) => names.includes(longhand));
  if (known.length > 0) return known;
  const under = names.filter((longhand) => longhand.startsWith(`${name}-`));
  return under.length > 0 ? under : [name];
}
