import { composedParent, isDevknobs } from "../grab/hit";
import { ensureStyle, removeStyle } from "./style";
import { DOT_LOOK, MARK_EVENT, type Mark } from "./touchmark";

/**
 * The mouse as a finger, the way the device toolbar in chrome devtools has it:
 * a round touch cursor, touch events and `pointerType: "touch"` from the
 * mouse, no hover, a drag that scrolls and flings, and a press that stays put
 * as a tap. It runs in the page the device lives in, the frame's copy while
 * the frame is up. A press on devknobs itself, a range slider, editable text,
 * a scrollbar or with a button other than the main one is left to the
 * browser, its moves and `pointerType` with it, until the button is up, and
 * grab pauses it while it picks. The cursor goes up to the page above the
 * frame, which draws it over the browser's bars too, and is drawn here only
 * where no page above takes it.
 */

/** How far a press moves before it is a drag and no longer a tap, in css px. */
export const SLOP = 10;

/** How far back the release looks to measure the fling, in ms. */
const VELOCITY_WINDOW = 100;

/** How fast a fling slows: its speed falls by e every this many ms. */
const DECAY = 325;

/** The least speed a release flings at, and the speed a fling stops at, in px per ms. */
const MIN_FLING = 0.1;
const STOP_FLING = 0.02;

/** What a fingertip reports for its contact, in css px. */
const CONTACT = 11.5;

/** Pointer and mouse events of a pointer that moves over the page without a press. */
const HOVER = new Set([
  "pointermove",
  "pointerover",
  "pointerout",
  "pointerenter",
  "pointerleave",
  "mousemove",
  "mouseover",
  "mouseout",
  "mouseenter",
  "mouseleave",
]);

/** A finger never moves over or out of anything. */
const CROSSING = new Set([
  "pointerover",
  "pointerout",
  "pointerenter",
  "pointerleave",
  "mouseover",
  "mouseout",
  "mouseenter",
  "mouseleave",
]);

/** The mouse events a touch screen makes after a tap, in its order, for pages that only read those. */
const COMPAT = new Set(["mousemove", "mousedown", "mouseup"]);

/** Every event listened for, on the window in capture. */
const EVENTS = [
  ...HOVER,
  "pointerdown",
  "pointerup",
  "pointercancel",
  "mousedown",
  "mouseup",
  "click",
  "dragstart",
  "selectstart",
] as const;

/** The cursor's own backdrop stays out too, whatever the page gives every backdrop. */
const CURSOR_CSS =
  '*:not([data-devknobs]){cursor:none!important}:where([data-devknobs]){cursor:auto}[data-devknobs="touch-pointer"]::backdrop{display:none!important}';

const DRAG_CSS = "*{-webkit-user-select:none!important;user-select:none!important}";

/**
 * The host is a popover where the browser has them, so it sits in the top
 * layer, over the page's modal dialogs, popovers and fullscreen element. It
 * takes no room, no pointer and none of the look a popover comes with,
 * whatever the page gives its own popovers, and nothing on it makes it the
 * containing block of the dot.
 */
const DOT_CSS = `
:host {
  all: initial !important;
  display: block !important;
  position: fixed !important;
  left: 0 !important;
  top: 0 !important;
  width: 0 !important;
  height: 0 !important;
  pointer-events: none !important;
  z-index: 2147483647 !important;
}
.dot {
  position: fixed;
  z-index: 2147483647;
}
${DOT_LOOK}`;

/** Which ways a `touch-action` lets a finger pan. */
export interface Pan {
  x: boolean;
  y: boolean;
}

export function panOf(touchAction: string): Pan {
  const words = touchAction.trim().toLowerCase().split(/\s+/);
  if (words.includes("none")) return { x: false, y: false };
  if (words[0] === "" || words.includes("auto") || words.includes("manipulation")) {
    return { x: true, y: true };
  }
  return {
    x: words.some((word) => word === "pan-x" || word === "pan-left" || word === "pan-right"),
    y: words.some((word) => word === "pan-y" || word === "pan-up" || word === "pan-down"),
  };
}

