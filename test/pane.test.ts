import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  closePane,
  createPane,
  onPane,
  openPane,
  PANE_HEIGHT,
  PANE_MIN,
  PANE_WIDTH,
  type Pane,
  type PaneView,
  paneBox,
  paneView,
} from "../src/ui/pane";
import { GLIDE_MAX, PANEL_GAP } from "../src/ui/place";
import type { Tips } from "../src/ui/tooltip";

/** What an open panel and its handle take of the window's width, as the device frame counts it. */
const PANEL = 261;
const HANDLE = 64;

describe("paneBox", () => {
  const WIDE = { width: 1440, height: 900 };
  const at = (y: number, top: number) => ({ y, top });

  test("is 340 wide beside the panel, a pixel over its border, in a window with the room", () => {
    const box = paneBox(at(128, 128), WIDE, HANDLE);
    expect(box.width).toBe(PANE_WIDTH);
    expect(box.over).toBe(0);
    expect(box.reach).toBe(PANE_WIDTH - 1);
    expect(PANE_WIDTH).toBe(340);
  });

  test("is as tall as the panel at its tallest, whatever the panel holds", () => {
    expect(paneBox(at(128, 128), WIDE, HANDLE).height).toBe(PANE_HEIGHT);
    const short = paneBox(at(8, 8), { width: 1440, height: 500 }, HANDLE);
    expect(short.height).toBe(500 - 2 * PANEL_GAP);
    expect(PANE_HEIGHT).toBe(672);
  });

  test("starts at the panel's top, and the window's bottom pushes it up", () => {
    expect(paneBox(at(128, 128), WIDE, HANDLE).top).toBe(128);
    // 900 less the gap less 672 is as low as its top goes.
    expect(paneBox(at(500, 500), WIDE, HANDLE).top).toBe(900 - PANEL_GAP - PANE_HEIGHT);
    expect(paneBox(at(300, 300), { width: 1440, height: 500 }, HANDLE).top).toBe(PANEL_GAP);
  });

  test("spans the panel wherever the panel sits, so the two meet along its whole side", () => {
    for (const height of [300, 500, 688, 900, 1400]) {
      const tallest = Math.min(PANE_HEIGHT, height - 2 * PANEL_GAP);
      for (const panel of [120, tallest]) {
        for (const top of [PANEL_GAP, 128, height - PANEL_GAP - panel]) {
          // Where a panel that tall can sit in a window that tall.
          if (top < PANEL_GAP || top + panel > height - PANEL_GAP) continue;
          const box = paneBox(at(top, top), { width: 1440, height }, HANDLE);
          expect(box.top).toBeLessThanOrEqual(top);
          expect(box.top + box.height).toBeGreaterThanOrEqual(top + panel);
          expect(box.top).toBeGreaterThanOrEqual(PANEL_GAP);
          expect(box.top + box.height).toBeLessThanOrEqual(height - PANEL_GAP);
        }
      }
    }
  });

  test("gets narrower to leave the page a gap, down to its least", () => {
    // 600 less the panel and the handle leaves 340, and the gap takes 8 of it.
    expect(paneBox(at(8, 8), { width: 600, height: 900 }, HANDLE)).toMatchObject({
      width: 332,
      over: 0,
    });
    expect(paneBox(at(8, 8), { width: 508, height: 900 }, HANDLE)).toMatchObject({
      width: PANE_MIN,
      over: 0,
    });
    expect(PANE_MIN).toBe(240);
  });

  test("sits over the panel by what the window lacks, and never moves the panel", () => {
    const box = paneBox(at(8, 8), { width: 390, height: 800 }, HANDLE);
    expect(box.width).toBe(PANE_MIN);
    expect(box.over).toBe(PANE_MIN - (390 - 260));
    expect(box.reach).toBe(PANE_MIN - 1 - box.over);
  });

  test("never leaves the window, handle and all, at any width", () => {
    for (let width = 0; width <= 1600; width += 7) {
      const box = paneBox(at(8, 8), { width, height: 800 }, HANDLE);
      expect(box.width).toBeGreaterThanOrEqual(0);
      expect(box.width).toBeLessThanOrEqual(PANE_WIDTH);
      // Past the least a window can hold, the panel's own 261 is all there is.
      if (width >= PANEL) expect(PANEL + box.reach).toBeLessThanOrEqual(width);
      if (width >= PANEL + PANE_MIN + PANEL_GAP) expect(box.over).toBe(0);
    }
  });

  test("in a window narrower than itself, takes what the handle leaves", () => {
    expect(paneBox(at(8, 8), { width: 200, height: 800 }, HANDLE).width).toBe(200 - 21);
  });

  test("names the corner of the pane the handle covers", () => {
    expect(paneBox(at(128, 128), WIDE, HANDLE).tab).toBe("top");
    expect(paneBox(at(300, 128), WIDE, HANDLE).tab).toBe("none");
    expect(paneBox(at(128 + PANE_HEIGHT - HANDLE, 128), WIDE, HANDLE).tab).toBe("bottom");
    // A panel the window pushed the pane up from: its top corner is not the pane's.
    expect(paneBox(at(500, 500), WIDE, HANDLE).tab).toBe("none");
  });
});

