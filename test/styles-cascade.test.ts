import { describe, expect, test } from "bun:test";
import {
  byStrength,
  type Candidate,
  compare,
  markOwn,
  settleContainers,
  settleInherited,
  type Source,
  winners,
} from "../src/styles/cascade";
import { type Condition, layerRanks } from "../src/styles/collect";
import type { StyleDeclaration } from "../src/styles/types";

/** Unlayered styles' place, over every layer's in these tests. */
const UNLAYERED = 9;

function source(over: Partial<Source> = {}): Source {
  return { context: 0, inline: false, layer: UNLAYERED, specificity: [0, 1, 0], order: 0, ...over };
}

function declaration(text: string, longhands?: string[]): StyleDeclaration {
  const [name = "", rest = ""] = text.split(":").map((piece) => piece.trim());
  const important = rest.endsWith("!important");
  return {
    name,
    value: important ? rest.slice(0, -"!important".length).trim() : rest,
    important,
    longhands: longhands ?? [name],
    overridden: false,
    variables: [],
  };
}

let ids = 0;

function candidate(over: Partial<Source>, ...declarations: StyleDeclaration[]): Candidate {
  const self: Candidate = {
    id: ids++,
    source: source(over),
    declarations,
    value: (longhand) =>
      self.declarations.find((entry) => entry.longhands.includes(longhand))?.value ?? "",
  };
  return self;
}

/** Does `a` win over `b`, both normal or both important? */
function wins(a: Partial<Source>, b: Partial<Source>, important = false): boolean {
  const forward = compare(source(a), important, source(b), important);
  const back = compare(source(b), important, source(a), important);
  expect(Math.sign(forward)).toBe(-Math.sign(back));
  return forward > 0;
}

describe("compare", () => {
  test("important wins over normal, whatever else", () => {
    const weak = source({ specificity: [0, 0, 1], layer: 0 });
    const strong = source({ inline: true, specificity: [9, 9, 9], order: 99 });
    expect(compare(weak, true, strong, false)).toBeGreaterThan(0);
    expect(compare(strong, false, weak, true)).toBeLessThan(0);
  });

  test("the style attribute wins over any rule of the same importance", () => {
    expect(wins({ inline: true, specificity: [0, 0, 0] }, { specificity: [9, 9, 9] })).toBe(true);
    expect(wins({ inline: true, specificity: [0, 0, 0] }, { specificity: [9, 9, 9] }, true)).toBe(true);
  });

  test("unlayered wins over layered, and a later layer over an earlier", () => {
    expect(wins({ layer: UNLAYERED, specificity: [0, 0, 1] }, { layer: 1, specificity: [9, 0, 0] })).toBe(true);
    expect(wins({ layer: 2, specificity: [0, 0, 1] }, { layer: 1, specificity: [9, 0, 0] })).toBe(true);
  });

  test("once important, the earlier layer wins, and layered over unlayered", () => {
    expect(wins({ layer: 1, specificity: [0, 0, 1] }, { layer: 2, specificity: [9, 0, 0] }, true)).toBe(true);
    expect(wins({ layer: 1 }, { layer: UNLAYERED, specificity: [9, 0, 0] }, true)).toBe(true);
  });

  test("the style attribute wins over layers both ways", () => {
    expect(wins({ inline: true, layer: 0 }, { layer: UNLAYERED })).toBe(true);
    expect(wins({ inline: true, layer: UNLAYERED }, { layer: 0 }, true)).toBe(true);
  });

  test("specificity decides in one layer, then order", () => {
    expect(wins({ specificity: [1, 0, 0], order: 0 }, { specificity: [0, 9, 9], order: 5 })).toBe(true);
    expect(wins({ specificity: [0, 1, 0], order: 5 }, { specificity: [0, 1, 0], order: 4 })).toBe(true);
    expect(wins({ specificity: [0, 1, 0], order: 5 }, { specificity: [0, 1, 0], order: 4 }, true)).toBe(true);
  });

  test("the outer tree wins over a shadow tree inside, and the inner one once important", () => {
    expect(wins({ context: 0, specificity: [0, 0, 1] }, { context: 1, specificity: [9, 0, 0] })).toBe(true);
    expect(wins({ context: 1, specificity: [0, 0, 1] }, { context: 0, specificity: [9, 0, 0] }, true)).toBe(true);
    // An important `:host` rule wins over the host's own important style attribute.
    expect(wins({ context: 1 }, { context: 0, inline: true }, true)).toBe(true);
    expect(wins({ context: 0, inline: true }, { context: 1 })).toBe(true);
  });

  test("equal sources tie", () => {
    expect(compare(source(), false, source(), false)).toBe(0);
  });
});

