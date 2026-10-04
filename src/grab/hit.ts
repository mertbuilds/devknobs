// adapted from react-grab (MIT, Copyright (c) 2025 Aiden Bai)

/** What a hit test needs of a document or a shadow root. */
export interface HitRoot {
  elementFromPoint(x: number, y: number): Element | null;
  elementsFromPoint?(x: number, y: number): Element[];
}

/** Levels the walk down from the hit element goes, at most. */
const MAX_DEPTH = 32;

/** Elements under the point that are looked at for one below a clear layer. */
const MAX_LAYERS = 8;

/** Tags that show something with no child and no text. */
const REPLACED = new Set([
  "audio",
  "br",
  "canvas",
  "embed",
  "hr",
  "iframe",
  "img",
  "input",
  "meter",
  "object",
  "progress",
  "select",
  "svg",
  "textarea",
  "video",
]);

const CLEAR_COLOR = /^transparent$|[,/]\s*0\)$/;

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

function styleOf(element: Element): CSSStyleDeclaration | null {
  return element.ownerDocument.defaultView?.getComputedStyle(element) ?? null;
}

/** One of the element's boxes holds the point. A link over two lines has two, not their union. */
function holds(element: Element, x: number, y: number): boolean {
  return Array.from(element.getClientRects()).some(
    (rect) =>
      rect.width > 0 &&
      rect.height > 0 &&
      x >= rect.left &&
      x <= rect.right &&
      y >= rect.top &&
      y <= rect.bottom,
  );
}

function area(element: Element): number {
  const rect = element.getBoundingClientRect();
  return rect.width * rect.height;
}

function isHidden(element: Element): boolean {
  const visibility = styleOf(element)?.visibility;
  return visibility !== undefined && visibility !== "visible";
}

/** An empty box that paints nothing, laid over what the page shows, as a card's link is. */
function isClearLayer(element: Element): boolean {
  if (element.children.length > 0 || element.shadowRoot) return false;
  if (REPLACED.has(element.tagName.toLowerCase()) || element.textContent?.trim()) return false;
  const style = styleOf(element);
  if (!style) return false;
  return style.backgroundImage === "none" && CLEAR_COLOR.test(style.backgroundColor);
}

/**
 * The element to start from. A hit whose own boxes miss the point came from a
 * pseudo element stretched over its neighbours, and a clear layer hides what
 * is under it. Either way the first element below that holds the point leads.
 */
function under(root: HitRoot, top: Element, x: number, y: number): Element {
  if (!root.elementsFromPoint || (holds(top, x, y) && !isClearLayer(top))) return top;
  for (const element of root.elementsFromPoint(x, y).slice(0, MAX_LAYERS)) {
    if (element === top || !isGrabbable(element)) continue;
    if (holds(element, x, y) && !isClearLayer(element)) return element;
  }
  return top;
}

function childrenOf(element: Element): Element[] {
  return [...Array.from(element.children), ...Array.from(element.shadowRoot?.children ?? [])];
}

/**
 * Down from the hit element to the deepest child that holds the point, the
 * smallest where several do. A hit test stops at a card whose children take
 * no pointer events. This goes on to them, by their boxes, along one path.
 */
function descend(start: Element, x: number, y: number): Element {
  let current = start;
  for (let depth = 0; depth < MAX_DEPTH; depth += 1) {
    let best: Element | null = null;
    let smallest = Number.POSITIVE_INFINITY;
    for (const child of childrenOf(current)) {
      if (child.hasAttribute("data-devknobs") || !holds(child, x, y)) continue;
      if (isHidden(child) || isClearLayer(child)) continue;
      const size = area(child);
      if (size > smallest) continue;
      best = child;
      smallest = size;
    }
    if (!best) break;
    current = best;
  }
  return current;
}

/**
 * The deepest element at a point: the topmost one, reaching into open shadow
 * roots, then through clear layers over it and down to the children a hit
 * test passes over.
 */
export function deepElementAt(root: HitRoot, x: number, y: number): Element | null {
  let element = root.elementFromPoint(x, y);
  while (element?.shadowRoot) {
    const inner = element.shadowRoot.elementFromPoint(x, y);
    if (!inner || inner === element) break;
    element = inner;
  }
  if (!isGrabbable(element)) return element;
  return descend(under(root, element, x, y), x, y);
}

/** What grab takes at a point. Over devknobs, or the bare page, nothing. */
export function grabTargetAt(root: HitRoot, x: number, y: number): Element | null {
  const element = deepElementAt(root, x, y);
  return isGrabbable(element) ? element : null;
}
