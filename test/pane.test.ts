import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { modeOf } from "../src/ui/palette";
import {
  closePane,
  createPane,
  NEST_LATE,
  nestOf,
  onPane,
  openPane,
  PANE_WIDTH,
  type Pane,
  type PaneView,
  paneView,
  retitlePane,
  showPane,
} from "../src/ui/pane";
import { SLIDE } from "../src/ui/slide";
import { CSS } from "../src/ui/styles";
import type { Tips } from "../src/ui/tooltip";
import { rules } from "./kit-dom";

type Listener = (event: { target: unknown }) => void;

/** What has the focus, in the fake page. */
let active: FakeNode | null = null;

/** An element, as far as the view's place in the panel builds and drives one. */
class FakeNode {
  className = "";
  textContent = "";
  type = "";
  tabIndex = 0;
  scrollTop = 0;
  offsetTop = 0;
  offsetHeight = 0;
  inert = false;
  isConnected = true;
  /** Whether it takes room on the page. */
  shows = true;
  shadowRoot = null;
  style: Record<string, string> = {};
  parent: FakeNode | null = null;
  children: FakeNode[] = [];
  attributes = new Map<string, string>();
  listeners = new Map<string, Set<Listener>>();
  classList = {
    contains: (name: string) => this.className.split(" ").includes(name),
  };

  constructor(readonly tag: string) {}

  /** A node stands in one place: appended here, it leaves where it stood. */
  append(...nodes: FakeNode[]): void {
    for (const node of nodes) {
      node.remove();
      node.parent = this;
      this.children.push(node);
    }
  }

  replaceChildren(...nodes: FakeNode[]): void {
    for (const child of [...this.children]) child.remove();
    this.append(...nodes);
  }

  remove(): void {
    if (this.parent) this.parent.children = this.parent.children.filter((child) => child !== this);
    this.parent = null;
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }

  getBoundingClientRect(): Record<string, number> {
    return {};
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

  fire(type: string, target: FakeNode = this): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener({ target });
  }

  focus(): void {
    active = this;
  }

  getClientRects(): unknown[] {
    return this.shows ? [{}] : [];
  }

  /** Every node under this one with a class, itself included. */
  find(className: string): FakeNode[] {
    const own = this.className.split(" ").includes(className) ? [this] : [];
    return [...own, ...this.children.flatMap((child) => child.find(className))];
  }
}

/** The focus leaves the panel, as it does when the panel closes. */
function blur(): void {
  active = null;
}

function fake(node: unknown): FakeNode {
  if (!(node instanceof FakeNode)) throw new Error("not a fake node");
  return node;
}

/** The panel the view is built in, and what the view did there. */
interface Page {
  pane: Pane;
  node: FakeNode;
  /** The way back in the head, and the head's title. */
  back: FakeNode;
  title: FakeNode;
  body: FakeNode;
  home: FakeNode;
  /** A control of the panel, which opens the view. */
  trigger: FakeNode;
  /** What the panel was asked for, in order: to leave the search and the settings, to open, to draw. */
  asked: string[];
  /** The controls given a tooltip, each with its text, or with what says it as it shows. */
  tipped: [FakeNode, string | (() => string)][];
  tipsHidden: () => number;
  /** Runs as the panel draws, in the place of what a real panel does then. */
  drawing: { run: (() => void) | null };
  /** The panel's slide takes the view away, and lands. */
  slideAway(): void;
  land(): void;
  /** How many times either web storage was reached for. */
  storage: () => number;
}

/** Something the pane asked to run later. */
interface Later {
  ms: number;
  run(): void;
  off: boolean;
}

