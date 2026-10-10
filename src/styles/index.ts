/**
 * The styles of one element, as the styles pane shows them: its `style`
 * attribute, the rules that reach it in the order the cascade ranks them, its
 * `::before` and `::after`, and what each ancestor hands down. To use it:
 *
 *   const found = inspect(element);            // or inspect(element, "::before")
 *   invalidate();                              // after editing a stylesheet in place
 *
 * Nothing here draws or listens. It reads the page's stylesheets as they are,
 * and leaves out devknobs' own.
 */

import { isDevknobs } from "../grab/hit";
import {
  byStrength,
  type Candidate,
  markOwn,
  settleContainers,
  settleInherited,
  type Source,
  winners,
} from "./cascade";
import { type Flat, type FlatRule, layerRanks, rulesOf } from "./collect";
import {
  listed,
  longhandsOf,
  parseDeclarations,
  type StyleLike,
  variableNames,
} from "./declarations";
import { isInherited } from "./inherited";
import { type Checks, conditionsFor, type Hit, matchRules, type Reach } from "./match";
import { normalizePseudo } from "./selector";
import { flatParent, isShadowRoot, label, type Scope, scopeOf } from "./tree";
import type {
  InlineBlock,
  Inspection,
  OwnBlock,
  RuleBlock,
  StyleBlock,
  StyleDeclaration,
  VariableValue,
} from "./types";

export { invalidate } from "./collect";
export type * from "./types";

/** The element itself, among the names of what a rule styles. */
const ELEMENT = "";

/** The pseudo-elements shown under an element's own rules. */
const PSEUDOS = ["::before", "::after"];

const ONLY_ELEMENT: ReadonlySet<string> = new Set([ELEMENT]);

/** A block with its place in the cascade. */
interface Entry extends Candidate {
  block: OwnBlock;
}

/** What one inspection gathers as it goes from tree to tree. */
interface Session {
  checks: Checks;
  expand: (shorthand: string) => readonly string[];
  ids: number;
  threw: number;
  ranks: Map<Flat, Map<string, number>>;
  registered: Map<string, boolean>;
}

interface Probe {
  style: CSSStyleDeclaration | null;
  known: Map<string, string[]>;
}

const probes = new WeakMap<Document, Probe>();

/**
 * The longhands of any shorthand, asked of the browser: an element that is
 * never attached has the shorthand set on its style, which then lists them.
 * The page sees nothing of it.
 */
function expanderFor(doc: Document): Session["expand"] {
  const probe = probes.get(doc) ?? { style: null, known: new Map<string, string[]>() };
  probes.set(doc, probe);
  return (shorthand) => {
    let longhands = probe.known.get(shorthand);
    if (longhands) return longhands;
    longhands = [];
    try {
      probe.style ??= doc.createElement("div").style;
      probe.style.cssText = "";
      probe.style.setProperty(shorthand, "initial");
      longhands = listed(probe.style);
    } catch {
      // A document that makes no styled elements: the names under the shorthand's stand in.
    }
    probe.known.set(shorthand, longhands);
    return longhands;
  };
}

type Parsed = Pick<StyleDeclaration, "name" | "value" | "important" | "longhands" | "variables">;

/** Each block's declarations, kept for as long as its text stays the same. */
const parsed = new WeakMap<StyleLike, { text: string; declarations: Parsed[] }>();

function declarationsOf(style: StyleLike, session: Session): StyleDeclaration[] {
  const text = style.cssText;
  let known = parsed.get(style);
  if (!known || known.text !== text) {
    const names = listed(style);
    const declarations = parseDeclarations(text).map((written) => ({
      ...written,
      longhands: longhandsOf(written.name, names, session.expand),
      variables: variableNames(written.value),
    }));
    known = { text, declarations };
    parsed.set(style, known);
  }
  return known.declarations.map((declaration) => ({ ...declaration, overridden: false }));
}

function open(session: Session, scope: Scope): Flat {
  const flat = rulesOf(scope);
  if (!session.ranks.has(flat)) {
    session.ranks.set(flat, layerRanks(flat.layers, session.checks.holds));
    for (const [name, inherits] of flat.registered) session.registered.set(name, inherits);
  }
  return flat;
}

function ruleEntry(session: Session, flat: Flat, hit: Hit, context: number): Entry {
  const { rule, parts, selectorText, origin, conditional } = hit.flat;
  const source: Source = {
    context,
    inline: false,
    layer: session.ranks.get(flat)?.get(hit.flat.layer) ?? 0,
    specificity: hit.specificity,
    order: hit.flat.order,
  };
  const block: RuleBlock = {
    kind: "rule",
    id: session.ids++,
    selectorText,
    selector: parts.map((part, i) => ({ text: part.text, matches: hit.matched[i] === true })),
    specificity: hit.specificity,
    origin,
    context: hit.flat.context,
    declarations: declarationsOf(rule.style, session),
    rule,
  };
  if (conditional) block.conditional = { kind: conditional, confirmed: false };
  return {
    id: block.id,
    source,
    declarations: block.declarations,
    value: (longhand) => rule.style.getPropertyValue(longhand),
    conditional: block.conditional,
    block,
  };
}

function hasStyle(element: Element): element is Element & ElementCSSInlineStyle {
  return "style" in element;
}

/** The element's `style` attribute as a block, or null when it sets nothing. */
function inlineEntry(session: Session, element: Element): Entry | null {
  if (!hasStyle(element)) return null;
  const style = element.style;
  const declarations = declarationsOf(style, session);
  if (declarations.length === 0) return null;
  const block: InlineBlock = { kind: "inline", id: session.ids++, declarations, element };
  return {
    id: block.id,
    source: { context: 0, inline: true, layer: 0, specificity: [0, 0, 0], order: 0 },
    declarations,
    value: (longhand) => style.getPropertyValue(longhand),
    block,
  };
}