describe("winners and markOwn", () => {
  test("a longhand over a shorthand strikes neither while the shorthand keeps a side", () => {
    const margin = declaration("margin: 0", ["margin-top", "margin-right"]);
    const top = declaration("margin-top: 4px");
    const weak = candidate({ specificity: [0, 1, 0] }, margin);
    const strong = candidate({ specificity: [0, 2, 0] }, top);
    markOwn([weak, strong], winners([weak, strong]));
    expect(margin.overridden).toBe(false);
    expect(top.overridden).toBe(false);
  });

  test("a shorthand over a longhand strikes the longhand", () => {
    const margin = declaration("margin: 0", ["margin-top", "margin-right"]);
    const top = declaration("margin-top: 4px");
    const strong = candidate({ specificity: [0, 2, 0] }, margin);
    const weak = candidate({ specificity: [0, 1, 0] }, top);
    markOwn([weak, strong], winners([weak, strong]));
    expect(margin.overridden).toBe(false);
    expect(top.overridden).toBe(true);
    expect(top.overriddenBy).toBe(strong.id);
  });

  test("a shorthand is struck only once every longhand it sets is lost", () => {
    const margin = declaration("margin: 0", ["margin-top", "margin-right"]);
    const top = declaration("margin-top: 4px");
    const right = declaration("margin-right: 4px");
    const weak = candidate({ specificity: [0, 1, 0] }, margin);
    const strong = candidate({ specificity: [0, 2, 0] }, top, right);
    markOwn([weak, strong], winners([weak, strong]));
    expect(margin.overridden).toBe(true);
    expect(margin.overriddenBy).toBe(strong.id);
  });

  test("importance is each declaration's own", () => {
    const color = declaration("color: red !important");
    const size = declaration("font-size: 1px");
    const weak = candidate({ specificity: [0, 0, 1] }, color, size);
    const other = declaration("color: blue");
    const bigger = declaration("font-size: 2px");
    const strong = candidate({ inline: true }, other, bigger);
    markOwn([weak, strong], winners([strong, weak]));
    expect(color.overridden).toBe(false);
    expect(other.overridden).toBe(true);
    expect(size.overridden).toBe(true);
    expect(bigger.overridden).toBe(false);
  });

  test("in one block the later of two equals wins", () => {
    const first = declaration("color: red");
    const second = declaration("color: blue");
    const block = candidate({}, first, second);
    markOwn([block], winners([block]));
    expect(first.overridden).toBe(true);
    expect(first.overriddenBy).toBe(block.id);
    expect(second.overridden).toBe(false);
  });

  test("the order candidates come in does not matter", () => {
    const a = candidate({ order: 1 }, declaration("color: red"));
    const b = candidate({ order: 2 }, declaration("color: blue"));
    expect(winners([a, b]).get("color")?.candidate).toBe(b);
    expect(winners([b, a]).get("color")?.candidate).toBe(b);
  });

  test("lists the strongest first", () => {
    const inline = candidate({ inline: true, specificity: [0, 0, 0] });
    const id = candidate({ specificity: [1, 0, 0], order: 0 });
    const late = candidate({ specificity: [0, 1, 0], order: 7 });
    const early = candidate({ specificity: [0, 1, 0], order: 3 });
    const layered = candidate({ specificity: [9, 0, 0], layer: 1 });
    const host = candidate({ specificity: [9, 9, 0], context: 1 });
    expect(byStrength([host, early, layered, late, id, inline])).toEqual([
      inline,
      id,
      late,
      early,
      layered,
      host,
    ]);
  });
});