/** An element on the way up from the pressed one, as the pick of a scroller sees it. */
export interface ScrollNode {
  touchAction: string;
  /** Room to scroll its content each way. */
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
}

/** The scroller a drag moves, by its place on the way up, and the axes it scrolls on. */
export interface ScrollPick {
  index: number;
  x: boolean;
  y: boolean;
}

/**
 * The nearest element, from the pressed one up, that a drag can scroll the
 * way `move` goes (the content's way, against the finger's), through the
 * `touch-action` of every element on the way. An axis counts where the move
 * goes along it at least half as far as along the other. Null where the drag
 * scrolls nothing.
 */
export function pickScroller(
  chain: readonly ScrollNode[],
  move: { x: number; y: number },
): ScrollPick | null {
  const most = Math.max(Math.abs(move.x), Math.abs(move.y));
  if (most === 0) return null;
  const alongX = Math.abs(move.x) * 2 >= most;
  const alongY = Math.abs(move.y) * 2 >= most;
  let pan: Pan = { x: true, y: true };
  for (const [index, node] of chain.entries()) {
    const own = panOf(node.touchAction);
    pan = { x: pan.x && own.x, y: pan.y && own.y };
    if (!pan.x && !pan.y) return null;
    const x = pan.x && (node.left || node.right);
    const y = pan.y && (node.up || node.down);
    const goesX = x && alongX && (move.x < 0 ? node.left : node.right);
    const goesY = y && alongY && (move.y < 0 ? node.up : node.down);
    if (goesX || goesY) return { index, x, y };
  }
  return null;
}

/** Has a press moved far enough from where it went down to be a drag? */
export function passedSlop(dx: number, dy: number, slop = SLOP): boolean {
  return Math.hypot(dx, dy) > slop;
}

/** Where the finger was, and when, in ms. */
export interface Sample {
  t: number;
  x: number;
  y: number;
}

/**
 * The finger's speed at `now` in px per ms, over its last 100 ms. A finger
 * that rested before it let go has none.
 */
export function velocityOf(samples: readonly Sample[], now: number): { x: number; y: number } {
  const last = samples[samples.length - 1];
  if (!last || now - last.t > VELOCITY_WINDOW) return { x: 0, y: 0 };
  const first = samples.find((sample) => sample.t >= last.t - VELOCITY_WINDOW) ?? last;
  const dt = last.t - first.t;
  if (dt <= 0) return { x: 0, y: 0 };
  return { x: (last.x - first.x) / dt, y: (last.y - first.y) / dt };
}

/** Is a release fast enough to fling? */
export function flings(velocity: { x: number; y: number }): boolean {
  return Math.hypot(velocity.x, velocity.y) >= MIN_FLING;
}

/**
 * One step of a fling: how far it goes in `dt` ms at a speed that decays
 * exponentially, the speed after, and whether it has as good as stopped.
 */
export function inertiaStep(
  velocity: { x: number; y: number },
  dt: number,
): { move: { x: number; y: number }; velocity: { x: number; y: number }; done: boolean } {
  const factor = Math.exp(-dt / DECAY);
  const span = DECAY * (1 - factor);
  const next = { x: velocity.x * factor, y: velocity.y * factor };
  return {
    move: { x: velocity.x * span, y: velocity.y * span },
    velocity: next,
    done: Math.hypot(next.x, next.y) < STOP_FLING,
  };
}

/**
 * Does a `toggle` or `beforetoggle` event tell of something that joins the
 * top layer, where the last to come in paints over the rest? A popover or a
 * dialog that opens does. The cursor's own host and a `details` do not.
 */
export function raises(change: { newState: unknown; tag: string; own: boolean }): boolean {
  return !change.own && change.newState === "open" && change.tag.toLowerCase() !== "details";
}

