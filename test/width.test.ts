import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { DEVICES, turn } from "../src/engine/devices";
import { UNFRAMED } from "../src/engine/frame";
import { mockOf } from "../src/engine/mock";
import { apply, fit, label, onZoom, origin, reset, STRIP, zoomKey } from "../src/engine/width";
import type { ZoomValue } from "../src/types";

/** A letterbox that leaves 1200 by 800 under its readout strip. */
const BOX = { width: 1200, height: 800 + STRIP };
const ROOM = { width: 1200, height: 800 };
const FULL = { width: "full", height: "full", zoom: "fit" } as const;
const PHONE = { width: 402, height: 874, zoom: "fit" } as const;
const DESKTOP = { width: 1920, height: 1080, zoom: "fit" } as const;
/** What the open panel covers of the right edge. */
const PANEL = 261;

describe("fit", () => {
  test("keeps a frame that fits at its own size, under the strip, with a margin across", () => {
    expect(fit({ ...FULL, width: 390 }, BOX)).toEqual({
      width: 390,
      height: 800,
      zoom: 1,
      scale: 1,
      fit: 1,
      transform: 1,
      box: { width: 438, height: 800 },
      left: 24,
      top: 0,
    });
  });

  test("is the whole window at full size, with no strip and no margin", () => {
    expect(fit(FULL, BOX)).toMatchObject({
      width: 1200,
      height: 824,
      scale: 1,
      box: { width: 1200, height: 824 },
      left: 0,
      top: 0,
    });
  });

  test("scales a wider frame down inside its margins, and makes it taller by as much", () => {
    const place = fit({ ...FULL, width: 1600 }, BOX);
    expect(place.scale).toBe(0.72);
    expect(place.width).toBe(1600);
    expect(place.height * place.scale).toBeCloseTo(800);
    expect(place.box.width).toBeCloseTo(1200);
  });

  test("keeps a height that fits, and a margin all round", () => {
    expect(fit({ ...PHONE, height: 600 }, BOX)).toMatchObject({
      width: 402,
      height: 600,
      scale: 1,
      box: { width: 450, height: 648 },
      left: 24,
      top: 24,
    });
  });

  test("scales by the tighter axis, inside the margins", () => {
    const wide = fit(DESKTOP, BOX);
    expect(wide.scale).toBe(0.6);
    expect(wide.box.width).toBeCloseTo(1200);
    expect(wide.box.height).toBeCloseTo(696);
    const tall = fit({ width: 1032, height: 1376, zoom: "fit" }, BOX);
    expect(tall.scale).toBeCloseTo(752 / 1376);
    expect(tall.box.height).toBeCloseTo(800);
  });

  test("shows every device whole with a margin, either way up, in any window", () => {
    const windows = [
      { width: 1200, height: 805 },
      { width: 1440, height: 900 },
      { width: 1920, height: 1080 },
      { width: 800, height: 600 },
      { width: 390, height: 700 },
    ];
    for (const device of DEVICES) {
      for (const way of ["portrait", "landscape"] as const) {
        const size = turn(device, way);
        for (const letterbox of windows) {
          for (const aside of [0, PANEL]) {
            const place = fit({ ...size, zoom: "fit" }, letterbox, { aside });
            expect(place.box.width).toBeLessThanOrEqual(letterbox.width + 1e-9);
            expect(place.box.height).toBeLessThanOrEqual(letterbox.height - STRIP + 1e-9);
            expect(place.left).toBeGreaterThan(0);
            expect(place.top).toBeGreaterThan(0);
            expect(place.width * place.scale + 2 * place.left).toBeLessThanOrEqual(
              place.box.width + 1e-9,
            );
            expect(place.height * place.scale + 2 * place.top).toBeCloseTo(place.box.height);
          }
        }
      }
    }
  });

  test("draws the frame at the zoom picked, at the same css size, in a box that scrolls", () => {
    const place = fit({ ...PHONE, zoom: 1.5 }, BOX);
    expect(place).toMatchObject({ width: 402, height: 874, scale: 1.5, transform: 1.5 });
    expect(place.fit).toBeCloseTo(752 / 874);
    expect(place.box.width).toBeCloseTo(402 * 1.5 + 48);
    expect(place.box.height).toBeCloseTo(874 * 1.5 + 48);
    expect(fit({ ...PHONE, zoom: 0.5 }, BOX).box).toEqual({ width: 249, height: 485 });
  });

  test("keeps the css height of a frame without one of its own at any zoom", () => {
    const fitted = fit({ ...FULL, width: 1600 }, BOX);
    for (const zoom of [0.5, 1, 1.25]) {
      const place = fit({ ...FULL, width: 1600, zoom }, BOX);
      expect(place.height).toBe(fitted.height);
      expect(place.box.height).toBeCloseTo(fitted.height * zoom);
    }
  });

  test("reads out a zoom at full size too, under the strip", () => {
    expect(fit({ ...FULL, zoom: 0.5 }, BOX)).toMatchObject({
      width: 1200,
      height: 800,
      scale: 0.5,
      box: { width: 600, height: 400 },
    });
  });

  test("undoes the device pixel ratio's zoom in the wrapper, and keeps the css size", () => {
    const place = fit({ ...FULL, width: 390 }, BOX, { frameZoom: 1.5 });
    expect(place).toMatchObject({ width: 390, height: 800, zoom: 1.5, scale: 1 });
    expect(place.transform * place.zoom).toBe(1);
    const wide = fit(DESKTOP, BOX, { frameZoom: 0.5 });
    expect(wide.transform).toBeCloseTo(1.2);
    expect(wide.width * wide.zoom * wide.transform).toBeCloseTo(1152);
    expect(wide.height * wide.zoom * wide.transform).toBeCloseTo(648);
  });

  test("fits a frame the open panel would cover into the room left of it", () => {
    const place = fit(DESKTOP, BOX, { aside: PANEL });
    expect(place.scale).toBeCloseTo((1200 - PANEL - 48) / 1920);
    expect(place.fit).toBe(place.scale);
    expect(place.box.width).toBeCloseTo(1200);
    expect(place.width * place.scale + 2 * place.left).toBeCloseTo(1200 - PANEL);
  });

  test("leaves a frame clear of the panel where it is, a zoom too", () => {
    expect(fit(PHONE, BOX, { aside: PANEL })).toEqual(fit(PHONE, BOX));
    expect(fit({ ...DESKTOP, zoom: 1 }, BOX, { aside: PANEL }).box.width).toBe(1968);
    expect(fit({ ...FULL, height: 600 }, BOX, { aside: PANEL })).toEqual(
      fit({ ...FULL, height: 600 }, BOX),
    );
  });

  test("lets a panel over most of the room cover the frame", () => {
    const narrow = { width: 500, height: 900 };
    expect(fit(DESKTOP, narrow, { aside: PANEL })).toEqual(fit(DESKTOP, narrow));
  });

  test("fits the whole mock, and places the frame inside it at its css size", () => {
    const mock = { top: 12, right: 14, bottom: 12, left: 14 };
    const place = fit(PHONE, BOX, { mock });
    expect(place).toMatchObject({ width: 402, height: 874 });
    expect(place.scale).toBeCloseTo(752 / 898);
    expect(place.box.height).toBeCloseTo(800);
    expect(place.box.width).toBeCloseTo(430 * place.scale + 48);
    expect(place.left).toBeCloseTo(24 + 14 * place.scale);
    expect(place.top).toBeCloseTo(24 + 12 * place.scale);
    const zoomed = fit({ ...PHONE, zoom: 1 }, BOX, { mock });
    expect(zoomed.box).toEqual({ width: 430 + 48, height: 898 + 48 });
    expect(zoomed).toMatchObject({ left: 38, top: 36 });
  });

  test("fits the iPhone SE's tall forehead and chin, its frame still at its css size", () => {
    const mock = mockOf("iphone-se", "portrait");
    const inset = mock?.inset;
    const place = fit({ width: 375, height: 667, zoom: "fit" }, BOX, { mock: inset });
    expect(place).toMatchObject({ width: 375, height: 667 });
    expect(place.scale).toBeCloseTo(752 / (mock?.height ?? 0));
    expect(place.top).toBeCloseTo(24 + 110.2 * place.scale);
    const margin = (place.box.width - (mock?.width ?? 0) * place.scale) / 2;
    expect(place.left).toBeCloseTo(margin + (inset?.left ?? 0) * place.scale);
    const zoomed = fit({ width: 375, height: 667, zoom: 1 }, BOX, { mock: inset });
    expect(zoomed.box.height).toBeCloseTo(887.5 + 48);
    expect(zoomed.left).toBeCloseTo(24 + 28.1 + 2.6);
  });

  test("shows every mock whole with a margin, either way up, beside the panel too", () => {
    const windows = [
      { width: 1200, height: 805 },
      { width: 1440, height: 900 },
      { width: 800, height: 600 },
      { width: 390, height: 700 },
    ];
    for (const device of DEVICES) {
      for (const way of ["portrait", "landscape"] as const) {
        const mock = mockOf(device.id, way);
        if (!mock) continue;
        const size = turn(device, way);
        for (const letterbox of windows) {
          for (const aside of [0, PANEL]) {
            const place = fit({ ...size, zoom: "fit" }, letterbox, { aside, mock: mock.inset });
            const margin = place.left - mock.inset.left * place.scale;
            expect(place.box.width).toBeLessThanOrEqual(letterbox.width + 1e-9);
            expect(place.box.height).toBeLessThanOrEqual(letterbox.height - STRIP + 1e-9);
            expect(margin).toBeGreaterThan(0);
            expect(mock.width * place.scale + 2 * margin).toBeLessThanOrEqual(
              place.box.width + 1e-9,
            );
            const top = place.top - mock.inset.top * place.scale;
            expect(mock.height * place.scale + 2 * top).toBeCloseTo(place.box.height);
          }
        }
      }
    }
  });

  test("keeps a mocked frame clear of the open panel", () => {
    const mock = mockOf("ipad-pro-13", "landscape")?.inset;
    const size = turn({ width: 1032, height: 1376 }, "landscape");
    const place = fit({ ...size, zoom: "fit" }, BOX, { aside: PANEL, mock });
    const right = place.left + (size.width + (mock?.right ?? 0)) * place.scale;
    expect(right + 24).toBeLessThanOrEqual(1200 - PANEL + 1e-9);
  });

  test("leaves the scale alone when there is no room to measure", () => {
    expect(fit(FULL, { width: 0, height: 0 }).scale).toBe(1);
    expect(fit({ ...FULL, width: 390, height: 844 }, { width: 0, height: 0 }).scale).toBe(1);
  });
});

