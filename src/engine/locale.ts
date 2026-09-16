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

function writeOwner(lang: string): void {
  try {
    window.localStorage.setItem(PARAGLIDE_OWNER_KEY, lang);
  } catch {
    // Same.
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
 * Point the Paraglide cookie at `lang`, or expire it when `lang` is null, and
 * reload so the server renders its strings in that locale. A cookie that
 * already says the same thing is left alone: that is what keeps the reload from
 * looping, because the stored state applies the same locale again on mount.
 * Only a cookie devknobs wrote itself is ever expired, so a locale the host's
 * own switcher set survives the knob sitting at `system`. Returns whether the
 * page was reloaded.
 */
export function syncParaglideCookie(lang: string | null): boolean {
  if (typeof document === "undefined") return false;
  const current = readCookie(document.cookie, PARAGLIDE_COOKIE);
  if (lang === null) {
    const owner = readOwner();
    if (owner === null) return false;
    clearOwner();
    if (owner !== current) return false;
    document.cookie = `${PARAGLIDE_COOKIE}=; max-age=0; path=/`;
  } else {
    if (current === lang) return false;
    document.cookie = `${PARAGLIDE_COOKIE}=${lang}; path=/; SameSite=Lax`;
    writeOwner(lang);
  }
  window.location.reload();
  return true;
}

let captured = false;
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
    reset();
    return;
  }
  setAttribute("lang", value.lang);
  setAttribute("dir", dirFor(value));
  patchNavigator(value.lang);
  window.dispatchEvent(new Event("languagechange"));
  syncParaglideCookie(value.lang);
}

export function reset(): void {
  if (captured) {
    setAttribute("lang", originalLang);
    setAttribute("dir", originalDir);
    captured = false;
  }
  if (navigatorPatched) {
    restoreNavigator();
    window.dispatchEvent(new Event("languagechange"));
  }
  syncParaglideCookie(null);
}
