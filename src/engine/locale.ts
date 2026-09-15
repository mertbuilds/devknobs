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
}