/** Did a change of an `open` attribute open a dialog? For browsers whose dialogs send no `toggle`. */
export function dialogOpened(change: {
  tag: string;
  was: string | null;
  open: boolean;
}): boolean {
  return change.tag.toLowerCase() === "dialog" && change.was === null && change.open;
}

/**
 * The first thing on an event's path, from the target out, that is in the top
 * layer. The path goes through shadow roots, where no `toggle` comes out of.
 */
export function topLayerOf<T>(
  path: readonly unknown[],
  inTopLayer: (node: unknown) => node is T,
): T | null {
  return path.find(inTopLayer) ?? null;
}

/** A scroller a drag or a fling moves, with its scroll snapping held off until it stops. */
interface Scroller {
  element: Element;
  x: boolean;
  y: boolean;
  snap: string;
  snapPriority: string;
}

interface Gesture {
  id: number;
  pointerId: number;
  target: Element;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  samples: Sample[];
  /** Past the slop: a drag, and no longer a tap. */
  dragged: boolean;
  /** A touch listener called `preventDefault`, so the page handles the gesture. */
  claimed: boolean;
  /** A touch listener stopped the mouse events that follow a tap. */
  quiet: boolean;
  /** Undefined until the drag decides, null where it scrolls nothing. */
  scroller: Scroller | null | undefined;
  /** The pointer is up, and its mouse events and click are still to come. */
  ended: boolean;
}

let active = false;
let paused = false;
/** A press left to the browser is down, or just up with its click still to come. */
let native = false;
let nativeTimer = 0;
/** The cursor as it is now, whoever draws it. */
let mark: Mark = { at: null, pressed: false, held: false };
/** The cursor's own host and dot here, only while no page above draws it. */
let host: HTMLElement | null = null;
let dot: HTMLElement | null = null;
/** Sees a dialog open where the browser sends no `toggle` for it. */
let dialogs: MutationObserver | null = null;
/** What the pointer is over in the top layer, as of its last way in, move or press. */
let over: Element | null = null;
let gesture: Gesture | null = null;
let nextId = 1;
let finishTimer = 0;
let fling: { scroller: Scroller; velocity: { x: number; y: number }; at: number } | null = null;
let flingFrame = 0;

function touchable(): boolean {
  return typeof Touch === "function" && typeof TouchEvent === "function";
}

function rawPointer(event: Event): event is PointerEvent {
  return (
    event.isTrusted &&
    typeof PointerEvent === "function" &&
    event instanceof PointerEvent &&
    event.pointerType === "mouse"
  );
}

function fromDevknobs(event: Event): boolean {
  const target = event.composedPath()[0];
  return target instanceof Element && isDevknobs(target);
}

/** A range slider or editable text: the browser's own mouse handling stays. */
function isNative(element: Element): boolean {
  if (element instanceof HTMLElement && element.isContentEditable) return true;
  return element instanceof HTMLInputElement && element.type === "range";
}

/** A press on an element's own scrollbar, which the browser drags. */
function onScrollbar(element: Element, event: MouseEvent): boolean {
  if (element.clientWidth === 0 && element.clientHeight === 0) return false;
  return event.offsetX > element.clientWidth || event.offsetY > element.clientHeight;
}

/**
 * Hand the cursor to the page above the frame, at once, as an event on the
 * frame's own element. True where that page takes it, and so draws it.
 */
function handUp(next: Mark): boolean {
  try {
    const owner = window.frameElement;
    if (!owner || typeof CustomEvent !== "function") return false;
    return !owner.dispatchEvent(new CustomEvent(MARK_EVENT, { detail: next, cancelable: true }));
  } catch {
    // A page above on another origin: its frame element is out of reach.
    return false;
  }
}

