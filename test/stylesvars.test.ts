import { afterEach, beforeEach, describe, expect, jest, test } from "bun:test";
import { DEFAULT_STATE } from "../src/engine/store";
import type {
  Inspection,
  RuleBlock,
  StyleBlock,
  StyleDeclaration,
} from "../src/styles/types";
import { pairs } from "../src/ui/kit";
import type { StylesMode } from "../src/ui/prefs";
import { CSS } from "../src/ui/styles";
import { NOT_SET } from "../src/ui/stylesformat";
import {
  createStylesView,
  readVariable,
  type StylesPage,
  type StylesView,
} from "../src/ui/stylesview";
import { createTips, TIP_DELAY, type Tips } from "../src/ui/tooltip";
import { rules } from "./kit-dom";
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
    selector: selector.split(", ").map((text) => ({ text, matches: true })),
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
let html: FakeElement;
let save: FakeElement;
let answer: () => Inspection;
/** What the page's elements see for each custom property, as it is now. */
let seen: Record<string, string>;
/** Every custom property asked of the page, with the element and the pseudo-element it was asked of. */
let reads: { element: Element; pseudo: string | null; name: string }[];
/** What says each control's tooltip, as it shows. */
let told: Map<FakeNode, () => string | Node>;
let stored: StylesMode;
let view: StylesView | null = null;

const page: StylesPage = {
  inspect: () => answer(),
  invalidate: () => undefined,
  getState: () => DEFAULT_STATE,
  subscribe: () => () => undefined,
  isColor: (text) => /^#[0-9a-f]{3,8}$/i.test(text) || text === "red",
  box: () => null,
  variable: (target, pseudo, name) => {
    reads.push({ element: target, pseudo, name });
    return seen[name] ?? "";
  },
};

const tips: Tips = {
  show: () => undefined,
  hide: () => false,
  hideAfter: () => undefined,
  isFor: () => false,
  tooltip: (node, text) => {
    told.set(fake(node), typeof text === "string" ? () => text : text);
  },
  destroy: () => undefined,
};

function start(mode: StylesMode): FakeNode {
  stored = mode;
  view = createStylesView(
    {
      tips,
      title: () => undefined,
      outline: () => undefined,
      mode: { get: () => stored, set: (next) => (stored = next) },
    },
    page,
  );
  const paneBody = new FakeNode("div");
  paneBody.append(fake(view.node));
  return fake(view.node);
}

/** The tooltip of a control as it would show now: its lines, each with its class and what is in it. */
function tipOf(control: FakeNode | undefined): { lines: string[]; quiet: string[]; swatches: string[] } {
  const say = control ? told.get(control) : undefined;
  if (!say) throw new Error("no tooltip");
  const box = fake(say());
  expect(box.className).toBe("tip-lines");
  const rows = box.find("tip-line");
  return {
    lines: rows.filter((row) => !row.classList.contains("tip-quiet")).map((row) => row.textContent),
    quiet: rows.filter((row) => row.classList.contains("tip-quiet")).map((row) => row.textContent),
    swatches: box.find("css-swatch").map((one) => one.style.backgroundColor ?? ""),
  };
}

/** The piece of a custom property's name, by its name, in a value or at a declaration's start. */
function piece(node: FakeNode, name: string, at = 0): FakeNode | undefined {
  return node.find("css-var").filter((one) => one.textContent === name)[at];
}

const MODES: StylesMode[] = ["simple", "advanced"];

