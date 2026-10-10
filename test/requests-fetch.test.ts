import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { BODY_CAP } from "../src/requests/types";
import { answerFrom, fakePage, leavePage, type Page, record, settle, streamOf } from "./requests-fakes";

let page: Page;

beforeEach(() => {
  page = record(fakePage());
});

afterEach(() => {
  page.recorder.uninstall();
  leavePage();
});

function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "content-type": "application/json", ...init.headers },
  });
}

describe("a request that works", () => {
  test("is noted whole, and the page gets the browser's own response", async () => {
    const native = json({ hello: "world" }, { status: 201, statusText: "Created", headers: { "x-trace": "abc" } });
    page.net.answer = () => {
      page.clock.tick(40);
      return Promise.resolve(native);
    };
    page.clock.tick(100);
    const pending = fetch("/api/items?x=1#top", { method: "post", body: '{"a":1}', headers: { "Content-Type": "application/json" } });
    expect(page.row()).toMatchObject({ state: "pending", kind: "fetch", detail: "full", source: "top" });
    const response = await pending;
    expect(response).toBe(native);
    expect(response.bodyUsed).toBe(false);
    page.clock.tick(5);
    await settle();
    // The page reads its response after the log read its copy.
    expect(await response.json()).toEqual({ hello: "world" });
    const row = page.row();
    expect(row).toMatchObject({
      method: "POST",
      url: "http://app.test/api/items?x=1#top",
      state: "ok",
      status: 201,
      statusText: "Created",
      error: null,
      redirected: false,
      contentType: "application/json",
      requestHeaders: [["Content-Type", "application/json"]],
      requestBody: { kind: "text", text: '{"a":1}', size: 7, truncated: false, type: "application/json" },
      responseBody: { kind: "text", text: '{"hello":"world"}', size: 17, truncated: false },
      sizes: null,
      initiatorType: "",
    });
    expect(row.responseHeaders).toContainEqual(["x-trace", "abc"]);
    expect(row.timing).toEqual({ start: 1_700_000_000_100, at: 100, response: 40, end: 1_700_000_000_145, duration: 45 });
  });

  test("the browser gets the page's arguments as they came", async () => {
    const init = { cache: "no-store" as const };
    await fetch("/one");
    await fetch("/two", init);
    expect(page.net.counts).toEqual([1, 2]);
    expect(page.net.calls[0]).toEqual(["/one", undefined]);
    expect(page.net.calls[1]?.[1]).toBe(init);
    const request = new Request("http://app.test/three");
    await fetch(request);
    expect(page.net.calls[2]?.[0]).toBe(request);
  });

  test("names the call that made it, with no frame of devknobs", async () => {
    async function loadItems(): Promise<number> {
      const response = await fetch("/api/items");
      return response.status;
    }
    await loadItems();
    const frames = page.row().initiator.split("\n");
    expect(frames[0]).toContain("loadItems");
    expect(frames[0]).toContain("requests-fetch.test.ts");
    expect(page.row().initiator).not.toContain("src/requests");
  });

  test("an empty answer has no body, and is over at once", async () => {
    page.net.answer = () => Promise.resolve(new Response(null, { status: 204 }));
    await fetch("/api/ping");
    expect(page.row()).toMatchObject({ state: "ok", status: 204, responseBody: null });
    expect(page.row().timing.end).not.toBeNull();
  });
});

describe("headers", () => {
  test("are noted from a record, a list of pairs, and a Headers", async () => {
    await fetch("/a", { headers: { "X-One": "1", Accept: "text/plain" } });
    await fetch("/b", { headers: [["X-Two", "2"], ["X-Two", "again"]] });
    await fetch("/c", { headers: new Headers({ "X-Three": "3" }) });
    const [a, b, c] = page.rows();
    expect(a?.requestHeaders).toEqual([["X-One", "1"], ["Accept", "text/plain"]]);
    expect(b?.requestHeaders).toEqual([["X-Two", "2"], ["X-Two", "again"]]);
    expect(c?.requestHeaders).toEqual([["x-three", "3"]]);
  });

  test("a Request brings its own, which the init's take the place of", async () => {
    const request = new Request("http://api.test/x", { method: "PUT", headers: { "x-from": "request" }, body: "one" });
    await fetch(request);
    await fetch(new Request("http://api.test/y", { headers: { "x-from": "request" } }), {
      method: "DELETE",
      headers: { "x-from": "init" },
    });
    const [first, second] = page.rows();
    expect(first).toMatchObject({ method: "PUT", url: "http://api.test/x", requestHeaders: expect.arrayContaining([["x-from", "request"]]) });
    expect(second).toMatchObject({ method: "DELETE", requestHeaders: [["x-from", "init"]] });
  });

  test("a secret is noted as the page set it", async () => {
    await fetch("/a", { headers: { Authorization: "Bearer s3cret" } });
    expect(page.row().requestHeaders).toEqual([["Authorization", "Bearer s3cret"]]);
  });
});

