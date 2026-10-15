/**
 * A small CSSOM and element tree, with just what the styles engine reads. The
 * rule classes carry the browser's names, as the engine tells rules apart by
 * the name of their class.
 */

/** The shorthands the fake style can take apart. */
const SHORTHANDS: Record<string, string[]> = {
  margin: ["margin-top", "margin-right", "margin-bottom", "margin-left"],
  padding: ["padding-top", "padding-right", "padding-bottom", "padding-left"],
  border: ["border-top-width", "border-top-style", "border-top-color"],
  "border-color": ["border-top-color"],
  font: ["font-style", "font-weight", "font-size", "line-height", "font-family"],
  background: ["background-color", "background-image"],
};

interface FakeDeclaration {
  name: string;
  value: string;
  important: boolean;
}

/** A declaration block that lists longhands and serializes what was written, as a browser's does. */
export class FakeStyle {
  private written: FakeDeclaration[] = [];

  constructor(text = "") {
    this.cssText = text;
  }

  get cssText(): string {
    return this.written
      .map(({ name, value, important }) => `${name}: ${value}${important ? " !important" : ""};`)
      .join(" ");
  }

  /** Only plain declarations: no semicolon or colon inside a value. */
  set cssText(text: string) {
    this.written = [];
    for (const piece of text.split(";")) {
      const at = piece.indexOf(":");
      if (at < 0) continue;
      const value = piece.slice(at + 1).trim();
      const important = value.endsWith("!important");
      this.written.push({
        name: piece.slice(0, at).trim(),
        value: important ? value.slice(0, -"!important".length).trim() : value,
        important,
      });
    }
  }

  setProperty(name: string, value: string): void {
    this.written.push({ name, value, important: false });
  }

  private names(): string[] {
    return [...new Set(this.written.flatMap(({ name }) => SHORTHANDS[name] ?? [name]))];
  }

  get length(): number {
    return this.names().length;
  }

  item(index: number): string {
    return this.names()[index] ?? "";
  }

