import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { BODY_CAP } from "../src/requests/types";
import { JSON_LIMIT, parseHeaders } from "../src/requests/xhr";
import { FakeXHR, fakePage, leavePage, type Page, record } from "./requests-fakes";

const native = {
  open: FakeXHR.prototype.open,
  setRequestHeader: FakeXHR.prototype.setRequestHeader,
  send: FakeXHR.prototype.send,
};

let page: Page;

beforeEach(() => {
  page = record(fakePage());
});

afterEach(() => {
  page.recorder.uninstall();
  leavePage();
});

/** A request the page opened and sent, as a browser's own object. */
function sent(method = "GET", url = "/api/items", body?: unknown): FakeXHR {
  const xhr = new XMLHttpRequest();
  xhr.open(method, url);
  xhr.send(body as XMLHttpRequestBodyInit | undefined);
  const fake = FakeXHR.sent.at(-1);
  if (!fake) throw new Error("nothing sent");
  return fake;
}

describe("a request from open to the end", () => {
  test("is noted at each step", () => {
    const xhr = new XMLHttpRequest();
    xhr.open("post", "/api/items?x=1");
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.setRequestHeader("X-Trace", "abc");
    expect(page.rows()).toEqual([]);
    page.clock.tick(100);
    xhr.send('{"a":1}');
    const fake = FakeXHR.sent[0];
    if (!fake) throw new Error("nothing sent");
    expect(fake).toMatchObject({ method: "post", url: "/api/items?x=1", body: '{"a":1}' });
    expect(fake.requestHeaders).toEqual({ "Content-Type": "application/json", "X-Trace": "abc" });
    expect(page.row()).toMatchObject({
      kind: "xhr",
      detail: "full",
      state: "pending",
      method: "POST",
      url: "http://app.test/api/items?x=1",
      requestHeaders: [["Content-Type", "application/json"], ["X-Trace", "abc"]],
      requestBody: { kind: "text", text: '{"a":1}', type: "application/json" },
    });
    expect(page.row().initiator).toContain("requests-xhr.test.ts");
    expect(page.row().initiator).not.toContain("src/requests");

    page.clock.tick(30);
    fake.head(200, { "content-type": "application/json", "x-served-by": "edge" });
    expect(page.row()).toMatchObject({ state: "pending", status: 200, contentType: "application/json" });
    expect(page.row().timing).toMatchObject({ response: 30, end: null });

    page.clock.tick(12);
    fake.text = '{"ok":true}';
    fake.responseURL = "http://app.test/api/items?x=1";
    fake.done();
    expect(page.row()).toMatchObject({
      state: "ok",
      status: 200,
      statusText: "OK",
      redirected: false,
      finalUrl: "http://app.test/api/items?x=1",
      responseHeaders: [["content-type", "application/json"], ["x-served-by", "edge"]],
      responseBody: { kind: "text", text: '{"ok":true}', size: 11, truncated: false, type: "application/json" },
    });
    expect(page.row().timing).toEqual({ start: 1_700_000_000_100, at: 100, response: 30, end: 1_700_000_000_142, duration: 42 });
  });

  test("the object is the browser's own still", () => {
    const xhr = new XMLHttpRequest();
    expect(xhr instanceof XMLHttpRequest).toBe(true);
    expect(XMLHttpRequest).toBe(FakeXHR as unknown as typeof XMLHttpRequest);
    class Mine extends XMLHttpRequest {}
    const mine = new Mine();
    mine.open("GET", "/mine");
    mine.send();
    expect(mine instanceof XMLHttpRequest).toBe(true);
    expect(page.row().url).toBe("http://app.test/mine");
    expect(XMLHttpRequest.prototype.open.name).toBe("open");
    expect(XMLHttpRequest.prototype.send.length).toBe(native.send.length);
    expect(String(XMLHttpRequest.prototype.send)).toBe(Function.prototype.toString.call(native.send));
  });

  test("the browser's open gets the page's arguments and no more, so none is made to wait", () => {
    const two = new XMLHttpRequest();
    two.open("GET", "/a");
    const five = new XMLHttpRequest();
    five.open("GET", "/b", true, "ada", "pw");
    // A third argument the page did not give would read as false: a request that blocks the page.
    expect([two, five].map((xhr) => (xhr instanceof FakeXHR ? xhr.opens : null))).toEqual([[2], [5]]);
  });

  test("a send the browser refuses throws to the page as it would, and the row says so", () => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/items");
    if (!(xhr instanceof FakeXHR)) throw new Error("not the fake");
    const refused = new Error("NetworkError");
    xhr.refuses = refused;
    let caught: unknown = null;
    try {
      xhr.send("x");
    } catch (error) {
      caught = error;
    }
    expect(caught).toBe(refused);
    expect(page.row()).toMatchObject({ state: "failed", error: "Error: NetworkError" });
    // Nothing of devknobs' stays on an object that never sent.
    expect(xhr.listening).toBe(0);
  });

  test("the listeners go with the request, however it ends", () => {
    const ok = sent("GET", "/a");
    expect(ok.listening).toBeGreaterThan(0);
    ok.head(200);
    ok.done();
    const failed = sent("GET", "/b");
    failed.end("error");
    const again = new XMLHttpRequest();
    again.open("GET", "/c");
    again.send();
    again.open("GET", "/d");
    expect([ok, failed, again].map((xhr) => (xhr instanceof FakeXHR ? xhr.listening : null))).toEqual([0, 0, 0]);
  });

  test("the browser's own errors reach the page, and note nothing", () => {
    const xhr = new XMLHttpRequest();
    expect(() => xhr.setRequestHeader("a", "b")).toThrow("InvalidStateError");
    expect(() => xhr.send()).toThrow("InvalidStateError");
    expect(page.rows()).toEqual([]);
  });

  test("a redirect shows in where the answer came from", () => {
    const fake = sent("GET", "/old#part");
    fake.head(200);
    fake.responseURL = "http://app.test/new";
    fake.done();
    expect(page.row()).toMatchObject({ url: "http://app.test/old#part", finalUrl: "http://app.test/new", redirected: true });
    const same = sent("GET", "/same#part");
    same.responseURL = "http://app.test/same";
    same.head(200);
    same.done();
    expect(page.rows()[1]?.redirected).toBe(false);
  });

  test("an http error is a failed request with its body", () => {
    const fake = sent();
    fake.head(500, { "content-type": "text/plain" }, "Server Error");
    fake.text = "boom";
    fake.done();
    expect(page.row()).toMatchObject({ state: "failed", status: 500, statusText: "Server Error", responseBody: { text: "boom" } });
  });

  test("a long text is cut at the cap", () => {
    const fake = sent();
    fake.head(200, { "content-type": "text/plain" });
    fake.text = "x".repeat(BODY_CAP + 1);
    fake.done();
    expect(page.row().responseBody).toMatchObject({ truncated: true, size: null });
    expect(page.row().responseBody?.text.length).toBe(BODY_CAP);
  });
});

