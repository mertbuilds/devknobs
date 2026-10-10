import { describe, expect, test } from "bun:test";
import {
  compareSpecificity,
  hasNesting,
  normalizePseudo,
  parseSubject,
  resolveNesting,
  specificity,
  splitList,
} from "../src/styles/selector";
import type { Specificity } from "../src/styles/types";

const TABLE: [string, Specificity][] = [
  ["*", [0, 0, 0]],
  ["li", [0, 0, 1]],
  ["my-element", [0, 0, 1]],
  ["ul li", [0, 0, 2]],
  ["ul > li + li ~ li", [0, 0, 4]],
  [".a", [0, 1, 0]],
  [".a.b", [0, 2, 0]],
  [".über", [0, 1, 0]],
  ["#x", [1, 0, 0]],
  ["a#x.b", [1, 1, 1]],
  ['[type="text"]', [0, 1, 0]],
  ['input[type="a.b#c"]', [0, 1, 1]],
  ['[data-x="a, b"] > .c:focus-visible', [0, 3, 0]],
  ["a:hover", [0, 1, 1]],
  [":root", [0, 1, 0]],
  [":lang(en)", [0, 1, 0]],
  [":nth-of-type(2)", [0, 1, 0]],
  ["a:not([href]):not(.x)", [0, 2, 1]],
  ["a::before", [0, 0, 2]],
  ["a:before", [0, 0, 2]],
  ["li:first-child::marker", [0, 1, 2]],
  ["::-webkit-scrollbar", [0, 0, 1]],
  ["::view-transition-group(root)", [0, 0, 1]],
  ["x-card::part(label)", [0, 0, 2]],
  [":is(#a, .b) p", [1, 0, 1]],
  [":not(.a, #b)", [1, 0, 0]],
  [":where(#a .b) p", [0, 0, 1]],
  [":has(> img.x)", [0, 1, 1]],
  ["div:has(.a, #b) span", [1, 0, 2]],
  [":is(.a, :where(#b))", [0, 1, 0]],
  [":not(:is(#a, .b), div)", [1, 0, 0]],
  [":nth-child(2n+1)", [0, 1, 0]],
  ["li:nth-child(2n + 1 of .a, #b)", [1, 1, 1]],
  [":nth-last-child(1 of .a)", [0, 2, 0]],
  [".a\\.b", [0, 1, 0]],
  ["#\\31 23", [1, 0, 0]],
  ["svg|rect", [0, 0, 1]],
  ["*|*", [0, 0, 0]],
  [":host", [0, 1, 0]],
  [":host(.open)", [0, 2, 0]],
  [":host-context(#app .dark)", [1, 2, 0]],
  ["::slotted(.x)", [0, 1, 1]],
  ["slot[name]::slotted(li.x)", [0, 2, 3]],
  ["&", [0, 0, 0]],
];

describe("specificity", () => {
  for (const [selector, expected] of TABLE) {
    test(selector, () => {
      expect(specificity(selector)).toEqual(expected);
    });
  }

  test("a nested selector weighs as its parent list's heaviest", () => {
    expect(specificity(resolveNesting("& > .b", ".a, #c"))).toEqual([1, 1, 0]);
    expect(specificity(resolveNesting(".title", ".card"))).toEqual([0, 2, 0]);
    expect(specificity(resolveNesting("&:hover", "a"))).toEqual([0, 1, 1]);
  });

  test("compares ids first, then classes, then types", () => {
    expect(compareSpecificity([1, 0, 0], [0, 9, 9])).toBeGreaterThan(0);
    expect(compareSpecificity([0, 1, 0], [0, 0, 9])).toBeGreaterThan(0);
    expect(compareSpecificity([0, 1, 1], [0, 1, 2])).toBeLessThan(0);
    expect(compareSpecificity([1, 2, 3], [1, 2, 3])).toBe(0);
  });
});

describe("splitList", () => {
  test("splits on top level commas only", () => {
    expect(splitList(".a, .b")).toEqual([".a", ".b"]);
    expect(splitList(":is(.a, .b) c, d")).toEqual([":is(.a, .b) c", "d"]);
    expect(splitList('[title="a, b"], [x=\'c,d\']')).toEqual(['[title="a, b"]', "[x='c,d']"]);
    expect(splitList(".a\\,b, .c")).toEqual([".a\\,b", ".c"]);
    expect(splitList(":not(:is(a, b), [x=','])")).toEqual([":not(:is(a, b), [x=','])"]);
  });

  test("drops empty entries", () => {
    expect(splitList("")).toEqual([]);
    expect(splitList(".a,")).toEqual([".a"]);
  });
});

