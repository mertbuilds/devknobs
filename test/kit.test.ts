import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as dom from "../src/ui/dom";
import {
  emptyLine,
  filterField,
  rowBox,
  rowButton,
  sectionFold,
  segments,
  toolbar,
} from "../src/ui/kit";
import * as radio from "../src/ui/radio";
import { CSS } from "../src/ui/styles";
import { fake, focused, leave, page, rules } from "./kit-dom";

const KINDS = [
  { value: "all", label: "all" },
  { value: "fetch", label: "fetch/xhr" },
  { value: "other", label: "other" },
];

/** Which of a group's choices is on, and which the tab key stops at. */
function marks(node: unknown): { on: string[]; stop: string[] } {
  const items = fake(node).children;
  return {
    on: items.filter((item) => item.attributes.get("aria-checked") === "true").map((item) => item.textContent),
    stop: items.filter((item) => item.tabIndex === 0).map((item) => item.textContent),
  };
}

beforeEach(page);
afterEach(leave);

describe("the kit", () => {
  test("hands a view the panel's own builders, not copies of them", () => {
    expect(rowBox).toBe(dom.rowBox);
    expect(rowButton).toBe(dom.rowButton);
    expect(segments).toBe(radio.segments);
  });
});

describe("segments", () => {
  test("are the panel's radio group: named, one choice on, one tab stop", () => {
    const picked: string[] = [];
    const kinds = segments({ options: KINDS, label: "kind", value: "all", onChange: (v) => picked.push(v) });
    const node = fake(kinds.node);
    expect(node.className).toBe("seg");
    expect(node.attributes.get("role")).toBe("radiogroup");
    expect(node.attributes.get("aria-label")).toBe("kind");
    expect(node.children.map((item) => item.className)).toEqual([
      "seg-item on",
      "seg-item",
      "seg-item",
    ]);
    expect(node.children.map((item) => item.attributes.get("role"))).toEqual(["radio", "radio", "radio"]);
    expect(marks(node)).toEqual({ on: ["all"], stop: ["all"] });
    expect(picked).toEqual([]);
  });

  test("a click says what was picked, and the caller says what is on", () => {
    const picked: string[] = [];
    const kinds = segments({ options: KINDS, label: "kind", value: "all", onChange: (v) => picked.push(v) });
    fake(kinds.node).children[2]?.fire("click");
    expect(picked).toEqual(["other"]);
    expect(marks(kinds.node).on).toEqual(["all"]);
    kinds.set("other");
    expect(marks(kinds.node)).toEqual({ on: ["other"], stop: ["other"] });
  });

  test("the arrows move the focus and the choice, round the ends, and leave other keys alone", () => {
    const picked: string[] = [];
    const kinds = segments({
      options: KINDS,
      label: "kind",
      value: "all",
      onChange: (value) => {
        picked.push(value);
        kinds.set(value);
      },
    });
    const node = fake(kinds.node);
    const [all, , other] = node.children;
    const right = all?.fire("keydown", { key: "ArrowRight" }, node);
    expect(right?.prevented).toBe(true);
    expect(focused()).toBe(node.children[1] ?? null);
    expect(marks(node)).toEqual({ on: ["fetch/xhr"], stop: ["fetch/xhr"] });
    all?.fire("keydown", { key: "ArrowLeft" }, node);
    expect(focused()).toBe(other ?? null);
    expect(picked).toEqual(["fetch", "other"]);
    expect(all?.fire("keydown", { key: "a" }, node).prevented).toBe(false);
    expect(all?.fire("keydown", { key: "ArrowRight", metaKey: true }, node).prevented).toBe(false);
    expect(picked).toEqual(["fetch", "other"]);
  });

  test("with a value that is none of them, the first choice is the tab stop", () => {
    const kinds = segments({ options: KINDS, label: "kind", onChange: () => {} });
    kinds.set("gone");
    expect(marks(kinds.node)).toEqual({ on: [], stop: ["all"] });
  });
});

describe("filterField", () => {
  test("is the field the device list filters with, and says what is typed", () => {
    const typed: string[] = [];
    const filter = filterField({ placeholder: "filter requests", onInput: (text) => typed.push(text) });
    const node = fake(filter.node);
    expect(node.tag).toBe("input");
    expect(node.className).toBe("field filter");
    expect(node.placeholder).toBe("filter requests");
    expect(node.attributes.get("aria-label")).toBe("filter requests");
    expect(node.spellcheck).toBe(false);
    node.value = "api";
    node.fire("input");
    expect(typed).toEqual(["api"]);
    expect(fake(filterField({ placeholder: "filter", label: "filter styles", onInput() {} }).node).attributes.get("aria-label")).toBe("filter styles");
  });

  test("clears for escape: empties, says so, and tells whether there was anything", () => {
    const typed: string[] = [];
    const filter = filterField({ placeholder: "filter", onInput: (text) => typed.push(text) });
    expect(filter.clear()).toBe(false);
    expect(typed).toEqual([]);
    filter.node.value = "api";
    expect(filter.clear()).toBe(true);
    expect(filter.node.value).toBe("");
    expect(typed).toEqual([""]);
    expect(filter.clear()).toBe(false);
  });
});

