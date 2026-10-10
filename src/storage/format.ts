/**
 * How the storage view words what it reads: sizes, one-line previews, json
 * laid out only where that loses nothing, and the values a database holds.
 * Everything here cuts before it works, so a huge value never holds the page.
 */

/** The most of one value the view draws at once, in characters. */
export const RENDER_LIMIT = 100_000;

/** The most of one value "show all" draws. Past it, a value can only be copied. */
export const SHOW_ALL_LIMIT = 1_000_000;

/** How long a one-line preview is at most, in characters. */
export const PREVIEW_LENGTH = 96;

/** How many bytes a text takes as UTF-8, as the browser counts a stored value's weight. */
export function byteSize(text: string): number {
  let bytes = 0;
  for (let at = 0; at < text.length; at++) {
    const code = text.charCodeAt(at);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code < 0xdc00 && (text.charCodeAt(at + 1) & 0xfc00) === 0xdc00) {
      // A pair of surrogates is one character of four bytes.
      bytes += 4;
      at++;
    } else bytes += 3;
  }
  return bytes;
}

/** A size as it is said: `12 B`, `3.4 KB`, `1.2 MB`. */
export function sizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let size = bytes / 1024;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit++;
  }
  return `${size >= 100 ? Math.round(size) : Math.round(size * 10) / 10} ${units[unit]}`;
}

/**
 * A value on one line, cut in the middle where it is long, so both its start
 * and its end show. Only the ends of a long value are read.
 */
export function preview(text: string, max = PREVIEW_LENGTH): string {
  const half = Math.floor((max - 1) / 2);
  const flat = (part: string) => part.replace(/\s+/g, " ");
  if (text.length <= max) {
    const whole = flat(text).trim();
    if (whole.length <= max) return whole;
  }
  // A few more than a half of each end, as runs of white space fold to one.
  const head = flat(text.slice(0, half * 4)).trimStart().slice(0, half);
  const tail = flat(text.slice(-half * 4)).trimEnd().slice(-half);
  return `${head}…${tail}`;
}

/** A text with every space, tab and line break outside its json strings taken out. */
function compact(text: string): string {
  let out = "";
  let inString = false;
  for (let at = 0; at < text.length; at++) {
    const char = text.charAt(at);
    if (inString) {
      out += char;
      if (char === "\\") out += text.charAt(++at);
      else if (char === '"') inString = false;
    } else if (char === '"') {
      inString = true;
      out += char;
    } else if (char !== " " && char !== "\n" && char !== "\t" && char !== "\r") out += char;
  }
  return out;
}

/**
 * A json object or array laid out over lines, or null where the text is to be
 * shown as it is. It is laid out only where that loses nothing: the text,
 * less its white space, is exactly what the parsed value writes back. So a
 * number too long for a double, a key said twice, or keys the engine would
 * reorder all stay raw. A value past `RENDER_LIMIT` is never parsed.
 */
export function pretty(text: string): string | null {
  if (text.length > RENDER_LIMIT) return null;
  const first = text.trimStart().charAt(0);
  if (first !== "{" && first !== "[") return null;
  try {
    const parsed: unknown = JSON.parse(text);
    if (JSON.stringify(parsed) !== compact(text)) return null;
    return JSON.stringify(parsed, null, 2);
  } catch {
    return null;
  }
}

