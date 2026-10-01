import type { ContrastValue, MotionValue, SchemeValue } from "../types";

export type MediaFeature =
  | "prefers-color-scheme"
  | "prefers-reduced-motion"
  | "prefers-contrast";

export interface MediaValue {
  scheme: SchemeValue;
  motion: MotionValue;
  contrast: ContrastValue;
}

export const SYSTEM_MEDIA: MediaValue = {
  scheme: "system",
  motion: "system",
  contrast: "system",
};

/**
 * `all` is a media type, so it is only valid on its own: `screen and all` fails
 * to parse and the CSSOM turns the whole query into `not all`. A zero min-width
 * is always true and is valid in every position.
 */
const TRUE_TOKEN = "(min-width: 0px)";
const TRUE_QUERY = "all";
const FALSE_QUERY = "not all";

const FEATURE_OF: Record<keyof MediaValue, MediaFeature> = {
  scheme: "prefers-color-scheme",
  motion: "prefers-reduced-motion",
  contrast: "prefers-contrast",
};

const KNOBS = Object.keys(FEATURE_OF) as (keyof MediaValue)[];

function featurePattern(feature: MediaFeature): RegExp {
  return new RegExp(`\\(\\s*${feature}\\s*(?::\\s*([a-z-]+)\\s*)?\\)`, "gi");
}

/** Does the emulated value satisfy the value asked for in the query? */
export function featureMatches(queryValue: string | undefined, emulated: string): boolean {
  // Boolean context, e.g. `(prefers-reduced-motion)`: true unless the emulated
  // value is the platform default.
  if (queryValue === undefined || queryValue === "") return emulated !== "no-preference";
  return queryValue.toLowerCase() === emulated;
}

/** Split a media query list on top-level commas. */
export function splitQueryList(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === "(") depth++;
    else if (char === ")") depth--;
    else if (char === "," && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts.map((part) => part.trim()).filter((part) => part.length > 0);
}

/**
 * A query is `and`-shaped in practice, so one false condition sinks the whole
 * query. A leading `not` flips that verdict.
 */
function collapse(query: string, found: boolean, matched: boolean, rewritten: string): string {
  if (!found) return query;
  const negated = /^not\s/i.test(query);
  if (negated ? matched : !matched) return FALSE_QUERY;
  return negated ? TRUE_QUERY : rewritten;
}

function rewriteQuery(query: string, feature: MediaFeature, value: string): string {
  let found = false;
  let matched = true;
  const rewritten = query.replace(
    featurePattern(feature),
    (_whole: string, queryValue: string | undefined) => {
      found = true;
      if (!featureMatches(queryValue, value)) matched = false;
      return TRUE_TOKEN;
    },
  );
  return collapse(query, found, matched, rewritten);
}

/**
 * Rewrite a media query list so that `feature` reads as `value`. Returns the
 * text untouched when the value is `system` or the feature is not mentioned.
 */
export function rewriteMediaText(text: string, feature: MediaFeature, value: string): string {
  if (value === "system") return text;
  if (!text.toLowerCase().includes(feature)) return text;
  const queries = splitQueryList(text);
  if (queries.length === 0) return text;
  return queries.map((query) => rewriteQuery(query, feature, value)).join(", ");
}

/** Rewrite for every emulated feature at once. */
export function rewriteAll(text: string, value: MediaValue): string {
  let next = text;
  for (const knob of KNOBS) next = rewriteMediaText(next, FEATURE_OF[knob], value[knob]);
  return next;
}

export function mentionsFeature(text: string): boolean {
  const lower = text.toLowerCase();
  return KNOBS.some((knob) => lower.includes(FEATURE_OF[knob]));
}

type MediaBearingRule = CSSRule & { media: MediaList };

const originals = new WeakMap<CSSRule, string>();
/** The lists `matchMedia` handed out that name an emulated feature. The page may drop them. */
const tracked = new Set<WeakRef<MediaQueryList>>();
/** What the page last heard each tracked list say, through a read or a change event. */
const heard = new WeakMap<MediaQueryList, boolean>();
/**
 * The query each tracked list was made from. Its own `media` reads `not all`
 * when the browser does not know a feature, and the feature is lost with it.
 */
const queries = new WeakMap<MediaQueryList, string>();

let current: MediaValue = SYSTEM_MEDIA;
let nativeMatchMedia: ((query: string) => MediaQueryList) | null = null;
/** `matches` as `MediaQueryList.prototype` had it, to put back. */
let nativeMatches: PropertyDescriptor | null = null;
let readMatches: ((this: MediaQueryList) => boolean) | null = null;
let patched = false;
let refreshQueued = false;
let observer: MutationObserver | null = null;
let frame = 0;
let colorScheme: string | null = null;

function walkRules(
  rules: CSSRuleList,
  visit: (rule: MediaBearingRule) => void,
  seen: Set<CSSStyleSheet>,
): void {
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];
    if (!rule) continue;
    const imported = (rule as CSSImportRule).styleSheet;
    if (imported) walkSheet(imported, visit, seen);
    const media = (rule as CSSMediaRule).media;
    if (media && typeof media.mediaText === "string") visit(rule as MediaBearingRule);
    const children = (rule as CSSGroupingRule).cssRules;
    if (children && children !== rules) walkRules(children, visit, seen);
  }
}

function walkSheet(
  sheet: CSSStyleSheet,
  visit: (rule: MediaBearingRule) => void,
  seen: Set<CSSStyleSheet>,
): void {
  if (seen.has(sheet)) return;
  seen.add(sheet);
  let rules: CSSRuleList | null = null;
  try {
    // Cross-origin sheets throw here and keep their real media behaviour.
    rules = sheet.cssRules;
  } catch {
    return;
  }
  if (rules) walkRules(rules, visit, seen);
}

