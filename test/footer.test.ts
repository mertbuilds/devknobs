import { afterEach, describe, expect, test } from "bun:test";
import type { LiveKeys } from "../src/ui/bindings";
import { createFooter, FRESH_NOTE } from "../src/ui/footer";
import { defaultKeys } from "../src/ui/keys";
import { collapseTip, COLLAPSE_WORD, SIDE_WORD } from "../src/ui/pin";
import { CSS } from "../src/ui/styles";

/** An element, as far as the footer builds one. */
class FakeNode {
  className = "";
  textContent = "";
  hidden = false;
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

describe("a pinned panel's controls", () => {
  /** The class and the shapes of a control's icon. */
  const glyph = (control: unknown) => {
    const icon = fake(fake(control).children[0]);
    return { class: icon.attributes.get("class"), shapes: icon.children.length };
  };

  test("sit before the pin, the one that takes it across and then the one that closes it", () => {
    page("");
    const footer = createFooter(keys, null, true);
    const meta = fake(fake(footer.foot).children.at(-1));
    expect(meta.children.slice(-4)).toEqual([
      fake(footer.flip),
      fake(footer.collapse),
      fake(footer.pin),
      fake(footer.keysToggle),
    ]);
    expect(footer.flip.className).toBe("hint flip-toggle");
    expect(footer.collapse.className).toBe("hint collapse-toggle");
  });

  test("show only while the panel is pinned", () => {
    page("");
    const footer = createFooter(keys, null, true);
    expect([footer.flip.hidden, footer.collapse.hidden]).toEqual([true, true]);
    footer.drawPin(true);
    expect([footer.flip.hidden, footer.collapse.hidden]).toEqual([false, false]);
    footer.drawPin(false);
    expect([footer.flip.hidden, footer.collapse.hidden]).toEqual([true, true]);
  });

  test("are icons alone, named for assistive tech, that face the side the panel is on", () => {
    page("");
    const footer = createFooter(keys, null, true);
    expect(fake(footer.flip).attributes.get("aria-label")).toBe(SIDE_WORD);
    expect(fake(footer.collapse).attributes.get("aria-label")).toBe(COLLAPSE_WORD);
    expect(fake(footer.flip).textContent).toBe("");
    expect(fake(footer.collapse).textContent).toBe("");
    // lucide's panel-left has two shapes, and its panel-right-close three.
    expect(glyph(footer.flip)).toEqual({ class: "glyph sided", shapes: 2 });
    expect(glyph(footer.collapse)).toEqual({ class: "glyph sided", shapes: 3 });
    expect(CSS).toContain('.wrap[data-side="left"] .glyph.sided { transform: scaleX(-1); }');
  });

  test("say what they do, the one that closes with the panel's key", () => {
    expect(SIDE_WORD).toBe("move to the other side");
    expect(collapseTip("⇧K")).toBe("close the panel · ⇧K");
  });

  test("take the pin's place at the start of the icons, which stay at the end of the line", () => {
    expect(CSS).toContain(".pin-toggle, .flip-toggle { margin-left: auto; }");
    expect(CSS).toContain(".flip-toggle:not([hidden]) ~ .pin-toggle { margin-left: 0; }");
  });
});
