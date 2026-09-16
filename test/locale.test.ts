import { afterEach, describe, expect, test } from "bun:test";
import {
  apply,
  dirFor,
  isRtl,
  languagesFor,
  LOCALE_PRESETS,
  PARAGLIDE_COOKIE,
  PARAGLIDE_OWNER_KEY,
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

/** What a browser would leave in the jar after one `document.cookie` write. */
function writeJar(jar: string, entry: string): string {
  const pair = entry.split(";")[0] ?? "";
  const separator = pair.indexOf("=");
  const name = pair.slice(0, separator).trim();
  const value = pair.slice(separator + 1).trim();
  const expired = entry
    .split(";")
    .slice(1)
    .some((attribute) => attribute.trim().toLowerCase() === "max-age=0");
  const rest = jar
    .split(";")
    .map((cookie) => cookie.trim())
    .filter((cookie) => cookie && cookie.slice(0, cookie.indexOf("=")).trim() !== name);
  return (expired ? rest : [...rest, `${name}=${value}`]).join("; ");
}

interface Browser {
  jar: string;
  reloads: number;
  storage: Map<string, string>;
  attributes: Map<string, string>;
}

/**
 * A document with a cookie jar, a window whose reload only counts itself, and a
 * localStorage backed by a map. `owner` seeds the tag devknobs wrote before.
 */
function stubBrowser(jar: string, owner?: string, storageFails = false): Browser {
  const browser: Browser = { jar, reloads: 0, storage: new Map(), attributes: new Map() };
  if (owner !== undefined) browser.storage.set(PARAGLIDE_OWNER_KEY, owner);
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      get cookie(): string {
        return browser.jar;
      },
      set cookie(entry: string) {
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
      get localStorage(): Storage {
        if (storageFails) throw new Error("storage is off");
        return {
          getItem: (key: string) => browser.storage.get(key) ?? null,
          setItem: (key: string, value: string) => {
            browser.storage.set(key, value);
          },
          removeItem: (key: string) => {
            browser.storage.delete(key);
          },
        } as Storage;
      },
    },
  });
  return browser;
}

/** A stubbed browser with the module's own state cleared out. */
function stubPage(jar = "", owner?: string): Browser {
  const browser = stubBrowser(jar, owner);
  reset();
  browser.reloads = 0;
  return browser;
}

afterEach(() => {
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
    const browser = stubBrowser(`session=abc; ${PARAGLIDE_COOKIE}=tr`, "tr");
    expect(syncParaglideCookie("en-US")).toBe(true);
    expect(readCookie(browser.jar, PARAGLIDE_COOKIE)).toBe("en-US");
    expect(readCookie(browser.jar, "session")).toBe("abc");
    expect(browser.storage.get(PARAGLIDE_OWNER_KEY)).toBe("en-US");
    expect(browser.reloads).toBe(1);
  });

  test("writes nothing and does not reload when the cookie already says it", () => {
    const jar = `${PARAGLIDE_COOKIE}=tr`;
    const browser = stubBrowser(jar, "tr");
    expect(syncParaglideCookie("tr")).toBe(false);
    expect(browser.jar).toBe(jar);
    expect(browser.reloads).toBe(0);
  });

  test("expires its own cookie and reloads on system", () => {
    const browser = stubBrowser(`${PARAGLIDE_COOKIE}=tr; session=abc`, "tr");
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
    const browser = stubBrowser(jar, "tr");
    expect(syncParaglideCookie(null)).toBe(false);
    expect(browser.jar).toBe(jar);
    expect(browser.storage.has(PARAGLIDE_OWNER_KEY)).toBe(false);
    expect(browser.reloads).toBe(0);
  });

  test("forgets the owner tag when the cookie is gone already", () => {
    const browser = stubBrowser("session=abc", "tr");
    expect(syncParaglideCookie(null)).toBe(false);
    expect(browser.jar).toBe("session=abc");
    expect(browser.storage.has(PARAGLIDE_OWNER_KEY)).toBe(false);
    expect(browser.reloads).toBe(0);
  });

  test("does nothing on system when there is no cookie", () => {
    const browser = stubBrowser("session=abc");
    expect(syncParaglideCookie(null)).toBe(false);
    expect(browser.jar).toBe("session=abc");
    expect(browser.reloads).toBe(0);
  });

  test("still switches the locale when storage is unavailable", () => {
    const browser = stubBrowser("", undefined, true);
    expect(syncParaglideCookie("tr")).toBe(true);
    expect(readCookie(browser.jar, PARAGLIDE_COOKIE)).toBe("tr");
    expect(browser.reloads).toBe(1);
    expect(syncParaglideCookie(null)).toBe(false);
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
    apply({ lang: "tr", dir: "rtl" });
    expect(page.attributes.get("dir")).toBe("rtl");
    expect(page.reloads).toBe(1);
  });

  test("expires its own cookie when the locale goes back to system", () => {
    const page = stubPage();
    apply({ lang: "tr", dir: "system" });
    apply({ lang: "system", dir: "system" });
    expect(readCookie(page.jar, PARAGLIDE_COOKIE)).toBeNull();
    expect(page.storage.has(PARAGLIDE_OWNER_KEY)).toBe(false);
    expect(page.reloads).toBe(2);
  });

  test("does nothing on system when no language was applied", () => {
    const jar = `${PARAGLIDE_COOKIE}=de`;
    const page = stubPage(jar, "de");
    apply({ lang: "system", dir: "system" });
    expect(page.jar).toBe(jar);
    expect(page.storage.get(PARAGLIDE_OWNER_KEY)).toBe("de");
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

  test("a remount after it syncs nothing while the cookie already fits", () => {
    const page = stubPage();
    apply({ lang: "tr", dir: "system" });
    reset();
    apply({ lang: "tr", dir: "system" });
    expect(page.reloads).toBe(1);
  });
});
