import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { BINDINGS, type LiveKeys } from "../src/ui/bindings";
import { type Action, actionRow, ROWS, type Row, type RowId } from "../src/ui/catalog";
import { rowBox, rowButton, rowsLabel } from "../src/ui/dom";
import { defaultKeys } from "../src/ui/keys";
import { viewHead } from "../src/ui/pane";
import type { LivePrefs } from "../src/ui/prefs";
import { rowLine } from "../src/ui/rows";
import { createSettings } from "../src/ui/settings";
import { CSS } from "../src/ui/styles";
import type { Tips } from "../src/ui/tooltip";
import { FakeNode, fake, leave, page, rules } from "./kit-dom";

function row(id: RowId): Row {
  const found = ROWS.find((entry) => entry.id === id);
  if (!found) throw new Error(`no row ${id}`);
  return found;
}

function node(tag: string, className = ""): HTMLElement {
  const made = document.createElement(tag);
  made.className = className;
  return made;
}

/** The classes of a node's children, in order. */
function parts(of: unknown): string[] {
  return fake(of).children.map((child) => child.className || child.tag);
}

/** The settings, built with nothing behind them. */
function settings(): FakeNode {
  const keys: LiveKeys = {
    get: () => defaultKeys(),
    custom: () => false,
    set: () => {},
    subscribe: () => () => {},
    recording: false,
    destroy: () => {},
  };
  const prefs: LivePrefs = {
    get: () => ({
      handle: true,
      listWidth: 240,
      viewWidth: 340,
      stylesMode: "simple",
      stylesBox: true,
    }),
    setHandle: () => {},
    setWidth: () => {},
    setStylesMode: () => {},
    setStylesBox: () => {},
    subscribe: () => () => {},
    destroy: () => {},
  };
  const tips: Tips = {
    show: () => {},
    hide: () => false,
    hideAfter: () => {},
    isFor: () => false,
    tooltip: () => {},
    destroy: () => {},
  };
  const made = createSettings({
    keys,
    prefs,
    grab: null,
    inspect: null,
    mac: true,
    bindingsHere: BINDINGS,
    keysToggle: document.createElement("button"),
    said: node("div"),
    tips,
    render: () => {},
    renderKeys: () => {},
    searching: () => false,
    leaveSearch: () => {},
  });
  return fake(made.view);
}

beforeEach(page);
afterEach(leave);

describe("the row builder", () => {
  test("a row is a line: what leads, the main with its icon, title and ends, then what comes after", () => {
    const main = node("button", "main");
    const grip = node("button", "grip");
    const value = node("span", "row-value");
    const clear = node("button", "clear");
    const { box, label } = rowBox({
      main,
      grip,
      glyph: node("svg", "glyph"),
      title: "device",
      ends: [value],
      after: [clear],
    });
    expect(box.className).toBe("row");
    expect(parts(box)).toEqual(["line"]);
    expect(parts(fake(box).children[0])).toEqual(["lead grip", "main", "clear"]);
    expect(parts(main)).toEqual(["glyph", "row-label", "row-value"]);
    expect(label.textContent).toBe("device");
  });

  test("the leading slot is one class, whatever stands in it: a grip beside the main, a chevron in it", () => {
    const grip = node("button", "grip");
    rowBox({ main: node("button", "main"), grip, title: "scheme" });
    const back = node("button", "main");
    const chevron = node("svg", "glyph");
    rowBox({ main: back, lead: chevron, title: "styles" });
    const [slot] = fake(back).children;
    expect(fake(grip).classes()).toContain("lead");
    expect(slot?.className).toBe("lead");
    expect(slot?.children).toEqual([fake(chevron)]);
    // The chevron is part of its button: a press on it is a press on the main.
    expect(parts(back)).toEqual(["lead", "row-label"]);
  });

  test("a row with nothing leading has no slot node, and the same main: the padding keeps the column", () => {
    const main = node("div", "main");
    const { box } = rowBox({ main, glyph: node("svg", "glyph"), title: "show handle" });
    expect(parts(fake(box).children[0])).toEqual(["main"]);
    expect(parts(main)).toEqual(["glyph", "row-label"]);
  });

  test("the slot's place and width are said once, for a grip and a chevron alike", () => {
    const all = rules(CSS);
    const slot = all.filter((rule) => rule.selector === ".lead");
    expect(slot).toHaveLength(1);
    expect(slot[0]?.body).toMatch(/left:\s*4px/);
    expect(slot[0]?.body).toMatch(/width:\s*14px/);
    expect(slot[0]?.body).toMatch(/position:\s*absolute/);
    // 4 for the slot's left, 14 for the slot, 4 more: where every row's content starts.
    const main = all.find((rule) => rule.selector === ".main");
    expect(main?.body).toMatch(/padding:\s*4px 8px 4px 22px/);
    const geometry = /(^|[\s;])(width|left|right|position|padding|margin)\s*:/;
    for (const rule of all) {
      const leading = /\.(lead|grip|turn)\b/.test(rule.selector) && rule.selector !== ".lead";
      if (leading) expect(`${rule.selector} {${rule.body}}`).not.toMatch(geometry);
    }
  });

  test("the small button a row ends with is one class, named for the code that looks for it", () => {
    const x = rowButton("clear", node("svg", "glyph"), "reset device");
    expect(x.className).toBe("row-button clear");
    expect(x.type).toBe("button");
    expect(fake(x).attributes.get("aria-label")).toBe("reset device");
    const selectors = rules(CSS).map((rule) => rule.selector);
    expect(selectors).toContain(".row-button");
    expect(selectors).not.toContain(".clear");
    expect(selectors).not.toContain(".view-action");
  });
});