describe("requests that end without an answer", () => {
  test("an error, a timeout and an abort are told apart", () => {
    sent("GET", "/a").end("error");
    sent("GET", "/b").end("timeout");
    sent("GET", "/c").abort();
    expect(page.rows().map((row) => [row.state, row.error, row.status, row.responseBody])).toEqual([
      ["failed", "error", null, null],
      ["failed", "timeout", null, null],
      ["aborted", null, null, null],
    ]);
    expect(page.rows().every((row) => row.timing.end !== null)).toBe(true);
  });

  test("an object opened again mid-flight ends its first request, and the second is its own row", () => {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", "/first");
    xhr.send();
    xhr.open("GET", "/second");
    expect(page.row().state).toBe("aborted");
    xhr.send();
    const fake = FakeXHR.sent.at(-1);
    fake?.head(200);
    fake?.done();
    expect(page.rows().map((row) => [row.url, row.state])).toEqual([
      ["http://app.test/first", "aborted"],
      ["http://app.test/second", "ok"],
    ]);
  });

  test("an object the page sends again from its own load handler: both rows are right", () => {
    const xhr = new XMLHttpRequest();
    let again = true;
    // The page listens before it sends, so its handler was there first.
    xhr.addEventListener("load", () => {
      if (!again) return;
      again = false;
      xhr.open("GET", "/second");
      xhr.send();
    });
    xhr.open("GET", "/first");
    xhr.send();
    const fake = FakeXHR.sent[0];
    if (!fake) throw new Error("nothing sent");
    fake.head(200, { "content-type": "text/plain" });
    fake.text = "one";
    // The first request's `loadend` comes after the page has sent the second.
    fake.done();
    expect(page.rows().map((row) => [row.url, row.state, row.status, row.responseBody?.text ?? null])).toEqual([
      ["http://app.test/first", "ok", 200, "one"],
      ["http://app.test/second", "pending", null, null],
    ]);
    fake.head(201, { "content-type": "text/plain" });
    fake.text = "two";
    fake.done();
    expect(page.rows().map((row) => [row.url, row.state, row.status, row.responseBody?.text ?? null])).toEqual([
      ["http://app.test/first", "ok", 200, "one"],
      ["http://app.test/second", "ok", 201, "two"],
    ]);
    // Only the page's own listener is left on the object.
    expect(fake.listening).toBe(1);
  });

  test("an object the page sends again from its own readystatechange handler: both rows are right", () => {
    const xhr = new XMLHttpRequest();
    let again = true;
    xhr.addEventListener("readystatechange", () => {
      if (xhr.readyState !== 4 || !again) return;
      again = false;
      xhr.open("GET", "/second");
      xhr.send();
    });
    xhr.open("GET", "/first");
    xhr.send();
    const fake = FakeXHR.sent[0];
    if (!fake) throw new Error("nothing sent");
    fake.head(200, { "content-type": "text/plain" });
    fake.text = "one";
    fake.done();
    fake.head(404, { "content-type": "text/plain" });
    fake.text = "two";
    fake.done();
    expect(page.rows().map((row) => [row.url, row.state, row.status, row.responseBody?.text ?? null])).toEqual([
      ["http://app.test/first", "ok", 200, "one"],
      ["http://app.test/second", "failed", 404, "two"],
    ]);
  });

  test("an object used again after its end leaves the first row as it ended", () => {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", "/first");
    xhr.send();
    FakeXHR.sent[0]?.head(200);
    FakeXHR.sent[0]?.done();
    xhr.open("GET", "/second");
    xhr.send();
    expect(page.rows().map((row) => row.state)).toEqual(["ok", "pending"]);
  });
});

