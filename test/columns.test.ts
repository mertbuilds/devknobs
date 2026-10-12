import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { LAYOUTS, type Layout } from "../src/ui/dom";
import { icon } from "../src/ui/icons";
import type { PaneView } from "../src/ui/pane";
import { CSS } from "../src/ui/styles";
import { declarations, path, readSelector, readSheet } from "./columns";
import { fake, leave, page, rules } from "./kit-dom";

/**
 * Where every line of the panel starts and ends, read off the stylesheet it
 * ships. A head, a row and each piece of the kit start at the one place the
 * view's layout says, so a view's head cannot stand apart from its content,
 * whatever the view is and whichever layout it names.
 */

const sheet = readSheet(CSS);

/** What every pane stands in. Lengths are told from the body's edges, which are the panes'. */
const BODY = ["wrap", "panel", "body"];
const zero = { left: sheet.left(path(...BODY)), right: sheet.right(path(...BODY)) };

/** How far in from the pane's left edge what is in a part starts, and its box. */
const left = (...nodes: string[]): number => sheet.left(path(...nodes)) - zero.left;
const boxLeft = (...nodes: string[]): number => sheet.boxLeft(path(...nodes)) - zero.left;
/** How far in from the pane's right edge what is in a part ends, and its box. */
const right = (...nodes: string[]): number => sheet.right(path(...nodes)) - zero.right;
const boxRight = (...nodes: string[]): number => sheet.boxRight(path(...nodes)) - zero.right;

/** A column token, in px. */
const token = (name: string): number => sheet.px(path("wrap"), name);
const PAD = token("--col-pad");
const ICON = token("--col-icon");
const GAP = token("--col-gap");
const INSET = token("--col-inset");
const GRIP = token("--col-grip");

/** A feature's view in a layout, the rows' pane and the settings'. */
const view = (layout: Layout): string[] => [...BODY, `view pane data-layout=${layout}`];
const HOME = [...BODY, "home pane data-layout=rows"];
const KEYS = [...BODY, "keys pane data-layout=rows"];

/** Where the lines of a view in a layout start, as the one rule for the layout says. */
const start = (layout: Layout): number => sheet.px(path(...view(layout)), "--view-start");

/** A row's line down to its main, which holds its icon and its name. */
const MAIN = ["row", "line", "button main"];

/** What a view mounts in its body, and what its lists are in: none of them moves a line. */
const ROOTS: string[][] = [[], ["styles"], ["req-detail"], ["req-detail", "req-body"], ["req-list"], ["st-list"], ["st-list", "st-list"]];

/** Every kind of line the kit builds whose first glyph stands at the start of the view's lines. */
const LINES: Record<string, string[]> = {
  "rowBox, a list's row": ["row", "line", "div main"],
  "sectionFold, its chevron": MAIN,
  "entryFold, its chevron": MAIN,
  "entryRow, its name": ["row", "line", "div main", "span row-label cell-name"],
  emptyLine: ["empty"],
  noteLine: ["note"],
  noteButton: ["button note note-button"],
  rowsLabel: ["rows-label"],
  "group, its label": ["group", "group-head", "span group-label"],
  "group, a note in it": ["group", "note"],
  pairs: ["dl pairs"],
  "pairs in a group": ["group", "dl pairs"],
  "codeBlock, its text": ["code", "pre code-text"],
};

/** The kit's boxes, which go edge to edge: a bar and what is in it, a row's ground, a block of code. */
const BOXES: Record<string, string[]> = {
  toolbar: ["toolbar"],
  "filterField in a bar": ["toolbar", "input field filter"],
  "segments in a bar": ["toolbar", "seg"],
  "controls in a bar": ["toolbar", "chips"],
  "a row's ground": ["row"],
  "codeBlock, its ground": ["code", "pre code-text"],
  stack: ["stack"],
};

beforeEach(page);
afterEach(leave);

