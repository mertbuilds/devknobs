import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { setClock } from "../src/engine/clock";
import { apply, NOW_HEADER, reset, sameOrigin, sends } from "../src/engine/header";
import { DEFAULT_STATE } from "../src/engine/store";
import type { ClockValue } from "../src/types";

const BASE = "http://app.test/dash/page";
const AT = Date.UTC(2026, 9, 4, 9, 30);
const STAMP = new Date(AT).toISOString();

const realFetch = globalThis.fetch;

/** The browser's own XMLHttpRequest, as far as the knob can tell. */
class FakeXHR {
  opened = false;
  headers: Record<string, string> = {};
  body: unknown = undefined;
  open(_method: string, _url: string | URL): void {
    this.opened = true;
  }
  setRequestHeader(name: string, value: string): void {
    if (!this.opened) throw new Error("InvalidStateError");
    this.headers[name] = value;
  }
  send(body?: unknown): void {
    this.body = body ?? null;
  }
}

const nativeXHR = { open: FakeXHR.prototype.open, send: FakeXHR.prototype.send };

let calls: [RequestInfo | URL, RequestInit | undefined][] = [];

const fakeFetch = (input: RequestInfo | URL, init?: RequestInit) => {
  calls.push([input, init]);
  return Promise.resolve(new Response("ok"));
};

/** The request the server would get from a recorded call. */
function received(index: number): Request {
  const [input, init] = calls[index]!;
  const absolute = input instanceof Request ? input : new URL(String(input), BASE);
  return new Request(absolute, init);
}

function clock(patch: Partial<ClockValue>): ClockValue {
  return { ...DEFAULT_STATE.clock, mode: "frozen", at: AT, since: AT, header: true, ...patch };
}

function turnOn(value = clock({})): void {
  setClock(value);
  apply(value);
}

beforeEach(() => {
  calls = [];
  Object.defineProperty(globalThis, "document", { configurable: true, value: { baseURI: BASE } });
  Object.defineProperty(globalThis, "location", {
    configurable: true,
    value: { origin: "http://app.test" },
  });
  Object.defineProperty(globalThis, "XMLHttpRequest", { configurable: true, value: FakeXHR });
  globalThis.fetch = fakeFetch as typeof fetch;
});

afterEach(() => {
  reset();
  setClock(null);
  globalThis.fetch = realFetch;
  for (const key of ["document", "location", "XMLHttpRequest"]) {
    Reflect.deleteProperty(globalThis, key);
  }
});

describe("sends", () => {
  test("only when asked for and a clock is set", () => {
    expect(sends(clock({}))).toBe(true);
    expect(sends(clock({ mode: "offset" }))).toBe(true);
    expect(sends(clock({ header: false }))).toBe(false);
    expect(sends(clock({ mode: "system" }))).toBe(false);
  });
});

describe("sameOrigin", () => {
  test("takes relative URLs against the page", () => {
    expect(sameOrigin("/api/now")).toBe(true);
    expect(sameOrigin("api/now?x=1")).toBe(true);
    expect(sameOrigin("http://app.test:80/api")).toBe(true);
  });

  test("refuses every other origin, and opaque ones", () => {
    expect(sameOrigin("https://app.test/api")).toBe(false);
    expect(sameOrigin("http://app.test:8080/api")).toBe(false);
    expect(sameOrigin("//cdn.test/x.js")).toBe(false);
    expect(sameOrigin("data:text/plain,hi")).toBe(false);
    expect(sameOrigin("http://[bad")).toBe(false);
  });
});

