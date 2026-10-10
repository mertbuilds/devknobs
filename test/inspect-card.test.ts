import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Color } from "../src/engine/color";
import { type CardFacts, type CardRow, cardRows } from "../src/grab/card";
import { hasOwnText, readFacts } from "../src/grab/cardread";
import { createCardView } from "../src/grab/cardview";
import { cardPlace, labelPlace } from "../src/grab/overlay";
import { FakeNode, fake } from "./styles-dom";

const rgb = (red: number, green: number, blue: number, alpha = 1): Color => ({ red, green, blue, alpha });
const CLEAR = rgb(0, 0, 0, 0);
const NONE = { top: 0, right: 0, bottom: 0, left: 0 };

/** A paragraph of dark text on a white page, with no spacing, and what a test sets over that. */
function facts(over: Partial<CardFacts> = {}): CardFacts {
  return {
    text: true,
    color: rgb(17, 24, 39),
    backgrounds: [CLEAR, rgb(255, 255, 255)],
    family: "Inter",
    fontSize: "16px",
    lineHeight: "24px",
    fontWeight: "400",
    letterSpacing: "normal",
    margin: NONE,
    padding: NONE,
    ...over,
  };
}

/** The rows as `key: text`, with what marks each. */
function said(rows: CardRow[]): string[] {
  return rows.map((row) => {
    const marks = [
      row.swatch === undefined ? "" : ` [${row.swatch}]`,
      row.quiet ? " (quiet)" : "",
      row.pass === undefined ? "" : row.pass ? " ok" : " fails",
    ];
    return `${row.key}: ${row.text}${marks.join("")}`;
  });
}

describe("the card's rows", () => {
  test("a button with text, a background of its own and spacing has them all", () => {
    const rows = cardRows(
      facts({
        color: rgb(255, 255, 255),
        backgrounds: [rgb(37, 99, 235)],
        fontSize: "14px",
        lineHeight: "20px",
        fontWeight: "500",
        margin: { top: 8, right: 0, bottom: 8, left: 0 },
        padding: { top: 6, right: 12, bottom: 6, left: 12 },
      }),
    );
    expect(said(rows)).toEqual([
      "color: #ffffff [#ffffff]",
      "background: #2563eb [#2563eb]",
      "font: Inter",
      "type: 14px / 20px · 500",
      "contrast: 5.17 ok",
      "margin: 8px 0 8px 0",
      "padding: 6px 12px 6px 12px",
    ]);
  });

  test("text on no background of its own says the one behind it, quietly, and nothing of spacing it has none of", () => {
    expect(said(cardRows(facts()))).toEqual([
      "color: #111827 [#111827]",
      "background: #ffffff [#ffffff] (quiet)",
      "font: Inter",
      "type: 16px / 24px · 400",
      "contrast: 17.74 ok",
    ]);
  });

  test("a box with no text of its own says only its background and its spacing", () => {
    const rows = cardRows(
      facts({
        text: false,
        family: null,
        backgrounds: [rgb(241, 245, 249)],
        padding: { top: 16, right: 16, bottom: 16, left: 16 },
      }),
    );
    expect(said(rows)).toEqual(["background: #f1f5f9 [#f1f5f9]", "padding: 16px 16px 16px 16px"]);
  });

  test("a box with no text, no background and no spacing says nothing but its first line", () => {
    expect(cardRows(facts({ text: false, family: null, backgrounds: [CLEAR, null] }))).toEqual([]);
  });

  test("a see-through background of its own is said with its alpha, and the contrast is against what shows", () => {
    const rows = cardRows(facts({ color: rgb(0, 0, 0), backgrounds: [rgb(0, 0, 0, 0.5), rgb(255, 255, 255)] }));
    expect(said(rows).slice(0, 2)).toEqual([
      "color: #000000 [#000000]",
      "background: rgb(0 0 0 / 0.5) [rgb(0 0 0 / 0.5)]",
    ]);
    // Black on the grey that half of black makes over white.
    expect(rows.find((row) => row.key === "contrast")?.text).toBe("5.28");
  });

  test("see-through text is measured as it shows over its background", () => {
    const rows = cardRows(facts({ color: rgb(0, 0, 0, 0.5) }));
    expect(rows.find((row) => row.key === "contrast")).toEqual({ key: "contrast", text: "3.98", pass: false });
    expect(rows[0]?.text).toBe("rgb(0 0 0 / 0.5)");
  });

  test("the contrast passes by the text's size and weight", () => {
    const grey = facts({ color: rgb(119, 119, 119) });
    const mark = (over: Partial<CardFacts>) =>
      cardRows({ ...grey, ...over }).find((row) => row.key === "contrast");
    expect(mark({})).toEqual({ key: "contrast", text: "4.48", pass: false });
    expect(mark({ fontSize: "24px" })?.pass).toBe(true);
    expect(mark({ fontSize: "19px", fontWeight: "700" })?.pass).toBe(true);
    expect(mark({ fontSize: "19px", fontWeight: "400" })?.pass).toBe(false);
  });

  test("the letter spacing is said only where it is not normal, and a long size is cut short", () => {
    const type = (over: Partial<CardFacts>) =>
      cardRows(facts(over)).find((row) => row.key === "type")?.text;
    expect(type({ letterSpacing: "0.2px" })).toBe("16px / 24px · 400 · 0.2px");
    expect(type({ fontSize: "13.3333px", lineHeight: "normal" })).toBe("13.33px / normal · 400");
  });

  test("with no family to name, the font row says the size", () => {
    expect(said(cardRows(facts({ family: null }))).slice(2, 4)).toEqual([
      "font: 16px / 24px · 400",
      "contrast: 17.74 ok",
    ]);
  });

  test("a color that could not be read leaves its row and the contrast out", () => {
    expect(said(cardRows(facts({ color: null })))).toEqual([
      "background: #ffffff [#ffffff] (quiet)",
      "font: Inter",
      "type: 16px / 24px · 400",
    ]);
  });
});

