import { authoredQuery } from "../engine/media";
import { isDevknobs } from "../grab/hit";
import {
  hasNesting,
  parseSubject,
  resolveNesting,
  specificity,
  splitList,
  type Subject,
} from "./selector";
import { isShadowRoot, label, type Scope } from "./tree";
import type { HiddenSheet, RuleOrigin, Specificity } from "./types";

/** Something around a rule that must hold now for it to apply. */
export type Condition =
  /** The live list: devknobs rewrites its text, and the rewritten one is what applies. */
  { kind: "media"; list: MediaList } | { kind: "supports"; text: string };

/** One selector of a rule's list, taken apart once so an inspection only has to match. */
export interface FlatPart extends Subject {
  /** As the stylesheet has it. */
  text: string;
  specificity: Specificity;
}

/** Where an `@scope` starts and ends. */
export interface ScopeLimits {
  start: string | null;
  end: string | null;
  /** The parent of the stylesheet's element, the root of an `@scope` that names none. */
  around: Element | null;
}

/** A style rule lifted out of everything it sits in, with what that was. */
export interface FlatRule {
  rule: CSSStyleRule | CSSNestedDeclarations;
  selectorText: string;
  parts: FlatPart[];
  context: string[];
  conditions: Condition[];
  /** The layer it is in, as its path joined by dots. Empty for none. */
  layer: string;
  scope: ScopeLimits | null;
  conditional: "container" | "scope" | null;
  origin: RuleOrigin;
  /** Its place among the rules of its tree. */
  order: number;
  /** Set once looked at: it has a declaration an ancestor could hand down. */
  hands?: boolean;
}

/** A layer named at this point, which is where its place in the order is taken. */
export interface LayerMark {
  path: string[];
  conditions: Condition[];
}

/** All the style rules of one tree, in order. */
export interface Flat {
  rules: FlatRule[];
  layers: LayerMark[];
  hidden: HiddenSheet[];
  /** Custom properties `@property` registered, by whether they inherit. */
  registered: Map<string, boolean>;
  /** Rules that threw as they were read. */
  skipped: number;
}

/** The rule classes the walk tells apart, by name: `instanceof` fails across windows. */
interface Kinds {
  CSSStyleRule: CSSStyleRule;
  CSSNestedDeclarations: CSSNestedDeclarations;
  CSSImportRule: CSSImportRule;
  CSSMediaRule: CSSMediaRule;
  CSSSupportsRule: CSSSupportsRule;
  CSSContainerRule: CSSContainerRule;
  CSSLayerBlockRule: CSSLayerBlockRule;
  CSSLayerStatementRule: CSSLayerStatementRule;
  CSSScopeRule: CSSScopeRule;
  CSSPropertyRule: CSSPropertyRule;
}

function isKind<K extends keyof Kinds>(rule: CSSRule, kind: K): rule is Kinds[K] {
  return rule.constructor.name === kind;
}

/** What surrounds the rules being walked. */
interface Frame {
  context: string[];
  conditions: Condition[];
  layer: string[];
  /** The selector list of the style rule around, standing alone, for `&`. */
  parent: string | null;
  scope: ScopeLimits | null;
  conditional: "container" | "scope" | null;
  path: number[];
}

interface Walk {
  flat: Flat;
  seen: Set<CSSStyleSheet>;
  sheet: string;
  owner: Element | null;
  /** Anonymous layers so far in the tree. Each is a layer of its own. */
  layers: { anonymous: number };
}

function sheetName(sheet: CSSStyleSheet): string {
  return sheet.href ?? (sheet.ownerNode ? "<style>" : "constructed");
}

function ownerOf(sheet: CSSStyleSheet): Element | null {
  const node = sheet.ownerNode;
  return node && "hasAttribute" in node ? node : null;
}

/** A layer's name as the steps of its path. One with no name is unlike any other. */
function layerPath(walk: Walk, name: string): string[] {
  if (name) return name.split(".");
  walk.layers.anonymous += 1;
  return [`(anonymous ${walk.layers.anonymous})`];
}

/** Open a layer under the frame's: its place in the order is taken here. */
function enterLayer(walk: Walk, frame: Frame, name: string): Frame {
  const layer = [...frame.layer, ...layerPath(walk, name)];
  walk.flat.layers.push({ path: layer, conditions: frame.conditions });
  const context = [...frame.context, name ? `@layer ${name}` : "@layer"];
  return { ...frame, layer, context };
}

/** A rule's selector as one `matches` can take, whatever rule or `@scope` is around it. */
function standalone(text: string, frame: Frame): string {
  if (frame.parent !== null || !frame.scope) return resolveNesting(text, frame.parent);
  // Straight in an `@scope`, `:scope` and `&` both stand for its root.
  const rooted = text.replace(/:scope(?![\w-])/gi, "&");
  return hasNesting(rooted) ? resolveNesting(rooted, frame.scope.start) : text;
}