describe("settleInherited", () => {
  const inherits = (property: string) => property === "color" || property.startsWith("--");

  test("keeps only declarations of inherited properties, and drops empty blocks", () => {
    const color = declaration("color: red");
    const both = candidate({}, color, declaration("margin-top: 0"));
    const none = candidate({}, declaration("display: block"));
    const kept = settleInherited([both, none], new Map(), inherits);
    expect(kept).toEqual([both]);
    expect(both.declarations).toEqual([color]);
    expect(color.overridden).toBe(false);
  });

  test("strikes what the element sets itself, and names the block that did", () => {
    const color = declaration("color: red");
    const custom = declaration("--x: 1");
    const block = candidate({}, color, custom);
    settleInherited([block], new Map([["color", 42]]), inherits);
    expect(color.overridden).toBe(true);
    expect(color.overriddenBy).toBe(42);
    expect(custom.overridden).toBe(false);
  });

  test("strikes what lost on the ancestor itself", () => {
    const weak = declaration("color: red");
    const strong = declaration("color: blue");
    const a = candidate({ specificity: [0, 0, 1] }, weak);
    const b = candidate({ specificity: [1, 0, 0] }, strong);
    settleInherited([a, b], new Map(), inherits);
    expect(weak.overridden).toBe(true);
    expect(weak.overriddenBy).toBe(b.id);
    expect(strong.overridden).toBe(false);
  });

  test("a nearer ancestor's property is taken for the ones further up", () => {
    const taken = new Map<string, number>();
    const near = candidate({}, declaration("color: red"));
    const far = candidate({}, declaration("color: blue"), declaration("--x: 1"));
    settleInherited([near], taken, inherits);
    settleInherited([far], taken, inherits);
    expect(taken.get("color")).toBe(near.id);
    expect(taken.get("--x")).toBe(far.id);
    expect(far.declarations.map((entry) => entry.overridden)).toEqual([true, false]);
    expect(far.declarations[0]?.overriddenBy).toBe(near.id);
  });

  test("a shorthand stays live while one inherited longhand of it still comes through", () => {
    const font = declaration("font: 12px serif", ["color", "--size", "margin-top"]);
    const block = candidate({}, font);
    settleInherited([block], new Map([["color", 1]]), inherits);
    expect(font.overridden).toBe(false);
    settleInherited([block], new Map([["color", 1], ["--size", 2]]), inherits);
    expect(font.overridden).toBe(true);
  });

  test("a non inherited property the ancestor sets does not take it from further up", () => {
    const taken = new Map<string, number>();
    settleInherited([candidate({}, declaration("margin-top: 0"))], taken, inherits);
    expect(taken.has("margin-top")).toBe(false);
  });
});

