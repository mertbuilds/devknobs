import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { UNFRAMED } from "../src/engine/frame";
import { apply, fit, label, reset } from "../src/engine/width";

const ROOM = { width: 1200, height: 800 };

describe("fit", () => {
  test("keeps a frame that fits at its own size, centered", () => {
    expect(fit(390, ROOM)).toEqual({
      width: 390,
      height: 800,
      zoom: 1,
      scale: 1,
      transform: 1,
      left: 405,
      top: 0,
    });
  });

  test("fills the room at full width", () => {
    expect(fit("full", ROOM)).toMatchObject({ width: 1200, height: 800, scale: 1, left: 0 });
  });

  test("scales a wider frame down and makes it taller by as much", () => {
    const place = fit(1600, ROOM);
    expect(place.scale).toBe(0.75);
    expect(place.width).toBe(1600);
    expect(place.height * place.scale).toBe(800);
    expect(place.left).toBe(0);
  });

  test("undoes the zoom in the wrapper and keeps the css size", () => {
    const place = fit(390, ROOM, 1.5);
    expect(place).toMatchObject({ width: 390, height: 800, zoom: 1.5, scale: 1, left: 405 });
    expect(place.transform * place.zoom).toBe(1);
    const wide = fit(1600, ROOM, 0.5);
    expect(wide.transform).toBe(1.5);
    expect(wide.width * wide.zoom * wide.transform).toBe(1200);
  });

  test("leaves the scale alone when there is no room to measure", () => {
    expect(fit("full", { width: 0, height: 0 }).scale).toBe(1);
    expect(fit(390, { width: 0, height: 0 }, 1, 844).scale).toBe(1);
  });

  test("keeps a height that fits, centered both ways", () => {
    expect(fit(402, ROOM, 1, 600)).toEqual({
      width: 402,
      height: 600,
      zoom: 1,
      scale: 1,
      transform: 1,
      left: 399,
      top: 100,
    });
  });

  test("scales a taller frame down to fit the height, and keeps its size", () => {
    const place = fit(402, ROOM, 1, 1000);
    expect(place).toMatchObject({ width: 402, height: 1000, scale: 0.8, top: 0 });
    expect(place.left).toBeCloseTo((1200 - 402 * 0.8) / 2);
  });

  test("scales by the tighter axis", () => {
    const wide = fit(1920, ROOM, 1, 1080);
    expect(wide.scale).toBe(0.625);
    expect(wide).toMatchObject({ width: 1920, height: 1080, left: 0, top: 62.5 });
    const tall = fit(1032, ROOM, 1, 1376);
    expect(tall.scale).toBeCloseTo(800 / 1376);
    expect(tall.top).toBe(0);
    expect(tall.left).toBeCloseTo((1200 - 1032 * tall.scale) / 2);
  });

  test("undoes the zoom in the wrapper with a height too", () => {
    const place = fit(1920, ROOM, 0.5, 1080);
    expect(place.width * place.zoom * place.transform).toBe(1200);
    expect(place.height * place.zoom * place.transform).toBe(675);
  });

  test("a height at full width keeps the window's width", () => {
    expect(fit("full", ROOM, 1, 600)).toMatchObject({ width: 1200, height: 600, top: 100 });
  });
});

const NO_DEVICE = { dpr: "system", height: "full", device: "none" } as const;

describe("label", () => {
  test("names the width, the scale when the frame is drawn smaller, and the ratio", () => {
    expect(label(fit(390, ROOM), NO_DEVICE)).toBe("390");
    expect(label(fit(1920, ROOM), NO_DEVICE)).toBe("1920 at 63%");
    expect(label(fit(1920, ROOM, 1.5), { ...NO_DEVICE, dpr: 3 })).toBe("1920 at 63% · 3x");
  });

  test("names a height of its own, and the device", () => {
    expect(label(fit(390, ROOM, 1, 700), { ...NO_DEVICE, height: 700 })).toBe("390 × 700");
    const phone = { dpr: 3, height: 874, device: "iphone-16-pro" };
    expect(label(fit(402, ROOM, 1, 874), phone)).toBe("iPhone 16 Pro · 402 × 874 at 92% · 3x");
    const desk = { dpr: 1, height: 1080, device: "desktop" };
    expect(label(fit(1920, ROOM, 1, 1080), desk)).toBe("desktop · 1920 × 1080 at 63% · 1x");
  });
});

/** A style declaration, as far as the frame reads and writes one. */
class FakeStyle {
  private readonly values = new Map<string, { value: string; priority: string }>();

