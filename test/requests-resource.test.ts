import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { hush, hushOnce, quietFetch } from "../src/requests/quiet";
import { share } from "../src/requests/shared";
import { FakeObserver, FakeXHR, fakePage, leavePage, type Page, record, settle, timed } from "./requests-fakes";

let page: Page;

afterEach(() => {
  page.recorder.uninstall();
  share(null);
  leavePage();
});

describe("light rows", () => {
  test("come from what the browser timed before the log started, the page itself first", () => {
    const net = fakePage();
    FakeObserver.buffered = [
      timed("http://app.test/app.css", 30, { initiatorType: "link", responseStatus: 200, contentType: "text/css" }),
      timed("http://app.test/dash/page", 0, {
        entryType: "navigation",
        initiatorType: "navigation",
        duration: 80,
        responseStart: 25,
        responseEnd: 60,
        responseStatus: 200,
      }),
      timed("http://app.test/missing.png", 45, { responseStatus: 404 }),
    ];
    page = record(net);
    const rows = page.rows();
    expect(rows.map((row) => [row.kind, row.url, row.initiatorType, row.state, row.status])).toEqual([
      ["navigation", "http://app.test/dash/page", "navigation", "ok", 200],
      ["resource", "http://app.test/app.css", "link", "ok", 200],
      ["resource", "http://app.test/missing.png", "img", "failed", 404],
    ]);
    expect(rows[1]).toMatchObject({
      detail: "light",
      source: "top",
      method: "",
      protocol: "h2",
      contentType: "text/css",
      requestHeaders: [],
      responseHeaders: [],
      requestBody: null,
      responseBody: null,
      initiator: "",
      sizes: { transfer: 1300, encoded: 1000, decoded: 4000, hidden: false },
      timing: { start: 1_700_000_000_030, at: 30, response: 12, end: 1_700_000_000_050, duration: 20 },
    });
    expect(new Set(rows.map((row) => row.id)).size).toBe(3);
  });

  test("come as the page loads more, with no status where the browser gives none", () => {
    page = record(fakePage());
    FakeObserver.emit(timed("http://app.test/a.js", 10, { initiatorType: "script" }));
    expect(page.row()).toMatchObject({ kind: "resource", initiatorType: "script", status: null, state: "ok" });
  });

  test("sizes a server on another origin kept are hidden, not empty", () => {
    page = record(fakePage());
    const zero = { transferSize: 0, encodedBodySize: 0, decodedBodySize: 0, responseStart: 0 };
    FakeObserver.emit(
      timed("http://cdn.test/font.woff2", 10, { ...zero, initiatorType: "css" }),
      timed("http://app.test/empty.txt", 20, zero),
      timed("http://cdn.test/open.js", 30, { transferSize: 0, encodedBodySize: 90, decodedBodySize: 200 }),
    );
    expect(page.rows().map((row) => row.sizes)).toEqual([
      { transfer: 0, encoded: 0, decoded: 0, hidden: true },
      { transfer: 0, encoded: 0, decoded: 0, hidden: false },
      { transfer: 0, encoded: 90, decoded: 200, hidden: false },
    ]);
    expect(page.rows()[0]?.timing.response).toBeNull();
  });
});

describe("a request the browser timed too", () => {
  beforeEach(() => {
    page = record(fakePage());
  });

  test("keeps its one row, which gains the sizes and the end", async () => {
    page.net.answer = () =>
      Promise.resolve(new Response(new Uint8Array(10), { headers: { "content-type": "image/png" } }));
    page.clock.tick(100);
    await fetch("/logo.png#x");
    await settle();
    expect(page.row()).toMatchObject({ sizes: null, timing: { end: null } });
    FakeObserver.emit(
      timed("http://app.test/logo.png", 101.5, { initiatorType: "fetch", responseEnd: 161.5, nextHopProtocol: "h3" }),
    );
    expect(page.row()).toMatchObject({
      kind: "fetch",
      detail: "full",
      initiatorType: "fetch",
      protocol: "h3",
      status: 200,
      sizes: { transfer: 1300, encoded: 1000, decoded: 4000, hidden: false },
      timing: { at: 100, end: 1_700_000_000_161.5, duration: 61.5 },
      responseBody: { kind: "binary" },
    });
  });

  test("an XMLHttpRequest's row too", () => {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", "/api/items");
    xhr.send();
    FakeXHR.sent[0]?.head(200);
    FakeXHR.sent[0]?.done();
    FakeObserver.emit(timed("http://app.test/api/items", 1, { initiatorType: "xmlhttprequest" }));
    expect(page.row()).toMatchObject({ kind: "xhr", sizes: { decoded: 4000 } });
  });

  test("a row with no status takes the one the browser gives", async () => {
    page.net.answer = () => Promise.reject(new TypeError("Failed to fetch"));
    await fetch("/api/down").catch(() => {});
    FakeObserver.emit(timed("http://app.test/api/down", 0, { initiatorType: "fetch", responseStatus: 503 }));
    expect(page.row()).toMatchObject({ state: "failed", status: 503 });
  });

  test("each of two requests to one address gets its own timing", async () => {
    await fetch("/api/poll");
    page.clock.tick(1000);
    await fetch("/api/poll");
    FakeObserver.emit(
      timed("http://app.test/api/poll", 1001, { initiatorType: "fetch", decodedBodySize: 2 }),
      timed("http://app.test/api/poll", 1, { initiatorType: "fetch", decodedBodySize: 1 }),
    );
    expect(page.rows().map((row) => row.sizes?.decoded)).toEqual([1, 2]);
  });

  test("a timing that fits no row is a light row of its own", async () => {
    await fetch("/api/items");
    FakeObserver.emit(
      // Too long after, another address, another api, and an image at the same address.
      timed("http://app.test/api/items", 900, { initiatorType: "fetch" }),
      timed("http://app.test/api/other", 0, { initiatorType: "fetch" }),
      timed("http://app.test/api/items", 0, { initiatorType: "xmlhttprequest" }),
      timed("http://app.test/api/items", 0, { initiatorType: "img" }),
    );
    expect(page.rows().length).toBe(5);
    expect(page.rows().filter((row) => row.detail === "full").map((row) => row.sizes)).toEqual([null]);
  });

  test("a row timed once is not timed again", async () => {
    await fetch("/api/items");
    FakeObserver.emit(timed("http://app.test/api/items", 0, { initiatorType: "fetch" }));
    FakeObserver.emit(timed("http://app.test/api/items", 1, { initiatorType: "fetch" }));
    expect(page.rows().map((row) => row.detail)).toEqual(["full", "light"]);
  });
});