/** An element of a page, as far as the card reads one. */
function pageElement(tag: string, nodes: { nodeType: number; textContent: string }[] = []) {
  return {
    tagName: tag.toUpperCase(),
    childNodes: nodes,
    parentElement: null,
    getRootNode: () => ({}),
    ownerDocument: {
      fonts: { check: (font: string) => font === '16px "Georgia"' },
    },
  } as unknown as Element;
}

describe("what is read of an element", () => {
  const text = (content: string) => ({ nodeType: 3, textContent: content });
  const child = { nodeType: 1, textContent: "inside" };

  test("it has text of its own with a text node that is not only space, and a field always has", () => {
    expect(hasOwnText(pageElement("p", [text("  hello ")]))).toBe(true);
    expect(hasOwnText(pageElement("div", [text("\n  "), child, text("\n")]))).toBe(false);
    expect(hasOwnText(pageElement("div", []))).toBe(false);
    expect(hasOwnText(pageElement("input"))).toBe(true);
    expect(hasOwnText(pageElement("textarea"))).toBe(true);
  });

  beforeEach(() => {
    Object.defineProperty(globalThis, "ShadowRoot", { configurable: true, value: class {} });
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, "ShadowRoot");
  });

  test("the color, the background and the font come from the one style it is handed", () => {
    const read: string[] = [];
    const style = {
      color: "rgb(17, 24, 39)",
      backgroundColor: "rgb(255, 255, 255)",
      fontFamily: "Inter, Georgia, serif",
      fontSize: "16px",
      lineHeight: "24px",
      fontWeight: "400",
      letterSpacing: "normal",
    } as CSSStyleDeclaration;
    const found = readFacts(pageElement("p", [text("hello")]), style, (value) => {
      read.push(value);
      return value === "rgb(255, 255, 255)" ? rgb(255, 255, 255) : rgb(17, 24, 39);
    });
    expect(found).toEqual({
      text: true,
      color: rgb(17, 24, 39),
      backgrounds: [rgb(255, 255, 255)],
      family: "Georgia",
      fontSize: "16px",
      lineHeight: "24px",
      fontWeight: "400",
      letterSpacing: "normal",
    });
    // A solid background of its own: no ancestor's style is read.
    expect(read).toEqual(["rgb(17, 24, 39)", "rgb(255, 255, 255)"]);
  });

  test("an element with no text of its own is asked for no font", () => {
    const style = { color: "", backgroundColor: "", fontFamily: "Georgia" } as CSSStyleDeclaration;
    expect(readFacts(pageElement("div"), style, () => rgb(0, 0, 0)).family).toBeNull();
  });
});

