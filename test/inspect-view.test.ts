import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { DEFAULT_STATE } from "../src/engine/store";
import { createStore } from "../src/requests/store";
import type { InspectControl } from "../src/grab/inspect";
import type { Inspection } from "../src/styles/types";
import { createInspector, type Inspector, type LoadStyles, STYLES_VIEW } from "../src/ui/inspector";
import { type EscapeStep, escapeStep } from "../src/ui/keys";
import { closePane, createPane, openPane, type Pane, paneView } from "../src/ui/pane";
import { createRequests, REQUESTS_VIEW } from "../src/ui/requests";
import { createStylesView, type StylesPage } from "../src/ui/stylesview";
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

function pick(target: FakeElement): void {
  for (const listener of [...pickListeners]) listener(as(target));
}

async function settle(): Promise<void> {
  await Bun.sleep(0);
}

/** Inspect on, the view loaded and open, and the button picked. */
async function inspecting(): Promise<void> {
  inspect.set(true);
  await settle();
  pick(save);
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
    openPane({ id: "requests", title: "requests", mount: () => undefined });
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
    expect(outlined.at(-1)).toBe(as(save));
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
