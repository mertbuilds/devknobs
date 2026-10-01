import { isOwn, shadowRoots } from "./tree";

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
