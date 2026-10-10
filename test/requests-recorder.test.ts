import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { early as earlyClock, NativeDate, takeOver } from "../src/engine/clock";
import { DEFAULT_STATE } from "../src/engine/store";
import { createRecorder, pageClock, requestLog, start, stop } from "../src/requests";
import { share, type Shared, shared } from "../src/requests/shared";
import {
  type FakeFetch,
  FakeObserver,
  FakeXHR,
  fakeClock,
  fakePage,
  leavePage,
  LOADED,
  manual,
  ORIGIN,
  record,
  settle,
  timed,
} from "./requests-fakes";

const SHARED = Symbol.for("devknobs.requests");

const nativeXhr = {
  open: FakeXHR.prototype.open,
  setRequestHeader: FakeXHR.prototype.setRequestHeader,
  send: FakeXHR.prototype.send,
};

function xhrMethods(): typeof nativeXhr {
  const { open, setRequestHeader, send } = FakeXHR.prototype;
  return { open, setRequestHeader, send };
}

let net: FakeFetch;

beforeEach(() => {
  net = fakePage();
});

afterEach(() => {
  stop();
  Reflect.deleteProperty(globalThis, SHARED);
  Object.assign(FakeXHR.prototype, nativeXhr);
  leavePage();
});

describe("the early script and the full one", () => {
  test("the full script uses the early one's patches and log, and patches nothing", async () => {
    // A second copy of the module, as the early script is of the full one.
    const path = "../src/requests/index.ts?early";
    const early: typeof import("../src/requests") = await import(path);
    FakeObserver.buffered = [timed("http://app.test/app.css", 5)];
    early.start();
    const patched = { fetch: globalThis.fetch, ...xhrMethods() };
    expect(patched.fetch).not.toBe(net.native);
    await fetch("/api/first");

    start();
    expect({ fetch: globalThis.fetch, ...xhrMethods() }).toEqual(patched);
    expect(FakeObserver.live.size).toBe(1);
    expect(requestLog()).toBe(early.requestLog());
    await fetch("/api/second");
    FakeObserver.emit(timed("http://app.test/late.png", 9));
    // Each request once, the early ones included.
    expect(requestLog()?.entries().map((row) => row.url).sort()).toEqual([
      "http://app.test/api/first",
      "http://app.test/api/second",
      "http://app.test/app.css",
      "http://app.test/late.png",
    ]);
    expect(net.calls.length).toBe(2);

    // The full script hands the page back, the early script's patches too.
    stop();
    expect(globalThis.fetch).toBe(net.native);
    expect(xhrMethods()).toEqual(nativeXhr);
    expect(FakeObserver.live.size).toBe(0);
    expect(requestLog()).toBeNull();
    expect(early.requestLog()).toBeNull();
  });

  test("without the early script the full one patches at mount and takes what the browser kept", () => {
    FakeObserver.buffered = [
      timed("http://app.test/dash/page", 0, { entryType: "navigation", initiatorType: "navigation" }),
      timed("http://app.test/api/boot", 20, { initiatorType: "fetch" }),
    ];
    expect(requestLog()).toBeNull();
    start();
    expect(requestLog()?.entries().map((row) => [row.kind, row.detail, row.initiatorType])).toEqual([
      ["navigation", "light", "navigation"],
      ["resource", "light", "fetch"],
    ]);
    start();
    expect(FakeObserver.live.size).toBe(1);
  });

  test("a recorder of another version is let go before this one starts", () => {
    let let_go = 0;
    Reflect.set(globalThis, SHARED, { version: 0, uninstall: () => let_go++ });
    start();
    expect(let_go).toBe(1);
    expect(shared()?.version).toBe(1);
    expect(globalThis.fetch).not.toBe(net.native);
  });
});

