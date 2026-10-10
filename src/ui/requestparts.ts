import { READ_MS } from "../requests/body";
import { BODY_CAP, type BodyRecord, type HeaderList, type RequestEntry, type RequestTiming } from "../requests/types";
import {
  bodyNote,
  bodyText,
  bytesLabel,
  durationLabel,
  hasText,
  kindLabel,
  type Lead,
  lead,
  sizeLabel,
  statusLine,
  type StatusTone,
  statusTone,
} from "./requestformat";

/**
 * What one request's detail reads, part by part: its summary, which of its
 * segments there are, and what each of them lists. All of it from the row
 * alone, so none of it needs a page.
 */

/** What the body segment says of a row the browser gives no bodies of. */
export const LIGHT_BODIES = "the browser gives a page no bodies for this";

/** A request body past this many lines shows its first ones, so the response stays in reach. */
export const BODY_LINES = 12;

/** With more headers than this, the headers get a filter. */
export const HEADERS_FILTER = 12;

/** How many characters of a path show where nothing tells how wide its lines are. */
export const PATH_CHARS = 72;

/** How wide a character of the path is, in px: mono at 11px. */
const CHAR_WIDTH = 6.7;

/** How many characters of a path fit its two lines, the lines `width` px wide. */
export function pathRoom(width: number): number {
  if (!(width > 0)) return PATH_CHARS;
  // One short of two full lines, as the mark of the cut may be wider than a letter.
  return Math.max(8, 2 * Math.floor(width / CHAR_WIDTH) - 1);
}

/** An address in two: the host that answers, and the path asked of it, its query and hash included. */
export function urlParts(url: string): { host: string; path: string } {
  try {
    const parsed = new URL(url);
    const start = `${parsed.protocol}//${parsed.host}`;
    // An address that holds its own content, or one that reads another way, is all path.
    if (parsed.host === "" || !url.startsWith(start)) return { host: "", path: url };
    return { host: parsed.host, path: url.slice(start.length) || "/" };
  } catch {
    return { host: "", path: url };
  }
}

/** The top of a request's detail: what was asked, and how it went. */
export interface Summary {
  /** The method in full, or the kind where the browser gives no method. */
  verb: Lead;
  /** The path and its query, as written. */
  path: string;
  /** The status and its text, or empty where the browser does not say. */
  status: string;
  tone: StatusTone | null;
  /** How long it took, or empty while it runs. */
  time: string;
  host: string;
}

export function summary(entry: RequestEntry): Summary {
  const first = lead(entry);
  const { host, path } = urlParts(entry.url);
  return {
    verb: first.icon ? first : { ...first, text: entry.method },
    path,
    status: entry.status === null && entry.state === "ok" ? "" : statusLine(entry),
    tone: statusTone(entry),
    time: durationLabel(entry.timing.duration),
    host,
  };
}

/** What a request's detail shows, one at a time, in the order they stand. */
export const SEGMENTS = ["body", "headers", "more"] as const;

export type Segment = (typeof SEGMENTS)[number];

export function isSegment(value: string): value is Segment {
  return SEGMENTS.some((each) => each === value);
}

/** The segments a request has. One with nothing to show is left out. */
export function segmentsOf(entry: RequestEntry): Segment[] {
  const headers = entry.requestHeaders.length + entry.responseHeaders.length > 0;
  return SEGMENTS.filter((each) => each !== "headers" || headers);
}

/** Whether a request has a body, its own or its answer's. */
export function hasBody(entry: RequestEntry): boolean {
  return entry.requestBody !== null || entry.responseBody !== null;
}

/** The segment a request opens on: its bodies where it has one, else its headers, else the rest. */
export function startSegment(entry: RequestEntry): Segment {
  if (hasBody(entry)) return "body";
  return segmentsOf(entry).includes("headers") ? "headers" : "more";
}

/** The parameters of an address's query, a name and a value each, as they read once decoded. */
export function queryLines(url: string): [name: string, value: string][] {
  try {
    return [...new URL(url).searchParams];
  } catch {
    return [];
  }
}