describe("settleContainers", () => {
  function inContainer(over: Partial<Source>, ...declarations: StyleDeclaration[]): Candidate {
    const self = candidate(over, ...declarations);
    self.conditional = { kind: "container", confirmed: false };
    return self;
  }

  test("drops a rule the computed style shows is off", () => {
    const base = candidate({ order: 0 }, declaration("display: block"));
    const query = inContainer({ order: 1 }, declaration("display: none"));
    expect(settleContainers([base, query], () => "block")).toEqual([base]);
  });

  test("confirms a rule the computed style shows is on", () => {
    const base = candidate({ order: 0 }, declaration("display: block"));
    const query = inContainer({ order: 1 }, declaration("display: none"));
    expect(settleContainers([base, query], () => "none")).toEqual([base, query]);
    expect(query.conditional?.confirmed).toBe(true);
  });

  test("leaves a rule unconfirmed where nothing else would have set the property", () => {
    const query = inContainer({}, declaration("display: block"));
    expect(settleContainers([query], () => "block")).toEqual([query]);
    expect(query.conditional?.confirmed).toBe(false);
  });

  test("leaves a rule alone when its values compute to something else", () => {
    const base = candidate({ order: 0 }, declaration("color: rgb(255, 0, 0)"));
    const query = inContainer({ order: 1 }, declaration("color: red"), declaration("width: 50%"));
    expect(settleContainers([base, query], () => "rgb(255, 0, 0)")).toEqual([base, query]);
    expect(query.conditional?.confirmed).toBe(false);
  });

  test("a custom property tells, as it computes to what was written", () => {
    const base = candidate({ order: 0 }, declaration("--cols: 1"));
    const on = inContainer({ order: 1 }, declaration("--cols:  2"));
    expect(settleContainers([base, on], () => "2")).toEqual([base, on]);
    expect(on.conditional?.confirmed).toBe(true);
    const off = inContainer({ order: 1 }, declaration("--cols: 2"));
    expect(settleContainers([base, off], () => "1")).toEqual([base]);
    const reads = inContainer({ order: 1 }, declaration("--cols: var(--n)"));
    expect(settleContainers([base, reads], () => "1")).toEqual([base, reads]);
  });

  test("a rule that loses the property anyway is not judged by it", () => {
    const strong = candidate({ specificity: [1, 0, 0] }, declaration("display: flex"));
    const query = inContainer({ specificity: [0, 1, 0] }, declaration("display: none"));
    expect(settleContainers([strong, query], () => "flex")).toEqual([strong, query]);
    expect(query.conditional?.confirmed).toBe(false);
  });

  test("with one rule dropped, the next is judged against what is left", () => {
    const base = candidate({ order: 0 }, declaration("display: block"));
    const small = inContainer({ order: 1 }, declaration("display: grid"));
    const large = inContainer({ order: 2 }, declaration("display: flex"));
    expect(settleContainers([base, small, large], () => "grid")).toEqual([base, small]);
    expect(small.conditional?.confirmed).toBe(true);
  });

  test("never reads the computed style without a container rule", () => {
    const base = candidate({}, declaration("display: block"));
    const read = () => {
      throw new Error("read");
    };
    expect(settleContainers([base], read)).toEqual([base]);
  });
});

describe("layerRanks", () => {
  const always = () => true;
  const mark = (name: string, conditions: Condition[] = []) => ({
    path: name.split("."),
    conditions,
  });

  function order(ranks: Map<string, number>): string[] {
    return [...ranks.keys()].sort((a, b) => (ranks.get(a) ?? 0) - (ranks.get(b) ?? 0));
  }

  test("layers rank in the order they are first named, unlayered over all", () => {
    const ranks = layerRanks([mark("reset"), mark("base"), mark("reset"), mark("theme")], always);
    expect(order(ranks)).toEqual(["reset", "base", "theme", ""]);
  });

  test("a layer's own rules go over the layers in it, and it stays where it was named", () => {
    const ranks = layerRanks([mark("a"), mark("b"), mark("a.x"), mark("a.y"), mark("b.z")], always);
    expect(order(ranks)).toEqual(["a.x", "a.y", "a", "b.z", "b", ""]);
  });

  test("naming a nested layer names the ones around it", () => {
    expect(order(layerRanks([mark("a.b.c"), mark("a.d")], always))).toEqual([
      "a.b.c",
      "a.b",
      "a.d",
      "a",
      "",
    ]);
  });

  test("a layer named where the conditions do not hold takes no place", () => {
    const off: Condition = { kind: "supports", text: "off" };
    const holds = (conditions: readonly Condition[]) => !conditions.includes(off);
    expect(order(layerRanks([mark("late", [off]), mark("early"), mark("late")], holds))).toEqual([
      "early",
      "late",
      "",
    ]);
  });
});
