import { describe, expect, test } from "bun:test";
import { markInline } from "../src/engine/owninline";
import { inspect, invalidate } from "../src/styles";
import type {
  InheritedGroup,
  Inspection,
  OwnBlock,
  PseudoGroup,
  RuleBlock,
} from "../src/styles/types";
import {
  as,
  attach,
  broken,
  container,
  element,
  type FakeElement,
  imported,
  keyframes,
  layer,
  layers,
  locked,
  media,
  nested,
  page,
  property,
  rule,
  scope,
  sheet,
  supports,
} from "./styles-cssom";

/** The element's own blocks, as shown. */
function own(found: Inspection): OwnBlock[] {
  return found.blocks.filter((block) => block.kind === "inline" || block.kind === "rule");
}

function rules(found: Inspection): RuleBlock[] {
  return found.blocks.filter((block) => block.kind === "rule");
}

function inherited(found: Inspection): InheritedGroup[] {
  return found.blocks.filter((block) => block.kind === "inherited");
}

function pseudos(found: Inspection): PseudoGroup[] {
  return found.blocks.filter((block) => block.kind === "pseudo");
}

/** A block's name, as a test reads it: its selector, or `style` for the attribute. */
function named(block: OwnBlock): string {
  return block.kind === "inline" ? "style" : block.selectorText;
}

/** Each declaration of a block, by whether it is struck through. */
function struck(block: OwnBlock | undefined): Record<string, boolean> {
  return Object.fromEntries(
    (block?.declarations ?? []).map((declaration) => [declaration.name, declaration.overridden]),
  );
}

/** Every own block's declarations, by the block's name. */
function table(blocks: readonly OwnBlock[]): Record<string, Record<string, boolean>> {
  return Object.fromEntries(blocks.map((block) => [named(block), struck(block)]));
}

describe("an element's own blocks", () => {
  test("come strongest first, the style attribute on top, with the losers struck", () => {
    const doc = page();
    doc.styleSheets = [
      sheet([
        rule("button", "color: green; display: block"),
        rule(".btn", "color: red; padding: 4px"),
        rule("#save", "color: blue"),
        rule(".other", "color: pink"),
      ]),
    ];
    const button = element(doc, "button", {
      attrs: { id: "save", class: "btn  primary" },
      style: "color: black",
      matches: [".btn", "#save", "button"],
    });
    const found = inspect(as(button));
    expect(found.target).toEqual({ label: "button#save.btn.primary", pseudo: null });
    expect(own(found).map(named)).toEqual(["style", "#save", ".btn", "button"]);
    expect(table(own(found))).toEqual({
      style: { color: false },
      "#save": { color: true },
      ".btn": { color: true, padding: false },
      button: { color: true, display: false },
    });
    const [inline, save] = own(found);
    expect(save?.declarations[0]?.overriddenBy).toBe(inline?.id);
    expect(found.skipped).toBe(0);
    expect(found.hidden).toEqual([]);
  });

  test("carry the declarations as written, with what each sets", () => {
    const doc = page();
    doc.styleSheets = [sheet([rule(".a", "margin: 0 auto !important; color: var(--c, red)")])];
    const found = inspect(as(element(doc, "div", { matches: [".a"] })));
    expect(rules(found)[0]?.declarations).toEqual([
      {
        name: "margin",
        value: "0 auto",
        important: true,
        longhands: ["margin-top", "margin-right", "margin-bottom", "margin-left"],
        overridden: false,
        variables: [],
      },
      {
        name: "color",
        value: "var(--c, red)",
        important: false,
        longhands: ["color"],
        overridden: false,
        variables: ["--c"],
      },
    ]);
  });

  test("important wins over the style attribute, and important there over that", () => {
    const doc = page();
    doc.styleSheets = [sheet([rule(".a", "color: red !important; top: 0 !important")])];
    const target = element(doc, "div", {
      style: "color: blue; top: 1px !important",
      matches: [".a"],
    });
    expect(table(own(inspect(as(target))))).toEqual({
      style: { color: true, top: false },
      ".a": { color: false, top: true },
    });
  });

  test("the later rule wins a tie, and the later stylesheet, adopted ones last", () => {
    const doc = page();
    const first = rule(".a", "color: red; top: 0");
    const second = rule(".a", "color: blue");
    const other = rule(".a", "color: green");
    const adopted = rule(".a", "color: gold");
    doc.styleSheets = [sheet([first, second]), sheet([other])];
    const target = element(doc, "div", { matches: [".a"] });
    expect(rules(inspect(as(target))).map((block) => block.rule)).toEqual([
      as2(other),
      as2(second),
      as2(first),
    ]);
    doc.adoptedStyleSheets = [sheet([adopted])];
    const found = rules(inspect(as(target)));
    expect(found[0]?.rule).toBe(as2(adopted));
    expect(found[0]?.origin.sheet).toBe("constructed");
    expect(found.map((block) => block.declarations[0]?.overridden)).toEqual([
      false,
      true,
      true,
      true,
    ]);
  });

  test("a longhand and a shorthand take from each other only what they set", () => {
    const doc = page();
    doc.styleSheets = [
      sheet([
        rule(".a", "margin: 0; padding: 0"),
        rule(".a.b", "margin-top: 4px; padding: 1px"),
        rule(".a.b.c", "border: 1px"),
        rule("[x]", "border-color: red"),
      ]),
    ];
    const target = element(doc, "div", { matches: [".a", ".a.b", ".a.b.c", "[x]"] });
    expect(table(rules(inspect(as(target))))).toEqual({
      ".a.b.c": { border: false },
      ".a.b": { "margin-top": false, padding: false },
      // Three sides of the margin still come from here. The border's color does not.
      "[x]": { "border-color": true },
      ".a": { margin: false, padding: true },
    });
  });

  test("say which selectors of a list match, and take the heaviest of those", () => {
    const doc = page();
    doc.styleSheets = [sheet([rule(".a, .b, #c", "color: red"), rule("#d, .e", "color: blue")])];
    const target = element(doc, "div", { matches: [".a", "#c"] });
    const found = rules(inspect(as(target)));
    expect(found).toHaveLength(1);
    expect(found[0]?.selector).toEqual([
      { text: ".a", matches: true },
      { text: ".b", matches: false },
      { text: "#c", matches: true },
    ]);
    expect(found[0]?.specificity).toEqual([1, 0, 0]);
  });

  test("a list's specificity is not that of a selector that does not match", () => {
    const doc = page();
    doc.styleSheets = [sheet([rule(".a, #c", "color: red"), rule(".a.b", "color: blue")])];
    const target = element(doc, "div", { matches: [".a", ".a.b"] });
    const found = rules(inspect(as(target)));
    expect(found.map(named)).toEqual([".a.b", ".a, #c"]);
    expect(found[1]?.specificity).toEqual([0, 1, 0]);
  });

  test("say where each rule is", () => {
    const doc = page(["screen"]);
    const link = element(doc, "link", { attrs: { id: "theme" } });
    doc.styleSheets = [
      sheet([rule(".z", ""), media("screen", [rule(".z", ""), rule(".a", "color: red")])], {
        href: "https://site.test/theme.css",
        owner: link,
      }),
      sheet([rule(".a", "top: 0")], { owner: element(doc, "style") }),
    ];
    const found = rules(inspect(as(element(doc, "div", { matches: [".a"] }))));
    expect(found.map((block) => block.origin)).toEqual([
      { sheet: "<style>", owner: "style", path: [0] },
      { sheet: "https://site.test/theme.css", owner: "link#theme", path: [1, 1] },
    ]);
  });
});