  getPropertyValue(name: string): string {
    return this.values.get(name)?.value ?? "";
  }

  getPropertyPriority(name: string): string {
    return this.values.get(name)?.priority ?? "";
  }

  setProperty(name: string, value: string, priority = ""): void {
    this.values.set(name, { value, priority });
  }

  removeProperty(name: string): void {
    this.values.delete(name);
  }
}

/** Just enough of an element for the frame to come up over a page and go again. */
class FakeElement extends EventTarget {
  readonly attributes = new Map<string, string>();
  readonly children: FakeElement[] = [];
  parent: FakeElement | null = null;
  shadowRoot: FakeElement | null = null;
  readonly style = new FakeStyle();
  textContent = "";
  clientWidth = 0;
  clientHeight = 0;

  constructor(readonly tagName = "DIV") {
    super();
  }

  hasAttribute(name: string): boolean {
    return this.attributes.has(name);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }

  /** An attribute selector such as `[data-devknobs]`, the only kind the frame asks for. */
  closest(selector: string): FakeElement | null {
    const name = selector.slice(1, -1);
    for (let node: FakeElement | null = this; node; node = node.parent) {
      if (node.hasAttribute(name)) return node;
    }
    return null;
  }

  append(...nodes: FakeElement[]): void {
    for (const node of nodes) {
      node.parent = this;
      this.children.push(node);
    }
  }

  appendChild(node: FakeElement): FakeElement {
    this.append(node);
    return node;
  }

  remove(): void {
    const siblings = this.parent?.children;
    siblings?.splice(siblings.indexOf(this), 1);
    this.parent = null;
  }

  attachShadow(): FakeElement {
    this.shadowRoot = new FakeElement("#shadow-root");
    return this.shadowRoot;
  }

  /** Every element under this one, through shadow roots too. */
  *descendants(): Generator<FakeElement> {
    for (const child of this.children) {
      yield child;
      if (child.shadowRoot) yield* child.shadowRoot.descendants();
      yield* child.descendants();
    }
  }
}

/** A dialog. `showModal` on its prototype stands in for the browser's own. */
class FakeDialog extends FakeElement {
  open = false;
  modal = false;

  constructor() {
    super("DIALOG");
  }

  show(): void {
    this.open = true;
  }

  showModal(): void {
    this.open = true;
    this.modal = true;
  }

  close(): void {
    this.open = false;
    this.modal = false;
  }
}

class FakeObserver {
  observe(): void {}
  disconnect(): void {}
}

const PAGE = "http://localhost:3000/settings";
const FRAMED = "http://localhost:3000/settings/billing";
const EARLIER = "http://localhost:3000/";
const SCROLL_Y = 600;
const VIEWPORT = { ...UNFRAMED, scheme: "system", device: "none", width: 390 } as const;
const NATIVE_SHOW_MODAL = FakeDialog.prototype.showModal;

let body: FakeElement;
let head: FakeElement;
let location: { href: string; origin: string; assign: (url: string) => void };
/** Where the window was sent, and every `scrollTo`. */
let assigned: string[];
let scrolls: ScrollToOptions[];

function define(name: string, value: unknown): void {
  Object.defineProperty(globalThis, name, { configurable: true, value });
}

function everything(): FakeElement[] {
  return [...head.descendants(), ...body.descendants()];
}

function frameElement(): FakeElement {
  const frame = everything().find((element) => element.tagName === "IFRAME");
  if (!frame) throw new Error("no frame");
  return frame;
}

function widthStyle(): FakeElement | undefined {
  return head.children.find((element) => element.getAttribute("data-devknobs") === "width");
}

/** The frame's page loads at `href`, on this origin. */
function load(href: string): void {
  const frame = frameElement();
  Object.assign(frame, {
    contentWindow: { location: { href }, navigation: new EventTarget() },
    contentDocument: { title: "billing", head: new FakeElement("HEAD") },
  });
  frame.dispatchEvent(new Event("load"));
}

