import { describeBody, is, isText, readText, unread } from "./body";
import { absolute, headerOf, type Log, type Started } from "./record";
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
  /** The body of a `Request`, read from a copy once the page's own is on its way. */
  later: Promise<BodyRecord> | null;
}

/** The request `fetch` is about to make of its arguments, which the init wins over. */
function see(input: unknown, init: unknown): Seen {
  const from = isRequest(input) ? input : null;
  const method = String(field(init, "method") ?? from?.method ?? "GET").toUpperCase();
  const given = field(init, "headers");
  const headers = listHeaders(given === undefined ? from?.headers : given);
  const type = headerOf(headers, "content-type");
  const sent = field(init, "body");
  const body = describeBody(sent, type);
  let later: Promise<BodyRecord> | null = null;
  if (from && (sent === undefined || sent === null) && from.body !== null && !from.bodyUsed) {
    const bodiless = method === "GET" || method === "HEAD";
    // A copy leaves the request's own body whole. Bytes are only counted, never copied.
    if (!bodiless && isText(type)) later = readText(from.clone(), type).then((read) => read.record);
    else if (from.body) later = Promise.resolve(unread("binary", null, type));
  }
  return {
    request: { method, url: absolute(from ? from.url : String(input)), headers, body },
    signal: field(init, "signal") ?? from?.signal,
    later,
  };
}

/** A header that counts the bytes to come, where the server sent one. */
function lengthOf(headers: HeaderList): number | null {
  const length = Number.parseInt(headerOf(headers, "content-length"), 10);
  return Number.isFinite(length) ? length : null;
}

/**
 * The answer is in: note its head now, and read its body from a copy in the
 * background, so the page's own response is the browser's, untouched. Only
 * text is read, up to the cap. Bytes are named and counted.
 */
function answered(log: Log, id: string, response: Response, signal: unknown): void {
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
  else if (!isText(contentType)) {
    log.set(id, { responseBody: unread("binary", lengthOf(responseHeaders), contentType) });
  } else {
    readText(response.clone(), contentType).then(
      ({ record, complete }) => {
        const responseBody = record.size === 0 ? null : record;
        if (complete) log.ended(id, { responseBody });
        else log.set(id, { responseBody });
      },
      () => {
        // The page gave the request up mid-body. Any other failed read is the page's to hear of.
        if (aborted(signal)) log.ended(id, { state: "aborted" });
      },
    );
  }
}

/**
 * `fetch`, with each request noted in the log. The page's arguments go to the
 * browser as they came, and what comes back is the browser's own response or
 * the browser's own error. A failure in the note-taking never reaches the page.
 */
export function wrapFetch(native: Fetch, log: Log): Fetch {
  return function fetch(this: unknown): Promise<Response> {
    // The browser gets the page's arguments as they came, a missing one still missing.
    const args = arguments;
    if (!log.active()) return Reflect.apply(native, this, args);
    let id: string | null = null;
    let signal: unknown;
    try {
      const seen = see(args[0], args[1]);
      signal = seen.signal;
      const row = log.start("fetch", { ...seen.request, initiator: trimStack(new Error().stack, 1) });
      id = row;
      seen.later?.then(
        (requestBody) => log.set(row, { requestBody }),
        () => {},
      );
    } catch {
      // Nothing noted: the request goes out all the same.
    }
    const result: Promise<Response> = Reflect.apply(native, this, args);
    if (id === null) return result;
    const row = id;
    return result.then(
      (response) => {
        try {
          answered(log, row, response, signal);
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