describe("a row's line", () => {
  test("a knob row: the grip, its icon and name, what it says, and its x", () => {
    const line = rowLine(row("device"));
    expect(line.box.dataset.row).toBe("device");
    expect(parts(fake(line.box).children[0])).toEqual(["lead grip", "main", "row-button clear"]);
    expect(parts(line.main)).toEqual(["glyph", "row-label", "row-value"]);
    expect(line.key).toBeNull();
    expect(fake(line.clear).attributes.get("aria-label")).toBe("reset device");
    expect(fake(line.grip).attributes.get("aria-label")).toBe("move device");
  });

  test("an action's row is the same line, with its key at the end", () => {
    const knob = rowLine(row("device"));
    const line = rowLine(row("grab"));
    expect(line.box.className).toBe(knob.box.className);
    expect(line.main.className).toBe(knob.main.className);
    expect(line.grip.className).toBe(knob.grip.className);
    expect(line.clear.className).toBe(knob.clear.className);
    expect(parts(fake(line.box).children[0])).toEqual(parts(fake(knob.box).children[0]));
    expect(parts(line.main)).toEqual(["glyph", "row-label", "row-value", "hint-key row-key"]);
    expect(fake(line.main).children[1]?.textContent).toBe("grab");
    expect(fake(line.clear).attributes.get("aria-label")).toBe("remove grab");
  });

  test("inspect's row is that line too: its icon, its name, its key, and an x that removes it", () => {
    const grab = rowLine(row("grab"));
    const line = rowLine(row("inspect"));
    expect(line.box.dataset.row).toBe("inspect");
    expect(line.box.className).toBe(grab.box.className);
    expect(parts(fake(line.box).children[0])).toEqual(["lead grip", "main", "row-button clear"]);
    expect(parts(line.main)).toEqual(["glyph", "row-label", "row-value", "hint-key row-key"]);
    expect(fake(line.main).children[1]?.textContent).toBe("inspect");
    expect(fake(line.clear).attributes.get("aria-label")).toBe("remove inspect");
    expect(fake(line.grip).attributes.get("aria-label")).toBe("move inspect");
  });

  test("the requests' row is that line too: its icon, its name, off or on, its key, and an x that removes it", () => {
    const line = rowLine(row("requests"));
    expect(line.box.className).toBe(rowLine(row("device")).box.className);
    expect(line.box.dataset.row).toBe("requests");
    expect(parts(fake(line.box).children[0])).toEqual(["lead grip", "main", "row-button clear"]);
    expect(parts(line.main)).toEqual(["glyph", "row-label", "row-value", "hint-key row-key"]);
    expect(fake(line.main).children[1]?.textContent).toBe("requests");
    expect(fake(line.clear).attributes.get("aria-label")).toBe("remove requests");
    expect(fake(line.grip).attributes.get("aria-label")).toBe("move requests");
  });

  test("an action no code knows by name gets the whole line from its entry", () => {
    const entry: Action = {
      id: "fake" as Action["id"],
      label: "fake thing",
      long: "does a fake thing",
      aliases: [],
      icon: "eye",
      run: () => {},
    };
    const line = rowLine(actionRow(entry));
    expect(line.box.dataset.row).toBe("fake");
    expect(parts(fake(line.box).children[0])).toEqual(["lead grip", "main", "row-button clear"]);
    // With no binding it has no key to show.
    expect(parts(line.main)).toEqual(["glyph", "row-label", "row-value"]);
    expect(line.key).toBeNull();
    expect(fake(line.main).children[1]?.textContent).toBe("fake thing");
    expect(rowLine(actionRow({ ...entry, binding: "reset" })).key?.className).toBe(
      "hint-key row-key",
    );
  });
});

describe("the settings' head", () => {
  test("is the head every view has: the slot empty, its way back where a row's icon is, then its title", () => {
    const view = settings();
    const [head, handle] = view.children;
    expect(head?.className).toBe("row view-head");
    const [line] = head?.children ?? [];
    expect(parts(line)).toEqual(["main", "view-actions"]);
    const [back] = line?.children ?? [];
    expect(back?.tag).toBe("button");
    expect(parts(back)).toEqual(["glyph", "row-label"]);
    expect(back?.children[1]?.textContent).toBe("settings");
    expect(back?.attributes.get("aria-label")).toBe("back from settings");
    // The rows under it keep the slot empty, and start with their icon.
    expect(parts(handle?.children[0]?.children[0])).toEqual([
      "glyph sided",
      "row-label",
      "switch row-control",
    ]);
  });

  test("is built as the head of a view is, node for node", () => {
    /** A node's tag, classes and children, with no text. */
    const shape = (of: FakeNode): unknown => [of.tag, of.className, of.children.map(shape)];
    const [head] = settings().children;
    expect(head ? shape(head) : null).toEqual(shape(fake(viewHead().box)));
  });

  test("the shortcuts' title is the rows' label, over the rows' icons by the one shared rule", () => {
    const view = settings();
    expect(view.children[2]?.className).toBe("rows-label");
    expect(view.children[2]?.textContent).toBe("shortcuts");
    expect(fake(rowsLabel("shortcuts")).className).toBe("rows-label");
    const label = rules(CSS).filter((rule) => /\.rows-label\b/.test(rule.selector));
    expect(label.map((rule) => rule.selector)).toEqual([".rows-label"]);
    // 22, where the main's padding puts a row's icon.
    expect(label[0]?.body).toMatch(/padding:\s*8px 8px 2px 22px/);
  });

  test("a shortcut ends with its x, the button a row's is, then its key", () => {
    const view = settings();
    const shortcut = view.children[3];
    const main = shortcut?.children[0]?.children[0];
    expect(parts(main)).toEqual([
      "glyph sided",
      "row-label",
      "row-button clear",
      "key-set row-control",
    ]);
  });
});
