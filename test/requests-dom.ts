import { createPane, type PaneView } from "../src/ui/pane";
import type { PaneHost } from "../src/ui/requests";
import type { Tips } from "../src/ui/tooltip";

type Listener = (event: FakeEvent) => void;

export interface FakeEvent {
  target: FakeNode;
  key?: string;
  prevented: boolean;
  preventDefault(): void;
}

/** What has the focus, in the fake page. */
let active: FakeNode | null = null;

export function focused(): FakeNode | null {
  return active;
}

/** How far apart the fake page lays out a box's children that show, top to top, in px. */
export const ROW_PITCH = 26;

/** An element, as far as the requests view builds and drives one. */
export class FakeNode {
  className = "";
  type = "";
  title = "";
  value = "";
  placeholder = "";
  autocomplete = "";
  spellcheck = true;
  tabIndex = 0;
  hidden = false;
  inert = false;
  scrollHeight = 0;
  clientHeight = 0;
  isConnected = true;
  shadowRoot = null;
  parent: FakeNode | null = null;
  children: (FakeNode | string)[] = [];
  attributes = new Map<string, string>();
  listeners = new Map<string, Set<Listener>>();
  /** How often the box was scrolled by the code under test. */
  scrolls = 0;
  private top = 0;

  constructor(readonly tag: string) {}

  get scrollTop(): number {
    return this.top;
  }

  set scrollTop(value: number) {
    this.top = Math.max(0, Math.min(value, Math.max(0, this.scrollHeight - this.clientHeight)));
    this.scrolls++;
  }

  /** It takes room on the page, so it can take the focus. */
  getClientRects(): unknown[] {
    return [{}];
  }

  contains(node: FakeNode): boolean {
    return node === this || this.nodes().some((child) => child.contains(node));
  }

  /** Where the node is under its parent: after the ones before it that show. */
  getBoundingClientRect(): { top: number } {
    const before = this.parent?.nodes() ?? [];
    return { top: before.slice(0, before.indexOf(this)).filter((node) => !node.hidden).length * ROW_PITCH };
  }

  get textContent(): string {
    return this.children.map((child) => (typeof child === "string" ? child : child.textContent)).join("");
  }

  set textContent(text: string) {
    for (const child of this.nodes()) child.parent = null;
    this.children = text === "" ? [] : [text];
  }

  get classList() {
    const names = () => this.className.split(" ").filter((name) => name !== "");
    const set = (name: string, on: boolean) => {
      const rest = names().filter((each) => each !== name);
      this.className = (on ? [...rest, name] : rest).join(" ");
    };
    return {
      contains: (name: string) => names().includes(name),
      add: (name: string) => set(name, true),
      remove: (name: string) => set(name, false),
      toggle: (name: string, on = !names().includes(name)) => set(name, on),
    };
  }

  /** The element children, in order. */
  nodes(): FakeNode[] {
    return this.children.filter((child): child is FakeNode => typeof child !== "string");
  }

  append(...nodes: (FakeNode | string)[]): void {
    for (const node of nodes) this.insertBefore(node, null);
  }

  insertBefore(node: FakeNode | string, before: FakeNode | null): void {
    if (typeof node !== "string") {
      node.remove();
      node.parent = this;
    }
    const at = before ? this.children.indexOf(before) : -1;
    if (at < 0) this.children.push(node);
    else this.children.splice(at, 0, node);
  }

  remove(): void {
    if (!this.parent) return;
    this.parent.children = this.parent.children.filter((child) => child !== this);
    this.parent = null;
  }

  replaceChildren(...nodes: FakeNode[]): void {
    for (const child of this.nodes()) child.parent = null;
    this.children = [];
    this.append(...nodes);
  }