/** The headers in their groups, the answer's first. A group with none is left out. */
export function headerGroups(entry: RequestEntry): { label: string; lines: HeaderList }[] {
  return [
    { label: "response", lines: entry.responseHeaders },
    { label: "request", lines: entry.requestHeaders },
  ].filter((each) => each.lines.length > 0);
}

/** Whether a request has so many headers that they get a filter. */
export function headersFilter(entry: RequestEntry): boolean {
  return entry.requestHeaders.length + entry.responseHeaders.length > HEADERS_FILTER;
}

/** How a body shows: as text, as a list of fields, or as a line that says why there is none to show. */
export type BodyShape =
  | { kind: "code"; text: string }
  | { kind: "fields"; lines: [name: string, value: string][] }
  | { kind: "line"; text: string };

/** A form as the log keeps it, a field a line, back as its fields. A line with no `=` goes on with the value before it. */
function formLines(text: string): [string, string][] {
  const lines: [string, string][] = [];
  for (const line of text.split("\n")) {
    const at = line.indexOf("=");
    const last = lines[lines.length - 1];
    if (at < 0 && last) last[1] = `${last[1]}\n${line}`;
    else lines.push(at < 0 ? [line, ""] : [line.slice(0, at), line.slice(at + 1)]);
  }
  return lines;
}

/**
 * How a body shows. Json is laid out where that changes none of it, a form
 * is its fields, other text is as it was kept, and what has no text says in
 * a line what it is. `type` stands in where the body does not know its own.
 */
export function bodyShape(record: BodyRecord, type = ""): BodyShape {
  if (record.kind === "stream") return { kind: "line", text: "not read: a stream" };
  if (record.kind === "opaque") return { kind: "line", text: "hidden by the browser: an opaque answer" };
  if (!hasText(record)) return { kind: "line", text: [bodyNote(record), record.type].filter(Boolean).join(", ") };
  if (record.text === "") return { kind: "line", text: "empty" };
  if (record.kind === "form") return { kind: "fields", lines: formLines(record.text) };
  if (!record.truncated && /x-www-form-urlencoded/i.test(record.type || type)) {
    return { kind: "fields", lines: [...new URLSearchParams(record.text)] };
  }
  return { kind: "code", text: bodyText(record, type) };
}

/** What is missing of a body that was cut, at the cap or by time. Empty for one that is whole. */
export function cutNote(record: BodyRecord): string {
  if (record.timedOut) return `cut after ${READ_MS / 1000} seconds`;
  if (!record.truncated) return "";
  return `first ${bytesLabel(BODY_CAP)}${record.size === null ? "" : ` of ${bytesLabel(record.size)}`}`;
}

/** What stands in an answer's body's place while there is none. */
export function noResponse(entry: RequestEntry): string {
  return entry.state === "pending" ? "waiting for the response" : "no response body";
}

function kindWords(entry: RequestEntry): string {
  if (entry.kind === "fetch") return "fetch";
  if (entry.kind === "xhr") return "XMLHttpRequest";
  if (entry.kind === "navigation") return "the document";
  const by = entry.initiatorType ? `, loaded by ${entry.initiatorType}` : "";
  return `${kindLabel(entry)}${by}`;
}

/**
 * What is rarely asked of a request, a label and a value a line: its address
 * in full, then what it is and where it came from. Lines with nothing to say
 * are left out.
 */
export function moreLines(entry: RequestEntry): [label: string, value: string][] {
  const lines: [string, string][] = [["url", entry.url]];
  if (entry.contentType) lines.push(["type", entry.contentType]);
  if (entry.sizes) lines.push(["size", sizeLabel(entry.sizes)]);
  if (entry.protocol) lines.push(["protocol", entry.protocol]);
  lines.push(["state", entry.state], ["kind", kindWords(entry)]);
  if (entry.source === "frame") lines.push(["from", "the device frame"]);
  const moved = entry.finalUrl !== null && entry.finalUrl !== entry.url;
  if (entry.redirected || moved) lines.push(["redirected", "yes"]);
  if (entry.finalUrl !== null && moved) lines.push(["answered from", entry.finalUrl]);
  return lines;
}