type Listener = (event: { target: unknown; propertyName?: string }) => void;

/** What has the focus, in the fake page. */
let active: FakeNode | null = null;

/** An element, as far as the pane builds and drives one. */
class FakeNode {
  className = "";
  textContent = "";
  type = "";
  tabIndex = 0;
  inert = false;
  scrollTop = 0;
  isConnected = true;
  /** Whether it takes room on the page. */
  shows = true;
  height = 0;
  shadowRoot = null;
  dataset: Record<string, string> = {};
  children: FakeNode[] = [];
  attributes = new Map<string, string>();
  listeners = new Map<string, Set<Listener>>();
  properties = new Map<string, string>();
  style = {
    setProperty: (name: string, value: string) => {
      this.properties.set(name, value);
    },
  };

  constructor(readonly tag: string) {}

  append(...nodes: FakeNode[]): void {
    this.children.push(...nodes);
  }

  replaceChildren(...nodes: FakeNode[]): void {
    this.children = [...nodes];
  }

  contains(node: FakeNode): boolean {
    return node === this || this.children.some((child) => child.contains(node));
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  addEventListener(type: string, listener: Listener): void {
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, listener: Listener): void {
    this.listeners.get(type)?.delete(listener);
  }

  fire(type: string, event: { target?: unknown; propertyName?: string } = {}): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) {
      listener({ target: this, ...event });
    }
  }

  focus(): void {
    active = this;
  }

  getClientRects(): unknown[] {
    return this.shows ? [{}] : [];
  }

  getBoundingClientRect(): { height: number } {
    return { height: this.height };
  }

  /** Every node under this one with a class, itself included. */
  find(className: string): FakeNode[] {
    const own = this.className.split(" ").includes(className) ? [this] : [];
    return [...own, ...this.children.flatMap((child) => child.find(className))];
  }
}

function fake(node: unknown): FakeNode {
  if (!(node instanceof FakeNode)) throw new Error("not a fake node");
  return node;
}

/** The page the pane is built in, and what it did there. */
interface Page {
  pane: Pane;
  wrap: FakeNode;
  box: FakeNode;
  body: FakeNode;
  home: FakeNode;
  /** A control of the panel, which opens the pane. */
  trigger: FakeNode;
  covered: number[];
  panelOpens: () => number;
  tipped: [FakeNode, string][];
  tipsHidden: () => number;
  /** Run the timers the pane set. */
  runTimers(): void;
  /** How many times either web storage was reached for. */
  storage: () => number;
}

let moves = true;

