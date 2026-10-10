import type { RequestStore } from "./store";
import type { BodyRecord, HeaderList, RequestEntry, RequestKind, RequestSource } from "./types";

/** The real time a page's requests are stamped with. */
export interface Clock {
  /** Ms since the page began to load, as Resource Timing counts. */
  now(): number;
  /** When the page began to load, in epoch ms. */
  origin: number;
}

/** What a patch knows of a request as it goes out. */
export interface Started {
  method: string;
  url: string;
  headers: HeaderList;
  body: BodyRecord | null;
  initiator: string;
}

/** What the `fetch` and `XMLHttpRequest` patches write the log through. */
export interface Log {
  /** False once devknobs let the page go, and while a request of its own goes out. */
  active(): boolean;
  /** A request goes out. Returns its row's id. */
  start(kind: "fetch" | "xhr", request: Started): string;
  set(id: string, patch: Partial<RequestEntry>): void;
  /** The answer's headers are in. */
  responded(id: string, patch: Partial<RequestEntry>): void;
  /** The request is over, however it went. */
  ended(id: string, patch: Partial<RequestEntry>): void;
}

/** `url` in full, from the page's own address. One that does not read stays as it is. */
export function absolute(url: string): string {
  try {
    return new URL(url, typeof document === "undefined" ? undefined : document.baseURI).href;
  } catch {
    return url;
  }
}

/** The header's value in `list`, whatever the case of its name, or empty. */
export function headerOf(list: HeaderList, name: string): string {
  return list.find(([key]) => key.toLowerCase() === name)?.[1] ?? "";
}

/** A row with nothing known but when it started. */
export function blank(
  id: string,
  kind: RequestKind,
  source: RequestSource,
  clock: Clock,
  at: number,
): RequestEntry {
  return {
    id,
    kind,
    detail: kind === "fetch" || kind === "xhr" ? "full" : "light",
    source,
    method: "",
    url: "",
    finalUrl: null,
    redirected: false,
    state: "pending",
    status: null,
    statusText: "",
    error: null,
    requestHeaders: [],
    responseHeaders: [],
    requestBody: null,
    responseBody: null,
    contentType: "",
    sizes: null,
    timing: { start: clock.origin + at, at, response: null, end: null, duration: null },
    initiator: "",
    initiatorType: "",
    protocol: "",
  };
}

export function createLog(
  store: RequestStore,
  clock: Clock,
  source: RequestSource,
  active: () => boolean,
): Log {
  return {
    active,
    start(kind, request) {
      const id = store.nextId();
      store.put({
        ...blank(id, kind, source, clock, clock.now()),
        method: request.method,
        url: request.url,
        requestHeaders: request.headers,
        requestBody: request.body,
        initiator: request.initiator,
      });
      return id;
    },
    set: (id, patch) => store.update(id, patch),
    responded(id, patch) {
      const timing = store.get(id)?.timing;
      if (!timing) return;
      const response = timing.response ?? clock.now() - timing.at;
      store.update(id, { ...patch, timing: { ...timing, response } });
    },
    ended(id, patch) {
      const timing = store.get(id)?.timing;
      if (!timing) return;
      // Resource Timing may have said when it ended already, and knows better.
      const duration = timing.duration ?? clock.now() - timing.at;
      store.update(id, { ...patch, timing: { ...timing, end: timing.start + duration, duration } });
    },
  };
}