/** A fake rule as the live rule a block hands out. */
function as2(fake: object): RuleBlock["rule"] {
  return fake as unknown as RuleBlock["rule"];
}

describe("conditions around a rule", () => {
  test("a media query or a supports condition that does not hold leaves the rule out", () => {
    const doc = page(["(min-width: 600px)", "(display: grid)"]);
    doc.styleSheets = [
      sheet([
        media("(min-width: 600px)", [
          rule(".a", "color: red"),
          supports("(display: grid)", [rule(".a", "top: 0")]),
          supports("(display: nope)", [rule(".a", "left: 0")]),
        ]),
        media("print", [rule(".a", "color: blue"), supports("(display: grid)", [rule(".a", "")])]),
      ]),
    ];
    const found = rules(inspect(as(element(doc, "div", { matches: [".a"] }))));
    expect(found.map((block) => [struck(block), block.context])).toEqual([
      [{ top: false }, ["@media (min-width: 600px)", "@supports (display: grid)"]],
      [{ color: false }, ["@media (min-width: 600px)"]],
    ]);
  });

  test("a stylesheet's own media counts, and a disabled stylesheet does not", () => {
    const doc = page(["screen"]);
    doc.styleSheets = [
      sheet([rule(".a", "color: red")], { media: "screen" }),
      sheet([rule(".a", "color: blue")], { media: "print" }),
      sheet([rule(".a", "color: green")], { disabled: true }),
    ];
    const found = rules(inspect(as(element(doc, "div", { matches: [".a"] }))));
    expect(found.map((block) => [struck(block), block.context])).toEqual([
      [{ color: false }, ["@media screen"]],
    ]);
  });

  test("an import brings its stylesheet in under its layer, supports and media", () => {
    const doc = page(["screen", "(display: grid)"]);
    const base = sheet([rule("#a", "color: red")], { href: "https://site.test/base.css" });
    const print = sheet([rule("#a", "color: gold")], { href: "https://site.test/print.css" });
    doc.styleSheets = [
      sheet([
        imported(base, { layer: "base", supports: "(display: grid)", media: "screen" }),
        imported(print, { media: "print" }),
        imported(null),
        rule(".a", "color: blue"),
      ]),
    ];
    const found = rules(inspect(as(element(doc, "div", { matches: [".a", "#a"] }))));
    // The unlayered class wins over the id in a layer.
    expect(found.map(named)).toEqual([".a", "#a"]);
    expect(found[1]?.context).toEqual(["@layer base", "@supports (display: grid)", "@media screen"]);
    expect(found[1]?.origin).toEqual({
      sheet: "https://site.test/base.css",
      owner: null,
      path: [0, 0],
    });
    expect(struck(found[1])).toEqual({ color: true });
  });

  test("each query is asked of the window once", () => {
    const doc = page(["screen"]);
    doc.styleSheets = [
      sheet([
        media("screen", [rule(".a", ""), rule(".b", "")]),
        media("screen", [rule(".a", "")]),
        media("print", [rule(".a", "")]),
      ]),
    ];
    inspect(as(element(doc, "div", { matches: [".a"] }, [])));
    expect(doc.mediaCalls.sort()).toEqual(["print", "screen"]);
  });

  test("the window is the element's own, as a page in the device frame has another", () => {
    const wide = page(["(min-width: 600px)"]);
    const narrow = page();
    const shared = [sheet([media("(min-width: 600px)", [rule(".a", "color: red")])])];
    wide.styleSheets = shared;
    narrow.styleSheets = shared;
    expect(rules(inspect(as(element(wide, "div", { matches: [".a"] }))))).toHaveLength(1);
    expect(rules(inspect(as(element(narrow, "div", { matches: [".a"] }))))).toHaveLength(0);
  });
});