function build(options: { open?: boolean; later?: Later[] } = {}): Page {
  let storage = 0;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
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
      get activeElement(): FakeNode | null {
        return active;
      },
    },
  });
  Object.defineProperty(globalThis, "HTMLElement", { configurable: true, value: FakeNode });

  const home = document.createElement("button");
  const trigger = document.createElement("button");
  const asked: string[] = [];
  const tipped: Page["tipped"] = [];
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
  const drawing: Page["drawing"] = { run: null };
  const pane = createPane({
    root: {
      get activeElement() {
        return document.activeElement;
      },
    },
    home,
    tips,
    openPanel: () => {
      if (panelOpen) return;
      panelOpen = true;
      asked.push("open");
    },
    uncover: () => asked.push("uncover"),
    render: () => {
      asked.push("render");
      drawing.run?.();
    },
    after: options.later
      ? (ms, run) => {
          const later: Later = { ms, run, off: false };
          options.later?.push(later);
          return () => {
            later.off = true;
          };
        }
      : undefined,
  });
  const node = fake(pane.node);
  const [back] = node.find("main");
  const [title] = node.find("row-label");
  const [body] = node.find("view-body");
  if (!back || !title || !body) throw new Error("no view");
  active = fake(trigger);
  return {
    pane,
    node,
    back,
    title,
    body,
    home: fake(home),
    trigger: fake(trigger),
    asked,
    tipped,
    tipsHidden: () => tipsHidden,
    drawing,
    slideAway(): void {
      node.className = "view pane leaving";
    },
    land(): void {
      node.className = "view pane";
      pane.landed();
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
    layout: "flush",
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
  test("mounts it in the empty body, names the head and has the panel draw it", () => {
    page = build();
    const { view, seen } = viewOf("styles", { title: "styles of .card" });
    expect(page.node.className).toBe("view pane");
    openPane(view);
    expect(seen).toMatchObject({ mounts: 1, cleanups: 0, bodies: [0] });
    expect(page.body.children.length).toBe(1);
    expect(page.title.textContent).toBe("styles of .card");
    expect(page.node.attributes.get("aria-label")).toBe("styles of .card");
    expect(page.back.attributes.get("aria-label")).toBe("back from styles of .card");
    expect(page.asked.at(-1)).toBe("render");
    expect(paneView()).toBe("styles");
  });

  test("the open view is brought back in sight when asked, and no other is", () => {
    page = build();
    openPane(viewOf("styles").view);
    page.asked.length = 0;
    showPane("requests");
    expect(page.asked).toEqual([]);
    showPane("styles");
    expect(page.asked).toEqual(["uncover", "render"]);
    closePane();
    page.asked.length = 0;
    showPane("styles");
    expect(page.asked).toEqual([]);
  });

  test("leaves the search and the settings before the panel draws, so the view shows", () => {
    page = build();
    openPane(viewOf("styles").view);
    expect(page.asked).toEqual(["uncover", "render"]);
  });

  test("does nothing for the view that is open already", () => {
    page = build();
    const heard: (string | null)[] = [];
    const stop = onPane((id) => heard.push(id));
    const first = viewOf("styles");
    const again = viewOf("styles");
    openPane(first.view);
    page.trigger.focus();
    const asked = page.asked.length;
    openPane(first.view);
    openPane(again.view);
    expect(first.seen).toMatchObject({ mounts: 1, cleanups: 0 });
    expect(again.seen.mounts).toBe(0);
    expect(heard).toEqual(["styles"]);
    expect(page.asked.length).toBe(asked);
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
    expect(page.title.textContent).toBe("requests");
    expect(paneView()).toBe("requests");
    openPane(styles.view);
    expect(styles.seen).toMatchObject({ mounts: 2, cleanups: 1 });
    expect(requests.seen.cleanups).toBe(1);
  });

  test("takes a view with no cleanup", () => {
    page = build();
    openPane({ id: "plain", title: "plain", layout: "flush", mount: () => {} });
    closePane();
    expect(paneView()).toBeNull();
  });

  test("opens the panel where it is closed, and not one that is open", () => {
    page = build({ open: false });
    openPane(viewOf("styles").view);
    expect(page.asked).toEqual(["uncover", "open", "render"]);
    closePane();
    openPane(viewOf("requests").view);
    expect(page.asked.filter((ask) => ask === "open")).toHaveLength(1);
  });

  test("is 340 wide until the user drags the panel's edge", () => {
    expect(PANE_WIDTH).toBe(340);
  });
});

