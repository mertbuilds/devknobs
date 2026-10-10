/** A small page, with just what the panel's rows, heads and view controls build and drive. */

type Listener = (event: FakeEvent) => void;

/** An event as the fake page sends one. */
export interface FakeEvent {
  type: string;
  target: FakeNode;
  key?: string;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  /** Whether a listener took the event's default away. */
  prevented: boolean;
  preventDefault(): void;
}

/** What has the focus in the fake page. */
let active: FakeNode | null = null;

export function focused(): FakeNode | null {
  return active;
}

export class FakeNode {
  className = "";
  textContent = "";
  type = "";
  title = "";
  value = "";
  placeholder = "";
  autocomplete = "";
  spellcheck = true;
  tabIndex = 0;
  hidden = false;
  inert = false;
  dataset: Record<string, string> = {};
  children: FakeNode[] = [];
  attributes = new Map<string, string>();
  listeners = new Map<string, Set<Listener>>();
  classList = {
    contains: (name: string) => this.classes().includes(name),
    add: (name: string) => this.classList.toggle(name, true),
    remove: (name: string) => this.classList.toggle(name, false),
    toggle: (name: string, on?: boolean) => {
      const rest = this.classes().filter((entry) => entry !== name);
      const next = on ?? rest.length === this.classes().length;
      this.className = (next ? [...rest, name] : rest).join(" ");
      return next;
    },
  };

  constructor(readonly tag: string) {}

  classes(): string[] {
    return this.className.split(" ").filter((name) => name !== "");
  }

  append(...nodes: (FakeNode | string)[]): void {
    for (const node of nodes) {
      if (typeof node === "string") this.textContent += node;
      else this.children.push(node);
    }
  }

  replaceChildren(...nodes: FakeNode[]): void {
    this.children = [...nodes];
  }

  contains(node: FakeNode): boolean {
    return node === this || this.children.some((child) => child.contains(node));
  }

  setAttribute(name: string, value: string): void {
    if (name === "class") this.className = value;
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

  /** Send an event here. It is heard here and up the tree, as one that bubbles is. */
  fire(type: string, more: Partial<FakeEvent> = {}, root?: FakeNode): FakeEvent {
    const event: FakeEvent = {
      type,
      target: this,
      prevented: false,
      preventDefault() {
        event.prevented = true;
      },
      ...more,
    };
    const path = root ? pathTo(root, this) : [this];
    for (const node of [...path].reverse()) {
      for (const listener of [...(node.listeners.get(type) ?? [])]) listener(event);
    }
    return event;
  }

  focus(): void {
    active = this;
  }

  /** Every node under this one with a class, itself included, in the order they stand. */
  find(className: string): FakeNode[] {
    const own = this.classes().includes(className) ? [this] : [];
    return [...own, ...this.children.flatMap((child) => child.find(className))];
  }
}

/** The nodes from `root` down to `node`, or the node alone where it is not under the root. */
function pathTo(root: FakeNode, node: FakeNode): FakeNode[] {
  if (root === node) return [root];
  for (const child of root.children) {
    const path = pathTo(child, node);
    if (path[path.length - 1] === node && path[0] === child) return [root, ...path];
  }
  return [node];
}

export function fake(node: unknown): FakeNode {
  if (!(node instanceof FakeNode)) throw new Error("not a fake node");
  return node;
}

const GLOBALS = ["document", "HTMLElement"];

/** Put a page up for a test to build in, with nothing focused. */
export function page(): void {
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

/** Take the page down again. */
export function leave(): void {
  active = null;
  for (const name of GLOBALS) Reflect.deleteProperty(globalThis, name);
}

interface Rule {
  selector: string;
  body: string;
}

/** Every rule in a stylesheet. At-rules fall away and leave the rules inside. */
export function rules(css: string): Rule[] {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, "");
  return [...bare.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
    selector: (match[1] ?? "").trim(),
    body: match[2] ?? "",
  }));
}
