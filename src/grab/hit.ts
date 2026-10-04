// adapted from react-grab (MIT, Copyright (c) 2025 Aiden Bai)

/** What a hit test needs of a document or a shadow root. */
export interface HitRoot {
  elementFromPoint(x: number, y: number): Element | null;
}

/** The parent in the composed tree: the element above, or the host of a shadow root. */
export function composedParent(element: Element): Element | null {
  if (element.parentElement) return element.parentElement;
  const root = element.getRootNode?.();
  return root && "host" in root ? (root as ShadowRoot).host : null;
}

/** Part of devknobs itself: its panel, its frame's letterbox, its overlays. */
export function isDevknobs(element: Element): boolean {
  for (let current: Element | null = element; current; current = composedParent(current)) {
    if (current.hasAttribute("data-devknobs")) return true;
  }
  return false;
}

function isRoot(element: Element): boolean {
  const tag = element.tagName.toLowerCase();
  return tag === "html" || tag === "body";
}

/** An element grab can take: on the page, not devknobs, and not the page's root. */
export function isGrabbable(element: Element | null): element is Element {
  return element !== null && !isRoot(element) && !isDevknobs(element);
}

/** The topmost element at a point, reaching into open shadow roots. */
export function deepElementAt(root: HitRoot, x: number, y: number): Element | null {
  let element = root.elementFromPoint(x, y);
  while (element?.shadowRoot) {
    const inner = element.shadowRoot.elementFromPoint(x, y);
    if (!inner || inner === element) break;
    element = inner;
  }
  return element;
}

/** What grab takes at a point. Over devknobs, or the bare page, nothing. */
export function grabTargetAt(root: HitRoot, x: number, y: number): Element | null {
  const element = deepElementAt(root, x, y);
  return isGrabbable(element) ? element : null;
}
