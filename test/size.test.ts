import { afterEach, describe, expect, test } from "bun:test";
import type { LivePrefs, Prefs } from "../src/ui/prefs";
import {
  createSizer,
  dragWidth,
  HANDLE_REACH,
  keyWidth,
  LIST_MIN,
  LIST_WIDTH,
  PAGE_ROOM,
  type Showing,
  type Sizer,
  VIEW_MIN,
  VIEW_WIDTH,
  WIDTH_MAX,
  WIDTH_STEP,
  widthGlides,
  widthIn,
  widthLimits,
} from "../src/ui/size";
import type { SideValue } from "../src/types";

describe("the panel's two widths", () => {
  test("are 240 for the rows and the settings, and 340 for a view", () => {
    expect(LIST_WIDTH).toBe(240);
    expect(VIEW_WIDTH).toBe(340);
  });

  test("go down to 240 and 280, and up to 720 or what leaves the page 96", () => {
    expect(widthLimits("list", 1440)).toEqual({ min: 240, max: 720 });
    expect(widthLimits("view", 1440)).toEqual({ min: 280, max: 720 });
    expect(widthLimits("view", 700)).toEqual({ min: 280, max: 604 });
    expect(widthLimits("list", 816)).toEqual({ min: 240, max: 720 });
    expect(widthLimits("list", 815)).toEqual({ min: 240, max: 719 });
    expect([LIST_MIN, VIEW_MIN, WIDTH_MAX, PAGE_ROOM]).toEqual([240, 280, 720, 96]);
  });

  test("in a window with no room to spare, only the least", () => {
    expect(widthLimits("list", 300)).toEqual({ min: 240, max: 240 });
    expect(widthLimits("view", 320)).toEqual({ min: 280, max: 280 });
  });
});

describe("widthIn", () => {
  test("keeps a width between the limits", () => {
    expect(widthIn("list", 240, 1440)).toBe(240);
    expect(widthIn("view", 340, 1440)).toBe(340);
    expect(widthIn("view", 500, 1440)).toBe(500);
    expect(widthIn("list", 100, 1440)).toBe(240);
    expect(widthIn("view", 100, 1440)).toBe(280);
    expect(widthIn("view", 5000, 1440)).toBe(720);
    expect(widthIn("list", 5000, 1440)).toBe(720);
  });

  test("is whole px", () => {
    expect(widthIn("view", 412.6, 1440)).toBe(413);
  });

  test("in a narrow window, shows one kept wider at what leaves the page its room", () => {
    expect(widthIn("view", 600, 700)).toBe(600);
    expect(widthIn("view", 700, 700)).toBe(604);
    expect(widthIn("list", 600, 500)).toBe(404);
  });

  test("a view never leaves the window, handle and gap included, down to the rows' own width", () => {
    for (let view = 0; view <= 1600; view += 7) {
      const width = widthIn("view", VIEW_WIDTH, view);
      expect(width).toBeGreaterThanOrEqual(LIST_MIN);
      expect(width).toBeLessThanOrEqual(WIDTH_MAX);
      // 269 is the narrowest window the panel at its least and its handle fit, with the gap.
      if (view >= LIST_MIN + HANDLE_REACH + 8) {
        expect(width + HANDLE_REACH).toBeLessThanOrEqual(view - 8);
      }
    }
    expect(widthIn("view", 340, 300)).toBe(300 - 21 - 8);
    expect(widthIn("view", 340, 260)).toBe(240);
  });

  test("the rows are 240 in any window, as they always were", () => {
    for (const view of [0, 200, 261, 300, 336]) expect(widthIn("list", 240, view)).toBe(240);
  });
});

describe("dragWidth", () => {
  test("on the right, the strip is the left edge: a drag to the left is wider", () => {
    expect(dragWidth(340, -60, "right")).toBe(400);
    expect(dragWidth(340, 60, "right")).toBe(280);
  });

  test("on the left, the strip is the right edge: a drag to the right is wider", () => {
    expect(dragWidth(340, 60, "left")).toBe(400);
    expect(dragWidth(340, -60, "left")).toBe(280);
  });
});