describe("going back", () => {
  test("runs the cleanup once, has the panel draw the rows, and keeps the nodes while it slides", () => {
    page = build();
    const { view, seen } = viewOf("styles");
    openPane(view);
    page.drawing.run = page.slideAway;
    closePane();
    expect(seen.cleanups).toBe(1);
    expect(paneView()).toBeNull();
    expect(page.asked.at(-1)).toBe("render");
    expect(page.body.children.length).toBe(1);
    page.land();
    expect(page.body.children.length).toBe(0);
    closePane();
    page.pane.close();
    expect(seen.cleanups).toBe(1);
  });

  test("is gone at once where nothing slides, as under the settings or reduced motion", () => {
    page = build();
    openPane(viewOf("styles").view);
    closePane();
    expect(page.body.children.length).toBe(0);
  });

  test("a slide that lands with a view open leaves its nodes", () => {
    page = build();
    openPane(viewOf("styles").view);
    closePane();
    openPane(viewOf("requests").view);
    page.land();
    expect(page.body.children.length).toBe(1);
  });

  test("the way back in the head is the way out, and there is no x", () => {
    page = build();
    openPane(viewOf("styles").view);
    expect(page.back.type).toBe("button");
    expect(page.node.find("view-action")).toHaveLength(0);
    page.back.fire("click");
    expect(paneView()).toBeNull();
  });
});

describe("the head", () => {
  test("is a row from the builder every row is from: the way back where a row's icon is, then the title", () => {
    page = build();
    openPane(viewOf("styles").view);
    const [head] = page.node.find("view-head");
    expect(head?.className).toBe("row view-head");
    expect(head?.children.map((child) => child.className)).toEqual(["line"]);
    expect(page.back.className).toBe("main");
    // The chevron stands where a row's icon is, so the head starts where the view's rows do.
    expect(page.back.children.map((child) => child.tag)).toEqual(["svg", "span"]);
    expect(page.back.children[1]?.className).toBe("row-label");
    expect(page.node.find("lead")).toEqual([]);
    expect(page.title.textContent).toBe("styles");
  });

  test("the view's root says the layout the view names, so the head and the body start in one place", () => {
    page = build();
    openPane(viewOf("styles").view);
    expect(page.node.attributes.get("data-layout")).toBe("flush");
    // The head and the body are both under the root that says it.
    expect(page.node.children.map((child) => child.className)).toEqual(["row view-head", "view-body"]);
    openPane(viewOf("keys", { layout: "rows" }).view);
    expect(page.node.attributes.get("data-layout")).toBe("rows");
    // A view that goes keeps its layout while it slides away.
    closePane();
    expect(page.node.attributes.get("data-layout")).toBe("rows");
  });

  test("takes the focus on the row's main, the button a knob row's ring is drawn on", () => {
    page = build();
    openPane(viewOf("styles").view);
    expect(active).toBe(page.back);
    expect(page.back.tag).toBe("button");
    expect(page.back.className).toBe("main");
  });

  test("its actions are the small button a row's x is", () => {
    page = build();
    openPane(viewOf("requests", { actions: [{ label: "clear", icon: "eraser", run() {} }] }).view);
    const [control] = page.node.find("view-action");
    expect(control?.className).toBe("row-button view-action");
  });
});