function applyCss(): void {
  const seen = new Set<CSSStyleSheet>();
  const sheets: CSSStyleSheet[] = [
    ...Array.from(document.styleSheets),
    ...(document.adoptedStyleSheets ?? []),
  ];
  for (const sheet of sheets) {
    walkSheet(
      sheet,
      (rule) => {
        const text = rule.media.mediaText;
        let original = originals.get(rule);
        if (original === undefined) {
          if (!mentionsFeature(text)) return;
          original = text;
          originals.set(rule, original);
        }
        const next = rewriteAll(original, current);
        if (next === text) return;
        try {
          rule.media.mediaText = next;
        } catch {
          // A read-only sheet keeps its real media behaviour.
        }
      },
      seen,
    );
  }
}

function schedule(): void {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    applyCss();
  });
}

function ensureObserver(): void {
  if (observer || typeof MutationObserver === "undefined") return;
  observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of Array.from(record.addedNodes)) {
        const name = node.nodeName;
        if (name !== "STYLE" && name !== "LINK") continue;
        if ((node as Element).hasAttribute?.("data-devknobs")) continue;
        if (name === "LINK") node.addEventListener("load", schedule, { once: true });
        schedule();
      }
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

function emulating(): boolean {
  return KNOBS.some((knob) => current[knob] !== "system");
}

/** What a query matches with the emulated values, read through the native getter. */
function evaluate(query: string): boolean {
  if (!nativeMatchMedia) return false;
  try {
    const list = nativeMatchMedia.call(window, rewriteAll(query, current));
    return readMatches ? readMatches.call(list) : list.matches;
  } catch {
    return false;
  }
}

/**
 * Tell every tracked list whose verdict moved, with a real `change` event. It
 * goes through the list's own `dispatchEvent`, so `onchange`, `addListener`
 * and every `addEventListener` option (`once`, `signal`) work as they always do.
 */
function refresh(): void {
  for (const ref of Array.from(tracked)) {
    const list = ref.deref();
    if (!list) {
      tracked.delete(ref);
      continue;
    }
    const matches = list.matches;
    if (matches === heard.get(list)) continue;
    heard.set(list, matches);
    list.dispatchEvent(new MediaQueryListEvent("change", { media: list.media, matches }));
  }
}

/**
 * The browser's own change event carries its own verdict, which an emulated
 * feature can contradict. While one is emulated, stop that event before the
 * page hears it and send the emulated verdict instead, if a real change (a
 * resize, say) moved it.
 */
function guard(event: Event): void {
  if (!event.isTrusted) return;
  const list = event.currentTarget as MediaQueryList;
  if (!emulating()) {
    heard.set(list, (event as MediaQueryListEvent).matches);
    return;
  }
  event.stopImmediatePropagation();
  if (refreshQueued) return;
  refreshQueued = true;
  queueMicrotask(() => {
    refreshQueued = false;
    refresh();
  });
}

/**
 * The guard goes on before the list reaches the page. Listeners on a list run
 * in the order they were added, capture or not, so only the first one can
 * stop an event before the page's own.
 */
function track(list: MediaQueryList, query: string): void {
  queries.set(list, query);
  heard.set(list, list.matches);
  tracked.add(new WeakRef(list));
  list.addEventListener("change", guard);
}

/**
 * Patch `matches` on the prototype, so a list made before devknobs mounted
 * reads the emulated value too. Only lists made after can be told about a
 * change: there is no way to find the earlier ones.
 */
function ensureMatchMedia(): void {
  if (patched) return;
  nativeMatchMedia ??= window.matchMedia.bind(window);
  patched = true;
  window.matchMedia = (query: string): MediaQueryList => {
    const list = nativeMatchMedia!.call(window, query);
    if (mentionsFeature(query)) track(list, query);
    return list;
  };
  const descriptor = Object.getOwnPropertyDescriptor(MediaQueryList.prototype, "matches");
  const read = descriptor?.get;
  if (!descriptor || !read) return;
  nativeMatches = descriptor;
  readMatches = read;
  Object.defineProperty(MediaQueryList.prototype, "matches", {
    configurable: true,
    enumerable: descriptor.enumerable,
    get(this: MediaQueryList): boolean {
      if (!emulating()) return read.call(this);
      const query = queries.get(this) ?? this.media;
      return mentionsFeature(query) ? evaluate(query) : read.call(this);
    },
  });
}

function applyColorScheme(): void {
  const root = document.documentElement;
  if (colorScheme === null) colorScheme = root.style.getPropertyValue("color-scheme");
  const value = current.scheme === "system" ? colorScheme : current.scheme;
  if (value) root.style.setProperty("color-scheme", value);
  else root.style.removeProperty("color-scheme");
}

export function apply(value: MediaValue): void {
  current = value;
  ensureMatchMedia();
  ensureObserver();
  applyColorScheme();
  applyCss();
  refresh();
}

export function reset(): void {
  apply(SYSTEM_MEDIA);
}

/** Put `matchMedia` and `matches` back and stop watching for new stylesheets. */
export function destroy(): void {
  reset();
  observer?.disconnect();
  observer = null;
  if (frame) {
    cancelAnimationFrame(frame);
    frame = 0;
  }
  if (patched && nativeMatchMedia) {
    window.matchMedia = nativeMatchMedia;
    if (nativeMatches) Object.defineProperty(MediaQueryList.prototype, "matches", nativeMatches);
    nativeMatches = null;
    readMatches = null;
    patched = false;
  }
  for (const ref of tracked) ref.deref()?.removeEventListener("change", guard);
  tracked.clear();
  colorScheme = null;
}
