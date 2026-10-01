import type { TextValue } from "../types";
import { addLayer, removeLayer } from "./matchmedia";

/**
 * The browser's default font size setting, emulated. That setting is the size
 * `medium` resolves to, so it moves everything that leans on the initial font
 * size: a root `font-size` in %, em, rem or a keyword (or none at all), every
 * rem through it, and em and rem in media queries. A root size in px ignores
 * it, and so does this knob.
 */

/** What `medium` is with the browser's default setting, in px. */
const INITIAL = 16;

/** `font-size` keywords as multiples of `medium`. At the root, every one of them leans on it. */
const KEYWORDS: Record<string, number> = {
  "xx-small": 3 / 5,
  "x-small": 3 / 4,
  small: 8 / 9,
  medium: 1,
  large: 6 / 5,
  "x-large": 3 / 2,
  "xx-large": 2,
  "xxx-large": 3,
  larger: 1.2,
  smaller: 1 / 1.2,
  initial: 1,
  inherit: 1,
  unset: 1,
  revert: 1,
  "revert-layer": 1,
};

const RELATIVE = /(?<![\w.-])(\d*\.?\d+)(rem|em|%)(?![\w-])/gi;
const MEDIA_RELATIVE = /(?<![\w.-])(\d*\.?\d+)(rem|em)(?![\w-])/gi;
const VAR = /var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*))?\)/g;

function px(value: number): string {
  return `${Number(value.toFixed(4))}px`;
}

/**
 * The root `font-size` a browser set to `size` would use for the author's
 * value: each %, em, rem and keyword taken against `size` instead of 16px.
 * Null when nothing in it leans on the setting, a px size say.
 */
export function emulatedFontSize(value: string, size: number): string | null {
  const keyword = KEYWORDS[value.trim().toLowerCase()];
  if (keyword !== undefined) return px(keyword * size);
  let relative = false;
  const next = value.replace(RELATIVE, (_whole, amount: string, unit: string) => {
    relative = true;
    return px((Number(amount) * size) / (unit === "%" ? 100 : 1));
  });
  return relative ? next : null;
}

/** A media query list with each em and rem taken against `size`, the way the setting moves them. */
export function emulateMediaText(text: string, size: number): string {
  return text.replace(MEDIA_RELATIVE, (_whole, amount: string) => px(Number(amount) * size));
}

/** The value with every `var()` read through `lookup`. Null when one cannot be. */
export function substituteVars(value: string, lookup: (name: string) => string): string | null {
  let next = value;
  // Custom properties can lean on each other, a few levels deep at most in practice.
  for (let depth = 0; depth < 5 && next.includes("var("); depth++) {
    next = next.replace(VAR, (_whole, name: string, fallback: string | undefined) => {
      const found = lookup(name).trim();
      return found || fallback?.trim() || "var()";
    });
  }
  return next.includes("var(") ? null : next;
}

/** Split a selector list on its top-level commas. */
export function splitSelectors(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === "(" || char === "[") depth++;
    else if (char === ")" || char === "]") depth--;
    else if (char === "," && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts.map((part) => part.trim()).filter((part) => part.length > 0);
}

/**
 * A rough specificity, ids, then classes, attributes and pseudo-classes, then
 * types, as one comparable number. Rough is enough for the few selectors that
 * reach `<html>`.
 */
export function specificity(selector: string): number {
  let ids = 0;
  let classes = 0;
  let types = 0;
  const rest = selector
    .replace(/:where\([^()]*\)/gi, " ")
    .replace(/\[[^\]]*\]/g, () => {
      classes++;
      return " ";
    })
    .replace(/:(?:is|not|has)\(/gi, "(")
    .replace(/::?[\w-]+/g, (match) => {
      if (match.startsWith("::")) types++;
      else classes++;
      return " ";
    })
    .replace(/#[\w-]+/g, () => {
      ids++;
      return " ";
    })
    .replace(/\.[\w-]+/g, () => {
      classes++;
      return " ";
    });
  types += (rest.match(/(?:^|[\s>+~(])[a-z][\w-]*/gi) ?? []).length;
  return ids * 1e6 + classes * 1e3 + types;
}

/** One `font-size` declaration that reaches `<html>`, with what the cascade sorts it by. */
export interface Declaration {
  value: string;
  important: boolean;
  /** From the `style` attribute. */
  inline: boolean;
  /** Inside a cascade layer. */
  layered: boolean;
  specificity: number;
  order: number;
}

function rank(declaration: Declaration): number[] {
  const { important, inline, layered } = declaration;
  // Layers rank under unlayered styles, and above them once important.
  const layer = important === layered ? 1 : 0;
  return [important ? 1 : 0, inline ? 1 : 0, layer, declaration.specificity, declaration.order];
}

