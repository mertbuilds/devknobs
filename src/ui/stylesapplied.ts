/**
 * The simple mode of the styles view, as data: the declarations that apply to
 * an element, with no rule, selector or cascade around them, and the groups
 * they are listed in. Nothing here touches the page.
 */

import type {
  HiddenSheet,
  Inspection,
  OwnBlock,
  StyleDeclaration,
  VariableValue,
} from "../styles/types";
import { resolveVars, varReferences } from "../styles/varrefs";

/** What the simple mode says where the element's own blocks set nothing. */
export const NO_STYLES = "no styles set on this element";

/** The groups of the simple mode, in the order they are listed. */
export const GROUPS = ["layout", "size and spacing", "text", "look", "motion", "other"] as const;

export type StyleGroup = (typeof GROUPS)[number];

/** The properties that are in a group by their whole name. */
const EXACT: Record<string, StyleGroup> = {
  display: "layout",
  position: "layout",
  top: "layout",
  right: "layout",
  bottom: "layout",
  left: "layout",
  "z-index": "layout",
  gap: "layout",
  "row-gap": "layout",
  "column-gap": "layout",
  order: "layout",
  float: "layout",
  width: "size and spacing",
  height: "size and spacing",
  "inline-size": "size and spacing",
  "block-size": "size and spacing",
  "box-sizing": "size and spacing",
  "aspect-ratio": "size and spacing",
  "line-height": "text",
  "letter-spacing": "text",
  "white-space": "text",
  // The other name of `word-wrap`, which `overflow` would take.
  "overflow-wrap": "text",
  color: "text",
  "box-shadow": "look",
  opacity: "look",
  filter: "look",
  "backdrop-filter": "look",
  "mix-blend-mode": "look",
  "will-change": "motion",
  // A transform each, set on its own.
  translate: "motion",
  rotate: "motion",
  scale: "motion",
};

/** The properties that are in a group by how their name starts, the first that fits. */
const STARTS: readonly (readonly [string, StyleGroup])[] = [
  ["inset", "layout"],
  ["flex", "layout"],
  ["grid", "layout"],
  ["align-", "layout"],
  ["justify-", "layout"],
  ["place-", "layout"],
  ["overflow", "layout"],
  ["min-", "size and spacing"],
  ["max-", "size and spacing"],
  ["margin", "size and spacing"],
  ["padding", "size and spacing"],
  ["font", "text"],
  ["text-", "text"],
  ["word-", "text"],
  ["background", "look"],
  ["border", "look"],
  ["outline", "look"],
  ["transition", "motion"],
  ["animation", "motion"],
  ["transform", "motion"],
];

const VENDOR = /^-(?:webkit|moz|ms|o)-/;

function isCustom(name: string): boolean {
  return name.startsWith("--");
}

/** The group a property is listed in, by what it does. One it does not know is in `other`. */
export function groupOf(name: string): StyleGroup {
  if (isCustom(name)) return "other";
  const plain = name.toLowerCase().replace(VENDOR, "");
  const exact = Object.hasOwn(EXACT, plain) ? EXACT[plain] : undefined;
  if (exact) return exact;
  return STARTS.find(([start]) => plain.startsWith(start))?.[1] ?? "other";
}

/** A declaration that applies, and the block it is written in. */
export interface Applied {
  declaration: StyleDeclaration;
  block: OwnBlock;
}

function winning(block: OwnBlock): Applied[] {
  return block.declarations.flatMap((declaration) =>
    declaration.overridden ? [] : [{ declaration, block }],
  );
}

/**
 * What applies to the element from its own blocks, its `style` attribute and
 * the rules that reach it: every declaration the cascade left in force, the
 * strongest block first, then as written. A shorthand that lost only some of
 * its longhands is still in force, and so is the declaration that took them.
 */
export function appliedOwn(found: Inspection): Applied[] {
  return found.blocks.flatMap((block) =>
    block.kind === "inline" || block.kind === "rule" ? winning(block) : [],
  );
}

/** What the ancestors hand down and nothing nearer sets, the nearest first, each property once. */
export function appliedInherited(found: Inspection): Applied[] {
  const seen = new Set<string>();
  const applied: Applied[] = [];
  for (const group of found.blocks) {
    if (group.kind !== "inherited") continue;
    for (const one of group.blocks.flatMap(winning)) {
      if (seen.has(one.declaration.name)) continue;
      seen.add(one.declaration.name);
      applied.push(one);
    }
  }
  return applied;
}

/**
 * Lines by their group, in the groups' order, the ones with no line left out.
 * Each group keeps the order its lines came in, and the custom properties end `other`.
 */
export function grouped<T extends { declaration: Pick<StyleDeclaration, "name"> }>(
  lines: readonly T[],
): { group: StyleGroup; lines: T[] }[] {
  return GROUPS.flatMap((group) => {
    const own = lines.filter((line) => groupOf(line.declaration.name) === group);
    if (own.length === 0) return [];
    const custom = own.filter((line) => isCustom(line.declaration.name));
    const rest = own.filter((line) => !isCustom(line.declaration.name));
    return [{ group, lines: [...rest, ...custom] }];
  });
}

/**
 * What a value that reads custom properties comes to for the element, each
 * `var()` put as what the element sees for it, which has the ones it reads in
 * turn settled already. Null for a value that reads none, or reads one that
 * is not set and has no fallback.
 */
export function resolvedValue(
  value: string,
  variables: Record<string, VariableValue>,
): string | null {
  if (varReferences(value).length === 0) return null;
  return resolveVars(value, (name) => variables[name]?.value ?? "");
}

/** What the simple mode says where a stylesheet could not be read, as its list may miss some. */
export function hiddenNote(hidden: readonly HiddenSheet[]): string | null {
  if (hidden.length === 0) return null;
  const why = hidden.some((one) => one.reason === "cross-origin")
    ? "a stylesheet from another origin"
    : "a stylesheet that could not be read";
  return `some styles are hidden: ${why}`;
}
