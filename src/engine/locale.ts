import type { LocaleValue } from "../types";
import { realNow } from "./clock";
import { setDefaultLocale } from "./intl";
import { newer, stamped } from "./stored";

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

/**
 * Where the stores devknobs wrote into are remembered, with what each held
 * before. It sits beside the knobs in `sessionStorage`, so ownership outlives
 * a reload and dies with the tab: a second tab left on `system` never puts
 * back what this one wrote.
 */
export const OWNER_KEY = "devknobs:locale-stores";

/** The version of the record `OWNER_KEY` keeps. Bump it with a change of shape, see stored.ts. */
export const OWNER_VERSION = 1;

/** Where the last reload devknobs asked for is timed. */
export const RELOAD_KEY = "devknobs:locale-reload";

/** The version of the timing `RELOAD_KEY` keeps. Bump it with a change of shape, see stored.ts. */
export const RELOAD_VERSION = 1;

/** How long after a reload another one is read as a loop, in ms. */
const RELOAD_THROTTLE = 5000;

/**
 * How many times a second `lang` and `dir` are put back. A page that writes
 * them back just as fast would loop with devknobs, so past this it wins.
 */
const HOLD_BUDGET = 20;

/** For a browser whose `Intl.Locale` does not know text direction. */
const RTL_LANGUAGES = new Set(["ar", "he", "fa", "ur"]);

interface TextInfo {
  direction?: string;
}

/** `Intl.Locale` with the text info only some engines ship, as a method or a getter. */
type LocaleWithTextInfo = Intl.Locale & { getTextInfo?(): TextInfo; textInfo?: TextInfo };

/** The direction `Intl` knows for the tag, script and all, or null when it does not. */
export function intlDirection(lang: string): "ltr" | "rtl" | null {
  try {
    const locale = new Intl.Locale(lang) as LocaleWithTextInfo;
    const info = typeof locale.getTextInfo === "function" ? locale.getTextInfo() : locale.textInfo;
    const direction = info?.direction;
    return direction === "ltr" || direction === "rtl" ? direction : null;
  } catch {
    return null;
  }
}

