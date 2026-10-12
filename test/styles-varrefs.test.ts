import { describe, expect, test } from "bun:test";
import { resolveVars, varReferences } from "../src/styles/varrefs";

/** The names a value reads, each with its fallback, in the order they start. */
function read(value: string): [name: string, fallback: string | null][] {
  return varReferences(value).map((reference) => [reference.name, reference.fallback]);
}

describe("varReferences", () => {
  test.each<[string, [string, string | null][]]>([
    ["red", []],
    ["var(--a)", [["--a", null]]],
    ["var( --a )", [["--a", null]]],
    ["var(--a, 4px)", [["--a", "4px"]]],
    // An empty fallback is one, and comes to nothing.
    ["var(--a,)", [["--a", ""]]],
    // Nested, the one around first.
    ["var(--a, var(--b, 4px))", [["--a", "var(--b, 4px)"], ["--b", "4px"]]],
    ["var(--a) var(--b)", [["--a", null], ["--b", null]]],
    ["calc(var(--a) * 2 + var(--b, 1px))", [["--a", null], ["--b", "1px"]]],
    ["color-mix(in oklab, var(--ink) 40%, var(--paper, white))", [["--ink", null], ["--paper", "white"]]],
    ["linear-gradient(to right, var(--from), rgb(var(--rgb) / 50%))", [["--from", null], ["--rgb", null]]],
    // A fallback keeps its commas and its brackets.
    ["var(--font, ui-sans-serif, system-ui)", [["--font", "ui-sans-serif, system-ui"]]],
    ["var(--shadow, 0 0 0 1px rgb(0 0 0 / 10%))", [["--shadow", "0 0 0 1px rgb(0 0 0 / 10%)"]]],
    // What only has the text in it reads nothing.
    ['"var(--a)"', []],
    ["'var(--a)' var(--b)", [["--b", null]]],
    ['"a \\" var(--a)"', []],
    ["url(var(--a))", []],
    ["url( img/var(--a).png ) var(--b)", [["--b", null]]],
    ['url("var(--a)") var(--b)', [["--b", null]]],
    ["/* var(--a) */ var(--b)", [["--b", null]]],
    // A bracket in a string or a comment closes nothing.
    ['var(--a, ")") var(--b)', [["--a", '")"'], ["--b", null]]],
    ["var(--a, 1px /* ) */) var(--b)", [["--a", "1px"], ["--b", null]]],
    // Spaces and comments inside.
    ["var(\n  --a\n  ,\n  4px\n)", [["--a", "4px"]]],
    ["var(/* the gap */ --a /* or */ , 4px)", [["--a", "4px"]]],
    ["var(--a/* x */)", [["--a", null]]],
    // The function's name is in any case, and the property's is as written.
    ["VAR(--a) Var(--A)", [["--a", null], ["--A", null]]],
    ["var(--Brand) var(--brand)", [["--Brand", null], ["--brand", null]]],
    // No call of var.
    ["--var(--a)", []],
    ["no-var(--a)", []],
    ["myvar(--a)", []],
    ["var(a)", []],
    ["var(--)", []],
    ["var()", []],
    ["var(--a b)", []],
    // Left open, it is read to the value's end.
    ["var(--a", [["--a", null]]],
    ["var(--a, 4px", [["--a", "4px"]]],
    ["var(--é\\,x)", [["--é\\,x", null]]],
  ])("%s", (value, names) => {
    expect(read(value)).toEqual(names);
  });

  test("says where each call and each name stands", () => {
    const value = "1px var( --a , var(--b)) x";
    const [outer, inner] = varReferences(value);
    expect(value.slice(outer?.start, outer?.end)).toBe("var( --a , var(--b))");
    expect(value.slice(outer?.at, (outer?.at ?? 0) + (outer?.name.length ?? 0))).toBe("--a");
    expect(value.slice(inner?.start, inner?.end)).toBe("var(--b)");
    expect([outer?.closed, inner?.closed]).toEqual([true, true]);
    expect(varReferences("var(--a").map((one) => [one.end, one.closed])).toEqual([[7, false]]);
  });
});

describe("resolveVars", () => {
  const seen: Record<string, string> = { "--a": "1px", "--b": "2px", "--A": "9px" };
  const get = (name: string) => seen[name] ?? "";

  test.each<[string, string | null]>([
    ["red", "red"],
    ["var(--a)", "1px"],
    ["var(--A)", "9px"],
    ["calc(var(--a) + var(--b))", "calc(1px + 2px)"],
    ["var(--a, var(--none))", "1px"],
    ["var(--none, var(--b))", "2px"],
    ["var(--none, var(--nil, 4px))", "4px"],
    ["var(--none,)", ""],
    ["var(--none)", null],
    ["var(--none, var(--nil))", null],
    ['"var(--none)" var(--a)', '"var(--none)" 1px'],
    ["var(--a", null],
  ])("%s comes to %p", (value, comes) => {
    expect(resolveVars(value, get)).toBe(comes);
  });
});
