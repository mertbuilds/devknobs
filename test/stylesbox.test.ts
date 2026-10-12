import { afterEach, beforeEach, describe, expect, jest, test } from "bun:test";
import { DEFAULT_STATE } from "../src/engine/store";
import type { BoxRing } from "../src/grab/boxmodel";
import type { Inspection, StyleBlock } from "../src/styles/types";
import type { DevknobsState } from "../src/types";
import type { BoxReading } from "../src/ui/boxdiagram";
import { createPrefs, PREFS_KEY, type StylesMode } from "../src/ui/prefs";
import { createStylesView, SETTLE, type StylesPage, type StylesView } from "../src/ui/stylesview";
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

/** Every size observer made, what each watches, and the way to say a size changed. */
class FakeSizes {
  static made: FakeSizes[] = [];
  watched: unknown[] = [];
  connected = true;

  constructor(readonly callback: (entries: { contentRect: { width: number } }[]) => void) {
    FakeSizes.made.push(this);
  }

  observe(node: unknown): void {
    this.watched.push(node);
  }

  disconnect(): void {
    this.connected = false;
    this.watched = [];
  }

  change(width = 0): void {
    if (this.connected) this.callback([{ contentRect: { width } }]);
  }
}

function reading(top: number, width = 120): BoxReading {
  return {
    model: {
      margin: { top, right: 16, bottom: 8, left: 16 },
      border: { top: 1, right: 1, bottom: 1, left: 1 },
      padding: { top: 6, right: 12, bottom: 6, left: 12 },
      offsets: null,
      boxSizing: "border-box",
      display: "inline-flex",
      position: "static",
    },
    width,
    height: 32,
  };
}

const blocks: StyleBlock[] = [
  {
    kind: "rule",
    id: 0,
    selectorText: ".primary",
    selector: [{ text: ".primary", matches: true }],
    specificity: [0, 1, 0],
    origin: { sheet: "https://example.com/app.css", owner: "link", path: [0] },
    context: [],
    declarations: [
      { name: "color", value: "red", important: false, longhands: ["color"], overridden: false, variables: [] },
    ],
    rule: {} as CSSStyleRule,
  },
  { kind: "pseudo", pseudo: "::before", blocks: [] },
];

let doc: FakeDocument;
let app: FakeElement;
let save: FakeElement;
/** The elements whose box was read, in order, and what the next read answers. */
let boxed: Element[];
let box: (element: Element) => BoxReading | null;
let inspected: number;
let areas: (BoxRing | null)[];
/** What the view boxed on the page, in order. */
let outlined: (Element | null)[];
let knobs: ((state: DevknobsState) => void)[];
let view: StylesView | null = null;

const page: StylesPage = {
  inspect: (): Inspection => {
    inspected++;
    return {
      target: { label: "button#save.primary", pseudo: null },
      blocks,
      hidden: [],
      variables: {},
      skipped: 0,
    };
  },
  invalidate: () => undefined,
  getState: () => DEFAULT_STATE,
  subscribe: (listener) => {
    knobs.push(listener);
    return () => undefined;
  },
  isColor: () => false,
  box: (target) => {
    boxed.push(target);
    return box(target);
  },
};

const tips: Tips = {
  show: () => undefined,
  hide: () => false,
  hideAfter: () => undefined,
  isFor: () => false,
  tooltip: () => undefined,
  destroy: () => undefined,
};

interface Doors {
  mode?: { get(): StylesMode; set(mode: StylesMode): void };
  box?: { get(): boolean; set(open: boolean): void };
}

function start(doors: Doors = {}): FakeNode {
  view = createStylesView(
    {
      tips,
      title: () => undefined,
      outline: (target) => outlined.push(target),
      area: (ring) => areas.push(ring),
      ...doors,
    },
    page,
  );
  const paneBody = new FakeNode("div");
  paneBody.append(fake(view.node));
  return fake(view.node);
}

/** The fold of the box: the row the kit builds, which is the one with the diagram in it. */
function fold(node: FakeNode): FakeNode {
  const found = node.find("row").find((row) => row.find("box-model").length > 0);
  if (!found) throw new Error("no fold for the box");
  return found;
}

function main(node: FakeNode): FakeNode {
  const [found] = fold(node).find("main");
  if (!found) throw new Error("no row to press");
  return found;
}

function margin(node: FakeNode): string {
  return node.find("bm-margin")[0]?.find("bm-top")[0]?.textContent ?? "";
}

/** The size observer that watches a node. */
function sizesOf(node: unknown): FakeSizes | undefined {
  return FakeSizes.made.find((one) => one.watched.includes(node));
}

beforeEach(() => {
  jest.useFakeTimers();
  doc = pageDocument();
  const html = element(doc, "html");
  const body = element(doc, "body", {}, html);
  app = element(doc, "div", { id: "app" }, body);
  save = element(doc, "button", { id: "save", class: "primary" }, app);
  boxed = [];
  inspected = 0;
  areas = [];
  outlined = [];
  knobs = [];
  box = () => reading(8);
  FakeObserver.made = [];
  FakeSizes.made = [];
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
  Object.defineProperty(globalThis, "ResizeObserver", { configurable: true, value: FakeSizes });
});