/** Show the cursor as the mark has it: in the page above where it takes it, else here. */
function render(): void {
  if (!active || paused) return;
  if (handUp(mark)) {
    if (host) unmountDot();
    return;
  }
  mountDot();
  if (!dot) return;
  dot.hidden = mark.at === null;
  if (mark.at) dot.style.transform = `translate(${mark.at.x}px, ${mark.at.y}px)`;
  dot.classList.toggle("pressed", mark.pressed);
}

function showDot(event: MouseEvent): void {
  mark = { ...mark, at: { x: event.clientX, y: event.clientY } };
  render();
}

function hideDot(): void {
  mark = { ...mark, at: null };
  render();
}

function pressDot(pressed: boolean): void {
  mark = { ...mark, pressed };
  render();
}

/** Can the cursor go in the top layer? Without popovers it stays a plain layer. */
function layered(): boolean {
  return typeof HTMLElement.prototype.showPopover === "function";
}

/**
 * Put the cursor last in the top layer, so it paints over all of it. The top
 * layer keeps the order things came in, so the host goes out and in again. A
 * manual popover closes no other popover and no light dismiss closes it.
 */
function raise(): void {
  if (!host) return;
  try {
    if (host.matches(":popover-open")) host.hidePopover();
    host.showPopover();
  } catch {
    // Not in the page, or the browser would not show it: the cursor stays a plain layer.
  }
}

/** How an element tells it is in the top layer: an open popover, a modal dialog, the fullscreen element. */
const TOP_LAYER = [":popover-open", ":modal", ":fullscreen"];

function inTopLayer(node: unknown): node is Element {
  if (!(node instanceof Element)) return false;
  for (let index = 0; index < TOP_LAYER.length; index++) {
    try {
      if (node.matches(TOP_LAYER[index] ?? "")) return true;
    } catch {
      // A browser from before this selector has nothing of its kind in the top layer.
    }
  }
  return false;
}

/**
 * Go over what the pointer is on in the top layer, where it is not what it
 * was on before. This sees a dialog or a popover in a shadow root, whose
 * `toggle` and `open` attribute the watch on the page does not. It runs on
 * each way in, move and press, so the first move after such an opening puts
 * the cursor back on top. A cursor that does not move at all stays under a
 * dialog in a shadow root that the keyboard opened, until it moves.
 */
function raiseOver(event: Event): void {
  if (!host || !layered()) return;
  const found = topLayerOf(event.composedPath(), inTopLayer);
  if (found === over) return;
  over = found;
  if (found) raise();
}

function onToggle(event: Event): void {
  const target = event.composedPath()[0];
  const own = target === host;
  // The page hears nothing of the cursor's own way in and out.
  if (own) event.stopImmediatePropagation();
  if (!(target instanceof Element)) return;
  const newState = "newState" in event ? event.newState : undefined;
  if (!raises({ newState, tag: target.tagName, own })) return;
  // `beforetoggle` comes before the top layer has the newcomer, `toggle` a task after.
  if (event.type === "beforetoggle") queueMicrotask(raise);
  else raise();
}

function onFullscreen(): void {
  if (document.fullscreenElement) raise();
}

function onDialogs(records: MutationRecord[]): void {
  const opened = records.some(
    (record) =>
      record.target instanceof Element &&
      dialogOpened({
        tag: record.target.tagName,
        was: record.oldValue,
        open: record.target.hasAttribute("open"),
      }),
  );
  if (opened) raise();
}

/** Keep the cursor over whatever joins the top layer after it. */
function watchTopLayer(): void {
  window.addEventListener("beforetoggle", onToggle, true);
  window.addEventListener("toggle", onToggle, true);
  window.addEventListener("fullscreenchange", onFullscreen, true);
  if (typeof MutationObserver !== "function") return;
  dialogs = new MutationObserver(onDialogs);
  dialogs.observe(document.documentElement, {
    subtree: true,
    attributes: true,
    attributeFilter: ["open"],
    attributeOldValue: true,
  });
}

