/** Is this node devknobs' own, or inside one of its shadow roots? */
export function isOwn(node: Node | null): boolean {
  let current = node;
  while (current) {
    if (current instanceof Element && current.closest("[data-devknobs]")) return true;
    const root = current.getRootNode();
    current = root instanceof ShadowRoot ? root.host : null;
  }
  return false;
}

/**
 * Visit every element of the page: the document's, then those inside every open
 * shadow root, nested ones too. devknobs' own hosts and their roots are skipped.
 */
export function walk(visit: (element: Element) => void): void {
  const pending: (Document | ShadowRoot)[] = [document];
  for (let root = pending.pop(); root; root = pending.pop()) {
    for (const element of Array.from(root.querySelectorAll("*"))) {
      if (element.hasAttribute("data-devknobs")) continue;
      visit(element);
      if (element.shadowRoot) pending.push(element.shadowRoot);
    }
  }
}

/** Every open shadow root on the page, devknobs' own left out. */
export function shadowRoots(): ShadowRoot[] {
  const roots: ShadowRoot[] = [];
  walk((element) => {
    if (element.shadowRoot) roots.push(element.shadowRoot);
  });
  return roots;
}