describe("devknobs' own requests", () => {
  beforeEach(() => {
    page = record(fakePage());
    share(page.recorder);
  });

  test("a fetch of its own is not in the log, nor is the browser's timing of it", async () => {
    page.clock.tick(50);
    const response = await quietFetch("/src/app.tsx.map", { cache: "force-cache" });
    expect(await response.text()).toBe("ok");
    // The init is the caller's own, with devknobs' mark on it and nothing the browser reads.
    expect(page.net.calls.map(([url, init]) => [url, Object.keys(init ?? {}), init?.cache])).toEqual([
      ["/src/app.tsx.map", ["cache"], "force-cache"],
    ]);
    FakeObserver.emit(timed("http://app.test/src/app.tsx.map", 51, { initiatorType: "fetch" }));
    expect(page.rows()).toEqual([]);
  });

  test("the page's own request to the same address is in it", async () => {
    await quietFetch("/font.woff2");
    FakeObserver.emit(timed("http://app.test/font.woff2", 0, { initiatorType: "fetch" }));
    page.clock.tick(5000);
    await fetch("/font.woff2");
    FakeObserver.emit(
      timed("http://app.test/font.woff2", 5000, { initiatorType: "fetch" }),
      timed("http://app.test/font.woff2", 9000, { initiatorType: "css" }),
    );
    expect(page.rows().map((row) => [row.detail, row.initiatorType])).toEqual([
      ["full", "fetch"],
      ["light", "css"],
    ]);
  });

  test("a request made while one of devknobs' own waits is the page's, and is noted", async () => {
    let release = (_response: Response): void => {};
    page.net.answer = () => new Promise((resolve) => (release = resolve));
    const own = quietFetch("/slow.map");
    page.net.answer = () => Promise.resolve(new Response("ok"));
    await fetch("/api/items");
    release(new Response("map"));
    await own;
    expect(page.rows().map((row) => row.url)).toEqual(["http://app.test/api/items"]);
  });

  test("a fetch of its own stays out of the log through a wrapper of the page's that waits", async () => {
    const below = globalThis.fetch;
    // The page's wrapper passes the call on a moment later, as an `async` one does.
    globalThis.fetch = Object.assign(
      async (...args: Parameters<typeof fetch>): Promise<Response> => {
        await Promise.resolve();
        return below(...args);
      },
      { preconnect: below.preconnect },
    );
    try {
      expect(await (await quietFetch("/src/app.tsx.map")).text()).toBe("ok");
      await fetch("/api/items");
      expect(page.rows().map((row) => row.url)).toEqual(["http://app.test/api/items"]);
      expect(page.net.calls.map(([url]) => url)).toEqual(["/src/app.tsx.map", "/api/items"]);
    } finally {
      globalThis.fetch = below;
    }
  });

  test("a picture of its own is left out every time it loads", () => {
    hush("http://app.test/node_modules/devknobs/dist/bezels/phone.webp");
    FakeObserver.emit(timed("http://app.test/node_modules/devknobs/dist/bezels/phone.webp", 10));
    page.clock.tick(60_000);
    FakeObserver.emit(timed("http://app.test/node_modules/devknobs/dist/bezels/phone.webp", 60_010));
    expect(page.rows()).toEqual([]);
  });

  test("the device frame's load is left out once, and the page's own load of that address is not", () => {
    page.clock.tick(200);
    hushOnce("http://app.test/dash/page#top");
    FakeObserver.emit(
      timed("http://app.test/dash/page", 0, { entryType: "navigation", initiatorType: "navigation" }),
      timed("http://app.test/dash/page", 203, { initiatorType: "iframe" }),
      timed("http://app.test/dash/page", 210, { initiatorType: "iframe" }),
    );
    expect(page.rows().map((row) => [row.kind, row.timing.at])).toEqual([
      ["navigation", 0],
      ["resource", 210],
    ]);
  });

  test("with no log on the page they are plain requests", async () => {
    share(null);
    hush("http://app.test/a.webp");
    hushOnce("http://app.test/b");
    expect(await (await quietFetch("/x")).text()).toBe("ok");
  });
});
