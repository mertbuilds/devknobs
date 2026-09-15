import type { ContrastValue, MotionValue, SchemeValue, WidthValue } from "../types";

export type MediaFeature =
  | "prefers-color-scheme"
  | "prefers-reduced-motion"
  | "prefers-contrast";

export interface MediaValue {
  scheme: SchemeValue;
  motion: MotionValue;
  contrast: ContrastValue;
  width: WidthValue;
}

export const SYSTEM_MEDIA: MediaValue = {
  scheme: "system",
  motion: "system",
  contrast: "system",
  width: "full",
};

/**
 * `all` is a media type, so it is only valid on its own: `screen and all` fails
 * to parse and the CSSOM turns the whole query into `not all`. A zero min-width
 * is always true and is valid in every position.
 */
const TRUE_TOKEN = "(min-width: 0px)";
const TRUE_QUERY = "all";
const FALSE_QUERY = "not all";

type PreferenceKnob = "scheme" | "motion" | "contrast";

const FEATURE_OF: Record<PreferenceKnob, MediaFeature> = {
  scheme: "prefers-color-scheme",
  motion: "prefers-reduced-motion",
  contrast: "prefers-contrast",
};

const KNOBS = Object.keys(FEATURE_OF) as PreferenceKnob[];

/** Media queries resolve `rem` and `em` against the initial font size, never the text knob. */
const MEDIA_FONT_SIZE = 16;

const UNITS: Record<string, number> = {
  px: 1,
  rem: MEDIA_FONT_SIZE,
  em: MEDIA_FONT_SIZE,
};

/** The viewport width features. `device-width` reads the same way here. */
const WIDTH_NAMES = new Set(["width", "device-width"]);

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

/**
 * A media length in px. Returns null for anything this engine cannot resolve on
 * its own, such as `calc()`, `vw` or an unknown unit, so the real query stands.
 */
export function parseLength(text: string): number | null {
  const match = /^([+-]?(?:\d*\.)?\d+)(px|rem|em)?$/.exec(text.trim().toLowerCase());
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  const unit = match[2];
  // A bare number is only a length when it is zero.
  if (unit === undefined) return value === 0 ? 0 : null;
  return value * UNITS[unit]!;
}

function compare(left: number, operator: string, right: number): boolean | null {
  switch (operator) {
    case "<":
      return left < right;
    case "<=":
      return left <= right;
    case ">":
      return left > right;
    case ">=":
      return left >= right;
    case "=":
      return left === right;
    default:
      return null;
  }
}

/**
 * Read one parenthesised condition as a test against an emulated width in px.
 * Returns null when the condition is not about viewport width, or carries a
 * length this engine cannot resolve.
 */
export function evaluateWidthCondition(condition: string, width: number): boolean | null {
  const text = condition.trim().toLowerCase().replace(/\s+/g, " ");
  const plain = /^(?:(min|max)-)?(?:device-)?width\s*:\s*(.+)$/.exec(text);
  if (plain) {
    const length = parseLength(plain[2]!);
    if (length === null) return null;
    if (plain[1] === "min") return width >= length;
    if (plain[1] === "max") return width <= length;
    return width === length;
  }
  const parts = text.split(/(<=|>=|=|<|>)/).map((part) => part.trim());
  if (parts.length === 3) {
    const [left, operator, right] = parts as [string, string, string];
    if (WIDTH_NAMES.has(left)) {
      const length = parseLength(right);
      return length === null ? null : compare(width, operator, length);
    }
    if (WIDTH_NAMES.has(right)) {
      const length = parseLength(left);
      return length === null ? null : compare(length, operator, width);
    }
    return null;
  }
  if (parts.length === 5) {
    const [low, first, name, second, high] = parts as [string, string, string, string, string];
    if (!WIDTH_NAMES.has(name)) return null;
    const lowLength = parseLength(low);
    const highLength = parseLength(high);
    if (lowLength === null || highLength === null) return null;
    const lower = compare(lowLength, first, width);
    const upper = compare(width, second, highLength);
    if (lower === null || upper === null) return null;
    return lower && upper;
  }
  return null;
}

