import { describe, expect, test } from "bun:test";
import {
  addCookie,
  type Cookie,
  deleteCookie,
  domainsOf,
  filterCookies,
  HTTP_ONLY_NOTE,
  parseCookies,
  pathsOf,
  readCookies,
  readPlain,
  sameCookies,
  setCookie,
} from "../src/storage/cookies";
import { cookieText } from "../src/storage/onload";
import { fakeSite, named } from "./storage-fakes";

function find(cookies: readonly Cookie[], name: string): Cookie {
  const cookie = cookies.find((entry) => entry.name === name);
  if (!cookie) throw new Error(`no cookie ${name}`);
  return cookie;
}

describe("parseCookies", () => {
  test("reads names and values, a value with = in it, and a value with no name", () => {
    expect(parseCookies("a=1; token=x=y==; bare; empty=")).toEqual([
      { name: "a", value: "1" },
      { name: "token", value: "x=y==" },
      { name: "", value: "bare" },
      { name: "empty", value: "" },
    ]);
    expect(parseCookies("")).toEqual([]);
  });
});

describe("reading", () => {
  test("without a cookie store, a cookie is its name and value, and nothing else is known", async () => {
    const site = fakeSite();
    site.jar.put({ name: "sid", value: "abc", path: "/shop", secure: true });
    const read = await readCookies(site);
    expect(read.error).toBeNull();
    expect(read.cookies).toEqual([
      {
        name: "sid",
        value: "abc",
        domain: null,
        path: null,
        expires: null,
        secure: null,
        sameSite: null,
        size: 6,
        placed: false,
      },
    ]);
  });

  test("with a cookie store, its path, domain, expiry, secure and sameSite are told", async () => {
    const site = fakeSite({ cookieStore: true });
    site.jar.put({
      name: "sid",
      value: "abc",
      path: "/shop",
      domain: "example.com",
      expires: 5_000_000,
      secure: true,
      sameSite: "strict",
    });
    const [cookie] = (await readCookies(site)).cookies;
    expect(cookie).toEqual({
      name: "sid",
      value: "abc",
      domain: "example.com",
      path: "/shop",
      expires: 5_000_000,
      secure: true,
      sameSite: "strict",
      size: 6,
      placed: true,
    });
  });

  test("a cookie marked HttpOnly is in neither read, and the note says why", async () => {
    for (const cookieStore of [false, true]) {
      const site = fakeSite({ cookieStore });
      site.jar.put({ name: "session", value: "secret", httpOnly: true });
      site.jar.put({ name: "theme", value: "dark" });
      expect((await readCookies(site)).cookies.map((cookie) => cookie.name)).toEqual(["theme"]);
    }
    expect(HTTP_ONLY_NOTE).toBe("cookies marked HttpOnly are not shown: a page cannot read them");
  });

  test("a cookie store that fails leaves the plain read", async () => {
    const site = fakeSite();
    site.jar.put({ name: "a", value: "1" });
    const broken = {
      ...site,
      cookieStore: {
        getAll: () => Promise.reject(named("SecurityError")),
        addEventListener() {},
        removeEventListener() {},
      },
    };
    expect((await readCookies(broken)).cookies.map((cookie) => cookie.name)).toEqual(["a"]);
  });

  test("a page that may not read its cookies says so in a line", async () => {
    const site = fakeSite();
    const blocked = {
      ...site,
      document: {
        get cookie(): string {
          throw named("SecurityError");
        },
      },
    };
    expect(readPlain(blocked).error).toBe("cannot read the cookies: the browser blocks storage on this page");
    expect((await readCookies(blocked)).cookies).toEqual([]);
    expect(deleteCookie(blocked, BARE)).toBe(false);
    expect(setCookie(blocked, BARE, "2")).toBe(false);
  });
});

const BARE: Cookie = {
  name: "x",
  value: "1",
  domain: null,
  path: null,
  expires: null,
  secure: null,
  sameSite: null,
  size: 2,
  placed: false,
};

