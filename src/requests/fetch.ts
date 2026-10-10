import { describeBody, is, isText, READ_MS, readText, unread } from "./body";
import { absolute, headerOf, type Log, type Started } from "./record";
import { QUIET } from "./shared";
import { trimStack } from "./stack";
import type { BodyRecord, HeaderList } from "./types";

export type Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function isRequest(input: unknown): input is Request {
  return (
    typeof input === "object" &&
    input !== null &&
    "url" in input &&
    "method" in input &&
    "headers" in input &&
    "clone" in input
  );
}

function field(init: unknown, key: string): unknown {
  return typeof init === "object" && init !== null ? Reflect.get(init, key) : undefined;
}

/** Is this call one of devknobs' own, by the mark `quietFetch` leaves on its init? */
function isQuiet(init: unknown): boolean {
  try {
    return typeof init === "object" && init !== null && Reflect.get(init, QUIET) === true;
  } catch {
    return false;
  }
}

/**
 * Headers in any of the shapes `fetch` takes: a `Headers`, a list of pairs, or
 * a plain record. The last two keep their names as the page wrote them.
 */
export function listHeaders(given: unknown): HeaderList {
  const list: HeaderList = [];
  if (typeof given !== "object" || given === null) return list;
  if (is(globalThis.Headers, given)) given.forEach((value, name) => list.push([name, value]));
  else if (Array.isArray(given)) {
    for (const pair of given) {
      if (Array.isArray(pair) && pair.length > 1) list.push([String(pair[0]), String(pair[1])]);
    }
  } else for (const [name, value] of Object.entries(given)) list.push([name, String(value)]);
  return list;
}

function describe(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

function aborted(signal: unknown): boolean {
  return typeof signal === "object" && signal !== null && Reflect.get(signal, "aborted") === true;
}

interface Seen {
  request: Omit<Started, "initiator">;
  signal: unknown;
}

/**
 * The body a `Request` brings, named and never read or copied: a copy of a
 * request would read its body, and one the page streams up is the page's
 * alone. Text is told from bytes by the content type only.
 */
function carried(from: Request, method: string, type: string): BodyRecord | null {
  if (method === "GET" || method === "HEAD") return null;
  if (from.body === null || from.bodyUsed) return null;
  return unread(isText(type) ? "stream" : "binary", null, type);
}

/** The request `fetch` is about to make of its arguments, which the init wins over. */
function see(input: unknown, init: unknown): Seen {
  const from = isRequest(input) ? input : null;
  const method = String(field(init, "method") ?? from?.method ?? "GET").toUpperCase();
  const given = field(init, "headers");
  const headers = listHeaders(given === undefined ? from?.headers : given);
  const type = headerOf(headers, "content-type");
  const sent = field(init, "body");
  // A body in the init takes the place of the request's own.
  const own = from && (sent === undefined || sent === null) ? carried(from, method, type) : null;
  const body = describeBody(sent, type) ?? own;
  return {
    request: { method, url: absolute(from ? from.url : String(input)), headers, body },
    signal: field(init, "signal") ?? from?.signal,
  };
}

/** A header that counts the bytes to come, where the server sent one. */
function lengthOf(headers: HeaderList): number | null {
  const length = Number.parseInt(headerOf(headers, "content-length"), 10);
  return Number.isFinite(length) ? length : null;
}

/** An answer that comes a piece at a time for as long as the page listens. */
function isEventStream(type: string): boolean {
  return /^text\/event-stream\b/i.test(type.trim());
}

/**
 * The answer is in: note its head now, and read its body from a copy in the
 * background, so the page's own response is the browser's, untouched. Only
 * text is read, up to the cap and for `wait` ms. Bytes are named and counted.
 * An event stream is named and never copied: a copy would hold the stream
 * open after the page let it go.
 */
function answered(log: Log, id: string, response: Response, signal: unknown, wait: number): void {
  const responseHeaders = listHeaders(response.headers);
  const contentType = headerOf(responseHeaders, "content-type");
  const opaque = response.type === "opaque" || response.type === "opaqueredirect";
  log.responded(id, {
    status: response.status,
    statusText: response.statusText,
    state: response.ok || opaque ? "ok" : "failed",
    responseHeaders,
    contentType,
    redirected: response.redirected,
    finalUrl: response.url || null,
  });
  if (opaque) log.set(id, { responseBody: unread("opaque", null, "") });
  else if (response.body === null) log.ended(id, {});
  else if (isEventStream(contentType)) log.set(id, { responseBody: unread("stream", null, contentType) });
  else if (!isText(contentType)) {
    log.set(id, { responseBody: unread("binary", lengthOf(responseHeaders), contentType) });
  } else {
    readText(response.clone(), contentType, undefined, wait).then(
      ({ record, complete }) => {
        const responseBody = record.size === 0 ? null : record;
        if (complete) log.ended(id, { responseBody });
        else log.set(id, { responseBody });
      },
      (error: unknown) => {
        // The body broke off: the page gave the request up, or the connection did.
        log.ended(id, { state: aborted(signal) ? "aborted" : "failed", error: describe(error) });
      },
    );
  }
}

/**
 * `fetch`, with each request noted in the log. The page's arguments go to the
 * browser as they came, and what comes back is the browser's own response or
 * the browser's own error. A failure in the note-taking never reaches the page.
 */
export function wrapFetch(native: Fetch, log: Log, wait = READ_MS): Fetch {
  return function fetch(this: unknown): Promise<Response> {
    // The browser gets the page's arguments as they came, a missing one still missing.
    const args = arguments;
    if (!log.active() || isQuiet(args[1])) return Reflect.apply(native, this, args);
    let id: string | null = null;
    let signal: unknown;
    try {
      const seen = see(args[0], args[1]);
      signal = seen.signal;
      id = log.start("fetch", { ...seen.request, initiator: trimStack(new Error().stack, 1) });
    } catch {
      // Nothing noted: the request goes out all the same.
    }
    const result: Promise<Response> = Reflect.apply(native, this, args);
    if (id === null) return result;
    const row = id;
    return result.then(
      (response) => {
        try {
          answered(log, row, response, signal, wait);
        } catch {
          // The response is the page's, noted or not.
        }
        return response;
      },
      (error: unknown) => {
        try {
          log.ended(row, { state: aborted(signal) ? "aborted" : "failed", error: describe(error) });
        } catch {
          // The error is the page's, noted or not.
        }
        throw error;
      },
    );
  };
}
