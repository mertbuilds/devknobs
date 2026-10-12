import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { DEFAULT_STATE } from "../src/engine/store";
import { createStore } from "../src/requests/store";
import type { InspectControl } from "../src/grab/inspect";
import type { Inspection } from "../src/styles/types";
import { createInspector, type Inspector, type LoadStyles, STYLES_VIEW } from "../src/ui/inspector";
import { type EscapeStep, escapeStep } from "../src/ui/keys";
import { closePane, createPane, openPane, type Pane, paneView } from "../src/ui/pane";
import { createRequests, REQUESTS_VIEW } from "../src/ui/requests";
import { createStylesView, EMPTY, GONE, GONE_PICK, PICK, SETTLE, type StylesPage } from "../src/ui/stylesview";
import type { Tips } from "../src/ui/tooltip";
import { fetched } from "./requests-entries";
import { LOADED, manual } from "./requests-fakes";
import { as, element, type FakeElement, FakeNode, FakeObserver, pageDocument } from "./styles-dom";

/**
 * Inspect with the real view of the panel and the real styles view in it: the
 * order escape takes things back in, the ways out of the view, and where the
 * focus goes.
 */

/** What has the focus, in the fake page. */
let active: PanelNode | null = null;

/** A node of the panel, as far as the view's place in it asks more than the styles view does. */
class PanelNode extends FakeNode {
  isConnected = true;
  shadowRoot = null;

  contains(node: FakeNode): boolean {
    return this.all().includes(node);
  }

  getClientRects(): unknown[] {
    return [{}];
  }

  override focus(): void {
    super.focus();
    active = this;
  }
}

/** Inspect's switch, as far as the inspector drives it. */
let on: boolean;
let modeListeners: ((on: boolean) => void)[];
let pickListeners: ((element: Element) => void)[];
let outlined: (Element | null)[];

const inspect: InspectControl = {
  isOn: () => on,
  set(next) {
    if (next === on) return;
    on = next;
    for (const listener of [...modeListeners]) listener(next);
  },
  subscribe(listener) {
    modeListeners.push(listener);
    return () => {
      modeListeners = modeListeners.filter((one) => one !== listener);
    };
  },
  onPick(listener) {
    pickListeners.push(listener);
    return () => {
      pickListeners = pickListeners.filter((one) => one !== listener);
    };
  },
  outline: (target) => {
    outlined.push(target);
  },
  area: () => undefined,
  destroy: () => undefined,
};

const tips: Tips = {
  show: () => undefined,
  hide: () => false,
  hideAfter: () => undefined,
  isFor: () => false,
  tooltip: () => undefined,
  destroy: () => undefined,
};

function found(): Inspection {
  return {
    target: { label: "button#save.primary", pseudo: null },
    blocks: [
      {
        kind: "rule",
        id: 0,
        selectorText: ".primary",
        selector: [{ text: ".primary", matches: true }],
        specificity: [0, 1, 0],
        origin: { sheet: "https://example.com/assets/app.css", owner: "link", path: [0] },
        context: [],
        declarations: [
          {
            name: "color",
            value: "red",
            important: false,
            longhands: ["color"],
            overridden: false,
            variables: [],
          },
        ],
        rule: {} as CSSStyleRule,
      },
    ],
    hidden: [],
    variables: {},
    skipped: 0,
  };
}

const stylesPage: StylesPage = {
  inspect: found,
  invalidate: () => undefined,
  getState: () => DEFAULT_STATE,
  subscribe: () => () => undefined,
  isColor: () => false,
  box: () => null,
  variable: () => "",
};

const load: LoadStyles = async () => ({
  createStylesView: (context) => createStylesView(context, stylesPage),
});

let pane: Pane;
let node: PanelNode;
/** A control of the panel that had the focus when inspect went on. */
let trigger: PanelNode;
let inspector: Inspector | null = null;
let save: FakeElement;

function panelNode(value: unknown): PanelNode {
  if (!(value instanceof PanelNode)) throw new Error("not a node of the panel");
  return value;
}

function one(className: string): PanelNode {
  return panelNode(node.find(className)[0]);
}

/** The styles view's filter, and a text typed in it. */
function filter(): PanelNode {
  return one("filter");
}

function type(text: string): void {
  filter().value = text;
  filter().fire("input");
}

/** A pick, as the mode makes one: the element is handed over, and the mode ends. */
function pick(target: FakeElement): void {
  for (const listener of [...pickListeners]) listener(as(target));
  inspect.set(false);
}

