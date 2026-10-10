import { realNow } from "../engine/clock";
import { isDevknobsFrame } from "../engine/frame";
import { type Fetch, wrapFetch } from "./fetch";
import { install, type Patch, restore } from "./patch";
import { absolute, type Clock, createLog } from "./record";
import { lightEntry, MATCH_AFTER, MATCH_BEFORE, matchFull, mergeTiming } from "./resource";
import { evict, share, type Shared, SHARED_VERSION, shared } from "./shared";
import { createStore, type RequestStore, type StoreOptions } from "./store";
import type { RequestEntry, RequestSource } from "./types";
import { patchXhr } from "./xhr";

export type { RequestStore, StoreListener } from "./store";
export type {
  BodyRecord,
  HeaderList,
  RequestDetail,
  RequestEntry,
  RequestKind,
  RequestSizes,
  RequestSource,
  RequestState,
  RequestTiming,
} from "./types";
export { BODY_CAP, RING_SIZE } from "./types";

/**
 * The requests log: what a page's scripts ask for through `fetch` and
 * `XMLHttpRequest`, seen whole, and what the page loads on its own, as far as
 * the browser's timings tell. It records from the moment the first copy of
 * devknobs runs until the page is handed back, keeps the last few hundred
 * rows in memory, and writes nothing anywhere else: not to web storage, not
 * to any server.
 */

/** How many loads of devknobs' own wait to be matched with the browser's timing of them. */
const HUSH_MOST = 100;

/**
 * The browser's own timer, kept as this file loads, before any page script
 * can put another in its place. The clock knob moves `Date` and never this.
 */
const timer = typeof performance === "undefined" ? null : performance;
const nativeNow = timer ? timer.now.bind(timer) : realNow;

/** The real time of this page, on the scale Resource Timing uses. */
export function pageClock(): Clock {
  const origin = timer ? (timer.timeOrigin ?? realNow() - nativeNow()) : 0;
  return { now: nativeNow, origin };
}

/** What a recorder is made of. The tests bring their own. */
export interface RecorderOptions {
  source: RequestSource;
  clock: Clock;
  /** The page's own origin: sizes that read 0 from any other are hidden. */
  origin: string;
  schedule?: StoreOptions["schedule"];
  /** The log of the page above the device frame, which this copy sends its rows to. */
  above?(): Shared | null;
}

function bare(url: string): string {
  return absolute(url).split("#", 1)[0] ?? url;
}

/** A row of another window, copied here so nothing of that window is kept. */
function adopted(entry: RequestEntry): RequestEntry {
  return {
    ...entry,
    source: "frame",
    requestHeaders: entry.requestHeaders.map(([name, value]) => [name, value]),
    responseHeaders: entry.responseHeaders.map(([name, value]) => [name, value]),
    requestBody: entry.requestBody && { ...entry.requestBody },
    responseBody: entry.responseBody && { ...entry.responseBody },
    sizes: entry.sizes && { ...entry.sizes },
    timing: { ...entry.timing },
  };
}

/**
 * Patch the page and start the log. The patches stay the same ones until
 * `uninstall`: whoever finds this recorder on the window uses it as it is.
 */