/** Whether a text reads as json at all, an object, an array or a plain value. */
export function isJson(text: string): boolean {
  if (text.length > SHOW_ALL_LIMIT) return false;
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

/** Whether a text looks meant as a json object or array, by how it starts. */
export function looksJson(text: string): boolean {
  const first = text.trimStart().charAt(0);
  return first === "{" || first === "[";
}

/** What of a value the view draws, and how much it left out. */
export interface Shown {
  text: string;
  /** Characters past the cut, 0 where all of it shows. */
  more: number;
  /** False past `SHOW_ALL_LIMIT`, where the rest can only be copied. */
  canShowAll: boolean;
}

/** A value cut to what the view draws at once, or with `all` to what it draws at most. */
export function shown(text: string, all = false): Shown {
  const limit = all ? SHOW_ALL_LIMIT : RENDER_LIMIT;
  if (text.length <= limit) return { text, more: 0, canShowAll: false };
  return {
    text: text.slice(0, limit),
    more: text.length - limit,
    canShowAll: !all && text.length <= SHOW_ALL_LIMIT,
  };
}

const SPANS: readonly [unit: string, ms: number][] = [
  ["year", 31_536_000_000],
  ["month", 2_592_000_000],
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
  ["second", 1000],
];

/** How far a time is from now, in its largest whole unit: `in 3 days`, `2 hours ago`. */
export function relative(at: number, now: number): string {
  const gap = at - now;
  const size = Math.abs(gap);
  for (const [unit, ms] of SPANS) {
    if (size < ms) continue;
    const count = Math.floor(size / ms);
    const words = `${count} ${unit}${count === 1 ? "" : "s"}`;
    return gap >= 0 ? `in ${words}` : `${words} ago`;
  }
  return "now";
}

/** How much of a database's value is written out before it is cut. */
export const DESCRIBE_LIMIT = 20_000;

/**
 * A value a database holds, as text that reads like json: dates, blobs,
 * bytes, maps and sets by what they are. A value that holds itself is cut at
 * the loop, and a huge one once `limit` characters are written. With `indent`
 * it goes over lines.
 */
export function describe(value: unknown, indent = false, limit = DESCRIBE_LIMIT): string {
  let room = limit;
  const seen = new Set<object>();

  function leaf(item: unknown): string | null {
    if (item === null) return "null";
    if (item === undefined) return "undefined";
    if (typeof item === "string") return JSON.stringify(item.length > room ? `${item.slice(0, Math.max(room, 0))}…` : item);
    if (typeof item === "number" || typeof item === "boolean") return String(item);
    if (typeof item === "bigint") return `${item}n`;
    if (typeof item !== "object") return typeof item;
    if (item instanceof Date) {
      return Number.isNaN(item.getTime()) ? "Date invalid" : `Date ${item.toISOString()}`;
    }
    if (typeof Blob !== "undefined" && item instanceof Blob) {
      const kind = typeof File !== "undefined" && item instanceof File ? "File" : "Blob";
      return `${kind} ${sizeLabel(item.size)}${item.type ? ` ${item.type}` : ""}`;
    }
    if (item instanceof ArrayBuffer) return `bytes ${sizeLabel(item.byteLength)}`;
    if (ArrayBuffer.isView(item)) return `bytes ${sizeLabel(item.byteLength)}`;
    if (item instanceof RegExp) return String(item);
    return null;
  }

  function walk(item: unknown, depth: number): string {
    if (room <= 0) return "…";
    const plain = leaf(item);
    if (plain !== null) {
      room -= plain.length;
      return plain;
    }
    if (typeof item !== "object" || item === null) return "…";
    if (seen.has(item)) return "(cycle)";
    seen.add(item);
    const pad = indent ? `\n${"  ".repeat(depth + 1)}` : "";
    const end = indent ? `\n${"  ".repeat(depth)}` : "";
    const parts: string[] = [];
    let open = "{";
    let close = "}";
    const add = (part: string): boolean => {
      room -= part.length + 2;
      parts.push(part);
      return room > 0;
    };
    if (Array.isArray(item)) {
      open = "[";
      close = "]";
      for (const child of item) if (!add(walk(child, depth + 1))) break;
      if (parts.length < item.length) parts.push("…");
    } else if (item instanceof Map) {
      open = "Map {";
      for (const [key, child] of item) {
        if (!add(`${walk(key, depth + 1)} => ${walk(child, depth + 1)}`)) break;
      }
      if (parts.length < item.size) parts.push("…");
    } else if (item instanceof Set) {
      open = "Set [";
      close = "]";
      for (const child of item) if (!add(walk(child, depth + 1))) break;
      if (parts.length < item.size) parts.push("…");
    } else {
      const keys = Object.keys(item);
      for (const key of keys) {
        const child: unknown = Reflect.get(item, key);
        if (!add(`${JSON.stringify(key)}:${indent ? " " : ""}${walk(child, depth + 1)}`)) break;
      }
      if (parts.length < keys.length) parts.push("…");
    }
    seen.delete(item);
    if (parts.length === 0) return `${open}${close}`;
    return `${open}${pad}${parts.join(`,${pad || " "}`)}${end}${close}`;
  }

  return walk(value, 0);
}
