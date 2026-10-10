import { afterEach, describe, expect, test } from "bun:test";
import type { LiveKeys } from "../src/ui/bindings";
import { resolveKeys } from "../src/ui/bindings";
import { createFooter, FRESH_NOTE, keyChips } from "../src/ui/footer";
import { defaultKeys } from "../src/ui/keys";

/** An element, as far as the footer builds one. */
class FakeNode {
  className = "";
  textContent = "";
  dataset: Record<string, string> = {};
  children: (FakeNode | string)[] = [];

  append(...nodes: (FakeNode | string)[]): void {
    this.children.push(...nodes);
  }

  setAttribute(): void {}
}

const keys: LiveKeys = {
  get: () => defaultKeys(),
  custom: () => false,
  set: () => {},
  subscribe: () => () => {},
  recording: false,
  destroy: () => {},
};

/** A page at this address query, with a document the footer can build in. */
function page(search: string): void {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { location: { search }, name: "", frameElement: null, sessionStorage: null },
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { createElement: () => new FakeNode(), createElementNS: () => new FakeNode() },
  });
}

/** The class of each node in the footer, in order. */
function parts(): string[] {
  return Array.from(createFooter(keys, null, true).foot.children, (node) => node.className);
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, "window");
  Reflect.deleteProperty(globalThis, "document");
});

describe("createFooter", () => {
  test("says fresh mode is on, between the badge and the keys", () => {
    page("?devknobs=fresh");
    const footer = createFooter(keys, null, true);
    expect(parts()).toEqual(["badge", "fresh-note", "meta"]);
    expect(footer.foot.children[1]?.textContent).toBe(FRESH_NOTE);
  });

  test("says nothing of it with the mode off", () => {
    page("");
    expect(parts()).toEqual(["badge", "meta"]);
  });
});

describe("keyChips", () => {
  test("a binding with no key keeps its hint, with no key on it", () => {
    // Reset's default went to grab, so reset has none.
    const keys = resolveKeys(defaultKeys(), { grab: "shift+backspace" });
    expect(keys.reset).toBeNull();
    expect(keyChips(keys, true, true).map((chip) => [chip.command, chip.key])).toEqual([
      ["panel", "⇧K"],
      ["search", "/"],
      ["grab", "⇧⌫"],
      ["replay", "⇧R"],
      ["reset", ""],
    ]);
  });
});
