import { afterEach, describe, expect, test } from "bun:test";
import {
  apply,
  dirFor,
  isRtl,
  languagesFor,
  LOCALE_PRESETS,
  PARAGLIDE_COOKIE,
  PARAGLIDE_OWNER_KEY,
  PARAGLIDE_RELOAD_KEY,
  readCookie,
  reset,
  syncParaglideCookie,
} from "../src/engine/locale";

describe("isRtl", () => {
  test("knows the right to left languages", () => {
    for (const lang of ["ar", "he", "fa", "ur", "ar-EG", "HE"]) {
      expect(isRtl(lang)).toBe(true);
    }
  });

  test("everything else is left to right", () => {
    for (const lang of ["en", "en-US", "tr", "de", "ja", "zh-CN", ""]) {
      expect(isRtl(lang)).toBe(false);
    }
  });
});

describe("dirFor", () => {
  test("derives the direction from the language", () => {
    expect(dirFor({ lang: "ar", dir: "system" })).toBe("rtl");
    expect(dirFor({ lang: "tr", dir: "system" })).toBe("ltr");
  });

  test("an explicit direction wins", () => {
    expect(dirFor({ lang: "ar", dir: "ltr" })).toBe("ltr");
    expect(dirFor({ lang: "en", dir: "rtl" })).toBe("rtl");
  });
});

describe("languagesFor", () => {
  test("adds the base tag", () => {
    expect(languagesFor("en-US")).toEqual(["en-US", "en"]);
    expect(languagesFor("zh-CN")).toEqual(["zh-CN", "zh"]);
  });

  test("keeps a bare tag alone", () => {
    expect(languagesFor("tr")).toEqual(["tr"]);
  });
});

test("locale presets", () => {
  expect(LOCALE_PRESETS).toEqual(["en", "en-US", "tr", "de", "fr", "es", "ar", "he", "ja", "zh-CN"]);
});

/** Does this `document.cookie` write expire the cookie instead of setting it? */
function isExpiry(entry: string): boolean {
  return entry
    .split(";")
    .slice(1)
    .some((attribute) => attribute.trim().toLowerCase() === "max-age=0");
}

/** What a browser would leave in the jar after one `document.cookie` write. */
function writeJar(jar: string, entry: string): string {
  const pair = entry.split(";")[0] ?? "";
  const separator = pair.indexOf("=");
  const name = pair.slice(0, separator).trim();
  const value = pair.slice(separator + 1).trim();
  const expired = isExpiry(entry);
  const rest = jar
    .split(";")
    .map((cookie) => cookie.trim())
    .filter((cookie) => cookie && cookie.slice(0, cookie.indexOf("=")).trim() !== name);
  return (expired ? rest : [...rest, `${name}=${value}`]).join("; ");
}

interface Browser {
  jar: string;
  reloads: number;
  now: number;
  storage: Map<string, string>;
  attributes: Map<string, string>;
}

interface BrowserOptions {
  /** The tag devknobs is to have written before, as a page reload would leave it. */
  owner?: string;
  /** Storage that refuses to answer, the way a locked down browser does. */
  storageFails?: boolean;
  /** Storage that reads but keeps nothing, the way a full one does. */
  storageFull?: boolean;
  /** A jar that swallows every write, the way a browser with cookies off does. */
  cookiesDisabled?: boolean;
  /** A jar that keeps the cookie through an expiry, the way a host that resets it does. */
  expiryIgnored?: boolean;
}

function storageFor(map: Map<string, string>, full = false): Storage {
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (full) throw new Error("storage is full");
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
  } as Storage;
}

const REAL_NOW = Date.now;

/**
 * A document with a cookie jar and a window whose reload only counts itself.
 * The clock is `browser.now`, so a test can put the throttle window behind it.
 */