  setAttribute(name: string, value: string): void {
    if (name === "class") this.className = value;
    this.attributes.set(name, value);
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  addEventListener(type: string, listener: Listener): void {
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, listener: Listener): void {
    this.listeners.get(type)?.delete(listener);
  }

  /** Send an event to this node and up through the nodes it is in. */
  fire(type: string, more: { key?: string } = {}): FakeEvent {
    const event: FakeEvent = {
      target: this,
      ...more,
      prevented: false,
      preventDefault() {
        event.prevented = true;
      },
    };
    for (let at: FakeNode | null = this; at; at = at.parent) {
      for (const listener of [...(at.listeners.get(type) ?? [])]) listener(event);
    }
    return event;
  }

  click(): void {
    this.fire("click");
  }

  focus(): void {
    if (active === this) return;
    active?.fire("blur");
    active = this;
    this.fire("focus");
  }

  /** Every node under this one with a class, itself included, in order. */
  find(className: string): FakeNode[] {
    const own = this.className.split(" ").includes(className) ? [this] : [];
    return [...own, ...this.nodes().flatMap((child) => child.find(className))];
  }

  /** The one node under this one with a class. */
  one(className: string): FakeNode {
    const [node] = this.find(className);
    if (!node) throw new Error(`no .${className}`);
    return node;
  }
}

export function fake(node: unknown): FakeNode {
  if (!(node instanceof FakeNode)) throw new Error("not a fake node");
  return node;
}

/** A document the view can build in. */
export function fakeDocument(): void {
  active = null;
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
}

export function leaveDocument(): void {
  Reflect.deleteProperty(globalThis, "document");
  Reflect.deleteProperty(globalThis, "HTMLElement");
}

/**
 * The panel's own place for a view, in a panel that draws nothing: one view
 * at a time, under a head with the way back, in a body that scrolls. It is
 * built in the fake document, so that comes first.
 */
export interface FakePane extends PaneHost {
  /** The whole view: its head and its body. */
  node: FakeNode;
  body: FakeNode;
  /** What the panel gives the focus to when what opened the view is gone. */
  home: FakeNode;
  shown(): PaneView | null;
  /** What the head says. */
  title(): string;
  /** Every way back that shows, in the head and in the body. */
  ways(): FakeNode[];
  /** Press the head's way back. */
  back(): void;
  /** Press the head's button with this label. */
  act(label: string): void;
  /** Escape, as the panel hands it to the view. */
  escape(): void;
  /** How often a view was mounted and cleaned up. */
  mounts: number;
  cleanups: number;
  /** What the head's buttons say in their tooltips, in order. */
  tipped: string[];
}

export function fakePane(): FakePane {
  const home = document.createElement("button");
  const tipped: string[] = [];
  const tips: Tips = {
    show: () => {},
    hide: () => false,
    hideAfter: () => {},
    isFor: () => false,
    tooltip: (_node, text) => {
      tipped.push(typeof text === "string" ? text : text());
    },
    destroy: () => {},
  };
  const real = createPane({
    root: {
      get activeElement() {
        return document.activeElement;
      },
    },
    home,
    tips,
    openPanel: () => {},
    uncover: () => {},
    render: () => {},
  });
  const node = fake(real.node);
  const head = node.one("view-head");
  const body = node.one("view-body");
  body.clientHeight = 100;
  let shown: PaneView | null = null;
  const pane: FakePane = {
    node,
    body,
    home: fake(home),
    mounts: 0,
    cleanups: 0,
    tipped,
    shown: () => shown,
    view: real.view,
    close: real.close,
    retitle: real.retitle,
    escape: real.escape,
    open(view) {
      real.open({
        ...view,
        mount(into) {
          pane.mounts++;
          shown = view;
          const made = view.mount(into);
          return () => {
            pane.cleanups++;
            if (shown === view) shown = null;
            if (typeof made === "function") made();
          };
        },
      });
    },
    title: () => head.one("row-label").textContent,
    ways: () =>
      node.find("main").filter((each) => (each.getAttribute("aria-label") ?? "").startsWith("back")),
    back() {
      head.one("main").click();
    },
    act(label) {
      const control = head.find("view-action").find((each) => each.getAttribute("aria-label") === label);
      if (!control) throw new Error(`no action ${label}`);
      control.click();
    },
  };
  return pane;
}