describe("the columns", () => {
  test("are said once, on the wrapper: the pad, an icon, the gap, the inset, and the grip's column from them", () => {
    expect({ PAD, ICON, GAP, INSET, GRIP }).toEqual({ PAD: 4, ICON: 14, GAP: 8, INSET: 10, GRIP: 22 });
    expect(GRIP).toBe(PAD + ICON + PAD);
    const setting = rules(CSS).filter((rule) => /(^|[\s;])--col-[\w-]+\s*:/.test(rule.body));
    expect(setting.map((rule) => rule.selector)).toEqual([".wrap"]);
  });

  test("an icon is drawn as wide as its column", () => {
    expect(Number(fake(icon("x")).attributes.get("width"))).toBe(ICON);
    expect(Number(fake(icon("chevron-left")).attributes.get("width"))).toBe(ICON);
  });

  test("each layout has one rule, which sets where the lines start and nothing else", () => {
    const named = rules(CSS).filter((rule) => rule.selector.includes("data-layout"));
    expect(named.map((rule) => rule.selector)).toEqual(LAYOUTS.map((layout) => `[data-layout="${layout}"]`));
    for (const rule of named) expect([...declarations(rule.body).keys()]).toEqual(["--view-start"]);
    expect(start("rows")).toBe(GRIP);
    expect(start("flush")).toBe(INSET);
  });

  test("where the lines start and end is set by the wrapper, a layout, and what folds out under a row, and by nothing else", () => {
    const setting = rules(CSS).filter((rule) => /(^|[\s;])--view-(start|end)\s*:/.test(rule.body));
    expect(setting.map((rule) => rule.selector)).toEqual([
      ".wrap",
      '[data-layout="rows"]',
      '[data-layout="flush"]',
      ".editor, .stack",
    ]);
  });

  test("the resolver reads every rule that could move a part: one it cannot read sets no length across", () => {
    for (const rule of rules(CSS)) {
      const unread = rule.selector.split(",").some((part) => readSelector(part.trim()) === null);
      // A rule in a keyframe, or one for a state, a pseudo-element or a sibling.
      if (!unread) continue;
      for (const [name, value] of declarations(rule.body)) {
        if (!/^(padding|margin)-(left|right)$|^(left|right)$/.test(name)) continue;
        if (/\.(wrap|handle|sizer|switch|fold-|swatch|item)/.test(rule.selector)) continue;
        expect(`${rule.selector} { ${name}: ${value} }`).toMatch(/: (0|auto) \}$/);
      }
    }
  });
});

describe("the knob rows' columns", () => {
  const ROW = [...HOME, "rows", "row"];

  test("the grip stands in its column, the icon after it, then the name", () => {
    expect(boxLeft(...ROW)).toBe(0);
    expect(boxLeft(...ROW, "line", "button lead grip")).toBe(PAD);
    expect(sheet.px(path(...ROW, "line", "button lead grip"), "width")).toBe(ICON);
    const glyph = left(...ROW, "line", "button main");
    expect(glyph).toBe(GRIP);
    expect(glyph).toBe(start("rows"));
    expect(glyph + ICON + sheet.px(path(...ROW, "line", "button main"), "column-gap")).toBe(GRIP + ICON + GAP);
  });

  test("the row's value ends the inset short of its x, and the x half the pad short of the edge", () => {
    expect(right(...ROW, "line", "button main")).toBe(INSET);
    expect(boxRight(...ROW, "line", "button row-button clear")).toBe(PAD / 2);
  });

  test("the list's own lines are on the same columns: add knob, the empty state, and a row's editor", () => {
    expect(left(...HOME, "button add")).toBe(GRIP);
    expect(sheet.px(path(...HOME, "button add"), "column-gap")).toBe(GAP);
    expect(right(...HOME, "button add")).toBe(INSET);
    expect(left(...HOME, "empty")).toBe(GRIP);
    expect(boxLeft(...ROW, "fold", "editor", "knob")).toBe(PAD);
    expect(left(...ROW, "fold", "editor", "knob", "knob-label")).toBe(INSET);
    expect(left(...ROW, "fold", "editor", "extra", "note")).toBe(INSET);
    expect(right(...ROW, "fold", "editor", "knob", "knob-label")).toBe(INSET);
  });

  test("the search and its results start at the inset, and end where the rows do", () => {
    const head = [...HOME, "label head data-layout=flush"];
    const results = [...HOME, "results data-layout=flush"];
    expect(left(...head)).toBe(INSET);
    expect(right(...head)).toBe(INSET);
    expect(boxRight(...head, "button search-close")).toBe(PAD);
    expect(left(...results, "entry")).toBe(INSET);
    expect(left(...results, "group-label")).toBe(INSET);
    expect(left(...results, "empty")).toBe(INSET);
    expect(right(...results, "entry")).toBe(INSET);
    // The check of the value that is on ends where a row's x does.
    expect(boxRight(...results, "entry", "svg glyph entry-check")).toBe(PAD / 2);
  });
});

