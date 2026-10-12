import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as dom from "../src/ui/dom";
import {
  AREA_ROWS,
  codeBlock,
  confirmLine,
  controls,
  emptyLine,
  entryFold,
  entryRow,
  filterField,
  noteButton,
  noteLine,
  pairs,
  rowBox,
  rowButton,
  sectionFold,
  segments,
  stack,
  switchLine,
  textArea,
  textField,
  toolbar,
} from "../src/ui/kit";
import * as radio from "../src/ui/radio";
import { CSS } from "../src/ui/styles";
import { across, literal } from "./columns";
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
  test("a bar's own controls have a line to themselves under its filter, which is a line wide", () => {
    const filter = filterField({ placeholder: "filter", onInput() {} });
    const line = controls([{ label: "add", run() {} }]);
    const bar = fake(toolbar([filter.node, line.node]));
    expect(bar.children.map((child) => child.className)).toEqual(["field filter", "chips"]);
    expect(rules(CSS).find((rule) => rule.selector === ".toolbar > .chips")?.body.trim()).toBe("flex: 1 1 100%;");
  });

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

  test("a fold is a row from the builder, its chevron where a row's icon is, that folds its body", () => {
    const heard: boolean[] = [];
    const fold = sectionFold({ label: "inherited", open: false, onToggle: (open) => heard.push(open) });
    const node = fake(fold.node);
    expect(node.className).toBe("row");
    expect(node.children.map((child) => child.className)).toEqual(["line", "fold"]);
    const [main] = node.find("main");
    expect(main?.tag).toBe("button");
    expect(main?.children.map((child) => child.className)).toEqual(["turn", "row-label"]);
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

  test("a fold's row ends with what it is handed, after its label, as a row's value is", () => {
    const brief = dom.el("span", "row-value idle", "3");
    const fold = sectionFold({ label: "headers", ends: [brief], open: false });
    const [main] = fake(fold.node).find("main");
    expect(main?.children.map((child) => child.className)).toEqual(["turn", "row-label", "row-value idle"]);
  });
});

