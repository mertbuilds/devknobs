import { isOwn, walk } from "./tree";

/** Under the width knob's frame and the panel, so both stay on top. */
const Z_INDEX = 2147483644;

/** The shortest wait between two looks after the page changes, in ms. */
const MUTATION_THROTTLE = 250;

/** Rounding in layout can leave a box a fraction of a px past an edge it fits. */
const SLACK = 0.5;

/**
 * The marks live in a shadow root like the panel, drawn over the page, so the
 * page's own boxes and styles are never touched.
 */
const CSS = `
.mark {
  position: absolute;
  box-sizing: border-box;
  border: 1px solid #e5484d;
  background: rgba(229, 72, 77, 0.12);
}
`;

interface Offender {
  element: Element;
  rect: DOMRect;
}

export type CountListener = (count: number) => void;

let host: HTMLElement | null = null;
let layer: ShadowRoot | null = null;
let observer: MutationObserver | null = null;
let frame = 0;
let timer = 0;
let count = 0;
/** Offenders already logged, so the console hears about each one once. */
let logged = new WeakSet<Element>();
let loggedUnfound = false;
const listeners = new Set<CountListener>();

/** How many boxes stick out of the viewport right now. */
export function overflowCount(): number {
  return count;
}

/** Hear the count every time it changes. Returns the way to stop. */
export function onCount(listener: CountListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function setCount(next: number): void {
  if (next === count) return;
  count = next;
  for (const listener of Array.from(listeners)) listener(count);
}

/** The parent in the rendered tree: the slot a node is assigned to, or the host of its root. */
function parentOf(element: Element): Element | null {
  if (element.assignedSlot) return element.assignedSlot;
  if (element.parentElement) return element.parentElement;
  const root = element.getRootNode();
  return root instanceof ShadowRoot ? root.host : null;
}

/** Does a box on the way up clip or scroll sideways? Then the overflow stays inside it. */
export function clipped(element: Element): boolean {
  const root = document.documentElement;
  const rootStyle = getComputedStyle(root);
  // The root's overflow is the viewport's, and so is the body's while the
  // root's is visible. The page scrolls by it, unless it hides or clips.
  const viewport =
    rootStyle.overflowX === "visible" && rootStyle.overflowY === "visible" ? document.body : root;
  for (let node = parentOf(element); node; node = parentOf(node)) {
    const overflow = getComputedStyle(node).overflowX;
    if (node === root || node === viewport) {
      if (overflow === "hidden" || overflow === "clip") return true;
      continue;
    }
    // `visible` next to anything else computes to `auto`, so this is every
    // box that clips, hides or scrolls its overflow along x.
    if (overflow !== "visible") return true;
  }
  return false;
}

/**
 * Only the box that starts the overflow counts: its children that just fill
 * it stick out by the same amount and add nothing. A parent with no box of its
 * own (`display: contents`) is passed over.
 */
function startsIt(element: Element, rect: DOMRect, right: boolean, left: boolean): boolean {
  for (let node = parentOf(element); node; node = parentOf(node)) {
    const outer = node.getBoundingClientRect();
    if (outer.width === 0 && outer.height === 0) continue;
    return (right && rect.right > outer.right + SLACK) || (left && rect.left < outer.left - SLACK);
  }
  return true;
}

/** Every box that sticks out of the viewport sideways with nothing on the way up to clip it. */
function find(): Offender[] {
  const width = document.documentElement.clientWidth;
  const offenders: Offender[] = [];
  walk((element) => {
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;
    // In page coordinates, so a page scrolled sideways reads the same.
    const right = rect.right + window.scrollX > width + SLACK;
    const left = rect.left + window.scrollX < -SLACK;
    if (!right && !left) return;
    if (!startsIt(element, rect, right, left) || clipped(element)) return;
    offenders.push({ element, rect });
  });
  return offenders;
}

/** Name the offenders in the console, once each, so they can be hovered and inspected. */
function log(offenders: Offender[], excess: number): void {
  const width = document.documentElement.clientWidth;
  if (offenders.length === 0) {
    if (excess > 0 && !loggedUnfound) {
      loggedUnfound = true;
      console.warn(
        `devknobs: the page scrolls ${excess}px past the ${width}px viewport, ` +
          "but no element box sticks out. a pseudo-element or a margin, maybe",
      );
    }
    return;
  }
  if (offenders.every(({ element }) => logged.has(element))) return;
  for (const { element } of offenders) logged.add(element);
  console.warn(warning(offenders.length, width, excess), offenders.map(({ element }) => element));
}

/** What the console says about `count` boxes sticking out of a viewport `width` wide. */
export function warning(count: number, width: number, excess: number): string {
  const boxes = count === 1 ? "1 element sticks" : `${count} elements stick`;
  return `devknobs: ${boxes} out of the ${width}px viewport, the page scrolls ${excess}px sideways`;
}

function draw(offenders: Offender[]): void {
  if (!layer) return;
  const style = document.createElement("style");
  style.textContent = CSS;
  const marks = offenders.map(({ rect }) => {
    const mark = document.createElement("div");
    mark.className = "mark";
    mark.style.cssText = `left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px`;
    return mark;
  });
  layer.replaceChildren(style, ...marks);
}

function update(): void {
  if (!host) return;
  const root = document.documentElement;
  const offenders = find();
  draw(offenders);
  log(offenders, Math.max(0, root.scrollWidth - root.clientWidth));
  setCount(offenders.length);
}

function schedule(): void {
  if (frame || !host) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    update();
  });
}

/** The page changed. Look again, but not more often than the throttle allows. */
function onMutation(records: MutationRecord[]): void {
  if (timer || records.every((record) => isOwn(record.target))) return;
  timer = window.setTimeout(() => {
    timer = 0;
    schedule();
  }, MUTATION_THROTTLE);
}

function start(): void {
  if (host || !document.body) return;
  host = document.createElement("div");
  host.setAttribute("data-devknobs", "overflow");
  host.style.cssText = `position:fixed;inset:0;overflow:hidden;pointer-events:none;z-index:${Z_INDEX}`;
  layer = host.attachShadow({ mode: "open" });
  document.body.append(host);
  window.addEventListener("resize", schedule);
  // Capture hears every scroller on the page, not only the window.
  window.addEventListener("scroll", schedule, true);
  observer = new MutationObserver(onMutation);
  observer.observe(document.documentElement, {
    attributes: true,
    characterData: true,
    childList: true,
    subtree: true,
  });
  update();
}

export function apply(value: boolean): void {
  if (!value) {
    reset();
    return;
  }
  if (document.body) start();
  else document.addEventListener("DOMContentLoaded", start, { once: true });
}

export function reset(): void {
  document.removeEventListener("DOMContentLoaded", start);
  if (!host) return;
  window.removeEventListener("resize", schedule);
  window.removeEventListener("scroll", schedule, true);
  observer?.disconnect();
  observer = null;
  if (frame) {
    cancelAnimationFrame(frame);
    frame = 0;
  }
  clearTimeout(timer);
  timer = 0;
  host.remove();
  host = null;
  layer = null;
  logged = new WeakSet();
  loggedUnfound = false;
  setCount(0);
}