function unwatchTopLayer(): void {
  window.removeEventListener("beforetoggle", onToggle, true);
  window.removeEventListener("toggle", onToggle, true);
  window.removeEventListener("fullscreenchange", onFullscreen, true);
  dialogs?.disconnect();
  dialogs = null;
}

function mountDot(): void {
  if (host) return;
  host = document.createElement("div");
  host.setAttribute("data-devknobs", "touch-pointer");
  const root = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = DOT_CSS;
  dot = document.createElement("div");
  dot.className = "dot";
  dot.hidden = true;
  root.append(style, dot);
  document.documentElement.append(host);
  if (!layered()) return;
  host.setAttribute("popover", "manual");
  watchTopLayer();
  raise();
}

function unmountDot(): void {
  unwatchTopLayer();
  host?.remove();
  host = null;
  dot = null;
  over = null;
}

/** Send a touch event to the gesture's target. True where a listener called `preventDefault`. */
function sendTouch(
  type: "touchstart" | "touchmove" | "touchend" | "touchcancel",
  current: Gesture,
  event: MouseEvent,
  cancelable: boolean,
): boolean {
  if (!touchable()) return false;
  let touchEvent: TouchEvent;
  try {
    const touch = new Touch({
      identifier: current.id,
      target: current.target,
      clientX: event.clientX,
      clientY: event.clientY,
      screenX: event.screenX,
      screenY: event.screenY,
      pageX: event.pageX,
      pageY: event.pageY,
      radiusX: CONTACT,
      radiusY: CONTACT,
      force: 1,
    });
    const lifted = type === "touchend" || type === "touchcancel";
    const touches = lifted ? [] : [touch];
    touchEvent = new TouchEvent(type, {
      touches,
      targetTouches: touches,
      changedTouches: [touch],
      bubbles: true,
      cancelable,
      composed: true,
      view: window,
      altKey: event.altKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      shiftKey: event.shiftKey,
    });
  } catch {
    return false;
  }
  current.target.dispatchEvent(touchEvent);
  return touchEvent.defaultPrevented;
}

/**
 * The mouse events a touch screen sends once a tap is up, after `touchend`.
 * The browser's own ones are held back while the gesture is under way.
 */
function sendCompatMouse(current: Gesture, event: MouseEvent): void {
  for (const type of COMPAT) {
    current.target.dispatchEvent(
      new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        view: window,
        detail: type === "mousemove" ? 0 : 1,
        button: 0,
        buttons: type === "mousedown" ? 1 : 0,
        clientX: event.clientX,
        clientY: event.clientY,
        screenX: event.screenX,
        screenY: event.screenY,
        altKey: event.altKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
      }),
    );
  }
}

/** A scroll begins: the page's pointer stream for this finger ends, as on a touch screen. */
function sendPointerCancel(current: Gesture, event: PointerEvent): void {
  current.target.dispatchEvent(
    new PointerEvent("pointercancel", {
      pointerId: current.pointerId,
      pointerType: "touch",
      isPrimary: true,
      bubbles: true,
      composed: true,
      clientX: event.clientX,
      clientY: event.clientY,
      screenX: event.screenX,
      screenY: event.screenY,
    }),
  );
}

function scrolls(overflow: string): boolean {
  return overflow === "auto" || overflow === "scroll" || overflow === "overlay";
}

function shut(overflow: string): boolean {
  return overflow === "hidden" || overflow === "clip";
}

/**
 * The viewport's overflow: the root's, or the body's where the root leaves it
 * visible and the browser hands the body's to the viewport.
 */
function viewportOverflow(style: CSSStyleDeclaration): { x: string; y: string } {
  const body = document.body;
  if (style.overflowX !== "visible" || style.overflowY !== "visible" || !body) {
    return { x: style.overflowX, y: style.overflowY };
  }
  const own = getComputedStyle(body);
  return { x: own.overflowX, y: own.overflowY };
}

