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
  if (!found) return query;
  const negated = /^not\s/i.test(query);
  if (negated ? matched : !matched) return FALSE_QUERY;
  return negated ? TRUE_QUERY : rewritten;
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

interface Watched {
  ref: WeakRef<MediaQueryList>;
  query: string;
  matches: boolean;
  listeners: Set<MediaListener>;
}

type MediaListener =
  | ((event: MediaQueryListEvent) => void)
  | { handleEvent(event: MediaQueryListEvent): void };

const originals = new WeakMap<CSSRule, string>();
const watched: Watched[] = [];

let current: MediaValue = SYSTEM_MEDIA;
let nativeMatchMedia: ((query: string) => MediaQueryList) | null = null;
let nativeAddEventListener: typeof EventTarget.prototype.addEventListener | null = null;
let patched = false;
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

function evaluate(query: string): boolean {
  if (!nativeMatchMedia) return false;
  try {
    return nativeMatchMedia.call(window, rewriteAll(query, current)).matches;
  } catch {
    return false;
  }
}

function dispatch(entry: Watched, mql: MediaQueryList): void {
  const event = { matches: entry.matches, media: entry.query } as MediaQueryListEvent;
  for (const listener of Array.from(entry.listeners)) {
    try {
      if (typeof listener === "function") listener.call(mql, event);
      else listener.handleEvent(event);
    } catch {
      // A listener that throws must not stop the others.
    }
  }
  const handler = mql.onchange;
  if (typeof handler === "function") {
    try {
      handler.call(mql, event);
    } catch {
      // Same.
    }
  }
}

function refresh(): void {
  for (let i = watched.length - 1; i >= 0; i--) {
    const entry = watched[i];
    if (!entry) continue;
    const mql = entry.ref.deref();
    if (!mql) {
      watched.splice(i, 1);
      continue;
    }
    const matches = evaluate(entry.query);
    if (matches === entry.matches) continue;
    entry.matches = matches;
    dispatch(entry, mql);
  }
}

function watch(mql: MediaQueryList, query: string): MediaQueryList {
  const entry: Watched = {
    ref: new WeakRef(mql),
    query,
    matches: evaluate(query),
    listeners: new Set(),
  };
  watched.push(entry);

  Object.defineProperty(mql, "matches", {
    configurable: true,
    get: () => evaluate(query),
  });
  const add = (type: string, listener: MediaListener | null) => {
    if (type === "change" && listener) entry.listeners.add(listener);
  };
  const remove = (type: string, listener: MediaListener | null) => {
    if (type === "change" && listener) entry.listeners.delete(listener);
  };
  const define = (name: string, value: unknown) => {
    Object.defineProperty(mql, name, { configurable: true, writable: true, value });
  };
  define("addEventListener", add);
  define("removeEventListener", remove);
  define("addListener", (listener: MediaListener | null) => add("change", listener));
  define("removeListener", (listener: MediaListener | null) => remove("change", listener));

  // A real change (a resize, say) can still flip a query that also carries an
  // emulated feature, so keep listening natively.
  nativeAddEventListener?.call(mql, "change", () => refresh());
  return mql;
}

function ensureMatchMedia(): void {
  if (patched) return;
  nativeMatchMedia ??= window.matchMedia.bind(window);
  nativeAddEventListener = EventTarget.prototype.addEventListener;
  patched = true;
  window.matchMedia = (query: string): MediaQueryList => {
    const mql = nativeMatchMedia!.call(window, query);
    return mentionsFeature(query) ? watch(mql, query) : mql;
  };
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

/** Put `matchMedia` back and stop watching for new stylesheets. */
export function destroy(): void {
  reset();
  observer?.disconnect();
  observer = null;
  if (frame) {
    cancelAnimationFrame(frame);
    frame = 0;
  }
  if (patched && nativeMatchMedia) {
    // The native reference stays so that already-handed-out lists keep working.
    window.matchMedia = nativeMatchMedia;
    patched = false;
  }
  watched.length = 0;
  colorScheme = null;
}