function partsOf(selectorText: string, frame: Frame): { parts: FlatPart[]; resolved: string } {
  const resolved: string[] = [];
  const parts = splitList(selectorText).map((text): FlatPart => {
    const alone = standalone(text, frame);
    resolved.push(alone);
    return { ...parseSubject(alone), text, specificity: specificity(alone) };
  });
  return { parts, resolved: resolved.join(", ") };
}

function push(
  walk: Walk,
  frame: Frame,
  rule: CSSStyleRule | CSSNestedDeclarations,
  selectorText: string,
  index: number,
): string {
  const { parts, resolved } = partsOf(selectorText, frame);
  walk.flat.rules.push({
    rule,
    selectorText,
    parts,
    context: frame.context,
    conditions: frame.conditions,
    layer: frame.layer.join("."),
    scope: frame.scope,
    conditional: frame.conditional,
    origin: {
      sheet: walk.sheet,
      owner: walk.owner ? label(walk.owner) : null,
      path: [...frame.path, index],
    },
    order: walk.flat.rules.length,
  });
  return resolved;
}

function visit(walk: Walk, frame: Frame, rule: CSSRule, index: number): void {
  const inside = { ...frame, path: [...frame.path, index] };
  if (isKind(rule, "CSSStyleRule")) {
    const resolved = push(walk, frame, rule, rule.selectorText, index);
    if (rule.cssRules?.length) {
      const context = [...frame.context, rule.selectorText];
      walkRules(walk, { ...inside, context, parent: resolved }, rule.cssRules);
    }
  } else if (isKind(rule, "CSSNestedDeclarations")) {
    // Declarations after a nested rule: the parent's own, under its selector.
    push(walk, frame, rule, "&", index);
  } else if (isKind(rule, "CSSImportRule")) {
    if (!rule.styleSheet) return;
    let next = inside;
    if (rule.layerName != null) next = enterLayer(walk, next, rule.layerName);
    if (rule.supportsText) {
      const context = [...next.context, `@supports ${rule.supportsText}`];
      const condition: Condition = { kind: "supports", text: rule.supportsText };
      next = { ...next, context, conditions: [...next.conditions, condition] };
    }
    if (rule.media.mediaText) next = withMedia(next, rule.media, authoredQuery(rule));
    walkSheet({ ...walk, sheet: sheetName(rule.styleSheet) }, next, rule.styleSheet);
  } else if (isKind(rule, "CSSMediaRule")) {
    walkRules(walk, withMedia(inside, rule.media, authoredQuery(rule)), rule.cssRules);
  } else if (isKind(rule, "CSSSupportsRule")) {
    const context = [...frame.context, `@supports ${rule.conditionText}`];
    const condition: Condition = { kind: "supports", text: rule.conditionText };
    const conditions = [...frame.conditions, condition];
    walkRules(walk, { ...inside, context, conditions }, rule.cssRules);
  } else if (isKind(rule, "CSSContainerRule")) {
    const context = [...frame.context, `@container ${rule.conditionText}`];
    walkRules(walk, { ...inside, context, conditional: "container" }, rule.cssRules);
  } else if (isKind(rule, "CSSLayerBlockRule")) {
    walkRules(walk, enterLayer(walk, inside, rule.name), rule.cssRules);
  } else if (isKind(rule, "CSSLayerStatementRule")) {
    for (const name of rule.nameList) {
      const path = [...frame.layer, ...name.split(".")];
      walk.flat.layers.push({ path, conditions: frame.conditions });
    }
  } else if (isKind(rule, "CSSScopeRule")) {
    const limits = rule.end ? `(${rule.start}) to (${rule.end})` : `(${rule.start})`;
    const context = [...frame.context, rule.start ? `@scope ${limits}` : "@scope"];
    const scope = { start: rule.start, end: rule.end, around: walk.owner?.parentElement ?? null };
    const conditional = frame.conditional ?? "scope";
    walkRules(walk, { ...inside, context, scope, conditional, parent: null }, rule.cssRules);
  } else if (isKind(rule, "CSSPropertyRule")) {
    walk.flat.registered.set(rule.name, rule.inherits);
  }
  // Keyframes, font faces and the like style no element. `@starting-style` does for one frame only.
}

function withMedia(frame: Frame, list: MediaList, authored: string): Frame {
  return {
    ...frame,
    context: [...frame.context, `@media ${authored}`],
    conditions: [...frame.conditions, { kind: "media", list }],
  };
}