describe("the head's actions", () => {
  test("show after the title in the view's order, named, with a tooltip, and run on a click", () => {
    page = build();
    const ran: string[] = [];
    const { view } = viewOf("requests", {
      actions: [
        { label: "copy", icon: "x", run: () => ran.push("copy") },
        { label: "clear", icon: "eraser", run: () => ran.push("clear") },
      ],
    });
    openPane(view);
    const [line] = page.node.find("line");
    expect(line?.children.map((child) => child.className)).toEqual(["main", "view-actions"]);
    const buttons = page.node.find("view-action");
    expect(buttons.map((node) => node.attributes.get("aria-label"))).toEqual(["copy", "clear"]);
    expect(buttons.map((node) => node.type)).toEqual(["button", "button"]);
    expect(page.tipped.map(([, text]) => text)).toEqual(["copy", "clear"]);
    buttons[1]?.fire("click");
    buttons[0]?.fire("click");
    expect(ran).toEqual(["clear", "copy"]);
    expect(paneView()).toBe("requests");
  });

  test("one with a hint says it after its name, as it is when the tooltip shows", () => {
    page = build();
    let key = "Shift C";
    const select = { label: "select an element", icon: "x" as const, run() {}, hint: () => key };
    openPane(viewOf("styles", { actions: [select] }).view);
    const [control] = page.node.find("view-action");
    expect(control?.attributes.get("aria-label")).toBe("select an element");
    const [, text] = page.tipped[0] ?? [];
    if (typeof text !== "function") throw new Error("the tooltip was read too early");
    expect(text()).toBe("select an element · Shift C");
    key = "Alt I";
    expect(text()).toBe("select an element · Alt I");
    key = "";
    expect(text()).toBe("select an element");
  });

  test("a toggle is pressed as it says, and follows what it watches", () => {
    page = build();
    let on = true;
    let tell: (() => void) | null = null;
    let stopped = 0;
    const toggle = {
      label: "select an element",
      icon: "x" as const,
      run: () => {
        on = !on;
        tell?.();
      },
      pressed: () => on,
      watch: (listener: () => void) => {
        tell = listener;
        return () => {
          stopped++;
          tell = null;
        };
      },
    };
    const plain = { label: "clear", icon: "eraser" as const, run() {} };
    openPane(viewOf("styles", { actions: [toggle, plain] }).view);
    const [first, second] = page.node.find("view-action");
    expect(first?.attributes.get("aria-pressed")).toBe("true");
    // One that is no toggle says nothing of being pressed.
    expect(second?.attributes.has("aria-pressed")).toBe(false);
    first?.fire("click");
    expect(first?.attributes.get("aria-pressed")).toBe("false");
    // However it went on: its key, say.
    on = true;
    (tell as (() => void) | null)?.();
    expect(first?.attributes.get("aria-pressed")).toBe("true");
    closePane();
    expect(stopped).toBe(1);
  });

  test("a pressed toggle looks as the panel's other toggles do, by the one rule every small button has", () => {
    const pressed = rules(CSS).filter((rule) => rule.selector.includes("row-button[aria-pressed"));
    expect(pressed.map((rule) => rule.selector)).toEqual(['.row-button[aria-pressed="true"]']);
    expect(pressed[0]?.body.trim()).toBe("color: var(--fg);");
    const keys = rules(CSS).find((rule) => rule.selector.includes(".keys-toggle[aria-pressed"));
    expect(keys?.body.trim()).toBe(pressed[0]?.body.trim());
  });

  test("the pointer on the head's line and off it is told to a view that points at the page", () => {
    page = build();
    const pointed: boolean[] = [];
    openPane(viewOf("styles", { point: (over) => pointed.push(over) }).view);
    page.back.fire("pointerenter");
    page.back.fire("pointerleave");
    expect(pointed).toEqual([true, false]);
    // A view with nothing to point at hears nothing, and neither does one that closed.
    openPane(viewOf("requests").view);
    page.back.fire("pointerenter");
    closePane();
    page.back.fire("pointerenter");
    expect(pointed).toEqual([true, false]);
  });

  test("go with their view", () => {
    page = build();
    openPane(viewOf("requests", { actions: [{ label: "clear", icon: "eraser", run() {} }] }).view);
    openPane(viewOf("styles").view);
    expect(page.node.find("view-action")).toHaveLength(0);
    // A tooltip left up over a button that is gone would stay.
    expect(page.tipsHidden()).toBeGreaterThan(0);
  });
});

describe("escape", () => {
  test("goes back to the rows, wherever the focus is", () => {
    page = build();
    openPane(viewOf("styles").view);
    page.home.focus();
    page.pane.escape();
    expect(paneView()).toBeNull();
  });

  test("goes to the view first, which stays open where it takes it", () => {
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
    page.pane.escape();
    expect(paneView()).toBe("requests");
    page.pane.escape();
    expect(paneView()).toBeNull();
  });

  test("does nothing with no view", () => {
    page = build();
    page.pane.escape();
    expect(page.asked).toEqual([]);
  });
});