async function settle(): Promise<void> {
  await Bun.sleep(0);
}

/** The view loaded and open on the button, and the picking on again for another. */
async function inspecting(): Promise<void> {
  inspect.set(true);
  await settle();
  pick(save);
  inspect.set(true);
}

/** The empty lines that show, each by its tag and what it says. */
function said(): [string, string][] {
  return node
    .all()
    .filter((part) => part.classList.contains("empty") && !part.hidden)
    .map((part) => [part.tag, part.textContent]);
}

/** The select button the view's bar starts with. */
function select(): PanelNode {
  return one("tool");
}

/**
 * Escape, as the panel takes it with nothing else open: the step `escapeStep`
 * says, and a view asked first where one shows. The mode's own listener is
 * left out, so this is the escape that got past it.
 */
function escape(): EscapeStep {
  const step = escapeStep({
    search: false,
    filter: false,
    keys: false,
    view: paneView() !== null,
    editor: false,
  });
  if (step === "view") pane.escape();
  return step;
}

beforeEach(() => {
  on = false;
  modeListeners = [];
  pickListeners = [];
  outlined = [];
  active = null;
  FakeObserver.made = [];
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: Object.assign(new EventTarget(), {
      location: { origin: "http://localhost:3000" },
      setTimeout: (run: () => void, delay: number) => setTimeout(run, delay),
    }),
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      createElement: (tag: string) => new PanelNode(tag),
      createElementNS: (_namespace: string, tag: string) => new PanelNode(tag),
      get activeElement(): PanelNode | null {
        return active;
      },
    },
  });
  Object.defineProperty(globalThis, "HTMLElement", { configurable: true, value: PanelNode });
  Object.defineProperty(globalThis, "MutationObserver", { configurable: true, value: FakeObserver });

  const doc = pageDocument();
  const html = element(doc, "html");
  save = element(doc, "button", { id: "save", class: "primary" }, element(doc, "body", {}, html));
  trigger = panelNode(document.createElement("button"));
  pane = createPane({
    root: {
      get activeElement() {
        return document.activeElement;
      },
    },
    home: document.createElement("button"),
    tips,
    openPanel: () => undefined,
    uncover: () => undefined,
    render: () => undefined,
  });
  node = panelNode(pane.node);
  trigger.focus();
  inspector = createInspector({ inspect, tips }, load);
});

afterEach(() => {
  pane.destroy();
  inspector?.destroy();
  inspector = null;
  for (const name of ["window", "document", "HTMLElement", "MutationObserver"]) {
    Reflect.deleteProperty(globalThis, name);
  }
});

describe("escape with the styles view open", () => {
  test("ends inspect first, then clears the filter, then goes back to the rows", async () => {
    await inspecting();
    type("color");
    const before = outlined.length;

    expect(escape()).toBe("view");
    expect(on).toBe(false);
    expect(paneView()).toBe("styles");
    expect(filter().value).toBe("color");
    // The last element stays shown, with its box.
    expect(one("css-selector").textContent).toBe(".primary");
    expect(outlined.length).toBe(before);

    expect(escape()).toBe("view");
    expect(paneView()).toBe("styles");
    expect(filter().value).toBe("");

    expect(escape()).toBe("view");
    expect(paneView()).toBeNull();
    // Only then is it the panel's.
    expect(escape()).toBe("panel");
  });

  test("with no text in the filter, ends inspect and then goes back", async () => {
    await inspecting();
    escape();
    expect(on).toBe(false);
    expect(paneView()).toBe("styles");
    escape();
    expect(paneView()).toBeNull();
  });

  test("after the mode took its own escape, clears the filter and then goes back", async () => {
    await inspecting();
    type("color");
    // The mode's listener comes first, and the panel does not hear that one.
    inspect.set(false);
    expect(paneView()).toBe("styles");
    expect(filter().value).toBe("color");
    escape();
    expect(filter().value).toBe("");
    expect(paneView()).toBe("styles");
    escape();
    expect(paneView()).toBeNull();
  });

  test("clears the filter wherever the focus is, as the panel leaves a view's field to the view", async () => {
    await inspecting();
    inspect.set(false);
    type("color");
    trigger.focus();
    escape();
    expect(filter().value).toBe("");
    expect(paneView()).toBe("styles");
  });
});

