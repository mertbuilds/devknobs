import { describe, expect, test } from "bun:test";
import { families, fontCheck, isGeneric, usedFamily } from "../src/grab/fontused";

/** A `document.fonts` that has the families it is made with, and every string it was asked. */
function fonts(has: string[]) {
  const asked: string[] = [];
  return {
    asked,
    check(font: string): boolean {
      asked.push(font);
      return has.some((family) => font === `16px "${family}"`);
    },
  };
}

describe("the families of a font-family", () => {
  test("are read in order, with no quotes around them", () => {
    expect(families('Inter, "Helvetica Neue", Arial, sans-serif')).toEqual([
      "Inter",
      "Helvetica Neue",
      "Arial",
      "sans-serif",
    ]);
    expect(families("'Fira Code',monospace")).toEqual(["Fira Code", "monospace"]);
  });

  test("a comma inside quotes is part of a name", () => {
    expect(families('"Foo, Bar", serif')).toEqual(["Foo, Bar", "serif"]);
  });

  test("an empty list has none", () => {
    expect(families("")).toEqual([]);
    expect(families(" , ")).toEqual([]);
  });
});

describe("the family used", () => {
  test("is the first the browser has, not the first that is asked for", () => {
    const set = fonts(["Helvetica Neue", "Arial"]);
    expect(usedFamily('Inter, "Helvetica Neue", Arial, sans-serif', fontCheck(set))).toBe(
      "Helvetica Neue",
    );
    // It stops at the one it finds.
    expect(set.asked).toEqual(['16px "Inter"', '16px "Helvetica Neue"']);
  });

  test("is the first of the list where the browser has it", () => {
    expect(usedFamily("Inter, sans-serif", fontCheck(fonts(["Inter"])))).toBe("Inter");
  });

  test("is a generic family where that comes first or nothing before it is there, and that is never asked", () => {
    const set = fonts([]);
    expect(usedFamily("Inter, Roboto, sans-serif", fontCheck(set))).toBe("sans-serif");
    expect(set.asked).toEqual(['16px "Inter"', '16px "Roboto"']);
    const none = fonts(["Inter"]);
    expect(usedFamily("system-ui, Inter", fontCheck(none))).toBe("system-ui");
    expect(none.asked).toEqual([]);
    expect(usedFamily("-apple-system, BlinkMacSystemFont", () => false)).toBe("-apple-system");
  });

  test("is none where nothing of the list is there, as the browser's fallback has no name", () => {
    expect(usedFamily("Inter, Roboto", fontCheck(fonts([])))).toBeNull();
    expect(usedFamily("", fontCheck(fonts(["Inter"])))).toBeNull();
  });

  test("knows the generic families in any case", () => {
    expect(isGeneric("Sans-Serif")).toBe(true);
    expect(isGeneric("ui-monospace")).toBe(true);
    expect(isGeneric("Inter")).toBe(false);
  });
});

describe("the check for a family", () => {
  test("quotes the name, with what would end the quotes escaped", () => {
    const set = fonts([]);
    fontCheck(set)('My "Font"');
    expect(set.asked).toEqual(['16px "My \\"Font\\""']);
  });

  test("is no where the document has no fonts to ask, or the asking throws", () => {
    expect(fontCheck(undefined)("Inter")).toBe(false);
    expect(fontCheck(null)("Inter")).toBe(false);
    const broken = {
      check: (): boolean => {
        throw new SyntaxError("not a font");
      },
    };
    expect(fontCheck(broken)("Inter")).toBe(false);
  });
});