describe("a view one step inside another", () => {
  /** A list, and a detail whose way back opens the list again. */
  function nested() {
    const list = viewOf("requests");
    const went: string[] = [];
    const detail = viewOf("request", {
      back() {
        went.push("back");
        openPane(list.view);
      },
    });
    return { list, detail, went };
  }

  test("the head's way back goes where the view says, and from there to the rows", () => {
    page = build();
    const { list, detail, went } = nested();
    openPane(list.view);
    openPane(detail.view);
    page.back.fire("click");
    expect(went).toEqual(["back"]);
    expect(paneView()).toBe("requests");
    expect(page.title.textContent).toBe("requests");
    expect(detail.seen).toMatchObject({ mounts: 1, cleanups: 1 });
    expect(list.seen).toMatchObject({ mounts: 2, cleanups: 1 });
    page.back.fire("click");
    expect(went).toEqual(["back"]);
    expect(paneView()).toBeNull();
    // The focus is back on what opened the first of them.
    expect(active).toBe(page.trigger);
  });

  test("escape goes the same way, after the view had its say", () => {
    page = build();
    const { list, went } = nested();
    let filter = "status:500";
    const detail = viewOf("request", {
      escape: () => {
        if (!filter) return false;
        filter = "";
        return true;
      },
      back() {
        went.push("back");
        openPane(list.view);
      },
    });
    openPane(list.view);
    openPane(detail.view);
    page.pane.escape();
    expect([paneView(), went.length]).toEqual(["request", 0]);
    page.pane.escape();
    expect([paneView(), went.length]).toEqual(["requests", 1]);
    page.pane.escape();
    expect([paneView(), went.length]).toEqual([null, 1]);
  });

  test("closePane still goes all the way to the rows", () => {
    page = build();
    const { list, detail, went } = nested();
    openPane(list.view);
    openPane(detail.view);
    closePane();
    expect(went).toEqual([]);
    expect(paneView()).toBeNull();
  });
});

