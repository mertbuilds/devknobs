import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { apply, pseudoText, reset } from "../src/engine/pseudo";

describe("pseudoText", () => {
  test("accents every letter, grows the string and brackets it", () => {
    expect(pseudoText("Settings")).toBe("[Ŝéţţîñĝš ···]");
    expect(pseudoText("Save")).toBe("[Ŝáṽé ··]");
  });

  test("keeps the whitespace around the string outside the brackets", () => {
    expect(pseudoText("\n  Save  ")).toBe("\n  [Ŝáṽé ··]  ");
  });

  test("leaves what has no letters alone", () => {
    expect(pseudoText("")).toBe("");
    expect(pseudoText("  ")).toBe("  ");
    expect(pseudoText("42 / 7")).toBe("42 / 7");
    expect(pseudoText("→")).toBe("→");
  });

  test("keeps digits, punctuation and letters it has no accent for", () => {
    expect(pseudoText("2 items, ğ")).toBe("[2 îţéɱš, ğ ····]");
  });
});

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
const FILTER_ACCEPT = 1;
const FILTER_REJECT = 2;

class FakeText {
  readonly nodeType = TEXT_NODE;
  parentElement: FakeElement | null = null;

  constructor(public data: string) {}
}

/** Just enough of an element for pseudo to walk, swap and watch. */
class FakeElement {
  readonly nodeType = ELEMENT_NODE;
  readonly attributes = new Map<string, string>();
  childNodes: (FakeElement | FakeText)[] = [];
  parentElement: FakeElement | null = null;
  isContentEditable = false;

  constructor(
    readonly tagName: string,
    children: (FakeElement | FakeText)[] = [],
  ) {
    this.append(...children);
  }

  get textContent(): string {
    return this.childNodes
      .map((child) => (child instanceof FakeText ? child.data : child.textContent))
      .join("");
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  hasAttribute(name: string): boolean {
    return this.attributes.has(name);
  }

  append(...nodes: (FakeElement | FakeText)[]): void {
    for (const node of nodes) node.parentElement = this;
    this.childNodes.push(...nodes);
  }

  /** As `textContent =` does it: one new text node in place of the children. */
  replaceText(data: string): FakeText {
    const text = new FakeText(data);
    for (const node of this.childNodes) node.parentElement = null;
    this.childNodes = [];
    this.append(text);
    return text;
  }

  /** A selector list of `tag`, `[attr]` and `tag:not([attr])`, the kinds pseudo skips by. */
  matches(selectors: string): boolean {
    return selectors.split(",").some((selector) => {
      const [, tag, not, attribute] = /^(\w*)(?::not\(\[([\w-]+)\]\))?(?:\[([\w-]+)\])?$/.exec(
        selector.trim(),
      ) ?? [];
      if (tag && tag.toUpperCase() !== this.tagName) return false;
      if (not && this.hasAttribute(not)) return false;
      return !attribute || this.hasAttribute(attribute);
    });
  }

  closest(selectors: string): FakeElement | null {
    for (let node: FakeElement | null = this; node; node = node.parentElement) {
      if (node.matches(selectors)) return node;
    }
    return null;
  }
}

type Mutation = Partial<MutationRecord> & { type: MutationRecordType };

/** What the observer pseudo made hears, as the browser would call it. */
let notify: ((records: Mutation[]) => void) | null = null;
/** The idle callbacks waiting to run. */
let idle: (() => void)[] = [];
let body: FakeElement;

function define(name: string, value: unknown): void {
  Object.defineProperty(globalThis, name, { configurable: true, value });
}

/** Turn pseudo on and let it start, as the page goes idle. */
function on(): void {
  apply(true);
  for (const run of idle.splice(0)) run();
}

beforeEach(() => {
  body = new FakeElement("BODY");
  idle = [];
  define("document", {
    body,
    readyState: "complete",
    createTreeWalker: (
      root: FakeElement,
      _show: number,
      filter: { acceptNode: (node: FakeElement | FakeText) => number },
    ) => {
      const nodes: (FakeElement | FakeText)[] = [];
      const visit = (parent: FakeElement) => {
        for (const node of parent.childNodes) {
          if (filter.acceptNode(node) === FILTER_REJECT) continue;
          nodes.push(node);
          if (node instanceof FakeElement) visit(node);
        }
      };
      visit(root);
      return { nextNode: () => nodes.shift() ?? null };
    },
  });
  define("Node", { ELEMENT_NODE, TEXT_NODE });
  define("NodeFilter", { SHOW_ELEMENT: 1, SHOW_TEXT: 4, FILTER_ACCEPT, FILTER_REJECT });
  define("requestIdleCallback", (run: () => void) => idle.push(run));
  define(
    "MutationObserver",
    class {
      constructor(callback: (records: Mutation[]) => void) {
        notify = callback;
      }

      observe(): void {}

      disconnect(): void {
        notify = null;
      }

      takeRecords(): Mutation[] {
        return [];
      }
    },
  );
});

afterEach(() => {
  reset();
  const names = ["document", "Node", "NodeFilter", "requestIdleCallback", "MutationObserver"];
  for (const name of names) Reflect.deleteProperty(globalThis, name);
});

describe("pseudo on a page", () => {
  test("keeps one layer when the page reads its text back and writes it again", () => {
    const button = new FakeElement("BUTTON", [new FakeText("Save")]);
    body.append(button);
    on();
    expect(button.textContent).toBe(pseudoText("Save"));
    for (let i = 0; i < 7; i++) {
      // `button.textContent += "!"`, then `button.title = button.textContent`.
      const text = button.replaceText(`${button.textContent}!`);
      notify?.([{ type: "childList", addedNodes: [text] as unknown as NodeList }]);
      button.setAttribute("title", button.textContent);
      notify?.([{ type: "attributes", target: button as unknown as Node, attributeName: "title" }]);
    }
    expect(button.textContent).toBe(pseudoText("Save!!!!!!!"));
    expect(button.getAttribute("title")).toBe(pseudoText("Save!!!!!!!"));
    reset();
    expect(button.textContent).toBe("Save!!!!!!!");
    expect(button.getAttribute("title")).toBe("Save!!!!!!!");
  });

  test("leaves an option without a value alone, as its text is what the form sends", () => {
    const plain = new FakeElement("OPTION", [new FakeText("Red")]);
    const valued = new FakeElement("OPTION", [new FakeText("Blue")]);
    valued.setAttribute("value", "blue");
    body.append(new FakeElement("SELECT", [plain, valued]));
    on();
    expect(plain.textContent).toBe("Red");
    expect(valued.textContent).toBe(pseudoText("Blue"));
  });
});
