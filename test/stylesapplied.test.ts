import { describe, expect, test } from "bun:test";
import type {
  InheritedGroup,
  InlineBlock,
  Inspection,
  RuleBlock,
  StyleBlock,
  StyleDeclaration,
  VariableValue,
} from "../src/styles/types";
import {
  appliedInherited,
  appliedOwn,
  GROUPS,
  grouped,
  groupOf,
  hiddenNote,
  resolvedValue,
  type StyleGroup,
} from "../src/ui/stylesapplied";

function declaration(
  name: string,
  value: string,
  more: Partial<StyleDeclaration> = {},
): StyleDeclaration {
  return { name, value, important: false, longhands: [name], overridden: false, variables: [], ...more };
}

let ids = 0;

function rule(selector: string, declarations: StyleDeclaration[]): RuleBlock {
  return {
    kind: "rule",
    id: ids++,
    selectorText: selector,
    selector: [{ text: selector, matches: true }],
    specificity: [0, 1, 0],
    origin: { sheet: "https://example.com/app.css", owner: "link", path: [0] },
    context: [],
    declarations,
    rule: {} as CSSStyleRule,
  };
}

function inline(declarations: StyleDeclaration[]): InlineBlock {
  return { kind: "inline", id: ids++, declarations, element: {} as Element };
}

function inherited(from: string, blocks: (RuleBlock | InlineBlock)[]): InheritedGroup {
  return { kind: "inherited", from, element: {} as Element, blocks };
}

function found(blocks: StyleBlock[]): Inspection {
  return {
    target: { label: "button#save", pseudo: null },
    blocks,
    hidden: [],
    variables: {},
    skipped: 0,
  };
}

/** The declarations as the lines they make. */
function texts(applied: { declaration: StyleDeclaration }[]): string[] {
  return applied.map(({ declaration }) => `${declaration.name}: ${declaration.value}`);
}

const lost = { overridden: true };

describe("what applies to the element", () => {
  test("is every declaration in force, the strongest block first, then as written", () => {
    const applied = appliedOwn(
      found([
        rule(".primary", [declaration("color", "red"), declaration("margin", "0 auto")]),
        rule("button", [declaration("padding", "4px"), declaration("display", "flex")]),
      ]),
    );
    expect(texts(applied)).toEqual(["color: red", "margin: 0 auto", "padding: 4px", "display: flex"]);
  });

  test("leaves out every declaration another one overrides", () => {
    const applied = appliedOwn(
      found([
        rule(".primary", [declaration("color", "blue", lost), declaration("color", "red")]),
        rule("button", [declaration("color", "black", lost), declaration("padding", "4px")]),
      ]),
    );
    expect(texts(applied)).toEqual(["color: red", "padding: 4px"]);
  });

  test("the style attribute beats the rules: what it sets shows, and what it took does not", () => {
    const style = inline([declaration("color", "green")]);
    const applied = appliedOwn(
      found([style, rule(".primary", [declaration("color", "red", lost), declaration("gap", "4px")])]),
    );
    expect(texts(applied)).toEqual(["color: green", "gap: 4px"]);
    expect(applied[0]?.block).toBe(style);
  });

  test("a shorthand that lost a part stays, beside the longhand that took it, each once", () => {
    const sides = ["margin-top", "margin-right", "margin-bottom", "margin-left"];
    const applied = appliedOwn(
      found([
        rule(".primary", [declaration("margin-top", "8px")]),
        rule("button", [declaration("margin", "0", { longhands: sides })]),
      ]),
    );
    expect(texts(applied)).toEqual(["margin-top: 8px", "margin: 0"]);
  });

  test("a shorthand that lost every part is gone", () => {
    const sides = ["margin-top", "margin-right", "margin-bottom", "margin-left"];
    const applied = appliedOwn(
      found([
        rule(".primary", [declaration("margin", "4px", { longhands: sides })]),
        rule("button", [declaration("margin", "0", { longhands: sides, overridden: true })]),
      ]),
    );
    expect(texts(applied)).toEqual(["margin: 4px"]);
  });

  test("keeps an important declaration as written, and each one knows its block", () => {
    const block = rule(".primary", [declaration("color", "red", { important: true })]);
    const [one] = appliedOwn(found([block]));
    expect(one?.declaration.value).toBe("red");
    expect(one?.block).toBe(block);
  });

  test("has nothing of the pseudo-elements or of the ancestors", () => {
    const applied = appliedOwn(
      found([
        rule(".primary", [declaration("color", "red")]),
        { kind: "pseudo", pseudo: "::before", blocks: [rule(".primary::before", [declaration("content", '"+"')])] },
        inherited("div#app", [rule("#app", [declaration("font-size", "14px")])]),
      ]),
    );
    expect(texts(applied)).toEqual(["color: red"]);
  });
});