/**
 * Every rule that reaches the element, by what it styles: the rules of its own
 * tree, then `::slotted()` rules of each tree it is slotted into, then the
 * `:host` rules of its own shadow root. Each tree further in is a context
 * further in for the cascade.
 */
function entriesFor(
  session: Session,
  element: Element,
  wanted: ReadonlySet<string>,
  skip?: (flat: FlatRule) => boolean,
): Map<string, Entry[]> {
  const entries = new Map<string, Entry[]>();
  const add = (scope: Scope, reach: Reach, context: number) => {
    const flat = open(session, scope);
    const hits = matchRules(element, flat.rules, reach, wanted, session.checks, skip);
    for (const [styles, list] of hits) {
      const into = entries.get(styles) ?? [];
      entries.set(styles, into);
      for (const hit of list) into.push(ruleEntry(session, flat, hit, context));
    }
  };
  add(scopeOf(element), { kind: "own" }, 0);
  let context = 1;
  for (let slot = element.assignedSlot; slot; slot = slot.assignedSlot) {
    const root = slot.getRootNode();
    if (isShadowRoot(root)) add(root, { kind: "slotted", slot }, context++);
  }
  if (element.shadowRoot) add(element.shadowRoot, { kind: "host" }, context);
  return entries;
}

function isRule(block: OwnBlock): block is RuleBlock {
  return block.kind === "rule";
}

/** The blocks to show, strongest first, each with the declarations the cascade left it. */
function shown(entries: readonly Entry[]): OwnBlock[] {
  return byStrength(entries).map((entry) => {
    entry.block.declarations = entry.declarations;
    return entry.block;
  });
}

function ownBlocks(blocks: readonly StyleBlock[]): OwnBlock[] {
  return blocks.flatMap((block) => {
    if (block.kind === "pseudo") return [];
    return block.kind === "inherited" ? block.blocks : [block];
  });
}

/**
 * Inspect an element, or one of its pseudo-elements. Rules in a media query
 * or `@supports` that does not hold now are left out. A rule in `@container`
 * or `@scope` is marked `conditional`, as script cannot evaluate those for sure.
 */
export function inspect(element: Element, pseudo?: string): Inspection {
  const target = { label: label(element), pseudo: pseudo ? normalizePseudo(pseudo) : null };
  const found: Inspection = { target, blocks: [], hidden: [], variables: {}, skipped: 0 };
  const doc = element.ownerDocument;
  // The window the element is in, the device frame's own for a page shown in it.
  const view = doc.defaultView;
  if (!view || isDevknobs(element)) return found;
  const session: Session = {
    checks: { holds: conditionsFor(view), threw: () => session.threw++ },
    expand: expanderFor(doc),
    ids: 0,
    threw: 0,
    ranks: new Map(),
    registered: new Map(),
  };
  // `@property` rules count from the document, wherever the element is.
  open(session, doc);
  let computed: CSSStyleDeclaration | null = null;
  const read = (property: string): string => {
    computed ??= view.getComputedStyle(element, target.pseudo);
    return computed.getPropertyValue(property);
  };

  const wanted = new Set(target.pseudo ? [target.pseudo] : [ELEMENT, ...PSEUDOS]);
  const reached = entriesFor(session, element, wanted);
  let own = reached.get(target.pseudo ?? ELEMENT) ?? [];
  const inline = target.pseudo ? null : inlineEntry(session, element);
  if (inline) own.push(inline);
  own = settleContainers(own, read);
  const won = winners(own);
  markOwn(own, won);
  found.blocks.push(...shown(own));

  if (!target.pseudo) {
    for (const name of PSEUDOS) {
      const entries = reached.get(name);
      if (!entries) continue;
      markOwn(entries, winners(entries));
      found.blocks.push({ kind: "pseudo", pseudo: name, blocks: shown(entries).filter(isRule) });
    }
  }

  const taken = new Map<string, number>();
  for (const [longhand, winner] of won) taken.set(longhand, winner.candidate.id);
  const inherits = (property: string) => isInherited(property, session.registered);
  const handsNothing = (flat: FlatRule) => {
    flat.hands ??= listed(flat.rule.style).some(inherits);
    return !flat.hands;
  };
  // A pseudo-element inherits from its element first.
  let ancestor = target.pseudo ? element : flatParent(element);
  for (; ancestor; ancestor = flatParent(ancestor)) {
    const entries = entriesFor(session, ancestor, ONLY_ELEMENT, handsNothing).get(ELEMENT) ?? [];
    const attribute = inlineEntry(session, ancestor);
    if (attribute) entries.push(attribute);
    const kept = settleInherited(entries, taken, inherits);
    if (kept.length === 0) continue;
    found.blocks.push({
      kind: "inherited",
      from: label(ancestor),
      element: ancestor,
      blocks: shown(kept),
    });
  }

  const variables: Record<string, VariableValue> = {};
  for (const block of ownBlocks(found.blocks)) {
    for (const declaration of block.declarations) {
      if (declaration.overridden) continue;
      for (const name of declaration.variables) {
        // `taken` has the block that sets each property the element ends up with.
        variables[name] ??= { value: read(name).trim(), definedIn: taken.get(name) ?? null };
      }
    }
  }
  found.variables = variables;
  for (const flat of session.ranks.keys()) {
    found.hidden.push(...flat.hidden);
    found.skipped += flat.skipped;
  }
  found.skipped += session.threw;
  return found;
}