describe("layers", () => {
  test("rank by the order a statement names them, whatever order their blocks come in", () => {
    const doc = page();
    doc.styleSheets = [
      sheet([
        layers("base", "theme"),
        layer("theme", [rule(".x", "color: red")]),
        layer("base", [rule("#x", "color: blue; top: 0")]),
        rule("*", "top: 1px"),
      ]),
    ];
    const target = element(doc, "div", { matches: [".x", "#x", "*"] });
    const found = rules(inspect(as(target)));
    expect(table(found)).toEqual({
      "*": { top: false },
      ".x": { color: false },
      "#x": { color: true, top: true },
    });
    expect(found.map((block) => block.context)).toEqual([[], ["@layer theme"], ["@layer base"]]);
  });

  test("turn round for important: the earlier layer wins, and unlayered loses", () => {
    const doc = page();
    doc.styleSheets = [
      sheet([
        layer("base", [rule(".x", "color: blue !important")]),
        layer("theme", [rule("#x", "color: red !important")]),
        rule("#x.x", "color: green !important"),
      ]),
    ];
    const target = element(doc, "div", { matches: [".x", "#x", "#x.x"] });
    expect(table(rules(inspect(as(target))))).toEqual({
      "#x.x": { color: true },
      "#x": { color: true },
      ".x": { color: false },
    });
  });

  test("a layer's own rules win over the layers in it, dotted or nested", () => {
    const doc = page();
    doc.styleSheets = [
      sheet([
        layer("a", [rule(".x", "color: red"), layer("b", [rule("#x", "color: blue; top: 0")])]),
        layer("a.b", [rule(".x", "top: 1px")]),
        layer("a.c", [rule(".x", "left: 0")]),
      ]),
    ];
    const target = element(doc, "div", { matches: [".x", "#x"] });
    const found = rules(inspect(as(target)));
    expect(found.map((block) => [block.context.join(" "), struck(block)])).toEqual([
      ["@layer a", { color: false }],
      ["@layer a.c", { left: false }],
      // In the one layer `a.b` the id wins over the class.
      ["@layer a @layer b", { color: true, top: false }],
      ["@layer a.b", { top: true }],
    ]);
  });

  test("each layer without a name is its own, the later one winning", () => {
    const doc = page();
    doc.styleSheets = [
      sheet([layer("", [rule("#x", "color: red")]), layer("", [rule(".x", "color: blue")])]),
    ];
    const target = element(doc, "div", { matches: [".x", "#x"] });
    const found = rules(inspect(as(target)));
    expect(found.map(named)).toEqual([".x", "#x"]);
    expect(found.map((block) => block.context)).toEqual([["@layer"], ["@layer"]]);
  });

  test("a layer first named in a media query that does not hold is not placed there", () => {
    const doc = page();
    doc.styleSheets = [
      sheet([
        media("print", [layers("late")]),
        layer("early", [rule("#x", "color: red")]),
        layer("late", [rule(".x", "color: blue")]),
      ]),
    ];
    const target = element(doc, "div", { matches: [".x", "#x"] });
    expect(rules(inspect(as(target))).map(named)).toEqual([".x", "#x"]);
    doc.holds.add("print");
    expect(rules(inspect(as(target))).map(named)).toEqual(["#x", ".x"]);
  });
});

