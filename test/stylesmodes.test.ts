import { afterEach, beforeEach, describe, expect, jest, test } from "bun:test";
import { DEFAULT_STATE } from "../src/engine/store";
import type { Inspection, RuleBlock, StyleBlock, StyleDeclaration } from "../src/styles/types";
import type { DevknobsState } from "../src/types";
import { createPrefs, PREFS_KEY, type StylesMode } from "../src/ui/prefs";
import { NO_STYLES } from "../src/ui/stylesapplied";
import {
  createStylesView,
  EMPTY,
  NO_MATCH,
  NO_RULES,
  PICK,
  SETTLE,
  type StylesPage,
  type StylesView,
} from "../src/ui/stylesview";
import type { Tips } from "../src/ui/tooltip";
import {
  as,
  element,
  type FakeDocument,
  type FakeElement,
  FakeNode,
  FakeObserver,
  fake,
  pageDocument,
} from "./styles-dom";

/**
 * The two modes of the styles view: the control that picks one, where the
 * choice is kept, and what the simple mode shows. The advanced mode is in
 * stylesview.test.ts, which has no control and so is that mode alone.
 */

function declaration(
  name: string,
  value: string,
  more: Partial<StyleDeclaration> = {},
): StyleDeclaration {
  return { name, value, important: false, longhands: [name], overridden: false, variables: [], ...more };
}

let ids = 0;

function rule(selector: string, declarations: StyleDeclaration[]): RuleBlock {
  return {
    kind: "rule",
    id: ids++,
    selectorText: selector,
    selector: [{ text: selector, matches: true }],
    specificity: [0, 1, 0],
    origin: { sheet: "https://example.com/assets/app.css", owner: "link", path: [0] },
    context: [],
    declarations,
    rule: {} as CSSStyleRule,
  };
}

function found(blocks: StyleBlock[], more: Partial<Inspection> = {}): Inspection {
  return {
    target: { label: "button#save.primary", pseudo: null },
    blocks,
    hidden: [],
    variables: {},
    skipped: 0,
    ...more,
  };
}

let doc: FakeDocument;
let app: FakeElement;
let save: FakeElement;
let asked: { element: Element; pseudo: string | undefined }[];
let answer: (element: Element, pseudo?: string) => Inspection;
let knobs: ((state: DevknobsState) => void)[];
let tipped: FakeNode[];
/** The mode that is kept, and each one the view asked to keep. */
let stored: StylesMode;
let kept: StylesMode[];
let paneBody: FakeNode;
let view: StylesView | null = null;

const page: StylesPage = {
  inspect: (target, pseudo) => {
    asked.push({ element: target, pseudo });
    return answer(target, pseudo);
  },
  invalidate: () => undefined,
  getState: () => DEFAULT_STATE,
  subscribe: (listener) => {
    knobs.push(listener);
    return () => {
      knobs = knobs.filter((one) => one !== listener);
    };
  },
  isColor: (text) => /^#[0-9a-f]{3,8}$/i.test(text) || text === "red",
  box: () => null,
};

const tips: Tips = {
  show: () => undefined,
  hide: () => false,
  hideAfter: () => undefined,
  isFor: () => false,
  tooltip: (node) => {
    tipped.push(fake(node));
  },
  destroy: () => undefined,
};

const mode = {
  get: () => stored,
  set: (next: StylesMode) => {
    stored = next;
    kept.push(next);
  },
};

function start(door: typeof mode = mode): FakeNode {
  view = createStylesView(
    { tips, title: () => undefined, outline: () => undefined, mode: door },
    page,
  );
  paneBody = new FakeNode("div");
  paneBody.append(fake(view.node));
  return fake(view.node);
}

/** The lines that show, as text, in the order they stand. */
function lines(node: FakeNode): string[] {
  return node.shown("css-decl").map((one) => one.textContent);
}

function labels(node: FakeNode): string[] {
  return node.shown("css-label").map((one) => one.textContent);
}

function note(node: FakeNode): string | null {
  const [one] = node.shown("empty");
  return one ? one.textContent : null;
}

