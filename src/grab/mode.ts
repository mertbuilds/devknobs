import { ensureStyle, removeStyle } from "../engine/style";
import { pause } from "../engine/touchpointer";
import { copyGrab } from "./clipboard";
import { componentOf, grabEntry, joinEntries, quickEntry } from "./context";
import { DWELL, settles, speedOf } from "./dwell";
import { grabTargetAt, isDevknobs } from "./hit";
import { isCLike } from "./keys";
import { createNavigator, stepOf } from "./navigate";
import { createOverlay, HIDE_WAIT } from "./overlay";
import { copiedText, flushPicks, togglePick } from "./picks";
import type { GrabEntry } from "./types";

/** How long the pointer rests on an element before its context is worked out, in ms. */
const PREPARE = 80;

// adapted from react-grab (MIT, Copyright (c) 2025 Aiden Bai)
/** The least time between two hit tests as the pointer moves, in ms. */
const HIT_EVERY = 32;

/** Pointer and mouse events that would reach the page's own handlers. */
const BLOCKED = [
  "pointerdown",
  "mousedown",
  "pointerup",
  "mouseup",
  "click",
  "dblclick",
  "auxclick",
  "pointerover",
  "pointerout",
  "mouseover",
  "mouseout",
] as const;

export interface ModeOptions {
  /** Where the pointer was last, so the element under it shows straight away. */
  pointer?: { x: number; y: number } | null;
  /** The scheme the layer takes, where the page's own cannot be trusted. */
  scheme?: "light" | "dark";
  /** The grab key's own key, whatever modifiers are down. */
  heldKey: (event: KeyboardEvent) => boolean;
  /** Grab ended from inside: a copy, or escape. */
  onExit(): void;
}

export interface Mode {
  /** Keys come through the control, ahead of the panel's, so escape stops here. */
  keydown(event: KeyboardEvent): void;
  /** End grab without a word to anyone. */
  stop(): void;
}

/** What the mode reads of the page and writes to it, so a test can stand in for each. */
export interface ModePage {
  componentOf: typeof componentOf;
  copyGrab: typeof copyGrab;
  createOverlay: typeof createOverlay;
  grabEntry: typeof grabEntry;
  grabTargetAt: typeof grabTargetAt;
  quickEntry: typeof quickEntry;
}

const PAGE: ModePage = {
  componentOf,
  copyGrab,
  createOverlay,
  grabEntry,
  grabTargetAt,
  quickEntry,
};

function fromDevknobs(event: Event): boolean {
  const target = event.composedPath()[0];
  return target instanceof Element && isDevknobs(target);
}

function isTyping(event: Event): boolean {
  const target = event.composedPath()[0];
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
}

/**
 * Grab, on: the element under the pointer gets a box and a label, a click
 * copies it, shift and a click gather more, and the arrows walk the tree.
 * The context of the element under the pointer is worked out while it rests
 * there, so a click can copy it whole in the click itself, as Safari wants.
 * The box goes to an element once the pointer settles on it, and not to those
 * it only passes over.
 */