function build(options: { open?: boolean; width?: number; height?: number } = {}): Page {
  const timers = new Map<number, () => void>();
  let nextTimer = 1;
  let storage = 0;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      innerWidth: options.width ?? 1440,
      innerHeight: options.height ?? 900,
      setTimeout: (run: () => void) => {
        timers.set(nextTimer, run);
        return nextTimer++;
      },
      get localStorage(): null {
        storage++;
        return null;
      },
      get sessionStorage(): null {
        storage++;
        return null;
      },
    },
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      createElement: (tag: string) => new FakeNode(tag),
      createElementNS: (_namespace: string, tag: string) => new FakeNode(tag),
      documentElement: { clientWidth: options.width ?? 1440 },
      get activeElement(): FakeNode | null {
        return active;
      },
    },
  });
  Object.defineProperty(globalThis, "HTMLElement", { configurable: true, value: FakeNode });
  Object.defineProperty(globalThis, "getComputedStyle", {
    configurable: true,
    value: () => ({ transitionDuration: moves ? "0.22s" : "0s" }),
  });

  const wrap = document.createElement("div");
  const handle = document.createElement("button");
  fake(handle).height = HANDLE;
  const home = document.createElement("button");
  const trigger = document.createElement("button");
  const covered: number[] = [];
  const tipped: [FakeNode, string][] = [];
  let panelOpens = 0;
  let tipsHidden = 0;
  const tips: Tips = {
    show: () => {},
    hide: () => {
      tipsHidden++;
      return false;
    },
    hideAfter: () => {},
    isFor: () => false,
    tooltip: (node, text) => {
      tipped.push([fake(node), text]);
    },
    destroy: () => {},
  };
  let panelOpen = options.open ?? true;
  const pane = createPane({
    wrap,
    root: {
      get activeElement() {
        return document.activeElement;
      },
    },
    handle,
    home,
    tips,
    openPanel: () => {
      if (panelOpen) return;
      panelOpen = true;
      panelOpens++;
      pane.render(true);
    },
    cover: (px) => covered.push(px),
  });
  pane.render(panelOpen);
  pane.place({ y: 128, top: 128 });
  const [box] = fake(pane.node).find("side");
  const [body] = fake(pane.node).find("side-body");
  if (!box || !body) throw new Error("no pane");
  active = fake(trigger);
  return {
    pane,
    wrap: fake(wrap),
    box,
    body,
    home: fake(home),
    trigger: fake(trigger),
    covered,
    panelOpens: () => panelOpens,
    tipped,
    tipsHidden: () => tipsHidden,
    runTimers(): void {
      for (const [id, run] of [...timers]) {
        timers.delete(id);
        run();
      }
    },
    storage: () => storage,
  };
}

/** A view that counts what the pane does with it. */
function viewOf(id: string, more: Partial<PaneView> = {}) {
  /** How often it was mounted and cleaned up, and how many nodes each mount found in the body. */
  const seen: { mounts: number; cleanups: number; bodies: number[] } = {
    mounts: 0,
    cleanups: 0,
    bodies: [],
  };
  const view: PaneView = {
    id,
    title: id,
    mount(body) {
      seen.mounts++;
      seen.bodies.push(fake(body).children.length);
      body.append(document.createElement("div"));
      return () => {
        seen.cleanups++;
      };
    },
    ...more,
  };
  return { view, seen };
}

let page: Page | null = null;

beforeEach(() => {
  moves = true;
  active = null;
});

afterEach(() => {
  page?.pane.destroy();
  page = null;
  for (const name of ["window", "document", "HTMLElement", "getComputedStyle"]) {
    Reflect.deleteProperty(globalThis, name);
  }
});

describe("opening a view", () => {
  test("mounts it in the empty body, names the head and shows the pane", () => {
    page = build();
    const { view, seen } = viewOf("styles", { title: "styles of .card" });
    expect(page.wrap.dataset.pane).toBeUndefined();
    expect(fake(page.pane.node).inert).toBe(true);
    openPane(view);
    expect(seen).toMatchObject({ mounts: 1, cleanups: 0, bodies: [0] });
    expect(page.body.children.length).toBe(1);
    expect(fake(page.pane.node).find("side-title")[0]?.textContent).toBe("styles of .card");
    expect(page.box.attributes.get("aria-label")).toBe("styles of .card");
    expect(page.wrap.dataset.pane).toBe("open");
    expect(fake(page.pane.node).inert).toBe(false);
    expect(paneView()).toBe("styles");
  });

  test("does nothing for the view that is open already", () => {
    page = build();
    const heard: (string | null)[] = [];
    const stop = onPane((id) => heard.push(id));
    const first = viewOf("styles");
    const again = viewOf("styles");
    openPane(first.view);
    page.trigger.focus();
    openPane(first.view);
    openPane(again.view);
    expect(first.seen).toMatchObject({ mounts: 1, cleanups: 0 });
    expect(again.seen.mounts).toBe(0);
    expect(heard).toEqual(["styles"]);
    // Not even the focus moves.
    expect(active).toBe(page.trigger);
    stop();
  });

  test("replaces another view: the old one's cleanup runs once, the body starts empty", () => {
    page = build();
    const styles = viewOf("styles");
    const requests = viewOf("requests");
    openPane(styles.view);
    openPane(requests.view);
    expect(styles.seen).toMatchObject({ mounts: 1, cleanups: 1 });
    expect(requests.seen).toMatchObject({ mounts: 1, cleanups: 0, bodies: [0] });
    expect(page.body.children.length).toBe(1);
    expect(paneView()).toBe("requests");
    expect(page.wrap.dataset.pane).toBe("open");
    openPane(styles.view);
    expect(styles.seen).toMatchObject({ mounts: 2, cleanups: 1 });
    expect(requests.seen.cleanups).toBe(1);
  });

  test("takes a view with no cleanup", () => {
    page = build();
    openPane({ id: "plain", title: "plain", mount: () => {} });
    closePane();
    expect(paneView()).toBeNull();
  });

  test("opens the panel where it is closed, and not one that is open", () => {
    page = build({ open: false });
    openPane(viewOf("styles").view);
    expect(page.panelOpens()).toBe(1);
    expect(page.wrap.dataset.pane).toBe("open");
    closePane();
    openPane(viewOf("requests").view);
    expect(page.panelOpens()).toBe(1);
  });
});

