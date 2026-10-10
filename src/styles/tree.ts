/** A document or a shadow root: one tree, with stylesheets of its own. */
export type Scope = Document | ShadowRoot;

/** Told by its `host`, as `instanceof` fails for a node of the device frame's window. */
export function isShadowRoot(node: Node): node is ShadowRoot {
  return "host" in node;
}

/** The tree an element is in. One that is not attached counts as in its document. */
export function scopeOf(element: Element): Scope {
  const root = element.getRootNode();
  return isShadowRoot(root) ? root : element.ownerDocument;
}

/**
 * The parent an element inherits from: the slot it is assigned to, else the
 * element above, else the host of its shadow root. A document's root has none:
 * nothing is inherited across a frame.
 */
export function flatParent(element: Element): Element | null {
  if (element.assignedSlot) return element.assignedSlot;
  if (element.parentElement) return element.parentElement;
  const root = element.getRootNode();
  return isShadowRoot(root) ? root.host : null;
}

/** An element as devtools names it: `button#save.primary`. */
export function label(element: Element): string {
  const id = element.getAttribute("id");
  const classes = (element.getAttribute("class") ?? "").split(/\s+/).filter(Boolean);
  return [
    element.tagName.toLowerCase(),
    id ? `#${id}` : "",
    ...classes.map((name) => `.${name}`),
  ].join("");
}
