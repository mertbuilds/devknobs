/** A small element tree, with just what grab's walks and hit tests read. */
export interface FakeElement {
  tagName: string;
  parentElement: FakeElement | null;
  children: FakeElement[];
  nextElementSibling: FakeElement | null;
  previousElementSibling: FakeElement | null;
  shadowRoot: { children: FakeElement[]; elementFromPoint(): Element | null } | null;
  isConnected: boolean;
  attrs: Record<string, string>;
  hasAttribute(name: string): boolean;
  getRootNode(): unknown;
}

export function node(
  tag: string,
  children: FakeElement[] = [],
  attrs: Record<string, string> = {},
): FakeElement {
  const self: FakeElement = {
    tagName: tag.toUpperCase(),
    parentElement: null,
    children,
    nextElementSibling: null,
    previousElementSibling: null,
    shadowRoot: null,
    isConnected: true,
    attrs,
    hasAttribute: (name) => name in attrs,
    getRootNode: () => ({}),
  };
  children.forEach((child, index) => {
    child.parentElement = self;
    child.previousElementSibling = children[index - 1] ?? null;
    child.nextElementSibling = children[index + 1] ?? null;
  });
  return self;
}

/** A shadow root on `host` holding `children`, its hit test landing on `hit`. */
export function shadow(host: FakeElement, children: FakeElement[], hit: FakeElement | null): void {
  const root = { host, children, elementFromPoint: () => as(hit) };
  host.shadowRoot = root;
  children.forEach((child, index) => {
    child.getRootNode = () => root;
    child.previousElementSibling = children[index - 1] ?? null;
    child.nextElementSibling = children[index + 1] ?? null;
  });
}

export function as(element: FakeElement | null): Element {
  return element as unknown as Element;
}