describe("a view under another slides in over it", () => {
  /** Whether the stylesheet times the slide: it does not under reduced motion. */
  function motion(on: boolean): void {
    Object.defineProperty(globalThis, "getComputedStyle", {
      configurable: true,
      value: () => ({ animationDuration: on ? "0.5s" : "0s" }),
    });
  }

  /** A list, and a detail a step inside it, whose way back opens the list again. */
  function nested() {
    const list = viewOf("stores");
    const detail = viewOf("store", { under: "stores", back: () => openPane(list.view) });
    return { list, detail };
  }

  /** What rides out, where there is something. */
  function gone(at: Page): FakeNode | undefined {
    return at.node.find("view-gone")[0];
  }

  test("which way is told by which view is under the other, and no other change of view slides", () => {
    const { list, detail } = nested();
    expect(nestOf(list.view, detail.view)).toBe("push");
    expect(nestOf(detail.view, list.view)).toBe("pop");
    expect(nestOf(null, list.view)).toBeNull();
    expect(nestOf(list.view, viewOf("other").view)).toBeNull();
    expect(nestOf(detail.view, viewOf("other", { under: "elsewhere" }).view)).toBeNull();
  });

  test("it pushes in: what the first showed rides out in a box of its own, scrolled as it was, and the body comes empty", () => {
    const later: Later[] = [];
    page = build({ later });
    motion(true);
    const { list, detail } = nested();
    openPane(list.view);
    expect(page.node.attributes.has("data-nest")).toBe(false);
    const [first] = page.body.children;
    page.body.scrollTop = 120;
    page.body.offsetTop = 30;
    page.body.offsetHeight = 400;
    openPane(detail.view);
    expect(page.node.attributes.get("data-nest")).toBe("push");
    const left = gone(page);
    expect(left?.className).toBe("view-body view-gone");
    expect(left?.children).toEqual([first as FakeNode]);
    expect(left?.inert).toBe(true);
    expect(left?.scrollTop).toBe(120);
    expect(left?.style).toEqual({ top: "30px", height: "400px" });
    // The head is the pane's own and stays: only the body's place holds two.
    expect(page.node.children.map((child) => child.className)).toEqual(["row view-head", "view-body", "view-body view-gone"]);
    expect(detail.seen.bodies).toEqual([0]);
    expect(page.body.children).toHaveLength(1);
    expect(page.body.scrollTop).toBe(0);
    expect(list.seen.cleanups).toBe(1);
    expect(page.title.textContent).toBe("store");
    expect(active).toBe(page.back);
    expect(later.map((each) => each.ms)).toEqual([SLIDE + NEST_LATE]);
  });

  test("it lands as the body's own animation ends: what left is gone, and the slide is named no more", () => {
    const later: Later[] = [];
    page = build({ later });
    motion(true);
    const { list, detail } = nested();
    openPane(list.view);
    openPane(detail.view);
    // One of something in the view ending is not the slide's.
    page.body.fire("animationend", page.body.children[0]);
    expect(gone(page)).toBeDefined();
    page.body.fire("animationend");
    expect(gone(page)).toBeUndefined();
    expect(page.node.attributes.has("data-nest")).toBe(false);
    expect(later[0]?.off).toBe(true);
    expect(page.body.children).toHaveLength(1);
    expect(paneView()).toBe("store");
  });

  test("with no end said, it lands a while after it should have", () => {
    const later: Later[] = [];
    page = build({ later });
    motion(true);
    const { list, detail } = nested();
    openPane(list.view);
    openPane(detail.view);
    later[0]?.run();
    expect(gone(page)).toBeUndefined();
    expect(page.node.attributes.has("data-nest")).toBe(false);
  });

  test("the way back and escape pop it: the view inside rides out, and the focus goes as it does today", () => {
    const later: Later[] = [];
    page = build({ later });
    motion(true);
    const { list, detail } = nested();
    openPane(list.view);
    openPane(detail.view);
    page.body.fire("animationend");
    const [inside] = page.body.children;
    page.pane.escape();
    expect(paneView()).toBe("stores");
    expect(page.node.attributes.get("data-nest")).toBe("pop");
    expect(gone(page)?.children).toEqual([inside as FakeNode]);
    expect(list.seen.bodies).toEqual([0, 0]);
    expect(active).toBe(page.back);
    page.body.fire("animationend");
    expect(gone(page)).toBeUndefined();
  });

  test("turned round on its way it lands first, so only one view ever rides out", () => {
    const later: Later[] = [];
    page = build({ later });
    motion(true);
    const { list, detail } = nested();
    openPane(list.view);
    openPane(detail.view);
    const [inside] = page.body.children;
    page.back.fire("click");
    expect(page.node.find("view-gone")).toHaveLength(1);
    expect(gone(page)?.children).toEqual([inside as FakeNode]);
    expect(page.node.attributes.get("data-nest")).toBe("pop");
    expect(later.map((each) => each.off)).toEqual([true, false]);
    openPane(detail.view);
    expect(page.node.find("view-gone")).toHaveLength(1);
    expect(page.node.attributes.get("data-nest")).toBe("push");
    expect(paneView()).toBe("store");
    expect(page.body.children).toHaveLength(1);
    expect(later.map((each) => each.off)).toEqual([true, true, false]);
  });

  test("the view closing mid slide, for the rows or for what the panel shows next, lands it", () => {
    for (const leave of [() => closePane(), () => page?.pane.drop(), () => page?.pane.destroy()]) {
      const later: Later[] = [];
      page = build({ later });
      motion(true);
      const { list, detail } = nested();
      openPane(list.view);
      openPane(detail.view);
      leave();
      expect(gone(page)).toBeUndefined();
      expect(page.node.attributes.has("data-nest")).toBe(false);
      expect(later[0]?.off).toBe(true);
      expect(paneView()).toBeNull();
      expect(detail.seen.cleanups).toBe(1);
      page.pane.destroy();
    }
  });

  test("where nothing animates the two swap at once, as views did before", () => {
    const later: Later[] = [];
    page = build({ later });
    motion(false);
    const { list, detail } = nested();
    openPane(list.view);
    openPane(detail.view);
    expect(gone(page)).toBeUndefined();
    expect(page.node.attributes.has("data-nest")).toBe(false);
    expect(later).toEqual([]);
    expect(detail.seen.bodies).toEqual([0]);
    expect(page.body.children).toHaveLength(1);
  });

  test("a view that is under no other swaps at once, motion or not", () => {
    const later: Later[] = [];
    page = build({ later });
    motion(true);
    openPane(viewOf("requests").view);
    openPane(viewOf("styles").view);
    expect(gone(page)).toBeUndefined();
    expect(later).toEqual([]);
  });

  test("the stylesheet slides the two by the panel's own time and curve, and only while a slide is named", () => {
    const sheet = rules(CSS);
    const timed = sheet.find((rule) => rule.selector === ".view[data-nest] > .view-body");
    expect(timed?.body.trim()).toBe("animation: 500ms cubic-bezier(0.32, 0.72, 0, 1) both;");
    expect(SLIDE).toBe(500);
    const panel = sheet.find((rule) => rule.selector === ".body[data-slide] > .pane");
    expect(panel?.body).toContain("500ms cubic-bezier(0.32, 0.72, 0, 1)");
    const named = sheet.filter((rule) => rule.selector.includes("data-nest=")).map((rule) => [rule.selector, rule.body.trim()]);
    expect(named).toEqual([
      ['.view[data-nest="push"] > .view-body', "animation-name: nest-from-right;"],
      ['.view[data-nest="push"] > .view-gone', "animation-name: nest-to-left;"],
      ['.view[data-nest="pop"] > .view-body', "animation-name: nest-from-left;"],
      ['.view[data-nest="pop"] > .view-gone', "animation-name: nest-to-right;"],
    ]);
    for (const name of ["nest-from-right", "nest-from-left", "nest-to-left", "nest-to-right"]) {
      expect(CSS).toContain(`@keyframes ${name}`);
    }
    // Reduced motion times nothing in the panel, so the pane finds no time and swaps.
    expect(CSS).toMatch(/prefers-reduced-motion: reduce[\s\S]*?animation: none !important/);
  });
});

