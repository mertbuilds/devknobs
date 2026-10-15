import { describe, expect, test } from "bun:test";
import { CACHE_PAGE, deleteCache, listCaches, readCache } from "../src/storage/cache";
import { clearSite, countSite, countsText, reportLines } from "../src/storage/clear";
import { type FakeSite, fakeSite, named } from "./storage-fakes";

function withCaches(): FakeSite {
  const site = fakeSite();
  site.cached.caches.set("assets-v2", [
    { url: "https://app.example.com/app.js", type: "text/javascript", length: "2048" },
    { url: "https://app.example.com/api/me", status: 404, type: "application/json; charset=utf-8" },
  ]);
  site.cached.caches.set(
    "pages",
    Array.from({ length: 240 }, (_, at) => ({ url: `https://app.example.com/p/${at}`, method: "GET" })),
  );
  return site;
}

describe("Cache Storage", () => {
  test("lists the caches by name", async () => {
    expect(await listCaches(withCaches())).toEqual({ names: ["assets-v2", "pages"], error: null });
  });

  test("is only for a secure page that has it", async () => {
    expect(await listCaches({ ...withCaches(), isSecureContext: false })).toEqual({
      names: [],
      error: "Cache Storage needs a secure page (https or localhost)",
    });
    expect(await listCaches({ ...fakeSite(), caches: undefined })).toEqual({
      names: [],
      error: "Cache Storage is not here",
    });
  });

  test("a browser that refuses says so in a line", async () => {
    const site = {
      ...fakeSite(),
      caches: { keys: () => Promise.reject(named("SecurityError")), open: () => Promise.reject(), delete: () => Promise.reject() },
    };
    expect((await listCaches(site)).error).toBe(
      "cannot list the caches: the browser blocks storage on this page",
    );
  });

  test("reads a cache's requests with the response's status, type and size", async () => {
    expect(await readCache(withCaches(), "assets-v2", 0)).toEqual({
      total: 2,
      entries: [
        { method: "GET", url: "https://app.example.com/app.js", status: 200, type: "text/javascript", size: 2048 },
        {
          method: "GET",
          url: "https://app.example.com/api/me",
          status: 404,
          type: "application/json; charset=utf-8",
          size: null,
        },
      ],
      error: null,
    });
  });

  test("pages by a hundred, and looks up only the responses of the page it reads", async () => {
    const site = withCaches();
    expect(CACHE_PAGE).toBe(100);
    const first = await readCache(site, "pages", 0);
    expect(first.total).toBe(240);
    expect(first.entries).toHaveLength(100);
    expect(site.cached.matches).toBe(100);
    const last = await readCache(site, "pages", 200);
    expect(last.entries.map((entry) => entry.url)).toEqual(
      Array.from({ length: 40 }, (_, at) => `https://app.example.com/p/${200 + at}`),
    );
    expect(site.cached.matches).toBe(140);
  });

  test("a cache that is gone is a line", async () => {
    expect(await readCache(withCaches(), "nope", 0)).toEqual({
      total: 0,
      entries: [],
      error: "cannot read nope: NotFoundError",
    });
  });

  test("deletes a whole cache", async () => {
    const site = withCaches();
    expect(await deleteCache(site, "pages")).toBe(true);
    expect(await deleteCache(site, "pages")).toBe(false);
    expect(Array.from(site.cached.caches.keys())).toEqual(["assets-v2"]);
  });
});

/** A page with something of every kind, devknobs' own items among them. */
function full(): FakeSite {
  const site = withCaches();
  for (const [key, value] of Object.entries({ a: "1", b: "2", devknobs: "{}", "devknobs:keys": "{}" })) {
    site.localStorage.setItem(key, value);
  }
  site.sessionStorage.setItem("s", "1");
  site.sessionStorage.setItem("devknobs:locale-owner", "x");
  site.jar.put({ name: "theme", value: "dark" });
  site.jar.put({ name: "deep", value: "1", path: "/shop", domain: "example.com" });
  site.jar.put({ name: "session", value: "secret", httpOnly: true });
  site.idb.add("shop", 1, {});
  site.idb.add("logs", 2, {});
  return site;
}

