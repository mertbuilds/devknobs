import {
  BODY_CAP,
  type BodyRecord,
  type HeaderList,
  type RequestEntry,
  type RequestSizes,
} from "../requests/types";

/**
 * How a request reads: in a row of the requests view, in its detail, and as
 * the text that is copied for an AI. All of it from the row alone, so none of
 * it needs a page.
 */

/** Why a light row says less, in the words its tooltip and its detail use. */
export const LIGHT_WHY = "the browser gives a page only timing and size for this";

/** What a hidden header's value is copied as. */
export const HIDDEN = "<hidden>";

/** How much of a query a row shows, in characters, the `?` included. */
export const QUERY_MAX = 16;

/** A body past this many characters starts folded away. */
export const LONG_BODY = 2000;

/** How near its start a list counts as scrolled to it, in px. */
export const STICK_SLACK = 4;

/** `text` cut to `max` characters, the cut in its middle, where both ends tell more. */
export function middle(text: string, max: number): string {
  const chars = [...text];
  if (chars.length <= max) return text;
  const head = Math.ceil((max - 1) / 2);
  const tail = max - 1 - head;
  return `${chars.slice(0, head).join("")}…${tail > 0 ? chars.slice(-tail).join("") : ""}`;
}

/**
 * What a row calls an address: its last path segment, or its host where
 * there is no path, and its query apart, as that is shown quieter.
 */
export function urlName(url: string): { name: string; query: string } {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { name: url, query: "" };
  }
  // An address that holds its own content names only what kind that is.
  if (parsed.protocol === "data:") return { name: `data:${parsed.pathname.split(/[;,]/, 1)[0]}`, query: "" };
  const segments = parsed.pathname.split("/").filter((segment) => segment !== "");
  const last = segments[segments.length - 1];
  const folder = last !== undefined && parsed.pathname.endsWith("/") ? "/" : "";
  return { name: last === undefined ? parsed.host : `${last}${folder}`, query: parsed.search };
}

const EXTENSIONS: Record<string, string> = {
  css: "css",
  js: "js",
  mjs: "js",
  woff: "font",
  woff2: "font",
  ttf: "font",
  otf: "font",
  png: "img",
  jpg: "img",
  jpeg: "img",
  gif: "img",
  webp: "img",
  avif: "img",
  svg: "img",
  ico: "img",
  mp4: "media",
  webm: "media",
  mp3: "media",
};

/** What Resource Timing says loaded a thing, as the kind of thing that most often is. */
const INITIATORS: Record<string, string> = {
  img: "img",
  image: "img",
  script: "js",
  css: "css",
  iframe: "frame",
  video: "media",
  audio: "media",
  fetch: "fetch",
  xmlhttprequest: "xhr",
};

