/**
 * What an inspection hands the pane: plain data, in the order it is shown.
 * The live rules ride along as handles, so a later edit goes to the right one.
 */

/** Ids, then classes, attributes and pseudo-classes, then types and pseudo-elements. */
export type Specificity = readonly [number, number, number];

export interface StyleDeclaration {
  /** As the stylesheet serializes it: a shorthand stays a shorthand. */
  name: string;
  /** As written, `var()` and all, without `!important`. */
  value: string;
  important: boolean;
  /** The longhands it sets, which the cascade is settled by. Itself for a longhand. */
  longhands: string[];
  /** Every longhand it sets lost to another declaration. */
  overridden: boolean;
  /** The `id` of the block that took its first longhand, when overridden. */
  overriddenBy?: number;
  /** The custom properties its value reads through `var()`, fallbacks included. */
  variables: string[];
}

/** One selector of a rule's list. */
export interface SelectorPart {
  /** As the stylesheet has it, `&` and all for a nested rule. */
  text: string;
  /** This one reaches the element. */
  matches: boolean;
}

export interface RuleOrigin {
  /** The stylesheet's address, `<style>` for an inline one, `constructed` for an adopted one. */
  sheet: string;
  /** The element that brought the stylesheet in, as `link#theme`. Null for a constructed one. */
  owner: string | null;
  /**
   * Where the rule sits: its index in the stylesheet, then in each rule around
   * it, outermost first. An `@import` counts as the rule its stylesheet is in.
   */
  path: number[];
}

/** A condition around a rule that script cannot evaluate for sure. */
export interface Conditional {
  kind: "container" | "scope";
  /** The computed style showed that the rule applies. False where it could not tell. */
  confirmed: boolean;
}

export interface InlineBlock {
  kind: "inline";
  /** Names the block within one inspection. */
  id: number;
  declarations: StyleDeclaration[];
  /** The element whose `style` attribute this is. */
  element: Element;
}

export interface RuleBlock {
  kind: "rule";
  id: number;
  /** The rule's whole selector list, as the stylesheet has it. */
  selectorText: string;
  selector: SelectorPart[];
  /** The highest among the selectors that match. */
  specificity: Specificity;
  origin: RuleOrigin;
  /**
   * What the rule sits in, outermost first: `@layer base`, `@media (min-width: 640px)`,
   * the selector of a rule it is nested in.
   */
  context: string[];
  conditional?: Conditional;
  declarations: StyleDeclaration[];
  /** The live rule, to toggle and edit its declarations on. */
  rule: CSSStyleRule | CSSNestedDeclarations;
}

export type OwnBlock = InlineBlock | RuleBlock;

/** What an ancestor hands down: only its declarations of inherited properties. */
export interface InheritedGroup {
  kind: "inherited";
  /** The ancestor, as `div#app.shell`. */
  from: string;
  element: Element;
  blocks: OwnBlock[];
}

/** The rules of one of the element's pseudo-elements. */
export interface PseudoGroup {
  kind: "pseudo";
  pseudo: string;
  blocks: RuleBlock[];
}

export type StyleBlock = OwnBlock | InheritedGroup | PseudoGroup;

/** A stylesheet whose rules the page may not read, so none of them is shown. */
export interface HiddenSheet {
  sheet: string;
  reason: "cross-origin" | "unreadable";
}

export interface VariableValue {
  /** What the element sees, from its computed style. Empty when it is not set. */
  value: string;
  /** The `id` of the block whose declaration it comes from, or null when none shown sets it. */
  definedIn: number | null;
}

export interface Inspection {
  target: {
    /** As devtools names it: `button#save.primary`. */
    label: string;
    /** `::before` say, when a pseudo-element was asked for. */
    pseudo: string | null;
  };
  /**
   * Nearest first: the element's own, strongest first, then its pseudo-elements,
   * then each ancestor's.
   */
  blocks: StyleBlock[];
  hidden: HiddenSheet[];
  /** Every custom property a winning declaration reads, by name. */
  variables: Record<string, VariableValue>;
  /** Rules and selectors that threw and were left out. */
  skipped: number;
}