describe("request bodies", () => {
  test("a Request's text body is read from a copy, and the request still goes out whole", async () => {
    const request = new Request("http://app.test/api", {
      method: "POST",
      body: "name=Ada",
      headers: { "content-type": "application/x-www-form-urlencoded" },
    });
    await fetch(request);
    await settle();
    expect(page.row().requestBody).toMatchObject({ kind: "text", text: "name=Ada", size: 8 });
    expect(request.bodyUsed).toBe(false);
    expect(await request.text()).toBe("name=Ada");
  });

  test("a Request's bytes are named and never copied", async () => {
    const request = new Request("http://app.test/api", {
      method: "POST",
      body: new Uint8Array(4),
      headers: { "content-type": "application/octet-stream" },
    });
    let copies = 0;
    request.clone = () => {
      copies++;
      throw new Error("copied");
    };
    await fetch(request);
    await settle();
    expect(page.row().requestBody).toMatchObject({ kind: "binary", type: "application/octet-stream" });
    expect(copies).toBe(0);
  });

  test("a stream the page sends is named and never read", async () => {
    const { stream } = streamOf(["chunk"], false);
    const init = { method: "POST", body: stream, duplex: "half" };
    await fetch("/upload", init);
    expect(page.row().requestBody).toMatchObject({ kind: "stream", text: "", size: null });
    expect(stream.locked).toBe(false);
  });

  test("a form and bytes in the init", async () => {
    const form = new FormData();
    form.set("q", "tea");
    await fetch("/a", { method: "POST", body: form });
    await fetch("/b", { method: "POST", body: new Blob(["12345"], { type: "image/png" }) });
    const [a, b] = page.rows();
    expect(a?.requestBody).toMatchObject({ kind: "form", text: "q=tea" });
    expect(b?.requestBody).toMatchObject({ kind: "binary", size: 5, type: "image/png" });
  });
});

describe("answers", () => {
  test("an http error is a failed request with its status and body", async () => {
    page.net.answer = () => Promise.resolve(json({ error: "nope" }, { status: 404, statusText: "Not Found" }));
    const response = await fetch("/api/missing");
    expect(response.status).toBe(404);
    await settle();
    expect(page.row()).toMatchObject({
      state: "failed",
      status: 404,
      statusText: "Not Found",
      error: null,
      responseBody: { text: '{"error":"nope"}' },
    });
  });

  test("a redirect is noted with where the answer came from", async () => {
    page.net.answer = () =>
      Promise.resolve(answerFrom(json({}), { url: "http://app.test/api/v2/items", redirected: true }));
    await fetch("/api/items");
    expect(page.row()).toMatchObject({
      url: "http://app.test/api/items",
      finalUrl: "http://app.test/api/v2/items",
      redirected: true,
    });
  });

  test("an opaque answer is noted as one, with nothing read", async () => {
    const native = answerFrom(new Response(null), { type: "opaque", status: 0, ok: false, url: "" });
    let copies = 0;
    native.clone = () => {
      copies++;
      return native;
    };
    page.net.answer = () => Promise.resolve(native);
    expect(await fetch("http://cdn.test/pixel", { mode: "no-cors" })).toBe(native);
    await settle();
    expect(page.row()).toMatchObject({
      state: "ok",
      status: 0,
      finalUrl: null,
      responseBody: { kind: "opaque", text: "", size: null },
    });
    expect(copies).toBe(0);
  });

  test("bytes are named and counted, never copied or read", async () => {
    const native = new Response(new Uint8Array(2048), {
      headers: { "content-type": "image/png", "content-length": "2048" },
    });
    let copies = 0;
    native.clone = () => {
      copies++;
      throw new Error("copied");
    };
    page.net.answer = () => Promise.resolve(native);
    const response = await fetch("/logo.png");
    await settle();
    expect(page.row().responseBody).toEqual({ kind: "binary", text: "", size: 2048, truncated: false, type: "image/png" });
    expect(copies).toBe(0);
    expect((await response.arrayBuffer()).byteLength).toBe(2048);
  });

  test("a long text is kept up to the cap, and the page still reads all of it", async () => {
    const long = "x".repeat(BODY_CAP + 500);
    page.net.answer = () => Promise.resolve(new Response(long, { headers: { "content-type": "text/plain" } }));
    const response = await fetch("/big.txt");
    await settle();
    const body = page.row().responseBody;
    expect(body).toMatchObject({ kind: "text", truncated: true, size: null });
    expect(body?.text.length).toBe(BODY_CAP);
    expect((await response.text()).length).toBe(BODY_CAP + 500);
  });

  test("a body that streams in does not hold the page's response back", async () => {
    const source = streamOf(["data: 1\n\n"], false);
    const native = new Response(source.stream, { headers: { "content-type": "text/event-stream" } });
    page.net.answer = () => Promise.resolve(native);
    const response = await fetch("/events");
    expect(response).toBe(native);
    await settle();
    // The answer is in, the body is not: nothing of it is known yet.
    expect(page.row()).toMatchObject({ state: "ok", status: 200, responseBody: null });
    expect(page.row().timing).toMatchObject({ response: 0, end: null, duration: null });
    const reader = response.body?.getReader();
    expect(new TextDecoder().decode((await reader?.read())?.value)).toBe("data: 1\n\n");
  });
});