function typeKind(type: string): string {
  if (/^image\//i.test(type)) return "img";
  if (/^text\/css/i.test(type)) return "css";
  if (/(java|ecma)script/i.test(type)) return "js";
  if (/^font\//i.test(type)) return "font";
  return /^(video|audio)\//i.test(type) ? "media" : "";
}

function extensionKind(url: string): string {
  try {
    const extension = /\.([a-z0-9]+)$/i.exec(new URL(url).pathname)?.[1] ?? "";
    return EXTENSIONS[extension.toLowerCase()] ?? "";
  } catch {
    return "";
  }
}

/**
 * The kind of thing a request is for, in a short word: `fetch` and `xhr` for
 * a script's, `doc` for the page itself, and for what the page loads on its
 * own what its type, its address or its loader says it is.
 */
export function kindLabel(entry: RequestEntry): string {
  if (entry.kind === "fetch" || entry.kind === "xhr") return entry.kind;
  if (entry.kind === "navigation") return "doc";
  return (
    typeKind(entry.contentType) ||
    extensionKind(entry.url) ||
    INITIATORS[entry.initiatorType] ||
    entry.initiatorType.slice(0, 6) ||
    "other"
  );
}

const SHORT_METHODS: Record<string, string> = { DELETE: "DEL", OPTIONS: "OPT", CONNECT: "CONN" };

/** What a row starts with: the method, kept short, or the kind where the browser gives no method. */
export function methodLabel(entry: RequestEntry): string {
  if (entry.detail === "light" || entry.method === "") return kindLabel(entry);
  return SHORT_METHODS[entry.method] ?? entry.method.slice(0, 5);
}

/**
 * A row's status: the number, or a word where there is none. Empty where the
 * request went well and the browser does not say with what.
 */
export function statusLabel(entry: RequestEntry): string {
  if (entry.state === "pending" || entry.state === "aborted") return entry.state;
  if (entry.status === 0) return "opaque";
  if (entry.status !== null) return String(entry.status);
  return entry.state === "failed" ? "failed" : "";
}

/** A request that got no answer, or one of 400 or above. */
export function statusHot(entry: RequestEntry): boolean {
  return entry.state === "failed" || (entry.status !== null && entry.status >= 400);
}

/** A time span: whole ms under a second, seconds to one decimal from there. Empty for none. */
export function durationLabel(ms: number | null): string {
  if (ms === null) return "";
  const whole = Math.round(ms);
  return whole < 1000 ? `${whole}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function decimal(value: number): string {
  return value.toFixed(1).replace(/\.0$/, "");
}

/** A size in bytes, as `512 bytes`, `1.5 KB` or `2 MB`. */
export function bytesLabel(bytes: number): string {
  if (bytes < 1024) return bytes === 1 ? "1 byte" : `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${decimal(bytes / 1024)} KB`;
  return `${decimal(bytes / (1024 * 1024))} MB`;
}

/**
 * What came over the wire and how big the body is, or why that is not known.
 * It reads on from the word size: `size: hidden by the server`.
 */
export function sizeLabel(sizes: RequestSizes): string {
  if (sizes.hidden) return "hidden by the server";
  const body = `${bytesLabel(sizes.decoded)} of body`;
  return sizes.transfer === 0 ? `nothing over the wire, ${body}` : `${bytesLabel(sizes.transfer)} over the wire, ${body}`;
}

function two(value: number, width = 2): string {
  return String(value).padStart(width, "0");
}

/** The time of day a date reads, to the ms, as `14:03:07.120`. */
export function clockTime(
  date: Pick<Date, "getHours" | "getMinutes" | "getSeconds" | "getMilliseconds">,
): string {
  return `${two(date.getHours())}:${two(date.getMinutes())}:${two(date.getSeconds())}.${two(date.getMilliseconds(), 3)}`;
}

/** The rows a chip keeps: all of them, a script's own, or what the page loads by itself. */
export type Chip = "all" | "script" | "other";

export const CHIPS: readonly { id: Chip; label: string }[] = [
  { id: "all", label: "all" },
  { id: "script", label: "fetch/xhr" },
  { id: "other", label: "other" },
];

/** A request a script made, a light row of one included. */
function scripted(entry: RequestEntry): boolean {
  if (entry.kind === "fetch" || entry.kind === "xhr") return true;
  return entry.initiatorType === "fetch" || entry.initiatorType === "xmlhttprequest";
}

/**
 * Does a row show under a chip and a filter? Every word of the filter has to
 * be in its address, its method or its status, in any case.
 */
export function matches(entry: RequestEntry, filter: string, chip: Chip): boolean {
  if (chip !== "all" && scripted(entry) !== (chip === "script")) return false;
  const words = filter.toLowerCase().split(/\s+/).filter((word) => word !== "");
  if (words.length === 0) return true;
  const text = `${entry.method} ${entry.url} ${statusLabel(entry)} ${entry.status ?? ""}`.toLowerCase();
  return words.every((word) => text.includes(word));
}

/** Is a box scrolled to its start, so that it stays there as rows go in above? */
export function atTop(scrollTop: number): boolean {
  return scrollTop <= STICK_SLACK;
}

/** Which row of a list is the first in view, its rows `pitch` px apart, top to top. */
export function firstInView(scrollTop: number, pitch: number): number {
  return pitch > 0 ? Math.floor(Math.max(0, scrollTop) / pitch) : 0;
}

/**
 * Where to scroll a list so that what shows stays still, once `added` rows
 * of `pitch` px went in above it: on by their height, no more. Rows that
 * left from above, a negative `added`, bring it back as far.
 */
export function keptScroll(scrollTop: number, added: number, pitch: number): number {
  return Math.max(0, scrollTop + added * pitch);
}

export function isJson(type: string): boolean {
  return /[/+]json\b/i.test(type);
}

/**
 * What a body is besides its text: how big, that it was cut, or what it is
 * where it has no text to show. Empty where there is nothing to add.
 */
export function bodyNote(record: BodyRecord): string {
  if (record.kind === "stream") return "stream, not read";
  if (record.kind === "opaque") return "opaque";
  if (record.kind === "binary") {
    return record.size === null ? "binary" : `binary, ${bytesLabel(record.size)}`;
  }
  if (record.truncated) {
    const whole = record.size === null ? "" : ` of ${bytesLabel(record.size)}`;
    return `truncated at ${bytesLabel(BODY_CAP)}${whole}`;
  }
  return record.size === null ? "" : bytesLabel(record.size);
}

/** Whether a body has text to show at all. */
export function hasText(record: BodyRecord): boolean {
  return record.kind === "text" || record.kind === "form";
}

/**
 * A body's text as the detail shows it: json laid out a key a line, where it
 * is all there and reads as json, else as it was kept. `type` stands in where
 * the body does not know its own.
 */
export function bodyText(record: BodyRecord, type = ""): string {
  if (record.kind !== "text" || record.truncated || !isJson(record.type || type)) return record.text;
  try {
    return JSON.stringify(JSON.parse(record.text), null, 2);
  } catch {
    return record.text;
  }
}

/** A status in full: the number and its text, or what happened in place of one. */
export function statusLine(entry: RequestEntry): string {
  if (entry.state === "pending" || entry.state === "aborted") return entry.state;
  if (entry.status === null) {
    if (entry.state !== "failed") return "not given by the browser";
    return entry.error ? `failed, ${entry.error}` : "failed";
  }
  if (entry.status === 0) return "opaque";
  return `${entry.status} ${entry.statusText}`.trim();
}

function kindWords(entry: RequestEntry): string {
  if (entry.kind === "fetch") return "fetch";
  if (entry.kind === "xhr") return "XMLHttpRequest";
  if (entry.kind === "navigation") return "the document";
  const by = entry.initiatorType ? `, loaded by ${entry.initiatorType}` : "";
  return `${kindLabel(entry)}${by}`;
}

/**
 * The general part of a request's detail, a label and a value a line. Lines
 * with nothing to say are left out. `started` is the time of day it began.
 */
export function generalLines(entry: RequestEntry, started: string): [label: string, value: string][] {
  const lines: [string, string][] = [["url", entry.url]];
  if (entry.finalUrl && entry.finalUrl !== entry.url) lines.push(["answered from", entry.finalUrl]);
  if (entry.method) lines.push(["method", entry.method]);
  lines.push(["status", statusLine(entry)], ["state", entry.state], ["kind", kindWords(entry)]);
  if (entry.contentType) lines.push(["type", entry.contentType]);
  lines.push(["started at", started]);
  lines.push(["duration", durationLabel(entry.timing.duration) || "still going"]);
  if (entry.timing.response !== null) {
    lines.push(["time to response", durationLabel(entry.timing.response)]);
  }
  if (entry.sizes) lines.push(["size", sizeLabel(entry.sizes)]);
  if (entry.protocol) lines.push(["protocol", entry.protocol]);
  if (entry.source === "frame") lines.push(["from", "the device frame"]);
  return lines;
}

const SECRET_NAMES = new Set(["authorization", "cookie", "set-cookie", "proxy-authorization"]);
const SECRET_PARTS = ["token", "secret", "key", "password"];

/** A header whose value is a credential, by its name: never copied. */
export function hides(name: string): boolean {
  const lower = name.toLowerCase();
  return SECRET_NAMES.has(lower) || SECRET_PARTS.some((part) => lower.includes(part));
}

function headerBlock(title: string, headers: HeaderList): string[] {
  if (headers.length === 0) return [];
  const lines = headers.map(([name, value]) => `${name}: ${hides(name) ? HIDDEN : value}`);
  return ["", `${title}:`, ...lines];
}

function bodyBlock(title: string, record: BodyRecord | null): string[] {
  if (!record) return [];
  const note = bodyNote(record);
  if (!hasText(record)) return ["", `${title}: ${[note, record.type].filter(Boolean).join(", ")}`];
  const about = [record.type, note].filter(Boolean).join(", ");
  return ["", `${title}${about ? ` (${about})` : ""}:`, record.text];
}

/**
 * A request as plain text to paste into an AI chat: what was asked and how it
 * went, the headers, the bodies as they were kept, and the call that made it.
 * The values of headers that carry a credential are left out.
 */
export function copyText(entry: RequestEntry): string {
  const light = entry.detail === "light";
  const lines = [`${light || !entry.method ? kindLabel(entry) : entry.method} ${entry.url}`];
  if (entry.finalUrl && entry.finalUrl !== entry.url) lines.push(`answered from: ${entry.finalUrl}`);
  if (!light || entry.status !== null) lines.push(`status: ${statusLine(entry)}`);
  const total = durationLabel(entry.timing.duration);
  const response = durationLabel(entry.timing.response);
  if (total) lines.push(`time: ${total}${response ? `, response after ${response}` : ""}`);
  if (entry.sizes) lines.push(`size: ${sizeLabel(entry.sizes)}`);
  if (entry.protocol) lines.push(`protocol: ${entry.protocol}`);
  if (entry.source === "frame") lines.push("from: the device frame");
  if (light) return [...lines, `note: ${LIGHT_WHY}, no headers and no bodies`].join("\n");
  lines.push(
    ...headerBlock("request headers", entry.requestHeaders),
    ...bodyBlock("request body", entry.requestBody),
    ...headerBlock("response headers", entry.responseHeaders),
    ...bodyBlock("response body", entry.responseBody),
  );
  if (entry.initiator) lines.push("", "initiator:", entry.initiator);
  return lines.join("\n");
}