function walkRules(walk: Walk, frame: Frame, rules: CSSRuleList): void {
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];
    if (!rule) continue;
    try {
      visit(walk, frame, rule, i);
    } catch {
      walk.flat.skipped += 1;
    }
  }
}

function isSecurityError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  return "name" in error && error.name === "SecurityError";
}

function walkSheet(walk: Walk, frame: Frame, sheet: CSSStyleSheet): void {
  if (walk.seen.has(sheet)) return;
  walk.seen.add(sheet);
  let rules: CSSRuleList;
  try {
    // A stylesheet from another origin throws here. Its rules are not guessed at.
    rules = sheet.cssRules;
  } catch (error) {
    const reason = isSecurityError(error) ? "cross-origin" : "unreadable";
    walk.flat.hidden.push({ sheet: sheetName(sheet), reason });
    return;
  }
  walkRules(walk, frame, rules);
}

function sheetsOf(scope: Scope): CSSStyleSheet[] {
  return [...Array.from(scope.styleSheets), ...(scope.adoptedStyleSheets ?? [])];
}

/** devknobs' own: a stylesheet its element brought in, or any in one of its shadow roots. */
function isOwn(sheet: CSSStyleSheet): boolean {
  const owner = ownerOf(sheet);
  return owner !== null && isDevknobs(owner);
}

function flatten(scope: Scope, sheets: readonly CSSStyleSheet[]): Flat {
  const flat: Flat = { rules: [], layers: [], hidden: [], registered: new Map(), skipped: 0 };
  if (isShadowRoot(scope) && isDevknobs(scope.host)) return flat;
  const seen = new Set<CSSStyleSheet>();
  const layers = { anonymous: 0 };
  for (const sheet of sheets) {
    try {
      // A disabled stylesheet reaches nothing, an alternate one that is not chosen say.
      if (sheet.disabled || isOwn(sheet)) continue;
      const walk: Walk = { flat, seen, sheet: sheetName(sheet), owner: ownerOf(sheet), layers };
      let frame: Frame = {
        context: [],
        conditions: [],
        layer: [],
        parent: null,
        scope: null,
        conditional: null,
        path: [],
      };
      if (sheet.media.mediaText) frame = withMedia(frame, sheet.media, sheet.media.mediaText);
      walkSheet(walk, frame, sheet);
    } catch {
      flat.skipped += 1;
    }
  }
  return flat;
}

/** What tells a tree's stylesheets changed: which they are, and how many rules each has. */
function signature(sheets: readonly CSSStyleSheet[]): number[] {
  return sheets.map((sheet) => {
    try {
      return sheet.disabled ? -2 : sheet.cssRules.length;
    } catch {
      return -1;
    }
  });
}

interface Cached {
  version: number;
  sheets: CSSStyleSheet[];
  signature: number[];
  flat: Flat;
}

const cache = new WeakMap<Scope, Cached>();
let version = 0;

function same<T>(a: readonly T[], b: readonly T[]): boolean {
  return a.length === b.length && a.every((value, i) => value === b[i]);
}

/**
 * Drop every flattened rule list. One is rebuilt by itself when a stylesheet
 * comes, goes, is switched off or gains or loses a top-level rule. An edit
 * deeper than that, or to a selector, needs this.
 */
export function invalidate(): void {
  version += 1;
}

/** The style rules of a tree, flattened once and kept until its stylesheets change. */
export function rulesOf(scope: Scope): Flat {
  const sheets = sheetsOf(scope);
  const now = signature(sheets);
  const known = cache.get(scope);
  const fresh = known?.version === version && same(known.sheets, sheets);
  if (known && fresh && same(known.signature, now)) return known.flat;
  const flat = flatten(scope, sheets);
  cache.set(scope, { version, sheets, signature: now, flat });
  return flat;
}

/**
 * Each layer's place in its tree's order. A layer is placed where it is first
 * named, in a block, a statement or an import, and only where the conditions
 * around that hold. A layer's own rules go over those of the layers in it,
 * and unlayered rules, under the empty name, go over all.
 */
export function layerRanks(
  marks: readonly LayerMark[],
  holds: (conditions: readonly Condition[]) => boolean,
): Map<string, number> {
  interface Layer {
    children: Map<string, Layer>;
  }
  const root: Layer = { children: new Map() };
  for (const mark of marks) {
    if (!holds(mark.conditions)) continue;
    let layer = root;
    for (const step of mark.path) {
      let child = layer.children.get(step);
      if (!child) {
        child = { children: new Map() };
        layer.children.set(step, child);
      }
      layer = child;
    }
  }
  const ranks = new Map<string, number>();
  const place = (layer: Layer, name: string) => {
    for (const [step, child] of layer.children) place(child, name ? `${name}.${step}` : step);
    ranks.set(name, ranks.size);
  };
  place(root, "");
  return ranks;
}