/** The control's two choices: what each says, and whether it is the one that is on. */
function choices(node: FakeNode): [string, string | null, boolean][] {
  return (node.find("seg")[0]?.find("seg-item") ?? []).map((item) => [
    item.textContent,
    item.getAttribute("aria-checked"),
    item.classList.contains("on"),
  ]);
}

function choose(node: FakeNode, name: StylesMode): void {
  const item = node.find("seg-item").find((one) => one.textContent === name);
  if (!item) throw new Error(`no ${name}`);
  item.fire("click");
}

function typed(node: FakeNode, text: string): void {
  const [filter] = node.find("filter");
  if (!filter) throw new Error("no filter");
  filter.value = text;
  filter.fire("input");
}

/** The row that folds what is inherited, which the kit builds. */
/** The styles under the bar and the box, where the fold of what is inherited is. */
function styles(node: FakeNode): FakeNode {
  const [blocks] = node.find("css-blocks");
  if (!blocks) throw new Error("no styles");
  return blocks;
}

function heading(node: FakeNode): FakeNode {
  const [head] = styles(node).find("row").flatMap((row) => row.find("main"));
  if (!head) throw new Error("no inherited heading");
  return head;
}

/** A button with styles of every kind: overridden, shorthand, custom property, inherited. */
function sample(): Inspection {
  const sides = ["margin-top", "margin-right", "margin-bottom", "margin-left"];
  return found(
    [
      { kind: "inline", id: ids++, element: as(save), declarations: [declaration("margin-top", "8px")] },
      rule(".primary", [
        declaration("color", "var(--ink)", { variables: ["--ink"] }),
        declaration("background", "#2563eb", { important: true }),
        declaration("--ring", "2px"),
        declaration("transition", "color 120ms"),
        declaration("padding", "4px 8px"),
      ]),
      rule("button", [
        declaration("display", "inline-flex"),
        declaration("color", "black", { overridden: true }),
        declaration("margin", "0", { longhands: sides }),
        declaration("cursor", "pointer"),
      ]),
      {
        kind: "pseudo",
        pseudo: "::before",
        blocks: [rule(".primary::before", [declaration("content", '"+"')])],
      },
      {
        kind: "inherited",
        from: "div#app.shell",
        element: as(app),
        blocks: [rule("#app", [declaration("font-size", "14px")])],
      },
      {
        kind: "inherited",
        from: "body",
        element: as(app),
        blocks: [
          rule("body", [
            declaration("font-size", "16px", { overridden: true }),
            declaration("line-height", "1.5"),
            declaration("--ink", "#111827"),
          ]),
        ],
      },
    ],
    { variables: { "--ink": { value: "#111827", definedIn: 9 } } },
  );
}

beforeEach(() => {
  jest.useFakeTimers();
  ids = 0;
  doc = pageDocument();
  const html = element(doc, "html");
  const body = element(doc, "body", {}, html);
  app = element(doc, "div", { id: "app", class: "shell" }, body);
  save = element(doc, "button", { id: "save", class: "primary" }, app);
  asked = [];
  knobs = [];
  tipped = [];
  stored = "simple";
  kept = [];
  FakeObserver.made = [];
  answer = sample;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: Object.assign(new EventTarget(), {
      setTimeout: (run: () => void, delay: number) => setTimeout(run, delay),
    }),
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      createElement: (tag: string) => new FakeNode(tag),
      createElementNS: (_namespace: string, tag: string) => new FakeNode(tag),
    },
  });
  Object.defineProperty(globalThis, "MutationObserver", { configurable: true, value: FakeObserver });
});

afterEach(() => {
  view?.destroy();
  view = null;
  jest.useRealTimers();
  for (const name of ["window", "document", "MutationObserver"]) {
    Reflect.deleteProperty(globalThis, name);
  }
});

