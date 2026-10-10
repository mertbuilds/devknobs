import { clipText, describeBody, unread } from "./body";
import { install, type Patch } from "./patch";
import { absolute, headerOf, type Log } from "./record";
import { trimStack } from "./stack";
import { BODY_CAP, type BodyRecord, type HeaderList, type RequestEntry, type RequestState } from "./types";

type Method = (this: XMLHttpRequest, ...args: unknown[]) => unknown;

/**
 * The most bytes of a `json` answer the log turns back into text. A bigger
 * one would stall the page for a preview, so it is only counted.
 */
export const JSON_LIMIT = 4 * BODY_CAP;

/** What `open` and `setRequestHeader` said of a request, until `send`. */
interface Opened {
  method: string;
  url: string;
  headers: HeaderList;
  /** Let go of the request this object made before, which the page gave up on. */
  drop: (() => void) | null;
}

/** `getAllResponseHeaders()` as a list. */
export function parseHeaders(raw: string): HeaderList {
  const list: HeaderList = [];
  for (const line of raw.split(/\r?\n/)) {
    const cut = line.indexOf(":");
    if (cut > 0) list.push([line.slice(0, cut).trim(), line.slice(cut + 1).trim()]);
  }
  return list;
}

/** The answer's head, as far as the request has come. */
function head(xhr: XMLHttpRequest, url: string): Partial<RequestEntry> {
  const responseHeaders = parseHeaders(xhr.getAllResponseHeaders() ?? "");
  const finalUrl = xhr.responseURL || null;
  return {
    status: xhr.status,
    statusText: xhr.statusText,
    responseHeaders,
    contentType: headerOf(responseHeaders, "content-type"),
    finalUrl,
    // The browser's address for the answer never has the hash.
    redirected: finalUrl !== null && finalUrl !== url.split("#", 1)[0],
  };
}

function sizeOf(value: unknown): number | null {
  if (typeof value !== "object" || value === null) return null;
  const size: unknown = Reflect.get(value, "byteLength") ?? Reflect.get(value, "size");
  return typeof size === "number" ? size : null;
}

/**
 * The answer's body. Text is what the page reads too, cut to the cap. A
 * `json` answer is written out again, unless it is big. Anything else is
 * named and counted.
 */
function bodyOf(xhr: XMLHttpRequest, type: string, loaded: number | null): BodyRecord | null {
  const kind = xhr.responseType;
  let record: BodyRecord;
  if (kind === "" || kind === "text") record = clipText(xhr.responseText, type);
  else if (kind !== "json") record = unread("binary", sizeOf(xhr.response) ?? loaded, type || kind);
  else if (loaded !== null && loaded > JSON_LIMIT) {
    record = { kind: "text", text: "", size: loaded, truncated: true, type };
  } else record = clipText(JSON.stringify(xhr.response) ?? "", type);
  return record.size === 0 ? null : record;
}

/** The events that end a request with no answer. */
const FAILS = ["error", "abort", "timeout"];

/**
 * Follow one request to its end, through events on the object itself. Returns
 * the way to let it go early, for an object the page opens again mid-flight,
 * which the browser ends without a word.
 *
 * The listeners capture, so they run before the page's own on the object,
 * and an answer is noted as the object reaches its last state, before the
 * page hears `load`: a page that sends the object again from one of its own
 * handlers finds the row done, and the listeners gone.
 */
