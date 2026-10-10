import { describe, expect, test } from "bun:test";
import {
  listed,
  longhandsOf,
  parseDeclarations,
  variableNames,
} from "../src/styles/declarations";
import { isInherited } from "../src/styles/inherited";
import { FakeStyle } from "./styles-cssom";

describe("parseDeclarations", () => {
  test("reads names, values and importance", () => {
    expect(parseDeclarations("color: red; margin: 0px 4px !important;")).toEqual([
      { name: "color", value: "red", important: false },
      { name: "margin", value: "0px 4px", important: true },
    ]);
  });

  test("takes importance however it is spaced or cased", () => {
    expect(parseDeclarations("color: red!important")).toEqual([
      { name: "color", value: "red", important: true },
    ]);
    expect(parseDeclarations("color: red ! IMPORTANT ;")).toEqual([
      { name: "color", value: "red", important: true },
    ]);
  });

  test("a semicolon or colon in a string or a url is part of the value", () => {
    expect(
      parseDeclarations(
        'content: "a; b: c"; background: url(data:image/png;base64,AAAA) no-repeat; quotes: \'";\' "x";',
      ),
    ).toEqual([
      { name: "content", value: '"a; b: c"', important: false },
      { name: "background", value: "url(data:image/png;base64,AAAA) no-repeat", important: false },
      { name: "quotes", value: "'\";' \"x\"", important: false },
    ]);
  });

  test("keeps var, calc and nested brackets whole", () => {
    expect(
      parseDeclarations("width: calc(100% - var(--gap, 1px)); grid-template-areas: [a; b];"),
    ).toEqual([
      { name: "width", value: "calc(100% - var(--gap, 1px))", important: false },
      { name: "grid-template-areas", value: "[a; b]", important: false },
    ]);
  });

  test("keeps a custom property's name as written, and lowers any other", () => {
    expect(parseDeclarations("--Brand: #F00; COLOR: var(--Brand); --empty: ;")).toEqual([
      { name: "--Brand", value: "#F00", important: false },
      { name: "color", value: "var(--Brand)", important: false },
      { name: "--empty", value: "", important: false },
    ]);
    expect(parseDeclarations("--json: { a: b; c: d }; --x: a:b")).toEqual([
      { name: "--json", value: "{ a: b; c: d }", important: false },
      { name: "--x", value: "a:b", important: false },
    ]);
  });

  test("drops comments, escapes and all", () => {
    expect(parseDeclarations("/* a: b; */ color: /* ; */ red; content: '\\'; x';")).toEqual([
      { name: "color", value: "red", important: false },
      { name: "content", value: "'\\'; x'", important: false },
    ]);
  });

  test("passes over what is not a declaration", () => {
    expect(parseDeclarations("")).toEqual([]);
    expect(parseDeclarations(" ; ;; color ; : red; top: 0")).toEqual([
      { name: "top", value: "0", important: false },
    ]);
  });
});

describe("variableNames", () => {
  test("finds each custom property once, in fallbacks too", () => {
    expect(variableNames("var(--a)")).toEqual(["--a"]);
    expect(variableNames("calc(var( --a ) + var(--b, var(--c, 1px)) + var(--a))")).toEqual([
      "--a",
      "--b",
      "--c",
    ]);
    expect(variableNames("red")).toEqual([]);
  });
});

describe("longhandsOf", () => {
  const expand = (name: string) => listed(new FakeStyle(`${name}: initial`));

  test("a name the block lists is a longhand", () => {
    const names = listed(new FakeStyle("color: red; margin-top: 0"));
    expect(longhandsOf("color", names, expand)).toEqual(["color"]);
    expect(longhandsOf("margin-top", names, expand)).toEqual(["margin-top"]);
  });

  test("a custom property is its own", () => {
    expect(longhandsOf("--x", [], expand)).toEqual(["--x"]);
  });

  test("a shorthand sets those of its longhands the block lists", () => {
    const names = listed(new FakeStyle("margin: 0; border-color: red"));
    expect(longhandsOf("margin", names, expand)).toEqual([
      "margin-top",
      "margin-right",
      "margin-bottom",
      "margin-left",
    ]);
    expect(longhandsOf("border-color", names, expand)).toEqual(["border-top-color"]);
  });

  test("a shorthand that was part overwritten sets only what is left of it", () => {
    const names = ["margin-right", "margin-bottom", "margin-left", "padding-top"];
    expect(longhandsOf("margin", names, expand)).toEqual([
      "margin-right",
      "margin-bottom",
      "margin-left",
    ]);
  });

  test("falls back on the names under the shorthand's, then on itself", () => {
    const names = ["inset-block-start", "inset-block-end", "top"];
    expect(longhandsOf("inset-block", names, () => [])).toEqual([
      "inset-block-start",
      "inset-block-end",
    ]);
    expect(longhandsOf("gap", ["row-gap"], () => [])).toEqual(["gap"]);
  });
});

describe("isInherited", () => {
  const none = new Map<string, boolean>();

  test("knows the inherited properties from the rest", () => {
    for (const name of ["color", "font-size", "line-height", "visibility", "cursor", "fill"]) {
      expect(isInherited(name, none)).toBe(true);
    }
    for (const name of ["margin-top", "display", "background-color", "border-top-color", "opacity"]) {
      expect(isInherited(name, none)).toBe(false);
    }
  });

  test("a custom property inherits unless it was registered not to", () => {
    expect(isInherited("--x", none)).toBe(true);
    expect(isInherited("--x", new Map([["--x", false]]))).toBe(false);
    expect(isInherited("--x", new Map([["--x", true]]))).toBe(true);
  });
});