describe("closing the pane", () => {
  test("runs the cleanup once, and keeps the view's nodes until the pane has slid away", () => {
    page = build();
    const { view, seen } = viewOf("styles");
    openPane(view);
    closePane();
    expect(seen.cleanups).toBe(1);
    expect(paneView()).toBeNull();
    expect(page.wrap.dataset.pane).toBe("leaving");
    expect(fake(page.pane.node).inert).toBe(true);
    expect(page.body.children.length).toBe(1);
    // A transition of the view's own, or of another property, is not the slide's end.
    page.box.fire("transitionend", { target: page.body, propertyName: "transform" });
    page.box.fire("transitionend", { propertyName: "opacity" });
    expect(page.wrap.dataset.pane).toBe("leaving");
    page.box.fire("transitionend", { propertyName: "transform" });
    expect(page.wrap.dataset.pane).toBeUndefined();
    expect(page.body.children.length).toBe(0);
    closePane();
    page.pane.close();
    expect(seen.cleanups).toBe(1);
  });

  test("lands at once where nothing animates, as under reduced motion", () => {
    page = build();
    moves = false;
    openPane(viewOf("styles").view);
    closePane();
    expect(page.wrap.dataset.pane).toBeUndefined();
    expect(page.body.children.length).toBe(0);
  });

  test("lands a while after the longest glide where the slide's end never comes", () => {
    page = build();
    openPane(viewOf("styles").view);
    closePane();
    expect(page.wrap.dataset.pane).toBe("leaving");
    page.runTimers();
    expect(page.wrap.dataset.pane).toBeUndefined();
    expect(GLIDE_MAX).toBe(440);
  });

  test("a view opened while the pane slides away stays", () => {
    page = build();
    openPane(viewOf("styles").view);
    closePane();
    openPane(viewOf("requests").view);
    page.box.fire("transitionend", { propertyName: "transform" });
    page.runTimers();
    expect(page.wrap.dataset.pane).toBe("open");
    expect(page.body.children.length).toBe(1);
  });

  test("the x in the head closes it", () => {
    page = build();
    openPane(viewOf("styles").view);
    const buttons = fake(page.pane.node).find("side-action");
    const close = buttons[buttons.length - 1];
    expect(close?.attributes.get("aria-label")).toBe("close");
    close?.fire("click");
    expect(paneView()).toBeNull();
  });
});

describe("the head's actions", () => {
  test("show before the x in the view's order, named, with a tooltip, and run on a click", () => {
    page = build();
    const ran: string[] = [];
    const { view } = viewOf("requests", {
      actions: [
        { label: "copy", icon: "x", run: () => ran.push("copy") },
        { label: "clear", icon: "eraser", run: () => ran.push("clear") },
      ],
    });
    openPane(view);
    const buttons = fake(page.pane.node).find("side-action");
    expect(buttons.map((node) => node.attributes.get("aria-label"))).toEqual([
      "copy",
      "clear",
      "close",
    ]);
    expect(buttons.map((node) => node.type)).toEqual(["button", "button", "button"]);
    expect(page.tipped.map(([, text]) => text)).toEqual(["close", "copy", "clear"]);
    buttons[1]?.fire("click");
    buttons[0]?.fire("click");
    expect(ran).toEqual(["clear", "copy"]);
    expect(paneView()).toBe("requests");
  });

  test("go with their view", () => {
    page = build();
    openPane(viewOf("requests", { actions: [{ label: "clear", icon: "eraser", run() {} }] }).view);
    openPane(viewOf("styles").view);
    const names = fake(page.pane.node)
      .find("side-action")
      .map((node) => node.attributes.get("aria-label"));
    expect(names).toEqual(["close"]);
    // A tooltip left up over a button that is gone would stay.
    expect(page.tipsHidden()).toBeGreaterThan(0);
  });
});

