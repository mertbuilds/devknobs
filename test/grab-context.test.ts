import { describe, expect, test } from "bun:test";
import type { Fiber } from "bippy";
import { grabContext } from "../src/grab/context";
import { componentNames, displayName, getFiber, isComposite, listKey } from "../src/grab/fiber";

interface FakeFiber {
  tag: number;
  type: unknown;
  key: string | null;
  stateNode: null;
  return: FakeFiber | null;
  child: FakeFiber | null;
  sibling: FakeFiber | null;
}

function fiber(
  type: unknown,
  key: string | null = null,
  parent: FakeFiber | null = null,
): FakeFiber {
  const node: FakeFiber = {
    tag: 0,
    type,
    key,
    stateNode: null,
    return: parent,
    child: null,
    sibling: null,
  };
  if (parent) {
    if (!parent.child) parent.child = node;
    else {
      let last = parent.child;
      while (last.sibling) last = last.sibling;
      last.sibling = node;
    }
  }
  return node;
}

function asFiber(node: FakeFiber): Fiber {
  return node as unknown as Fiber;
}

function App() {}
function Row() {}
const Memo = { $$typeof: Symbol.for("react.memo"), type: Row };
const Forward = { $$typeof: Symbol.for("react.forward_ref"), render: function Input() {} };
const Context = { $$typeof: Symbol.for("react.context"), displayName: "Theme" };

describe("fiber helpers", () => {
  test("names components through memo and forwardRef", () => {
    expect(displayName(App)).toBe("App");
    expect(displayName(Memo)).toBe("Row");
    expect(displayName(Forward)).toBe("Input");
    expect(displayName("div")).toBe("div");
    expect(displayName(null)).toBeNull();
  });

  test("counts functions, memo and forwardRef as components, not host nodes or contexts", () => {
    expect(isComposite(asFiber(fiber(App)))).toBe(true);
    expect(isComposite(asFiber(fiber(Memo)))).toBe(true);
    expect(isComposite(asFiber(fiber(Forward)))).toBe(true);
    expect(isComposite(asFiber(fiber("div")))).toBe(false);
    expect(isComposite(asFiber(fiber(Context)))).toBe(false);
  });

  test("finds the fiber React keeps on a node", () => {
    const node = fiber("button");
    expect(getFiber({ __reactFiber$abc: node } as unknown as Element)).toBe(asFiber(node));
    expect(getFiber({ __reactFiber$abc: {} } as unknown as Element)).toBeNull();
  });

  test("reads the list key of the item, one component up at most", () => {
    const root = fiber(App);
    const list = fiber("ul", null, root);
    fiber(Row, "a", list);
    const row = fiber(Row, "b", list);
    const li = fiber("li", null, row);
    expect(listKey(asFiber(li))).toBe("b");
    const routed = fiber(App, "route", fiber("main"));
    const inner = fiber("div", null, fiber(Row, null, fiber(App, null, routed)));
    expect(listKey(asFiber(inner))).toBeNull();
  });

  test("lists component names up the tree, filtered", () => {
    const leaf = fiber("span", null, fiber(Row, null, fiber("div", null, fiber(App))));
    expect(componentNames(asFiber(leaf), 5, () => true)).toEqual(["Row", "App"]);
    expect(componentNames(asFiber(leaf), 1, () => true)).toEqual(["Row"]);
    expect(componentNames(asFiber(leaf), 5, (name) => name !== "Row")).toEqual(["App"]);
  });
});

/** An element with no fiber, and a document that finds it by its test id. */
function plain(tag: string, testId: string, text: string): Element {
  const attrs: Record<string, string> = { "data-testid": testId };
  const doc = {
    scripts: [],
    baseURI: "http://localhost/",
    body: null,
    documentElement: null,
    defaultView: null,
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: (selector: string) => (selector.includes(testId) ? [element] : []),
  };
  const element = {
    nodeType: 1,
    tagName: tag.toUpperCase(),
    namespaceURI: "http://www.w3.org/1999/xhtml",
    ownerDocument: doc,
    attributes: [{ name: "data-testid", value: testId }],
    childNodes: [{ nodeType: 3, textContent: text }],
    children: [],
    parentElement: null,
    parentNode: null,
    assignedSlot: null,
    getAttribute: (name: string) => attrs[name] ?? null,
    hasAttribute: (name: string) => name in attrs,
    getRootNode: () => doc,
    matches: (query: string) => query.includes("[data-testid]"),
    getElementsByTagName: () => [],
  };
  return element as unknown as Element;
}

describe("grabContext", () => {
  test("gives each element a line, with a selector where no source names it, duplicates once", async () => {
    const save = plain("button", "save", "Save");
    const cancel = plain("button", "cancel", "Cancel");
    const payload = await grabContext([save, cancel, save]);
    expect(payload.content).toBe(
      '[<button data-testid="save">Save</button> selector: [data-testid="save"]]\n' +
        '[<button data-testid="cancel">Cancel</button> selector: [data-testid="cancel"]]',
    );
    expect(payload.entries.map((entry) => entry.tagName)).toEqual(["button", "button"]);
    expect(payload.entries[0]?.frames).toEqual([]);
  });
});