describe("nesting", () => {
  function nestedPage() {
    const doc = page(["(min-width: 600px)"]);
    doc.styleSheets = [
      sheet([
        rule(".card, #main", "color: red", [
          rule("& .title", "color: blue"),
          rule(".title", "top: 0"),
          rule("> .title, & > b", "left: 0"),
          media("(min-width: 600px)", [nested("right: 0"), rule("&.big", "bottom: 0")]),
          nested("margin-top: 0"),
        ]),
      ]),
    ];
    return doc;
  }

  test("a nested rule's selector is resolved against its parent's", () => {
    const doc = nestedPage();
    const title = element(doc, "h2", {
      matches: [":is(.card, #main) .title", ":is(.card, #main) > .title"],
    });
    const found = rules(inspect(as(title)));
    expect(found.map((block) => [block.selectorText, block.context, block.specificity])).toEqual([
      ["> .title, & > b", [".card, #main"], [1, 1, 0]],
      [".title", [".card, #main"], [1, 1, 0]],
      ["& .title", [".card, #main"], [1, 1, 0]],
    ]);
    expect(found[0]?.selector).toEqual([
      { text: "> .title", matches: true },
      { text: "& > b", matches: false },
    ]);
    expect(found[0]?.origin.path).toEqual([0, 2]);
  });

  test("declarations after a nested rule, and in a nested media query, are the parent's own", () => {
    const doc = nestedPage();
    const card = element(doc, "div", { matches: [".card", ":is(.card, #main)"] });
    const found = rules(inspect(as(card)));
    expect(found.map((block) => [block.selectorText, block.context, struck(block)])).toEqual([
      ["&", [".card, #main"], { "margin-top": false }],
      ["&", [".card, #main", "@media (min-width: 600px)"], { right: false }],
      [".card, #main", [], { color: false }],
    ]);
    // `&` weighs as the parent list's heaviest selector, whichever of them matched.
    expect(found[0]?.specificity).toEqual([1, 0, 0]);
    expect(found[2]?.specificity).toEqual([0, 1, 0]);
  });
});

describe("what ancestors hand down", () => {
  function family() {
    const doc = page();
    const span = element(doc, "span", { matches: ["span"] });
    const card = element(doc, "div", { attrs: { class: "card" }, matches: [".card"] }, [span]);
    const body = element(doc, "body", { style: "cursor: pointer; top: 0", matches: ["body"] }, [
      card,
    ]);
    const html = element(doc, "html", {}, [body]);
    return { doc, span, card, body, html };
  }

  test("only inherited properties, grouped by ancestor, nearest first", () => {
    const { doc, span, card } = family();
    doc.styleSheets = [
      sheet([
        rule("body", "color: black; margin: 0; --brand: red; font: 12px serif"),
        rule(".card", "color: navy; padding: 4px; --gap: 2px"),
        rule("span", "font-size: 10px; background-color: var(--brand)"),
        rule("body", "display: block"),
      ]),
    ];
    const found = inspect(as(span));
    expect(table(own(found))).toEqual({ span: { "font-size": false, "background-color": false } });
    const groups = inherited(found);
    expect(groups.map((group) => group.from)).toEqual(["div.card", "body"]);
    expect(groups.map((group) => table(group.blocks))).toEqual([
      { ".card": { color: false, "--gap": false } },
      {
        style: { cursor: false },
        // The card took the color. The font still hands down all but its size.
        body: { color: true, "--brand": false, font: false },
      },
    ]);
    const cardBlock = groups[0]?.blocks[0];
    expect(groups[1]?.blocks[1]?.declarations[0]?.overriddenBy).toBe(cardBlock?.id);
    expect(groups[0]?.element).toBe(as(card));
  });

  test("what the element sets itself strikes the same property further up", () => {
    const { doc, span } = family();
    doc.styleSheets = [
      sheet([rule("body", "color: black; font: 12px serif"), rule("span", "color: red; font: 1px a")]),
    ];
    const found = inspect(as(span));
    const spanBlock = own(found)[0];
    const bodyBlock = inherited(found)[0]?.blocks.find((block) => block.kind === "rule");
    expect(struck(bodyBlock)).toEqual({ color: true, font: true });
    expect(bodyBlock?.declarations.map((entry) => entry.overriddenBy)).toEqual([
      spanBlock?.id,
      spanBlock?.id,
    ]);
  });

  test("an ancestor's own cascade decides which of its declarations it hands down", () => {
    const { doc, span } = family();
    doc.styleSheets = [
      sheet([rule("body", "color: black !important"), rule("body", "color: gray; --x: 1")]),
    ];
    const group = inherited(inspect(as(span)))[0];
    expect(group?.blocks.map((block) => struck(block))).toEqual([
      { cursor: false },
      { color: true, "--x": false },
      { color: false },
    ]);
  });

  test("a custom property registered as not inherited is not handed down", () => {
    const { doc, span } = family();
    doc.styleSheets = [
      sheet([property("--gap", false), rule(".card", "--gap: 2px; --tone: dark")]),
    ];
    expect(inherited(inspect(as(span))).map((group) => table(group.blocks))).toEqual([
      { ".card": { "--tone": false } },
      { style: { cursor: false } },
    ]);
  });

  test("an ancestor with nothing to hand down has no group", () => {
    const { doc, span, body } = family();
    body.style.cssText = "";
    doc.styleSheets = [sheet([rule("body", "margin: 0"), rule(".card", "display: flex")])];
    expect(inherited(inspect(as(span)))).toEqual([]);
  });

  test("rules with nothing to hand down are not matched against ancestors", () => {
    const { doc, span, card } = family();
    doc.styleSheets = [sheet([rule(".card", "padding: 0"), rule("div", "color: red")])];
    inspect(as(span));
    expect(card.asked).toEqual(["div"]);
  });
});