describe("the control of the two modes", () => {
  test("is a radio group of two in the bar, beside the filter, simple first", () => {
    const node = start();
    const [bar] = node.find("toolbar");
    const [control] = node.find("seg");
    expect(bar?.children).toEqual([node.find("filter")[0] as FakeNode, control as FakeNode]);
    // The kit's segments, with no class of the view's own.
    expect(control?.className).toBe("seg");
    expect(control?.getAttribute("role")).toBe("radiogroup");
    expect(control?.getAttribute("aria-label")).toBe("how the styles are shown");
    expect(control?.find("seg-item").map((item) => item.getAttribute("role"))).toEqual(["radio", "radio"]);
    expect(choices(node).map(([text]) => text)).toEqual(["simple", "advanced"]);
  });

  test("marks the mode that is on, and is one stop for the tab key", () => {
    const node = start();
    expect(choices(node)).toEqual([
      ["simple", "true", true],
      ["advanced", "false", false],
    ]);
    expect(node.find("seg-item").map((item) => item.tabIndex)).toEqual([0, -1]);
    choose(node, "advanced");
    expect(choices(node)).toEqual([
      ["simple", "false", false],
      ["advanced", "true", true],
    ]);
    expect(node.find("seg-item").map((item) => item.tabIndex)).toEqual([-1, 0]);
  });

  test("starts in the mode that is kept, and keeps the one picked", () => {
    stored = "advanced";
    const node = start();
    view?.show(as(save));
    expect(choices(node)[1]).toEqual(["advanced", "true", true]);
    expect(node.find("css-selector").length).toBeGreaterThan(0);
    choose(node, "simple");
    expect(kept).toEqual(["simple"]);
    expect(node.find("css-selector")).toEqual([]);
  });

  test("a press on the mode that is on keeps nothing and draws nothing", () => {
    const node = start();
    view?.show(as(save));
    const before = node.find("css-decl");
    choose(node, "simple");
    expect(kept).toEqual([]);
    expect(node.find("css-decl")).toEqual(before);
  });

  test("the arrows move the choice with the focus", () => {
    const node = start();
    view?.show(as(save));
    const [simple, advanced] = node.find("seg-item");
    const event = { key: "ArrowRight", target: simple, prevented: false };
    const press = {
      ...event,
      preventDefault: () => {
        event.prevented = true;
      },
      stopPropagation: () => undefined,
    };
    for (const listener of node.find("seg")[0]?.listeners.get("keydown") ?? []) {
      listener(press);
    }
    expect(kept).toEqual(["advanced"]);
    expect(advanced?.focused).toBe(true);
    expect(event.prevented).toBe(true);
    expect(choices(node)).toEqual([
      ["simple", "false", false],
      ["advanced", "true", true],
    ]);
  });

  test("a switch draws once from what was read, and asks the engine nothing", () => {
    const node = start();
    view?.show(as(save));
    expect(asked).toHaveLength(1);
    const simple = node.find("css-blocks")[0]?.children ?? [];
    choose(node, "advanced");
    const advanced = node.find("css-blocks")[0]?.children ?? [];
    expect(asked).toHaveLength(1);
    expect(advanced).not.toEqual(simple);
    expect(node.find("css-block").map((block) => block.getAttribute("aria-label"))).toEqual([
      "element.style",
      ".primary",
      "button",
      ".primary::before",
      "#app",
      "body",
    ]);
    // Nothing of the simple mode is left under the advanced one.
    expect(node.find("css-applied")).toEqual([]);
    expect(styles(node).find("row")).toEqual([]);
    choose(node, "simple");
    expect(asked).toHaveLength(1);
    expect(node.find("css-selector")).toEqual([]);
    expect(node.find("css-s")).toEqual([]);
  });

  test("a switch keeps the element, the filter's text and the crumbs, and starts from the top", () => {
    const node = start();
    view?.show(as(save));
    typed(node, "color");
    paneBody.scrollTop = 120;
    const crumbs = node.find("crumb");
    choose(node, "advanced");
    expect(paneBody.scrollTop).toBe(0);
    expect(node.find("filter")[0]?.value).toBe("color");
    expect(node.find("crumb")).toEqual(crumbs);
    expect(node.shown("css-decl").map((one) => one.textContent)).toEqual([
      "color: var(--ink);",
      "transition: color 120ms;",
      "color: black;",
    ]);
    choose(node, "simple");
    expect(lines(node)).toEqual(["color: var(--ink) → #111827", "transition: color 120ms"]);
  });

  test("before a pick shows with the bar hidden, and a switch then draws nothing", () => {
    const node = start();
    expect(node.shown("seg")).toEqual([]);
    choose(node, "advanced");
    expect(kept).toEqual(["advanced"]);
    expect(asked).toEqual([]);
    expect(node.find("css-block")).toEqual([]);
  });

  test("a view handed no mode is the advanced one, with no control", () => {
    view = createStylesView({ tips, title: () => undefined, outline: () => undefined }, page);
    const node = fake(view.node);
    view.show(as(save));
    expect(node.find("seg")).toEqual([]);
    expect(node.find("toolbar")[0]?.children).toEqual([node.find("filter")[0] as FakeNode]);
    expect(node.find("css-selector").length).toBeGreaterThan(0);
  });
});