/** Index of the `)` that closes the `(` at `open`, or -1 when there is none. */
function closingParen(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const char = text[i];
    if (char === "(") depth++;
    else if (char === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function rewriteWidthQuery(query: string, width: number): string {
  let found = false;
  let matched = true;
  let rewritten = "";
  let index = 0;
  while (index < query.length) {
    const open = query.indexOf("(", index);
    const close = open < 0 ? -1 : closingParen(query, open);
    if (close < 0) {
      rewritten += query.slice(index);
      break;
    }
    rewritten += query.slice(index, open);
    const verdict = evaluateWidthCondition(query.slice(open + 1, close), width);
    if (verdict === null) rewritten += query.slice(open, close + 1);
    else {
      found = true;
      if (!verdict) matched = false;
      rewritten += TRUE_TOKEN;
    }
    index = close + 1;
  }
  return collapse(query, found, matched, rewritten);
}

/**
 * Rewrite a media query list so that every viewport width feature reads as
 * `width`. Returns the text untouched for `full`.
 */
export function rewriteWidthText(text: string, width: WidthValue): string {
  if (typeof width !== "number" || !(width > 0)) return text;
  if (!text.toLowerCase().includes("width")) return text;
  const queries = splitQueryList(text);
  if (queries.length === 0) return text;
  return queries.map((query) => rewriteWidthQuery(query, width)).join(", ");
}

/** Rewrite for every emulated feature at once. */
export function rewriteAll(text: string, value: MediaValue): string {
  let next = text;
  for (const knob of KNOBS) next = rewriteMediaText(next, FEATURE_OF[knob], value[knob]);
  return rewriteWidthText(next, value.width);
}

export function mentionsFeature(text: string): boolean {
  const lower = text.toLowerCase();
  // Width is checked whatever the knob says, so that a query handed out while
  // the width is `full` is still watched once the width is emulated.
  if (lower.includes("width")) return true;
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
let viewportPatched = false;
let ownInnerWidth: PropertyDescriptor | undefined;
let ownClientWidth: PropertyDescriptor | undefined;

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

/** The emulated width in px, or null when the real viewport is in charge. */
function emulatedWidth(): number | null {
  const width = current.width;
  return typeof width === "number" && width > 0 ? width : null;
}

function descriptorOf(target: object, name: string): PropertyDescriptor | undefined {
  let node: object | null = target;
  while (node) {
    const descriptor = Object.getOwnPropertyDescriptor(node, name);
    if (descriptor) return descriptor;
    node = Object.getPrototypeOf(node) as object | null;
  }
  return undefined;
}

/**
 * `innerWidth` and `documentElement.clientWidth` are what layout code measures,
 * so they have to agree with the emulated width. The accessor goes on
 * `documentElement` itself: `Element.prototype` would answer for every element.
 */
function patchViewport(): void {
  if (viewportPatched) return;
  const root = document.documentElement;
  ownInnerWidth = Object.getOwnPropertyDescriptor(window, "innerWidth");
  ownClientWidth = Object.getOwnPropertyDescriptor(root, "clientWidth");
  const nativeInner = descriptorOf(window, "innerWidth")?.get?.bind(window);
  const nativeClient = descriptorOf(root, "clientWidth")?.get?.bind(root);
  const read = (native: (() => number) | undefined) => () => emulatedWidth() ?? native?.() ?? 0;
  Object.defineProperty(window, "innerWidth", { configurable: true, get: read(nativeInner) });
  Object.defineProperty(root, "clientWidth", { configurable: true, get: read(nativeClient) });
  viewportPatched = true;
}

function restoreViewport(): void {
  if (!viewportPatched) return;
  viewportPatched = false;
  const root = document.documentElement;
  if (ownInnerWidth) Object.defineProperty(window, "innerWidth", ownInnerWidth);
  else Reflect.deleteProperty(window, "innerWidth");
  if (ownClientWidth) Object.defineProperty(root, "clientWidth", ownClientWidth);
  else Reflect.deleteProperty(root, "clientWidth");
  ownInnerWidth = undefined;
  ownClientWidth = undefined;
}

function applyColorScheme(): void {
  const root = document.documentElement;
  if (colorScheme === null) colorScheme = root.style.getPropertyValue("color-scheme");
  const value = current.scheme === "system" ? colorScheme : current.scheme;
  if (value) root.style.setProperty("color-scheme", value);
  else root.style.removeProperty("color-scheme");
}

export function apply(value: MediaValue): void {
  const before = current.width;
  current = value;
  ensureMatchMedia();
  ensureObserver();
  applyColorScheme();
  if (emulatedWidth() === null) restoreViewport();
  else patchViewport();
  applyCss();
  refresh();
  // Layout code that measured the window itself only hears about a new width
  // through a resize, so send one once everything else is in place.
  if (value.width !== before) window.dispatchEvent(new Event("resize"));
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