/** The declaration the cascade picks, or null when there is none. */
export function cascade(declarations: Declaration[]): Declaration | null {
  let winner: Declaration | null = null;
  let best: number[] = [];
  for (const declaration of declarations) {
    const ranked = rank(declaration);
    const at = ranked.findIndex((value, i) => value !== best[i]);
    if (winner === null || (at >= 0 && (ranked[at] ?? 0) > (best[at] ?? 0))) {
      winner = declaration;
      best = ranked;
    }
  }
  return winner;
}

type MediaBearingRule = CSSRule & { media: MediaList };

interface Found {
  declaration: Declaration;
  /** Media queries and supports conditions around it, all of which must hold. */
  conditions: (() => boolean)[];
}

let size: number | null = null;
let captured = false;
let original = { value: "", priority: "" };
/** Whether the root size depends on media queries, so a resize can change it. */
let conditional = false;
let observer: MutationObserver | null = null;
let frame = 0;
const rewrites = new WeakMap<CSSRule, { original: string; written: string }>();

function sheets(): CSSStyleSheet[] {
  return [...Array.from(document.styleSheets), ...(document.adoptedStyleSheets ?? [])];
}

function rulesOf(sheet: CSSStyleSheet): CSSRuleList | null {
  try {
    // Cross-origin sheets throw here and keep their real behaviour.
    return sheet.cssRules;
  } catch {
    return null;
  }
}

/** Every rule that carries a media list, in imported sheets too. */
function eachMediaRule(visit: (rule: MediaBearingRule) => void): void {
  const seen = new Set<CSSStyleSheet>();
  const walk = (rules: CSSRuleList | null) => {
    if (!rules) return;
    for (const rule of Array.from(rules)) {
      const imported = (rule as CSSImportRule).styleSheet;
      if (imported && !seen.has(imported)) {
        seen.add(imported);
        walk(rulesOf(imported));
      }
      if (typeof (rule as CSSMediaRule).media?.mediaText === "string") {
        visit(rule as MediaBearingRule);
      }
      const children = (rule as CSSGroupingRule).cssRules;
      if (children && children !== rules) walk(children);
    }
  };
  for (const sheet of sheets()) {
    if (seen.has(sheet)) continue;
    seen.add(sheet);
    walk(rulesOf(sheet));
  }
}

/**
 * Take each em and rem in the stylesheets' media queries against the knob's
 * size, or put the originals back with null. A rule something else rewrote
 * since (the prefers knobs do) is read afresh, so the two compose.
 */
function rewriteMedia(): void {
  eachMediaRule((rule) => {
    const text = rule.media.mediaText;
    const known = rewrites.get(rule);
    const ours = known !== undefined && text === known.written;
    const source = ours ? known.original : text;
    const next = size === null ? source : emulateMediaText(source, size);
    if (next === source && !ours) return;
    if (next !== text) {
      try {
        rule.media.mediaText = next;
      } catch {
        // A read-only sheet keeps its real media behaviour.
      }
    }
    if (size === null) rewrites.delete(rule);
    else rewrites.set(rule, { original: source, written: rule.media.mediaText });
  });
}

function matches(query: string): boolean {
  try {
    return window.matchMedia(query).matches;
  } catch {
    return false;
  }
}

function supports(condition: string): boolean {
  try {
    return CSS.supports(condition);
  } catch {
    return false;
  }
}

/** Every `font-size` declaration in the stylesheets whose selector reaches `<html>`. */
function rootDeclarations(): Found[] {
  const root = document.documentElement;
  const found: Found[] = [];
  let order = 0;
  const seen = new Set<CSSStyleSheet>();
  const walk = (rules: CSSRuleList | null, layered: boolean, conditions: (() => boolean)[]) => {
    if (!rules) return;
    for (const rule of Array.from(rules)) {
      const kind = rule.constructor.name;
      if (kind === "CSSStyleRule") {
        const style = (rule as CSSStyleRule).style;
        const value = style.getPropertyValue("font-size");
        if (!value) continue;
        let best = -1;
        for (const selector of splitSelectors((rule as CSSStyleRule).selectorText)) {
          try {
            if (root.matches(selector)) best = Math.max(best, specificity(selector));
          } catch {
            // A selector this browser does not parse reaches nothing.
          }
        }
        if (best < 0) continue;
        const important = style.getPropertyPriority("font-size") === "important";
        const declaration = { value, important, inline: false, layered, specificity: best, order };
        found.push({ declaration, conditions });
        order++;
      } else if (kind === "CSSImportRule") {
        const imported = rule as CSSImportRule;
        if (!imported.styleSheet || seen.has(imported.styleSheet)) continue;
        seen.add(imported.styleSheet);
        const media = imported.media.mediaText;
        const next = media ? [...conditions, () => matches(media)] : conditions;
        walk(rulesOf(imported.styleSheet), layered || imported.layerName != null, next);
      } else if (kind === "CSSMediaRule") {
        const media = (rule as CSSMediaRule).media.mediaText;
        walk((rule as CSSMediaRule).cssRules, layered, [...conditions, () => matches(media)]);
      } else if (kind === "CSSSupportsRule") {
        const condition = (rule as CSSSupportsRule).conditionText;
        walk((rule as CSSSupportsRule).cssRules, layered, [...conditions, () => supports(condition)]);
      } else if (kind === "CSSLayerBlockRule") {
        walk((rule as CSSGroupingRule).cssRules, true, conditions);
      }
    }
  };
  for (const sheet of sheets()) {
    if (seen.has(sheet)) continue;
    seen.add(sheet);
    walk(rulesOf(sheet), false, []);
  }
  return found;
}