describe("the card's nodes", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: {
        createElement: (tag: string) => new FakeNode(tag),
        createElementNS: (_namespace: string, tag: string) => new FakeNode(tag),
      },
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, "document");
  });

  /** The rows that show, each as its label, its value and what marks it. */
  function shown(rows: FakeNode): string[] {
    return rows.shown("info").map((row) => {
      const [swatch] = row.shown("dot");
      const marks = row.shown("mark").map((mark) => (mark.classList.contains("fail") ? "x" : "check"));
      const [text] = row.find("text");
      return [
        row.find("key")[0]?.textContent ?? "",
        text?.textContent ?? "",
        swatch ? `[${swatch.style.backgroundColor}]` : "",
        text?.classList.contains("quiet") ? "(quiet)" : "",
        marks.join("+"),
      ]
        .filter((part) => part !== "")
        .join(" ");
    });
  }

  const paragraph = cardRows(facts());
  const box = cardRows(
    facts({
      text: false,
      family: null,
      backgrounds: [rgb(241, 245, 249)],
      margin: { top: 0, right: 0, bottom: 24, left: 0 },
    }),
  );

  test("say the size and each row, with a swatch by a color and a mark by the contrast", () => {
    const card = createCardView();
    const rows = fake(card.rows);
    expect(rows.hidden).toBe(true);
    const key = card.write("320 × 48", paragraph);
    expect(fake(card.size).textContent).toBe("320 × 48");
    expect(rows.hidden).toBe(false);
    expect(shown(rows)).toEqual([
      "color #111827 [#111827]",
      "background #ffffff [#ffffff] (quiet)",
      "font Inter",
      "16px / 24px · 400",
      "contrast 17.74 check",
    ]);
    expect(key).toBe("color background font type contrast");
  });

  test("a contrast that fails has the cross, and not the check", () => {
    const card = createCardView();
    card.write("10 × 10", cardRows(facts({ color: rgb(119, 119, 119) })));
    expect(shown(fake(card.rows))[4]).toBe("contrast 4.48 x");
  });

  test("are built once: another element changes the text in the same nodes, and which of them show", () => {
    const card = createCardView();
    const rows = fake(card.rows);
    card.write("320 × 48", paragraph);
    const before = rows.all();
    const key = card.write("640 × 200", box);
    expect(rows.all()).toEqual(before);
    expect(rows.all().every((node, index) => node === before[index])).toBe(true);
    expect(fake(card.size).textContent).toBe("640 × 200");
    expect(shown(rows)).toEqual(["background #f1f5f9 [#f1f5f9]", "margin 0 0 24px 0"]);
    expect(key).toBe("background margin");
    // Back on the first, nothing of the second is left in it.
    card.write("320 × 48", paragraph);
    expect(shown(rows)).toHaveLength(5);
    expect(shown(rows)[1]).toBe("background #ffffff [#ffffff] (quiet)");
    expect(rows.all().every((node, index) => node === before[index])).toBe(true);
  });

  test("is as tall as the rows that show, whatever they say: the same rows are the same shape", () => {
    const card = createCardView();
    const first = card.write("320 × 48", paragraph);
    const second = card.write("12 × 900", cardRows(facts({ color: rgb(1, 2, 3), family: "Georgia" })));
    expect(second).toBe(first);
  });

  test("with no rows, only the first line is left", () => {
    const card = createCardView();
    card.write("320 × 48", paragraph);
    expect(card.write("0 × 0", [])).toBe("");
    expect(fake(card.rows).hidden).toBe(true);
    expect(shown(fake(card.rows))).toEqual([]);
  });
});

describe("where the card goes", () => {
  const view = { width: 800, height: 600 };
  const card = { width: 264, height: 120 };
  const box = { top: 100, bottom: 150, left: 300, right: 500 };

  test("is under the box or over it as the label is, and starts at the box's left", () => {
    expect(cardPlace(box, card, view)).toEqual({ x: 300, y: labelPlace(box, card, view, null).y });
    expect(cardPlace(box, card, view).y).toBe(156);
    expect(cardPlace({ ...box, top: 400, bottom: 560 }, card, view).y).toBe(274);
  });

  test("is kept in the window, and does not follow the pointer", () => {
    expect(cardPlace({ ...box, left: 700, right: 790 }, card, view).x).toBe(528);
    expect(cardPlace({ ...box, left: -50, right: 90 }, card, view).x).toBe(8);
  });
});