function nodeOf(element: Element): ScrollNode {
  const style = getComputedStyle(element);
  let canX = scrolls(style.overflowX);
  let canY = scrolls(style.overflowY);
  if (element === document.scrollingElement) {
    const overflow = viewportOverflow(getComputedStyle(document.documentElement));
    canX = !shut(overflow.x);
    canY = !shut(overflow.y);
  }
  const maxX = element.scrollWidth - element.clientWidth;
  const maxY = element.scrollHeight - element.clientHeight;
  // Right to left, scrollLeft runs from 0 down to minus the room.
  const rtl = style.direction === "rtl";
  const leftEnd = rtl ? -maxX : 0;
  const rightEnd = rtl ? 0 : maxX;
  const x = canX && maxX > 0;
  const y = canY && maxY > 0;
  return {
    touchAction: style.touchAction,
    left: x && element.scrollLeft > leftEnd + 0.5,
    right: x && element.scrollLeft < rightEnd - 0.5,
    up: y && element.scrollTop > 0.5,
    down: y && element.scrollTop < maxY - 0.5,
  };
}

/** The elements from the pressed one up to the document's scroller. */
function chainOf(target: Element): Element[] {
  const chain: Element[] = [];
  for (let current: Element | null = target; current; current = composedParent(current)) {
    chain.push(current);
  }
  const root = document.scrollingElement;
  if (root && !chain.includes(root)) chain.push(root);
  return chain;
}

function holdSnap(element: Element, x: boolean, y: boolean): Scroller {
  const style =
    element instanceof HTMLElement || element instanceof SVGElement ? element.style : null;
  const scroller = {
    element,
    x,
    y,
    snap: style?.getPropertyValue("scroll-snap-type") ?? "",
    snapPriority: style?.getPropertyPriority("scroll-snap-type") ?? "",
  };
  // Snapping after every step of the drag would pull the content back each time.
  style?.setProperty("scroll-snap-type", "none", "important");
  return scroller;
}

function releaseSnap(scroller: Scroller): void {
  const element = scroller.element;
  if (!(element instanceof HTMLElement || element instanceof SVGElement)) return;
  const style = element.style;
  if (scroller.snap) style.setProperty("scroll-snap-type", scroller.snap, scroller.snapPriority);
  else style.removeProperty("scroll-snap-type");
}

/** Scroll by the finger's move: the content goes the other way. */
function scrollBy(scroller: Scroller, fingerX: number, fingerY: number): void {
  scroller.element.scrollBy({
    left: scroller.x ? -fingerX : 0,
    top: scroller.y ? -fingerY : 0,
    behavior: "instant",
  });
}

function stopFling(): void {
  cancelAnimationFrame(flingFrame);
  flingFrame = 0;
  if (fling) releaseSnap(fling.scroller);
  fling = null;
}

function flingStep(time: number): void {
  if (!fling) return;
  const { scroller } = fling;
  const step = inertiaStep(fling.velocity, Math.max(0, time - fling.at));
  const before = [scroller.element.scrollLeft, scroller.element.scrollTop];
  scrollBy(scroller, step.move.x, step.move.y);
  const moved =
    scroller.element.scrollLeft !== before[0] || scroller.element.scrollTop !== before[1];
  fling.velocity = step.velocity;
  fling.at = time;
  if (step.done || (!moved && (step.move.x !== 0 || step.move.y !== 0))) {
    stopFling();
    return;
  }
  flingFrame = requestAnimationFrame(flingStep);
}

function startFling(scroller: Scroller, velocity: { x: number; y: number }): void {
  stopFling();
  if (!flings(velocity)) {
    releaseSnap(scroller);
    return;
  }
  fling = { scroller, velocity, at: performance.now() };
  flingFrame = requestAnimationFrame(flingStep);
}