describe("the ways out of the styles view", () => {
  test("the way back in the head ends inspect and takes the box off", async () => {
    await inspecting();
    one("main").fire("click");
    expect(paneView()).toBeNull();
    expect(on).toBe(false);
    expect(outlined.at(-1)).toBeNull();
  });

  test("closePane is the same way back", async () => {
    await inspecting();
    closePane();
    expect(on).toBe(false);
    expect(outlined.at(-1)).toBeNull();
  });

  test("another view taking its place ends inspect and takes the box off", async () => {
    await inspecting();
    openPane({ id: "requests", title: "requests", layout: "flush", mount: () => undefined });
    expect(paneView()).toBe("requests");
    expect(on).toBe(false);
    expect(outlined.at(-1)).toBeNull();
    expect(node.find("styles")).toEqual([]);
  });

  test("the search key dropping the view does too", async () => {
    await inspecting();
    pane.drop();
    expect(on).toBe(false);
    expect(outlined.at(-1)).toBeNull();
  });

  test("inspect ending leaves the view open on the last element, and going on again keeps it", async () => {
    await inspecting();
    inspect.set(false);
    expect(paneView()).toBe("styles");
    expect(outlined.every((target) => target === null)).toBe(true);
    const shown = one("styles");
    inspect.set(true);
    await settle();
    expect(one("styles")).toBe(shown);
    expect(one("css-selector").textContent).toBe(".primary");
  });
});

describe("the styles view and the requests view, one in the other's place", () => {
  /** The real requests view on the panel's own view, over a log the test fills. */
  function logged() {
    const timer = manual();
    const store = createStore({ seed: "t", now: () => LOADED + 10_000, schedule: timer.schedule });
    const requests = createRequests({ log: () => store });
    const add = (): void => store.put(fetched({ id: store.nextId() }));
    return { timer, requests, add };
  }

  test("the requests taking the styles' place end inspect and take the box off", async () => {
    const { requests } = logged();
    await inspecting();
    requests.toggle();
    expect(paneView()).toBe(REQUESTS_VIEW);
    expect(requests.shows()).toBe(true);
    expect(on).toBe(false);
    expect(outlined.at(-1)).toBeNull();
    expect(node.find("styles")).toEqual([]);
  });

  test("the styles taking the requests' place stop the requests listening to the log", async () => {
    const { timer, requests, add } = logged();
    requests.toggle();
    add();
    // The list hears the log while it shows.
    expect(timer.waiting()).toBe(1);
    await inspecting();
    expect(paneView()).toBe(STYLES_VIEW);
    expect(requests.shows()).toBe(false);
    expect(on).toBe(true);
    expect(one("css-selector").textContent).toBe(".primary");
    expect(node.find("req-list")).toEqual([]);
    // What the log gathered while the list showed goes to no one.
    timer.run();
    add();
    // With no one to tell, the log gathers nothing.
    expect(timer.waiting()).toBe(0);
  });
});

describe("the view with no element", () => {
  test("has no bar while it picks, only the head and a line of words", async () => {
    inspect.set(true);
    await settle();
    expect(one("toolbar").hidden).toBe(true);
    expect(said()).toEqual([["div", EMPTY]]);
  });

  test("once the picking ends with no pick, the line is the button that starts it again, and still no bar", async () => {
    inspect.set(true);
    await settle();
    expect(escape()).toBe("view");
    expect(on).toBe(false);
    expect(paneView()).toBe(STYLES_VIEW);
    expect(one("toolbar").hidden).toBe(true);
    expect(said()).toEqual([["button", PICK]]);
    one("empty-action").fire("click");
    expect(on).toBe(true);
    expect(said()).toEqual([["div", EMPTY]]);
    // The view has the focus, so the arrows and Enter are the picking's.
    expect(active).toBe(one("styles"));
    // Inspect's key ends it as it started it, and the line follows.
    inspect.set(false);
    expect(said()).toEqual([["button", PICK]]);
  });

  test("the bar comes with the element, the select button first, and the line goes", async () => {
    inspect.set(true);
    await settle();
    pick(save);
    expect(one("toolbar").hidden).toBe(false);
    expect(one("toolbar").children[0]).toBe(select());
    expect(said()).toEqual([]);
  });
});

