import { afterEach, describe, expect, test } from "bun:test";
import { setDefaultLocale } from "../src/engine/intl";
import {
  apply,
  dirFor,
  intlDirection,
  isRtl,
  languagesFor,
  LOCALE_PRESETS,
  OWNER_KEY,
  PARAGLIDE_COOKIE,
  parseOwned,
  readCookie,
  RELOAD_KEY,
  reset,
  syncStores,
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

  test("follows the script Intl knows for the tag", () => {
    expect(isRtl("pa-Arab")).toBe(true);
    expect(isRtl("pa")).toBe(false);
    expect(isRtl("yi")).toBe(true);
    expect(isRtl("ar-Latn")).toBe(false);
  });

  test("falls back to the list without text info", () => {
    const getTextInfo = Object.getOwnPropertyDescriptor(Intl.Locale.prototype, "getTextInfo");
    Reflect.deleteProperty(Intl.Locale.prototype, "getTextInfo");
    try {
      expect(intlDirection("ar")).toBeNull();
      expect(isRtl("ar")).toBe(true);
      expect(isRtl("pa-Arab")).toBe(false);
    } finally {
      if (getTextInfo) Object.defineProperty(Intl.Locale.prototype, "getTextInfo", getTextInfo);
    }
  });
});

describe("intlDirection", () => {
  test("reads the direction from Intl.Locale", () => {
    expect(intlDirection("he")).toBe("rtl");
    expect(intlDirection("en")).toBe("ltr");
  });

  test("is null for a tag Intl refuses", () => {
    expect(intlDirection("")).toBeNull();
    expect(intlDirection("not a tag!")).toBeNull();
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
  /** `sessionStorage`, which devknobs keeps its own records in too. */
  storage: Map<string, string>;
  /** `localStorage`. */
  local: Map<string, string>;
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
  /** A Next.js page, which reads `NEXT_LOCALE` on the server. */
  next?: boolean;
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
    local: new Map(),
    attributes: new Map(),
  };
  if (options.owner !== undefined) {
    const write = { kind: "cookie", key: PARAGLIDE_COOKIE, prior: null, value: options.owner };
    browser.storage.set(OWNER_KEY, JSON.stringify({ lang: options.owner, writes: [write] }));
  }
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
      get localStorage(): Storage {
        if (options.storageFails) throw new Error("storage is off");
        return storageFor(browser.local, options.storageFull);
      },
      ...(options.next ? { next: {} } : {}),
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

/** The tag devknobs owns the stores for, as the record says. */
function owner(browser: Browser): string | undefined {
  return parseOwned(browser.storage.get(OWNER_KEY) ?? null)?.lang;
}

/** Let enough time pass that the next reload is not read as a loop. */
function later(browser: Browser): void {
  browser.now += 10_000;
}

afterEach(() => {
  Date.now = REAL_NOW;
  setDefaultLocale(null);
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

describe("syncStores", () => {
  test("writes the cookie, remembers the tag and reloads when there is none", () => {
    const browser = stubBrowser("");
    expect(syncStores("tr")).toBe(true);
    expect(readCookie(browser.jar, PARAGLIDE_COOKIE)).toBe("tr");
    expect(owner(browser)).toBe("tr");
    expect(browser.reloads).toBe(1);
  });

  test("writes the tag as it is and keeps the other cookies", () => {
    const browser = stubBrowser(`session=abc; ${PARAGLIDE_COOKIE}=tr`, { owner: "tr" });
    expect(syncStores("en-US")).toBe(true);
    expect(readCookie(browser.jar, PARAGLIDE_COOKIE)).toBe("en-US");
    expect(readCookie(browser.jar, "session")).toBe("abc");
    expect(owner(browser)).toBe("en-US");
    expect(browser.reloads).toBe(1);
  });

  test("does nothing for the tag it already wrote, whatever the cookie says now", () => {
    const jar = `${PARAGLIDE_COOKIE}=en`;
    const browser = stubBrowser(jar, { owner: "tr" });
    expect(syncStores("tr")).toBe(false);
    expect(browser.jar).toBe(jar);
    expect(owner(browser)).toBe("tr");
    expect(browser.reloads).toBe(0);
  });

  test("claims nothing when the host is already on that tag", () => {
    const jar = `${PARAGLIDE_COOKIE}=tr`;
    const browser = stubBrowser(jar);
    expect(syncStores("tr")).toBe(false);
    expect(browser.jar).toBe(jar);
    expect(browser.storage.has(OWNER_KEY)).toBe(false);
    expect(browser.reloads).toBe(0);
  });

  test("expires its own cookie and reloads on system", () => {
    const browser = stubBrowser(`${PARAGLIDE_COOKIE}=tr; session=abc`, { owner: "tr" });
    expect(syncStores(null)).toBe(true);
    expect(readCookie(browser.jar, PARAGLIDE_COOKIE)).toBeNull();
    expect(readCookie(browser.jar, "session")).toBe("abc");
    expect(browser.storage.has(OWNER_KEY)).toBe(false);
    expect(browser.reloads).toBe(1);
  });

  test("leaves a cookie the host set alone on system", () => {
    const jar = `${PARAGLIDE_COOKIE}=de`;
    const browser = stubBrowser(jar);
    expect(syncStores(null)).toBe(false);
    expect(browser.jar).toBe(jar);
    expect(browser.reloads).toBe(0);
  });

  test("forgets a stale owner tag instead of expiring the host's cookie", () => {
    const jar = `${PARAGLIDE_COOKIE}=de`;
    const browser = stubBrowser(jar, { owner: "tr" });
    expect(syncStores(null)).toBe(false);
    expect(browser.jar).toBe(jar);
    expect(browser.storage.has(OWNER_KEY)).toBe(false);
    expect(browser.reloads).toBe(0);
  });

  test("forgets the owner tag when the cookie is gone already", () => {
    const browser = stubBrowser("session=abc", { owner: "tr" });
    expect(syncStores(null)).toBe(false);
    expect(browser.jar).toBe("session=abc");
    expect(browser.storage.has(OWNER_KEY)).toBe(false);
    expect(browser.reloads).toBe(0);
  });

  test("does not reload when the cookie write goes nowhere", () => {
    const browser = stubBrowser("", { cookiesDisabled: true });
    expect(syncStores("tr")).toBe(false);
    expect(browser.jar).toBe("");
    expect(browser.storage.has(OWNER_KEY)).toBe(false);
    expect(browser.reloads).toBe(0);
  });

  test("does not reload when the tag cannot be remembered", () => {
    const browser = stubBrowser("", { storageFull: true });
    expect(syncStores("tr")).toBe(false);
    expect(readCookie(browser.jar, PARAGLIDE_COOKIE)).toBe("tr");
    expect(browser.reloads).toBe(0);
  });

  test("writes nothing at all when storage is off", () => {
    const browser = stubBrowser("", { storageFails: true });
    expect(syncStores("tr")).toBe(false);
    expect(browser.jar).toBe("");
    expect(browser.reloads).toBe(0);
  });

  test("keeps the tag owned when the expiry is refused", () => {
    const jar = `${PARAGLIDE_COOKIE}=tr; session=abc`;
    const browser = stubBrowser(jar, { owner: "tr", expiryIgnored: true });
    expect(syncStores(null)).toBe(false);
    expect(browser.jar).toBe(jar);
    expect(owner(browser)).toBe("tr");
    expect(browser.reloads).toBe(0);
  });

  test("writes nothing for a reload asked for moments after the first", () => {
    const browser = stubBrowser("");
    expect(syncStores("tr")).toBe(true);
    expect(browser.reloads).toBe(1);
    expect(syncStores("de")).toBe(false);
    expect(syncStores("de")).toBe(false);
    expect(readCookie(browser.jar, PARAGLIDE_COOKIE)).toBe("tr");
    expect(owner(browser)).toBe("tr");
    expect(browser.storage.has(RELOAD_KEY)).toBe(true);
    expect(browser.reloads).toBe(1);
  });

  test("asks again for the tag whose reload was refused", () => {
    const browser = stubBrowser("");
    expect(syncStores("tr")).toBe(true);
    expect(syncStores("de")).toBe(false);
    expect(syncStores("de")).toBe(false);
    later(browser);
    expect(syncStores("de")).toBe(true);
    expect(readCookie(browser.jar, PARAGLIDE_COOKIE)).toBe("de");
    expect(owner(browser)).toBe("de");
    expect(browser.reloads).toBe(2);
  });

  test("reloads again once the throttle window is past", () => {
    const browser = stubBrowser("");
    expect(syncStores("tr")).toBe(true);
    later(browser);
    expect(syncStores("de")).toBe(true);
    expect(browser.reloads).toBe(2);
  });

  test("does nothing without a document", () => {
    expect(syncStores("tr")).toBe(false);
    expect(syncStores(null)).toBe(false);
  });
});

describe("adapters", () => {
  test("puts back the value the host had before", () => {
    const browser = stubBrowser(`${PARAGLIDE_COOKIE}=de`);
    expect(syncStores("tr")).toBe(true);
    expect(readCookie(browser.jar, PARAGLIDE_COOKIE)).toBe("tr");
    later(browser);
    expect(syncStores("fr")).toBe(true);
    later(browser);
    expect(syncStores(null)).toBe(true);
    expect(readCookie(browser.jar, PARAGLIDE_COOKIE)).toBe("de");
    expect(browser.storage.has(OWNER_KEY)).toBe(false);
    expect(browser.reloads).toBe(3);
  });

  test("writes i18next only where the page keeps it, and puts it back", () => {
    const browser = stubBrowser("");
    browser.local.set("i18nextLng", "en");
    expect(syncStores("tr")).toBe(true);
    expect(browser.local.get("i18nextLng")).toBe("tr");
    expect(browser.storage.has("i18nextLng")).toBe(false);
    expect(readCookie(browser.jar, "i18next")).toBeNull();
    later(browser);
    expect(syncStores(null)).toBe(true);
    expect(browser.local.get("i18nextLng")).toBe("en");
    expect(readCookie(browser.jar, PARAGLIDE_COOKIE)).toBeNull();
    expect(browser.reloads).toBe(2);
  });

  test("writes the i18next cookie and session key when the page has them", () => {
    const browser = stubBrowser("i18next=en");
    browser.storage.set("i18nextLng", "en");
    syncStores("tr");
    expect(readCookie(browser.jar, "i18next")).toBe("tr");
    expect(browser.storage.get("i18nextLng")).toBe("tr");
    expect(browser.reloads).toBe(1);
  });

  test("writes paraglide local storage only when the page uses it", () => {
    const browser = stubBrowser("");
    syncStores("tr");
    expect(browser.local.has(PARAGLIDE_COOKIE)).toBe(false);
    const used = stubBrowser("");
    used.local.set(PARAGLIDE_COOKIE, "en");
    syncStores("tr");
    expect(used.local.get(PARAGLIDE_COOKIE)).toBe("tr");
  });

  test("writes NEXT_LOCALE on a Next.js page, and only there", () => {
    const plain = stubBrowser("");
    syncStores("tr");
    expect(readCookie(plain.jar, "NEXT_LOCALE")).toBeNull();
    const next = stubBrowser("", { next: true });
    syncStores("tr");
    expect(readCookie(next.jar, "NEXT_LOCALE")).toBe("tr");
    later(next);
    syncStores(null);
    expect(readCookie(next.jar, "NEXT_LOCALE")).toBeNull();
    const kept = stubBrowser("NEXT_LOCALE=en");
    syncStores("tr");
    expect(readCookie(kept.jar, "NEXT_LOCALE")).toBe("tr");
  });

  test("leaves a store the host wrote over, and puts back the rest", () => {
    const browser = stubBrowser("");
    browser.local.set("i18nextLng", "en");
    syncStores("tr");
    // The library falls back to a locale it ships and caches that.
    browser.local.set("i18nextLng", "de");
    later(browser);
    expect(syncStores(null)).toBe(true);
    expect(browser.local.get("i18nextLng")).toBe("de");
    expect(readCookie(browser.jar, PARAGLIDE_COOKIE)).toBeNull();
  });
});

describe("parseOwned", () => {
  test("reads a record and drops the entries it cannot use", () => {
    const write = { kind: "local" as const, key: "i18nextLng", prior: "en", value: "tr" };
    expect(
      parseOwned(
        JSON.stringify({ lang: "tr", writes: [write, { kind: "disk", key: "x", value: "tr" }] }),
      ),
    ).toEqual({ lang: "tr", writes: [write] });
  });

  test("is null for anything else", () => {
    expect(parseOwned(null)).toBeNull();
    expect(parseOwned("tr")).toBeNull();
    expect(parseOwned("null")).toBeNull();
    expect(parseOwned(JSON.stringify({ lang: "tr" }))).toBeNull();
  });
});

describe("apply", () => {
  test("sets the attributes, writes the cookie and reloads", () => {
    const page = stubPage();
    apply({ lang: "tr", dir: "system" });
    expect(page.attributes.get("lang")).toBe("tr");
    expect(page.attributes.get("dir")).toBe("ltr");
    expect(readCookie(page.jar, PARAGLIDE_COOKIE)).toBe("tr");
    expect(owner(page)).toBe("tr");
    expect(page.reloads).toBe(1);
  });

  test("makes the language the Intl default until reset", () => {
    stubPage();
    apply({ lang: "tr", dir: "system" });
    expect(new Intl.NumberFormat().resolvedOptions().locale).toBe("tr");
    reset();
    expect(new Intl.NumberFormat().resolvedOptions().locale).not.toBe("tr");
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
    expect(owner(page)).toBe("tr");
    expect(page.reloads).toBe(1);
    later(page);
    apply({ lang: "de", dir: "system" });
    expect(readCookie(page.jar, PARAGLIDE_COOKIE)).toBe("de");
    expect(owner(page)).toBe("de");
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
    expect(page.storage.has(OWNER_KEY)).toBe(false);
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
    expect(page.storage.has(OWNER_KEY)).toBe(false);
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
    expect(page.storage.has(OWNER_KEY)).toBe(false);
    expect(page.reloads).toBe(2);
  });

  test("leaves a cookie the host owns alone, knob and all", () => {
    const jar = `${PARAGLIDE_COOKIE}=tr`;
    const page = stubPage(jar);
    apply({ lang: "tr", dir: "system" });
    expect(page.jar).toBe(jar);
    expect(page.storage.has(OWNER_KEY)).toBe(false);
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
    expect(owner(page)).toBe("de");
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

/** A MutationObserver the test fires by hand, as the page writes. */
class FakeObserver {
  static live: FakeObserver[] = [];
  connected = false;
  constructor(readonly callback: () => void) {}
  observe(): void {
    this.connected = true;
    FakeObserver.live.push(this);
  }
  disconnect(): void {
    this.connected = false;
  }
}

/** The page writes an attribute, and every observer still connected hears of it. */
function pageWrites(page: Browser, name: string, value: string): void {
  page.attributes.set(name, value);
  for (const observer of FakeObserver.live) {
    if (observer.connected) observer.callback();
  }
}

describe("sticky lang and dir", () => {
  afterEach(() => {
    FakeObserver.live = [];
    Reflect.deleteProperty(globalThis, "MutationObserver");
  });

  function stubSticky(): Browser {
    Object.defineProperty(globalThis, "MutationObserver", {
      configurable: true,
      value: FakeObserver,
    });
    return stubPage();
  }

  test("puts back what the page writes over while the knob is set", () => {
    const page = stubSticky();
    apply({ lang: "ar", dir: "system" });
    pageWrites(page, "lang", "en");
    pageWrites(page, "dir", "ltr");
    expect(page.attributes.get("lang")).toBe("ar");
    expect(page.attributes.get("dir")).toBe("rtl");
  });

  test("holds only the direction while the language is system", () => {
    const page = stubSticky();
    apply({ lang: "system", dir: "rtl" });
    pageWrites(page, "lang", "en");
    pageWrites(page, "dir", "ltr");
    expect(page.attributes.get("lang")).toBe("en");
    expect(page.attributes.get("dir")).toBe("rtl");
  });

  test("lets go on reset", () => {
    const page = stubSticky();
    apply({ lang: "ar", dir: "system" });
    reset();
    pageWrites(page, "lang", "en");
    expect(page.attributes.get("lang")).toBe("en");
  });

  test("gives up on a page that keeps writing back, until the knobs change", () => {
    const page = stubSticky();
    apply({ lang: "ar", dir: "system" });
    for (let i = 0; i < 30; i++) pageWrites(page, "lang", "en");
    expect(page.attributes.get("lang")).toBe("en");
    later(page);
    apply({ lang: "ar", dir: "system" });
    pageWrites(page, "lang", "en");
    expect(page.attributes.get("lang")).toBe("ar");
  });
});

describe("reset", () => {
  test("hands the page back without touching the cookie", () => {
    const page = stubPage();
    apply({ lang: "tr", dir: "system" });
    reset();
    expect(page.attributes.has("lang")).toBe(false);
    expect(readCookie(page.jar, PARAGLIDE_COOKIE)).toBe("tr");
    expect(owner(page)).toBe("tr");
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