describe("what the element inherits", () => {
  test("is what the ancestors hand down in force, the nearest first", () => {
    const applied = appliedInherited(
      found([
        rule(".primary", [declaration("color", "red")]),
        inherited("div#app", [rule("#app", [declaration("font-size", "14px")])]),
        inherited("body", [
          rule("body", [declaration("color", "black", lost), declaration("line-height", "1.5")]),
        ]),
      ]),
    );
    expect(texts(applied)).toEqual(["font-size: 14px", "line-height: 1.5"]);
  });

  test("has each property once, from the nearest ancestor that sets it", () => {
    const fonts = ["font-size", "font-family"];
    const applied = appliedInherited(
      found([
        inherited("div#app", [
          rule("#app", [declaration("font", "14px sans-serif", { longhands: fonts })]),
          inline([declaration("--gap", "4px")]),
        ]),
        inherited("body", [
          rule("body", [
            declaration("font", "16px serif", { longhands: fonts }),
            declaration("--gap", "8px"),
            declaration("cursor", "default"),
          ]),
        ]),
      ]),
    );
    expect(texts(applied)).toEqual(["font: 14px sans-serif", "--gap: 4px", "cursor: default"]);
  });

  test("is nothing for an element with no ancestor that hands anything down", () => {
    expect(appliedInherited(found([rule(".primary", [declaration("color", "red")])]))).toEqual([]);
  });
});

describe("the group a property is listed in", () => {
  const TABLE: [string, StyleGroup][] = [
    ["display", "layout"],
    ["position", "layout"],
    ["inset", "layout"],
    ["inset-inline-start", "layout"],
    ["top", "layout"],
    ["left", "layout"],
    ["z-index", "layout"],
    ["flex", "layout"],
    ["flex-direction", "layout"],
    ["grid-template-columns", "layout"],
    ["grid-area", "layout"],
    ["gap", "layout"],
    ["row-gap", "layout"],
    ["align-items", "layout"],
    ["justify-content", "layout"],
    ["place-self", "layout"],
    ["order", "layout"],
    ["float", "layout"],
    ["overflow", "layout"],
    ["overflow-x", "layout"],
    ["-webkit-box-orient", "other"],
    ["width", "size and spacing"],
    ["height", "size and spacing"],
    ["inline-size", "size and spacing"],
    ["min-width", "size and spacing"],
    ["max-block-size", "size and spacing"],
    ["margin", "size and spacing"],
    ["margin-inline-start", "size and spacing"],
    ["padding-block", "size and spacing"],
    ["padding-left", "size and spacing"],
    ["box-sizing", "size and spacing"],
    ["aspect-ratio", "size and spacing"],
    ["font", "text"],
    ["font-family", "text"],
    ["-webkit-font-smoothing", "text"],
    ["line-height", "text"],
    ["letter-spacing", "text"],
    ["text-align", "text"],
    ["text-decoration", "text"],
    ["-webkit-text-fill-color", "text"],
    ["white-space", "text"],
    ["word-break", "text"],
    ["overflow-wrap", "text"],
    ["color", "text"],
    ["background", "look"],
    ["background-color", "look"],
    ["border", "look"],
    ["border-inline-end", "look"],
    ["border-radius", "look"],
    ["outline-offset", "look"],
    ["box-shadow", "look"],
    ["opacity", "look"],
    ["filter", "look"],
    ["backdrop-filter", "look"],
    ["-webkit-backdrop-filter", "look"],
    ["mix-blend-mode", "look"],
    ["transition", "motion"],
    ["transition-duration", "motion"],
    ["animation-name", "motion"],
    ["-webkit-animation", "motion"],
    ["transform", "motion"],
    ["-moz-transform-origin", "motion"],
    ["-ms-transform", "motion"],
    ["translate", "motion"],
    ["will-change", "motion"],
    ["cursor", "other"],
    ["content", "other"],
    ["pointer-events", "other"],
    ["visibility", "other"],
    ["scroll-margin-top", "other"],
    ["-webkit-line-clamp", "other"],
    ["columns", "other"],
    ["constructor", "other"],
    ["--color", "other"],
    ["--font-size", "other"],
    ["--display", "other"],
  ];

  test.each(TABLE)("%s is in %s", (name, group) => {
    expect(groupOf(name)).toBe(group);
  });

  test("the table is long enough, and has every group", () => {
    expect(TABLE.length).toBeGreaterThanOrEqual(40);
    expect(new Set(TABLE.map(([, group]) => group))).toEqual(new Set(GROUPS));
  });

  test("reads a name in any case", () => {
    expect(groupOf("Background-Color")).toBe("look");
  });
});