describe("toolbar, emptyLine and sectionFold", () => {
  test("the bar holds what it is handed, in order", () => {
    const filter = filterField({ placeholder: "filter", onInput() {} });
    const kinds = segments({ options: KINDS, label: "kind", onChange() {} });
    const bar = fake(toolbar([filter.node, kinds.node]));
    expect(bar.className).toBe("toolbar");
    expect(bar.children.map((child) => child.className)).toEqual(["field filter", "seg"]);
  });

  test("an empty line is the panel's", () => {
    const line = emptyLine("no requests yet");
    expect(line.className).toBe("empty");
    expect(line.textContent).toBe("no requests yet");
  });

  test("a fold is a row from the builder, its chevron in the leading slot, that folds its body", () => {
    const heard: boolean[] = [];
    const fold = sectionFold({ label: "inherited", open: false, onToggle: (open) => heard.push(open) });
    const node = fake(fold.node);
    expect(node.className).toBe("row");
    expect(node.children.map((child) => child.className)).toEqual(["line", "fold"]);
    const [main] = node.find("main");
    expect(main?.tag).toBe("button");
    expect(main?.children.map((child) => child.className)).toEqual(["lead", "row-label"]);
    expect(main?.children[0]?.children.map((child) => child.className)).toEqual(["turn"]);
    expect(main?.attributes.get("aria-expanded")).toBe("false");
    expect(node.children[1]?.inert).toBe(true);
    expect(node.children[1]?.children).toEqual([fake(fold.body)]);
    main?.fire("click");
    expect(node.className).toBe("row open");
    expect(main?.attributes.get("aria-expanded")).toBe("true");
    expect(node.children[1]?.inert).toBe(false);
    main?.fire("click");
    expect(heard).toEqual([true, false]);
    fold.set(true);
    expect(node.className).toBe("row open");
    expect(heard).toEqual([true, false]);
    expect(fake(sectionFold({ label: "more", open: true }).node).className).toBe("row open");
  });
});

describe("a view's chrome", () => {
  /** What a view must not set for itself on a head, a bar or a row's main. */
  const BOX = /(^|[\s;])(padding|border|outline|box-shadow)(-[a-z-]+)?\s*:/;

  /** The rules that may: the shared ones every view and every row goes by. */
  const SHARED = [".toolbar", ".main", ".keys .main"];

  /** The rules that name one of the shared pieces of a view's chrome. */
  function naming(piece: RegExp) {
    return rules(CSS).filter((rule) => piece.test(rule.selector) && !SHARED.includes(rule.selector));
  }

  test("the head has no padding, border, outline, radius or shadow of its own", () => {
    const head = naming(/\.view-head\b/);
    expect(head.map((rule) => rule.selector)).toEqual([".view-head"]);
    for (const rule of head) expect(`${rule.selector} {${rule.body}}`).not.toMatch(BOX);
  });

  test("the bar has only the shared rules: nothing else pads, edges or rounds one", () => {
    expect(rules(CSS).filter((rule) => rule.selector === ".toolbar")).toHaveLength(1);
    const bar = naming(/\.toolbar\b/);
    expect(bar.map((rule) => rule.selector)).toEqual([".toolbar > .filter", ".toolbar > .seg"]);
    for (const rule of bar) expect(`${rule.selector} {${rule.body}}`).not.toMatch(BOX);
  });

  test("a row's main is padded by the shared rules alone, so no view moves where its rows start", () => {
    for (const rule of naming(/\.main\b/)) {
      expect(`${rule.selector} {${rule.body}}`).not.toMatch(BOX);
    }
  });

  test("the guard reads a rule that breaks it", () => {
    expect(".view-head .main { padding-right: 2px; }").toMatch(BOX);
    expect(".req-bar.toolbar { border-bottom: 1px solid red; }").toMatch(BOX);
    expect(".view-head { border-radius: 4px; outline: 0; }").toMatch(BOX);
    expect(".req-detail .main { width: 100%; padding-left: 8px; }").toMatch(BOX);
    expect(".view-head { box-shadow: none }").toMatch(BOX);
    expect(".view-head { flex: none; }").not.toMatch(BOX);
  });
});