describe("the view's chrome", () => {
  /** Every class the view has put on a node. */
  function classes(node: FakeNode): string[] {
    return [...new Set(node.all().flatMap((one) => one.className.split(" ")))].filter(Boolean);
  }

  test("is the kit's: the crumbs, then the bar with the filter and the modes, the box's fold, then the blocks", () => {
    const node = start();
    view?.show(as(save));
    expect(node.children.map((part) => (part as FakeNode).className)).toEqual([
      "crumbs",
      "toolbar",
      "row open",
      "css-blocks",
      "empty",
    ]);
    expect(node.find("toolbar")[0]?.children.map((part) => (part as FakeNode).className)).toEqual([
      "field filter",
      "seg",
    ]);
    // The crumbs are the view's own content, and no part of the bar.
    expect(node.find("toolbar")[0]?.find("crumbs")).toEqual([]);
  });

  test("has no class of its own for a bar, a filter, a mode control or a fold, in either mode", () => {
    const node = start();
    view?.show(as(save));
    heading(node).fire("click");
    const simple = classes(node);
    choose(node, "advanced");
    for (const name of [...simple, ...classes(node)]) {
      expect(name).not.toMatch(/^styles-|^css-fold$/);
    }
    expect(simple).toContain("fold-body");
  });

  test("says what it has to say in the panel's empty line", () => {
    answer = () => found([]);
    const node = start();
    expect(node.shown("empty").map((one) => one.className)).toEqual(["empty"]);
    view?.show(as(save));
    expect(node.shown("empty").map((one) => [one.className, one.textContent])).toEqual([
      ["empty", NO_STYLES],
    ]);
  });

  test("with the picking handed in, the bar starts with the select button, before the filter and the modes", () => {
    let on = false;
    let key = "Shift C";
    const told: (() => string)[] = [];
    const hearing: (() => void)[] = [];
    let presses = 0;
    const telling: Tips = {
      ...tips,
      tooltip: (control, text) => {
        tipped.push(fake(control));
        told.push(typeof text === "string" ? () => text : text);
      },
    };
    view = createStylesView(
      {
        tips: telling,
        title: () => undefined,
        outline: () => undefined,
        mode,
        select: {
          label: "select an element",
          hint: () => key,
          on: () => on,
          run: () => presses++,
          watch: (listener) => {
            hearing.push(listener);
            return () => void hearing.splice(hearing.indexOf(listener), 1);
          },
        },
      },
      page,
    );
    const node = fake(view.node);
    const [bar] = node.find("toolbar");
    const [button] = node.find("tool");
    expect(bar?.children.map((part) => (part as FakeNode).className)).toEqual(["tool", "field filter", "seg"]);
    // The kit's toggle, with no class of the view's own.
    expect(button?.tag).toBe("button");
    expect(button?.getAttribute("aria-label")).toBe("select an element");
    expect(button?.getAttribute("aria-pressed")).toBe("false");
    // The button and the empty line that stands in for it say the same in their tooltips.
    expect(tipped).toEqual([button as FakeNode, node.find("empty-action")[0] as FakeNode]);
    expect(told[0]?.()).toBe("select an element · Shift C");
    key = "Alt I";
    expect(told[0]?.()).toBe("select an element · Alt I");
    key = "";
    expect(told[0]?.()).toBe("select an element");
    // With no element there is no bar, and the empty line is the button that starts the picking.
    expect(node.shown("toolbar")).toEqual([]);
    expect(node.shown("tool")).toEqual([]);
    expect(node.shown("empty").map((one) => [one.tag, one.className, one.textContent])).toEqual([
      ["button", "empty empty-action", PICK],
    ]);
    expect(told[1]?.()).toBe("select an element");
    node.find("empty-action")[0]?.fire("click");
    expect(presses).toBe(1);
    // While it picks the line is only words, and a button again once the picking ends with no pick.
    on = true;
    for (const listener of [...hearing]) listener();
    expect(node.shown("empty").map((one) => [one.tag, one.textContent])).toEqual([["div", EMPTY]]);
    on = false;
    for (const listener of [...hearing]) listener();
    expect(node.shown("empty").map((one) => one.tag)).toEqual(["button"]);
    // With an element the bar is there, the button first, and no empty line.
    view.show(as(save));
    expect(node.shown("tool")).toHaveLength(1);
    expect(node.shown("filter")).toHaveLength(1);
    expect(node.shown("seg")).toHaveLength(1);
    expect(node.shown("empty")).toEqual([]);
    // A press only asks, and the button is on as the picking says, however that changed.
    button?.fire("click");
    expect(presses).toBe(2);
    expect(button?.getAttribute("aria-pressed")).toBe("false");
    on = true;
    for (const listener of [...hearing]) listener();
    expect(button?.getAttribute("aria-pressed")).toBe("true");
    expect(button?.className).toBe("tool on");
    expect(node.shown("empty")).toEqual([]);
    view.destroy();
    view = null;
    expect(hearing).toEqual([]);
  });

  test("before a pick hides the crumbs with the bar, and shows both with an element", () => {
    const node = start();
    expect(node.shown("crumbs")).toEqual([]);
    expect(node.shown("toolbar")).toEqual([]);
    view?.show(as(save));
    expect(node.shown("crumbs")).toHaveLength(1);
    expect(node.shown("toolbar")).toHaveLength(1);
    view?.show(null);
    expect(node.shown("crumbs")).toEqual([]);
  });
});