describe("escape", () => {
  test("closes the pane with the focus in it", () => {
    page = build();
    openPane(viewOf("styles").view);
    expect(active).toBe(page.box);
    expect(page.pane.escape()).toBe(true);
    expect(paneView()).toBeNull();
  });

  test("with the focus on something in the view, too", () => {
    page = build();
    openPane(viewOf("styles").view);
    page.body.children[0]?.focus();
    expect(page.pane.escape()).toBe(true);
    expect(paneView()).toBeNull();
  });

  test("is not the pane's with the focus anywhere else, so the panel's rules take it", () => {
    page = build();
    expect(page.pane.escape()).toBe(false);
    openPane(viewOf("styles").view);
    page.home.focus();
    expect(page.pane.escape()).toBe(false);
    active = null;
    expect(page.pane.escape()).toBe(false);
    expect(paneView()).toBe("styles");
  });

  test("goes to the view first, which keeps the pane open where it takes it", () => {
    page = build();
    let filter = "status:500";
    const { view } = viewOf("requests", {
      escape: () => {
        if (!filter) return false;
        filter = "";
        return true;
      },
    });
    openPane(view);
    expect(page.pane.escape()).toBe(true);
    expect(paneView()).toBe("requests");
    expect(page.pane.escape()).toBe(true);
    expect(paneView()).toBeNull();
  });
});

describe("the focus", () => {
  test("moves into the pane as it opens, and back to what opened it as it closes", () => {
    page = build();
    openPane(viewOf("styles").view);
    expect(active).toBe(page.box);
    expect(page.box.tabIndex).toBe(-1);
    closePane();
    expect(active).toBe(page.trigger);
  });

  test("stays where the user put it, outside the pane", () => {
    page = build();
    openPane(viewOf("styles").view);
    page.home.focus();
    closePane();
    expect(active).toBe(page.home);
  });

  test("goes back to what opened the first view, past one that took its place", () => {
    page = build();
    openPane(viewOf("styles").view);
    openPane(viewOf("requests").view);
    expect(active).toBe(page.box);
    closePane();
    expect(active).toBe(page.trigger);
  });

  test("goes to the panel where what opened the pane is gone or hidden", () => {
    page = build();
    openPane(viewOf("styles").view);
    page.trigger.shows = false;
    closePane();
    expect(active).toBe(page.home);
    page.trigger.shows = true;
    page.trigger.focus();
    openPane(viewOf("styles").view);
    page.trigger.isConnected = false;
    closePane();
    expect(active).toBe(page.home);
  });
});

describe("a closed panel", () => {
  test("hides the pane and keeps its view, and an open one brings it back", () => {
    page = build();
    const heard: (string | null)[] = [];
    const stop = onPane((id) => heard.push(id));
    const { view, seen } = viewOf("styles");
    openPane(view);
    page.pane.render(false);
    expect(page.wrap.dataset.pane).toBe("leaving");
    expect(fake(page.pane.node).inert).toBe(true);
    page.box.fire("transitionend", { propertyName: "transform" });
    expect(page.wrap.dataset.pane).toBeUndefined();
    expect(paneView()).toBe("styles");
    expect(seen).toMatchObject({ mounts: 1, cleanups: 0 });
    expect(page.body.children.length).toBe(1);
    page.pane.render(true);
    expect(page.wrap.dataset.pane).toBe("open");
    expect(fake(page.pane.node).inert).toBe(false);
    expect(seen).toMatchObject({ mounts: 1, cleanups: 0 });
    expect(heard).toEqual(["styles"]);
    stop();
  });

  test("brings no pane back with no view", () => {
    page = build();
    page.pane.render(false);
    page.pane.render(true);
    expect(page.wrap.dataset.pane).toBeUndefined();
  });

  test("a view closed while it hides is gone at once", () => {
    page = build();
    const { view, seen } = viewOf("styles");
    openPane(view);
    page.pane.render(false);
    page.box.fire("transitionend", { propertyName: "transform" });
    closePane();
    expect(seen.cleanups).toBe(1);
    expect(page.body.children.length).toBe(0);
    page.pane.render(true);
    expect(page.wrap.dataset.pane).toBeUndefined();
  });
});