afterEach(() => {
  view?.destroy();
  view = null;
  jest.useRealTimers();
  for (const name of ["window", "document", "MutationObserver", "ResizeObserver"]) {
    Reflect.deleteProperty(globalThis, name);
  }
});

describe("the box in the styles view", () => {
  test("is a fold from the kit labelled box, under the bar and above the styles", () => {
    const node = start();
    view?.show(as(save));
    const row = fold(node);
    expect(row.className).toBe("row open");
    expect(row.find("row-label")[0]?.textContent).toBe("box");
    expect(row.find("turn")).toHaveLength(1);
    expect(row.find("fold-body")[0]?.children).toEqual([node.find("box-model")[0] as FakeNode]);
    expect(main(node).tag).toBe("button");
    const order = node.children.map((child) => (typeof child === "string" ? child : child.className));
    expect(order).toEqual(["crumbs", "toolbar", "row open", "css-blocks", "empty"]);
  });

  test("shows the element's box in both modes, and a change of mode reads nothing again", () => {
    const picked: StylesMode[] = [];
    const node = start({ mode: { get: () => "simple", set: (next) => picked.push(next) } });
    view?.show(as(save));
    expect(node.shown("box-model")).toHaveLength(1);
    expect(margin(node)).toBe("8");
    expect(node.find("css-applied").length).toBeGreaterThan(0);
    const reads = boxed.length;
    node.find("seg-item")[1]?.fire("click");
    expect(picked).toEqual(["advanced"]);
    expect(node.find("css-applied")).toEqual([]);
    expect(node.shown("box-model")).toHaveLength(1);
    expect(margin(node)).toBe("8");
    expect(boxed).toHaveLength(reads);
  });

  test("the simple mode has none of the hover card's rows", () => {
    const node = start({ mode: { get: () => "simple", set: () => undefined } });
    view?.show(as(save));
    expect(node.find("info")).toEqual([]);
    expect(node.textContent).not.toContain("contrast");
  });

  test("is not there before a pick, for an element with no box to read, or for a pseudo-element", () => {
    const node = start();
    expect(fold(node).hidden).toBe(true);
    view?.show(as(save));
    expect(fold(node).hidden).toBe(false);
    view?.show(as(save), "::before");
    expect(fold(node).hidden).toBe(true);
    view?.show(as(save));
    box = () => null;
    view?.refresh();
    expect(fold(node).hidden).toBe(true);
    view?.show(null);
    expect(fold(node).hidden).toBe(true);
  });

  test("the pointer on an area draws that one alone on the page, and leaving draws all four", () => {
    const node = start();
    view?.show(as(save));
    node.find("bm-padding")[0]?.fire("pointerenter");
    node.find("bm-padding")[0]?.fire("pointerleave");
    node.find("bm-border")[0]?.fire("pointerleave");
    node.find("bm-margin")[0]?.fire("pointerleave");
    node.find("bm-position")[0]?.fire("pointerleave");
    expect(areas).toEqual(["padding", "border", "margin", null, null]);
  });

  test("the diagram boxes its element on the page while the pointer is on it, and only then", () => {
    const node = start();
    view?.show(as(save));
    expect(outlined).toEqual([]);
    const [diagram] = node.find("box-model");
    diagram?.fire("pointerenter");
    expect(outlined).toEqual([as(save)]);
    node.find("bm-padding")[0]?.fire("pointerenter");
    node.find("bm-padding")[0]?.fire("pointerleave");
    expect(outlined).toEqual([as(save)]);
    diagram?.fire("pointerleave");
    expect(outlined).toEqual([as(save), null]);
  });

  test("the view going puts all four areas back", () => {
    start();
    view?.show(as(save));
    view?.destroy();
    view = null;
    expect(areas).toEqual([null]);
  });
});