describe("the mode in the preferences", () => {
  function stubStorage(search = ""): Map<string, string> {
    const local = new Map<string, string>();
    Object.assign(window, {
      location: { search },
      localStorage: {
        getItem: (key: string) => local.get(key) ?? null,
        setItem: (key: string, value: string) => {
          local.set(key, value);
        },
        removeItem: (key: string) => {
          local.delete(key);
        },
      },
    });
    return local;
  }

  function door(prefs: ReturnType<typeof createPrefs>): typeof mode {
    return { get: () => prefs.get().stylesMode, set: prefs.setStylesMode };
  }

  test("is simple on a first visit, and the one picked is there for the next view", () => {
    const local = stubStorage();
    const prefs = createPrefs();
    const node = start(door(prefs));
    expect(choices(node)[0]).toEqual(["simple", "true", true]);
    choose(node, "advanced");
    expect(JSON.parse(local.get(PREFS_KEY) ?? "")).toEqual({ v: 4, stylesMode: "advanced" });
    view?.destroy();
    prefs.destroy();
    const next = createPrefs();
    expect(choices(start(door(next)))[1]).toEqual(["advanced", "true", true]);
    next.destroy();
  });

  test("in fresh mode is simple whatever is kept, and the one picked is not written", () => {
    const local = stubStorage("?devknobs=fresh");
    const was = JSON.stringify({ v: 3, stylesMode: "advanced" });
    local.set(PREFS_KEY, was);
    const prefs = createPrefs();
    const node = start(door(prefs));
    expect(choices(node)[0]).toEqual(["simple", "true", true]);
    choose(node, "advanced");
    expect(choices(node)[1]).toEqual(["advanced", "true", true]);
    expect(local.get(PREFS_KEY)).toBe(was);
    prefs.destroy();
  });
});

