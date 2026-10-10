import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { SCREENS, turn } from "../src/engine/devices";
import { FOLD_TIME } from "../src/engine/fold";
import { UNFRAMED } from "../src/engine/frame";
import { FRESH_ATTRIBUTE, FRESH_RELOAD_KEY } from "../src/engine/fresh";
import { patchedAs } from "../src/engine/identity";
import { mockOf } from "../src/engine/mock";
import { holeAt, holePath, MORPH_TIME, rounded, windowRect } from "../src/engine/morph";
import { keepDrawing, SNAPSHOT_KEY } from "../src/engine/placeholder";
import { DEFAULT_STATE, merge } from "../src/engine/store";
import { type Mark, MARK_EVENT } from "../src/engine/touchmark";
import {
  apply,
  fit,
  label,
  onZoom,
  origin,
  reset,
  STRIP,
  sync,
  zoomKey,
} from "../src/engine/width";
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
      height: 800 + STRIP,
      scale: 1,
      box: { width: 1200, height: 800 + STRIP },
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
    for (const device of SCREENS) {
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

  test("fits a frame a panel on the left would cover into the room right of it", () => {
    const right = fit(DESKTOP, BOX, { aside: PANEL });
    const left = fit(DESKTOP, BOX, { aside: PANEL, side: "left" });
    expect(left).toEqual({ ...right, left: right.left + PANEL });
    expect(left.box.width - (left.left + left.width * left.scale)).toBeCloseTo(right.left);
    expect(fit(PHONE, BOX, { aside: PANEL, side: "left" })).toEqual(fit(PHONE, BOX));
    expect(fit({ ...DESKTOP, zoom: 1 }, BOX, { aside: PANEL, side: "left" })).toEqual(
      fit({ ...DESKTOP, zoom: 1 }, BOX, { aside: PANEL }),
    );
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
    for (const device of SCREENS) {
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

  test("names the page a phone's browser leaves, with the device", () => {
    const phone = { dpr: 3, height: 874, device: "iphone-16-pro" };
    const page = { width: 402, height: 714 };
    expect(label(fit(PHONE, BOX), phone, page)).toBe("iPhone 16 Pro · 402 × 714 · 3x");
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
  readonly dataset: Record<string, string> = {};
  private readonly classes = new Set<string>();
  readonly classList = {
    add: (name: string) => this.classes.add(name),
    toggle: (name: string, on: boolean) => (on ? this.classes.add(name) : this.classes.delete(name)),
    contains: (name: string) => this.classes.has(name),
  };
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

  insertBefore(node: FakeElement, before: FakeElement | null): FakeElement {
    node.remove();
    node.parent = this;
    const at = before ? this.children.indexOf(before) : -1;
    if (at < 0) this.children.push(node);
    else this.children.splice(at, 0, node);
    return node;
  }

  appendChild(node: FakeElement): FakeElement {
    this.append(node);
    return node;
  }

  after(node: FakeElement): void {
    const siblings = this.parent?.children;
    this.parent?.insertBefore(node, siblings?.[siblings.indexOf(this) + 1] ?? null);
  }

  /** A copy with the same attributes, and copies of the children when `deep`. */
  cloneNode(deep = false): FakeElement {
    const copy = new FakeElement(this.tagName);
    for (const [name, value] of this.attributes) copy.setAttribute(name, value);
    if (deep) copy.append(...this.children.map((child) => child.cloneNode(true)));
    return copy;
  }

  /** A tag name such as `pattern`, the only kind the mat's splash asks for. */
  querySelector(selector: string): FakeElement | null {
    return [...this.descendants()].find((node) => node.tagName === selector) ?? null;
  }

  remove(): void {
    const siblings = this.parent?.children;
    siblings?.splice(siblings.indexOf(this), 1);
    this.parent = null;
  }

  /** An animation that runs until it is cancelled. */
  animate(_keyframes?: Keyframe[]): {
    finished: Promise<void>;
    currentTime: number;
    cancel: () => void;
  } {
    return { finished: new Promise(() => {}), currentTime: 0, cancel: () => {} };
  }

  getBoundingClientRect(): { left: number; top: number; width: number; height: number } {
    return { left: 0, top: 0, width: this.clientWidth, height: this.clientHeight };
  }

  /** A class selector such as `.domain`, the only kind the browser's bars ask for. */
  querySelectorAll(selector: string): FakeElement[] {
    const name = selector.slice(1);
    return [...this.descendants()].filter((node) =>
      String(Reflect.get(node, "className") ?? node.getAttribute("class")).split(" ").includes(name),
    );
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
  posture: "closed",
  mock: true,
  browser: "auto",
  bars: "auto",
  edgeToEdge: true,
  zoom: "fit",
  mat: "blue",
  panel: { open: false, side: "right" },
} as const;
const VIEWPORT = { ...KNOBS, width: 390 } as const;
const NATIVE_SHOW_MODAL = FakeDialog.prototype.showModal;

let body: FakeElement;
let head: FakeElement;
let location: { href: string; origin: string; assign: (url: string) => void };
/** Where the window was sent, and every `scrollTo`. */
let assigned: string[];
/** How many times the frame's page was reloaded, and stopped loading. */
let reloads: number;
let stops: number;
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

/** A document in the frame, as far as the frame and the patches read one. */
function fakeDocument(href: string) {
  return {
    URL: href,
    title: "billing",
    head: new FakeElement("HEAD"),
    documentElement: new FakeElement("HTML"),
    querySelector: () => null,
    createElement: (tag: string) => new FakeElement(tag.toUpperCase()),
  };
}

/**
 * The frame's window as the page above holds it: one object for good, where
 * each new page brings its own listeners, navigation and patches, as a real
 * page's window does. The first page takes the blank one over, patches and
 * all. A page on another origin cannot be read or listened to.
 */
class FakeView extends EventTarget {
  location = { href: "about:blank", reload: () => reloads++ };
  navigator = {};
  history = { pushState: () => {}, replaceState: () => {} };
  navigation: EventTarget | undefined = new EventTarget();
  /** Another origin's page is in the frame. */
  foreign = false;
  private page = fakeDocument("about:blank");
  private listeners: [string, EventListenerOrEventListenerObject | null][] = [];

  constructor(private readonly withNavigation = true) {
    super();
    if (!withNavigation) this.navigation = undefined;
  }

  get document() {
    if (this.foreign) throw new Error("SecurityError");
    return this.page;
  }

  override addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: AddEventListenerOptions | boolean,
  ): void {
    if (this.foreign) throw new Error("SecurityError");
    this.listeners.push([type, listener]);
    super.addEventListener(type, listener, options);
  }

  matchMedia(query: string) {
    return { matches: false, media: query };
  }

  postMessage(): void {}

  stop(): void {
    stops++;
  }

  /** The page sets off for `href`, a cross-document navigation unless `same`. */
  navigate(href: string, same = false): void {
    const event = Object.assign(new Event("navigate", { cancelable: true }), {
      destination: { url: href, sameDocument: same },
      downloadRequest: null,
    });
    if (this.navigation) this.navigation.dispatchEvent(event);
    else if (!same) this.dispatchEvent(new Event("beforeunload"));
  }

  /** The next page takes over at `href`. Off this origin, nothing of it can be read. */
  commit(href: string, origin: "same" | "other" = "same"): void {
    const blank = this.location.href === "about:blank";
    if (!blank && !this.foreign) this.dispatchEvent(new Event("pagehide"));
    if (!blank) {
      for (const [type, listener] of this.listeners) super.removeEventListener(type, listener);
      this.listeners = [];
      for (const key of Object.getOwnPropertySymbols(this)) Reflect.deleteProperty(this, key);
      Reflect.deleteProperty(this, "ontouchstart");
      this.navigator = {};
      if (this.withNavigation) this.navigation = new EventTarget();
    }
    this.foreign = origin === "other";
    this.location.href = href;
    this.page = fakeDocument(href);
  }
}

let view: FakeView;

/** The frame's window, blank, in the frame that just came up. */
function attach(withNavigation = true): FakeView {
  const frame = frameElement();
  view = new FakeView(withNavigation);
  Object.defineProperty(frame, "contentWindow", { configurable: true, value: view });
  Object.defineProperty(frame, "contentDocument", {
    configurable: true,
    get: () => (view.foreign ? null : view.document),
  });
  return view;
}

/** The frame's page comes in at `href`, runs its scripts a task later, and loads. */
async function load(href: string, origin: "same" | "other" = "same"): Promise<void> {
  if (!Reflect.get(frameElement(), "contentWindow")) attach();
  view.commit(href, origin);
  await Bun.sleep(1);
  frameElement().dispatchEvent(new Event("load"));
}

beforeEach(() => {
  body = new FakeElement("BODY");
  head = new FakeElement("HEAD");
  assigned = [];
  scrolls = [];
  reloads = 0;
  stops = 0;
  location = { href: PAGE, origin: "http://localhost:3000", assign: (url) => assigned.push(url) };
  define("window", {
    location,
    history: { state: null },
    scrollX: 0,
    scrollY: SCROLL_Y,
    devicePixelRatio: 1,
    scrollTo: (options: ScrollToOptions) => scrolls.push(options),
    requestAnimationFrame: () => 0,
    setTimeout: () => 0,
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
    "Element",
    "getComputedStyle",
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

  test("lies on the mat color picked, and takes a new one in place", () => {
    apply(VIEWPORT);
    const letterbox = everything().find(
      (element) => Reflect.get(element, "className") === "viewport",
    );
    const frame = frameElement();
    expect(letterbox?.getAttribute("data-mat")).toBe("blue");
    apply({ ...VIEWPORT, mat: "green" });
    expect(letterbox?.getAttribute("data-mat")).toBe("green");
    expect(frameElement()).toBe(frame);
  });

  test("takes a new mat color at once while a device change runs", () => {
    apply({ ...VIEWPORT, mock: false });
    define("Element", FakeElement);
    define("getComputedStyle", () => ({ backgroundColor: "", colorScheme: "" }));
    Reflect.set(window, "matchMedia", (query: string) => ({ matches: false, media: query }));
    const letterbox = everything().find(
      (element) => Reflect.get(element, "className") === "viewport",
    );
    const back = everything().find((element) => Reflect.get(element, "className") === "back");
    const phone = { ...VIEWPORT, mock: false, device: "iphone-16-pro" } as const;
    apply(phone);
    const opening = back && Reflect.get(back.style, "clipPath");
    expect(opening).toStartWith("path(evenodd");
    apply({ ...phone, mat: "green" });
    expect(letterbox?.getAttribute("data-mat")).toBe("green");
    expect(back && Reflect.get(back.style, "clipPath")).toBe(opening);
  });

  describe("a new mat color splashing out", () => {
    let frames: FrameRequestCallback[];
    let cancelled: number;
    const named = (name: string) =>
      everything().filter((element) => Reflect.get(element, "className") === name);
    /** Run the frames asked for at `now` ms. */
    const tick = (now: number) => {
      for (const frame of frames.splice(0)) frame(now);
    };

    beforeEach(() => {
      apply({ ...VIEWPORT, mock: false });
      define("Element", FakeElement);
      define("getComputedStyle", () => ({ backgroundColor: "", colorScheme: "" }));
      Reflect.set(window, "matchMedia", (query: string) => ({ matches: false, media: query }));
      frames = [];
      cancelled = 0;
      Reflect.set(window, "requestAnimationFrame", (callback: FrameRequestCallback) =>
        frames.push(callback),
      );
      Reflect.set(window, "cancelAnimationFrame", () => cancelled++);
    });

    test("comes over the old color from the screen, behind the device, and leaves nothing once it covers the mat", () => {
      const [letterbox] = named("viewport");
      const [back] = named("back");
      apply({ ...VIEWPORT, mock: false, mat: "green" });
      expect(letterbox?.getAttribute("data-mat")).toBe("green");
      // The mat's paint keeps the old color under the splash.
      expect(back?.getAttribute("data-mat")).toBe("blue");
      const [splash] = named("splash");
      expect(splash?.getAttribute("data-mat")).toBe("green");
      expect(splash && letterbox?.children.indexOf(splash)).toBe(
        back && (letterbox?.children.indexOf(back) ?? 0) + 1,
      );
      // Its own lines, on a grid of its own, so they take its color.
      const grid = splash?.querySelector("pattern")?.getAttribute("id");
      expect(grid).toStartWith("mat-grid-");
      expect(splash?.querySelector("rect")?.getAttribute("fill")).toBe(`url(#${grid})`);
      tick(0);
      tick(200);
      expect(String(splash && Reflect.get(splash.style, "clipPath"))).toStartWith('path("M');
      tick(1200);
      expect(named("splash")).toHaveLength(0);
      expect(back?.hasAttribute("data-mat")).toBe(false);
      expect(frames).toHaveLength(0);
    });

    test("stacks a color picked mid splash over the one on its way, and lands each in turn", () => {
      const [back] = named("back");
      apply({ ...VIEWPORT, mock: false, mat: "green" });
      tick(0);
      tick(300);
      apply({ ...VIEWPORT, mock: false, mat: "magenta" });
      expect(named("splash").map((node) => node.getAttribute("data-mat"))).toEqual([
        "green",
        "magenta",
      ]);
      tick(400);
      tick(1200);
      expect(named("splash").map((node) => node.getAttribute("data-mat"))).toEqual(["magenta"]);
      expect(back?.getAttribute("data-mat")).toBe("green");
      tick(1600);
      expect(named("splash")).toHaveLength(0);
      expect(back?.hasAttribute("data-mat")).toBe(false);
    });

    test("lands at once when a device change starts", () => {
      const [back] = named("back");
      apply({ ...VIEWPORT, mock: false, mat: "green" });
      tick(0);
      apply({ ...VIEWPORT, mock: false, mat: "green", device: "iphone-16-pro" });
      tick(100);
      expect(named("splash")).toHaveLength(0);
      expect(back?.hasAttribute("data-mat")).toBe(false);
      expect(named("viewport")[0]?.getAttribute("data-mat")).toBe("green");
    });

    test("leaves no layer and no frame when the frame goes mid splash", () => {
      apply({ ...VIEWPORT, mock: false, mat: "green" });
      tick(0);
      reset();
      expect(cancelled).toBeGreaterThan(0);
      expect(named("splash")).toHaveLength(0);
      tick(100);
      expect(frames).toHaveLength(0);
    });

    test("is instant with less motion", () => {
      Reflect.set(window, "matchMedia", (query: string) => ({
        matches: query.includes("reduce"),
        media: query,
      }));
      apply({ ...VIEWPORT, mock: false, mat: "green" });
      expect(named("splash")).toHaveLength(0);
      expect(named("viewport")[0]?.getAttribute("data-mat")).toBe("green");
      expect(named("back")[0]?.hasAttribute("data-mat")).toBe(false);
    });
  });

  test("rounds the mat's opening, then moves it a frame at a time onto a fitted screen, and back", async () => {
    apply(KNOBS);
    define("Element", FakeElement);
    define("getComputedStyle", () => ({ backgroundColor: "", colorScheme: "" }));
    Reflect.set(window, "matchMedia", (query: string) => ({ matches: false, media: query }));
    const frames: FrameRequestCallback[] = [];
    Reflect.set(window, "requestAnimationFrame", (callback: FrameRequestCallback) =>
      frames.push(callback),
    );
    Reflect.set(window, "cancelAnimationFrame", () => {});
    const keyframes: Keyframe[][] = [];
    const animate = FakeElement.prototype.animate;
    FakeElement.prototype.animate = (frames: Keyframe[]) => {
      keyframes.push(frames);
      return { finished: Promise.resolve(), currentTime: 0, cancel: () => {} };
    };
    // The drawn browser's loading line asks what moves it as the frame goes.
    Reflect.set(FakeElement.prototype, "getAnimations", () => []);
    // The letterbox sits off the window's corner, and the phone's screen is drawn fitted, at 85%,
    // its corners as round as the Duo's cover screen: the hinge's two far less.
    const box = { left: 10, top: 20, width: 1500, height: 850 };
    const place = fit({ ...PHONE, height: 874 }, box);
    expect(place.transform).toBeLessThan(1);
    const fitted = [8, 58, 58, 8].map((radius) => radius * place.transform);
    const [a = 0, b = 0, c = 0, d = 0] = fitted;
    const screen = { x: 579, y: 69, width: 342, height: 744, radius: [a, b, c, d] as const };
    const whole = windowRect(box);
    const create = document.createElement;
    Reflect.set(document, "createElement", (tag: string) => {
      const element = new FakeElement(tag.toUpperCase());
      Object.assign(element, { clientWidth: box.width, clientHeight: box.height });
      const glass = { ...screen, left: box.left + screen.x, top: box.top + screen.y };
      const isGlass = () => Reflect.get(element, "className") === "glass";
      element.getBoundingClientRect = () => (isGlass() ? glass : box);
      // The screen's corners as a mock rounds them, at the frame's own size.
      Object.defineProperty(element.style, "borderRadius", {
        get: () => (isGlass() ? "8px 58px 58px 8px" : ""),
        set: () => {},
      });
      return element;
    });
    /** Run the frames asked for, 40 ms apart, `rounds` times, and say where the opening was. */
    const play = async (rounds: number) => {
      const seen: string[] = [];
      for (let now = 0; now < rounds * 40; now += 40) {
        await Bun.sleep(0);
        for (const frame of frames.splice(0)) frame(now);
        seen.push(String(Reflect.get(back?.style ?? {}, "clipPath")));
      }
      return seen;
    };
    let back: FakeElement | undefined;
    try {
      apply({ ...KNOBS, mock: false, device: "iphone-16-pro", width: 402, height: 874 });
      back = everything().find((element) => Reflect.get(element, "className") === "back");
      const picked = await play(20);
      const round = rounded(whole);
      expect(picked).toContain(holePath(whole));
      expect(picked).toContain(holePath(holeAt(whole, round, 40, MORPH_TIME.round)));
      expect(picked).toContain(holePath(round));
      expect(picked).toContain(holePath(holeAt(round, screen, 40, MORPH_TIME.mat)));
      expect(picked.at(-1)).toBe(holePath(screen));
      expect(picked.at(-1)).toContain(`A${Math.round(b * 100) / 100} `);
      // A picture of the body that loads late moves the screen as the case comes in, and the opening goes with it.
      const glass = everything().find((element) => Reflect.get(element, "className") === "glass");
      const moved = { ...screen, x: screen.x + 3, y: screen.y - 2 };
      const stood = glass?.getBoundingClientRect;
      if (glass) glass.getBoundingClientRect = () => ({ ...moved, left: box.left + moved.x, top: box.top + moved.y });
      expect((await play(2)).at(-1)).toBe(holePath(moved));
      if (glass && stood) glass.getBoundingClientRect = stood;
      expect((await play(2)).at(-1)).toBe(holePath(screen));
      apply(KNOBS);
      const removed = await play(20);
      expect(removed[0]).toBe(holePath(screen));
      expect(removed).toContain(holePath(holeAt(screen, round, 40, MORPH_TIME.mat)));
      expect(removed).toContain(holePath(round));
      expect(removed.at(-1)).toBe(holePath(whole));
      expect(keyframes.length).toBeGreaterThan(0);
      expect(keyframes.flat().some((frame) => "clipPath" in frame)).toBe(false);
    } finally {
      Reflect.set(document, "createElement", create);
      FakeElement.prototype.animate = animate;
      Reflect.deleteProperty(FakeElement.prototype, "getAnimations");
    }
  });

  test("turns a device in view, case and page as one, and draws it the other way once there", () => {
    apply(KNOBS);
    define("Element", FakeElement);
    define("getComputedStyle", () => ({ backgroundColor: "", colorScheme: "" }));
    // Less movement asked for, so the phone comes up at once.
    let reduce = true;
    Reflect.set(window, "matchMedia", (query: string) => ({ matches: reduce, media: query }));
    const frames: FrameRequestCallback[] = [];
    Reflect.set(window, "requestAnimationFrame", (callback: FrameRequestCallback) =>
      frames.push(callback),
    );
    Reflect.set(window, "cancelAnimationFrame", () => {});
    Reflect.set(FakeElement.prototype, "getAnimations", () => []);
    const phone = { ...KNOBS, mock: false, device: "iphone-16-pro", width: 402, height: 874 } as const;
    try {
      apply(phone);
      frames.splice(0);
      reduce = false;
      const unit = everything().find((element) => Reflect.get(element, "className") === "screen");
      const back = everything().find((element) => Reflect.get(element, "className") === "back");
      const frame = frameElement();
      expect(Reflect.get(frame.style, "width")).toBe("402px");
      apply({ ...phone, orientation: "landscape", width: 874, height: 402 });
      const glass = everything().find((element) => Reflect.get(element, "className") === "glass");
      const cover = glass?.children.at(-1);
      expect(cover?.getAttribute("class") ?? Reflect.get(cover ?? {}, "className")).toBe("screenblank");
      const seen: string[] = [];
      const covers: number[] = [];
      for (let now = 0; now <= MORPH_TIME.turn + 40; now += 40) {
        for (const callback of frames.splice(0)) callback(now);
        seen.push(String(Reflect.get(unit?.style ?? {}, "transform")));
        covers.push(Number(Reflect.get(cover?.style ?? {}, "opacity") || 0));
        expect(Reflect.get(cover?.style ?? {}, "backdropFilter") || "").toBe("");
        if (now < MORPH_TIME.turn) {
          // Held the old way all through the turn, in view, the mat whole behind it.
          expect(Reflect.get(frame.style, "width")).toBe("402px");
          expect(Reflect.get(back?.style ?? {}, "clipPath") || "").toBe("");
        }
      }
      // The page goes dark in the turn's last part, a black cover over it, and is laid out the other way unseen.
      expect(covers[1]).toBe(0);
      expect(covers.at(-1)).toBe(1);
      expect(Reflect.get(cover?.style ?? {}, "background")).toBe("#000");
      for (let now = 0; now <= MORPH_TIME.uncover + 160; now += 40) {
        for (const callback of frames.splice(0)) callback(MORPH_TIME.turn + 80 + now);
      }
      expect(Reflect.get(cover ?? {}, "hidden")).toBe(true);
      expect(Reflect.get(cover?.style ?? {}, "opacity")).toBe("");
      expect(Reflect.get(cover?.style ?? {}, "background")).toBe("");
      expect(seen[1]).toMatch(/rotate\(-\d+(\.\d+)?deg\)/);
      // Once there, it is drawn held across, its own transform no more than its scale.
      expect(Number.parseFloat(Reflect.get(frame.style, "width"))).toBeGreaterThan(700);
      expect(seen.at(-1)).not.toContain("rotate");
    } finally {
      Reflect.deleteProperty(FakeElement.prototype, "getAnimations");
    }
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

  test("puts the page's own address back over the frame's", async () => {
    apply(VIEWPORT);
    await load(FRAMED);
    expect(location.href).toBe(FRAMED);
    reset();
    expect(location.href).toBe(PAGE);
  });

  test("leaves the address alone once the window went back to another entry", async () => {
    apply(VIEWPORT);
    await load(FRAMED);
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

  test("sends the window after the frame instead, when the knobs go off", async () => {
    apply(VIEWPORT);
    await load(FRAMED);
    apply(KNOBS);
    expect(assigned).toEqual([FRAMED]);
    expect(scrolls).toEqual([]);
  });

  test("stays on the entry the window went back to, when the knobs go off", async () => {
    apply(VIEWPORT);
    await load(FRAMED);
    location.href = EARLIER;
    apply(KNOBS);
    expect(assigned).toEqual([]);
    expect(location.href).toBe(EARLIER);
  });
});

describe("the frame in fresh mode", () => {
  const SWITCH = "?devknobs=fresh";
  const FRESH_PAGE = `${PAGE}${SWITCH}`;

  /** Put `devknobs=fresh` in the page's address, and give it a `sessionStorage` to look into. */
  function freshPage(): Map<string, string> {
    const session = new Map<string, string>();
    Object.assign(location, { href: FRESH_PAGE, search: SWITCH });
    Object.assign(window, {
      sessionStorage: {
        length: 0,
        key: () => null,
        getItem: (key: string) => session.get(key) ?? null,
        setItem: (key: string, value: string) => session.set(key, value),
        removeItem: (key: string) => session.delete(key),
      },
    });
    return session;
  }

  /** Let device changes move: frames run when `play` says, and each animation is done at once. */
  function moving(): { play: () => Promise<void>; still: () => void } {
    define("Element", FakeElement);
    define("getComputedStyle", () => ({ backgroundColor: "", colorScheme: "" }));
    Reflect.set(window, "matchMedia", (query: string) => ({ matches: false, media: query }));
    const frames: FrameRequestCallback[] = [];
    Reflect.set(window, "requestAnimationFrame", (callback: FrameRequestCallback) =>
      frames.push(callback),
    );
    Reflect.set(window, "cancelAnimationFrame", () => {});
    const animate = FakeElement.prototype.animate;
    FakeElement.prototype.animate = () => ({
      finished: Promise.resolve(),
      currentTime: 0,
      cancel: () => {},
    });
    Reflect.set(FakeElement.prototype, "getAnimations", () => []);
    return {
      play: async () => {
        for (let now = 0; now < 1600; now += 40) {
          await Bun.sleep(0);
          for (const frame of frames.splice(0)) frame(now);
        }
      },
      still: () => {
        FakeElement.prototype.animate = animate;
        Reflect.deleteProperty(FakeElement.prototype, "getAnimations");
      },
    };
  }

  test("tells the page in the frame the mode", () => {
    freshPage();
    apply(VIEWPORT);
    expect(frameElement().hasAttribute(FRESH_ATTRIBUTE)).toBe(true);
  });

  test("tells it nothing with the mode off", () => {
    apply(VIEWPORT);
    expect(frameElement().hasAttribute(FRESH_ATTRIBUTE)).toBe(false);
  });

  test("marks the load it asks for as the knobs go off", async () => {
    const session = freshPage();
    apply(VIEWPORT);
    await load(FRAMED);
    apply(KNOBS);
    // The page the window goes to is in fresh mode too.
    expect(assigned).toEqual([`${FRAMED}${SWITCH}`]);
    expect(session.has(FRESH_RELOAD_KEY)).toBe(true);
  });

  test("leaves no mark where the frame only moved inside its document", async () => {
    const session = freshPage();
    apply(VIEWPORT);
    await load(`${PAGE}#billing`);
    apply(KNOBS);
    expect(assigned).toEqual([`${FRESH_PAGE}#billing`]);
    expect(session.has(FRESH_RELOAD_KEY)).toBe(false);
  });

  test("stays on its page where the frame only lost the switch", async () => {
    const session = freshPage();
    apply(VIEWPORT);
    await load(PAGE);
    apply(KNOBS);
    expect(assigned).toEqual([]);
    expect(location.href).toBe(FRESH_PAGE);
    expect(session.has(FRESH_RELOAD_KEY)).toBe(false);
  });

  test("keeps the switch in the window's address as it follows the frame", async () => {
    freshPage();
    apply(VIEWPORT);
    await load(FRAMED);
    expect(location.href).toBe(`${FRAMED}${SWITCH}`);
    await load(`${FRAMED}?tab=cards#top`);
    expect(location.href).toBe(`${FRAMED}?tab=cards&devknobs=fresh#top`);
    reset();
    expect(location.href).toBe(FRESH_PAGE);
  });

  test("leaves no mark and adds no switch with the mode off", async () => {
    const session = freshPage();
    Object.assign(location, { href: PAGE, search: "" });
    apply(VIEWPORT);
    await load(FRAMED);
    expect(location.href).toBe(FRAMED);
    apply(KNOBS);
    expect(assigned).toEqual([FRAMED]);
    expect(session.has(FRESH_RELOAD_KEY)).toBe(false);
  });

  test("marks the load a device change ends in, and none inside the document", async () => {
    const phone = { ...KNOBS, mock: false, device: "iphone-16-pro", width: 402, height: 874 } as const;
    for (const [target, landed, marked] of [
      [FRAMED, `${FRAMED}${SWITCH}`, true],
      [`${PAGE}#billing`, `${FRESH_PAGE}#billing`, false],
    ] as const) {
      const session = freshPage();
      apply(KNOBS);
      const motion = moving();
      try {
        apply(phone);
        await motion.play();
        await load(target);
        apply(KNOBS);
        // The device is on its way out, and the window has not left yet.
        expect(assigned).toEqual([]);
        await motion.play();
        expect(assigned).toEqual([landed]);
        expect(session.has(FRESH_RELOAD_KEY)).toBe(marked);
      } finally {
        motion.still();
      }
      reset();
      assigned = [];
      location.href = PAGE;
    }
  });
});

describe("a foldable folding", () => {
  const DUO = { ...KNOBS, device: "iphone-duo", dpr: "system", browser: "off" } as const;
  const SHUT = { ...DUO, posture: "closed", orientation: "portrait", width: 466, height: 678 } as const;
  const OPEN = { ...DUO, posture: "open", orientation: "landscape", width: 951, height: 669 } as const;
  let frames: FrameRequestCallback[] = [];
  let reduce = true;

  beforeEach(() => {
    define("Element", FakeElement);
    define("getComputedStyle", () => ({ backgroundColor: "", colorScheme: "" }));
    reduce = true;
    Reflect.set(window, "matchMedia", (query: string) => ({ matches: reduce, media: query }));
    frames = [];
    Reflect.set(window, "requestAnimationFrame", (callback: FrameRequestCallback) =>
      frames.push(callback),
    );
    Reflect.set(window, "cancelAnimationFrame", () => {});
    Reflect.set(FakeElement.prototype, "getAnimations", () => []);
  });

  afterEach(() => {
    Reflect.deleteProperty(FakeElement.prototype, "getAnimations");
  });

  const byClass = (name: string) =>
    everything().find((element) => String(Reflect.get(element, "className")).split(" ").includes(name));

  /** How the device is drawn: the frame's size, the screen's corners and place, the body. */
  function drawnAs(): string[] {
    const style = (name: string, key: string) => String(Reflect.get(byClass(name)?.style ?? {}, key) ?? "");
    return [
      style("glass", "borderRadius"),
      style("glass", "left"),
      style("glass", "top"),
      style("screen", "left"),
      style("screen", "top"),
      style("screen", "transform"),
      String(Reflect.get(frameElement().style, "width")),
      String(Reflect.get(frameElement().style, "height")),
      byClass("mock")?.getAttribute("viewBox") ?? "",
    ];
  }

  /** Run the frames asked for, 16 ms apart, until none is asked for or `until` ms. */
  function play(until = 2000): void {
    for (let now = 0; now <= until && frames.length > 0; now += 16) {
      for (const callback of frames.splice(0)) callback(now);
    }
  }

  /** How the device is drawn for `value` when it comes up that way. */
  function shown(value: typeof SHUT | typeof OPEN): string[] {
    apply(value);
    const drawn = drawnAs();
    reset();
    return drawn;
  }

  test("folds open in view onto the open screen as it is drawn picked open, and shut onto the folded one", () => {
    const open = shown(OPEN);
    const shut = shown(SHUT);
    expect(open[0]).toBe("55px 55px 55px 55px");
    expect(shut[0]).toBe("8px 59px 59px 8px");
    apply(SHUT);
    expect(drawnAs()).toEqual(shut);
    reduce = false;
    apply(OPEN);
    // Live and shut for the first of the way, a copy of the half that turns fading in over it, then
    // laid out open, the half that stays live under a dim, the copy turning over it.
    const style = (name: string, key: string) => String(Reflect.get(byClass(name)?.style ?? {}, key) ?? "");
    // Each side of the half that turns is its body, the window onto the page its screen is, and the shade over
    // it, then the bend's half on the half that stays.
    const leaves = () => byClass("fold")?.children[0]?.children ?? [];
    expect(Reflect.get(frameElement().style, "width")).toBe("466px");
    expect(leaves()).toHaveLength(7);
    // Its body whole, only its screen faded, so nothing behind the device shows through.
    expect(Reflect.get(leaves()[3]?.style ?? {}, "opacity") || "").toBe("");
    expect(Reflect.get(leaves()[3]?.children[0]?.style ?? {}, "opacity")).toBe("0");
    expect(String(Reflect.get(leaves()[3]?.style ?? {}, "transform"))).toEndWith("rotateY(0deg)");
    // The first frame after the click draws it at rest still, and it moves on the next.
    for (const callback of frames.splice(0)) callback(1000);
    expect(String(Reflect.get(leaves()[3]?.style ?? {}, "transform"))).toEndWith("rotateY(0deg)");
    for (const callback of frames.splice(0)) callback(1016);
    expect(String(Reflect.get(leaves()[3]?.style ?? {}, "transform"))).toMatch(/rotateY\(-\d+(\.\d+)?deg\)/);
    for (let now = 1032; now < 1200; now += 16) {
      for (const callback of frames.splice(0)) callback(now);
    }
    expect(Reflect.get(frameElement().style, "width")).toBe("951px");
    expect(style("screen", "visibility")).toBe("");
    expect(style("screen", "clipPath")).toStartWith("polygon(");
    expect(style("screen", "transform")).toStartWith("translate(");
    expect(style("screen", "filter")).toBe("");
    const cover = byClass("glass")?.children.at(-1);
    expect(Reflect.get(cover ?? {}, "hidden")).toBe(false);
    expect(Reflect.get(cover?.style ?? {}, "background")).toBe("#000");
    expect(Number(Reflect.get(cover?.style ?? {}, "opacity"))).toBeGreaterThan(0);
    expect(Reflect.get(cover?.style ?? {}, "backdropFilter") || "").toBe("");
    expect(style("back", "clipPath")).toBe("");
    play();
    // Nothing left at rest: no layer, clip, transform of its own, dim or filter.
    expect(byClass("fold")).toBeUndefined();
    expect(drawnAs()).toEqual(open);
    expect(style("screen", "clipPath")).toBe("");
    expect(Reflect.get(cover ?? {}, "hidden")).toBe(true);
    expect(Reflect.get(cover?.style ?? {}, "opacity")).toBe("");
    expect(Reflect.get(cover?.style ?? {}, "background")).toBe("");
    // Shutting, it stays laid out open, live, till the last of the way, where the copy hands over.
    apply(SHUT);
    const widths: string[] = [];
    let handing = false;
    for (let now = 0; now <= 2000 && byClass("fold"); now += 16) {
      for (const callback of frames.splice(0)) callback(now);
      widths.push(String(Reflect.get(frameElement().style, "width")));
      const fading = Number(Reflect.get(leaves()[3]?.children[0]?.style ?? {}, "opacity") || 1);
      if (byClass("fold") && widths.at(-1) === "466px" && fading < 1) handing = true;
    }
    expect(widths.slice(0, 20).every((width) => width === "951px")).toBe(true);
    expect(handing).toBe(true);
    // Shut, sharp and lit, a whole fold's time after its first frame, which drew it at rest, to a frame.
    const landed = (widths.length - 1) * 16;
    expect(landed).toBeGreaterThanOrEqual(FOLD_TIME);
    expect(landed).toBeLessThan(FOLD_TIME + 16);
    expect(byClass("fold")).toBeUndefined();
    expect(drawnAs()).toEqual(shut);
  });

  test("never lets the mat show inside the device: whole bodies, each screen's own corners, start to end", () => {
    const open = shown(OPEN);
    const shut = shown(SHUT);
    apply(SHUT);
    reduce = false;
    for (const [to, end] of [
      [OPEN, open],
      [SHUT, shut],
    ] as const) {
      apply(to);
      let seen = 0;
      for (let now = 0; now <= 2000 && byClass("fold"); now += 16) {
        const leaves = byClass("fold")?.children[0]?.children ?? [];
        const [inner, , , outer] = leaves;
        // Neither copy of the half that turns is ever see-through, only its screen fades.
        expect(Reflect.get(inner?.style ?? {}, "opacity") || "").toBe("");
        expect(Reflect.get(outer?.style ?? {}, "opacity") || "").toBe("");
        expect(Reflect.get(inner?.children[0]?.style ?? {}, "borderRadius")).toBe(open[0]);
        expect(Reflect.get(outer?.children[0]?.style ?? {}, "borderRadius")).toBe(shut[0]);
        // The pictures each window shows are rounded as their screen, the window cut with true curves, and
        // the shade over the turned screen rounded as it is, square only at the hinge.
        const [, innerWindow, innerVeil, , outerWindow, outerVeil] = leaves;
        expect(Reflect.get(innerWindow?.children[1]?.style ?? {}, "borderRadius")).toBe(open[0]);
        expect(Reflect.get(outerWindow?.children[1]?.style ?? {}, "borderRadius")).toBe(shut[0]);
        expect(Reflect.get(innerVeil?.children[0]?.style ?? {}, "borderRadius")).toBe("55px 0px 0px 55px");
        expect(Reflect.get(outerVeil?.children[0]?.style ?? {}, "borderRadius")).toBe(shut[0]);
        for (const window of [innerWindow, outerWindow]) {
          const clip = String(Reflect.get(window?.style ?? {}, "clipPath") ?? "");
          if (Reflect.get(window?.style ?? {}, "visibility") !== "hidden") expect(clip).toStartWith('path("M');
        }
        // The device itself is drawn whole and opaque, its screen with its own corners, the mat uncut.
        const glass = String(Reflect.get(byClass("glass")?.style ?? {}, "borderRadius"));
        expect([open[0], shut[0]]).toContain(glass);
        expect(Reflect.get(byClass("screen")?.style ?? {}, "visibility") || "").toBe("");
        expect(Reflect.get(byClass("screen")?.style ?? {}, "opacity") || "").toBe("");
        expect(Reflect.get(byClass("back")?.style ?? {}, "clipPath") || "").toBe("");
        for (const callback of frames.splice(0)) callback(now);
        seen++;
      }
      expect(seen).toBeGreaterThan(20);
      expect(drawnAs()).toEqual(end);
    }
  });

  test("folds back from where it got to, and lands at once for a turn", () => {
    const shut = shown(SHUT);
    apply(SHUT);
    reduce = false;
    apply(OPEN);
    for (let now = 0; now < 250; now += 16) {
      for (const callback of frames.splice(0)) callback(now);
    }
    expect(byClass("fold")).toBeDefined();
    apply(SHUT);
    play();
    expect(byClass("fold")).toBeUndefined();
    expect(drawnAs()).toEqual(shut);
    apply(OPEN);
    for (let now = 0; now < 250; now += 16) {
      for (const callback of frames.splice(0)) callback(now);
    }
    // A turn while it folds lands the fold, and turns from there.
    apply({ ...OPEN, orientation: "portrait", width: 669, height: 951 });
    expect(byClass("fold")).toBeUndefined();
    expect(Reflect.get(byClass("screen")?.style ?? {}, "clipPath")).toBe("");
    expect(Reflect.get(frameElement().style, "width")).toBe("951px");
    play();
    expect(Reflect.get(frameElement().style, "width")).toBe("669px");
  });

  test("turns in either posture", () => {
    apply(OPEN);
    reduce = false;
    apply({ ...OPEN, orientation: "portrait", width: 669, height: 951 });
    expect(byClass("fold")).toBeUndefined();
    play();
    expect(Reflect.get(frameElement().style, "width")).toBe("669px");
    apply({ ...SHUT, orientation: "landscape", width: 678, height: 466 });
    play();
    expect(Reflect.get(frameElement().style, "width")).toBe("678px");
  });

  test("leaves nothing behind when the frame goes mid fold, and swaps at once with less movement", () => {
    apply(SHUT);
    reduce = false;
    apply(OPEN);
    for (let now = 0; now < 250; now += 16) {
      for (const callback of frames.splice(0)) callback(now);
    }
    reset();
    expect(everything().some((element) => Reflect.get(element, "className") === "fold")).toBe(false);
    frames.splice(0);
    reduce = true;
    apply(SHUT);
    apply(OPEN);
    expect(byClass("fold")).toBeUndefined();
    expect(Reflect.get(frameElement().style, "width")).toBe("951px");
  });
});

/** A phone with no ratio and no browser drawn, which the fakes cannot measure or draw. */
const PHONE_KNOBS = { device: "iphone-16-pro", dpr: "system", browser: "off" } as const;

describe("a phone's body", () => {
  /** An image that settles a task after it is asked for, the way `ok` says. */
  function fakeImage(ok: boolean): void {
    class FakeImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        queueMicrotask(() => (ok ? this.onload : this.onerror)?.());
      }
    }
    define("Image", FakeImage);
  }

  function mockDrawing(): FakeElement {
    const drawing = everything().find((element) => element.getAttribute("class") === "mock");
    if (!drawing) throw new Error("no mock");
    return drawing;
  }

  function glass(): FakeElement {
    const found = everything().find((element) =>
      String(Reflect.get(element, "className")).startsWith("glass"),
    );
    if (!found) throw new Error("no glass");
    return found;
  }

  afterEach(() => {
    Reflect.deleteProperty(globalThis, "Image");
  });

  test("is Apple's bezel image once it has loaded, with the frame where it was before", async () => {
    fakeImage(true);
    apply(merge(DEFAULT_STATE, { device: "iphone-18-pro-max", dpr: "system", browser: "off" }));
    // The drawn mock stands in while it loads, the screen already where the image has it.
    expect(mockDrawing().children.map((element) => element.tagName)).toContain("path");
    const left = Reflect.get(glass().style, "left");
    expect(left).toBe(`${(75 - 21) / 3}px`);
    expect(Reflect.get(glass().style, "boxShadow")).toBe("");
    await Bun.sleep(0);
    const [image, ...rest] = mockDrawing().children;
    expect(rest).toEqual([]);
    expect(image?.tagName).toBe("image");
    expect(image?.getAttribute("href")).toEndWith("/bezels/iphone-18-pro-max.webp");
    expect(image?.getAttribute("width")).toBe("490");
    expect(Reflect.get(glass().style, "left")).toBe(left);
    expect(Reflect.get(glass().style, "borderRadius")).toBe("62px 62px 62px 62px");
    expect(Reflect.get(glass().style, "boxShadow")).toBe("0 0 0 2px #000");
  });

  test("is the drawn mock when the image does not load, as with the folder deleted", async () => {
    fakeImage(false);
    apply(merge(DEFAULT_STATE, { device: "iphone-16-plus", dpr: "system", browser: "off" }));
    expect(Reflect.get(glass().style, "left")).toBe(`${(90 - 23) / 3}px`);
    await Bun.sleep(0);
    const tags = mockDrawing().children.map((element) => element.tagName);
    expect(tags).toEqual([...Array(5).fill("rect"), "path", "path", "rect"]);
    expect(Reflect.get(glass().style, "left")).toBe(`${19.7 + 2.7}px`);
    expect(Reflect.get(glass().style, "borderRadius")).toBe("55px 55px 55px 55px");
    expect(Reflect.get(glass().style, "boxShadow")).toBe("");
  });

  test("is the drawn mock for a device without an image, and none with the mock off", () => {
    fakeImage(true);
    apply(merge(DEFAULT_STATE, { device: "iphone-se", browser: "off" }));
    expect(mockDrawing().children.map((element) => element.tagName)).toContain("path");
    apply(merge(DEFAULT_STATE, { device: "iphone-18-pro", browser: "off", mock: false }));
    expect(everything().some((element) => element.getAttribute("class") === "mock")).toBe(false);
  });
});

describe("the touch cursor over the screen", () => {
  const phone = merge(DEFAULT_STATE, { ...PHONE_KNOBS, mock: false });
  let frames: FrameRequestCallback[] = [];
  let reduce = true;

  beforeEach(() => {
    define("Element", FakeElement);
    define("getComputedStyle", () => ({ backgroundColor: "", colorScheme: "", transform: "none" }));
    reduce = true;
    Reflect.set(window, "matchMedia", (query: string) => ({ matches: reduce, media: query }));
    frames = [];
    Reflect.set(window, "requestAnimationFrame", (callback: FrameRequestCallback) =>
      frames.push(callback),
    );
    Reflect.set(window, "cancelAnimationFrame", () => {});
    Reflect.set(FakeElement.prototype, "getAnimations", () => []);
  });

  afterEach(() => {
    Reflect.deleteProperty(FakeElement.prototype, "getAnimations");
  });

  function byClass(name: string): FakeElement {
    const found = everything().find((element) =>
      String(Reflect.get(element, "className")).split(" ").includes(name),
    );
    if (!found) throw new Error(`no ${name}`);
    return found;
  }

  /** Bring the frame up for `state`, its knobs with it. */
  function show(state: typeof phone): void {
    apply(state);
    sync(state);
  }

  /** The frame's copy says where the pointer is on its page. True where the page above takes it. */
  function mark(frame: FakeElement, at: Mark["at"]): boolean {
    const detail: Mark = { at, pressed: false, held: false };
    return !frame.dispatchEvent(new CustomEvent(MARK_EVENT, { detail, cancelable: true }));
  }

  /** Where the cursor is drawn, or null while it is hidden. */
  function dotAt(): string | null {
    const [dot] = byClass("touchdot").children;
    if (!dot || Reflect.get(dot, "hidden")) return null;
    return String(Reflect.get(dot.style, "transform"));
  }

  test("hides the mouse on a phone's screen, its layer as big as the screen and zoomed with it", () => {
    show(merge(phone, { dpr: 3 }));
    const layer = byClass("touchdot");
    expect(byClass("glass").hasAttribute("data-touch")).toBe(true);
    expect(Reflect.get(layer, "hidden")).toBe(false);
    expect(Reflect.get(layer.style, "width")).toBe("402px");
    expect(Reflect.get(layer.style, "height")).toBe("874px");
    expect(Reflect.get(layer.style, "transform")).toBe("scale(3)");
  });

  test("leaves the mouse a mouse with the knob off, and on a device without touch", () => {
    show(phone);
    expect(byClass("glass").hasAttribute("data-touch")).toBe(true);
    sync(merge(phone, { touchPointer: false }));
    expect(byClass("glass").hasAttribute("data-touch")).toBe(false);
    expect(mark(frameElement(), { x: 10, y: 20 })).toBe(false);
    sync(phone);
    expect(byClass("glass").hasAttribute("data-touch")).toBe(true);
    reset();
    show(merge(phone, { device: "desktop" }));
    expect(byClass("glass").hasAttribute("data-touch")).toBe(false);
  });

  test("draws the page's pointer under Safari's bars, where the page starts on the screen", () => {
    show(merge(phone, { browser: "auto" }));
    const page = byClass("placed");
    const left = Number.parseFloat(String(Reflect.get(page.style, "left")));
    const top = Number.parseFloat(String(Reflect.get(page.style, "top")));
    expect(top).toBeGreaterThan(0);
    expect(mark(frameElement(), { x: 10, y: 20 })).toBe(true);
    expect(dotAt()).toBe(`translate(${10 + left}px, ${20 + top}px)`);
    expect(mark(frameElement(), null)).toBe(true);
    expect(dotAt()).toBeNull();
  });

  test("shows no cursor on a screen that turns", () => {
    apply(KNOBS);
    show(phone);
    expect(mark(frameElement(), { x: 10, y: 20 })).toBe(true);
    expect(dotAt()).toBe("translate(10px, 20px)");
    reduce = false;
    apply(merge(phone, { orientation: "landscape", width: 874, height: 402 }));
    expect(dotAt()).toBeNull();
    expect(mark(frameElement(), { x: 10, y: 20 })).toBe(true);
    expect(dotAt()).toBeNull();
  });

  test("shows no cursor on a screen that folds", () => {
    const duo = merge(phone, { device: "iphone-duo", mock: true });
    show(merge(duo, { posture: "closed", width: 466, height: 678 }));
    expect(mark(frameElement(), { x: 10, y: 20 })).toBe(true);
    expect(dotAt()).toBe("translate(10px, 20px)");
    reduce = false;
    apply(merge(duo, { posture: "open", orientation: "landscape", width: 951, height: 669 }));
    expect(byClass("fold")).toBeDefined();
    expect(dotAt()).toBeNull();
    expect(mark(frameElement(), { x: 10, y: 20 })).toBe(true);
    expect(dotAt()).toBeNull();
  });

  test("gives the mouse back with the window's own page, while the frame still fades", async () => {
    show(phone);
    const glass = byClass("glass");
    const frame = frameElement();
    expect(glass.hasAttribute("data-touch")).toBe(true);
    reduce = false;
    const animate = FakeElement.prototype.animate;
    // Each fade is done at once, until the window has its own page back: the veil then stays over it.
    FakeElement.prototype.animate = () => ({
      finished: scrolls.length === 0 ? Promise.resolve() : new Promise(() => {}),
      currentTime: 0,
      cancel: () => {},
    });
    try {
      apply(KNOBS);
      for (let now = 0; now < 4000 && scrolls.length === 0; now += 40) {
        await Bun.sleep(0);
        for (const callback of frames.splice(0)) callback(now);
      }
      // The window has its own page back, and the frame is not gone yet.
      expect(scrolls).toHaveLength(1);
      expect(frameElement()).toBe(frame);
      expect(glass.hasAttribute("data-touch")).toBe(false);
      expect(Reflect.get(byClass("touchdot"), "hidden")).toBe(true);
      expect(mark(frame, { x: 10, y: 20 })).toBe(false);
    } finally {
      FakeElement.prototype.animate = animate;
    }
  });

  test("leaves nothing of the cursor once the frame goes", () => {
    show(phone);
    const glass = byClass("glass");
    const layer = byClass("touchdot");
    const frame = frameElement();
    expect(glass.children).toContain(layer);
    expect(mark(frame, { x: 10, y: 20 })).toBe(true);
    reset();
    expect(glass.hasAttribute("data-touch")).toBe(false);
    expect(glass.children).not.toContain(layer);
    expect(mark(frame, { x: 10, y: 20 })).toBe(false);
  });

  /** An element as far as a copy of it is made, searched by class or tag, and written out. */
  class KeptElement extends FakeElement {
    override cloneNode(): KeptElement {
      const copy = new KeptElement(this.tagName);
      for (const [name, value] of this.attributes) copy.setAttribute(name, value);
      copy.append(...this.children.map((child) => child.cloneNode(true)));
      return copy;
    }

    override querySelectorAll(selector: string): FakeElement[] {
      return [...this.descendants()].filter((node) =>
        selector.startsWith(".")
          ? node.getAttribute("class")?.split(" ").includes(selector.slice(1))
          : node.tagName === selector.toUpperCase(),
      );
    }

    override querySelector(selector: string): FakeElement | null {
      return this.querySelectorAll(selector)[0] ?? null;
    }

    get outerHTML(): string {
      const attributes = [...this.attributes].map(([name, value]) => ` ${name}="${value}"`);
      const inner = this.children.map((child) => String(Reflect.get(child, "outerHTML")));
      return `<${this.tagName}${attributes.join("")}>${inner.join("")}</${this.tagName}>`;
    }
  }

  test("keeps no cursor in the drawing kept for the next page", () => {
    const kept = new Map<string, string>();
    Reflect.set(window, "sessionStorage", {
      setItem: (key: string, value: string) => kept.set(key, value),
      removeItem: (key: string) => kept.delete(key),
    });
    const node = (tag: string, name: string, ...children: KeptElement[]) => {
      const element = new KeptElement(tag);
      if (name) element.setAttribute("class", name);
      element.append(...children);
      return element;
    };
    const glass = node("DIV", "glass", node("IFRAME", ""), node("DIV", "touchdot", node("DIV", "dot")));
    glass.setAttribute("data-touch", "");
    const letterbox = node("DIV", "viewport", glass);
    if (!(letterbox instanceof HTMLElement)) throw new Error("no letterbox");
    const look = {
      background: "rgb(255, 255, 255)",
      dark: false,
      scheme: "light",
      host: "localhost:3000",
      canBack: false,
      canForward: false,
    } as const;
    keepDrawing({ letterbox, zoom: "fit", key: "key", css: "", look });
    const html = String(Reflect.get(JSON.parse(kept.get(SNAPSHOT_KEY) ?? "{}"), "html"));
    expect(html).toBe('<DIV class="viewport"><DIV class="glass"></DIV></DIV>');
    // The live frame keeps its own.
    expect(glass.hasAttribute("data-touch")).toBe(true);
    expect(glass.children).toHaveLength(2);
  });
});

describe("a new identity", () => {
  beforeEach(() => {
    Object.assign(window, { setTimeout });
  });

  const phone = merge(DEFAULT_STATE, PHONE_KNOBS);
  const pixel = merge(phone, { device: "pixel-9", dpr: "system" });

  function framePhone(): void {
    apply(phone);
    sync(phone);
  }

  function pick(state: typeof phone): void {
    apply(state);
    sync(state);
  }

  test("patches the frame's first page before its scripts, and each page after", async () => {
    framePhone();
    await load(FRAMED);
    expect(patchedAs(view)?.agent).toBe("iphone-safari");
    expect("ontouchstart" in view).toBe(true);
    pick(pixel);
    await Bun.sleep(5);
    expect(reloads).toBe(1);
    await load(FRAMED);
    expect(patchedAs(view)?.agent).toBe("android-chrome");
    view.navigate(PAGE);
    await load(PAGE);
    expect(patchedAs(view)?.agent).toBe("android-chrome");
    await Bun.sleep(5);
    expect(reloads).toBe(1);
  });

  test("reloads the frame once the knobs settle, once, and not for a zoom", async () => {
    framePhone();
    await load(FRAMED);
    pick(pixel);
    sync(merge(pixel, { dpr: 2 }));
    await Bun.sleep(5);
    expect(reloads).toBe(1);
    await load(FRAMED);
    sync(merge(pixel, { dpr: 2, zoom: 0.5, orientation: "landscape" }));
    await Bun.sleep(5);
    expect(reloads).toBe(1);
  });

  test("leaves a frame on its first load to finish", async () => {
    framePhone();
    sync(merge(phone, { device: "pixel-9" }));
    await Bun.sleep(5);
    expect(reloads).toBe(0);
  });

  for (const navigation of [true, false]) {
    test(`lets a slow page the frame set off for come in, patched as the knobs are now${navigation ? "" : ", without the navigation api"}`, async () => {
      framePhone();
      attach(navigation);
      await load(FRAMED);
      view.navigate(PAGE);
      pick(pixel);
      await Bun.sleep(5);
      expect(reloads).toBe(0);
      await load(PAGE);
      expect(patchedAs(view)?.agent).toBe("android-chrome");
      await Bun.sleep(5);
      expect(reloads).toBe(0);
    });
  }

  test("reloads for the knobs once the page stays after all", async () => {
    framePhone();
    await load(FRAMED);
    view.navigate(PAGE);
    pick(pixel);
    await Bun.sleep(5);
    expect(reloads).toBe(0);
    view.navigation?.dispatchEvent(new Event("navigateerror"));
    await Bun.sleep(5);
    expect(reloads).toBe(1);
  });

  test("reloads for the knobs while the page only moves in its own document", async () => {
    framePhone();
    await load(FRAMED);
    view.navigate(PAGE, true);
    pick(pixel);
    await Bun.sleep(5);
    expect(reloads).toBe(1);
  });

  test("reloads a page that came in from another origin unpatched, once", async () => {
    framePhone();
    await load(FRAMED);
    await load("http://127.0.0.1:3000/redirect", "other");
    await load(PAGE);
    expect(patchedAs(view)).toBeUndefined();
    await Bun.sleep(5);
    expect(reloads).toBe(1);
    await load(PAGE);
    expect(patchedAs(view)?.agent).toBe("iphone-safari");
    await Bun.sleep(5);
    expect(reloads).toBe(1);
  });

  test("leaves a page unpatched after its reload as it is", async () => {
    framePhone();
    await load(FRAMED);
    await load("http://127.0.0.1:3000/redirect", "other");
    await load(PAGE);
    await Bun.sleep(5);
    expect(reloads).toBe(1);
    await load("http://127.0.0.1:3000/redirect", "other");
    await load(PAGE);
    await Bun.sleep(5);
    expect(reloads).toBe(1);
  });
});

describe("the drawn browser's reload button", () => {
  /** The frames asked for, by id, which `frames` runs. */
  let queued: Map<number, () => void>;
  let ids: number;

  beforeEach(() => {
    queued = new Map();
    ids = 0;
    define("Element", FakeElement);
    define("getComputedStyle", () => ({ backgroundColor: "", colorScheme: "", transform: "none" }));
    Object.assign(window, {
      // Reduced motion, so the bars draw with no animation the fakes cannot run.
      matchMedia: (query: string) => ({ matches: query.includes("reduce"), media: query }),
      requestAnimationFrame: (callback: () => void) => {
        queued.set(++ids, callback);
        return ids;
      },
      cancelAnimationFrame: (id: number) => queued.delete(id),
    });
  });

  /** Run `count` frames, each with what was asked for before it. */
  function frames(count: number): void {
    for (let i = 0; i < count; i++) {
      const due = [...queued.values()];
      queued.clear();
      for (const callback of due) callback();
    }
  }

  /** The page in the frame has loaded all of itself. */
  function complete(): void {
    Reflect.set(view.document, "readyState", "complete");
  }

  function blank(): FakeElement {
    const found = everything().find((element) => Reflect.get(element, "className") === "screenblank");
    if (!found) throw new Error("no blank screen");
    return found;
  }

  /**
   * The one glyph that does anything on a fresh page: reload, or stop while it
   * loads. The fakes have no `isConnected`, so the bars' layer is in twice.
   */
  function reloadGlyph(): FakeElement {
    const pressable = new Set(everything().filter((element) => element.classList.contains("press")));
    const [glyph, ...rest] = pressable;
    if (!glyph || rest.length > 0) throw new Error("no reload glyph");
    return glyph;
  }

  async function framePhone(): Promise<void> {
    apply(merge(DEFAULT_STATE, { device: "iphone-16-pro", dpr: "system" }));
    await load(FRAMED);
    complete();
    frames(2);
    expect(Reflect.get(blank(), "hidden")).toBe(true);
  }

  test("keeps the screen blank until the reloaded page takes the old one's place", async () => {
    await framePhone();
    reloadGlyph().dispatchEvent(new Event("click"));
    expect(reloads).toBe(1);
    expect(Reflect.get(blank(), "hidden")).toBe(false);
    // The old page is still there, loaded, while the new one is on its way.
    frames(3);
    expect(Reflect.get(blank(), "hidden")).toBe(false);
    view.commit(FRAMED);
    complete();
    frames(1);
    expect(Reflect.get(blank(), "hidden")).toBe(true);
  });

  test("is Safari's stop while the page loads, which shows the page as far as it got", async () => {
    await framePhone();
    const glyph = reloadGlyph();
    const drawn = glyph.children.length;
    glyph.dispatchEvent(new Event("click"));
    expect(glyph.children.length).not.toBe(drawn);
    glyph.dispatchEvent(new Event("click"));
    expect(reloads).toBe(1);
    expect(stops).toBe(1);
    expect(Reflect.get(blank(), "hidden")).toBe(true);
    expect(glyph.children.length).toBe(drawn);
    glyph.dispatchEvent(new Event("click"));
    expect(reloads).toBe(2);
  });
});