function stubBrowser(jar: string, options: BrowserOptions = {}): Browser {
  const browser: Browser = {
    jar,
    reloads: 0,
    now: REAL_NOW(),
    storage: new Map(),
    attributes: new Map(),
  };
  if (options.owner !== undefined) browser.storage.set(PARAGLIDE_OWNER_KEY, options.owner);
  Date.now = () => browser.now;
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      get cookie(): string {
        return browser.jar;
      },
      set cookie(entry: string) {
        if (options.cookiesDisabled) return;
        if (options.expiryIgnored && isExpiry(entry)) return;
        browser.jar = writeJar(browser.jar, entry);
      },
      documentElement: {
        getAttribute: (name: string) => browser.attributes.get(name) ?? null,
        setAttribute: (name: string, value: string) => {
          browser.attributes.set(name, value);
        },
        removeAttribute: (name: string) => {
          browser.attributes.delete(name);
        },
      },
    },
  });
  Object.defineProperty(globalThis, "Navigator", { configurable: true, value: class {} });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      location: {
        reload(): void {
          browser.reloads += 1;
        },
      },
      dispatchEvent: () => true,
      get sessionStorage(): Storage {
        if (options.storageFails) throw new Error("storage is off");
        return storageFor(browser.storage, options.storageFull);
      },
    },
  });
  return browser;
}

/** A stubbed browser with the module's own state cleared out. */
function stubPage(jar = "", options: BrowserOptions = {}): Browser {
  const browser = stubBrowser(jar, options);
  reset();
  browser.reloads = 0;
  return browser;
}

/** Let enough time pass that the next reload is not read as a loop. */
function later(browser: Browser): void {
  browser.now += 10_000;
}

afterEach(() => {
  Date.now = REAL_NOW;
  Reflect.deleteProperty(globalThis, "document");
  Reflect.deleteProperty(globalThis, "window");
  Reflect.deleteProperty(globalThis, "Navigator");
});

describe("readCookie", () => {
  test("finds the named cookie", () => {
    expect(readCookie(`a=1; ${PARAGLIDE_COOKIE}=tr; b=2`, PARAGLIDE_COOKIE)).toBe("tr");
    expect(readCookie(`${PARAGLIDE_COOKIE}=en-US`, PARAGLIDE_COOKIE)).toBe("en-US");
  });

  test("is null when the cookie is not there", () => {
    expect(readCookie("", PARAGLIDE_COOKIE)).toBeNull();
    expect(readCookie("a=1; b=2", PARAGLIDE_COOKIE)).toBeNull();
  });

  test("does not match a name that only ends the same way", () => {
    expect(readCookie(`MY_${PARAGLIDE_COOKIE}=en`, PARAGLIDE_COOKIE)).toBeNull();
  });
});