describe("the lines by group", () => {
  const line = (name: string) => ({ declaration: { name } });
  const names = (lines: { declaration: { name: string } }[]) =>
    lines.map((one) => one.declaration.name);

  test("come in the groups' order, each group in the order its lines came, with none empty", () => {
    const sets = grouped(
      ["color", "transition", "padding", "display", "font-size", "margin", "cursor"].map(line),
    );
    expect(sets.map((set) => [set.group, names(set.lines)])).toEqual([
      ["layout", ["display"]],
      ["size and spacing", ["padding", "margin"]],
      ["text", ["color", "font-size"]],
      ["motion", ["transition"]],
      ["other", ["cursor"]],
    ]);
  });

  test("the custom properties end the last group, in the order they came", () => {
    const sets = grouped(["--b", "cursor", "--a", "content", "color"].map(line));
    expect(sets.map((set) => [set.group, names(set.lines)])).toEqual([
      ["text", ["color"]],
      ["other", ["cursor", "content", "--b", "--a"]],
    ]);
  });

  test("is nothing for no lines", () => {
    expect(grouped([])).toEqual([]);
  });
});

describe("what a value that reads custom properties comes to", () => {
  const variables: Record<string, VariableValue> = {
    "--ink": { value: "#111827", definedIn: 1 },
    "--gap": { value: "4px", definedIn: null },
    "--unset": { value: "", definedIn: null },
    // The engine reads what the element sees, so one that reads another is settled already.
    "--edge": { value: "1px solid #111827", definedIn: 2 },
  };

  test.each<[string, string | null]>([
    ["var(--ink)", "#111827"],
    ["var( --ink )", "#111827"],
    ["calc(var(--gap) * 2)", "calc(4px * 2)"],
    ["var(--gap) var(--gap)", "4px 4px"],
    ["var(--edge)", "1px solid #111827"],
    ["var(--unset, 8px)", "8px"],
    ["var(--unset, var(--gap))", "4px"],
    ["var(--ink, red)", "#111827"],
    ["var(--unset, rgb(0, 0, 0))", "rgb(0, 0, 0)"],
    ["var(--unset)", null],
    ["var(--nowhere)", null],
    ["1px solid var(--unset, var(--nowhere))", null],
    ["var(--ink", null],
    ["red", null],
    ["--var(--ink)", null],
  ])("%s comes to %p", (value, comes) => {
    expect(resolvedValue(value, variables)).toBe(comes);
  });
});

describe("the line for stylesheets that may not be read", () => {
  test("is none while all can be read", () => {
    expect(hiddenNote([])).toBeNull();
  });

  test("is one line, however many there are", () => {
    expect(
      hiddenNote([
        { sheet: "https://cdn.example.com/a.css", reason: "cross-origin" },
        { sheet: "https://cdn.example.com/b.css", reason: "unreadable" },
      ]),
    ).toBe("some styles are hidden: a stylesheet from another origin");
    expect(hiddenNote([{ sheet: "https://example.com/b.css", reason: "unreadable" }])).toBe(
      "some styles are hidden: a stylesheet that could not be read",
    );
  });
});