describe("where a cookie may sit", () => {
  test("the page's path and every folder above it", () => {
    expect(pathsOf("/shop/cart")).toEqual(["/shop/cart", "/shop/", "/shop", "/"]);
    expect(pathsOf("/")).toEqual(["/"]);
    expect(pathsOf("/a/")).toEqual(["/a/", "/a", "/"]);
    expect(pathsOf("")).toEqual(["/"]);
  });

  test("the host and each parent domain with a dot", () => {
    expect(domainsOf("app.shop.example.com")).toEqual([
      "app.shop.example.com",
      "shop.example.com",
      "example.com",
    ]);
    expect(domainsOf("localhost")).toEqual([]);
    expect(domainsOf("127.0.0.1")).toEqual([]);
    expect(domainsOf("[::1]")).toEqual([]);
  });

  test("a cookie is written with what the entry gives, and / where it gives no path", () => {
    expect(cookieText({ name: "a", value: "1" })).toBe("a=1; path=/");
    expect(
      cookieText({ name: "a", value: "1", path: "/x", maxAge: 60, sameSite: "lax", secure: true }),
    ).toBe("a=1; path=/x; max-age=60; samesite=lax; secure");
    expect(cookieText({ name: "a", value: "", domain: "example.com", expires: "then" })).toBe(
      "a=; path=/; domain=example.com; expires=then",
    );
  });
});

describe("deleting", () => {
  test("with the place known, one write at that path and domain does it", async () => {
    const site = fakeSite({ cookieStore: true });
    site.jar.put({ name: "sid", value: "1", path: "/shop", domain: "example.com" });
    const cookie = find((await readCookies(site)).cookies, "sid");
    expect(deleteCookie(site, cookie)).toBe(true);
    expect(site.jar.cookies).toEqual([]);
    expect(site.jar.writes).toEqual([
      "sid=; path=/shop; domain=example.com; expires=Thu, 01 Jan 1970 00:00:00 GMT",
    ]);
  });

  test("a cookie of the host alone goes with no domain", async () => {
    const site = fakeSite({ cookieStore: true });
    site.jar.put({ name: "sid", value: "1", path: "/" });
    expect(deleteCookie(site, find((await readCookies(site)).cookies, "sid"))).toBe(true);
    expect(site.jar.writes).toEqual(["sid=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT"]);
  });

  test("with the place unknown, / goes first, then the folders, with and without each domain", () => {
    const site = fakeSite();
    site.jar.put({ name: "deep", value: "1", path: "/shop", domain: "example.com" });
    const cookie = find(readPlain(site).cookies, "deep");
    expect(deleteCookie(site, cookie)).toBe(true);
    expect(site.jar.cookies).toEqual([]);
    expect(site.jar.writes[0]).toBe("deep=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT");
    expect(site.jar.writes.at(-1)).toBe(
      "deep=; path=/shop; domain=example.com; expires=Thu, 01 Jan 1970 00:00:00 GMT",
    );
  });

  test("says so where the cookie cannot be removed", () => {
    const site = fakeSite();
    site.jar.put({ name: "kept", value: "1" });
    // The browser takes no write for it, as for one that turned HttpOnly.
    site.jar.write = (text) => void site.jar.writes.push(text);
    expect(deleteCookie(site, find(readPlain(site).cookies, "kept"))).toBe(false);
    expect(site.jar.writes.length).toBeGreaterThan(4);
    expect(site.jar.cookies).toHaveLength(1);
  });

  test("a cookie that is gone already counts as deleted", () => {
    const site = fakeSite();
    expect(deleteCookie(site, BARE)).toBe(true);
    expect(site.jar.writes).toEqual([]);
  });

  test("of two cookies of a name, deleting one leaves the other", async () => {
    const site = fakeSite({ cookieStore: true });
    site.jar.put({ name: "v", value: "root", path: "/" });
    site.jar.put({ name: "v", value: "shop", path: "/shop" });
    const shop = (await readCookies(site)).cookies.find((cookie) => cookie.path === "/shop");
    expect(shop && deleteCookie(site, shop)).toBe(true);
    expect(site.jar.cookies.map((cookie) => cookie.value)).toEqual(["root"]);
  });
});