/** The gesture is over, its mouse events and click with it. */
function finish(): void {
  clearTimeout(finishTimer);
  finishTimer = 0;
  if (gesture?.dragged) removeStyle("touch-drag");
  if (gesture && !gesture.ended && gesture.scroller) releaseSnap(gesture.scroller);
  gesture = null;
}

/** Drop a gesture under way, telling the page its touch went away. */
function cancel(event: MouseEvent): void {
  if (gesture && !gesture.ended) sendTouch("touchcancel", gesture, event, false);
  finish();
}

function block(event: Event): void {
  event.stopPropagation();
}

function patchPointer(event: PointerEvent): void {
  Object.defineProperty(event, "pointerType", { configurable: true, get: () => "touch" });
  Object.defineProperty(event, "isPrimary", { configurable: true, get: () => true });
}

function onPointerDown(event: PointerEvent): void {
  stopFling();
  finish();
  clearTimeout(nativeTimer);
  const target = event.composedPath()[0];
  native =
    event.button !== 0 ||
    !(target instanceof Element) ||
    isNative(target) ||
    onScrollbar(target, event);
  if (native || !(target instanceof Element)) return;
  const current: Gesture = {
    id: nextId++,
    pointerId: event.pointerId,
    target,
    startX: event.clientX,
    startY: event.clientY,
    lastX: event.clientX,
    lastY: event.clientY,
    samples: [{ t: performance.now(), x: event.clientX, y: event.clientY }],
    dragged: false,
    claimed: false,
    quiet: false,
    scroller: undefined,
    ended: false,
  };
  gesture = current;
  if (sendTouch("touchstart", current, event, true)) {
    current.claimed = true;
    current.quiet = true;
  }
}

function onPointerMove(event: PointerEvent): void {
  const current = gesture;
  if (!current || current.ended || event.pointerId !== current.pointerId) return;
  const now = performance.now();
  const stepX = event.clientX - current.lastX;
  const stepY = event.clientY - current.lastY;
  current.lastX = event.clientX;
  current.lastY = event.clientY;
  current.samples.push({ t: now, x: event.clientX, y: event.clientY });
  while ((current.samples[0]?.t ?? now) < now - VELOCITY_WINDOW * 2) current.samples.shift();
  const dx = event.clientX - current.startX;
  const dy = event.clientY - current.startY;
  if (!current.dragged && passedSlop(dx, dy)) {
    current.dragged = true;
    ensureStyle("touch-drag").textContent = DRAG_CSS;
    const focused = document.activeElement;
    const editing =
      focused instanceof HTMLInputElement ||
      focused instanceof HTMLTextAreaElement ||
      (focused instanceof HTMLElement && focused.isContentEditable);
    if (!editing) window.getSelection()?.removeAllRanges();
  }
  // Once the content scrolls, the page can no longer stop it.
  if (sendTouch("touchmove", current, event, !current.scroller) && current.scroller === undefined) {
    current.claimed = true;
  }
  if (current.dragged && current.scroller === undefined) {
    const chain = chainOf(current.target);
    const pick = current.claimed ? null : pickScroller(chain.map(nodeOf), { x: -dx, y: -dy });
    const element = pick ? chain[pick.index] : undefined;
    current.scroller = pick && element ? holdSnap(element, pick.x, pick.y) : null;
    if (current.scroller) sendPointerCancel(current, event);
  }
  if (current.scroller) {
    scrollBy(current.scroller, stepX, stepY);
    block(event);
  }
}

function onPointerUp(event: PointerEvent): void {
  const current = gesture;
  if (!current || current.ended || event.pointerId !== current.pointerId) return;
  current.ended = true;
  if (sendTouch("touchend", current, event, !current.scroller)) current.quiet = true;
  if (current.scroller) {
    block(event);
    startFling(current.scroller, velocityOf(current.samples, performance.now()));
  }
  // The mouse events and the click come in the same task, so the gesture waits for them.
  finishTimer = window.setTimeout(finish, 0);
}