describe("the focus", () => {
  test("moves to the view's head as it opens, and back to what opened it on the way back", () => {
    page = build();
    openPane(viewOf("styles").view);
    expect(active).toBe(page.back);
    closePane();
    expect(active).toBe(page.trigger);
  });

  test("moves once the panel has drawn the view, as the head shows only then", () => {
    page = build();
    const { back } = page;
    const focusedAsDrawn: (FakeNode | null)[] = [];
    page.drawing.run = () => focusedAsDrawn.push(active);
    openPane(viewOf("styles").view);
    expect(focusedAsDrawn).toEqual([page.trigger]);
    expect(active).toBe(back);
  });

  test("stays where the user put it, outside the view", () => {
    page = build();
    openPane(viewOf("styles").view);
    page.home.focus();
    closePane();
    expect(active).toBe(page.home);
  });

  test("goes back from a control of the view, too", () => {
    page = build();
    openPane(viewOf("styles").view);
    page.body.children[0]?.focus();
    closePane();
    expect(active).toBe(page.trigger);
  });

  test("goes back to what opened the first view, past one that took its place", () => {
    page = build();
    openPane(viewOf("styles").view);
    openPane(viewOf("requests").view);
    expect(active).toBe(page.back);
    closePane();
    expect(active).toBe(page.trigger);
  });

  test("goes to the panel where what opened the view is gone or hidden", () => {
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

describe("retitlePane", () => {
  test("changes what the head says for the open view, and nothing else", () => {
    page = build();
    const heard: (string | null)[] = [];
    const stop = onPane((id) => heard.push(id));
    const { view, seen } = viewOf("styles", { title: "styles" });
    openPane(view);
    const asked = page.asked.length;
    retitlePane("styles", "styles of .card");
    expect(page.title.textContent).toBe("styles of .card");
    expect(page.node.attributes.get("aria-label")).toBe("styles of .card");
    expect(page.back.attributes.get("aria-label")).toBe("back from styles of .card");
    expect(seen).toMatchObject({ mounts: 1, cleanups: 0 });
    expect(heard).toEqual(["styles"]);
    expect(page.asked.length).toBe(asked);
    expect(view.title).toBe("styles");
    stop();
  });

  test("does nothing for a view that is not the open one, or with none", () => {
    page = build();
    retitlePane("styles", "nobody");
    expect(page.title.textContent).toBe("");
    openPane(viewOf("styles").view);
    retitlePane("requests", "not mine");
    expect(page.title.textContent).toBe("styles");
    closePane();
    retitlePane("styles", "too late");
    expect(page.title.textContent).toBe("styles");
  });
});

describe("a closed panel", () => {
  test("keeps the view, and gives its head the focus when it opens again", () => {
    page = build();
    const heard: (string | null)[] = [];
    const stop = onPane((id) => heard.push(id));
    const { view, seen } = viewOf("styles");
    openPane(view);
    // The panel closes and opens with no word to the view: it is the panel's body that hides.
    blur();
    expect(paneView()).toBe("styles");
    expect(page.pane.focus()).toBe(true);
    expect(active).toBe(page.back);
    expect(seen).toMatchObject({ mounts: 1, cleanups: 0 });
    expect(page.body.children.length).toBe(1);
    expect(heard).toEqual(["styles"]);
    stop();
  });

  test("with no view, leaves the focus to the panel", () => {
    page = build();
    blur();
    expect(page.pane.focus()).toBe(false);
    expect(active).toBeNull();
  });
});

describe("the search and the settings", () => {
  test("the search key drops the view: closed and said, with the drawing and the focus left to the search", () => {
    page = build();
    const heard: (string | null)[] = [];
    const stop = onPane((id) => heard.push(id));
    const { view, seen } = viewOf("styles");
    openPane(view);
    const asked = page.asked.length;
    page.pane.drop();
    expect(seen.cleanups).toBe(1);
    expect(paneView()).toBeNull();
    expect(heard).toEqual(["styles", null]);
    expect(page.asked.length).toBe(asked);
    expect(active).toBe(page.back);
    // Its nodes go once the search has slid in over it.
    expect(page.body.children.length).toBe(1);
    page.land();
    expect(page.body.children.length).toBe(0);
    page.pane.drop();
    expect(heard).toEqual(["styles", null]);
    stop();
  });

  test("the settings show over a view, which is back once they are left", () => {
    const scene = { keys: false, view: true, query: false, browsing: false };
    expect(modeOf(scene)).toBe("view");
    expect(modeOf({ ...scene, keys: true })).toBe("keys");
    expect(modeOf({ ...scene, keys: false })).toBe("view");
  });

  test("with no view the panel shows the rows or the search, as ever", () => {
    const scene = { keys: false, view: false, query: false, browsing: false };
    expect(modeOf(scene)).toBe("rows");
    expect(modeOf({ ...scene, browsing: true })).toBe("browse");
    expect(modeOf({ ...scene, browsing: true, query: true })).toBe("results");
    expect(modeOf({ ...scene, keys: true, query: true })).toBe("keys");
  });
});

describe("the view's state", () => {
  test("is kept nowhere: nothing reaches for web storage", () => {
    page = build();
    openPane(viewOf("styles").view);
    openPane(viewOf("requests").view);
    retitlePane("requests", "requests (2)");
    page.pane.escape();
    openPane(viewOf("styles").view);
    page.pane.drop();
    page.land();
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

  test("a listener hears the view as it is: mounted, drawn and with the focus", () => {
    page = build();
    const { view, seen } = viewOf("styles");
    const stop = onPane((id) => {
      if (id === null) return;
      expect(seen.mounts).toBe(1);
      expect(paneView()).toBe(id);
      expect(page?.asked.at(-1)).toBe("render");
      expect(active).toBe(page?.back ?? null);
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
    retitlePane("requests", "nobody");
    expect(later.seen.mounts).toBe(0);
    expect(heard).toEqual(["styles", null]);
    stop();
  });
});