for (const layout of LAYOUTS) {
  describe(`a view whose layout is ${layout}`, () => {
    const pane = view(layout);
    const head = [...pane, "row view-head", "line"];
    const body = [...pane, "view-body"];
    const at = start(layout);

    test("the head's chevron starts where the view's lines start, and its title an icon and the gap on", () => {
      const main = [...head, "button main"];
      expect(left(...main)).toBe(at);
      expect(sheet.px(path(...main), "column-gap")).toBe(GAP);
      // The head is a row: the same rule places it and a row of the view.
      expect(left(...main)).toBe(left(...body, ...MAIN));
      expect(boxLeft(...pane, "row view-head")).toBe(0);
    });

    test("every line the kit builds starts there too, whatever the view mounts it in", () => {
      for (const root of ROOTS) {
        for (const [name, nodes] of Object.entries(LINES)) {
          expect([name, root.join(" "), left(...body, ...root, ...nodes)]).toEqual([name, root.join(" "), at]);
        }
        // A bar in parts starts there by its margin, as it has no words.
        expect(boxLeft(...body, ...root, "split")).toBe(at);
      }
    });

    test("a box with a ground goes edge to edge, and what is read in it starts with the lines", () => {
      for (const root of ROOTS) {
        for (const [name, nodes] of Object.entries(BOXES)) {
          expect([name, boxLeft(...body, ...root, ...nodes)]).toEqual([name, 0]);
          expect([name, boxRight(...body, ...root, ...nodes)]).toEqual([name, 0]);
        }
      }
    });

    test("a table's cells stand in a row's line and set no length across: its content starts and ends where the row's does", () => {
      for (const root of ROOTS) {
        const main = [...body, ...root, ...MAIN];
        const name = left(...main, "span row-label cell-name columned");
        expect(name).toBe(at);
        expect(left(...main, "span row-label cell-name columned quiet")).toBe(name);
        expect(left(...main, "span cell-value")).toBe(at);
        expect(right(...main, "span cell-end")).toBe(INSET);
        expect(right(...main, "span cell-value")).toBe(INSET);
      }
    });

    test("what folds out under a row sits the pad in, and its words at the inset, whatever the layout", () => {
      for (const holder of [["stack"], ["row", "fold", "fold-body", "stack"], ["st-list", "row", "fold", "fold-body", "stack"]]) {
        const stack = [...body, ...holder];
        expect(left(...stack)).toBe(PAD);
        expect(right(...stack)).toBe(PAD);
        for (const [name, nodes] of Object.entries(LINES)) {
          expect([name, left(...stack, ...nodes)]).toEqual([name, INSET]);
        }
        expect(left(...stack, "ask", "note")).toBe(INSET);
        expect(right(...stack, "ask", "note")).toBe(INSET);
        expect(boxLeft(...stack, "code", "pre code-text")).toBe(PAD);
        expect(boxLeft(...stack, "chips")).toBe(PAD);
        // One more step in for each fold inside a fold.
        expect(left(...stack, "row", "fold", "fold-body", "stack", "note")).toBe(INSET + PAD);
      }
    });

    test("every line ends the inset short of the far edge, and a small button half the pad short of it", () => {
      expect(right(...head, "button main")).toBe(INSET);
      expect(right(...body, ...MAIN)).toBe(INSET);
      for (const name of ["emptyLine", "noteLine", "noteButton", "rowsLabel", "pairs", "codeBlock, its text"]) {
        expect([name, right(...body, ...(LINES[name] ?? []))]).toEqual([name, INSET]);
      }
      expect(boxRight(...body, "split")).toBe(INSET);
      const action = boxRight(...head, "view-actions", "button row-button view-action");
      expect(action).toBe(PAD / 2);
      expect(boxRight(...body, "row", "line", "button row-button clear")).toBe(action);
      expect(boxRight(...body, "group", "group-head", "button row-button req-copy")).toBe(action);
    });

    test("the views' own lines start and end with the kit's: the crumbs, a css block, the box's facts, a request's summary", () => {
      const styles = [...body, "styles"];
      const blocks = [...styles, "css-blocks"];
      const diagram = [...styles, "row", "fold", "fold-body", "box-model"];
      const detail = [...body, "req-detail"];
      const own: Record<string, string[]> = {
        crumbs: [...styles, "crumbs"],
        "a css block": [...blocks, "section css-block"],
        "what applies": [...blocks, "css-block css-applied"],
        "what is inherited, in its fold": [...blocks, "row", "fold", "fold-body", "css-applied"],
        "a block's heading": [...blocks, "button css-group"],
        "what is hidden": [...blocks, "css-hidden"],
        "the box's line": [...diagram, "bm-line"],
        "the box's facts": [...diagram, "bm-facts"],
        "a request's summary": [...detail, "toolbar", "req-sum"],
        "a stack's frames": [...detail, "req-body", "group", "req-stack"],
      };
      for (const [name, nodes] of Object.entries(own)) {
        expect([name, left(...nodes), right(...nodes)]).toEqual([name, at, INSET]);
      }
      expect(boxLeft(...blocks, "section css-block")).toBe(0);
      expect(boxLeft(...diagram, "bm-ring bm-margin")).toBe(0);
      expect(right(...body, "toolbar", "span req-count")).toBe(INSET);
    });
  });
}