describe("the simple mode", () => {
  test("lists what applies by what it does, with no rule, selector or struck line", () => {
    const node = start();
    view?.show(as(save));
    const [own] = node.find("css-applied");
    expect(own?.find("css-set").map((set) => [
      set.getAttribute("aria-label"),
      set.find("css-decl").map((one) => one.textContent),
    ])).toEqual([
      ["layout", ["display: inline-flex"]],
      ["size and spacing", ["margin-top: 8px", "padding: 4px 8px", "margin: 0"]],
      ["text", ["color: var(--ink) → #111827"]],
      ["look", ["background: #2563eb"]],
      ["motion", ["transition: color 120ms"]],
      ["other", ["cursor: pointer", "--ring: 2px"]],
    ]);
    expect(labels(node)).toEqual(["layout", "size and spacing", "text", "look", "motion", "other"]);
    for (const gone of ["css-selector", "css-head", "css-source", "css-context", "css-var"]) {
      expect(node.find(gone)).toEqual([]);
    }
    expect(node.all().filter((one) => one.tag === "s")).toEqual([]);
    expect(node.find("css-decl").every((one) => one.tag === "div")).toBe(true);
    expect(tipped).toEqual([]);
  });

  test("says nothing of important, and never shows an overridden declaration", () => {
    const node = start();
    view?.show(as(save));
    const all = node.find("css-decl").map((one) => one.textContent);
    expect(all.join("\n")).not.toContain("important");
    expect(all).not.toContain("color: black");
    expect(all.filter((text) => text.startsWith("font-size"))).toEqual(["font-size: 14px"]);
  });

  test("names no group where all the lines are of one", () => {
    answer = () => found([rule(".primary", [declaration("color", "red"), declaration("font-size", "12px")])]);
    const node = start();
    view?.show(as(save));
    expect(lines(node)).toEqual(["color: red", "font-size: 12px"]);
    expect(node.find("css-label")).toEqual([]);
  });

  test("puts a swatch before a color, also one a custom property comes to", () => {
    const node = start();
    view?.show(as(save));
    const swatch = (text: string) =>
      node
        .find("css-decl")
        .find((one) => one.textContent.startsWith(text))
        ?.find("css-swatch")
        .map((one) => one.style.backgroundColor);
    expect(swatch("background")).toEqual(["#2563eb"]);
    expect(swatch("color")).toEqual(["#111827"]);
    expect(swatch("padding")).toEqual([]);
  });

  test("says what a value that reads a custom property comes to, quietly after it", () => {
    const node = start();
    view?.show(as(save));
    const color = node.find("css-decl").find((one) => one.textContent.startsWith("color"));
    expect(color?.find("css-value").map((one) => one.textContent)).toEqual(["var(--ink)"]);
    expect(color?.find("css-comes").map((one) => one.textContent)).toEqual([" → #111827"]);
    const padding = node.find("css-decl").find((one) => one.textContent.startsWith("padding"));
    expect(padding?.find("css-comes")).toEqual([]);
  });

  test("folds what is inherited under one heading, closed, each property once, nearest first", () => {
    const node = start();
    view?.show(as(save));
    const head = heading(node);
    expect(head.tag).toBe("button");
    expect(head.textContent).toBe("inherited");
    expect(head.getAttribute("aria-expanded")).toBe("false");
    // The fold is the kit's: a row, its chevron where a row's icon is, its body under its line.
    const [fold] = styles(node).find("row");
    expect(styles(node).find("row")).toHaveLength(1);
    expect(fold?.className).toBe("row");
    expect(fold?.children.map((part) => (part as FakeNode).className)).toEqual(["line", "fold"]);
    expect(head.children.map((part) => (part as FakeNode).className)).toEqual(["turn", "row-label"]);
    expect(head.find("lead")).toHaveLength(0);
    expect(fold?.find("fold-body")[0]?.find("css-applied")[0]?.getAttribute("aria-label")).toBe(
      "inherited",
    );
    expect(node.find("css-group")).toEqual([]);
    expect(lines(node)).not.toContain("font-size: 14px");
    head.fire("click");
    expect(fold?.className).toBe("row open");
    expect(head.getAttribute("aria-expanded")).toBe("true");
    expect(lines(node).slice(-3)).toEqual(["font-size: 14px", "line-height: 1.5", "--ink: #111827"]);
    head.fire("click");
    expect(head.getAttribute("aria-expanded")).toBe("false");
    expect(lines(node)).not.toContain("line-height: 1.5");
  });

  test("the fold stays as it was left when the styles are read again", () => {
    const node = start();
    view?.show(as(save));
    heading(node).fire("click");
    view?.refresh();
    expect(heading(node).getAttribute("aria-expanded")).toBe("true");
    expect(lines(node)).toContain("line-height: 1.5");
  });

  test("has no inherited heading where nothing is handed down", () => {
    answer = () => found([rule(".primary", [declaration("color", "red")])]);
    const node = start();
    view?.show(as(save));
    expect(styles(node).find("row")).toEqual([]);
  });

  test("lists no pseudo-element, and keeps its crumb, which shows its styles the same way", () => {
    answer = (_target, pseudo) =>
      pseudo
        ? found([rule(".primary::before", [declaration("content", '"+"'), declaration("color", "red")])], {
            target: { label: "button#save.primary", pseudo },
          })
        : sample();
    const node = start();
    view?.show(as(save));
    expect(node.find("css-decl").map((one) => one.textContent)).not.toContain('content: "+"');
    const crumbs = node.find("crumb");
    expect(crumbs.map((crumb) => crumb.textContent)).toEqual([
      "html",
      "body",
      "div#app",
      "button#save",
      "::before",
    ]);
    crumbs[4]?.fire("click");
    expect(asked[1]).toEqual({ element: as(save), pseudo: "::before" });
    expect(lines(node)).toEqual(["color: red", 'content: "+"']);
    expect(labels(node)).toEqual(["text", "other"]);
    expect(node.find("crumb")[4]?.getAttribute("aria-current")).toBe("true");
  });

  test("ends with one line where a stylesheet may not be read", () => {
    answer = () =>
      found([rule(".primary", [declaration("color", "red")])], {
        hidden: [
          { sheet: "https://cdn.example.com/theme.css", reason: "cross-origin" },
          { sheet: "https://cdn.example.com/more.css", reason: "cross-origin" },
        ],
      });
    const node = start();
    view?.show(as(save));
    expect(node.find("css-hidden").map((one) => one.textContent)).toEqual([
      "some styles are hidden: a stylesheet from another origin",
    ]);
    const all = node.find("css-blocks")[0]?.children ?? [];
    expect(all[all.length - 1]).toBe(node.find("css-hidden")[0] as FakeNode);
  });

  test("says so, calmly, where the element sets nothing, and still folds what it inherits", () => {
    answer = () =>
      found([
        {
          kind: "inherited",
          from: "div#app.shell",
          element: as(app),
          blocks: [rule("#app", [declaration("font-size", "14px")])],
        },
      ]);
    const node = start();
    view?.show(as(save));
    expect(NO_STYLES).toBe("no styles set on this element");
    expect(note(node)).toBe(NO_STYLES);
    expect(node.shown("row")).toHaveLength(1);
    heading(node).fire("click");
    expect(lines(node)).toEqual(["font-size: 14px"]);
    heading(node).fire("click");
    choose(node, "advanced");
    expect(note(node)).toBeNull();
    answer = () => found([]);
    view?.refresh();
    expect(note(node)).toBe(NO_RULES);
    choose(node, "simple");
    expect(note(node)).toBe(NO_STYLES);
    expect(node.shown("empty")).toHaveLength(1);
  });

  test("a click on a line does nothing", () => {
    const node = start();
    view?.show(as(save));
    const before = lines(node);
    for (const one of node.find("css-decl")) {
      expect(one.listeners.size).toBe(0);
      one.fire("click");
    }
    expect(lines(node)).toEqual(before);
    expect(asked).toHaveLength(1);
  });
});