describe("origin", () => {
  test("centers a box smaller than the room, margins and all", () => {
    const place = fit({ ...PHONE, zoom: 0.5 }, BOX);
    expect(origin(place, ROOM)).toEqual({ x: (1200 - 249) / 2 + 24, y: (800 - 485) / 2 + 24 });
  });

  test("starts a box bigger than the room at its edge, so all of it scrolls into view", () => {
    expect(origin(fit({ ...DESKTOP, zoom: 1 }, BOX), ROOM)).toEqual({ x: 24, y: 24 });
    expect(origin(fit({ ...PHONE, zoom: 1.5 }, BOX), ROOM)).toEqual({ x: 298.5, y: 24 });
  });
});

const NO_DEVICE = { dpr: "system", height: "full", device: "none" } as const;

describe("label", () => {
  test("names the width and the ratio, and leaves the scale to the zoom control", () => {
    expect(label(fit({ ...FULL, width: 390 }, BOX), NO_DEVICE)).toBe("390");
    expect(label(fit({ ...FULL, width: 1920 }, BOX), NO_DEVICE)).toBe("1920");
    expect(label(fit({ ...FULL, width: 1920 }, BOX), { ...NO_DEVICE, dpr: 3 })).toBe("1920 · 3x");
  });

  test("names a height of its own, and the device", () => {
    const tall = fit({ ...FULL, width: 390, height: 700 }, BOX);
    expect(label(tall, { ...NO_DEVICE, height: 700 })).toBe("390 × 700");
    const phone = { dpr: 3, height: 874, device: "iphone-16-pro" };
    expect(label(fit(PHONE, BOX), phone)).toBe("iPhone 16 Pro · 402 × 874 · 3x");
    const desk = { dpr: 1, height: 1080, device: "desktop" };
    expect(label(fit(DESKTOP, BOX), desk)).toBe("desktop · 1920 × 1080 · 1x");
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

  replaceChildren(...nodes: FakeElement[]): void {
    this.children.length = 0;
    this.append(...nodes);
  }

  prepend(node: FakeElement): void {
    node.parent = this;
    this.children.unshift(node);
  }

  replaceWith(node: FakeElement): void {
    const siblings = this.parent?.children;
    if (!siblings) return;
    node.parent = this.parent;
    siblings.splice(siblings.indexOf(this), 1, node);
    this.parent = null;
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
const KNOBS = {
  ...UNFRAMED,
  scheme: "system",
  device: "none",
  orientation: "portrait",
  mock: true,
  browser: "auto",
  browserMin: false,
  zoom: "fit",
  panel: { open: false },
} as const;
const VIEWPORT = { ...KNOBS, width: 390 } as const;
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
    requestAnimationFrame: () => 0,
    addEventListener: () => {},
    removeEventListener: () => {},
  });
  define("document", {
    body,
    head,
    title: "settings",
    createElement: (tag: string) =>
      tag === "dialog" ? new FakeDialog() : new FakeElement(tag.toUpperCase()),
    createElementNS: (_namespace: string, tag: string) => new FakeElement(tag),
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
  onZoom(null);
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
    apply({ ...KNOBS, height: 700 });
    expect(Reflect.get(frameElement().style, "height")).toBe("700px");
    const readout = everything().find((element) => Reflect.get(element, "className") === "size");
    expect(readout && Reflect.get(readout, "hidden")).toBe(false);
  });

  test("offers fit, the presets and a zoom of the wheel's own, and stores a pick", () => {
    const zooms: ZoomValue[] = [];
    onZoom((zoom) => zooms.push(zoom));
    apply({ ...VIEWPORT, zoom: 0.8 });
    const picker = everything().find((element) => element.tagName === "SELECT");
    if (!picker) throw new Error("no zoom control");
    expect(picker.children.map((option) => option.textContent)).toEqual([
      "fit 100%",
      "50%",
      "75%",
      "80%",
      "100%",
      "125%",
      "150%",
    ]);
    expect(Reflect.get(picker, "value")).toBe("0.8");
    Reflect.set(picker, "value", "1.25");
    picker.dispatchEvent(new Event("change"));
    Reflect.set(picker, "value", "fit");
    picker.dispatchEvent(new Event("change"));
    expect(zooms).toEqual([1.25, "fit"]);
  });

  test("steps the zoom from the scale the frame is drawn at, and goes back to fit", () => {
    const zooms: ZoomValue[] = [];
    onZoom((zoom) => zooms.push(zoom));
    expect(zoomKey("zoom-in")).toBe(false);
    apply(VIEWPORT);
    expect(zoomKey("zoom-in")).toBe(true);
    expect(zoomKey("zoom-out")).toBe(true);
    expect(zoomKey("zoom-fit")).toBe(true);
    expect(zooms).toEqual([1.1, 0.9, "fit"]);
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
    apply(KNOBS);
    expect(assigned).toEqual([FRAMED]);
    expect(scrolls).toEqual([]);
  });

  test("stays on the entry the window went back to, when the knobs go off", () => {
    apply(VIEWPORT);
    load(FRAMED);
    location.href = EARLIER;
    apply(KNOBS);
    expect(assigned).toEqual([]);
    expect(location.href).toBe(EARLIER);
  });
});