/** The author's own root `font-size` value, or null when none can be read. */
function authorFontSize(): string | null {
  const found = rootDeclarations();
  conditional = found.some((entry) => entry.conditions.length > 0);
  const declarations = found
    .filter((entry) => entry.conditions.every((holds) => holds()))
    .map((entry) => entry.declaration);
  if (original.value) {
    declarations.push({
      value: original.value,
      important: original.priority === "important",
      inline: true,
      layered: false,
      specificity: 0,
      order: 0,
    });
  }
  return cascade(declarations)?.value ?? null;
}

function restoreRoot(): void {
  document.documentElement.style.setProperty("font-size", original.value, original.priority);
}

/** The root size the page would compute on its own, read with the knob's off. */
function computedSize(): number {
  restoreRoot();
  const value = parseFloat(getComputedStyle(document.documentElement).fontSize);
  return value > 0 ? value : INITIAL;
}

/**
 * Size `<html>` the way the setting would. A value the stylesheets do not show
 * (none at all, or one in a cross-origin sheet) is taken as relative, from
 * what the page computes: unset reads as 16px, so it becomes the knob's size.
 */
function applyRoot(): void {
  if (size === null) return;
  const root = document.documentElement;
  const value = authorFontSize();
  const lookup = (name: string) => getComputedStyle(root).getPropertyValue(name);
  const resolved = value === null ? null : substituteVars(value, lookup);
  const next =
    resolved === null
      ? px((computedSize() * size) / INITIAL)
      : emulatedFontSize(resolved, size);
  if (next === null) restoreRoot();
  // Important, so it wins over an important author rule the way the setting would.
  else root.style.setProperty("font-size", next, "important");
}

function refresh(): void {
  rewriteMedia();
  applyRoot();
}

function schedule(): void {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    refresh();
  });
}

function onResize(): void {
  if (conditional) schedule();
}

function watchSheets(): void {
  if (observer || typeof MutationObserver === "undefined") return;
  observer = new MutationObserver((records) => {
    for (const record of records) {
      // A dev server swaps a stylesheet's text in place on a hot update.
      const target = record.target as Element;
      if (target.nodeName === "STYLE" && !target.hasAttribute("data-devknobs")) schedule();
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
  window.addEventListener("resize", onResize);
}

/**
 * Take em and rem in `matchMedia` queries against the knob's size too. This is
 * the outer layer of the patch the prefers knobs share, so they get the query
 * in px.
 */
function sizeQuery(query: string, next: (query: string) => MediaQueryList): MediaQueryList {
  const emulated = size === null ? query : emulateMediaText(query, size);
  const list = next(emulated);
  // The list reports the query it was asked for, as it would natively.
  if (emulated !== query) Object.defineProperty(list, "media", { configurable: true, value: query });
  return list;
}

export function apply(value: TextValue): void {
  if (typeof value !== "number" || !(value > 0)) {
    reset();
    return;
  }
  const root = document.documentElement;
  if (!captured) {
    original = {
      value: root.style.getPropertyValue("font-size"),
      priority: root.style.getPropertyPriority("font-size"),
    };
    captured = true;
  }
  size = value;
  addLayer("text", sizeQuery);
  watchSheets();
  refresh();
}

export function reset(): void {
  if (!captured) return;
  size = null;
  observer?.disconnect();
  observer = null;
  window.removeEventListener("resize", onResize);
  if (frame) {
    cancelAnimationFrame(frame);
    frame = 0;
  }
  removeLayer("text");
  rewriteMedia();
  restoreRoot();
  captured = false;
}
