import { BODY_CAP, type BodyRecord } from "./types";

/** Content types that read as text. Anything else is kept as a type and a size. */
const TEXT = /^text\/|[/+](json|xml|javascript|ecmascript|x-www-form-urlencoded|graphql|yaml)\b|\/svg/i;

export function isText(type: string): boolean {
  return TEXT.test(type);
}

/** A cut can land inside a character, which then decodes to this. */
const BROKEN = /�+$/;

/**
 * `text` as a record, cut to the cap. Only the head of a long text is ever
 * measured, so a body of megabytes costs no more than one of the cap, and its
 * whole size stays unknown.
 *
 * What is kept of a long text is a copy, made by decoding the head's bytes.
 * A `slice` would not do: the engines keep the whole parent string alive
 * behind a slice of it, megabytes for a row's 64 KB.
 */
export function clipText(text: string, type: string, cap = BODY_CAP): BodyRecord {
  if (text.length <= cap) {
    const bytes = new TextEncoder().encode(text);
    if (bytes.length <= cap) return { kind: "text", text, size: bytes.length, truncated: false, type };
    const cut = new TextDecoder().decode(bytes.subarray(0, cap)).replace(BROKEN, "");
    return { kind: "text", text: cut, size: bytes.length, truncated: true, type };
  }
  // The head alone is encoded, and it dies with this call. Half a pair at its
  // end is three bytes past the cap, so it is cut off with any other half character.
  const bytes = new TextEncoder().encode(text.slice(0, cap));
  const cut = new TextDecoder().decode(bytes.subarray(0, cap));
  return { kind: "text", text: bytes.length > cap ? cut.replace(BROKEN, "") : cut, size: null, truncated: true, type };
}

function sized(kind: BodyRecord["kind"], size: number | null, type: string): BodyRecord {
  return { kind, text: "", size, truncated: false, type };
}

/** A form as a line per field. A file is named, never read. */
function formText(form: FormData, cap: number): string {
  const lines: string[] = [];
  let length = 0;
  for (const [name, value] of form) {
    const line =
      typeof value === "string"
        ? `${name}=${value}`
        : `${name}=(file ${value.name}, ${value.type || "no type"}, ${value.size} bytes)`;
    lines.push(line);
    length += line.length + 1;
    if (length > cap) break;
  }
  return lines.join("\n");
}

/** Is `value` one of `kind`, where the browser has that kind at all? */
export function is<T>(kind: (new (...args: never[]) => T) | undefined, value: unknown): value is T {
  return typeof kind === "function" && value instanceof kind;
}

/**
 * What a script is about to send, read without touching it: text is cut to
 * the cap, a form is listed, bytes are counted, and a stream is only named,
 * since reading it would take it from the request.
 */
export function describeBody(body: unknown, type: string, cap = BODY_CAP): BodyRecord | null {
  if (body === undefined || body === null) return null;
  if (typeof body === "string") return clipText(body, type || "text/plain;charset=UTF-8", cap);
  if (is(globalThis.URLSearchParams, body)) {
    return clipText(String(body), type || "application/x-www-form-urlencoded;charset=UTF-8", cap);
  }
  if (is(globalThis.FormData, body)) {
    const text = clipText(formText(body, cap), type || "multipart/form-data", cap);
    return { ...text, kind: "form", size: null };
  }
  if (is(globalThis.Blob, body)) return sized("binary", body.size, type || body.type || "Blob");
  if (is(globalThis.ArrayBuffer, body)) return sized("binary", body.byteLength, type || "ArrayBuffer");
  if (ArrayBuffer.isView(body)) return sized("binary", body.byteLength, type || "ArrayBufferView");
  if (is(globalThis.ReadableStream, body)) return sized("stream", null, type);
  return null;
}

/** A body the log names and never reads, such as a stream or an opaque answer. */
export function unread(kind: "stream" | "opaque" | "binary", size: number | null, type: string): BodyRecord {
  return sized(kind, size, type);
}

/** What `readText` needs of a request or a response: a copy of it, which nothing else reads. */
export interface Readable {
  body?: ReadableStream<Uint8Array> | null;
  blob(): Promise<Blob>;
}

/** A body read as text, and whether the read reached its end. */
export interface Read {
  record: BodyRecord;
  complete: boolean;
}

/** How long a body is read for, from its headers, before the read is given up, in ms. */
export const READ_MS = 2000;

/**
 * Read `copy` as text up to the cap, then let the rest go unread. Where the
 * browser gives no stream, the body is taken whole, as the browser holds it
 * already, and only its head is decoded.
 *
 * A copy of a response holds the page's own cancel back until it is cancelled
 * too, so a body that is still coming after `wait` ms is let go, with what
 * came of it by then.
 */
export async function readText(copy: Readable, type: string, cap = BODY_CAP, wait = READ_MS): Promise<Read> {
  if (!copy.body) {
    const blob = await copy.blob();
    const text = await blob.slice(0, cap).text();
    const truncated = blob.size > cap;
    const record: BodyRecord = {
      kind: "text",
      text: truncated ? text.replace(BROKEN, "") : text,
      size: blob.size,
      truncated,
      type,
    };
    return { record, complete: true };
  }
  const reader = copy.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let size = 0;
  let late = false;
  // A read that waits ends as done once the reader is cancelled.
  const timer = setTimeout(() => {
    late = true;
    void reader.cancel().catch(() => {});
  }, wait);
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const room = cap - size;
      if (value.byteLength > room) {
        text += decoder.decode(value.subarray(0, room));
        // The page's own copy reads on. This one stops asking.
        void reader.cancel().catch(() => {});
        const record: BodyRecord = { kind: "text", text: text.replace(BROKEN, ""), size: null, truncated: true, type };
        return { record, complete: false };
      }
      text += decoder.decode(value, { stream: true });
      size += value.byteLength;
    }
  } finally {
    clearTimeout(timer);
  }
  text += decoder.decode();
  if (late) {
    const record: BodyRecord = {
      kind: "text",
      text: text.replace(BROKEN, ""),
      size: null,
      truncated: true,
      timedOut: true,
      type,
    };
    return { record, complete: false };
  }
  return { record: { kind: "text", text, size, truncated: false, type }, complete: true };
}