describe("syncParaglideCookie", () => {
  test("writes the cookie, remembers the tag and reloads when there is none", () => {
    const browser = stubBrowser("");
    expect(syncParaglideCookie("tr")).toBe(true);
    expect(readCookie(browser.jar, PARAGLIDE_COOKIE)).toBe("tr");
    expect(browser.storage.get(PARAGLIDE_OWNER_KEY)).toBe("tr");
    expect(browser.reloads).toBe(1);
  });

  test("writes the tag as it is and keeps the other cookies", () => {
    const browser = stubBrowser(`session=abc; ${PARAGLIDE_COOKIE}=tr`, { owner: "tr" });
    expect(syncParaglideCookie("en-US")).toBe(true);
    expect(readCookie(browser.jar, PARAGLIDE_COOKIE)).toBe("en-US");
    expect(readCookie(browser.jar, "session")).toBe("abc");
    expect(browser.storage.get(PARAGLIDE_OWNER_KEY)).toBe("en-US");
    expect(browser.reloads).toBe(1);
  });

  test("does nothing for the tag it already wrote, whatever the cookie says now", () => {
    const jar = `${PARAGLIDE_COOKIE}=en`;
    const browser = stubBrowser(jar, { owner: "tr" });
    expect(syncParaglideCookie("tr")).toBe(false);
    expect(browser.jar).toBe(jar);
    expect(browser.storage.get(PARAGLIDE_OWNER_KEY)).toBe("tr");
    expect(browser.reloads).toBe(0);
  });

  test("claims nothing when the host is already on that tag", () => {
    const jar = `${PARAGLIDE_COOKIE}=tr`;
    const browser = stubBrowser(jar);
    expect(syncParaglideCookie("tr")).toBe(false);
    expect(browser.jar).toBe(jar);
    expect(browser.storage.has(PARAGLIDE_OWNER_KEY)).toBe(false);
    expect(browser.reloads).toBe(0);
  });

  test("expires its own cookie and reloads on system", () => {
    const browser = stubBrowser(`${PARAGLIDE_COOKIE}=tr; session=abc`, { owner: "tr" });
    expect(syncParaglideCookie(null)).toBe(true);
    expect(readCookie(browser.jar, PARAGLIDE_COOKIE)).toBeNull();
    expect(readCookie(browser.jar, "session")).toBe("abc");
    expect(browser.storage.has(PARAGLIDE_OWNER_KEY)).toBe(false);
    expect(browser.reloads).toBe(1);
  });

  test("leaves a cookie the host set alone on system", () => {
    const jar = `${PARAGLIDE_COOKIE}=de`;
    const browser = stubBrowser(jar);
    expect(syncParaglideCookie(null)).toBe(false);
    expect(browser.jar).toBe(jar);
    expect(browser.reloads).toBe(0);
  });

  test("forgets a stale owner tag instead of expiring the host's cookie", () => {
    const jar = `${PARAGLIDE_COOKIE}=de`;
    const browser = stubBrowser(jar, { owner: "tr" });
    expect(syncParaglideCookie(null)).toBe(false);
    expect(browser.jar).toBe(jar);
    expect(browser.storage.has(PARAGLIDE_OWNER_KEY)).toBe(false);
    expect(browser.reloads).toBe(0);
  });

  test("forgets the owner tag when the cookie is gone already", () => {
    const browser = stubBrowser("session=abc", { owner: "tr" });
    expect(syncParaglideCookie(null)).toBe(false);
    expect(browser.jar).toBe("session=abc");
    expect(browser.storage.has(PARAGLIDE_OWNER_KEY)).toBe(false);
    expect(browser.reloads).toBe(0);
  });

  test("does not reload when the cookie write goes nowhere", () => {
    const browser = stubBrowser("", { cookiesDisabled: true });
    expect(syncParaglideCookie("tr")).toBe(false);
    expect(browser.jar).toBe("");
    expect(browser.storage.has(PARAGLIDE_OWNER_KEY)).toBe(false);
    expect(browser.reloads).toBe(0);
  });

  test("does not reload when the tag cannot be remembered", () => {
    const browser = stubBrowser("", { storageFull: true });
    expect(syncParaglideCookie("tr")).toBe(false);
    expect(readCookie(browser.jar, PARAGLIDE_COOKIE)).toBe("tr");
    expect(browser.reloads).toBe(0);
  });

  test("writes nothing at all when storage is off", () => {
    const browser = stubBrowser("", { storageFails: true });
    expect(syncParaglideCookie("tr")).toBe(false);
    expect(browser.jar).toBe("");
    expect(browser.reloads).toBe(0);
  });

  test("keeps the tag owned when the expiry is refused", () => {
    const jar = `${PARAGLIDE_COOKIE}=tr; session=abc`;
    const browser = stubBrowser(jar, { owner: "tr", expiryIgnored: true });
    expect(syncParaglideCookie(null)).toBe(false);
    expect(browser.jar).toBe(jar);
    expect(browser.storage.get(PARAGLIDE_OWNER_KEY)).toBe("tr");
    expect(browser.reloads).toBe(0);
  });

  test("writes nothing for a reload asked for moments after the first", () => {
    const browser = stubBrowser("");
    expect(syncParaglideCookie("tr")).toBe(true);
    expect(browser.reloads).toBe(1);
    expect(syncParaglideCookie("de")).toBe(false);
    expect(syncParaglideCookie("de")).toBe(false);
    expect(readCookie(browser.jar, PARAGLIDE_COOKIE)).toBe("tr");
    expect(browser.storage.get(PARAGLIDE_OWNER_KEY)).toBe("tr");
    expect(browser.storage.has(PARAGLIDE_RELOAD_KEY)).toBe(true);
    expect(browser.reloads).toBe(1);
  });

  test("asks again for the tag whose reload was refused", () => {
    const browser = stubBrowser("");
    expect(syncParaglideCookie("tr")).toBe(true);
    expect(syncParaglideCookie("de")).toBe(false);
    expect(syncParaglideCookie("de")).toBe(false);
    later(browser);
    expect(syncParaglideCookie("de")).toBe(true);
    expect(readCookie(browser.jar, PARAGLIDE_COOKIE)).toBe("de");
    expect(browser.storage.get(PARAGLIDE_OWNER_KEY)).toBe("de");
    expect(browser.reloads).toBe(2);
  });

  test("reloads again once the throttle window is past", () => {
    const browser = stubBrowser("");
    expect(syncParaglideCookie("tr")).toBe(true);
    later(browser);
    expect(syncParaglideCookie("de")).toBe(true);
    expect(browser.reloads).toBe(2);
  });

  test("does nothing without a document", () => {
    expect(syncParaglideCookie("tr")).toBe(false);
    expect(syncParaglideCookie(null)).toBe(false);
  });
});

