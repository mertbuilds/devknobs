/** How many requests the log keeps. The oldest goes as one more comes in. */
export const RING_SIZE = 300;

/** How much of a body the log keeps, in bytes. What the panel shows of it is its own matter. */
export const BODY_CAP = 64 * 1024;

/** Who made the request: a script, through `fetch` or `XMLHttpRequest`, or the page as it loaded. */
export type RequestKind = "fetch" | "xhr" | "resource" | "navigation";

/**
 * How much the log knows. A script's request is seen whole. What the page
 * loads on its own is only known from the browser's timings: no headers, no
 * bodies.
 */
export type RequestDetail = "full" | "light";

/** `failed` is a request that never got an answer, or one answered 400 or above. */
export type RequestState = "pending" | "ok" | "failed" | "aborted";

/** The page itself, or its copy in the device frame. */
export type RequestSource = "top" | "frame";

/** Headers in the order they were read, names as the browser hands them back. */
export type HeaderList = [name: string, value: string][];

/** What the log keeps of a body: a capped preview where it is text, else what it is and how big. */
export interface BodyRecord {
  /**
   * `text` holds a preview, `form` a line per field, and the rest hold no
   * content: `binary` is bytes, `stream` is a body the page streams, which is
   * never read, and `opaque` is an answer the browser hides from scripts.
   */
  kind: "text" | "form" | "binary" | "stream" | "opaque";
  /** The preview, at most `BODY_CAP` bytes of it. */
  text: string;
  /** The whole body in bytes, or null where finding out would mean reading it all. */
  size: number | null;
  /** There is more body than `text` holds. */
  truncated: boolean;
  /** The content type, or the kind of object a script sent, such as `ArrayBuffer`. */
  type: string;
}

/** The sizes Resource Timing gives, in bytes. */
export interface RequestSizes {
  transfer: number;
  encoded: number;
  decoded: number;
  /** A server on another origin kept the sizes to itself: they read 0, and are not. */
  hidden: boolean;
}

/** When the request ran, in real time, whatever the clock knob says. */
export interface RequestTiming {
  /** When it started, in epoch ms. */
  start: number;
  /** The same instant in ms since its page began to load, as Resource Timing counts. */
  at: number;
  /** From the start to the answer's headers, in ms, or null before them. */
  response: number | null;
  /** When the body was all in, in epoch ms, or null while that is unknown. */
  end: number | null;
  /** From the start to the end, in ms. */
  duration: number | null;
}

/** One request in the log. Plain data: it can be copied, posted and printed as it is. */
export interface RequestEntry {
  /** Unlike any other in the log, the frame's included. */
  id: string;
  kind: RequestKind;
  detail: RequestDetail;
  source: RequestSource;
  /** In upper case. Empty on a light row, where the browser does not say. */
  method: string;
  /** The address asked for, in full. */
  url: string;
  /** Where the answer came from, after redirects, or null where that is unknown. */
  finalUrl: string | null;
  redirected: boolean;
  state: RequestState;
  /** The answer's status. 0 on an opaque answer, null with no answer or where the browser does not say. */
  status: number | null;
  statusText: string;
  /** Why it failed, where it never got an answer. */
  error: string | null;
  /** As the script set them. No value is hidden here: what to show is the panel's call. */
  requestHeaders: HeaderList;
  /** The ones the browser lets a script read. */
  responseHeaders: HeaderList;
  requestBody: BodyRecord | null;
  responseBody: BodyRecord | null;
  /** The answer's content type, or empty. */
  contentType: string;
  /** From Resource Timing, or null where the browser has given none yet. */
  sizes: RequestSizes | null;
  timing: RequestTiming;
  /** The call that made the request: stack frames, one a line. Empty on a light row. */
  initiator: string;
  /** What Resource Timing says loaded it, such as `img` or `css`. Empty on a full row it has not reached. */
  initiatorType: string;
  /** The protocol the browser spoke, such as `h2`, or empty. */
  protocol: string;
}