describe("once devknobs let the page go", () => {
  /** The page wraps the methods after devknobs, so its chain keeps devknobs' own in it. */
  function wrapped(): () => void {
    const proto = FakeXHR.prototype;
    const { open, send } = proto;
    proto.open = function (...args: Parameters<typeof open>): void {
      open.apply(this, args);
    };
    proto.send = function (...args: Parameters<typeof send>): void {
      send.apply(this, args);
    };
    return () => Object.assign(proto, native);
  }

  test("a request opened after that is not noted, and still goes out", () => {
    const unwrap = wrapped();
    try {
      page.recorder.uninstall();
      const fake = sent("GET", "/late");
      expect(fake.url).toBe("/late");
      expect(page.rows()).toEqual([]);
    } finally {
      unwrap();
    }
  });

  test("a request opened while one of devknobs' own goes out is not the page's to note", () => {
    const xhr = new XMLHttpRequest();
    page.recorder.quietly("http://app.test/own", () => xhr.open("GET", "/own"));
    xhr.send();
    expect(FakeXHR.sent.length).toBe(1);
    expect(page.rows()).toEqual([]);
  });

  test("a request opened before and sent after is not noted either", () => {
    const unwrap = wrapped();
    try {
      const xhr = new XMLHttpRequest();
      xhr.open("GET", "/late");
      page.recorder.uninstall();
      xhr.send();
      expect(FakeXHR.sent.length).toBe(1);
      expect(page.rows()).toEqual([]);
    } finally {
      unwrap();
    }
  });
});

describe("answers that are not text", () => {
  test("json is written out again", () => {
    const fake = sent();
    fake.responseType = "json";
    fake.head(200, { "content-type": "application/json" });
    fake.response = { a: [1, 2] };
    fake.done(11);
    expect(page.row().responseBody).toMatchObject({ kind: "text", text: '{"a":[1,2]}', truncated: false });
    expect(fake.reads).toBe(0);
  });

  test("big json is only counted, by its length where the browser told of no progress", () => {
    const fake = sent();
    fake.responseType = "json";
    fake.head(200, { "content-type": "application/json", "content-length": String(JSON_LIMIT + 1) });
    fake.response = {
      toJSON(): never {
        throw new Error("written out");
      },
    };
    fake.readyState = 4;
    fake.dispatchEvent(new Event("readystatechange"));
    expect(page.row()).toMatchObject({
      state: "ok",
      responseBody: { kind: "text", text: "", size: JSON_LIMIT + 1, truncated: true },
    });
  });

  test("big json is only counted", () => {
    const fake = sent();
    fake.responseType = "json";
    fake.head(200, { "content-type": "application/json" });
    fake.response = {
      toJSON(): never {
        throw new Error("written out");
      },
    };
    fake.done(JSON_LIMIT + 1);
    expect(page.row()).toMatchObject({
      state: "ok",
      responseBody: { kind: "text", text: "", size: JSON_LIMIT + 1, truncated: true },
    });
  });

  test("bytes are named and counted, and the text is never asked for", () => {
    const buffer = sent("GET", "/a.bin");
    buffer.responseType = "arraybuffer";
    buffer.head(200, { "content-type": "application/octet-stream" });
    buffer.response = new ArrayBuffer(64);
    buffer.done(64);
    const blob = sent("GET", "/a.png");
    blob.responseType = "blob";
    blob.head(200);
    blob.response = new Blob(["12345"]);
    blob.done(5);
    expect(page.rows().map((row) => row.responseBody)).toEqual([
      { kind: "binary", text: "", size: 64, truncated: false, type: "application/octet-stream" },
      { kind: "binary", text: "", size: 5, truncated: false, type: "blob" },
    ]);
    expect(buffer.reads + blob.reads).toBe(0);
    expect(page.rows().every((row) => row.state === "ok")).toBe(true);
  });

  test("bodies the page sends", () => {
    const form = new FormData();
    form.set("q", "tea");
    sent("POST", "/a", form);
    sent("POST", "/b", new Uint8Array(3));
    sent("GET", "/c");
    expect(page.rows().map((row) => row.requestBody?.kind ?? null)).toEqual(["form", "binary", null]);
  });
});

describe("parseHeaders", () => {
  test("reads the browser's block of headers", () => {
    expect(parseHeaders("content-type: text/html\r\nx-a:  b: c \r\n\r\n")).toEqual([
      ["content-type", "text/html"],
      ["x-a", "b: c"],
    ]);
    expect(parseHeaders("")).toEqual([]);
  });
});