describe("parseSubject", () => {
  test("a plain selector is handed to matches as it is", () => {
    expect(parseSubject(" .a > b ")).toEqual({
      match: ".a > b",
      pseudo: null,
      slotted: null,
      host: null,
    });
  });

  test("takes the pseudo-element off, in either spelling", () => {
    expect(parseSubject("a::before")).toMatchObject({ match: "a", pseudo: "::before" });
    expect(parseSubject("a:before")).toMatchObject({ match: "a", pseudo: "::before" });
    expect(parseSubject(".a:hover::BEFORE")).toMatchObject({ match: ".a:hover", pseudo: "::before" });
    expect(parseSubject("a::after:hover")).toMatchObject({ match: "a:hover", pseudo: "::after" });
    expect(parseSubject("input::placeholder")).toMatchObject({ pseudo: "::placeholder" });
    expect(parseSubject("::highlight(Find)")).toMatchObject({ match: "*", pseudo: "::highlight(Find)" });
  });

  test("a compound left empty stands for any element", () => {
    expect(parseSubject("::after")).toMatchObject({ match: "*", pseudo: "::after" });
    expect(parseSubject(".a > ::after")).toMatchObject({ match: ".a > *", pseudo: "::after" });
    expect(parseSubject(".a ::before")).toMatchObject({ match: ".a *", pseudo: "::before" });
  });

  test("leaves what only looks like a pseudo-element alone", () => {
    expect(parseSubject('a[title="::before"]')).toMatchObject({
      match: 'a[title="::before"]',
      pseudo: null,
    });
    expect(parseSubject("a:hover")).toMatchObject({ match: "a:hover", pseudo: null });
    expect(parseSubject(":is(a, b::before)")).toMatchObject({ pseudo: null });
  });

  test("splits a slotted selector into the slot and what is in it", () => {
    expect(parseSubject("slot.x::slotted(.item)")).toEqual({
      match: "slot.x",
      pseudo: null,
      slotted: ".item",
      host: null,
    });
    expect(parseSubject("::slotted(span)")).toMatchObject({ match: "*", slotted: "span" });
    expect(parseSubject("::slotted(span)::before")).toMatchObject({
      match: "*",
      slotted: "span",
      pseudo: "::before",
    });
  });

  test("writes the host alone as a test on the host itself", () => {
    expect(parseSubject(":host").host).toBe(":scope");
    expect(parseSubject(":host(.open):hover").host).toBe(":scope:is(.open):hover");
    expect(parseSubject(":hover:host").host).toBe(":hover:scope");
    expect(parseSubject(":host-context(.dark)").host).toBe(":scope:is(.dark, :is(.dark) *)");
    expect(parseSubject(":host::before")).toMatchObject({ host: ":scope", pseudo: "::before" });
  });

  test("a host with something under it is not about the host", () => {
    expect(parseSubject(":host .x").host).toBeNull();
    expect(parseSubject(":host(.open) > .x").host).toBeNull();
    expect(parseSubject(".x").host).toBeNull();
  });
});

describe("normalizePseudo", () => {
  test("two colons, lower case, brackets kept", () => {
    expect(normalizePseudo("::before")).toBe("::before");
    expect(normalizePseudo(":After")).toBe("::after");
    expect(normalizePseudo("before")).toBe("::before");
    expect(normalizePseudo("::Highlight(Find)")).toBe("::highlight(Find)");
  });
});

describe("resolveNesting", () => {
  test("puts the parent list in for the ampersand", () => {
    expect(resolveNesting("& .b", ".a")).toBe(":is(.a) .b");
    expect(resolveNesting("&:hover", ".a")).toBe(":is(.a):hover");
    expect(resolveNesting(".b &", ".a, .c")).toBe(".b :is(.a, .c)");
    expect(resolveNesting(":is(&, .b) i", ".a")).toBe(":is(:is(.a), .b) i");
    expect(resolveNesting("& + &", ".a")).toBe(":is(.a) + :is(.a)");
  });

  test("a selector without one is relative to the parent", () => {
    expect(resolveNesting(".b", ".a")).toBe(":is(.a) .b");
    expect(resolveNesting("> .b", ".a, .c")).toBe(":is(.a, .c) > .b");
  });

  test("an ampersand in a string or an attribute is text", () => {
    expect(hasNesting('[title="&"]')).toBe(false);
    expect(hasNesting(".a\\&b")).toBe(false);
    expect(resolveNesting('[title="&"]', ".a")).toBe(':is(.a) [title="&"]');
  });

  test("with no parent rule the ampersand is the scoping root", () => {
    expect(resolveNesting("&", null)).toBe(":scope");
    expect(resolveNesting(".x", null)).toBe(".x");
  });
});