describe("variables", () => {
  test("give what the element sees and the block that defines it", () => {
    const doc = page();
    const target = element(doc, "p", { matches: ["p"] });
    element(doc, "body", { matches: ["body"] }, [target]);
    doc.styleSheets = [
      sheet([
        rule("body", "--brand: red; --tone: var(--brand)"),
        rule("p", "color: var(--tone, var(--missing)); --local: 4px; top: var(--local)"),
        rule("p", "top: 0; left: var(--unused)"),
      ]),
    ];
    doc.computed.set(target, { "--tone": " red", "--brand": "red", "--local": "4px" });
    const found = inspect(as(target));
    const [later, first] = rules(found);
    const body = inherited(found)[0]?.blocks[0];
    expect(found.variables).toEqual({
      "--unused": { value: "", definedIn: null },
      "--tone": { value: "red", definedIn: body?.id ?? -1 },
      "--missing": { value: "", definedIn: null },
      // Read only by a declaration that leads to one that won.
      "--brand": { value: "red", definedIn: body?.id ?? -1 },
    });
    expect(struck(first)).toEqual({ color: false, "--local": false, top: true });
    expect(later?.declarations[1]?.variables).toEqual(["--unused"]);
    expect(doc.computedCalls).toEqual([{ element: target, pseudo: null }]);
  });

  test("the element's own definition is the one named", () => {
    const doc = page();
    const target = element(doc, "p", { style: "--gap: 1px", matches: ["p"] });
    element(doc, "body", { matches: ["body"] }, [target]);
    doc.styleSheets = [
      sheet([rule("body", "--gap: 9px"), rule("p", "--gap: 2px !important; margin: var(--gap)")]),
    ];
    doc.computed.set(target, { "--gap": "2px" });
    const found = inspect(as(target));
    expect(found.variables).toEqual({ "--gap": { value: "2px", definedIn: rules(found)[0]?.id ?? -1 } });
  });

  test("no computed style is read where nothing needs one", () => {
    const doc = page();
    doc.styleSheets = [sheet([rule("p", "color: red")])];
    inspect(as(element(doc, "p", { matches: ["p"] })));
    expect(doc.computedCalls).toEqual([]);
  });
});

describe("pseudo-elements", () => {
  function withPseudos() {
    const doc = page();
    doc.styleSheets = [
      sheet([
        rule(".a, .a::before", "color: red"),
        rule(".a:hover::after", "content: 'x'"),
        rule(".a:before", "color: blue; content: var(--c)"),
        rule("::selection", "color: pink"),
        rule("body", "color: black"),
      ]),
    ];
    const target = element(doc, "div", { attrs: { class: "a" }, matches: [".a", "*"] });
    element(doc, "body", { matches: ["body"] }, [target]);
    return { doc, target };
  }

  test("show under the element's own rules, each with a cascade of its own", () => {
    const { target } = withPseudos();
    const found = inspect(as(target));
    expect(rules(found).map((block) => block.selector)).toEqual([
      [
        { text: ".a", matches: true },
        { text: ".a::before", matches: false },
      ],
    ]);
    const groups = pseudos(found);
    expect(groups.map((group) => group.pseudo)).toEqual(["::before"]);
    expect(groups[0]?.blocks.map((block) => [block.selectorText, struck(block)])).toEqual([
      [".a:before", { color: false, content: false }],
      [".a, .a::before", { color: true }],
    ]);
    expect(groups[0]?.blocks[1]?.selector.map((part) => part.matches)).toEqual([false, true]);
    expect(groups[0]?.blocks[0]?.specificity).toEqual([0, 1, 1]);
    // The element's own rule is live for the element, struck only in the pseudo's group.
    expect(struck(rules(found)[0])).toEqual({ color: false });
    expect(found.blocks.map((block) => block.kind)).toEqual(["rule", "pseudo", "inherited"]);
  });

  test("one asked for by name is the target, and inherits from its element first", () => {
    const { doc, target } = withPseudos();
    doc.computed.set(target, { "--c": '"hi"' });
    const found = inspect(as(target), ":before");
    expect(found.target).toEqual({ label: "div.a", pseudo: "::before" });
    expect(rules(found).map(named)).toEqual([".a:before", ".a, .a::before"]);
    expect(pseudos(found)).toEqual([]);
    expect(inherited(found).map((group) => [group.from, table(group.blocks)])).toEqual([
      ["div.a", { ".a, .a::before": { color: true } }],
      ["body", { body: { color: true } }],
    ]);
    expect(found.variables).toEqual({ "--c": { value: '"hi"', definedIn: null } });
    expect(doc.computedCalls).toEqual([{ element: target, pseudo: "::before" }]);
  });

  test("one that no rule styles has no group", () => {
    const doc = page();
    doc.styleSheets = [sheet([rule(".a", "color: red")])];
    const found = inspect(as(element(doc, "div", { matches: [".a"] })));
    expect(pseudos(found)).toEqual([]);
    expect(own(inspect(as(element(doc, "div", { matches: [".a"] })), "::after"))).toEqual([]);
  });
});

