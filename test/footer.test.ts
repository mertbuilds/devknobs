import { afterEach, describe, expect, test } from "bun:test";
import type { LiveKeys } from "../src/ui/bindings";
import { createFooter, FRESH_NOTE } from "../src/ui/footer";
import { defaultKeys } from "../src/ui/keys";

/** An element, as far as the footer builds one. */
class FakeNode {
  className = "";
  textContent = "";
  dataset: Record<string, string> = {};
  children: (FakeNode | string)[] = [];
  attributes = new Map<string, string>();

  append(...nodes: (FakeNode | string)[]): void {
    this.children.push(...nodes);
  }

  replaceChildren(...nodes: (FakeNode | string)[]): void {
    this.children = [...nodes];
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
}

function fake(node: unknown): FakeNode {
  if (!(node instanceof FakeNode)) throw new Error("not a fake node");
  return node;
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

describe("the pin control", () => {
  /** How many shapes the control's icon has: lucide's pin has two, its pin-off four. */
  const shapes = (pin: FakeNode) => fake(pin.children[0]).children.length;

  test("sits before the settings, at the end of the keys, an icon alone", () => {
    page("");
    const footer = createFooter(keys, null, true);
    const meta = fake(fake(footer.foot).children.at(-1));
    expect(meta.children.slice(-2)).toEqual([fake(footer.pin), fake(footer.keysToggle)]);
    expect(footer.pin.className).toBe("hint pin-toggle");
    expect(fake(footer.pin).textContent).toBe("");
    expect(fake(footer.pin).children).toHaveLength(1);
  });

  test("starts unpressed, and says pin to the side", () => {
    page("");
    const pin = fake(createFooter(keys, null, true).pin);
    expect(pin.attributes.get("aria-pressed")).toBe("false");
    expect(pin.attributes.get("aria-label")).toBe("pin to the side");
    expect(shapes(pin)).toBe(2);
  });

  test("is pressed while the panel is pinned, and says unpin, with the other icon", () => {
    page("");
    const footer = createFooter(keys, null, true);
    const pin = fake(footer.pin);
    footer.drawPin(true);
    expect(pin.attributes.get("aria-pressed")).toBe("true");
    expect(pin.attributes.get("aria-label")).toBe("unpin");
    expect(pin.children).toHaveLength(1);
    expect(shapes(pin)).toBe(4);
    footer.drawPin(false);
    expect(pin.attributes.get("aria-pressed")).toBe("false");
    expect(pin.attributes.get("aria-label")).toBe("pin to the side");
    expect(shapes(pin)).toBe(2);
  });

  test("draws its icon once for a state it already shows", () => {
    page("");
    const footer = createFooter(keys, null, true);
    footer.drawPin(true);
    const icon = fake(footer.pin).children[0];
    footer.drawPin(true);
    expect(fake(footer.pin).children[0]).toBe(icon);
  });
});