  /** A longhand under a shorthand reads the shorthand's value when that is one plain word. */
  getPropertyValue(name: string): string {
    for (const declaration of [...this.written].reverse()) {
      if (declaration.name === name) return declaration.value;
      if (!SHORTHANDS[declaration.name]?.includes(name)) continue;
      return /[\s(]/.test(declaration.value) ? "" : declaration.value;
    }
    return "";
  }
}

export interface FakeSheet {
  href: string | null;
  ownerNode: FakeElement | null;
  media: { mediaText: string };
  disabled: boolean;
  cssRules: FakeRule[];
}

export type FakeRule = object;

class CSSStyleRule {
  style: FakeStyle;
  constructor(
    public selectorText: string,
    css: string,
    public cssRules: FakeRule[] = [],
  ) {
    this.style = new FakeStyle(css);
  }
}

class CSSNestedDeclarations {
  style: FakeStyle;
  constructor(css: string) {
    this.style = new FakeStyle(css);
  }
}

class CSSMediaRule {
  media: { mediaText: string };
  constructor(
    text: string,
    public cssRules: FakeRule[],
  ) {
    this.media = { mediaText: text };
  }
}

class CSSSupportsRule {
  constructor(
    public conditionText: string,
    public cssRules: FakeRule[],
  ) {}
}

class CSSContainerRule {
  constructor(
    public conditionText: string,
    public cssRules: FakeRule[],
  ) {}
}

class CSSLayerBlockRule {
  constructor(
    public name: string,
    public cssRules: FakeRule[],
  ) {}
}

class CSSLayerStatementRule {
  constructor(public nameList: string[]) {}
}

class CSSScopeRule {
  constructor(
    public start: string | null,
    public end: string | null,
    public cssRules: FakeRule[],
  ) {}
}

class CSSPropertyRule {
  constructor(
    public name: string,
    public inherits: boolean,
  ) {}
}

class CSSKeyframesRule {
  constructor(
    public name: string,
    public cssRules: FakeRule[],
  ) {}
}

class CSSImportRule {
  media: { mediaText: string };
  constructor(
    public styleSheet: FakeSheet | null,
    public layerName: string | null,
    public supportsText: string | null,
    media: string,
  ) {
    this.media = { mediaText: media };
  }
}

/** A rule whose selector cannot be read, as nothing in a browser should be. */
class Broken {
  get selectorText(): string {
    throw new Error("broken rule");
  }
}
Object.defineProperty(Broken, "name", { value: "CSSStyleRule" });

export const rule = (selector: string, css: string, children: FakeRule[] = []): CSSStyleRule =>
  new CSSStyleRule(selector, css, children);
export const nested = (css: string): FakeRule => new CSSNestedDeclarations(css);
export const media = (text: string, rules: FakeRule[]): CSSMediaRule => new CSSMediaRule(text, rules);
export const supports = (text: string, rules: FakeRule[]): FakeRule =>
  new CSSSupportsRule(text, rules);
export const container = (text: string, rules: FakeRule[]): FakeRule =>
  new CSSContainerRule(text, rules);
export const layer = (name: string, rules: FakeRule[]): FakeRule =>
  new CSSLayerBlockRule(name, rules);
export const layers = (...names: string[]): FakeRule => new CSSLayerStatementRule(names);
export const scope = (start: string | null, end: string | null, rules: FakeRule[]): FakeRule =>
  new CSSScopeRule(start, end, rules);
export const property = (name: string, inherits: boolean): FakeRule =>
  new CSSPropertyRule(name, inherits);
export const keyframes = (name: string, rules: FakeRule[]): FakeRule =>
  new CSSKeyframesRule(name, rules);
export const broken = (): FakeRule => new Broken();

export function imported(
  styleSheet: FakeSheet | null,
  options: { layer?: string; supports?: string; media?: string } = {},
): FakeRule {
  return new CSSImportRule(
    styleSheet,
    options.layer ?? null,
    options.supports ?? null,
    options.media ?? "",
  );
}

export function sheet(
  rules: FakeRule[],
  options: { href?: string; owner?: FakeElement; media?: string; disabled?: boolean } = {},
): FakeSheet {
  return {
    href: options.href ?? null,
    ownerNode: options.owner ?? null,
    media: { mediaText: options.media ?? "" },
    disabled: options.disabled ?? false,
    cssRules: rules,
  };
}

/** A stylesheet whose rules may not be read, as one from another origin. */
export function locked(href: string, name = "SecurityError"): FakeSheet {
  const hidden = sheet([], { href });
  Object.defineProperty(hidden, "cssRules", {
    get() {
      const error = new Error("cannot read rules");
      error.name = name;
      throw error;
    },
  });
  return hidden;
}

export interface FakeShadow {
  host: FakeElement;
  styleSheets: FakeSheet[];
  adoptedStyleSheets: FakeSheet[];
}

export interface FakeView {
  matchMedia(query: string): { matches: boolean };
  CSS: { supports(condition: string): boolean };
  getComputedStyle(
    element: FakeElement,
    pseudo: string | null,
  ): { getPropertyValue(name: string): string };
}

export interface FakeDocument {
  styleSheets: FakeSheet[];
  adoptedStyleSheets: FakeSheet[];
  defaultView: FakeView;
  /** The media queries and `@supports` conditions that hold. Any other does not. */
  holds: Set<string>;
  /** What each element's computed style reads, by element then property. */
  computed: Map<FakeElement, Record<string, string>>;
  /** Every computed style asked for. */
  computedCalls: { element: FakeElement; pseudo: string | null }[];
  /** Every media query asked of `matchMedia`. */
  mediaCalls: string[];
  createElement(tag: string): { style: FakeStyle };
}

export function page(holds: string[] = []): FakeDocument {
  const doc: FakeDocument = {
    styleSheets: [],
    adoptedStyleSheets: [],
    holds: new Set(holds),
    computed: new Map(),
    computedCalls: [],
    mediaCalls: [],
    defaultView: {
      matchMedia: (query) => {
        doc.mediaCalls.push(query);
        return { matches: doc.holds.has(query) };
      },
      CSS: { supports: (condition) => doc.holds.has(condition) },
      getComputedStyle: (element, pseudo) => {
        doc.computedCalls.push({ element, pseudo });
        return { getPropertyValue: (name) => doc.computed.get(element)?.[name] ?? "" };
      },
    },
    createElement: () => ({ style: new FakeStyle() }),
  };
  return doc;
}

export interface FakeElement {
  tagName: string;
  attrs: Record<string, string>;
  parentElement: FakeElement | null;
  assignedSlot: FakeElement | null;
  shadowRoot: FakeShadow | null;
  /** The shadow root the element sits right under, when it does. */
  under: FakeShadow | null;
  style: FakeStyle;
  ownerDocument: FakeDocument;
  /** The selectors the element matches. Any other it does not. */
  yes: Set<string>;
  /** The selectors that throw. */
  bad: Set<string>;
  /** Every selector it was asked about, in order. */
  asked: string[];
  matches(selector: string): boolean;
  getAttribute(name: string): string | null;
  hasAttribute(name: string): boolean;
  getRootNode(): FakeDocument | FakeShadow;
  contains(other: FakeElement): boolean;
}

export interface ElementOptions {
  attrs?: Record<string, string>;
  style?: string;
  matches?: string[];
  throws?: string[];
}

export function element(
  doc: FakeDocument,
  tag: string,
  options: ElementOptions = {},
  children: FakeElement[] = [],
): FakeElement {
  const attrs = options.attrs ?? {};
  const self: FakeElement = {
    tagName: tag.toUpperCase(),
    attrs,
    parentElement: null,
    assignedSlot: null,
    shadowRoot: null,
    under: null,
    style: new FakeStyle(options.style ?? ""),
    ownerDocument: doc,
    yes: new Set(options.matches ?? []),
    bad: new Set(options.throws ?? []),
    asked: [],
    matches(selector) {
      self.asked.push(selector);
      if (self.bad.has(selector)) throw new Error(`'${selector}' is not a valid selector`);
      return self.yes.has(selector);
    },
    getAttribute: (name) => attrs[name] ?? null,
    hasAttribute: (name) => name in attrs,
    getRootNode() {
      let top = self;
      while (top.parentElement) top = top.parentElement;
      return top.under ?? doc;
    },
    contains(other) {
      for (let current: FakeElement | null = other; current; current = current.parentElement) {
        if (current === self) return true;
      }
      return false;
    },
  };
  for (const child of children) child.parentElement = self;
  return self;
}

/** A shadow root on `host` with `children` and stylesheets of its own. */
export function attach(host: FakeElement, children: FakeElement[], sheets: FakeSheet[]): FakeShadow {
  const root: FakeShadow = { host, styleSheets: sheets, adoptedStyleSheets: [] };
  host.shadowRoot = root;
  for (const child of children) child.under = root;
  return root;
}

export function as(target: FakeElement): Element {
  return target as unknown as Element;
}