describe("handing the page back", () => {
  test("puts fetch and the three methods back as they were, and stops listening", async () => {
    start();
    const store = requestLog();
    await fetch("/api/items");
    expect(store?.entries().length).toBe(1);
    stop();
    expect(globalThis.fetch).toBe(net.native);
    expect(xhrMethods()).toEqual(nativeXhr);
    expect(FakeObserver.live.size).toBe(0);
    expect(Reflect.has(globalThis, SHARED)).toBe(false);
    expect(store?.entries()).toEqual([]);
  });

  test("a patch someone wrapped since stays in their chain, and notes nothing more", async () => {
    start();
    const store = requestLog();
    const ours = globalThis.fetch;
    const send = FakeXHR.prototype.send;
    let wrapped = 0;
    const theirs: typeof fetch = Object.assign(
      (input: RequestInfo | URL, init?: RequestInit) => {
        wrapped++;
        return ours(input, init);
      },
      { preconnect: () => {} },
    );
    globalThis.fetch = theirs;
    FakeXHR.prototype.send = function (this: FakeXHR, body?: unknown) {
      wrapped++;
      return send.call(this, body);
    };
    const theirSend = FakeXHR.prototype.send;

    stop();
    expect(globalThis.fetch).toBe(theirs);
    expect(FakeXHR.prototype.send).toBe(theirSend);
    // The ones nobody wrapped are the browser's again.
    expect(FakeXHR.prototype.open).toBe(nativeXhr.open);
    expect(FakeXHR.prototype.setRequestHeader).toBe(nativeXhr.setRequestHeader);

    const response = await fetch("/api/items");
    expect(await response.text()).toBe("ok");
    const xhr = new XMLHttpRequest();
    xhr.open("GET", "/api/items");
    xhr.setRequestHeader("a", "b");
    xhr.send();
    expect(wrapped).toBe(2);
    expect(net.calls.length).toBe(1);
    expect(FakeXHR.sent.length).toBe(1);
    expect(store?.entries()).toEqual([]);
    FakeXHR.prototype.send = nativeXhr.send;
  });

  test("a request still out when the page is handed back ends without a note or a fault", async () => {
    let release = (_response: Response): void => {};
    net.answer = () => new Promise((resolve) => (release = resolve));
    start();
    const store = requestLog();
    const pending = fetch("/api/slow");
    const xhr = new XMLHttpRequest();
    xhr.open("GET", "/api/slow");
    xhr.send();
    stop();
    release(new Response("late", { headers: { "content-type": "text/plain" } }));
    expect(await (await pending).text()).toBe("late");
    FakeXHR.sent[0]?.head(200);
    FakeXHR.sent[0]?.done();
    FakeObserver.emit(timed("http://app.test/late.png", 1));
    await settle();
    expect(store?.entries()).toEqual([]);
  });
});