/** A request's time in its two parts, in ms: to the answer's headers, and from them to the end. */
export interface TimingParts {
  waiting: number | null;
  download: number | null;
  total: number | null;
  /** How much of the whole each of the two is, or null while either is unknown. */
  shares: [waiting: number, download: number] | null;
}

export function timingParts(timing: RequestTiming): TimingParts {
  const { response, duration } = timing;
  if (response === null || duration === null) {
    return { waiting: response, download: null, total: duration, shares: null };
  }
  const waiting = Math.min(Math.max(0, response), duration);
  const download = duration - waiting;
  return {
    waiting,
    download,
    total: duration,
    shares: duration > 0 ? [waiting / duration, download / duration] : null,
  };
}

/** The timing as lines: when it started, its two parts where they are known, and the whole. */
export function timingLines(timing: RequestTiming, started: string): [label: string, value: string][] {
  const parts = timingParts(timing);
  const lines: [string, string][] = [["started at", started]];
  if (parts.waiting !== null) lines.push(["waiting", durationLabel(parts.waiting)]);
  if (parts.download !== null) lines.push(["download", durationLabel(parts.download)]);
  lines.push(["total", durationLabel(parts.total) || "still going"]);
  return lines;
}

/** One frame of a stack: the function, where it is in full, and that place in short. */
export interface Frame {
  name: string;
  where: string;
  /** The file's name with its line and column, without the way to it. */
  short: string;
}

/** A line of the initiator: a frame, or a run of frames that are not the page's own. */
export type StackLine = { kind: "frame"; frame: Frame } | { kind: "more"; frames: Frame[] };

/** Where a frame's address ends: its line and column. */
const PLACE = /(?::\d+){1,2}$/;

/** The file of a frame's address, without its line and column. */
function fileOf(where: string): string {
  return where.replace(PLACE, "");
}

function shortOf(where: string): string {
  const place = PLACE.exec(where)?.[0] ?? "";
  const file = fileOf(where).split(/[?#]/, 1)[0] ?? "";
  const name = file.split("/").filter((part) => part !== "").pop();
  return name === undefined ? where : `${name}${place}`;
}

/** A frame, as V8 writes one (`at fn (file:1:2)`) or as the others do (`fn@file:1:2`). */
function frameOf(line: string): Frame {
  const named = /^at (.*?) \((.*)\)$/.exec(line);
  const bare = /^at (.*)$/.exec(line);
  const other = /^(.*?)@(.*)$/.exec(line);
  const [name = "", where = ""] = named
    ? [named[1], named[2]]
    : bare
      ? ["", bare[1]]
      : other
        ? [other[1], other[2]]
        : [line, ""];
  return { name: name || "(anonymous)", where, short: shortOf(where) };
}

/** The file a stack starts in: of devknobs' own stack, the file devknobs runs from. */
export function stackFile(stack: unknown): string {
  if (typeof stack !== "string") return "";
  const first = stack
    .split("\n")
    .map((line) => line.trim())
    .find((line) => /^at |@/.test(line));
  return first === undefined ? "" : fileOf(frameOf(first).where);
}

/**
 * The call that made a request, a frame a line. Frames from `node_modules`,
 * and from `own`, the file devknobs runs from, are not the page's own: a run
 * of them is one line that says how many.
 */
export function stackLines(stack: string, own = ""): StackLine[] {
  const lines: StackLine[] = [];
  for (const text of stack.split("\n")) {
    if (text.trim() === "") continue;
    const frame = frameOf(text.trim());
    const quiet = /[\\/]node_modules[\\/]/.test(frame.where) || (own !== "" && fileOf(frame.where) === own);
    const last = lines[lines.length - 1];
    if (!quiet) lines.push({ kind: "frame", frame });
    else if (last?.kind === "more") last.frames.push(frame);
    else lines.push({ kind: "more", frames: [frame] });
  }
  return lines;
}
