import { createRecorder } from "../src/requests";
import type { Clock } from "../src/requests/record";
import type { Shared } from "../src/requests/shared";
import type { RequestEntry, RequestSource } from "../src/requests/types";

/** The page the fake requests are made from. */
export const BASE = "http://app.test/dash/page";
export const ORIGIN = "http://app.test";

/** When the fake page began to load, in epoch ms. */
export const LOADED = 1_700_000_000_000;

/** A clock the test moves by hand. */
export function fakeClock(origin = LOADED): Clock & { tick(ms: number): void } {
  let at = 0;
  return {
    origin,
    now: () => at,
    tick(ms) {
      at += ms;
    },
  };
}

/** The store's timer, which only runs when the test says. */
export function manual(): { schedule(flush: () => void): () => void; run(): void; waiting(): number } {
  let pending: (() => void)[] = [];
  return {
    schedule(flush) {
      pending.push(flush);
      return () => {
        pending = pending.filter((each) => each !== flush);
      };
    },
    run() {
      for (const flush of pending.splice(0)) flush();
    },
    waiting: () => pending.length,
  };
}

/** The browser's own XMLHttpRequest, as far as the log can tell, driven by the test. */
export class FakeXHR extends EventTarget {
  static sent: FakeXHR[] = [];
  readyState = 0;
  status = 0;
  statusText = "";
  responseType = "";
  response: unknown = null;
  responseURL = "";
  method = "";
  url = "";
  requestHeaders: Record<string, string> = {};
  body: unknown = undefined;
  text = "";
  rawHeaders = "";
  /** How often the page or the log read the text. */
  reads = 0;

  open(method: string, url: string | URL): void {
    this.method = method;
    this.url = String(url);
    this.readyState = 1;
  }
  setRequestHeader(name: string, value: string): void {
    if (this.readyState !== 1) throw new Error("InvalidStateError");
    this.requestHeaders[name] = value;
  }
  send(body?: unknown): void {
    if (this.readyState !== 1) throw new Error("InvalidStateError");
    this.body = body ?? null;
    FakeXHR.sent.push(this);
  }
  get responseText(): string {
    if (this.responseType !== "" && this.responseType !== "text") throw new Error("InvalidStateError");
    this.reads++;
    return this.text;
  }
  getAllResponseHeaders(): string {
    return this.rawHeaders;
  }
  abort(): void {
    this.end("abort");
  }

  /** The answer's headers come in. */
  head(status: number, headers: Record<string, string> = {}, statusText = "OK"): void {
    this.status = status;
    this.statusText = statusText;
    this.rawHeaders = Object.entries(headers)
      .map(([name, value]) => `${name}: ${value}\r\n`)
      .join("");
    this.readyState = 2;
    this.dispatchEvent(new Event("readystatechange"));
  }
  /** The body is all in. */
  done(loaded = this.text.length): void {
    this.readyState = 4;
    this.dispatchEvent(new Event("readystatechange"));
    this.dispatchEvent(new Event("load"));
    this.dispatchEvent(Object.assign(new Event("loadend"), { loaded }));
  }
  /** The request ends without an answer. */
  end(type: "error" | "abort" | "timeout"): void {
    this.readyState = 4;
    this.status = 0;
    this.dispatchEvent(new Event(type));
    this.dispatchEvent(Object.assign(new Event("loadend"), { loaded: 0 }));
  }
}

type Deliver = (list: { getEntries(): PerformanceEntry[] }) => void;

/** PerformanceObserver, which hands over what the test says the browser timed. */
export class FakeObserver {
  static live = new Set<FakeObserver>();
  /** What the browser timed before anyone observed. */
  static buffered: PerformanceEntry[] = [];
  types: string[] = [];
  constructor(readonly deliver: Deliver) {}
  observe(options: { type: string; buffered?: boolean }): void {
    this.types.push(options.type);
    FakeObserver.live.add(this);
    const kept = FakeObserver.buffered.filter((entry) => entry.entryType === options.type);
    if (options.buffered && kept.length > 0) this.deliver({ getEntries: () => kept });
  }
  disconnect(): void {
    FakeObserver.live.delete(this);
  }
  static emit(...entries: PerformanceEntry[]): void {
    for (const observer of Array.from(FakeObserver.live)) {
      const mine = entries.filter((entry) => observer.types.includes(entry.entryType));
      if (mine.length > 0) observer.deliver({ getEntries: () => mine });
    }
  }
}