describe("what folds out under a view's row", () => {
  test("a fold's line ends with what it is handed, and hands back its line and label", () => {
    const size = dom.el("span", "size", "12 B");
    const fold = sectionFold({ label: "token", open: false, ends: [size] });
    const [main] = fake(fold.node).find("main");
    expect(fake(fold.main)).toBe(main as ReturnType<typeof fake>);
    expect(main?.children.map((child) => child.className)).toEqual(["turn", "row-label", "size"]);
    expect(fake(fold.label).textContent).toBe("token");
  });

  test("a fold inside a fold stays folded while the outer one is out: only a row's own fold opens with it", () => {
    const opens = rules(CSS).filter((rule) => /\.row\.open\b.*\.fold\b/.test(rule.selector));
    expect(opens.map((rule) => rule.selector)).toEqual([".row.open > .fold"]);
  });

  test("a note is a quiet line, and a stack holds what it is handed, in order", () => {
    const note = fake(noteLine("read only"));
    expect(note.className).toBe("note");
    expect(note.textContent).toBe("read only");
    const box = fake(stack([noteLine("a"), emptyLine("b")]));
    expect(box.className).toBe("stack");
    expect(box.children.map((child) => child.className)).toEqual(["note", "empty"]);
  });

  test("controls are the editors' chips, each a button that does one thing", () => {
    const ran: string[] = [];
    const line = controls([
      { label: "copy value", run: () => ran.push("copy") },
      { label: "delete", run: () => ran.push("delete") },
    ]);
    const node = fake(line.node);
    expect(node.className).toBe("chips");
    expect(node.children.map((child) => [child.tag, child.type, child.className, child.textContent])).toEqual([
      ["button", "button", "chip", "copy value"],
      ["button", "button", "chip", "delete"],
    ]);
    expect(line.buttons).toHaveLength(2);
    node.children[1]?.fire("click");
    expect(ran).toEqual(["delete"]);
  });

  test("a text field is the panel's field, a line wide, and says when enter is pressed", () => {
    let entered = 0;
    const node = fake(textField({ placeholder: "preset name", value: "a", onEnter: () => entered++ }));
    expect(node.tag).toBe("input");
    expect(node.className).toBe("field field-line");
    expect(node.attributes.get("aria-label")).toBe("preset name");
    expect(node.value).toBe("a");
    node.fire("keydown", { key: "a" });
    node.fire("keydown", { key: "Enter" });
    expect(entered).toBe(1);
  });

  test("a text box grows with its lines up to a limit, and saves on enter with meta or ctrl", () => {
    let saved = 0;
    const node = fake(textArea({ label: "value of token", value: "one", onSave: () => saved++ }));
    expect(node.tag).toBe("textarea");
    expect(node.className).toBe("field field-area");
    expect(node.attributes.get("aria-label")).toBe("value of token");
    expect(node.spellcheck).toBe(false);
    expect(node.rows).toBe(2);
    node.value = "1\n2\n3\n4";
    node.fire("input");
    expect(node.rows).toBe(4);
    node.value = Array.from({ length: 100 }, () => "x").join("\n");
    node.fire("input");
    expect(node.rows).toBe(AREA_ROWS);
    expect(node.fire("keydown", { key: "Enter" }).prevented).toBe(false);
    expect(saved).toBe(0);
    expect(node.fire("keydown", { key: "Enter", metaKey: true }).prevented).toBe(true);
    expect(node.fire("keydown", { key: "Enter", ctrlKey: true }).prevented).toBe(true);
    expect(saved).toBe(2);
  });

  test("a code block shows text as it is", () => {
    const node = fake(codeBlock({ text: '{\n  "a": 1\n}' }).node);
    expect(node.className).toBe("code");
    const [text] = node.children;
    expect(text?.tag).toBe("pre");
    expect(text?.className).toBe("code-text");
    expect(text?.textContent).toBe('{\n  "a": 1\n}');
  });

  test("pairs are a definition list of names and what each is", () => {
    const node = fake(pairs([["path", "/"], ["secure", "yes"]]).node);
    expect(node.tag).toBe("dl");
    expect(node.className).toBe("pairs");
    expect(node.children.map((child) => [child.tag, child.textContent])).toEqual([
      ["dt", "path"],
      ["dd", "/"],
      ["dt", "secure"],
      ["dd", "yes"],
    ]);
  });

  test("a switch on a line is the editors' switch, named for assistive tech, and says what it is now", () => {
    const heard: boolean[] = [];
    const line = switchLine({ label: "apply on load", on: false, onChange: (on) => heard.push(on) });
    const node = fake(line.node);
    expect(node.className).toBe("knob knob-switch");
    expect(node.children.map((child) => child.className)).toEqual(["knob-label", "switch"]);
    const control = fake(line.control);
    expect(control.attributes.get("role")).toBe("switch");
    expect(control.attributes.get("aria-label")).toBe("apply on load");
    expect(control.attributes.get("aria-checked")).toBe("false");
    control.fire("click");
    expect(control.className).toBe("switch on");
    expect(control.attributes.get("aria-checked")).toBe("true");
    control.fire("click");
    expect(heard).toEqual([true, false]);
    line.set(true);
    expect(control.attributes.get("aria-checked")).toBe("true");
    expect(heard).toEqual([true, false]);
  });

  test("a question is asked in place: its words, the control that goes ahead, then cancel", () => {
    const heard: string[] = [];
    const asked = confirmLine({
      text: "clear 12 items?",
      confirm: "clear",
      onConfirm: () => heard.push("yes"),
      onCancel: () => heard.push("no"),
    });
    const node = fake(asked.node);
    expect(node.className).toBe("ask");
    expect(node.children.map((child) => child.className)).toEqual(["note", "chips"]);
    expect(node.children[0]?.textContent).toBe("clear 12 items?");
    expect(node.find("chip").map((chip) => chip.textContent)).toEqual(["clear", "cancel"]);
    node.find("chip")[1]?.fire("click");
    node.find("chip")[0]?.fire("click");
    expect(heard).toEqual(["no", "yes"]);
  });

  test("a line of a table is a fold from the builder: a name, its value and what the line ends with", () => {
    const heard: boolean[] = [];
    const fold = entryFold({ name: "token", value: "abc", end: "3 B", open: false, onToggle: (open) => heard.push(open) });
    const node = fake(fold.node);
    expect(node.className).toBe("row");
    const [main] = node.find("main");
    expect(main?.tag).toBe("button");
    expect(main?.children.map((child) => [child.className, child.textContent])).toEqual([
      ["turn", ""],
      ["row-label cell-name columned", "token"],
      ["cell-value", "abc"],
      ["cell-end", "3 B"],
    ]);
    // A name cut short is whole in its tooltip.
    expect(fake(fold.label).title).toBe("token");
    main?.fire("click");
    expect(node.className).toBe("row open");
    expect(heard).toEqual([true]);
  });

  test("a name stands on the table's column only where a value follows it, and a quiet one says so by its class alone", () => {
    const bare = fake(entryFold({ name: "shop", end: "version 3", open: false }).node);
    expect(bare.find("main")[0]?.children.map((child) => child.className)).toEqual(["turn", "row-label cell-name", "cell-end"]);
    const alone = fake(entryFold({ name: "pages", end: "", open: false }).node);
    expect(alone.find("main")[0]?.children.map((child) => child.className)).toEqual(["turn", "row-label cell-name"]);
    // An empty value still holds its column.
    const empty = fake(entryFold({ name: "flag", value: "", open: false }).node);
    expect(empty.find("main")[0]?.children.map((child) => child.className)).toEqual(["turn", "row-label cell-name columned", "cell-value"]);
    const quiet = fake(entryFold({ name: "devknobs", value: "{}", quiet: true, open: false }).node);
    expect(quiet.find("row-label")[0]?.className).toBe("row-label cell-name columned quiet");
  });

  test("a line of a table that does nothing is a row from the builder, with no control in it", () => {
    const row = entryRow({ name: "GET /p/0", end: "200 · 1 KB" });
    const node = fake(row.box);
    expect(node.className).toBe("row");
    const [main] = node.find("main");
    expect(main?.tag).toBe("div");
    expect(main?.children.map((child) => [child.className, child.textContent])).toEqual([
      ["row-label cell-name", "GET /p/0"],
      ["cell-end", "200 · 1 KB"],
    ]);
    expect(fake(row.label).title).toBe("GET /p/0");
  });

  test("a table's cells set type, color and their share of the line, and no box: every line has the one column", () => {
    const own = rules(CSS).filter((rule) => /\.cell-/.test(rule.selector));
    expect(own.map((rule) => rule.selector)).toEqual([
      ".cell-name",
      ".cell-name.columned",
      ".cell-name.quiet",
      ".cell-value",
      ".cell-end",
    ]);
    for (const rule of own) {
      expect(`${rule.selector} {${rule.body}}`).not.toMatch(/(^|[\s;])(padding|border|outline|box-shadow|background|font-weight)(-[a-z-]+)?\s*:/);
    }
    // The column is said once, with a floor and a ceiling, and is no row's own to change.
    expect(own.find((rule) => rule.selector === ".cell-name.columned")?.body.trim()).toBe("flex: 0 0 clamp(72px, 38%, 200px);");
    // A quiet name is told by fainter text alone.
    expect(own.find((rule) => rule.selector === ".cell-name.quiet")?.body.trim()).toBe("color: var(--faint);");
    // What a line ends with is pushed to the far end, and by no length.
    expect(across(own.find((rule) => rule.selector === ".cell-end")?.body ?? "")).toEqual([["margin-left", "auto"]]);
  });

  test("a note that is a control is a button with the note's line, and runs on a press", () => {
    let ran = 0;
    const node = fake(noteButton("3 hidden (devknobs' own)", () => ran++));
    expect(node.tag).toBe("button");
    expect(node.type).toBe("button");
    expect(node.className).toBe("note note-button");
    expect(node.textContent).toBe("3 hidden (devknobs' own)");
    node.fire("click");
    expect(ran).toBe(1);
    const own = rules(CSS).filter((rule) => /\.note-button/.test(rule.selector));
    expect(own.map((rule) => rule.selector)).toEqual([".note-button", ".note-button:hover"]);
    for (const rule of own) {
      expect(across(rule.body)).toEqual([]);
      expect(`${rule.selector} {${rule.body}}`).not.toMatch(/(^|[\s;])(border|outline|box-shadow|background|font-weight)(-[a-z-]+)?\s*:/);
    }
  });

  test("the storage view has no css of its own but its lists': its cells and lines are the kit's", () => {
    const own = rules(CSS).filter((rule) => /\.st-/.test(rule.selector));
    expect(own.map((rule) => rule.selector)).toEqual([".st-list"]);
    expect(across(own[0]?.body ?? "")).toEqual([]);
  });

  test("the swatch list's field is the kit's: its own css is for its swatches, the x and the plus", () => {
    const own = rules(CSS).filter((rule) => /\.swatch|\.colors\b/.test(rule.selector));
    expect(own.length).toBeGreaterThan(0);
    for (const rule of own) expect(rule.selector).not.toMatch(/field/);
    expect(CSS).not.toContain(".field-color");
    // A color that does not read shakes the field as a key a shortcut cannot take shakes its chip.
    expect(rules(CSS).map((rule) => rule.selector)).toContain(".key-set.refused, .field.refused");
  });

  test("nothing in the stylesheet is bold", () => {
    expect(CSS).not.toMatch(/font-weight:\s*(bold|[5-9]00)/);
  });
});

