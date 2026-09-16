import type { LocaleValue } from "../types";

export const LOCALE_PRESETS = [
  "en",
  "en-US",
  "tr",
  "de",
  "fr",
  "es",
  "ar",
  "he",
  "ja",
  "zh-CN",
] as const;

/** Cookie Paraglide JS reads before the `Accept-Language` header. */
export const PARAGLIDE_COOKIE = "PARAGLIDE_LOCALE";

/** Where the tag devknobs wrote into that cookie is remembered. */
export const PARAGLIDE_OWNER_KEY = "devknobs:paraglide-cookie";

/** Where the last reload devknobs asked for is timed. */
export const PARAGLIDE_RELOAD_KEY = "devknobs:paraglide-reload";

/** How long after a reload another one is read as a loop, in ms. */
const RELOAD_THROTTLE = 5000;

const RTL_LANGUAGES = new Set(["ar", "he", "fa", "ur"]);

/** Is this language tag written right to left? */
export function isRtl(lang: string): boolean {
  const base = lang.toLowerCase().split("-")[0] ?? "";
  return RTL_LANGUAGES.has(base);
}

/** The direction to use, deriving it from the language when set to `system`. */
export function dirFor(value: LocaleValue): "ltr" | "rtl" {
  if (value.dir !== "system") return value.dir;
  return isRtl(value.lang) ? "rtl" : "ltr";
}

/** What `navigator.languages` should report for a tag: the tag, then its base. */
export function languagesFor(lang: string): string[] {
  const base = lang.split("-")[0];
  return base && base !== lang ? [lang, base] : [lang];
}

/** The value of one cookie in a `document.cookie` string, or null when unset. */
export function readCookie(jar: string, name: string): string | null {
  for (const entry of jar.split(";")) {
    const separator = entry.indexOf("=");
    if (separator === -1) continue;
    if (entry.slice(0, separator).trim() !== name) continue;
    return entry.slice(separator + 1).trim();
  }
  return null;
}

/** The tag devknobs last wrote into the cookie, across reloads. */
function readOwner(): string | null {
  try {
    return window.localStorage.getItem(PARAGLIDE_OWNER_KEY);
  } catch {
    // Private mode, disabled storage: the cookie is then nobody's to expire.
    return null;
  }
}

/** Remember the tag. False when storage refused, so nothing can be proven. */
function writeOwner(lang: string): boolean {
  try {
    window.localStorage.setItem(PARAGLIDE_OWNER_KEY, lang);
    return true;
  } catch {
    // Same.
    return false;
  }
}

function clearOwner(): void {
  try {
    window.localStorage.removeItem(PARAGLIDE_OWNER_KEY);
  } catch {
    // Same.
  }
}

/**
 * Reload, unless devknobs asked for one moments ago. Two reloads in a row are a
 * loop, and a loop is worse than a locale that lags the knob. Storage carries
 * the timing across the reload, so without it no reload is safe to start.
 */
function reloadOnce(): boolean {
  try {
    const store = window.sessionStorage;
    const previous = Number(store.getItem(PARAGLIDE_RELOAD_KEY));
    if (previous && Date.now() - previous < RELOAD_THROTTLE) {
      store.removeItem(PARAGLIDE_RELOAD_KEY);
      return false;
    }
    store.setItem(PARAGLIDE_RELOAD_KEY, String(Date.now()));
  } catch {
    // No storage, no way to tell one reload from the next: do not start one.
    return false;
  }
  window.location.reload();
  return true;
}

/**
 * Point the Paraglide cookie at `lang`, or expire it when `lang` is null, and
 * reload so the server renders its strings in that locale. Everything is keyed
 * on the tag devknobs wrote, never on what the cookie says now: the host owns
 * the cookie after the reload, and a framework that rewrites it to a locale it
 * actually ships must not be argued with. So one knob choice buys one reload,
 * and a cookie devknobs did not write is never expired.
 * Returns whether the page was reloaded.
 */
export function syncParaglideCookie(lang: string | null): boolean {
  if (typeof document === "undefined") return false;
  const owner = readOwner();
  if (lang === null) {
    if (owner === null) return false;
    clearOwner();
    if (readCookie(document.cookie, PARAGLIDE_COOKIE) !== owner) return false;
    document.cookie = `${PARAGLIDE_COOKIE}=; max-age=0; path=/`;
    return reloadOnce();
  }
  if (owner === lang) return false;
  if (readCookie(document.cookie, PARAGLIDE_COOKIE) === lang) return false;
  document.cookie = `${PARAGLIDE_COOKIE}=${lang}; path=/; SameSite=Lax`;
  if (readCookie(document.cookie, PARAGLIDE_COOKIE) !== lang) {
    clearOwner();
    return false;
  }
  if (!writeOwner(lang)) return false;
  return reloadOnce();
}

let captured = false;
let appliedLang: string | null = null;
let originalLang: string | null = null;
let originalDir: string | null = null;
let languageDescriptor: PropertyDescriptor | undefined;
let languagesDescriptor: PropertyDescriptor | undefined;
let navigatorPatched = false;

function setAttribute(name: string, value: string | null): void {
  const root = document.documentElement;
  if (value === null) root.removeAttribute(name);
  else root.setAttribute(name, value);
}

function patchNavigator(lang: string): void {
  if (!navigatorPatched) {
    languageDescriptor = Object.getOwnPropertyDescriptor(Navigator.prototype, "language");
    languagesDescriptor = Object.getOwnPropertyDescriptor(Navigator.prototype, "languages");
    navigatorPatched = true;
  }
  const languages = Object.freeze(languagesFor(lang));
  Object.defineProperty(Navigator.prototype, "language", {
    configurable: true,
    get: () => lang,
  });
  Object.defineProperty(Navigator.prototype, "languages", {
    configurable: true,
    get: () => languages,
  });
}

function restoreNavigator(): void {
  if (!navigatorPatched) return;
  if (languageDescriptor) Object.defineProperty(Navigator.prototype, "language", languageDescriptor);
  else Reflect.deleteProperty(Navigator.prototype, "language");
  if (languagesDescriptor) {
    Object.defineProperty(Navigator.prototype, "languages", languagesDescriptor);
  } else Reflect.deleteProperty(Navigator.prototype, "languages");
  navigatorPatched = false;
}

export function apply(value: LocaleValue): void {
  if (!captured) {
    originalLang = document.documentElement.getAttribute("lang");
    originalDir = document.documentElement.getAttribute("dir");
    captured = true;
  }
  if (!value.lang || value.lang === "system") {
    const applied = appliedLang;
    reset();
    if (value.dir !== "system") {
      // `reset` gave the originals back and stopped owning them. Own them
      // again, so a later reset can undo the direction forced here on its own.
      captured = true;
      setAttribute("dir", value.dir);
    }
    if (applied !== null) syncParaglideCookie(null);
    return;
  }
  setAttribute("lang", value.lang);
  setAttribute("dir", dirFor(value));
  patchNavigator(value.lang);
  window.dispatchEvent(new Event("languagechange"));
  if (value.lang !== appliedLang) syncParaglideCookie(value.lang);
  appliedLang = value.lang;
}

/**
 * Put `lang`, `dir` and `navigator` back. The cookie is left alone: only an
 * explicit switch to `system` through `apply` expires it, so that a strict mode
 * unmount and remount cannot bounce the page between two reloads.
 */
export function reset(): void {
  appliedLang = null;
  if (captured) {
    setAttribute("lang", originalLang);
    setAttribute("dir", originalDir);
    captured = false;
  }
  if (navigatorPatched) {
    restoreNavigator();
    window.dispatchEvent(new Event("languagechange"));
  }
}