describe("the copy in the device frame", () => {
  /** The page's recorder, then the frame's on a window of its own, as far as fetch goes. */
  function framed(origin: number, above: () => Shared | null): ReturnType<typeof record> & { leave(): void } {
    globalThis.fetch = net.native;
    const clock = fakeClock(origin);
    const timer = manual();
    const recorder = createRecorder({
      source: "frame",
      clock,
      origin: ORIGIN,
      schedule: timer.schedule,
      above,
    });
    const rows = () => recorder.store.entries();
    const ours = globalThis.fetch;
    return {
      recorder,
      clock,
      timer,
      net,
      rows,
      row: () => {
        const [only] = rows();
        if (!only) throw new Error("no row");
        return only;
      },
      leave() {
        globalThis.fetch = ours;
        recorder.uninstall();
      },
    };
  }

  test("sends its rows up to the page's log, marked as the frame's", async () => {
    const top = record(net);
    await fetch("/api/top");
    const frame = framed(LOADED + 500, () => top.recorder);
    await fetch("/api/framed", { method: "POST", body: "hi", headers: { "x-a": "1" } });
    expect(top.rows().length).toBe(1);
    frame.timer.run();
    await settle();
    frame.timer.run();
    expect(top.rows().map((row) => [row.url, row.source, row.state])).toEqual([
      ["http://app.test/api/top", "top", "ok"],
      ["http://app.test/api/framed", "frame", "ok"],
    ]);
    const [, sent] = top.rows();
    expect(sent).toEqual(frame.row());
    // A copy of its own, so nothing of the frame's window is kept.
    expect(sent).not.toBe(frame.row());
    expect(sent?.requestHeaders).not.toBe(frame.row().requestHeaders);
    expect(sent?.timing).not.toBe(frame.row().timing);
    expect(sent?.timing.start).toBe(LOADED + 500);
    frame.leave();
    top.recorder.uninstall();
  });

  test("the page's own timings never land on a row of the frame", async () => {
    const top = record(net);
    const frame = framed(LOADED, () => top.recorder);
    await fetch("/api/framed");
    frame.timer.run();
    const [pages] = Array.from(FakeObserver.live);
    const entry = timed("http://app.test/api/framed", 0, { initiatorType: "fetch" });
    pages?.deliver({ getEntries: () => [entry] });
    expect(top.rows().map((row) => [row.source, row.detail, row.sizes !== null])).toEqual([
      ["frame", "full", false],
      ["top", "light", true],
    ]);
    frame.leave();
    top.recorder.uninstall();
  });

  test("rows it sent stay when the frame loads again, and no two ids are the same", async () => {
    const top = record(net);
    await fetch("/api/top");
    const first = framed(LOADED + 500, () => top.recorder);
    await fetch("/api/framed");
    first.timer.run();
    const firstId = first.row().id;
    first.leave();
    const second = framed(LOADED + 2000, () => top.recorder);
    await fetch("/api/framed");
    second.timer.run();
    expect(top.rows().map((row) => row.source)).toEqual(["top", "frame", "frame"]);
    expect(new Set(top.rows().map((row) => row.id)).size).toBe(3);
    expect(firstId).not.toBe(second.row().id);
    second.leave();
    top.recorder.uninstall();
  });

  test("a row from before the page's log was cleared does not come back", async () => {
    const top = record(net);
    let release = (_response: Response): void => {};
    net.answer = () => new Promise((resolve) => (release = resolve));
    const frame = framed(LOADED, () => top.recorder);
    const pending = fetch("/api/slow");
    frame.timer.run();
    expect(top.rows().length).toBe(1);
    top.clock.tick(50);
    top.recorder.store.clear();
    release(new Response("ok"));
    await pending;
    frame.timer.run();
    expect(frame.row().state).toBe("ok");
    expect(top.rows()).toEqual([]);
    frame.leave();
    top.recorder.uninstall();
  });

  test("a page whose log comes up later gets every row the frame has", async () => {
    const top = record(net);
    let reach: Shared | null = null;
    const frame = framed(LOADED, () => reach);
    await fetch("/api/one");
    frame.timer.run();
    expect(top.rows()).toEqual([]);
    reach = top.recorder;
    await fetch("/api/two");
    frame.timer.run();
    expect(top.rows().map((row) => row.url)).toEqual(["http://app.test/api/one", "http://app.test/api/two"]);
    frame.leave();
    top.recorder.uninstall();
  });

  test("as its page goes, what it still waits for is ended and sent up at once", async () => {
    const top = record(net);
    net.answer = () => new Promise(() => {});
    const frame = framed(LOADED, () => top.recorder);
    void fetch("/api/slow");
    frame.timer.run();
    expect(top.rows().map((row) => row.state)).toEqual(["pending"]);
    globalThis.dispatchEvent(Object.assign(new Event("pagehide"), { persisted: true }));
    expect(top.rows().map((row) => row.state)).toEqual(["pending"]);
    globalThis.dispatchEvent(Object.assign(new Event("pagehide"), { persisted: false }));
    expect(top.rows().map((row) => row.state)).toEqual(["aborted"]);
    frame.leave();
    top.recorder.uninstall();
  });

  test("stops listening for its page to go once it lets the page go", () => {
    const top = record(net);
    const add = globalThis.addEventListener;
    const remove = globalThis.removeEventListener;
    const heard = new Set<unknown>();
    globalThis.addEventListener = (type: string, listener: unknown) => {
      if (type === "pagehide") heard.add(listener);
    };
    globalThis.removeEventListener = (type: string, listener: unknown) => {
      if (type === "pagehide") heard.delete(listener);
    };
    try {
      const frame = framed(LOADED, () => top.recorder);
      expect(heard.size).toBe(1);
      frame.leave();
      expect(heard.size).toBe(0);
    } finally {
      globalThis.addEventListener = add;
      globalThis.removeEventListener = remove;
      top.recorder.uninstall();
    }
  });

  test("with no log above, or none it may read, it keeps its rows to itself", async () => {
    const frame = framed(LOADED, () => null);
    await fetch("/api/framed");
    frame.timer.run();
    expect(frame.rows().length).toBe(1);
    frame.leave();
    const blocked = new Proxy(
      {},
      {
        get() {
          throw new Error("SecurityError");
        },
      },
    );
    expect(shared(blocked)).toBeNull();
  });
});

