import { compareSpecificity } from "./selector";
import type { Conditional, Specificity, StyleDeclaration } from "./types";

/** Where a block of declarations stands in the cascade, apart from `!important`. */
export interface Source {
  /**
   * The tree the rule comes from: 0 for the element's own, higher for a shadow
   * tree inside it (`:host` and `::slotted()` rules).
   */
  context: number;
  /** The `style` attribute. */
  inline: boolean;
  /** The layer's place in its tree: a later layer is higher, and unlayered styles highest. */
  layer: number;
  specificity: Specificity;
  /** Place among the rules of its tree: stylesheet order, then rule order. */
  order: number;
}

/** A block in the running for an element's properties. */
export interface Candidate {
  id: number;
  source: Source;
  declarations: StyleDeclaration[];
  /** What the block sets a longhand to, as the browser parsed it. */
  value(longhand: string): string;
  conditional?: Conditional;
}

export interface Winner {
  candidate: Candidate;
  declaration: StyleDeclaration;
}

/**
 * Above zero when `a` wins, below when `b` does. Importance first. Then the
 * tree: the outer one wins, and the inner one once important. Then the `style`
 * attribute. Then layers: the later one wins, with unlayered styles over all,
 * and the other way round once important. Then specificity, then order.
 */
export function compare(a: Source, aImportant: boolean, b: Source, bImportant: boolean): number {
  if (aImportant !== bImportant) return aImportant ? 1 : -1;
  const turned = aImportant ? -1 : 1;
  if (a.context !== b.context) return (b.context - a.context) * turned;
  if (a.inline !== b.inline) return a.inline ? 1 : -1;
  if (a.layer !== b.layer) return (a.layer - b.layer) * turned;
  return compareSpecificity(a.specificity, b.specificity) || a.order - b.order;
}

/** The declaration that takes each longhand. In one block the later of two equals wins. */
export function winners(candidates: readonly Candidate[]): Map<string, Winner> {
  const won = new Map<string, Winner>();
  for (const candidate of candidates) {
    for (const declaration of candidate.declarations) {
      for (const longhand of declaration.longhands) {
        const best = won.get(longhand);
        const beats =
          !best ||
          compare(
            candidate.source,
            declaration.important,
            best.candidate.source,
            best.declaration.important,
          ) >= 0;
        if (beats) won.set(longhand, { candidate, declaration });
      }
    }
  }
  return won;
}

/** Strike a declaration through once every longhand it sets went to another. */
export function markOwn(candidates: readonly Candidate[], won: ReadonlyMap<string, Winner>): void {
  for (const candidate of candidates) {
    for (const declaration of candidate.declarations) {
      const lost = declaration.longhands.every(
        (longhand) => won.get(longhand)?.declaration !== declaration,
      );
      declaration.overridden = lost;
      const by = won.get(declaration.longhands[0] ?? "")?.candidate.id;
      if (lost && by !== undefined) declaration.overriddenBy = by;
    }
  }
}

/**
 * Settle what one ancestor hands down. Only declarations of inherited
 * properties stay, and the candidates left with none are dropped. One is
 * struck through when it lost on the ancestor itself, or when the element or
 * a nearer ancestor sets the property: `taken` has those, by the block that
 * set each, and gets this ancestor's added.
 */
export function settleInherited<C extends Candidate>(
  candidates: readonly C[],
  taken: Map<string, number>,
  inherits: (property: string) => boolean,
): C[] {
  for (const candidate of candidates) {
    candidate.declarations = candidate.declarations.filter((declaration) =>
      declaration.longhands.some(inherits),
    );
  }
  const kept = candidates.filter((candidate) => candidate.declarations.length > 0);
  const won = winners(kept);
  for (const candidate of kept) {
    for (const declaration of candidate.declarations) {
      const passed = declaration.longhands.filter(inherits);
      const live = passed.some(
        (longhand) => !taken.has(longhand) && won.get(longhand)?.declaration === declaration,
      );
      declaration.overridden = !live;
      const first = passed[0] ?? "";
      const by = taken.get(first) ?? won.get(first)?.candidate.id;
      if (!live && by !== undefined) declaration.overriddenBy = by;
    }
  }
  for (const [longhand, winner] of won) {
    if (inherits(longhand) && !taken.has(longhand)) taken.set(longhand, winner.candidate.id);
  }
  return kept;
}

/** Properties whose keywords compute to themselves, whatever is around the element. */
const STEADY = new Set([
  "box-sizing",
  "flex-direction",
  "flex-wrap",
  "object-fit",
  "pointer-events",
  "position",
  "text-transform",
  "visibility",
]);

/** `display` values that an element keeps as a flex or grid item too. */
const STEADY_DISPLAY = new Set(["none", "block", "flex", "grid"]);

const WIDE = new Set(["inherit", "initial", "unset", "revert", "revert-layer"]);

function tidy(property: string, value: string): string {
  const text = value.trim().replace(/\s+/g, " ");
  return property.startsWith("--") ? text : text.toLowerCase();
}

/** Does the computed style show this value just as it is written? */
function isSteady(property: string, value: string): boolean {
  if (property.startsWith("--")) return value !== "" && !value.includes("var(");
  if (WIDE.has(value)) return false;
  if (property === "display") return STEADY_DISPLAY.has(value);
  return STEADY.has(property) && /^[a-z-]+$/.test(value);
}

/**
 * Decide the container queries the computed style can decide. Script cannot
 * evaluate a container query, but where a rule inside one would win a
 * property with a steady value, the computed style tells: another value there
 * means the query does not hold, and the rule is dropped. The same value,
 * where the next in line would have given a different steady one, confirms
 * it. A rule with no such property stays, unconfirmed.
 */
export function settleContainers<C extends Candidate>(
  candidates: readonly C[],
  computed: (property: string) => string,
): C[] {
  let live = [...candidates];
  // Until a pass decides nothing: one rule dropped lets the next one down win, and be judged.
  for (let decided = true; decided; ) {
    decided = false;
    for (const candidate of [...live]) {
      const conditional = candidate.conditional;
      if (conditional?.kind !== "container" || conditional.confirmed) continue;
      const without = live.filter((other) => other !== candidate);
      const verdict = judge(candidate, winners(live), winners(without), computed);
      if (verdict === null) continue;
      decided = true;
      if (verdict) conditional.confirmed = true;
      else live = without;
    }
  }
  return live;
}

/** True where the computed style shows the rule applies, false where it shows it does not. */
function judge(
  candidate: Candidate,
  won: ReadonlyMap<string, Winner>,
  without: ReadonlyMap<string, Winner>,
  computed: (property: string) => string,
): boolean | null {
  for (const [longhand, winner] of won) {
    if (winner.candidate !== candidate) continue;
    const mine = tidy(longhand, candidate.value(longhand));
    if (!isSteady(longhand, mine)) continue;
    if (tidy(longhand, computed(longhand)) !== mine) return false;
    const next = without.get(longhand);
    const other = next ? tidy(longhand, next.candidate.value(longhand)) : null;
    if (other !== null && other !== mine && isSteady(longhand, other)) return true;
  }
  return null;
}

/** Strongest first, as the pane lists them: the order normal declarations win in. */
export function byStrength<C extends Candidate>(candidates: readonly C[]): C[] {
  return [...candidates].sort((a, b) => compare(b.source, false, a.source, false));
}