beforeEach(() => {
  jest.useFakeTimers();
  ids = 0;
  doc = pageDocument();
  html = element(doc, "html");
  const body = element(doc, "body", {}, html);
  save = element(doc, "button", { id: "save", class: "primary" }, body);
  seen = {};
  reads = [];
  told = new Map();
  FakeObserver.made = [];
  answer = () => found([]);
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

describe.each(MODES)("a custom property read in a value, in the %s mode", (mode) => {
  test("is a piece of its own for each var(), a stop for the tab key, and the line reads as written", () => {
    const value = "calc(var(--a) + var( --b , var(--c, 4px)))";
    answer = () => found([rule(".primary", [declaration("width", value)])]);
    const node = start(mode);
    view?.show(as(save));
    const pieces = node.find("css-var");
    expect(pieces.map((one) => [one.tag, one.textContent, one.tabIndex])).toEqual([
      ["button", "--a", 0],
      ["button", "--b", 0],
      ["button", "--c", 0],
    ]);
    expect(node.find("css-value")[0]?.textContent).toBe(value);
    for (const one of pieces) expect(told.has(one)).toBe(true);
  });

  test("text that only looks like a call is plain", () => {
    answer = () => found([rule(".primary", [declaration("content", '"var(--a)"'), declaration("background", "url(var(--b).png)")])]);
    const node = start(mode);
    view?.show(as(save));
    expect(node.find("css-var")).toEqual([]);
  });

  test("says what the element sees for it, and under it where it is set", () => {
    seen = { "--gap": "4px" };
    answer = () =>
      found([
        rule(".primary", [declaration("padding", "var(--gap)")]),
        { kind: "inherited", from: "html", element: as(html), blocks: [rule(":root", [declaration("--gap", "4px")])] },
      ]);
    const node = start(mode);
    view?.show(as(save));
    expect(tipOf(piece(node, "--gap"))).toEqual({ lines: ["4px"], quiet: [":root"], swatches: [] });
    expect(reads).toEqual([{ element: as(save), pseudo: null, name: "--gap" }]);
  });

  test("says only the value where no block shown sets it", () => {
    seen = { "--gap": "4px" };
    answer = () => found([rule(".primary", [declaration("padding", "var(--gap)")])]);
    const node = start(mode);
    view?.show(as(save));
    expect(tipOf(piece(node, "--gap"))).toEqual({ lines: ["4px"], quiet: [], swatches: [] });
  });

  test("puts a swatch before a value that is a color", () => {
    seen = { "--brand": "#0af", "--edge": "1px solid #0af" };
    answer = () => found([rule(".primary", [declaration("border", "var(--edge)"), declaration("color", "var(--brand)")])]);
    const node = start(mode);
    view?.show(as(save));
    expect(tipOf(piece(node, "--brand"))).toEqual({ lines: ["#0af"], quiet: [], swatches: ["#0af"] });
    expect(tipOf(piece(node, "--edge")).swatches).toEqual([]);
  });

  test("one that is not set says so, and what its fallback comes to where it has one", () => {
    seen = { "--b": "2px" };
    answer = () =>
      found([
        rule(".primary", [
          declaration("margin", "var(--none)"),
          declaration("padding", "var(--nil, 8px)"),
          declaration("gap", "var(--off, var(--b))"),
        ]),
      ]);
    const node = start(mode);
    view?.show(as(save));
    expect(tipOf(piece(node, "--none")).lines).toEqual([NOT_SET]);
    expect(tipOf(piece(node, "--nil")).lines).toEqual([NOT_SET, "uses fallback: 8px"]);
    expect(tipOf(piece(node, "--off")).lines).toEqual([NOT_SET, "uses fallback: 2px"]);
  });

  test("a nested one says its own value, and the one around it what its fallback comes to", () => {
    seen = { "--inner": "6px" };
    answer = () => found([rule(".primary", [declaration("gap", "var(--outer, var(--inner, 4px))")])]);
    const node = start(mode);
    view?.show(as(save));
    expect(tipOf(piece(node, "--outer")).lines).toEqual([NOT_SET, "uses fallback: 6px"]);
    expect(tipOf(piece(node, "--inner")).lines).toEqual(["6px"]);
  });

  test("reads the value as the tooltip shows, not as the styles were read", () => {
    seen = { "--ink": "#111" };
    answer = () => found([rule(".primary", [declaration("color", "var(--ink)")])]);
    const node = start(mode);
    view?.show(as(save));
    // Nothing is asked of the page until a tooltip shows.
    expect(reads).toEqual([]);
    expect(tipOf(piece(node, "--ink")).lines).toEqual(["#111"]);
    // The scheme knob turned, and the page has another ink.
    seen = { "--ink": "#eee" };
    expect(tipOf(piece(node, "--ink"))).toEqual({ lines: ["#eee"], quiet: [], swatches: ["#eee"] });
  });

  test("says what a registered property computes to, as the element's computed style has it", () => {
    // `@property --size` takes a length, so `1rem` as written computes to px.
    seen = { "--size": "16px" };
    answer = () =>
      found([rule(".primary", [declaration("--size", "1rem"), declaration("width", "var(--size)")])]);
    const node = start(mode);
    view?.show(as(save));
    expect(tipOf(piece(node, "--size", mode === "simple" ? 0 : 1)).lines).toEqual(["16px"]);
  });

  test("of a pseudo-element, reads what the pseudo-element sees", () => {
    seen = { "--mark": "red" };
    answer = () =>
      found([rule(".primary::before", [declaration("color", "var(--mark)")])], {
        target: { label: "button#save.primary", pseudo: "::before" },
      });
    const node = start(mode);
    view?.show(as(save), "::before");
    expect(tipOf(piece(node, "--mark")).swatches).toEqual(["red"]);
    expect(reads).toEqual([{ element: as(save), pseudo: "::before", name: "--mark" }]);
  });

  test("a custom property's own declaration: its name says its value, and so does each one its value reads", () => {
    seen = { "--edge": "1px solid #0af", "--brand": "#0af" };
    answer = () =>
      found([rule(".primary", [declaration("--edge", "1px solid var(--brand)"), declaration("color", "red")])]);
    const node = start(mode);
    view?.show(as(save));
    const [custom] = node.find("css-decl").filter((one) => one.textContent.startsWith("--edge"));
    const [name] = custom?.find("css-name") ?? [];
    expect(name?.tag).toBe("button");
    expect(name?.classList.contains("css-var")).toBe(true);
    expect(tipOf(name)).toEqual({ lines: ["1px solid #0af"], quiet: [".primary"], swatches: [] });
    expect(tipOf(piece(node, "--brand")).swatches).toEqual(["#0af"]);
    // A property that is no custom one has a name that is only text.
    const [plain] = node.find("css-decl").filter((one) => one.textContent.startsWith("color"));
    expect(plain?.find("css-name").map((one) => one.tag)).toEqual(["span"]);
  });

  test("a click copies nothing, and in a value no shown block sets goes nowhere", () => {
    seen = { "--gap": "4px" };
    answer = () => found([rule(".primary", [declaration("padding", "var(--gap)")])]);
    const node = start(mode);
    view?.show(as(save));
    expect(piece(node, "--gap")?.listeners.get("click")).toBeUndefined();
  });

  test("a declaration's name has the class of a name, and the marks around it their own", () => {
    answer = () => found([rule(".primary", [declaration("max-width", "40ch"), declaration("--gap", "4px")])]);
    const node = start(mode);
    view?.show(as(save));
    const rows = node.find("css-decl");
    expect(rows.map((row) => row.find("css-name").map((one) => one.textContent))).toEqual([["max-width"], ["--gap"]]);
    for (const row of rows) {
      expect(row.find("css-punct")[0]?.textContent).toBe(": ");
      // The value is no name, and has none in it.
      expect(row.find("css-value")[0]?.find("css-name")).toEqual([]);
    }
  });
});

describe("a custom property the styles were read again for", () => {
  test("is asked where it is set of the styles shown now", () => {
    seen = { "--gap": "4px" };
    const reading = (selector: string) => () =>
      found([
        rule(".primary", [declaration("padding", "var(--gap)")]),
        { kind: "inherited", from: "html", element: as(html), blocks: [rule(selector, [declaration("--gap", "4px")])] },
      ]);
    answer = reading(":root");
    const node = start("advanced");
    view?.show(as(save));
    expect(tipOf(piece(node, "--gap")).quiet).toEqual([":root"]);
    answer = reading("html.dark");
    view?.refresh();
    expect(tipOf(piece(node, "--gap")).quiet).toEqual(["html.dark"]);
  });
});

describe("reading a custom property off the page", () => {
  /** An element whose own window answers for it, as the device frame's page has. */
  function framed(values: Record<string, string>) {
    const asked: { element: unknown; pseudo: string | null; name: string }[] = [];
    const frame = {
      getComputedStyle: (target: unknown, pseudo: string | null) => ({
        getPropertyValue: (name: string) => {
          asked.push({ element: target, pseudo, name });
          return values[name] ?? "";
        },
      }),
    };
    const target = { ownerDocument: { defaultView: frame } } as unknown as Element;
    return { target, asked };
  }

  test("asks the element's own window, the frame's for a page shown in it, and trims the answer", () => {
    const panel = { getComputedStyle: () => ({ getPropertyValue: () => "the panel's" }) };
    Object.defineProperty(globalThis, "window", { configurable: true, value: panel });
    const { target, asked } = framed({ "--gap": "  4px " });
    expect(readVariable(target, null, "--gap")).toBe("4px");
    expect(readVariable(target, "::after", "--none")).toBe("");
    expect(asked).toEqual([
      { element: target, pseudo: null, name: "--gap" },
      { element: target, pseudo: "::after", name: "--none" },
    ]);
  });

  test("is empty for an element whose page was unloaded, or whose window throws", () => {
    expect(readVariable({ ownerDocument: { defaultView: null } } as unknown as Element, null, "--gap")).toBe("");
    const throws = {
      ownerDocument: {
        defaultView: {
          getComputedStyle: () => {
            throw new Error("gone");
          },
        },
      },
    } as unknown as Element;
    expect(readVariable(throws, null, "--gap")).toBe("");
  });
});

describe("the tooltip", () => {
  /** A node with a place on the screen, as far as the tooltip asks. */
  class Placed extends FakeNode {
    offsetHeight = 0;
    getBoundingClientRect() {
      return { left: 0, top: 100, width: 10, bottom: 110 };
    }
    matches(): boolean {
      return false;
    }
  }

  function build() {
    Object.assign(window, { innerWidth: 800, innerHeight: 600 });
    const tip = new Placed("div");
    const made = createTips(tip as unknown as HTMLElement, new Placed("div") as unknown as HTMLElement);
    return { tip, made };
  }

  test("shows a node handed to it in place of words, and words again after", () => {
    const { tip, made } = build();
    const control = new Placed("button");
    const lines = new FakeNode("span");
    lines.append("4px");
    made.show(control as unknown as HTMLElement, lines as unknown as Node);
    expect(tip.children).toEqual([lines]);
    expect(tip.classList.contains("on")).toBe(true);
    made.show(control as unknown as HTMLElement, "pin");
    expect(tip.children).toEqual(["pin"]);
  });

  test("asks what it says as it shows, once the pointer has rested, so it is never an older answer", () => {
    const { tip, made } = build();
    const control = new Placed("button");
    let value = "old";
    let asked = 0;
    made.tooltip(control as unknown as HTMLElement, () => {
      asked++;
      const lines = new FakeNode("span");
      lines.append(value);
      return lines as unknown as Node;
    });
    control.fire("pointerenter");
    expect(asked).toBe(0);
    value = "new";
    jest.advanceTimersByTime(TIP_DELAY);
    expect(asked).toBe(1);
    expect(tip.textContent).toBe("new");
    // The pointer left before the rest was over: nothing is asked or shown.
    control.fire("pointerleave");
    control.fire("pointerenter");
    control.fire("pointerleave");
    jest.advanceTimersByTime(TIP_DELAY);
    expect(asked).toBe(1);
    expect(tip.classList.contains("on")).toBe(false);
  });
});

describe("the color of a key", () => {
  const all = rules(CSS);
  const bodyOf = (selector: string) => all.filter((one) => one.selector === selector).map((one) => one.body);

  test("is one token, set once for the light look and once for the dark", () => {
    const set = [...CSS.matchAll(/--key:\s*(#[0-9a-f]{6});/g)].map((match) => match[1]);
    expect(set).toHaveLength(2);
    expect(set[0]).not.toBe(set[1]);
    const dark = /@media \(prefers-color-scheme: dark\) \{\s*\.wrap \{([^}]*)\}/.exec(CSS)?.[1] ?? "";
    expect(dark).toContain(`--key: ${set[1]};`);
  });

  function luminance(hex: string): number {
    const [red = 0, green = 0, blue = 0] = [1, 3, 5].map((at) => {
      const part = parseInt(hex.slice(at, at + 2), 16) / 255;
      return part <= 0.03928 ? part / 12.92 : ((part + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  }

  test("reads as small text on the panel's ground and on a block's, in each look", () => {
    const light = bodyOf(".wrap")[0] ?? "";
    const dark = /@media \(prefers-color-scheme: dark\) \{\s*\.wrap \{([^}]*)\}/.exec(CSS)?.[1] ?? "";
    for (const look of [light, dark]) {
      const token = (name: string) => new RegExp(`${name}:\\s*(#[0-9a-f]{6});`).exec(look)?.[1] ?? "";
      for (const ground of ["--bg", "--card"]) {
        const [high = 0, low = 0] = [luminance(token("--key")), luminance(token(ground))].sort((a, b) => b - a);
        expect((high + 0.05) / (low + 0.05)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  test("is what a declaration's name and a pair's name are set in, and nothing sets it by weight", () => {
    expect(bodyOf(".css-name")).toEqual([" color: var(--key); "]);
    expect(bodyOf(".pair-name")).toEqual([" color: var(--key); "]);
    const used = all.filter((one) => one.body.includes("var(--key)")).map((one) => one.selector);
    expect(used).toEqual([".pair-name", ".css-name"]);
    expect(bodyOf(".css-punct")).toEqual([" color: var(--faint); "]);
    for (const one of all.filter((rule) => /\.css-(name|var|punct)|\.tip-/.test(rule.selector))) {
      expect([one.selector, /font-weight|border(?!-radius)|box-shadow/.test(one.body)]).toEqual([one.selector, false]);
    }
  });

  test("a pair's name is a node of its own with that class", () => {
    const list = fake(pairs([["content-type", "text/html"]]).node);
    expect(list.find("pair-name").map((one) => one.textContent)).toEqual(["content-type"]);
  });

  test("an overridden declaration's name is as quiet as the rest of its line", () => {
    answer = () => found([rule(".primary", [declaration("color", "red", { overridden: true }), declaration("--gap", "4px", { overridden: true })])]);
    const node = start("advanced");
    view?.show(as(save));
    const struck = node.find("css-decl");
    expect(struck.map((row) => [row.tag, row.find("css-name").length])).toEqual([["s", 1], ["s", 1]]);
    // The rule for a struck line names the name, and is the more specific of the two.
    const quiet = all.find((one) => one.selector.split(",").map((part) => part.trim()).includes("s.css-decl .css-name"));
    expect(quiet?.body).toContain("color: var(--faint)");
    expect(all.indexOf(quiet ?? all[0]!)).toBeGreaterThan(all.findIndex((one) => one.selector === ".css-name"));
  });

  test("a custom property's name has no line at rest, and one under the pointer or the focus", () => {
    expect(bodyOf(".css-var").join("")).not.toContain("text-decoration");
    expect(bodyOf(".css-var:hover, .css-var:focus-visible")).toEqual([" text-decoration: underline dotted; "]);
  });
});