describe("clear site data", () => {
  test("counts what there is, without devknobs' own", async () => {
    const counts = await countSite(full(), false);
    expect(counts).toEqual({ local: 2, session: 1, cookies: 2, databases: 2, caches: 2 });
    expect(countsText(counts)).toBe("2 local, 1 session, 2 cookies, 2 databases, 2 caches");
  });

  test("counts devknobs' own too once they show", async () => {
    expect(await countSite(full(), true)).toMatchObject({ local: 4, session: 2 });
  });

  test("says counts in the singular, and leaves out the kinds with none", () => {
    expect(countsText({ local: 12, session: 3, cookies: 5, databases: 2, caches: 1 })).toBe(
      "12 local, 3 session, 5 cookies, 2 databases, 1 cache",
    );
    expect(countsText({ local: 0, session: 0, cookies: 1, databases: 1, caches: 0 })).toBe(
      "1 cookie, 1 database",
    );
    expect(countsText({ local: 0, session: 0, cookies: 0, databases: 0, caches: 0 })).toBe("nothing");
  });

  test("clears every kind in one go, and keeps devknobs' own", async () => {
    const site = full();
    const report = await clearSite(site, false, 20);
    expect(report).toEqual({
      removed: { local: 2, session: 1, cookies: 2, databases: 2, caches: 2 },
      cookiesLeft: 0,
      blocked: [],
      errors: [],
    });
    expect(site.localStorage.all()).toEqual({ devknobs: "{}", "devknobs:keys": "{}" });
    expect(site.sessionStorage.all()).toEqual({ "devknobs:locale-owner": "x" });
    // The HttpOnly cookie is not the page's to remove.
    expect(site.jar.cookies.map((cookie) => cookie.name)).toEqual(["session"]);
    expect(site.idb.data.size).toBe(0);
    expect(site.cached.caches.size).toBe(0);
    expect(reportLines(report)).toEqual(["cleared 2 local, 1 session, 2 cookies, 2 databases, 2 caches"]);
  });

  test("takes devknobs' own too once they show", async () => {
    const site = full();
    const report = await clearSite(site, true, 20);
    expect(report.removed).toMatchObject({ local: 4, session: 2 });
    expect(site.localStorage.all()).toEqual({});
    expect(site.sessionStorage.all()).toEqual({});
  });

  test("counts the cookies it could not remove, and says so", async () => {
    const site = full();
    const write = site.jar.write.bind(site.jar);
    // The browser takes no write for one cookie.
    site.jar.write = (text) => {
      if (!text.startsWith("deep=")) write(text);
    };
    const report = await clearSite(site, false, 20);
    expect(report.removed.cookies).toBe(1);
    expect(report.cookiesLeft).toBe(1);
    expect(reportLines(report)).toEqual([
      "cleared 2 local, 1 session, 1 cookie, 2 databases, 2 caches",
      "1 cookie could not be removed: set on another path or domain",
    ]);
  });

  test("a database the page holds open is named, after a short wait, and the rest still goes", async () => {
    const site = full();
    site.idb.held.add("shop");
    const started = Date.now();
    const report = await clearSite(site, false, 20);
    expect(Date.now() - started).toBeLessThan(500);
    expect(report.removed.databases).toBe(1);
    expect(report.blocked).toEqual(["shop"]);
    expect(report.removed.caches).toBe(2);
    expect(reportLines(report)[1]).toBe(
      "shop is held open by the page: it goes once the page lets go, or on reload",
    );
  });

  test("opens no database to clear it", async () => {
    const site = full();
    await clearSite(site, false, 20);
    expect(site.idb.opens).toEqual([]);
    expect(site.idb.deletes).toEqual(["shop", "logs"]);
  });

  test("a storage that cannot be reached is a line, and the rest still goes", async () => {
    const site = full();
    Object.defineProperty(site, "localStorage", {
      get() {
        throw named("SecurityError");
      },
    });
    const report = await clearSite(site, false, 20);
    expect(report.removed).toEqual({ local: 0, session: 1, cookies: 2, databases: 2, caches: 2 });
    expect(report.errors).toEqual(["cannot read localStorage: the browser blocks storage on this page"]);
  });
});