/** Is this language tag written right to left? */
export function isRtl(lang: string): boolean {
  const direction = intlDirection(lang);
  if (direction !== null) return direction === "rtl";
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

export type StoreKind = "cookie" | "local" | "session";

/** One place an i18n library keeps the locale between page loads. */
export interface LocaleAdapter {
  library: string;
  kind: StoreKind;
  key: string;
  /** Does the page use this store, given whether it holds a value right now? */
  used(present: boolean): boolean;
}

/** Is this page a Next.js app, whose i18n reads `NEXT_LOCALE` on the server? */
function isNext(): boolean {
  if (typeof window === "undefined") return false;
  if ("__next_f" in window || "next" in window) return true;
  return document.querySelector?.('script[src*="/_next/"]') != null;
}

const present = (has: boolean) => has;

/**
 * The stores devknobs keeps in step with the knob. A store already holding a
 * value is one the page uses. Paraglide's cookie is written on every page:
 * nothing writes it before the user picks a locale, yet the server reads it
 * first. `NEXT_LOCALE` is written on any Next.js page for the same reason.
 */
export const ADAPTERS: LocaleAdapter[] = [
  { library: "paraglide", kind: "cookie", key: PARAGLIDE_COOKIE, used: () => true },
  { library: "paraglide", kind: "local", key: "PARAGLIDE_LOCALE", used: present },
  { library: "i18next", kind: "local", key: "i18nextLng", used: present },
  { library: "i18next", kind: "session", key: "i18nextLng", used: present },
  { library: "i18next", kind: "cookie", key: "i18next", used: present },
  { library: "next-intl", kind: "cookie", key: "NEXT_LOCALE", used: (has) => has || isNext() },
];

/** A store devknobs wrote `value` into, and what it held before, null for nothing. */
export interface Written {
  kind: StoreKind;
  key: string;
  prior: string | null;
  value: string;
}

/** Everything devknobs wrote for the tag it last applied. */
export interface Owned {
  lang: string;
  writes: Written[];
}

type Store = Pick<Written, "kind" | "key">;

const KINDS: StoreKind[] = ["cookie", "local", "session"];

function webStorage(kind: StoreKind): Storage | null {
  try {
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

function readStore(store: Store): string | null {
  if (store.kind === "cookie") return readCookie(document.cookie, store.key);
  try {
    return webStorage(store.kind)?.getItem(store.key) ?? null;
  } catch {
    return null;
  }
}

/** Write `value` into the store, or clear it with null. */
function writeStore(store: Store, value: string | null): void {
  if (store.kind === "cookie") {
    document.cookie =
      value === null
        ? `${store.key}=; max-age=0; path=/`
        : `${store.key}=${value}; path=/; SameSite=Lax`;
    return;
  }
  try {
    const storage = webStorage(store.kind);
    if (value === null) storage?.removeItem(store.key);
    else storage?.setItem(store.key, value);
  } catch {
    // Storage refused: the read back tells.
  }
}

/** Read an ownership record, or null when it is missing or malformed. */
export function parseOwned(json: string | null): Owned | null {
  if (!json) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  if (newer(raw, OWNER_VERSION)) return null;
  const record = raw as Partial<Owned> | null;
  if (typeof record?.lang !== "string" || !Array.isArray(record.writes)) return null;
  const writes = (record.writes as Partial<Written>[]).filter(
    (entry) =>
      KINDS.includes(entry.kind as StoreKind) &&
      typeof entry.key === "string" &&
      typeof entry.value === "string" &&
      (entry.prior === null || typeof entry.prior === "string"),
  ) as Written[];
  return { lang: record.lang, writes };
}

/** What devknobs wrote, across this tab's reloads. */
function readOwned(): Owned | null {
  try {
    return parseOwned(window.sessionStorage.getItem(OWNER_KEY));
  } catch {
    // Private mode, disabled storage: nothing is devknobs' to put back.
    return null;
  }
}

/** Remember the writes. False when storage refused, so nothing can be proven. */
function writeOwned(owned: Owned): boolean {
  try {
    window.sessionStorage.setItem(OWNER_KEY, JSON.stringify(stamped(owned, OWNER_VERSION)));
    return true;
  } catch {
    // Same.
    return false;
  }
}

function clearOwned(): void {
  try {
    window.sessionStorage.removeItem(OWNER_KEY);
  } catch {
    // Same.
  }
}

/**
 * When the last reload devknobs asked for was, from its record, or 0 for none.
 * One kept before records had a version is the time alone.
 */
export function parseReload(text: string | null): number {
  if (!text) return 0;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return 0;
  }
  if (typeof raw === "number") return raw;
  if (typeof raw !== "object" || raw === null || newer(raw, RELOAD_VERSION)) return 0;
  const at: unknown = Reflect.get(raw, "at");
  return typeof at === "number" ? at : 0;
}

/**
 * How long until a reload asked for is not a loop, in ms: 0 for now, and
 * Infinity for never. Two reloads in a row are one, and a loop is worse than a
 * locale that lags the knob. Storage carries the timing across the reload, so
 * without it no reload is safe to start. The record stands until a reload that
 * happens overwrites it, so every ask inside the window is refused, not only
 * the first one.
 */
function reloadWait(): number {
  try {
    const previous = parseReload(window.sessionStorage.getItem(RELOAD_KEY));
    if (!(previous > 0)) return 0;
    // A time ahead of the clock waits one window at a time, not until the clock catches up.
    return Math.min(RELOAD_THROTTLE, Math.max(0, previous + RELOAD_THROTTLE - realNow()));
  } catch {
    // No storage, no way to tell one reload from the next: do not start one.
    return Infinity;
  }
}

/** Would a reload asked for now be a loop? */
function reloadBlocked(): boolean {
  return reloadWait() > 0;
}

/** Time this reload, so the next ask moments from now reads as a loop. */
function reloadOnce(): boolean {
  try {
    const record = stamped({ at: realNow() }, RELOAD_VERSION);
    window.sessionStorage.setItem(RELOAD_KEY, JSON.stringify(record));
  } catch {
    // Storage answered a moment ago and refuses now: nothing would time this
    // reload, so do not start it.
    return false;
  }
  window.location.reload();
  return true;
}

/** Put back every store that still holds what devknobs wrote. */
function restoreStores(owned: Owned): boolean {
  let restored = false;
  const kept: Written[] = [];
  for (const entry of owned.writes) {
    // The host wrote over it since. It is the host's now, not devknobs' to undo.
    if (readStore(entry) !== entry.value) continue;
    writeStore(entry, entry.prior);
    if (readStore(entry) === entry.prior) restored = true;
    else kept.push(entry);
  }
  // A store that refused stays owned, so a later mount can put it back after all.
  if (kept.length === 0) clearOwned();
  else if (!writeOwned({ lang: owned.lang, writes: kept })) return false;
  return restored;
}

/**
 * Point every store the page uses at `lang`, or put back what each held before
 * when `lang` is null, and reload so the page reads its locale again. Ownership
 * is keyed on what devknobs wrote, never on what a store says now: the host
 * owns the stores after the reload, and a framework that rewrites one to a
 * locale it actually ships must not be argued with. So one knob choice buys
 * one reload, a store already on the tag is not claimed, and one the host
 * wrote over is never put back. A reload the throttle refuses is settled
 * first, before anything is written: a store the page never reloads for only
 * hides the strings it renders with. Returns whether the page was reloaded.
 */
export function syncStores(lang: string | null): boolean {
  if (typeof document === "undefined") return false;
  if (reloadBlocked()) return false;
  const owned = readOwned();
  if (lang === null) return owned !== null && restoreStores(owned) && reloadOnce();
  if (owned?.lang === lang) return false;
  const writes: Written[] = [];
  let changed = false;
  for (const adapter of ADAPTERS) {
    const current = readStore(adapter);
    const previous = owned?.writes.find(
      (entry) => entry.kind === adapter.kind && entry.key === adapter.key,
    );
    const ours = previous !== undefined && current === previous.value;
    if (!ours && !adapter.used(current !== null)) continue;
    if (current === lang) {
      if (ours) writes.push(previous);
      continue;
    }
    writeStore(adapter, lang);
    const prior = ours ? previous.prior : current;
    if (readStore(adapter) === lang) {
      writes.push({ kind: adapter.kind, key: adapter.key, prior, value: lang });
      changed = true;
    } else if (ours) writes.push(previous);
  }
  if (!changed) {
    // Nothing took the tag. What is still devknobs' stays owned under the old one.
    if (owned && writes.length > 0) writeOwned({ lang: owned.lang, writes });
    else clearOwned();
    return false;
  }
  if (!writeOwned({ lang, writes })) return false;
  return reloadOnce();
}

/** The put back the throttle held off, waiting out its window. */
let retry = 0;

function cancelRetry(): void {
  if (!retry) return;
  window.clearTimeout(retry);
  retry = 0;
}

/**
 * Put back the stores the record says devknobs wrote, on any page load that
 * finds the knob on `system`, not only the one that switched it: a switch the
 * throttle refused moments after a reload leaves the record behind. One the
 * throttle refuses now is asked for again once its window is past.
 */
function settle(): void {
  cancelRetry();
  if (readOwned() === null) return;
  const wait = reloadWait();
  if (wait === 0) syncStores(null);
  else if (Number.isFinite(wait)) retry = window.setTimeout(settle, wait);
}

let captured = false;
let appliedLang: string | null = null;
let originalLang: string | null = null;
let originalDir: string | null = null;
let languageDescriptor: PropertyDescriptor | undefined;
let languagesDescriptor: PropertyDescriptor | undefined;
let navigatorPatched = false;
/** What `lang` and `dir` are held at while the knob is set, null for the page's own. */
const held: Record<"lang" | "dir", string | null> = { lang: null, dir: null };
let holder: MutationObserver | null = null;
let holdWindow = 0;
let holdCount = 0;

function setAttribute(name: string, value: string | null): void {
  const root = document.documentElement;
  if (value === null) root.removeAttribute(name);
  else root.setAttribute(name, value);
}

/**
 * Put back a `lang` or `dir` the page wrote over, the way a framework does on
 * every navigation. The write back is a mutation too, and finds nothing left
 * to do.
 */
function restoreHeld(): void {
  const now = realNow();
  if (now - holdWindow >= 1000) {
    holdWindow = now;
    holdCount = 0;
  }
  for (const name of ["lang", "dir"] as const) {
    const value = held[name];
    if (value === null || document.documentElement.getAttribute(name) === value) continue;
    if (++holdCount > HOLD_BUDGET) {
      // Until the knobs change again, the page has the last word.
      holder?.disconnect();
      holder = null;
      return;
    }
    setAttribute(name, value);
  }
}

/** Keep `lang` and `dir` on `<html>` at these values, or let go with nulls. */
function hold(lang: string | null, dir: string | null): void {
  held.lang = lang;
  held.dir = dir;
  if (lang === null && dir === null) {
    holder?.disconnect();
    holder = null;
    return;
  }
  if (holder || typeof MutationObserver === "undefined") return;
  holder = new MutationObserver(restoreHeld);
  holder.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["lang", "dir"],
  });
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
    if (value.dir !== "system") {
      // `reset` gave the originals back and stopped owning them. Own them
      // again, so a later reset can undo the direction forced here on its own.
      captured = true;
      setAttribute("dir", value.dir);
      hold(null, value.dir);
    }
    settle();
    return;
  }
  cancelRetry();
  setAttribute("lang", value.lang);
  setAttribute("dir", dirFor(value));
  hold(value.lang, dirFor(value));
  patchNavigator(value.lang);
  setDefaultLocale(value.lang);
  window.dispatchEvent(new Event("languagechange"));
  // A mount that finds its own tag in the stores is the remount after the
  // reload it asked for. There is nothing to sync, and the throttle it just
  // armed must not stop the tag from being recorded: a tag devknobs does not
  // record is a store a later switch to `system` never puts back.
  if (value.lang !== appliedLang && readOwned()?.lang !== value.lang) {
    // A refused reload leaves the tag unapplied, stores and all, so it stays
    // unrecorded too and the next apply of it asks again.
    if (reloadBlocked()) return;
    syncStores(value.lang);
  }
  appliedLang = value.lang;
}

/**
 * Put `lang`, `dir`, `navigator` and the `Intl` default back. The stores are
 * left alone, and a put back still waiting is dropped: only `apply` with the
 * knob on `system` puts them back, so that a strict mode unmount and remount
 * cannot bounce the page between two reloads.
 */
export function reset(): void {
  cancelRetry();
  appliedLang = null;
  hold(null, null);
  setDefaultLocale(null);
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
