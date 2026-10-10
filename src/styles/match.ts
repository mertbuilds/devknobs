import type { Condition, FlatPart, FlatRule, ScopeLimits } from "./collect";
import { compareSpecificity } from "./selector";
import type { Specificity } from "./types";

/**
 * Whose rules are matched: the element's own tree's, its shadow root's `:host`
 * rules, or the `::slotted()` rules of the tree the slot it is assigned to is in.
 */
export type Reach = { kind: "own" } | { kind: "host" } | { kind: "slotted"; slot: Element };

/** A rule that reaches the element, or one of its pseudo-elements. */
export interface Hit {
  flat: FlatRule;
  /** Which selectors of the rule's list match, in their order. */
  matched: boolean[];
  /** The highest among those. */
  specificity: Specificity;
}

/** What one inspection shares across its passes. */
export interface Checks {
  holds(conditions: readonly Condition[]): boolean;
  /** A selector threw and was left out. */
  threw(): void;
}

/** Answers media queries and `@supports` conditions for a window, each once. */
export function conditionsFor(view: Window & typeof globalThis): Checks["holds"] {
  const known = new Map<string, boolean>();
  const test = (key: string, run: () => boolean): boolean => {
    let result = known.get(key);
    if (result === undefined) {
      try {
        result = run();
      } catch {
        result = false;
      }
      known.set(key, result);
    }
    return result;
  };
  return (conditions) =>
    conditions.every((condition) => {
      if (condition.kind === "supports") {
        return test(`s:${condition.text}`, () => view.CSS.supports(condition.text));
      }
      const text = condition.list.mediaText;
      return text === "" || test(`m:${text}`, () => view.matchMedia(text).matches);
    });
}

function reaches(element: Element, part: FlatPart, reach: Reach): boolean {
  if (reach.kind === "host") return part.host !== null && element.matches(part.host);
  if (reach.kind === "slotted") {
    if (part.slotted === null) return false;
    return element.matches(part.slotted) && reach.slot.matches(part.match);
  }
  // `:host` alone names the host from inside, and `::slotted()` an element of another tree.
  return part.host === null && part.slotted === null && element.matches(part.match);
}

/**
 * Is the element within the `@scope`: under the nearest root, and not at or
 * under one of its limits? A limit is matched as written, not relative to the root.
 */
export function inScope(element: Element, scope: ScopeLimits): boolean {
  let root: Element | null = scope.around;
  if (scope.start !== null) {
    root = element;
    while (root && !root.matches(scope.start)) root = root.parentElement;
    if (!root) return false;
  } else if (root && !root.contains(element)) {
    return false;
  }
  if (scope.end === null) return true;
  for (let current: Element | null = element; current && current !== root; ) {
    if (current.matches(scope.end)) return false;
    current = current.parentElement;
  }
  return true;
}

/**
 * The rules that reach the element, in one pass, each selector matched once.
 * They come by what they style: under the empty name for the element itself,
 * under `::before` and the like for a pseudo-element. Only names in `wanted` are looked at.
 */
export function matchRules(
  element: Element,
  rules: readonly FlatRule[],
  reach: Reach,
  wanted: ReadonlySet<string>,
  checks: Checks,
  skip?: (flat: FlatRule) => boolean,
): Map<string, Hit[]> {
  const found = new Map<string, Hit[]>();
  for (const flat of rules) {
    if (skip?.(flat) || !checks.holds(flat.conditions)) continue;
    let hits: Map<string, Hit> | null = null;
    for (let i = 0; i < flat.parts.length; i++) {
      const part = flat.parts[i];
      const styles = part?.pseudo ?? "";
      if (!part || !wanted.has(styles)) continue;
      try {
        if (!reaches(element, part, reach)) continue;
        if (flat.scope && !inScope(element, flat.scope)) continue;
      } catch {
        checks.threw();
        continue;
      }
      hits ??= new Map();
      let hit = hits.get(styles);
      if (!hit) {
        hit = { flat, matched: flat.parts.map(() => false), specificity: part.specificity };
        hits.set(styles, hit);
      }
      hit.matched[i] = true;
      if (compareSpecificity(part.specificity, hit.specificity) > 0) {
        hit.specificity = part.specificity;
      }
    }
    if (!hits) continue;
    for (const [styles, hit] of hits) {
      const list = found.get(styles);
      if (list) list.push(hit);
      else found.set(styles, [hit]);
    }
  }
  return found;
}