function onEvent(event: Event): void {
  if (paused) return;
  const type = event.type;
  const devknobs = fromDevknobs(event);
  if (rawPointer(event)) {
    if (devknobs) {
      hideDot();
      return;
    }
    if (type === "pointerout" && event.relatedTarget === null) hideDot();
    else if (type !== "pointerleave" && type !== "pointerout") showDot(event);
    if (type === "pointerover" || type === "pointermove" || type === "pointerdown") raiseOver(event);
    if (type === "pointerdown") pressDot(true);
    else if (type === "pointerup" || type === "pointercancel") pressDot(false);
    if (type === "pointerdown") onPointerDown(event);
    // The button went up where the page could not see it.
    else if (type === "pointermove" && event.buttons === 0) native = false;
    if (native) {
      // The click comes in the same task, and keeps the mouse's pointer type too.
      if (type === "pointerup" || type === "pointercancel") {
        nativeTimer = window.setTimeout(() => {
          native = false;
        }, 0);
      }
      return;
    }
    patchPointer(event);
    if (type === "pointermove") onPointerMove(event);
    else if (type === "pointerup") onPointerUp(event);
    else if (type === "pointercancel") cancel(event);
  }
  if (devknobs || !event.isTrusted || native) return;
  const current = gesture;
  if (type === "click") {
    if (current?.ended && (current.dragged || current.quiet)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      finish();
    }
    return;
  }
  if (type === "dragstart") {
    if (current && !current.ended) event.preventDefault();
    return;
  }
  if (type === "selectstart") {
    if (current?.dragged && !current.ended) event.preventDefault();
    return;
  }
  // A finger does not hover: nothing moves over the page without a press.
  if (CROSSING.has(type) || (HOVER.has(type) && (!current || current.ended))) {
    block(event);
    return;
  }
  // A touch screen sends its mouse events after the finger is up, and only for a tap.
  if (!COMPAT.has(type) || !current) return;
  block(event);
  // The browser's own mouseup follows pointerup, and none comes where the page prevented pointerdown.
  const tap = current.ended && !current.dragged && !current.quiet;
  if (type === "mouseup" && tap && event instanceof MouseEvent) sendCompatMouse(current, event);
}

function onBlur(): void {
  clearTimeout(nativeTimer);
  native = false;
  finish();
  hideDot();
  pressDot(false);
}

function install(): void {
  for (const type of EVENTS) window.addEventListener(type, onEvent, true);
  window.addEventListener("blur", onBlur);
  // The next page may have no devknobs to say the pointer left this one.
  window.addEventListener("pagehide", hideDot);
}

function uninstall(): void {
  for (const type of EVENTS) window.removeEventListener(type, onEvent, true);
  window.removeEventListener("blur", onBlur);
  window.removeEventListener("pagehide", hideDot);
}

function showCursor(): void {
  ensureStyle("touch-pointer").textContent = CURSOR_CSS;
  mark = { at: null, pressed: false, held: false };
  render();
}

/** The mouse is a mouse again, on the bars the page above draws too. */
function hideCursor(): void {
  removeStyle("touch-pointer");
  mark = { at: null, pressed: false, held: true };
  handUp(mark);
  unmountDot();
}

export function apply(on: boolean): void {
  if (on === active) return;
  active = on;
  if (on) {
    install();
    // Grab picks already: the page above hears that the mouse is a mouse.
    if (paused) handUp({ at: null, pressed: false, held: true });
    else showCursor();
    return;
  }
  uninstall();
  onBlur();
  stopFling();
  hideCursor();
}

export function reset(): void {
  apply(false);
}

/**
 * Hold the touch pointer while grab picks: the mouse is a mouse again, so
 * grab sees it hover, and no drag scrolls or touch goes out until it ends.
 */
export function pause(on: boolean): void {
  if (on === paused) return;
  paused = on;
  if (!active) return;
  if (on) {
    onBlur();
    stopFling();
    hideCursor();
  } else showCursor();
}
