/**
 * Where a jsx element is written, found in the source itself. A dev server can
 * hand out a source map that is off, as a route split from its file is, and
 * then the map has no place for the call, or a wrong one.
 */

/** A place in a text. The line counts from 1 and the column from 0, as a source map's do. */
export interface Place {
  line: number;
  column: number;
}

const NAME_CHAR = /[\w$.-]/;

/** Characters a type argument follows, as in `useState<Row>`, and a jsx tag never does. */
const BEFORE_TYPE = /[\w$.)\]]/;

function lineStarts(text: string): number[] {
  const starts = [0];
  for (let index = text.indexOf("\n"); index !== -1; index = text.indexOf("\n", index + 1)) {
    starts.push(index + 1);
  }
  return starts;
}

function offsetOf(starts: number[], place: Place): number {
  const start = starts[place.line - 1];
  return start === undefined ? -1 : start + place.column;
}

function placeOf(starts: number[], offset: number): Place {
  let line = starts.length;
  while (line > 1 && (starts[line - 1] ?? 0) > offset) line -= 1;
  return { line, column: offset - (starts[line - 1] ?? 0) };
}

function opens(content: string, offset: number, tag: string | null): boolean {
  if (offset < 0 || content[offset] !== "<") return false;
  if (tag === null) return true;
  const after = content[offset + 1 + tag.length];
  return content.startsWith(tag, offset + 1) && (after === undefined || !NAME_CHAR.test(after));
}

/** A jsx tag opens at the place. With a `tag`, that very tag. */
export function opensAt(content: string, place: Place, tag: string | null = null): boolean {
  return opens(content, offsetOf(lineStarts(content), place), tag);
}

/** Every place `<tag` is written in the source, in its order. */
export function tagPlaces(content: string, tag: string): Place[] {
  const starts = lineStarts(content);
  const places: Place[] = [];
  const open = `<${tag}`;
  for (let at = content.indexOf(open); at !== -1; at = content.indexOf(open, at + 1)) {
    const before = content[at - 1];
    if (!opens(content, at, tag) || (before !== undefined && BEFORE_TYPE.test(before))) continue;
    places.push(placeOf(starts, at));
  }
  return places;
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

interface Call {
  start: number;
  /** Just past the tag, inside the call's parentheses. */
  end: number;
  open: number;
}

/** The calls that make `tag` in transformed code: `jsxDEV("h1", ...)` or `jsxDEV(Row, ...)`. */
function jsxCalls(code: string, tag: string, host: boolean): Call[] {
  const name = host ? `["']${escape(tag)}["']` : escape(tag);
  const pattern = new RegExp(`[\\w$.]*jsxs?(?:DEV)?\\(\\s*${name}\\s*,`, "g");
  return Array.from(code.matchAll(pattern), (match) => ({
    start: match.index,
    end: match.index + match[0].length,
    open: match.index + match[0].indexOf("("),
  }));
}

function stringEnd(code: string, start: number): number {
  const quote = code[start];
  for (let index = start + 1; index < code.length; index++) {
    const char = code[index];
    if (char === "\\") index += 1;
    else if (char === quote) return index;
    else if (quote === "`" && char === "$" && code[index + 1] === "{") {
      index = closeOf(code, index + 1);
      if (index === -1) return -1;
    } else if (quote !== "`" && char === "\n") return -1;
  }
  return -1;
}

/** The bracket that closes the one at `open`, past strings and comments. */
function closeOf(code: string, open: number): number {
  let depth = 0;
  for (let index = open; index < code.length; index++) {
    const char = code[index];
    if (char === '"' || char === "'" || char === "`") {
      index = stringEnd(code, index);
    } else if (char === "/" && code[index + 1] === "/") {
      index = code.indexOf("\n", index);
    } else if (char === "/" && code[index + 1] === "*") {
      const end = code.indexOf("*/", index + 2);
      index = end === -1 ? -1 : end + 1;
    } else if (char === "(" || char === "[" || char === "{") {
      depth += 1;
    } else if (char === ")" || char === "]" || char === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
    if (index === -1) return -1;
  }
  return -1;
}

/** The dev transform's own note of where the element is, the call's last argument but one. */
const DECLARED = /lineNumber:\s*(\d+)\s*,\s*columnNumber:\s*(\d+)\s*,?\s*\}\s*,\s*[\w$.]+\s*$/;

function declaredPlace(code: string, call: Call): Place | null {
  const close = closeOf(code, call.open);
  if (close === -1) return null;
  const match = DECLARED.exec(code.slice(call.end, close));
  return match ? { line: Number(match[1]), column: Number(match[2]) } : null;
}

/**
 * The place `<tag` is written in `content`, for the jsx call at `call` in the
 * transformed `code`. A tag written once is that one. Among several, the dev
 * transform's notes of line and column put the calls in the source's order,
 * even when the lines they name are off, and the call's rank picks the place.
 * Null when the calls and the tags do not pair up.
 */
export function locateJsx(
  content: string,
  tag: string,
  host: boolean,
  code: string | null,
  call: Place | null,
): Place | null {
  const places = tagPlaces(content, tag);
  if (places.length === 1) return places[0] ?? null;
  if (places.length === 0 || !code || !call) return null;
  const calls = jsxCalls(code, tag, host);
  if (calls.length !== places.length) return null;
  const offset = offsetOf(lineStarts(code), call);
  const own = calls.findIndex((item) => item.start <= offset && offset < item.end);
  if (own === -1) return null;
  const declared = calls.map((item) => declaredPlace(code, item));
  const mine = declared[own];
  if (!mine || declared.some((place) => place === null)) return null;
  const rank = declared.filter(
    (place) =>
      place !== null &&
      (place.line < mine.line || (place.line === mine.line && place.column < mine.column)),
  ).length;
  return places[rank] ?? null;
}