beforeEach(() => {
  body = new FakeElement("BODY");
  head = new FakeElement("HEAD");
  assigned = [];
  scrolls = [];
  location = { href: PAGE, origin: "http://localhost:3000", assign: (url) => assigned.push(url) };
  define("window", {
    location,
    history: { state: null },
    scrollX: 0,
    scrollY: SCROLL_Y,
    devicePixelRatio: 1,
    scrollTo: (options: ScrollToOptions) => scrolls.push(options),
    addEventListener: () => {},
    removeEventListener: () => {},
  });
  define("document", {
    body,
    head,
    title: "settings",
    createElement: (tag: string) =>
      tag === "dialog" ? new FakeDialog() : new FakeElement(tag.toUpperCase()),
    querySelector: (selector: string) =>
      selector === 'style[data-devknobs="width"]' ? (widthStyle() ?? null) : null,
    querySelectorAll: (selector: string) =>
      selector === "dialog:modal"
        ? everything().filter((element) => element instanceof FakeDialog && element.modal)
        : [],
    addEventListener: () => {},
    removeEventListener: () => {},
  });
  define("History", class {
    replaceState(_state: unknown, _title: string, url: string): void {
      location.href = url;
    }
  });
  define("HTMLElement", FakeElement);
  define("SVGElement", class {});
  define("HTMLDialogElement", FakeDialog);
  define("MutationObserver", FakeObserver);
});

afterEach(() => {
  reset();
  FakeDialog.prototype.showModal = NATIVE_SHOW_MODAL;
  for (const name of [
    "window",
    "document",
    "History",
    "HTMLElement",
    "SVGElement",
    "HTMLDialogElement",
    "MutationObserver",
  ]) {
    Reflect.deleteProperty(globalThis, name);
  }
});

describe("the frame over the page", () => {
  test("gives the page underneath plain dialogs, and its own showModal back after", () => {
    const open = new FakeDialog();
    const ours = new FakeDialog();
    const panel = new FakeElement();
    panel.setAttribute("data-devknobs", "panel");
    panel.append(ours);
    body.append(open, panel);
    open.showModal();
    ours.showModal();
    apply(VIEWPORT);
    expect(open).toMatchObject({ open: true, modal: false });
    expect(ours.modal).toBe(true);
    const later = new FakeDialog();
    body.append(later);
    later.showModal();
    expect(later).toMatchObject({ open: true, modal: false });
    reset();
    expect(FakeDialog.prototype.showModal).toBe(NATIVE_SHOW_MODAL);
    later.close();
    later.showModal();
    expect(later.modal).toBe(true);
  });

  test("hides the page's popovers until it goes", () => {
    apply(VIEWPORT);
    expect(widthStyle()?.textContent).toContain(
      ":popover-open:not([data-devknobs]){display:none!important}",
    );
    reset();
    expect(widthStyle()).toBeUndefined();
  });

  test("lets the frame lock the pointer, present and lock the orientation", () => {
    apply(VIEWPORT);
    const sandbox = frameElement().getAttribute("sandbox")?.split(" ");
    expect(sandbox).toContain("allow-pointer-lock");
    expect(sandbox).toContain("allow-presentation");
    expect(sandbox).toContain("allow-orientation-lock");
    expect(sandbox).not.toContain("allow-top-navigation");
  });

  test("comes up for a height alone, that tall, and reads it out", () => {
    apply({ ...UNFRAMED, scheme: "system", device: "none", height: 700 });
    expect(Reflect.get(frameElement().style, "height")).toBe("700px");
    const readout = everything().find((element) => Reflect.get(element, "className") === "size");
    expect(readout && Reflect.get(readout, "hidden")).toBe(false);
  });

  test("puts the page's own address back over the frame's", () => {
    apply(VIEWPORT);
    load(FRAMED);
    expect(location.href).toBe(FRAMED);
    reset();
    expect(location.href).toBe(PAGE);
  });

  test("leaves the address alone once the window went back to another entry", () => {
    apply(VIEWPORT);
    load(FRAMED);
    location.href = EARLIER;
    reset();
    expect(location.href).toBe(EARLIER);
  });

  test("scrolls the page back to where it was", () => {
    apply(VIEWPORT);
    reset();
    expect(scrolls).toEqual([{ left: 0, top: SCROLL_Y, behavior: "instant" }]);
    expect(assigned).toEqual([]);
  });

  test("sends the window after the frame instead, when the knobs go off", () => {
    apply(VIEWPORT);
    load(FRAMED);
    apply({ ...UNFRAMED, scheme: "system", device: "none" });
    expect(assigned).toEqual([FRAMED]);
    expect(scrolls).toEqual([]);
  });

  test("stays on the entry the window went back to, when the knobs go off", () => {
    apply(VIEWPORT);
    load(FRAMED);
    location.href = EARLIER;
    apply({ ...UNFRAMED, scheme: "system", device: "none" });
    expect(assigned).toEqual([]);
    expect(location.href).toBe(EARLIER);
  });
});