describe("apply", () => {
  test("sets the attributes, writes the cookie and reloads", () => {
    const page = stubPage();
    apply({ lang: "tr", dir: "system" });
    expect(page.attributes.get("lang")).toBe("tr");
    expect(page.attributes.get("dir")).toBe("ltr");
    expect(readCookie(page.jar, PARAGLIDE_COOKIE)).toBe("tr");
    expect(page.storage.get(PARAGLIDE_OWNER_KEY)).toBe("tr");
    expect(page.reloads).toBe(1);
  });

  test("syncs once when the same language is applied twice", () => {
    const page = stubPage();
    apply({ lang: "tr", dir: "system" });
    later(page);
    apply({ lang: "tr", dir: "rtl" });
    expect(page.attributes.get("dir")).toBe("rtl");
    expect(page.reloads).toBe(1);
  });

  test("asks again for a tag whose reload the throttle refused", () => {
    const page = stubPage();
    apply({ lang: "tr", dir: "system" });
    apply({ lang: "de", dir: "system" });
    expect(readCookie(page.jar, PARAGLIDE_COOKIE)).toBe("tr");
    expect(page.storage.get(PARAGLIDE_OWNER_KEY)).toBe("tr");
    expect(page.reloads).toBe(1);
    later(page);
    apply({ lang: "de", dir: "system" });
    expect(readCookie(page.jar, PARAGLIDE_COOKIE)).toBe("de");
    expect(page.storage.get(PARAGLIDE_OWNER_KEY)).toBe("de");
    expect(page.reloads).toBe(2);
  });

  test("a remount moments after the reload keeps its claim on the cookie", () => {
    const page = stubPage();
    apply({ lang: "tr", dir: "system" });
    expect(page.reloads).toBe(1);
    // The remount lands on the reload it just asked for, so the throttle is
    // fresh. The tag is devknobs' own, so it is recorded all the same.
    reset();
    apply({ lang: "tr", dir: "system" });
    expect(page.reloads).toBe(1);
    later(page);
    apply({ lang: "system", dir: "system" });
    expect(readCookie(page.jar, PARAGLIDE_COOKIE)).toBeNull();
    expect(page.storage.has(PARAGLIDE_OWNER_KEY)).toBe(false);
    expect(page.reloads).toBe(2);
  });

  test("a remount does not reload again once the host takes the tag", () => {
    const page = stubPage();
    apply({ lang: "tr", dir: "system" });
    later(page);
    reset();
    apply({ lang: "tr", dir: "system" });
    expect(page.reloads).toBe(1);
  });

  test("gives up on a tag the host rewrites, and leaves the host's cookie", () => {
    const page = stubPage();
    apply({ lang: "tr", dir: "system" });
    expect(page.reloads).toBe(1);
    page.jar = `${PARAGLIDE_COOKIE}=en`;
    later(page);
    reset();
    apply({ lang: "tr", dir: "system" });
    expect(readCookie(page.jar, PARAGLIDE_COOKIE)).toBe("en");
    expect(page.reloads).toBe(1);
    later(page);
    apply({ lang: "system", dir: "system" });
    expect(readCookie(page.jar, PARAGLIDE_COOKIE)).toBe("en");
    expect(page.storage.has(PARAGLIDE_OWNER_KEY)).toBe(false);
    expect(page.reloads).toBe(1);
  });

  test("expires its own cookie when the locale goes back to system", () => {
    const page = stubPage();
    apply({ lang: "tr", dir: "system" });
    later(page);
    reset();
    apply({ lang: "tr", dir: "system" });
    later(page);
    apply({ lang: "system", dir: "system" });
    expect(readCookie(page.jar, PARAGLIDE_COOKIE)).toBeNull();
    expect(page.storage.has(PARAGLIDE_OWNER_KEY)).toBe(false);
    expect(page.reloads).toBe(2);
  });

  test("leaves a cookie the host owns alone, knob and all", () => {
    const jar = `${PARAGLIDE_COOKIE}=tr`;
    const page = stubPage(jar);
    apply({ lang: "tr", dir: "system" });
    expect(page.jar).toBe(jar);
    expect(page.storage.has(PARAGLIDE_OWNER_KEY)).toBe(false);
    expect(page.reloads).toBe(0);
    later(page);
    apply({ lang: "system", dir: "system" });
    expect(page.jar).toBe(jar);
    expect(page.reloads).toBe(0);
  });

  test("does nothing on system when no language was applied", () => {
    const jar = `${PARAGLIDE_COOKIE}=de`;
    const page = stubPage(jar, { owner: "de" });
    apply({ lang: "system", dir: "system" });
    expect(page.jar).toBe(jar);
    expect(page.storage.get(PARAGLIDE_OWNER_KEY)).toBe("de");
    expect(page.reloads).toBe(0);
  });

  test("forces the direction while the language stays on system", () => {
    const jar = `${PARAGLIDE_COOKIE}=de`;
    const page = stubPage(jar);
    page.attributes.set("dir", "ltr");
    apply({ lang: "system", dir: "rtl" });
    expect(page.attributes.get("dir")).toBe("rtl");
    expect(page.attributes.has("lang")).toBe(false);
    expect(page.jar).toBe(jar);
    expect(page.reloads).toBe(0);
  });

  test("hands the direction back when both go to system", () => {
    const page = stubPage();
    page.attributes.set("dir", "ltr");
    apply({ lang: "system", dir: "rtl" });
    apply({ lang: "system", dir: "system" });
    expect(page.attributes.get("dir")).toBe("ltr");
    expect(page.reloads).toBe(0);
  });
});

describe("reset", () => {
  test("hands the page back without touching the cookie", () => {
    const page = stubPage();
    apply({ lang: "tr", dir: "system" });
    reset();
    expect(page.attributes.has("lang")).toBe(false);
    expect(readCookie(page.jar, PARAGLIDE_COOKIE)).toBe("tr");
    expect(page.storage.get(PARAGLIDE_OWNER_KEY)).toBe("tr");
    expect(page.reloads).toBe(1);
  });

  test("undoes a direction forced while the language was system", () => {
    const page = stubPage();
    page.attributes.set("dir", "ltr");
    apply({ lang: "system", dir: "rtl" });
    reset();
    expect(page.attributes.get("dir")).toBe("ltr");
  });
});
