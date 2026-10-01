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

/** The element an animation moves, if it moves one. */
export function targetOf(animation: Animation): Element | null {
  const effect = animation.effect;
  return effect instanceof KeyframeEffect ? effect.target : null;
}

/**
 * Runs on the document's clock. Scroll-driven animations (a ScrollTimeline or a
 * ViewTimeline) follow the scroll position instead, and an animation with no
 * timeline does not run at all, so neither is the knobs' to restart or slow.
 */
export function onDocumentTimeline(animation: Animation): boolean {
  return animation.timeline instanceof DocumentTimeline;
}

/**
 * Every animation the page has: the document's, then each shadow root's, since
 * `document.getAnimations()` leaves shadow trees out. devknobs' own are skipped.
 */
export function collect(roots: ShadowRoot[] = shadowRoots()): Animation[] {
  const found = new Set<Animation>();
  const scopes: DocumentOrShadowRoot[] = [document, ...roots];
  for (const scope of scopes) {
    if (typeof scope.getAnimations !== "function") continue;
    for (const animation of scope.getAnimations()) found.add(animation);
  }
  return Array.from(found).filter((animation) => !isOwn(targetOf(animation)));
}
