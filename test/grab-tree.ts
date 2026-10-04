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
  /** The box the element is laid out in. None at first, as an element that is not drawn. */
  box: FakeRect;
  textContent: string;
  style: { visibility: string; backgroundColor: string; backgroundImage: string };
  ownerDocument: { defaultView: { getComputedStyle(element: FakeElement): FakeElement["style"] } };
  getBoundingClientRect(): FakeRect;
  getClientRects(): FakeRect[];
  hasAttribute(name: string): boolean;
  getRootNode(): unknown;
}

export interface FakeRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

const VIEW = { getComputedStyle: (element: FakeElement) => element.style };

/** Lay the element out at a place, so a point can fall in it. */
export function place(
  element: FakeElement,
  left: number,
  top: number,
  width: number,
  height: number,
): FakeElement {
  element.box = { left, top, right: left + width, bottom: top + height, width, height };
  return element;
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
    box: { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 },
    textContent: "",
    style: { visibility: "visible", backgroundColor: "rgba(0, 0, 0, 0)", backgroundImage: "none" },
    ownerDocument: { defaultView: VIEW },
    getBoundingClientRect: () => self.box,
    getClientRects: () => (self.box.width > 0 && self.box.height > 0 ? [self.box] : []),
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