describe("shadow trees", () => {
  function card() {
    const doc = page();
    doc.styleSheets = [sheet([rule(".x", "color: red"), rule("my-card", "color: blue; top: 0")])];
    const host = element(doc, "my-card", {
      matches: ["my-card", ":scope", ":scope:is(.open)"],
    });
    const inner = element(doc, "p", { matches: [".x", ":host .x"] });
    attach(
      host,
      [inner],
      [
        sheet([
          rule(".x", "color: green"),
          rule(":host", "color: purple; display: block; top: 5px !important"),
          rule(":host(.open)", "left: 0"),
          rule(":host(.closed)", "right: 0"),
          rule(":host .x", "bottom: 0"),
          rule(":host::before", "content: ''"),
        ]),
      ],
    );
    return { doc, host, inner };
  }

  test("an element gets the rules of its own tree, not the document's", () => {
    const { inner } = card();
    const found = inspect(as(inner));
    expect(table(rules(found))).toEqual({
      ":host .x": { bottom: false },
      ".x": { color: false },
    });
    expect(rules(found)[1]?.declarations[0]?.value).toBe("green");
  });

  test("a host gets its shadow root's host rules, under those from outside", () => {
    const { host } = card();
    const found = inspect(as(host));
    expect(rules(found).map((block) => [block.selectorText, block.specificity, struck(block)])).toEqual([
      ["my-card", [0, 0, 1], { color: false, top: true }],
      [":host(.open)", [0, 2, 0], { left: false }],
      // Outside wins the color with one type selector. Inside wins the top once important.
      [":host", [0, 1, 0], { color: true, display: false, top: false }],
    ]);
    expect(pseudos(found).map((group) => group.blocks.map(named))).toEqual([[":host::before"]]);
  });

  test("an important host rule wins over the host's own important style attribute", () => {
    const { host } = card();
    host.style.cssText = "top: 9px !important; display: none";
    expect(table(own(inspect(as(host))))).toMatchObject({
      style: { top: true, display: false },
      ":host": { color: true, display: true, top: false },
    });
  });

  test("inheritance goes up through the host", () => {
    const { inner } = card();
    expect(inherited(inspect(as(inner))).map((group) => [group.from, table(group.blocks)])).toEqual([
      ["my-card", { "my-card": { color: true }, ":host": { color: true } }],
    ]);
    const { doc, inner: deep } = card();
    doc.styleSheets = [sheet([rule("my-card", "cursor: help")])];
    // With no color of its own, the host's is the one handed down.
    deep.yes.delete(".x");
    expect(inherited(inspect(as(deep))).map((group) => table(group.blocks))).toEqual([
      { "my-card": { cursor: false }, ":host": { color: false } },
    ]);
  });

  test("a slotted element gets the slotted rules, under its own tree's, and inherits through the slot", () => {
    const doc = page();
    doc.styleSheets = [sheet([rule("li", "color: blue")])];
    const item = element(doc, "li", { matches: [".item", "li"] });
    const host = element(doc, "my-list", {}, [item]);
    const slot = element(doc, "slot", { matches: ["*", "slot", "slot.main"] });
    const wrap = element(doc, "ul", { matches: ["ul"] }, [slot]);
    item.assignedSlot = slot;
    attach(
      host,
      [wrap],
      [
        sheet([
          rule("::slotted(.item)", "color: red; top: 0"),
          rule("slot.main::slotted(li)", "left: 0"),
          rule("slot.other::slotted(li)", "right: 0"),
          rule("::slotted(.nope)", "bottom: 0"),
          rule("slot", "font-size: 9px"),
          rule("ul", "cursor: help; margin: 0"),
          rule("li", "color: gold"),
        ]),
      ],
    );
    const found = inspect(as(item));
    expect(rules(found).map((block) => [block.selectorText, block.specificity, struck(block)])).toEqual([
      ["li", [0, 0, 1], { color: false }],
      ["slot.main::slotted(li)", [0, 1, 3], { left: false }],
      ["::slotted(.item)", [0, 1, 1], { color: true, top: false }],
    ]);
    expect(inherited(found).map((group) => [group.from, table(group.blocks)])).toEqual([
      ["slot", { slot: { "font-size": false } }],
      ["ul", { ul: { cursor: false } }],
    ]);
  });
});