describe("keyWidth", () => {
  const limits = { min: 280, max: 720 };

  test("an arrow moves the strip 16 the way it points", () => {
    expect(WIDTH_STEP).toBe(16);
    expect(keyWidth("ArrowLeft", 340, limits, "right")).toBe(356);
    expect(keyWidth("ArrowRight", 340, limits, "right")).toBe(324);
    expect(keyWidth("ArrowRight", 340, limits, "left")).toBe(356);
    expect(keyWidth("ArrowLeft", 340, limits, "left")).toBe(324);
  });

  test("stops at the limits", () => {
    expect(keyWidth("ArrowRight", 284, limits, "right")).toBe(280);
    expect(keyWidth("ArrowLeft", 716, limits, "right")).toBe(720);
  });

  test("Home is the least and End the most", () => {
    expect(keyWidth("Home", 340, limits, "right")).toBe(280);
    expect(keyWidth("End", 340, limits, "left")).toBe(720);
  });

  test("leaves every other key alone", () => {
    for (const key of ["ArrowUp", "ArrowDown", "Enter", " ", "a", "Escape", "Tab"]) {
      expect(keyWidth(key, 340, limits, "right")).toBeNull();
    }
  });
});

describe("widthGlides", () => {
  const cue = { first: false, dragging: false, resizing: false };

  test("glides to a new width, as a view comes or goes", () => {
    expect(widthGlides(cue)).toBe(true);
  });

  test("not to the first one, under the strip, or as the window resizes", () => {
    expect(widthGlides({ ...cue, first: true })).toBe(false);
    expect(widthGlides({ ...cue, dragging: true })).toBe(false);
    expect(widthGlides({ ...cue, resizing: true })).toBe(false);
  });
});

type Listener = (event: Record<string, unknown>) => void;

/** An element, as far as the strip builds and drives one. */
class FakeNode {
  className = "";
  tabIndex = -1;
  dataset: Record<string, string> = {};
  attributes = new Map<string, string>();
  listeners = new Map<string, Listener>();
  captured: number | null = null;
  style = {
    width: "",
    transitionProperty: "",
    setProperty: (_name: string, _value: string): void => {},
  };

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  addEventListener(type: string, listener: Listener): void {
    this.listeners.set(type, listener);
  }

  setPointerCapture(pointer: number): void {
    this.captured = pointer;
  }

  hasPointerCapture(pointer: number): boolean {
    return this.captured === pointer;
  }

  releasePointerCapture(): void {
    this.captured = null;
  }

  getBoundingClientRect(): object {
    return {};
  }

  /** Fire an event, and say whether its default was prevented. */
  fire(type: string, event: Record<string, unknown> = {}): boolean {
    let prevented = false;
    this.listeners.get(type)?.({
      button: 0,
      pointerId: 1,
      preventDefault: () => {
        prevented = true;
      },
      ...event,
    });
    return prevented;
  }
}

function fake(node: unknown): FakeNode {
  if (!(node instanceof FakeNode)) throw new Error("not a fake node");
  return node;
}

/** The panel the strip is built for, and what the strip did to it. */
interface Rig {
  sizer: Sizer;
  strip: FakeNode;
  host: FakeNode;
  /** What `--panel-width` was set to, in order, marked still where the panel's transitions were off. */
  widths: string[];
  /** The width the panel shows, as the stylesheet has it. */
  width(): string | undefined;
  /** What the frame was told, with how wide the host was by then. */
  sized: { glide: boolean; host: string }[];
  /** What the preferences were asked to keep. */
  kept: [Showing, number][];
  state: { showing: Showing; open: boolean; side: SideValue; view: number };
  prefs: Prefs;
  dataset: Record<string, string>;
}

