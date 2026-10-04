import { describe, expect, test } from "bun:test";
import { CSS, give, VARIABLE } from "../src/engine/endroom";

interface FakeStyle {
  name: string;
  textContent: string;
  parses: number;
  sheet: { cssRules: { style: { getPropertyValue(name: string): string } }[] };
  remove(): void;
}

/** A document that keeps the devknobs sheets put in it, each with its first rule's variables. */
function fakeDocument() {
  const styles: FakeStyle[] = [];
  const doc = {
    styles,
    head: null,
    documentElement: {
      appendChild(style: FakeStyle) {
        styles.push(style);
      },
    },
    querySelector(selector: string) {
      return styles.find((style) => selector === `style[data-devknobs="${style.name}"]`) ?? null;
    },
    createElement() {
      const held = new Map<string, string>();
      let text = "";
      const style = {
        name: "",
        parses: 0,
        get textContent() {
          return text;
        },
        // A new text is a new sheet, with the variables as written.
        set textContent(value: string) {
          text = value;
          style.parses += 1;
          held.clear();
          held.set(VARIABLE, "0px");
        },
        sheet: {
          cssRules: [
            {
              style: {
                getPropertyValue: (name: string) => held.get(name) ?? "",
                setProperty: (name: string, value: string) => held.set(name, value),
              },
            },
          ],
        },
        setAttribute(_: string, value: string) {
          style.name = value;
        },
        remove() {
          styles.splice(styles.indexOf(style), 1);
        },
      };
      return style;
    },
  };
  return doc;
}

function given(doc: ReturnType<typeof fakeDocument>, room: number): number {
  return give(doc as unknown as Document, room);
}

function roomOf(doc: ReturnType<typeof fakeDocument>): string | undefined {
  return doc.styles[0]?.sheet.cssRules[0]?.style.getPropertyValue(VARIABLE);
}

describe("end room", () => {
  test("is a margin after the root, from a variable that starts at none", () => {
    expect(CSS).toContain(`:root{${VARIABLE}:0px}`);
    expect(CSS).toContain(`html{margin-bottom:var(${VARIABLE})!important}`);
  });

  test("puts one sheet in the page and moves only its variable after", () => {
    const doc = fakeDocument();
    expect(given(doc, 98)).toBe(0);
    expect(doc.styles.map((style) => [style.name, style.textContent])).toEqual([["endroom", CSS]]);
    expect(roomOf(doc)).toBe("98px");
    expect(given(doc, 58)).toBe(98);
    expect(given(doc, 58)).toBe(58);
    expect(roomOf(doc)).toBe("58px");
    expect(doc.styles).toHaveLength(1);
    expect(doc.styles[0]?.parses).toBe(1);
  });

  test("no room takes the sheet away, and says what the page had", () => {
    const doc = fakeDocument();
    expect(given(doc, 0)).toBe(0);
    expect(doc.styles).toEqual([]);
    given(doc, 158);
    expect(given(doc, 0)).toBe(158);
    expect(doc.styles).toEqual([]);
    expect(given(doc, 58)).toBe(0);
    expect(roomOf(doc)).toBe("58px");
  });
});