describe("real time", () => {
  afterEach(() => {
    takeOver();
    Reflect.deleteProperty(globalThis, Symbol.for("devknobs.early.clock"));
  });

  test("a row is stamped with the real time while the clock knob is set", async () => {
    const AT = NativeDate.UTC(2031, 0, 1);
    Reflect.deleteProperty(globalThis, Symbol.for("devknobs.early.clock"));
    earlyClock({ ...DEFAULT_STATE.clock, mode: "frozen", at: AT, since: AT });
    expect(Date.now()).toBe(AT);
    net.answer = () => Promise.resolve(new Response("ok", { headers: { "content-type": "text/plain" } }));
    const before = NativeDate.now();
    start();
    await fetch("/api/items");
    await settle();
    const [row] = requestLog()?.entries() ?? [];
    const after = NativeDate.now();
    expect(row?.timing.start).toBeGreaterThan(before - 50);
    expect(row?.timing.start).toBeLessThan(after + 50);
    expect(row?.timing.duration).toBeLessThan(1000);
    const clock = pageClock();
    expect(Math.abs(clock.origin + clock.now() - NativeDate.now())).toBeLessThan(50);
  });
});

describe("what stays on the page", () => {
  test("nothing is written to web storage, or read from it", async () => {
    let touched = 0;
    const storage = new Proxy(
      {},
      {
        get() {
          touched++;
          return () => null;
        },
        set() {
          touched++;
          return true;
        },
      },
    );
    for (const key of ["localStorage", "sessionStorage"]) {
      Object.defineProperty(globalThis, key, { configurable: true, value: storage });
    }
    try {
      FakeObserver.buffered = [timed("http://app.test/app.css", 5)];
      start();
      const heard: number[] = [];
      requestLog()?.subscribe((changed) => heard.push(changed.length));
      await fetch("/api/items", { method: "POST", body: "secret" });
      const xhr = new XMLHttpRequest();
      xhr.open("GET", "/api/items");
      xhr.send();
      FakeXHR.sent[0]?.head(200);
      FakeXHR.sent[0]?.done();
      await settle();
      requestLog()?.flush();
      requestLog()?.clear();
      stop();
      expect(heard.length).toBeGreaterThan(0);
      expect(touched).toBe(0);
    } finally {
      for (const key of ["localStorage", "sessionStorage"]) Reflect.deleteProperty(globalThis, key);
    }
  });

  test("the log is on the window for the copies of devknobs, and nowhere else", () => {
    start();
    const recorder = shared();
    expect(Reflect.get(globalThis, SHARED)).toBe(recorder);
    expect(Object.keys(globalThis).some((key) => key.includes("devknobs"))).toBe(false);
    share(null);
    expect(shared()).toBeNull();
    share(recorder);
  });
});