describe("the filter in the simple mode", () => {
  test("keeps the lines that match by name, and hides the groups and labels left with none", () => {
    const node = start();
    view?.show(as(save));
    typed(node, "margin");
    expect(lines(node)).toEqual(["margin-top: 8px", "margin: 0"]);
    expect(node.shown("css-set").map((set) => set.getAttribute("aria-label"))).toEqual([
      "size and spacing",
    ]);
    // One group alone needs no name.
    expect(labels(node)).toEqual([]);
    expect(node.shown("row")).toEqual([]);
    expect(asked).toHaveLength(1);
  });

  test("matches by value too, in any case, and names the groups while more than one shows", () => {
    const node = start();
    view?.show(as(save));
    typed(node, "PX");
    expect(lines(node)).toEqual(["margin-top: 8px", "padding: 4px 8px", "--ring: 2px"]);
    expect(labels(node)).toEqual(["size and spacing", "other"]);
  });

  test("keeps the inherited heading for a match under it, folded as it was", () => {
    const node = start();
    view?.show(as(save));
    typed(node, "line-height");
    expect(lines(node)).toEqual([]);
    expect(note(node)).toBeNull();
    expect(node.shown("row")).toHaveLength(1);
    heading(node).fire("click");
    expect(lines(node)).toEqual(["line-height: 1.5"]);
  });

  test("says so where nothing matches, and shows it all again once cleared", () => {
    const node = start();
    view?.show(as(save));
    const before = lines(node);
    typed(node, "zzz");
    expect(lines(node)).toEqual([]);
    expect(note(node)).toBe(NO_MATCH);
    expect(node.shown("css-applied")).toEqual([]);
    expect(view?.escape()).toBe(true);
    expect(lines(node)).toEqual(before);
    expect(labels(node)).toHaveLength(6);
    expect(note(node)).toBeNull();
  });

  test("an element that sets nothing has one line to say, whatever the filter", () => {
    answer = () => found([]);
    const node = start();
    view?.show(as(save));
    typed(node, "zzz");
    expect(node.shown("empty").map((one) => one.textContent)).toEqual([NO_MATCH]);
    typed(node, "");
    expect(node.shown("empty").map((one) => one.textContent)).toEqual([NO_STYLES]);
  });

  test("still holds for the styles read again", () => {
    const node = start();
    view?.show(as(save));
    typed(node, "padding");
    view?.refresh();
    expect(lines(node)).toEqual(["padding: 4px 8px"]);
  });
});

describe("the simple mode keeping up", () => {
  function observer(): FakeObserver {
    const last = FakeObserver.made[FakeObserver.made.length - 1];
    if (!last) throw new Error("no observer");
    return last;
  }

  test("reads again once after the element changed, and shows what it reads", () => {
    const node = start();
    view?.show(as(save));
    answer = () => found([rule(".primary", [declaration("opacity", "0.5")])]);
    observer().change(save);
    observer().change(save);
    jest.advanceTimersByTime(SETTLE);
    expect(asked).toHaveLength(2);
    expect(lines(node)).toEqual(["opacity: 0.5"]);
  });

  test("reads again when a knob moves, and after a switch to the other mode too", () => {
    const node = start();
    view?.show(as(save));
    for (const knob of [...knobs]) knob({ ...DEFAULT_STATE, scheme: "dark" });
    jest.advanceTimersByTime(SETTLE);
    expect(asked).toHaveLength(2);
    choose(node, "advanced");
    observer().change(save);
    jest.advanceTimersByTime(SETTLE);
    expect(asked).toHaveLength(3);
    expect(node.find("css-selector").length).toBeGreaterThan(0);
  });
});