export function startMode(options: ModeOptions, page: ModePage = PAGE): Mode {
  const overlay = page.createOverlay();
  const navigator = createNavigator();
  const ready = new WeakMap<Element, GrabEntry>();
  const warming = new WeakSet<Element>();
  const labels = new WeakMap<Element, string | null>();
  let current: Element | null = null;
  /** What the last hit test found, the box on it or not yet, and since when. */
  let candidate: Element | null = null;
  let since = 0;
  /** When the box last lost its element. It stays up a moment after. */
  let leftAt = Number.NEGATIVE_INFINITY;
  let picked: Element[] = [];
  let prepareTimer = 0;
  let point: { x: number; y: number } | null = null;
  /** Where the pointer was at the last hit test. */
  let hitPoint: { x: number; y: number } | null = null;
  let hitAt = 0;
  let hitTimer = 0;
  let settleTimer = 0;
  let stopped = false;

  ensureStyle("grab-cursor").textContent = "*:not([data-devknobs]){cursor:crosshair!important}";
  // The touch pointer gives the mouse back while grab picks.
  pause(true);

  function warm(element: Element): void {
    if (ready.has(element) || warming.has(element)) return;
    warming.add(element);
    void page.grabEntry(element)
      .then((entry) => ready.set(element, entry))
      .catch(() => undefined)
      .finally(() => warming.delete(element));
  }

  function labelOf(element: Element): { tag: string; name: string | null } {
    let name = labels.get(element);
    if (name === undefined) {
      name = page.componentOf(element);
      labels.set(element, name);
    }
    return { tag: element.tagName.toLowerCase(), name };
  }

  /** Hand the overlay what to box. It reads the bounds and draws on its own frames. */
  function draw(): void {
    if (stopped) return;
    if (current && !current.isConnected) current = null;
    picked = picked.filter((element) => element.isConnected);
    overlay.draw(current, current ? labelOf(current) : { tag: "", name: null }, picked);
  }

  function select(element: Element | null): void {
    if (element === current) return;
    current = element;
    if (!element) leftAt = performance.now();
    clearTimeout(prepareTimer);
    if (element) prepareTimer = window.setTimeout(() => warm(element), PREPARE);
    draw();
  }

  /**
   * Copy now, in the event that asked. What is not worked out yet goes as
   * the quick entry, and is worked out after for the next copy. The
   * clipboard is never written again outside a gesture.
   */
  function copy(elements: Element[]): void {
    if (elements.length === 0) return;
    const entries = elements.map((element) => ready.get(element) ?? page.quickEntry(element));
    const anchor = elements[elements.length - 1] ?? null;
    overlay.toast(copiedText(elements.length), anchor, true);
    void page.copyGrab({ content: joinEntries(entries), entries }).then((copied) => {
      if (!copied) overlay.toast("Copy failed", anchor, false);
    });
    for (const element of elements) warm(element);
    exit();
  }

  /** No hit test is to come: the keys moved the box, or grab is over. */
  function drop(): void {
    clearTimeout(hitTimer);
    clearTimeout(settleTimer);
    hitTimer = 0;
    settleTimer = 0;
  }

  /**
   * Test what is under the pointer, and box it once the pointer has settled
   * on it. Until then the test runs again by itself, as a pointer that came
   * to rest sends no more moves. With nothing under the pointer the box is let
   * go at once, and stays up a moment on its own. `now` is for a click or a
   * key, which take what is under the pointer and not what the box was on.
   */
  function hit(now = false): void {
    drop();
    if (!point) return;
    const at = performance.now();
    const target = page.grabTargetAt(document, point.x, point.y);
    const speed = speedOf(hitPoint ?? point, point, at - hitAt);
    hitAt = at;
    hitPoint = point;
    if (target !== candidate) {
      candidate = target;
      since = at;
    }
    if (target === current) return;
    const held = at - since;
    const boxed = current !== null || at - leftAt < HIDE_WAIT;
    if (now || !target || settles({ boxed, held, speed })) {
      navigator.clear();
      select(target);
      return;
    }
    settleTimer = window.setTimeout(() => hit(), Math.min(HIT_EVERY, DWELL - held));
  }

  /** A hit test still to come is run now, so a click or a key acts on its element. */
  function resolve(at = point): void {
    if (!hitTimer && !settleTimer) return;
    point = at;
    hit(true);
  }

  /** The hit test runs at most once in a while, and once more where the pointer came to rest. */
  function onPointerMove(event: PointerEvent): void {
    if (!event.isPrimary) return;
    point = { x: event.clientX, y: event.clientY };
    overlay.point(point.x);
    const wait = HIT_EVERY - (performance.now() - hitAt);
    if (wait <= 0) {
      hit();
    } else if (!hitTimer) {
      hitTimer = window.setTimeout(() => hit(), wait);
    }
  }

  function onBlocked(event: Event): void {
    if (fromDevknobs(event)) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.type !== "click" || !(event instanceof MouseEvent)) return;
    resolve({ x: event.clientX, y: event.clientY });
    const target =
      page.grabTargetAt(document, event.clientX, event.clientY) ??
      (current?.isConnected ? current : null);
    if (!target) return;
    if (event.shiftKey) {
      picked = togglePick(picked, target);
      warm(target);
      draw();
      return;
    }
    copy(flushPicks(picked, target));
  }

  function keydown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopImmediatePropagation();
      exit();
      return;
    }
    const step = stepOf(event);
    if (step) {
      if (isTyping(event) || event.metaKey || event.ctrlKey || event.altKey) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const next = current?.isConnected ? navigator.next(step, current) : null;
      if (next) {
        drop();
        overlay.point(null);
        select(next);
      }
      return;
    }
    if (event.repeat) {
      // The grab key, still held from turning grab on, its modifiers let go or not.
      if (options.heldKey(event)) event.preventDefault();
      return;
    }
    if (event.key !== "Enter" && !isCLike(event.key, event.code)) return;
    resolve();
    const elements = flushPicks(picked, current);
    if (elements.length === 0) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    copy(elements);
  }

  function onKeyup(event: KeyboardEvent): void {
    if (event.key === "Shift" && picked.length > 0) copy(picked);
  }

  for (const type of BLOCKED) window.addEventListener(type, onBlocked, true);
  window.addEventListener("pointermove", onPointerMove, true);
  window.addEventListener("keyup", onKeyup, true);

  function stop(): void {
    if (stopped) return;
    stopped = true;
    clearTimeout(prepareTimer);
    drop();
    for (const type of BLOCKED) window.removeEventListener(type, onBlocked, true);
    window.removeEventListener("pointermove", onPointerMove, true);
    window.removeEventListener("keyup", onKeyup, true);
    removeStyle("grab-cursor");
    pause(false);
    overlay.destroy();
  }

  function exit(): void {
    stop();
    options.onExit();
  }

  if (options.pointer) {
    point = options.pointer;
    overlay.point(point.x);
    hit();
  }

  return { keydown, stop };
}
