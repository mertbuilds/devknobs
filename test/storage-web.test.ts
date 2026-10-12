import { describe, expect, test } from "bun:test";
import { errorLine, isOwn, webOf } from "../src/storage/site";
import {
  clearWeb,
  copyName,
  filterItems,
  parseEntries,
  readWeb,
  removeWeb,
  sameItems,
  writeWeb,
} from "../src/storage/web";
import { fakeSite, named } from "./storage-fakes";

describe("devknobs' own items", () => {
  test("are the key devknobs and every key under it", () => {
    expect(isOwn("devknobs")).toBe(true);
    expect(isOwn("devknobs:keys")).toBe(true);
    expect(isOwn("devknobs:storage-presets")).toBe(true);
    expect(isOwn("devknobs:colors")).toBe(true);
    expect(isOwn("devknobsy")).toBe(false);
    expect(isOwn("my-devknobs")).toBe(false);
  });
});

describe("readWeb", () => {
  test("reads every item, in the storage's order, with its size and whose it is", () => {
    const site = fakeSite({ local: { token: "abc", devknobs: "{}", "café": "é" } });
    expect(readWeb(site, "local")).toEqual({
      items: [
        { key: "token", value: "abc", size: 3, own: false },
        { key: "devknobs", value: "{}", size: 2, own: true },
        { key: "café", value: "é", size: 2, own: false },
      ],
      error: null,
    });
    expect(readWeb(site, "session")).toEqual({ items: [], error: null });
  });

  test("keeps the object of an item that did not change, and says when nothing did", () => {
    const site = fakeSite({ session: { a: "1", b: "2" } });
    const first = readWeb(site, "session").items;
    const again = readWeb(site, "session", first).items;
    expect(again[0]).toBe(first[0] as (typeof first)[number]);
    expect(sameItems(first, again)).toBe(true);
    site.sessionStorage.setItem("b", "3");
    const changed = readWeb(site, "session", again).items;
    expect(changed[0]).toBe(first[0] as (typeof first)[number]);
    expect(changed[1]).not.toBe(first[1]);
    expect(sameItems(first, changed)).toBe(false);
    site.sessionStorage.removeItem("a");
    expect(sameItems(changed, readWeb(site, "session", changed).items)).toBe(false);
  });

  test("a storage the browser blocks is one calm line, never a throw", () => {
    const site = fakeSite();
    Object.defineProperty(site, "localStorage", {
      get() {
        throw named("SecurityError");
      },
    });
    expect(readWeb(site, "local")).toEqual({
      items: [],
      error: "cannot read localStorage: the browser blocks storage on this page",
    });
    expect(typeof webOf(site, "local")).toBe("string");
    expect(writeWeb(site, "local", "a", "1")).toContain("the browser blocks storage");
    expect(removeWeb(site, "local", "a")).toContain("the browser blocks storage");
    expect(clearWeb(site, "local", false)).toEqual({
      removed: 0,
      error: "cannot read localStorage: the browser blocks storage on this page",
    });
  });
});

describe("writes", () => {
  test("set and remove one key", () => {
    const site = fakeSite({ local: { a: "1" } });
    expect(writeWeb(site, "local", "b", "2")).toBeNull();
    expect(removeWeb(site, "local", "a")).toBeNull();
    expect(site.localStorage.all()).toEqual({ b: "2" });
  });

  test("a full storage says so", () => {
    const site = fakeSite();
    site.localStorage.refuse = named("QuotaExceededError");
    expect(writeWeb(site, "local", "big", "x")).toBe("cannot save big: the storage is full");
    expect(errorLine(named("Odd"), "save x")).toBe("cannot save x: Odd");
    expect(errorLine(null, "save x")).toBe("cannot save x");
  });

  test("clear removes the page's items and keeps devknobs' own", () => {
    const site = fakeSite({ local: { a: "1", devknobs: "{}", "devknobs:keys": "{}", b: "2" } });
    expect(clearWeb(site, "local", false)).toEqual({ removed: 2, error: null });
    expect(site.localStorage.all()).toEqual({ devknobs: "{}", "devknobs:keys": "{}" });
  });

  test("clear takes devknobs' own too once they show", () => {
    const site = fakeSite({ local: { a: "1", devknobs: "{}" } });
    expect(clearWeb(site, "local", true)).toEqual({ removed: 2, error: null });
    expect(site.localStorage.all()).toEqual({});
  });
});

describe("filterItems", () => {
  const items = readWeb(
    fakeSite({ local: { Token: "abc", theme: "DARK", devknobs: "dark" } }),
    "local",
  ).items;

  test("hides devknobs' own by default", () => {
    expect(filterItems(items, "", false).map((item) => item.key)).toEqual(["Token", "theme"]);
    expect(filterItems(items, "", true).map((item) => item.key)).toEqual(["Token", "theme", "devknobs"]);
  });

  test("matches the key or the value, in any case", () => {
    expect(filterItems(items, "tok", false).map((item) => item.key)).toEqual(["Token"]);
    expect(filterItems(items, " dark ", false).map((item) => item.key)).toEqual(["theme"]);
    expect(filterItems(items, "dark", true).map((item) => item.key)).toEqual(["theme", "devknobs"]);
    expect(filterItems(items, "zzz", true)).toEqual([]);
  });

  test("runs over a few thousand items at once", () => {
    const many = Object.fromEntries(Array.from({ length: 5000 }, (_, at) => [`key-${at}`, `value ${at}`]));
    const read = readWeb(fakeSite({ local: many }), "local").items;
    const started = performance.now();
    expect(filterItems(read, "value 4999", false)).toHaveLength(1);
    expect(performance.now() - started).toBeLessThan(50);
  });
});

describe("parseEntries", () => {
  test("reads key=value, a line each", () => {
    expect(parseEntries("a=1")).toEqual([{ name: "a", value: "1" }]);
    expect(parseEntries(" a = 1 \n\nurl=https://x.test/?q=1\n")).toEqual([
      { name: "a", value: "1" },
      { name: "url", value: "https://x.test/?q=1" },
    ]);
  });

  test("reads a json object, a key each, text as it is and the rest as json", () => {
    expect(parseEntries('{"a":"x","n":2,"o":{"p":true}}')).toEqual([
      { name: "a", value: "x" },
      { name: "n", value: "2" },
      { name: "o", value: '{"p":true}' },
    ]);
  });

  test("is null for what names no key", () => {
    for (const text of ["", "  ", "novalue", "=x", "{}", "a=1\nbroken"]) {
      expect(parseEntries(text)).toBeNull();
    }
  });
});

describe("copyName", () => {
  test("adds copy, and a number where that is taken", () => {
    expect(copyName("a", new Set(["a"]))).toBe("a copy");
    expect(copyName("a", new Set(["a", "a copy"]))).toBe("a copy 2");
    expect(copyName("a", new Set(["a", "a copy", "a copy 2"]))).toBe("a copy 3");
  });
});