function watch(xhr: XMLHttpRequest, id: string, url: string, log: Log): () => void {
  let outcome: RequestState | null = null;
  let error: string | null = null;
  let over = false;
  /** How many bytes are in, as the browser last said. */
  let loaded: number | null = null;
  const unlisten = () => {
    xhr.removeEventListener("readystatechange", onState, true);
    xhr.removeEventListener("progress", onProgress, true);
    for (const type of FAILS) xhr.removeEventListener(type, onFail, true);
    xhr.removeEventListener("loadend", onEnd, true);
  };
  function finish(): void {
    over = true;
    unlisten();
    try {
      const answer = head(xhr, url);
      const status = xhr.status;
      const state = outcome ?? (status === 0 || status >= 400 ? "failed" : "ok");
      // A browser that told of no progress may still have said how long the body is.
      const length = Number.parseInt(headerOf(answer.responseHeaders ?? [], "content-length"), 10);
      const size = loaded ?? (Number.isFinite(length) ? length : null);
      const responseBody = outcome ? null : bodyOf(xhr, answer.contentType ?? "", size);
      log.ended(id, { ...answer, status: status === 0 ? null : status, state, error, responseBody });
    } catch {
      log.ended(id, { state: outcome ?? "failed", error });
    }
  }
  function onState(): void {
    try {
      if (xhr.readyState === 2) log.responded(id, head(xhr, url));
    } catch {
      // The headers come again at the end.
    }
    // With no status there is no answer: the event that follows says why.
    if (xhr.readyState === 4 && xhr.status !== 0) finish();
  }
  function onProgress(event: Event): void {
    const so: unknown = Reflect.get(event, "loaded");
    if (typeof so === "number") loaded = so;
  }
  function onFail(event: Event): void {
    outcome = event.type === "abort" ? "aborted" : "failed";
    error = event.type === "abort" ? null : event.type;
  }
  function onEnd(event: Event): void {
    // The end of a request this object made before, heard after the page sent it again.
    if (xhr.readyState !== 4) return;
    onProgress(event);
    finish();
  }
  xhr.addEventListener("readystatechange", onState, true);
  xhr.addEventListener("progress", onProgress, true);
  for (const type of FAILS) xhr.addEventListener(type, onFail, true);
  xhr.addEventListener("loadend", onEnd, true);
  return () => {
    if (over) return;
    over = true;
    unlisten();
    log.ended(id, { state: "aborted" });
  };
}

/**
 * Note every `XMLHttpRequest` in the log. The three methods are patched on
 * the prototype and the rest is heard through events, so the constructor is
 * the browser's own: `instanceof` and subclasses work as before.
 */
export function patchXhr(patches: Patch[], log: Log): void {
  if (typeof XMLHttpRequest !== "function") return;
  const opened = new WeakMap<XMLHttpRequest, Opened>();
  const proto = XMLHttpRequest.prototype;
  install<Method>(
    patches,
    proto,
    "open",
    (original) =>
      function (this: XMLHttpRequest, ...args: unknown[]) {
        const result = original.apply(this, args);
        try {
          opened.get(this)?.drop?.();
          opened.delete(this);
          if (log.active()) {
            const method = String(args[0]).toUpperCase();
            opened.set(this, { method, url: absolute(String(args[1])), headers: [], drop: null });
          }
        } catch {
          // Not noted: the request is the page's all the same.
        }
        return result;
      },
  );
  install<Method>(
    patches,
    proto,
    "setRequestHeader",
    (original) =>
      function (this: XMLHttpRequest, ...args: unknown[]) {
        const result = original.apply(this, args);
        // Only a header the browser took is one the request has.
        opened.get(this)?.headers.push([String(args[0]), String(args[1])]);
        return result;
      },
  );
  install<Method>(
    patches,
    proto,
    "send",
    (original) =>
      function (this: XMLHttpRequest, ...args: unknown[]) {
        const request = opened.get(this);
        if (!request || !log.active()) return original.apply(this, args);
        let id: string | null = null;
        try {
          const { method, url, headers } = request;
          const body = describeBody(args[0], headerOf(headers, "content-type"));
          const initiator = trimStack(new Error().stack, 1);
          id = log.start("xhr", { method, url, headers: [...headers], body, initiator });
          request.drop = watch(this, id, url, log);
        } catch {
          // Not noted: the request goes out all the same.
        }
        try {
          return original.apply(this, args);
        } catch (error) {
          // Never sent: the browser threw, and the page hears it as it would.
          request.drop?.();
          request.drop = null;
          if (id !== null) log.set(id, { state: "failed", error: String(error) });
          throw error;
        }
      },
  );
}