describe("fetch", () => {
  test("same-origin requests carry the clock's instant", async () => {
    turnOn();
    await fetch("/api/now");
    await fetch("http://app.test/api/now");
    await fetch(new URL("/api/now", BASE));
    for (let index = 0; index < 3; index++) {
      expect(received(index).headers.get(NOW_HEADER)).toBe(STAMP);
    }
  });

  test("the page's own headers, method and body stay", async () => {
    turnOn();
    await fetch("/a", { method: "POST", headers: { "x-a": "1" }, body: "hi" });
    const own = new Request("http://app.test/b", { method: "PUT", headers: { "x-b": "2" } });
    await fetch(own);
    await fetch(own.clone(), { method: "PATCH" });
    const [first, second, third] = [received(0), received(1), received(2)];
    expect([first.method, first.headers.get("x-a"), await first.text()]).toEqual([
      "POST",
      "1",
      "hi",
    ]);
    expect([second.method, second.headers.get("x-b")]).toEqual(["PUT", "2"]);
    expect([third.method, third.headers.get("x-b")]).toEqual(["PATCH", "2"]);
    for (const request of [first, second, third])
      expect(request.headers.get(NOW_HEADER)).toBe(STAMP);
    expect(own.headers.has(NOW_HEADER)).toBe(false);
  });

  test("other origins get nothing, the call untouched", async () => {
    turnOn();
    const init = { headers: { "x-a": "1" } };
    await fetch("https://api.other.test/x", init);
    await fetch("//cdn.test/x.json");
    expect(calls[0]![1]).toBe(init);
    expect(calls[1]![1]).toBeUndefined();
    expect(received(0).headers.has(NOW_HEADER)).toBe(false);
  });

  test("follows the clock as it moves", async () => {
    turnOn();
    await fetch("/a");
    turnOn(clock({ at: AT + 1000 }));
    await fetch("/a");
    expect(received(1).headers.get(NOW_HEADER)).toBe(new Date(AT + 1000).toISOString());
  });

  test("off, or with the real clock, fetch is the page's own", () => {
    turnOn(clock({ header: false }));
    expect(globalThis.fetch).toBe(fakeFetch as typeof fetch);
    turnOn(clock({ mode: "system" }));
    expect(globalThis.fetch).toBe(fakeFetch as typeof fetch);
  });

  test("a request fetch would refuse goes through as it was, to reject there", async () => {
    turnOn();
    const init = { headers: { "not a name": "x" } };
    await fetch("/a", init);
    expect(calls[0]).toEqual(["/a", init]);
    expect(calls[0]![1]).toBe(init);
  });
});

describe("XMLHttpRequest", () => {
  function send(url: string): FakeXHR {
    const request = new XMLHttpRequest() as unknown as FakeXHR;
    request.open("GET", url);
    request.send("body");
    return request;
  }

  test("same-origin requests carry the header, other origins do not", () => {
    turnOn();
    const own = send("/api/now");
    expect(own.headers).toEqual({ [NOW_HEADER]: STAMP });
    expect(own.body).toBe("body");
    expect(send("https://api.other.test/now").headers).toEqual({});
  });

  test("a send before open still reaches the page's own send", () => {
    turnOn();
    const request = new XMLHttpRequest() as unknown as FakeXHR;
    request.send();
    expect(request.body).toBeNull();
  });
});

describe("reset", () => {
  test("puts fetch and XMLHttpRequest back", () => {
    turnOn();
    expect(globalThis.fetch).not.toBe(fakeFetch as typeof fetch);
    reset();
    expect(globalThis.fetch).toBe(fakeFetch as typeof fetch);
    expect(FakeXHR.prototype.open).toBe(nativeXHR.open);
    expect(FakeXHR.prototype.send).toBe(nativeXHR.send);
  });

  test("leaves a wrapper someone added on top, passing through", async () => {
    turnOn();
    const ours = globalThis.fetch;
    const theirs = ((input: RequestInfo | URL, init?: RequestInit) =>
      ours(input, init)) as typeof fetch;
    globalThis.fetch = theirs;
    turnOn(clock({ header: false }));
    expect(globalThis.fetch).toBe(theirs);
    await fetch("/a");
    expect(received(0).headers.has(NOW_HEADER)).toBe(false);
  });
});