/** A timing entry as the browser makes them, with the fields Resource Timing adds. */
export function timed(name: string, startTime: number, more: Record<string, unknown> = {}): PerformanceEntry {
  const entry = {
    name,
    entryType: "resource",
    startTime,
    duration: 20,
    initiatorType: "img",
    nextHopProtocol: "h2",
    transferSize: 1300,
    encodedBodySize: 1000,
    decodedBodySize: 4000,
    responseStart: startTime + 12,
    responseEnd: startTime + 20,
    toJSON: () => ({}),
    ...more,
  };
  return entry;
}

export type FetchArgs = [input?: RequestInfo | URL, init?: RequestInit];

/** The browser's own `fetch`: it notes each call and answers as the test set it to. */
export interface FakeFetch {
  calls: FetchArgs[];
  /** How many arguments each call came with. */
  counts: number[];
  answer: (...args: FetchArgs) => Promise<Response>;
  native: typeof fetch;
}

export function fakeFetch(): FakeFetch {
  const fake: FakeFetch = {
    calls: [],
    counts: [],
    answer: () => Promise.resolve(new Response("ok")),
    native: Object.assign(
      function fetch(input?: RequestInfo | URL, _init?: RequestInit): Promise<Response> {
        fake.counts.push(arguments.length);
        fake.calls.push([input, arguments[1]]);
        return fake.answer(input, arguments[1]);
      },
      { preconnect: () => {} },
    ),
  };
  return fake;
}

export interface Page {
  recorder: Shared;
  clock: ReturnType<typeof fakeClock>;
  timer: ReturnType<typeof manual>;
  net: FakeFetch;
  rows(): readonly RequestEntry[];
  /** The one row, for a test that makes one request. */
  row(): RequestEntry;
}

const realFetch = globalThis.fetch;
const GLOBALS = ["document", "location", "XMLHttpRequest", "PerformanceObserver"];
const realGlobals = GLOBALS.map((key) => Object.getOwnPropertyDescriptor(globalThis, key));

/** A page with the browser's parts faked, before any recorder patches it. */
export function fakePage(): FakeFetch {
  const net = fakeFetch();
  FakeXHR.sent = [];
  FakeObserver.live.clear();
  FakeObserver.buffered = [];
  Object.defineProperty(globalThis, "document", { configurable: true, value: { baseURI: BASE } });
  Object.defineProperty(globalThis, "location", { configurable: true, value: { origin: ORIGIN } });
  Object.defineProperty(globalThis, "XMLHttpRequest", { configurable: true, writable: true, value: FakeXHR });
  Object.defineProperty(globalThis, "PerformanceObserver", {
    configurable: true,
    writable: true,
    value: FakeObserver,
  });
  globalThis.fetch = net.native;
  return net;
}

/** Put the real globals back. */
export function leavePage(): void {
  globalThis.fetch = realFetch;
  GLOBALS.forEach((key, index) => {
    const real = realGlobals[index];
    if (real) Object.defineProperty(globalThis, key, real);
    else Reflect.deleteProperty(globalThis, key);
  });
}

/** A recorder on the fake page, with a clock and a timer the test drives. */
export function record(net: FakeFetch, source: RequestSource = "top", above?: () => Shared | null): Page {
  const clock = fakeClock();
  const timer = manual();
  const recorder = createRecorder({ source, clock, origin: ORIGIN, schedule: timer.schedule, above });
  const rows = () => recorder.store.entries();
  return {
    recorder,
    clock,
    timer,
    net,
    rows,
    row() {
      const all = rows();
      if (all.length !== 1 || !all[0]) throw new Error(`${all.length} rows, not 1`);
      return all[0];
    },
  };
}

/** Let the background reads and the promise chains run out. */
export async function settle(): Promise<void> {
  for (let turn = 0; turn < 3; turn++) await new Promise((resolve) => setTimeout(resolve, 0));
}

/** A response with what only the browser can set: where it came from, and what kind it is. */
export function answerFrom(response: Response, fields: Record<string, unknown>): Response {
  for (const [key, value] of Object.entries(fields)) {
    Object.defineProperty(response, key, { configurable: true, value });
  }
  return response;
}

/** A body that comes in `chunks`, and stays open after them unless told to close. */
export function streamOf(chunks: string[], close = true): { stream: ReadableStream<Uint8Array>; cancelled(): boolean } {
  let cancelled = false;
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      if (close) controller.close();
    },
    cancel() {
      cancelled = true;
    },
  });
  return { stream, cancelled: () => cancelled };
}