describe("where the pane goes", () => {
  test("is told to the stylesheet, from the handle's top", () => {
    page = build();
    page.pane.place({ y: 300, top: 128 });
    expect(page.wrap.properties.get("--pane-top")).toBe("-172px");
    expect(page.wrap.properties.get("--pane-right")).toBe("239px");
    expect(page.wrap.properties.get("--pane-width")).toBe("340px");
    expect(page.wrap.properties.get("--pane-height")).toBe("672px");
    expect(page.wrap.properties.get("--pane-reach")).toBe("339px");
    expect(page.wrap.dataset.paneTab).toBe("none");
    page.pane.place({ y: 128, top: 128 });
    expect(page.wrap.dataset.paneTab).toBe("top");
  });

  test("in a narrow window it sits over the panel, and stays in the window", () => {
    page = build({ width: 390, height: 800 });
    expect(page.wrap.properties.get("--pane-width")).toBe("240px");
    // 110 over the panel: its edge is 129 from the window's, not 239.
    expect(page.wrap.properties.get("--pane-right")).toBe("129px");
    expect(page.wrap.properties.get("--pane-reach")).toBe("129px");
    expect(PANEL + 129).toBe(390);
  });
});

describe("the device frame's room", () => {
  test("counts the pane while a view is open, and not before or after", () => {
    page = build();
    expect(page.covered.every((px) => px === 0)).toBe(true);
    openPane(viewOf("styles").view);
    expect(page.covered.at(-1)).toBe(339);
    closePane();
    expect(page.covered.at(-1)).toBe(0);
  });

  test("keeps counting it while the panel is closed, so the frame moves once as it comes back", () => {
    page = build();
    openPane(viewOf("styles").view);
    page.pane.render(false);
    expect(page.covered.at(-1)).toBe(339);
  });

  test("follows the pane as the window gets narrower", () => {
    page = build();
    openPane(viewOf("styles").view);
    Reflect.set(document.documentElement, "clientWidth", 560);
    page.pane.place({ y: 128, top: 128 });
    expect(page.covered.at(-1)).toBe(560 - 260 - PANEL_GAP - 1);
  });

  test("gets its room back when the panel goes", () => {
    page = build();
    openPane(viewOf("styles").view);
    page.pane.destroy();
    expect(page.covered.at(-1)).toBe(0);
    page = null;
  });
});

describe("the pane's state", () => {
  test("is kept nowhere: nothing reaches for web storage", () => {
    page = build();
    openPane(viewOf("styles").view);
    openPane(viewOf("requests").view);
    page.pane.render(false);
    page.pane.render(true);
    page.pane.place({ y: 128, top: 128 });
    page.pane.escape();
    closePane();
    page.runTimers();
    expect(page.storage()).toBe(0);
  });
});

describe("paneView and onPane", () => {
  test("say which view is open, and when it changes", () => {
    page = build();
    const heard: (string | null)[] = [];
    const stop = onPane((id) => heard.push(id));
    expect(paneView()).toBeNull();
    openPane(viewOf("styles").view);
    expect(paneView()).toBe("styles");
    openPane(viewOf("requests").view);
    expect(paneView()).toBe("requests");
    closePane();
    closePane();
    expect(paneView()).toBeNull();
    expect(heard).toEqual(["styles", "requests", null]);
    stop();
    openPane(viewOf("styles").view);
    expect(heard).toEqual(["styles", "requests", null]);
  });

  test("a listener hears the pane as it is: the view is mounted, shown and has the focus", () => {
    page = build();
    const { view, seen } = viewOf("styles");
    const stop = onPane((id) => {
      if (id === null) return;
      expect(seen.mounts).toBe(1);
      expect(paneView()).toBe(id);
      expect(page?.wrap.dataset.pane).toBe("open");
      expect(active).toBe(page?.box ?? null);
    });
    openPane(view);
    stop();
  });

  test("the panel going closes the view, says so, and leaves nothing to open into", () => {
    page = build();
    const heard: (string | null)[] = [];
    const stop = onPane((id) => heard.push(id));
    const { view, seen } = viewOf("styles");
    openPane(view);
    page.pane.destroy();
    page = null;
    expect(seen.cleanups).toBe(1);
    expect(heard).toEqual(["styles", null]);
    expect(paneView()).toBeNull();
    const later = viewOf("requests");
    openPane(later.view);
    closePane();
    expect(later.seen.mounts).toBe(0);
    expect(heard).toEqual(["styles", null]);
    stop();
  });
});