describe("container queries and scopes", () => {
  function inContainers(display: string) {
    const doc = page();
    doc.styleSheets = [
      sheet([
        rule(".a", "display: block"),
        container("(min-width: 400px)", [rule(".a", "display: none")]),
        container("sidebar (min-width: 1px)", [rule(".a", "color: red")]),
      ]),
    ];
    const target = element(doc, "div", { matches: [".a"] });
    doc.computed.set(target, { display });
    return { doc, found: rules(inspect(as(target))) };
  }

  test("a rule in a container query is marked, as the query cannot be evaluated", () => {
    const { found } = inContainers("block");
    expect(found.map((block) => [block.context, block.conditional, struck(block)])).toEqual([
      [["@container sidebar (min-width: 1px)"], { kind: "container", confirmed: false }, { color: false }],
      [[], undefined, { display: false }],
    ]);
  });

  test("one the computed style shows to apply is confirmed, and wins", () => {
    const { doc, found } = inContainers("none");
    expect(found.map((block) => [block.conditional?.confirmed, struck(block)])).toEqual([
      [false, { color: false }],
      [true, { display: false }],
      [undefined, { display: true }],
    ]);
    expect(doc.computedCalls).toHaveLength(1);
  });

  test("a scoped rule reaches only what is under its root and above its limit", () => {
    const doc = page();
    doc.styleSheets = [
      sheet([
        scope(".card", ".content", [rule("img", "top: 0"), rule(":scope > p, & > i", "left: 0")]),
        scope(".card", null, [rule("img", "right: 0")]),
      ]),
    ];
    const deep = element(doc, "img", { matches: ["img"] });
    const content = element(doc, "div", { matches: [".content"] }, [deep]);
    const direct = element(doc, "img", { matches: ["img"] });
    const text = element(doc, "p", { matches: [":is(.card) > p"] });
    element(doc, "div", { matches: [".card"] }, [content, direct, text]);
    const outside = element(doc, "img", { matches: ["img"] });
    element(doc, "div", {}, [outside]);

    const found = rules(inspect(as(direct)));
    expect(found.map((block) => [block.context, block.conditional, struck(block)])).toEqual([
      [["@scope (.card)"], { kind: "scope", confirmed: false }, { right: false }],
      [["@scope (.card) to (.content)"], { kind: "scope", confirmed: false }, { top: false }],
    ]);
    expect(rules(inspect(as(deep))).map((block) => struck(block))).toEqual([{ right: false }]);
    expect(rules(inspect(as(outside)))).toEqual([]);
    expect(rules(inspect(as(text))).map(named)).toEqual([":scope > p, & > i"]);
  });
});

describe("what cannot be read", () => {
  test("a stylesheet from another origin is reported, not guessed at", () => {
    const doc = page();
    doc.styleSheets = [
      locked("https://cdn.test/a.css"),
      sheet([imported(locked("https://cdn.test/b.css", "InvalidAccessError")), rule(".a", "top: 0")]),
    ];
    const found = inspect(as(element(doc, "div", { matches: [".a"] })));
    expect(found.hidden).toEqual([
      { sheet: "https://cdn.test/a.css", reason: "cross-origin" },
      { sheet: "https://cdn.test/b.css", reason: "unreadable" },
    ]);
    expect(rules(found).map(named)).toEqual([".a"]);
    expect(found.skipped).toBe(0);
  });

  test("a selector that throws is left out and counted, and the rest stands", () => {
    const doc = page();
    doc.styleSheets = [
      sheet([
        rule(":unknown(x)", "color: red"),
        rule(":unknown(x), .a", "color: blue"),
        rule(".a", "top: 0"),
      ]),
    ];
    const target = element(doc, "div", { matches: [".a"], throws: [":unknown(x)"] });
    const found = inspect(as(target));
    expect(rules(found).map((block) => [named(block), block.selector.map((part) => part.matches)])).toEqual([
      [".a", [true]],
      [":unknown(x), .a", [false, true]],
    ]);
    expect(found.skipped).toBe(2);
  });

  test("a rule that throws as it is read is left out and counted", () => {
    const doc = page();
    doc.styleSheets = [
      sheet([broken(), rule(".a", "top: 0"), keyframes("spin", [rule(".a", "color: red")])]),
    ];
    const found = inspect(as(element(doc, "div", { matches: [".a"] })));
    expect(rules(found).map(named)).toEqual([".a"]);
    expect(found.skipped).toBe(1);
  });
});

describe("devknobs' own styles", () => {
  test("are left out, whether its style element or one in its shadow roots brought them", () => {
    const doc = page();
    const cursor = element(doc, "style", { attrs: { "data-devknobs": "grab-cursor" } });
    const panel = element(doc, "div", { attrs: { "data-devknobs": "panel" } });
    const inPanel = element(doc, "style");
    attach(panel, [inPanel], []);
    doc.styleSheets = [
      sheet([rule("*", "cursor: crosshair !important")], { owner: cursor }),
      sheet([rule("*", "all: initial")], { owner: inPanel }),
      sheet([rule("*", "color: red")], { owner: element(doc, "style") }),
    ];
    const target = element(doc, "p", { matches: ["*"] });
    element(doc, "body", { matches: ["*"] }, [target]);
    const found = inspect(as(target));
    expect(table(rules(found))).toEqual({ "*": { color: false } });
    expect(inherited(found).map((group) => table(group.blocks))).toEqual([{ "*": { color: true } }]);
  });

  test("its own elements are not inspected", () => {
    const doc = page();
    doc.styleSheets = [sheet([rule("*", "color: red")])];
    const row = element(doc, "button", { style: "top: 0", matches: ["*"] });
    const panel = element(doc, "div", { attrs: { "data-devknobs": "panel" }, matches: ["*"] });
    attach(panel, [row], [sheet([rule("*", "color: blue")])]);
    expect(inspect(as(row)).blocks).toEqual([]);
    expect(inspect(as(panel)).blocks).toEqual([]);
    expect(row.asked).toEqual([]);
  });
});