describe("a view's chrome", () => {
  /** What a view must not set for itself on a head, a bar or a row's main. */
  const BOX = /(^|[\s;])(padding|border|outline|box-shadow)(-[a-z-]+)?\s*:/;

  /** The rules that may: the shared ones every view and every row goes by. */
  const SHARED = [".toolbar", ".main"];

  /** A rule for the settings' pane, `.keys`, and not for the footer's `.keys-toggle`. */
  const SETTINGS = /\.keys(?![\w-])/;

  /** The shared pieces the settings are built from, which no rule of theirs may name. */
  const PIECE = /\.(view-head|view-actions|row|line|main|lead|row-label|rows-label|group-label|row-button|row-control|clear)(?![\w-])/;

  const MARGIN = /(^|[\s;])margin(-[a-z-]+)?\s*:/;

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
    expect(bar.map((rule) => rule.selector)).toEqual([".toolbar > .filter", ".toolbar > .seg", ".toolbar > .chips"]);
    for (const rule of bar) expect(`${rule.selector} {${rule.body}}`).not.toMatch(BOX);
  });

  test("a row's main is padded by the shared rules alone, so no view moves where its rows start", () => {
    for (const rule of naming(/\.main\b/)) {
      expect(`${rule.selector} {${rule.body}}`).not.toMatch(BOX);
    }
  });

  test("the settings pad, edge and space nothing of their own, and name none of the shared pieces", () => {
    const own = rules(CSS).filter((rule) => SETTINGS.test(rule.selector));
    expect(own.map((rule) => rule.selector)).toContain(".keys");
    for (const rule of own) {
      expect(rule.selector).not.toMatch(PIECE);
      expect(`${rule.selector} {${rule.body}}`).not.toMatch(BOX);
      expect(`${rule.selector} {${rule.body}}`).not.toMatch(MARGIN);
    }
  });

  /**
   * The rules that write a length across out: each is the inside of one
   * control or one cell, never where a line of the panel starts or ends. A
   * rule that is not here reads the columns, `--col-` and `--view-`.
   */
  const INSIDE = [
    // The wrapper's handle and the panel's own frame, with the pixel its edge's border takes.
    ".handle",
    '.wrap[data-side="left"] .handle',
    '.wrap[data-float="true"][data-open="false"] .handle',
    '.wrap[data-float="true"][data-open="false"][data-side="left"] .handle',
    ".panel",
    '.wrap[data-float="true"] .panel',
    '.wrap[data-float="true"][data-side="left"] .panel',
    // The space between an entry's icon and its name.
    ".entry .glyph",
    // The editors' controls: a switch, segments, swatches, chips, fields and a list's options.
    ".knob-switch .switch",
    ".seg",
    ".seg-item",
    ".swatches",
    ".swatch-x",
    ".chip",
    ".field",
    ".chip-field",
    ".field-route",
    ".field-ua",
    ".items",
    ".item",
    ".item::before",
    // The footer, the tooltip and a key's chip.
    ".foot",
    ".tip",
    ".hint-key",
    ".key-set",
    // A text box of a view.
    ".field-area",
    // A declaration's hanging indent and swatch, and the cells of the box's diagram.
    ".css-decl",
    ".css-swatch",
    ".css-applied .css-decl",
    ".bm-name",
    ".bm-v",
    ".bm-content",
  ];

  /** The head, the kit's pieces and a row's parts: what a view is built from. */
  const KIT = /\.(view-head|view-actions|view-body|row|line|main|lead|grip|turn|row-label|row-value|row-button|row-control|row-key|rows-label|toolbar|filter|empty|note|note-button|cell-name|cell-value|cell-end|group|group-head|group-label|pairs|pair-name|pair-value|code|code-text|split|stack|ask|fold|fold-body|add|head|entry|editor|knob-label)(?![\w-])/;

  /** A view's own root, and the panes: where a view could pad all it holds at once. */
  const VIEW = /\.(keys|home|body|pane|view|view-body|styles|css-blocks|req-detail|req-list|req-body|req-headers|st-list)(?![\w-])|#|data-layout/;

  test("no rule writes out where a line starts or ends: a length across is the columns', or the inside of a control", () => {
    const written = rules(CSS).filter((rule) => across(rule.body).some(([, value]) => literal(value)));
    expect(written.map((rule) => rule.selector)).toEqual(INSIDE);
    // None of those places a head, a piece of the kit or a part of a row.
    for (const selector of INSIDE) expect(selector.split(" ").pop()).not.toMatch(KIT);
  });

  test("a view's own root, a pane and a layout pad and space nothing across, so a view cannot move its lines", () => {
    const own = rules(CSS).filter((rule) => VIEW.test(rule.selector));
    expect(own.map((rule) => rule.selector)).toContain(".styles");
    expect(own.map((rule) => rule.selector)).toContain(".req-detail > .note");
    for (const rule of own) expect([rule.selector, across(rule.body)]).toEqual([rule.selector, []]);
  });

  test("a piece of the kit is placed by its one rule: no rule for it inside a view or another piece sets it across", () => {
    for (const rule of rules(CSS)) {
      if (across(rule.body).length === 0) continue;
      const parts = rule.selector.split(",").map((part) => part.trim());
      for (const part of parts) {
        const last = part.split(/[\s>+~]+/).pop() ?? "";
        // A rule may place a piece only by naming it alone, or the small button a row ends with by where it stands.
        if (!KIT.test(last) || last === part) continue;
        expect(PLACED).toContain(part);
      }
    }
  });

  /** The rules that place a kit piece by where it stands, with no length of their own. */
  const PLACED = [
    ".main > .row-button",
    ".main > .row-button:not([hidden]) + .row-control",
  ];

  test("the guards read a rule that breaks them", () => {
    expect(literal("6px")).toBe(true);
    expect(literal("calc(var(--view-start) - 1px)")).toBe(true);
    expect(literal("var(--view-start)")).toBe(false);
    expect(literal("calc(var(--col-pad) / 2)")).toBe(false);
    expect(literal("0")).toBe(false);
    expect(literal("auto")).toBe(false);
    expect(across("padding: 4px 8px 4px 22px;")).toEqual([["padding-right", "8px"], ["padding-left", "22px"]]);
    expect(across("margin: 0 8px;")).toEqual([["margin-right", "8px"], ["margin-left", "8px"]]);
    expect(across("padding-top: 4px; padding-bottom: 4px;")).toEqual([]);
    expect(across("text-indent: -12px; padding-inline: 4px; inset-inline-start: 2px;")).toHaveLength(3);
    expect(".storage .main").toMatch(KIT);
    expect(".req-detail > .note").toMatch(VIEW);
    expect("#styles .row").toMatch(VIEW);
    expect('[data-layout="flush"] .empty').toMatch(VIEW);
    expect(".st-size").not.toMatch(VIEW);
    expect(".keys-toggle").not.toMatch(VIEW);
  });

  test("the guard reads a rule that breaks it", () => {
    expect(".keys .main { padding-right: 2px; }").toMatch(SETTINGS);
    expect(".keys .main { padding-right: 2px; }").toMatch(PIECE);
    expect(".keys .group-label { padding-left: 22px; }").toMatch(PIECE);
    expect(".keys .view-head").toMatch(PIECE);
    expect(".keys .clear { margin: -2px 0 -2px auto; }").toMatch(MARGIN);
    expect(".keys { padding: 0 4px; }").toMatch(BOX);
    expect(".keys-toggle { margin-left: auto; }").not.toMatch(SETTINGS);
    expect(".keys { display: grid; gap: 1px; }").not.toMatch(MARGIN);
    expect(".view-head .main { padding-right: 2px; }").toMatch(BOX);
    expect(".req-bar.toolbar { border-bottom: 1px solid red; }").toMatch(BOX);
    expect(".view-head { border-radius: 4px; outline: 0; }").toMatch(BOX);
    expect(".req-detail .main { width: 100%; padding-left: 8px; }").toMatch(BOX);
    expect(".view-head { box-shadow: none }").toMatch(BOX);
    expect(".view-head { flex: none; }").not.toMatch(BOX);
  });
});
