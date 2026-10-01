import { collect, onDocumentTimeline, targetOf, walk } from "./animations";

/** Marks the boxes whose finished CSS animations replay restarts. */
const MARK = "data-devknobs-replay";

/** The boxes a CSS animation can run on, and the token each one goes by in the mark. */
const BOXES: [pseudo: string, token: string][] = [
  ["", "self"],
  ["::before", "before"],
  ["::after", "after"],
];

const MARKED = BOXES.map(([pseudo, token]) => `[${MARK}~="${token}"]${pseudo}`).join(",");

/**
 * `animation: none` for one style pass is the classic way to start a CSS
 * animation over. A rule, unlike an inline style, reaches pseudo-elements too.
 */
const RESTART = `${MARKED}{animation:none!important}`;

/** One key per CSS animation still on the clock: the box it runs on and its name. */
function key(pseudo: string, name: string): string {
  return `${pseudo} ${name}`;
}

/** The CSS animations the page still has, by the element they run on. */
function liveCss(animations: Animation[]): Map<Element, Set<string>> {
  const live = new Map<Element, Set<string>>();
  for (const animation of animations) {
    const target = targetOf(animation);
    if (!target || !(animation instanceof CSSAnimation)) continue;
    const pseudo = (animation.effect as KeyframeEffect).pseudoElement ?? "";
    const names = live.get(target) ?? new Set<string>();
    names.add(key(pseudo, animation.animationName));
    live.set(target, names);
  }
  return live;
}

/**
 * Does this box name a CSS animation that `getAnimations` no longer returns?
 * A finished animation without a fill is dropped from the list, so the knobs
 * can only find it through the style that asked for it.
 */
function finished(element: Element, pseudo: string, live: Set<string> | undefined): boolean {
  const style = getComputedStyle(element, pseudo || null);
  if (style.animationName === "none") return false;
  const timelines = style.getPropertyValue("animation-timeline");
  if (timelines && timelines.split(",").some((timeline) => timeline.trim() !== "auto")) {
    return false;
  }
  return style.animationName
    .split(",")
    .map((name) => name.trim())
    .some((name) => name !== "none" && !live?.has(key(pseudo, name)));
}

/** Start the finished CSS animations over, in the document and every shadow root. */
function restartFinished(live: Map<Element, Set<string>>): void {
  const marked: Element[] = [];
  const roots = new Set<Document | ShadowRoot>();
  walk((element) => {
    const names = live.get(element);
    const tokens = BOXES.filter(([pseudo]) => finished(element, pseudo, names)).map(
      ([, token]) => token,
    );
    if (tokens.length === 0) return;
    element.setAttribute(MARK, tokens.join(" "));
    marked.push(element);
    roots.add(element.getRootNode() as Document | ShadowRoot);
  });
  if (marked.length === 0) return;
  const styles: HTMLStyleElement[] = [];
  for (const root of roots) {
    const style = document.createElement("style");
    style.setAttribute("data-devknobs", "replay");
    style.textContent = RESTART;
    if (root instanceof ShadowRoot) root.append(style);
    else (document.head ?? document.documentElement).append(style);
    styles.push(style);
  }
  // One forced style pass sees `none`, so the next one starts each animation over.
  void document.documentElement.offsetHeight;
  for (const style of styles) style.remove();
  for (const element of marked) element.removeAttribute(MARK);
}

/**
 * Restart every animation on the page through the Web Animations API, in open
 * shadow roots too. CSS animations that already finished are gone from that
 * list, so those get the `animation: none` reset instead. devknobs' own and
 * scroll-driven animations are left alone.
 */
export function replay(): void {
  const animations = collect();
  const live = liveCss(animations);
  for (const animation of animations) {
    if (!onDocumentTimeline(animation)) continue;
    animation.cancel();
    animation.play();
  }
  restartFinished(live);
}