export function createRecorder(options: RecorderOptions): Shared {
  const { source, clock, origin } = options;
  const seed = `${source.charAt(0)}${Math.floor(clock.origin).toString(36)}${Math.floor(Math.random() * 46656).toString(36)}`;
  const store = createStore({ seed, now: () => clock.origin + clock.now(), schedule: options.schedule });
  const patches: Patch[] = [];
  let live = true;
  /** Above 0 while a request of devknobs' own is on its way into `fetch`. */
  let quiet = 0;
  const always = new Set<string>();
  let once: { url: string; at: number }[] = [];
  const log = createLog(store, clock, source, () => live && quiet === 0);

  function hush(url: string, single: boolean): void {
    const address = bare(url);
    // An image written into its own address makes no request.
    if (address.startsWith("data:")) return;
    if (!single) always.add(address);
    else once = [...once.slice(1 - HUSH_MOST), { url: address, at: clock.now() }];
  }

  /** Is this the browser's timing of a load of devknobs' own? One marked once is used up. */
  function hushed(entry: PerformanceEntry): boolean {
    if (always.has(entry.name)) return true;
    const at = once.findIndex((mark) => {
      const gap = entry.startTime - mark.at;
      return mark.url === entry.name && gap >= -MATCH_AFTER && gap <= MATCH_BEFORE;
    });
    if (at < 0) return false;
    once.splice(at, 1);
    return true;
  }

  /** The browser timed a load: add it to the full row it belongs to, or make it a light row. */
  function take(entry: PerformanceEntry): void {
    try {
      if (hushed(entry)) return;
      const full = matchFull(store.entries(), entry, source);
      if (full) store.update(full.id, mergeTiming(full, entry, origin));
      else store.put(lightEntry(entry, store.nextId(), source, clock, origin));
    } catch {
      // One odd entry is left out. The rest still come.
    }
  }

  /** Hear of every load from here on, and of the ones the browser kept from before. */
  function observe(): () => void {
    if (typeof PerformanceObserver !== "function") return () => {};
    const observer = new PerformanceObserver((list) => {
      if (live) for (const entry of list.getEntries()) take(entry);
    });
    for (const type of ["navigation", "resource"]) {
      try {
        observer.observe({ type, buffered: true });
      } catch {
        // A browser that does not time this kind.
      }
    }
    return () => observer.disconnect();
  }

  /** In the frame: send the rows up to the page's log, all of them the first time it is there. */
  let sentTo: Shared | null = null;
  function forward(changed: readonly RequestEntry[]): void {
    const above = options.above?.() ?? null;
    if (above) above.adopt(above === sentTo ? changed : store.entries());
    sentTo = above;
  }

  /** The frame's page is going: what it still waits for never comes, and the page above hears now. */
  function onHide(event: Event): void {
    if (Reflect.get(event, "persisted") === true) return;
    for (const row of [...store.entries()]) {
      if (row.state === "pending") store.update(row.id, { state: "aborted" });
    }
    store.flush();
  }

  install<Fetch>(patches, globalThis, "fetch", (original) => wrapFetch(original, log));
  patchXhr(patches, log);
  const unobserve = observe();
  if (options.above) {
    store.subscribe(forward);
    globalThis.addEventListener?.("pagehide", onHide);
  }

  const recorder: Shared = {
    version: SHARED_VERSION,
    store,
    quietly(url, request) {
      hush(url, true);
      quiet++;
      try {
        return request();
      } finally {
        quiet--;
      }
    },
    hush,
    adopt(rows) {
      for (const row of rows) store.put(adopted(row));
    },
    uninstall() {
      live = false;
      restore(patches);
      unobserve();
      globalThis.removeEventListener?.("pagehide", onHide);
      store.close();
      if (shared() === recorder) share(null);
    },
  };
  return recorder;
}

/** The log of the page above this frame, where it is on this origin and has one. */
function above(): Shared | null {
  try {
    return window.parent === window ? null : shared(window.parent);
  } catch {
    return null;
  }
}

/**
 * Start recording, unless a copy of devknobs on this page already does: the
 * early script, most often, whose patches and log the full script then uses.
 */
export function start(): void {
  if (shared()) return;
  // A copy of another version left a recorder this one cannot read.
  evict();
  const framed = typeof window !== "undefined" && isDevknobsFrame();
  const origin = typeof location === "undefined" ? "" : location.origin;
  share(
    createRecorder({
      source: framed ? "frame" : "top",
      clock: pageClock(),
      origin,
      above: framed ? above : undefined,
    }),
  );
}

/** Hand `fetch` and `XMLHttpRequest` back and drop the log, whichever copy started it. */
export function stop(): void {
  shared()?.uninstall();
}

/** The page's log, for the panel to read. Null while nothing records. */
export function requestLog(): RequestStore | null {
  return shared()?.store ?? null;
}