describe("editing", () => {
  test("with the place known, the value changes there and the rest is kept", async () => {
    const site = fakeSite({ cookieStore: true });
    site.jar.put({
      name: "sid",
      value: "old",
      path: "/shop",
      domain: "example.com",
      expires: 1_000_000 + 60_000,
      secure: true,
      sameSite: "strict",
    });
    const cookie = find((await readCookies(site)).cookies, "sid");
    expect(setCookie(site, cookie, "new", 1_000_000)).toBe(true);
    expect(site.jar.cookies).toEqual([
      {
        name: "sid",
        value: "new",
        path: "/shop",
        domain: "example.com",
        expires: 1_000_000 + 60_000,
        secure: true,
        sameSite: "strict",
        httpOnly: false,
      },
    ]);
    expect(site.jar.writes).toHaveLength(1);
  });

  test("with the place unknown, a write that made a second cookie is taken back and the next place tried", () => {
    const site = fakeSite();
    site.jar.put({ name: "theme", value: "light", path: "/shop" });
    expect(setCookie(site, find(readPlain(site).cookies, "theme"), "dark")).toBe(true);
    expect(site.jar.cookies.map((cookie) => [cookie.path, cookie.value])).toEqual([["/shop", "dark"]]);
    // The first try, on /, made a second cookie and was taken back.
    expect(site.jar.writes.slice(0, 2)).toEqual([
      "theme=dark; path=/",
      "theme=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT",
    ]);
  });

  test("says so where no place changes it, and leaves no second cookie behind", () => {
    const site = fakeSite();
    site.jar.put({ name: "locked", value: "1", path: "/shop" });
    const cookie = find(readPlain(site).cookies, "locked");
    // The cookie turns HttpOnly under the view: script cannot write over it, only beside it.
    const [kept] = site.jar.cookies;
    if (kept) kept.httpOnly = true;
    site.jar.put({ name: "locked", value: "1", path: "/shop/cart" });
    const [, twin] = site.jar.cookies;
    if (twin) twin.httpOnly = true;
    site.jar.put({ name: "locked", value: "1", path: "/elsewhere" });
    expect(readPlain(site).cookies).toEqual([]);
    expect(setCookie(site, cookie, "2")).toBe(false);
    // Every cookie a try made beside the locked ones was taken back.
    expect(site.jar.cookies.filter((entry) => !entry.httpOnly).map((entry) => entry.path)).toEqual([
      "/elsewhere",
    ]);
  });

  test("a value that is the same already is no failure", () => {
    const site = fakeSite();
    site.jar.put({ name: "a", value: "1" });
    expect(setCookie(site, find(readPlain(site).cookies, "a"), "1")).toBe(true);
  });

  test("a new cookie is for the whole site, and the browser's refusal is told", () => {
    const site = fakeSite();
    expect(addCookie(site, "flag", "on")).toBe(true);
    expect(site.jar.cookies[0]).toMatchObject({ name: "flag", value: "on", path: "/", domain: null });
    site.jar.write = () => {};
    expect(addCookie(site, "other", "1")).toBe(false);
  });
});

describe("filterCookies and sameCookies", () => {
  test("match the name or the value", () => {
    const cookies = [
      { ...BARE, name: "Theme", value: "dark" },
      { ...BARE, name: "sid", value: "THEMED" },
      { ...BARE, name: "x", value: "1" },
    ];
    expect(filterCookies(cookies, "theme").map((cookie) => cookie.name)).toEqual(["Theme", "sid"]);
    expect(filterCookies(cookies, "")).toHaveLength(3);
  });

  test("two reads are the same only with the same cookies in the same order", () => {
    const a = [{ ...BARE }];
    expect(sameCookies(a, [{ ...BARE }])).toBe(true);
    expect(sameCookies(a, [{ ...BARE, value: "2" }])).toBe(false);
    expect(sameCookies(a, [{ ...BARE, path: "/" }])).toBe(false);
    expect(sameCookies(a, [])).toBe(false);
  });
});