describe("requests that fail", () => {
  test("a network error reaches the page as the same error", async () => {
    const error = new TypeError("Failed to fetch");
    page.net.answer = () => {
      page.clock.tick(7);
      return Promise.reject(error);
    };
    const caught: unknown = await fetch("/api/down").catch((reason: unknown) => reason);
    expect(caught).toBe(error);
    expect(page.row()).toMatchObject({
      state: "failed",
      status: null,
      error: "TypeError: Failed to fetch",
      responseBody: null,
    });
    expect(page.row().timing).toMatchObject({ response: null, duration: 7 });
  });

  test("an abort is told from a failure by the signal", async () => {
    const controller = new AbortController();
    page.net.answer = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      });
    const pending = fetch("/api/slow", { signal: controller.signal });
    controller.abort();
    const caught: unknown = await pending.catch((reason: unknown) => reason);
    expect(caught).toBe(controller.signal.reason);
    expect(page.row()).toMatchObject({ state: "aborted", status: null });
  });

  test("a Request's own signal counts too", async () => {
    const controller = new AbortController();
    const request = new Request("http://app.test/api/slow", { signal: controller.signal });
    page.net.answer = () =>
      new Promise((_resolve, reject) => {
        request.signal.addEventListener("abort", () => reject(new DOMException("gone", "AbortError")));
      });
    const pending = fetch(request);
    controller.abort();
    await pending.catch(() => {});
    expect(page.row().state).toBe("aborted");
  });

  test("an abort in the middle of the body ends the row as aborted", async () => {
    const controller = new AbortController();
    const stream = new ReadableStream<Uint8Array>({
      start(inner) {
        inner.enqueue(new TextEncoder().encode("half"));
        controller.signal.addEventListener("abort", () => inner.error(controller.signal.reason));
      },
    });
    page.net.answer = () => Promise.resolve(new Response(stream, { headers: { "content-type": "text/plain" } }));
    await fetch("/api/slow", { signal: controller.signal });
    await settle();
    expect(page.row().state).toBe("ok");
    controller.abort();
    await settle();
    expect(page.row().state).toBe("aborted");
  });

  test("a fault in the note-taking never reaches the page", async () => {
    const hostile = {
      get method(): string {
        throw new Error("hostile");
      },
    };
    const response = await fetch("/api/items", hostile);
    expect(await response.text()).toBe("ok");
    expect(page.rows()).toEqual([]);
  });
});

describe("the patch", () => {
  test("answers for the browser's fetch where a page looks", () => {
    expect(fetch).not.toBe(page.net.native);
    expect(fetch.name).toBe("fetch");
    expect(fetch.length).toBe(page.net.native.length);
    expect(String(fetch)).toBe(Function.prototype.toString.call(page.net.native));
    expect(`${fetch}`).not.toContain("log.active");
    // What a polyfill or a runtime hung on the browser's is on ours too.
    expect(fetch.preconnect).toBe(page.net.native.preconnect);
  });

  test("notes nothing while no listener is there, beyond the rows", async () => {
    await fetch("/a");
    await settle();
    expect(page.timer.waiting()).toBe(0);
  });
});