describe("the select button the view's bar starts with", () => {
  test("is the first control of the bar, the kit's toggle, pressed while the picking is on", async () => {
    inspect.set(true);
    await settle();
    expect(node.find("tool")).toHaveLength(1);
    expect(one("toolbar").children[0]).toBe(select());
    expect(select().tag).toBe("button");
    expect(select().className).toBe("tool on");
    expect(select().attributes.get("aria-label")).toBe("select an element");
    expect(select().attributes.get("aria-pressed")).toBe("true");
    pick(save);
    expect(select().className).toBe("tool");
    expect(select().attributes.get("aria-pressed")).toBe("false");
    expect(one("css-selector").textContent).toBe(".primary");
    expect(one("toolbar").children.map((part) => (part as PanelNode).className)).toEqual(["tool", "field filter"]);
  });

  test("is no action of the head, which holds the way back alone", async () => {
    inspect.set(true);
    await settle();
    expect(node.find("view-action")).toEqual([]);
    expect(one("view-actions").children).toEqual([]);
    // The tab key comes to the way back, then to the bar, where the button is first.
    const stops = node.all().filter((part) => part.tag === "button" || part.tag === "input");
    expect(stops.indexOf(one("main"))).toBe(0);
    expect(stops.indexOf(select())).toBeLessThan(stops.indexOf(filter()));
  });

  test("starts the picking again with a click, and ends it with the next, the element kept", async () => {
    inspect.set(true);
    await settle();
    pick(save);
    select().fire("click");
    expect(on).toBe(true);
    expect(select().attributes.get("aria-pressed")).toBe("true");
    // The view has the focus, so the arrows and Enter are the picking's and not the button's.
    expect(active).toBe(one("styles"));
    select().fire("click");
    expect(on).toBe(false);
    expect(select().attributes.get("aria-pressed")).toBe("false");
    expect(one("css-selector").textContent).toBe(".primary");
  });

  test("follows escape and inspect's key, which end and start the picking without it", async () => {
    inspect.set(true);
    await settle();
    expect(escape()).toBe("view");
    expect(on).toBe(false);
    expect(select().attributes.get("aria-pressed")).toBe("false");
    inspect.set(true);
    expect(select().attributes.get("aria-pressed")).toBe("true");
  });

  test("stops hearing the mode once its view is left", async () => {
    inspect.set(true);
    await settle();
    const hearing = modeListeners.length;
    closePane();
    expect(modeListeners).toHaveLength(hearing - 1);
  });
});

describe("the page with the styles view open", () => {
  test("has nothing boxed on it after a pick, until the view points at the element", async () => {
    inspect.set(true);
    await settle();
    pick(save);
    expect(outlined.every((target) => target === null)).toBe(true);
    outlined = [];
    const crumbs = node.find("crumb");
    crumbs[crumbs.length - 1]?.fire("pointerenter");
    expect(outlined).toEqual([as(save)]);
    crumbs[crumbs.length - 1]?.fire("pointerleave");
    expect(outlined).toEqual([as(save), null]);
  });

  test("the head's line boxes the element while the pointer is on it", async () => {
    inspect.set(true);
    await settle();
    pick(save);
    outlined = [];
    one("main").fire("pointerenter");
    expect(outlined).toEqual([as(save)]);
    one("main").fire("pointerleave");
    expect(outlined).toEqual([as(save), null]);
  });

  test("nothing the view points at is boxed while the picking draws its own box", async () => {
    await inspecting();
    outlined = [];
    const crumbs = node.find("crumb");
    crumbs[crumbs.length - 1]?.fire("pointerenter");
    one("main").fire("pointerenter");
    expect(outlined).toEqual([]);
  });

  test("an element that left the page is said so, in a line that is the button to pick another, with no bar", async () => {
    inspect.set(true);
    await settle();
    pick(save);
    expect(inspector?.picked()).toBe("button#save.primary");
    const parent = save.parentElement;
    save.isConnected = false;
    if (parent) FakeObserver.made.at(-1)?.change(parent);
    await Bun.sleep(SETTLE + 20);
    expect(inspector?.picked()).toBeNull();
    expect(one("toolbar").hidden).toBe(true);
    expect(said()).toEqual([["button", GONE_PICK]]);
    one("empty-action").fire("click");
    expect(on).toBe(true);
    // While it picks, the line is only words.
    expect(said()).toEqual([["div", GONE]]);
    expect(active).toBe(one("styles"));
  });
});

describe("the focus with the styles view", () => {
  test("is the view's own as it opens, not the back button's, so the arrows and Enter stay the picking's", async () => {
    inspect.set(true);
    await settle();
    expect(active).toBe(one("styles"));
    expect(active?.tag).not.toBe("button");
    expect(one("styles").tabIndex).toBe(-1);
    expect(node.contains(one("styles"))).toBe(true);
  });

  test("goes back to what had it once the view is left", async () => {
    await inspecting();
    closePane();
    expect(active).toBe(trigger);
  });
});