function rig(start: Partial<Rig["state"]> = {}, stored: Partial<Prefs> = {}): Rig {
  const state: Rig["state"] = { showing: "list", open: true, side: "right", view: 1440, ...start };
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      createElement: (): FakeNode => new FakeNode(),
      documentElement: {
        get clientWidth() {
          return state.view;
        },
      },
    },
  });
  const host = document.createElement("div");
  const wrap = document.createElement("div");
  const panel = document.createElement("div");
  const widths: string[] = [];
  fake(wrap).style.setProperty = (name, value) => {
    if (name !== "--panel-width") return;
    widths.push(panel.style.transitionProperty === "none" ? `${value} still` : value);
  };
  const prefs: Prefs = {
    handle: true,
    listWidth: 240,
    viewWidth: 340,
    stylesMode: "simple",
    ...stored,
  };
  const kept: [Showing, number][] = [];
  const sized: Rig["sized"] = [];
  const live: LivePrefs = {
    get: () => prefs,
    setHandle: () => {},
    setStylesMode: () => {},
    setWidth: (showing, px) => {
      kept.push([showing, px]);
      if (showing === "view") prefs.viewWidth = px;
      else prefs.listWidth = px;
      // The panel draws again as the preferences change.
      sizer.size();
    },
    subscribe: () => () => {},
    destroy: () => {},
  };
  const sizer = createSizer({
    host,
    wrap,
    panel,
    prefs: live,
    showing: () => state.showing,
    place: () => ({ open: state.open, side: state.side }),
    sized: (glide) => sized.push({ glide, host: host.style.width }),
  });
  sizer.size();
  return {
    sizer,
    strip: fake(sizer.strip),
    host: fake(host),
    widths,
    width: () => widths.at(-1),
    sized,
    kept,
    state,
    prefs,
    dataset: fake(wrap).dataset,
  };
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, "document");
});

describe("the width the panel takes", () => {
  test("is the rows' at first, set with no glide and no word to the frame", () => {
    const { widths, host, sized } = rig();
    expect(widths).toEqual(["240px still", "240px"]);
    expect(host.style.width).toBe(`${240 + HANDLE_REACH}px`);
    expect(sized).toEqual([]);
  });

  test("is the view's while a view shows, and the rows' again after", () => {
    const { sizer, state, width, host } = rig();
    state.showing = "view";
    sizer.size();
    expect(width()).toBe("340px");
    expect(host.style.width).toBe("361px");
    state.showing = "list";
    sizer.size();
    expect(width()).toBe("240px");
    expect(host.style.width).toBe("261px");
  });

  test("glides there: drawn at the new width, put back at the old, and let go", () => {
    const { sizer, state, widths } = rig();
    widths.length = 0;
    const drawnAt: (string | undefined)[] = [];
    state.showing = "view";
    sizer.size(() => drawnAt.push(widths.at(-1)));
    expect(drawnAt).toEqual(["340px still"]);
    expect(widths).toEqual(["340px still", "240px still", "340px"]);
  });

  test("tells the frame once, at the start, when the host is already as wide as the panel ends", () => {
    const { sizer, state, sized } = rig();
    state.showing = "view";
    sizer.size();
    expect(sized).toEqual([{ glide: true, host: "361px" }]);
    sizer.size();
    sizer.size();
    expect(sized).toHaveLength(1);
  });

  test("draws even where the width stays", () => {
    const { sizer } = rig();
    let drawn = 0;
    sizer.size(() => drawn++);
    expect(drawn).toBe(1);
  });

  test("is what the preferences keep, each for what it shows", () => {
    const { sizer, state, width } = rig({}, { listWidth: 300, viewWidth: 520 });
    expect(width()).toBe("300px");
    state.showing = "view";
    sizer.size();
    expect(width()).toBe("520px");
  });

  test("a closed panel keeps its width until it opens, as its handle would jump with it", () => {
    const { sizer, state, width, sized } = rig({ open: false });
    expect(width()).toBe("240px");
    state.showing = "view";
    let drawn = 0;
    sizer.size(() => drawn++);
    expect(width()).toBe("240px");
    expect(drawn).toBe(1);
    expect(sized).toEqual([]);
    state.open = true;
    sizer.size();
    expect(width()).toBe("340px");
    expect(sized).toEqual([{ glide: true, host: "361px" }]);
  });
});