describe("the settings", () => {
  test("are on the knob rows' columns: the head's chevron, a row's icon and the shortcuts' title all start past the grip's", () => {
    const chevron = left(...KEYS, "row view-head", "line", "button main");
    expect(chevron).toBe(GRIP);
    expect(left(...KEYS, "row", "line", "div main")).toBe(chevron);
    expect(left(...KEYS, "rows-label")).toBe(chevron);
    expect(chevron).toBe(left(...HOME, "rows", "row", "line", "button main"));
    // A key ends where a knob row's value would with no x after it.
    expect(right(...KEYS, "row", "line", "div main")).toBe(INSET);
  });
});

describe("every view", () => {
  const SOURCES = join(import.meta.dir, "..", "src", "ui");
  const files = readdirSync(SOURCES).filter((name) => name.endsWith(".ts"));
  const source = (name: string): string => readFileSync(join(SOURCES, name), "utf8");

  test("names its layout: a view with none does not typecheck", () => {
    const mount = (): void => {};
    // @ts-expect-error a view must say where its lines start
    const bare: PaneView = { id: "bare", title: "bare", mount };
    const laid: PaneView = { id: "laid", title: "laid", layout: "flush", mount };
    expect(bare.layout).toBeUndefined();
    expect(LAYOUTS).toContain(laid.layout);
  });

  test("names it as data, where it is opened: a layout is set on a node by the pane, the settings and the rows alone", () => {
    const setting = files.filter((name) => /\blay\(/.test(source(name).replace(/export function lay\(/, "")));
    expect(setting.sort()).toEqual(["pane.ts", "panel.ts", "settings.ts"]);
    for (const name of files) expect([name, /data-layout|dataset\.layout/.test(source(name))]).toEqual([name, name === "dom.ts" || name === "styles.ts"]);
    // The pane sets the one its view names, and nothing but a view's own word for it.
    expect(source("pane.ts")).toContain("lay(node, view.layout);");
  });

  test("has the one head: nothing but viewHead builds a head, and the pane and the settings both ask it", () => {
    const heads = files.filter((name) => source(name).includes("view-head"));
    expect(heads.filter((name) => name !== "styles.ts")).toEqual(["pane.ts"]);
    expect(source("pane.ts").match(/view-head/g)).toHaveLength(1);
    const asking = files.filter((name) => /\bviewHead\(\)/.test(source(name)));
    expect(asking.sort()).toEqual(["pane.ts", "settings.ts"]);
    // The way back's chevron is drawn there and in the kit's fold, and by no view.
    const chevrons = files.filter((name) => source(name).includes('icon("chevron-left")'));
    expect(chevrons.sort()).toEqual(["kit.ts", "pane.ts"]);
  });
});
