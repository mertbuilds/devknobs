/**
 * A small DOM for the styles view: nodes that keep what was put in them, so a
 * test reads the view back as text, and the page's elements as far as the view
 * walks and watches them.
 */

type Listener = (event: FakeEvent) => void;

export interface FakeEvent {
  key?: string;
  prevented: boolean;
  preventDefault(): void;
  stopPropagation(): void;
}

/** A node of the view: an element with children, some of them plain text. */
export class FakeNode {
  className = "";
  hidden = false;
  tabIndex = 0;
  value = "";
  type = "";
  placeholder = "";
  scrollLeft = 0;
  scrollWidth = 0;
  scrollTop = 0;
  offsetWidth = 0;
  /** How often it was scrolled to, and whether it was given the focus. */
  scrolls = 0;
  focused = false;
  parentElement: FakeNode | null = null;
  children: (FakeNode | string)[] = [];
  attributes = new Map<string, string>();
  listeners = new Map<string, Set<Listener>>();
  style: Record<string, string> = {};
  classList = {
    add: (name: string) => {
      if (!this.classList.contains(name)) this.className = `${this.className} ${name}`.trim();
    },
    remove: (name: string) => {
      this.className = this.className
        .split(" ")
        .filter((one) => one !== name)
        .join(" ");
    },
    toggle: (name: string, on: boolean) => {
      if (on) this.classList.add(name);
      else this.classList.remove(name);
    },
    contains: (name: string) => this.className.split(" ").includes(name),
  };

  constructor(readonly tag: string) {}

  get textContent(): string {
    return this.children
      .map((child) => (typeof child === "string" ? child : child.textContent))
      .join("");
  }

  set textContent(text: string) {
    this.children = text === "" ? [] : [text];
  }

  append(...nodes: (FakeNode | string)[]): void {
    for (const node of nodes) {
      if (typeof node !== "string") node.parentElement = this;
      this.children.push(node);
    }
  }

  replaceChildren(...nodes: (FakeNode | string)[]): void {
    this.children = [];
    this.append(...nodes);
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
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

  fire(type: string, more: { key?: string } = {}): FakeEvent {
    const event: FakeEvent = {
      ...more,
      prevented: false,
      preventDefault: () => {
        event.prevented = true;
      },
      stopPropagation: () => undefined,
    };
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener(event);
    return event;
  }

  /** A press, which also reaches what listens on the nodes around it. */
  press(key: string): FakeEvent {
    const event = this.fire("keydown", { key });
    for (let up = this.parentElement; up; up = up.parentElement) {
      for (const listener of [...(up.listeners.get("keydown") ?? [])]) listener(event);
    }
    return event;
  }

  focus(): void {
    this.focused = true;
  }

  scrollIntoView(): void {
    this.scrolls++;
  }

  /** Every node under this one, itself included. */
  all(): FakeNode[] {
    const under = this.children.flatMap((child) => (typeof child === "string" ? [] : child.all()));
    return [this, ...under];
  }

  querySelectorAll(tag: string): FakeNode[] {
    return this.all().filter((node) => node !== this && node.tag === tag);
  }

  /** Every node under this one with a class, itself included. */
  find(className: string): FakeNode[] {
    return this.all().filter((node) => node.classList.contains(className));
  }

  /** The same, less what is hidden or sits in something hidden. */
  shown(className: string): FakeNode[] {
    if (this.hidden) return [];
    const own = this.classList.contains(className) ? [this] : [];
    const under = this.children.flatMap((child) =>
      typeof child === "string" ? [] : child.shown(className),
    );
    return [...own, ...under];
  }
}

export function fake(node: unknown): FakeNode {
  if (!(node instanceof FakeNode)) throw new Error("not a fake node");
  return node;
}

/** A document of the page: its head, and the window whose size its styles go by. */
export interface FakeDocument {
  head: { contains(node: unknown): boolean };
  defaultView: EventTarget | null;
}

/** An element of the page, as far as the view names it, walks up from it and watches it. */
export interface FakeElement {
  tagName: string;
  isConnected: boolean;
  parentElement: FakeElement | null;
  assignedSlot: null;
  ownerDocument: FakeDocument;
  /** Whether it is in the head, where the stylesheets are. */
  inHead: boolean;
  getAttribute(name: string): string | null;
  getRootNode(): FakeDocument;
}

export function pageDocument(): FakeDocument {
  return {
    head: { contains: (node) => (node as FakeElement | null)?.inHead === true },
    defaultView: new EventTarget(),
  };
}

export function element(
  doc: FakeDocument,
  tag: string,
  attrs: Record<string, string> = {},
  parent: FakeElement | null = null,
): FakeElement {
  return {
    tagName: tag.toUpperCase(),
    isConnected: true,
    parentElement: parent,
    assignedSlot: null,
    ownerDocument: doc,
    inHead: tag === "style" || tag === "link",
    getAttribute: (name) => attrs[name] ?? null,
    getRootNode: () => doc,
  };
}

export function as(target: FakeElement): Element {
  return target as unknown as Element;
}

/** Every observer made, what each watches, and the way to say something changed. */
export class FakeObserver {
  static made: FakeObserver[] = [];
  watched: { node: unknown; options: MutationObserverInit }[] = [];
  connected = true;

  constructor(readonly callback: (records: MutationRecord[]) => void) {
    FakeObserver.made.push(this);
  }

  observe(node: unknown, options: MutationObserverInit): void {
    this.watched.push({ node, options });
  }

  disconnect(): void {
    this.connected = false;
    this.watched = [];
  }

  /** Something changed on a node it watches. With `came`, those nodes were put under it. */
  change(target: FakeElement, came?: object[]): void {
    const record = came
      ? { target, type: "childList", addedNodes: came, removedNodes: [] }
      : { target, type: "attributes" };
    if (this.connected) this.callback([record as unknown as MutationRecord]);
  }
}