describe("a narrow window", () => {
  test("shows a width kept wider at what fits, and leaves what is kept alone", () => {
    const { width, kept, prefs, host } = rig({ showing: "view", view: 700 }, { viewWidth: 680 });
    expect(width()).toBe("604px");
    expect(host.style.width).toBe("625px");
    expect(kept).toEqual([]);
    expect(prefs.viewWidth).toBe(680);
  });

  test("gives the width back as the window grows, at once and with no glide", () => {
    const { sizer, state, widths, sized, kept } = rig(
      { showing: "view", view: 700 },
      { viewWidth: 680 },
    );
    widths.length = 0;
    state.view = 1440;
    sizer.fit();
    expect(widths).toEqual(["680px still", "680px"]);
    expect(sized).toEqual([{ glide: false, host: "701px" }]);
    state.view = 500;
    sizer.fit();
    expect(widths.at(-1)).toBe("404px");
    expect(kept).toEqual([]);
  });

  test("keeps a view inside a window too narrow for its least", () => {
    const { width } = rig({ showing: "view", view: 300 });
    expect(width()).toBe("271px");
  });
});

describe("the strip", () => {
  test("is a separator the keys reach, that says its value and its limits", () => {
    const { strip, sizer, state } = rig();
    expect(strip.className).toBe("sizer");
    expect(strip.tabIndex).toBe(0);
    expect(strip.attributes.get("role")).toBe("separator");
    expect(strip.attributes.get("aria-orientation")).toBe("vertical");
    expect(strip.attributes.get("aria-label")).toBe("panel width");
    expect(strip.attributes.get("aria-valuenow")).toBe("240");
    expect(strip.attributes.get("aria-valuemin")).toBe("240");
    expect(strip.attributes.get("aria-valuemax")).toBe("720");
    state.showing = "view";
    state.view = 700;
    sizer.size();
    expect(strip.attributes.get("aria-valuenow")).toBe("340");
    expect(strip.attributes.get("aria-valuemin")).toBe("280");
    expect(strip.attributes.get("aria-valuemax")).toBe("604");
  });

  test("a drag changes the width of what shows, live, with no glide, and keeps it once let go", () => {
    const { strip, widths, sized, kept, dataset } = rig({ showing: "view" });
    widths.length = 0;
    strip.fire("pointerdown", { clientX: 1000 });
    expect(strip.captured).toBe(1);
    expect(dataset.sizing).toBe("true");
    strip.fire("pointermove", { clientX: 940 });
    strip.fire("pointermove", { clientX: 900 });
    expect(widths).toEqual(["400px still", "400px", "440px still", "440px"]);
    expect(sized).toEqual([
      { glide: false, host: "421px" },
      { glide: false, host: "461px" },
    ]);
    expect(kept).toEqual([]);
    strip.fire("pointerup", { clientX: 900 });
    expect(kept).toEqual([["view", 440]]);
    expect(strip.captured).toBeNull();
    expect(dataset.sizing).toBeUndefined();
    expect(sized).toHaveLength(2);
  });

  test("a drag while the rows show changes their width, not a view's", () => {
    const { strip, kept, prefs } = rig();
    strip.fire("pointerdown", { clientX: 1000 });
    strip.fire("pointermove", { clientX: 950 });
    strip.fire("pointerup", { clientX: 950 });
    expect(kept).toEqual([["list", 290]]);
    expect(prefs.viewWidth).toBe(340);
  });

  test("stops at the least and the most", () => {
    const { strip, width } = rig({ showing: "view" });
    strip.fire("pointerdown", { clientX: 1000 });
    strip.fire("pointermove", { clientX: 1500 });
    expect(width()).toBe("280px");
    strip.fire("pointermove", { clientX: -500 });
    expect(width()).toBe("720px");
    strip.fire("pointerup");
  });

  test("on the left it is the panel's right edge, and a drag to the right is wider", () => {
    const { strip, width } = rig({ showing: "view", side: "left" });
    strip.fire("pointerdown", { clientX: 361 });
    strip.fire("pointermove", { clientX: 421 });
    expect(width()).toBe("400px");
    strip.fire("pointerup");
  });

  test("a press that never moves keeps nothing, and neither does another button or pointer", () => {
    const { strip, kept, widths } = rig({ showing: "view" });
    const before = widths.length;
    strip.fire("pointerdown", { clientX: 1000 });
    strip.fire("pointermove", { clientX: 900, pointerId: 2 });
    strip.fire("pointerup", { pointerId: 2 });
    expect(strip.captured).toBe(1);
    strip.fire("pointerup", { clientX: 1000 });
    strip.fire("pointerdown", { clientX: 1000, button: 2 });
    expect(strip.captured).toBeNull();
    expect(kept).toEqual([]);
    expect(widths.length).toBe(before);
  });

  test("a drag the browser or the window takes away goes back to the width that is kept", () => {
    for (const how of ["pointercancel", "lostpointercapture", "cancel"]) {
      const { strip, sizer, width, kept, dataset } = rig({ showing: "view" });
      strip.fire("pointerdown", { clientX: 1000 });
      strip.fire("pointermove", { clientX: 900 });
      expect(width()).toBe("440px");
      if (how === "cancel") sizer.cancel();
      else strip.fire(how);
      expect(width()).toBe("340px");
      expect(kept).toEqual([]);
      expect(dataset.sizing).toBeUndefined();
      // The capture the end let go of finds no drag.
      strip.fire("lostpointercapture");
      strip.fire("pointerup");
      expect(kept).toEqual([]);
    }
  });

  test("a double click puts the width of what shows back to its default", () => {
    const view = rig({ showing: "view" }, { listWidth: 300, viewWidth: 520 });
    view.strip.fire("dblclick");
    expect(view.kept).toEqual([["view", 340]]);
    expect(view.width()).toBe("340px");
    expect(view.prefs.listWidth).toBe(300);
    const list = rig({}, { listWidth: 300, viewWidth: 520 });
    list.strip.fire("dblclick");
    expect(list.kept).toEqual([["list", 240]]);
    expect(list.width()).toBe("240px");
  });

  test("the arrows change the width by 16, Home and End go to the limits, and each is kept", () => {
    const { strip, kept, width } = rig({ showing: "view" });
    expect(strip.fire("keydown", { key: "ArrowLeft" })).toBe(true);
    expect(strip.fire("keydown", { key: "ArrowLeft" })).toBe(true);
    expect(strip.fire("keydown", { key: "ArrowRight" })).toBe(true);
    expect(kept).toEqual([
      ["view", 356],
      ["view", 372],
      ["view", 356],
    ]);
    strip.fire("keydown", { key: "Home" });
    expect(width()).toBe("280px");
    strip.fire("keydown", { key: "End" });
    expect(width()).toBe("720px");
  });

  test("the keys glide the panel, which the frame follows", () => {
    const { strip, sized } = rig({ showing: "view" });
    strip.fire("keydown", { key: "ArrowLeft" });
    expect(sized).toEqual([{ glide: true, host: "377px" }]);
  });

  test("leaves every other key, and one with a modifier, to the panel", () => {
    const { strip, kept } = rig({ showing: "view" });
    expect(strip.fire("keydown", { key: "a" })).toBe(false);
    expect(strip.fire("keydown", { key: "Escape" })).toBe(false);
    expect(strip.fire("keydown", { key: "ArrowLeft", metaKey: true })).toBe(false);
    expect(strip.fire("keydown", { key: "ArrowLeft", altKey: true })).toBe(false);
    expect(kept).toEqual([]);
  });

  test("the keys start from the width that shows, in a window that holds a kept one narrower", () => {
    const { strip, kept } = rig({ showing: "view", view: 700 }, { viewWidth: 680 });
    strip.fire("keydown", { key: "ArrowRight" });
    expect(kept).toEqual([["view", 604 - 16]]);
  });
});