describe("the flattened rules", () => {
  function counted(target: FakeElement): number {
    return rules(inspect(as(target))).length;
  }

  test("are kept until a stylesheet comes, goes, is switched off or changes at the top", () => {
    const doc = page(["screen"]);
    const inner = media("screen", [rule(".a", "color: red")]);
    const first = sheet([inner]);
    doc.styleSheets = [first];
    const target = element(doc, "div", { matches: [".a"] });
    expect(counted(target)).toBe(1);

    // A rule put deep in a stylesheet is not seen until told.
    inner.cssRules.push(rule(".a", "top: 0"));
    expect(counted(target)).toBe(1);
    invalidate();
    expect(counted(target)).toBe(2);

    first.cssRules.push(rule(".a", "left: 0"));
    expect(counted(target)).toBe(3);
    const second = sheet([rule(".a", "right: 0")]);
    doc.styleSheets = [first, second];
    expect(counted(target)).toBe(4);
    second.disabled = true;
    expect(counted(target)).toBe(3);
    doc.styleSheets = [];
    expect(counted(target)).toBe(0);
  });

  test("each selector is matched once for an element", () => {
    const doc = page();
    doc.styleSheets = [
      sheet([rule(".a", "color: red"), rule(".b, .c", "top: 0"), rule(".a::before", "left: 0")]),
    ];
    const target = element(doc, "div", { matches: [".a"] });
    inspect(as(target));
    expect(target.asked).toEqual([".a", ".b", ".c", ".a"]);
  });
});

describe("what a knob of devknobs wrote in a style attribute", () => {
  /** A page whose html has the inline style, a body and a paragraph in it. */
  function rooted(style: string) {
    const doc = page();
    const p = element(doc, "p");
    const html = element(doc, "html", { style }, [element(doc, "body", {}, [p])]);
    return { html, p };
  }

  test("the text size knob's root size is not the page's: not on html, not handed down", () => {
    const { html, p } = rooted("font-size: 20px !important; color: red");
    markInline(html, "font-size", "20px");
    expect(table(own(inspect(as(html))))).toEqual({ style: { color: false } });
    expect(inherited(inspect(as(p))).map((group) => [group.from, table(group.blocks)])).toEqual([
      ["html", { style: { color: false } }],
    ]);
  });

  test("the scheme knob's color-scheme is not the page's: not on html, not handed down", () => {
    const { html, p } = rooted("color-scheme: dark; color: red");
    markInline(html, "color-scheme", "dark");
    expect(table(own(inspect(as(html))))).toEqual({ style: { color: false } });
    expect(inherited(inspect(as(p))).map((group) => [group.from, table(group.blocks)])).toEqual([
      ["html", { style: { color: false } }],
    ]);
  });

  test("with nothing else in the attribute, html shows no style block and hands nothing down", () => {
    const { html, p } = rooted("font-size: 20px !important; color-scheme: dark");
    markInline(html, "font-size", "20px");
    markInline(html, "color-scheme", "dark");
    expect(own(inspect(as(html)))).toEqual([]);
    expect(inherited(inspect(as(p)))).toEqual([]);
  });

  test("the page's own rule for the property is then the one in force", () => {
    const doc = page();
    doc.styleSheets = [sheet([rule("html", "font-size: 62.5%")])];
    const html = element(doc, "html", { style: "font-size: 12.5px !important", matches: ["html"] });
    markInline(html, "font-size", "12.5px");
    expect(table(own(inspect(as(html))))).toEqual({ html: { "font-size": false } });
  });

  test("shows again once the knob is off, or the page wrote its own over it", () => {
    const { html } = rooted("font-size: 18px; color-scheme: dark");
    // The page wrote 18px over the knob's 20px, and the scheme knob went back to system.
    markInline(html, "font-size", "20px");
    markInline(html, "color-scheme", "dark");
    markInline(html, "color-scheme", null);
    expect(table(own(inspect(as(html))))).toEqual({
      style: { "font-size": false, "color-scheme": false },
    });
  });

  test("only on the element the knob wrote on", () => {
    const { html, p } = rooted("color: red");
    markInline(html, "font-size", "20px");
    p.style.cssText = "font-size: 20px";
    expect(table(own(inspect(as(p))))).toEqual({ style: { "font-size": false } });
  });
});