describe("the box keeping up", () => {
  test("is read again with the styles: after a change to the element, a resize and a knob", () => {
    const node = start();
    view?.show(as(save));
    expect(boxed).toEqual([as(save)]);
    box = () => reading(24);
    FakeObserver.made[FakeObserver.made.length - 1]?.change(save);
    jest.advanceTimersByTime(SETTLE);
    expect(margin(node)).toBe("24");
    box = () => reading(32);
    doc.defaultView?.dispatchEvent(new Event("resize"));
    jest.advanceTimersByTime(SETTLE);
    expect(margin(node)).toBe("32");
    box = () => reading(40);
    for (const knob of knobs) knob({ ...DEFAULT_STATE, scheme: "dark" });
    jest.advanceTimersByTime(SETTLE);
    expect(margin(node)).toBe("40");
  });

  test("the element's size is watched while it shows, and a new size reads the box alone, not the styles", () => {
    const node = start();
    view?.show(as(save));
    const sizes = sizesOf(save);
    expect(sizes?.watched).toEqual([save]);
    const reads = inspected;
    box = () => reading(12, 300);
    sizes?.change();
    expect(margin(node)).toBe("12");
    expect(node.find("bm-content")[0]?.textContent).toBe("300 × 32");
    expect(inspected).toBe(reads);
  });

  test("stops watching one element's size when another shows, and every one when the view goes", () => {
    start();
    view?.show(as(save));
    const first = sizesOf(save);
    view?.show(as(app));
    expect(first?.connected).toBe(false);
    const second = sizesOf(app);
    expect(second?.connected).toBe(true);
    view?.show(null);
    expect(second?.connected).toBe(false);
    view?.show(as(save));
    const third = sizesOf(save);
    view?.destroy();
    view = null;
    expect(third?.connected).toBe(false);
    expect(FakeSizes.made.every((one) => !one.connected)).toBe(true);
  });

  test("the diagram's own width tells it whether its lengths fit", () => {
    const node = start();
    view?.show(as(save));
    const [diagram] = node.find("box-model");
    const fitter = sizesOf(diagram);
    fitter?.change(222);
    expect(diagram?.classList.contains("narrow")).toBe(true);
    fitter?.change(700);
    expect(diagram?.classList.contains("narrow")).toBe(false);
  });

  test("with no ResizeObserver in the browser the box still shows", () => {
    Reflect.deleteProperty(globalThis, "ResizeObserver");
    const node = start();
    view?.show(as(save));
    expect(margin(node)).toBe("8");
  });
});

describe("the fold of the box in the preferences", () => {
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

  function doors(prefs: ReturnType<typeof createPrefs>): Doors {
    return {
      mode: { get: () => prefs.get().stylesMode, set: prefs.setStylesMode },
      box: { get: () => prefs.get().stylesBox, set: prefs.setStylesBox },
    };
  }

  test("is out on a first visit, and folded away it is that way for the next view", () => {
    const local = stubStorage();
    const prefs = createPrefs();
    const node = start(doors(prefs));
    view?.show(as(save));
    expect(fold(node).className).toBe("row open");
    main(node).fire("click");
    expect(fold(node).className).toBe("row");
    expect(JSON.parse(local.get(PREFS_KEY) ?? "")).toEqual({ v: 4, stylesBox: false });
    view?.destroy();
    prefs.destroy();
    const next = createPrefs();
    const again = start(doors(next));
    view?.show(as(save));
    expect(fold(again).className).toBe("row");
    // Folded out again is the way it starts, so nothing is left to keep.
    main(again).fire("click");
    expect(local.has(PREFS_KEY)).toBe(false);
    next.destroy();
  });

  test("is kept with the mode, each beside the other", () => {
    const local = stubStorage();
    const prefs = createPrefs();
    const node = start(doors(prefs));
    view?.show(as(save));
    main(node).fire("click");
    node.find("seg-item")[1]?.fire("click");
    expect(JSON.parse(local.get(PREFS_KEY) ?? "")).toEqual({
      v: 4,
      stylesBox: false,
      stylesMode: "advanced",
    });
    prefs.destroy();
  });

  test("preferences kept before the box had a word are read as they were, the box out", () => {
    const local = stubStorage();
    local.set(PREFS_KEY, JSON.stringify({ v: 3, stylesMode: "advanced", viewWidth: 500 }));
    const prefs = createPrefs();
    expect(prefs.get()).toEqual({
      handle: true,
      listWidth: 240,
      viewWidth: 500,
      stylesMode: "advanced",
      stylesBox: true,
    });
    const node = start(doors(prefs));
    view?.show(as(save));
    expect(fold(node).className).toBe("row open");
    prefs.destroy();
  });

  test("something that is no yes or no is not read as one", () => {
    const local = stubStorage();
    local.set(PREFS_KEY, JSON.stringify({ v: 4, stylesBox: "closed" }));
    const prefs = createPrefs();
    expect(prefs.get().stylesBox).toBe(true);
    prefs.destroy();
  });

  test("in fresh mode is out whatever is kept, and folding it away is not written", () => {
    const local = stubStorage("?devknobs=fresh");
    const was = JSON.stringify({ v: 4, stylesBox: false });
    local.set(PREFS_KEY, was);
    const prefs = createPrefs();
    const node = start(doors(prefs));
    view?.show(as(save));
    expect(fold(node).className).toBe("row open");
    main(node).fire("click");
    expect(fold(node).className).toBe("row");
    expect(prefs.get().stylesBox).toBe(false);
    expect(local.get(PREFS_KEY)).toBe(was);
    prefs.destroy();
    const empty = stubStorage("?devknobs=fresh");
    const first = createPrefs();
    first.setStylesBox(false);
    expect(empty.size).toBe(0);
    first.destroy();
  });

  test("with nowhere to keep it, the box starts out", () => {
    const node = start();
    view?.show(as(save));
    expect(fold(node).className).toBe("row open");
    main(node).fire("click");
    expect(fold(node).className).toBe("row");
  });
});
