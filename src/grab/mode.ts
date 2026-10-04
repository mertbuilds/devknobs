import { ensureStyle, removeStyle } from "../engine/style";
import { copyGrab } from "./clipboard";
import { componentOf, grabEntry, joinEntries, quickEntry } from "./context";
import { grabTargetAt, isDevknobs } from "./hit";
import { isCLike } from "./keys";
import { createNavigator, stepOf } from "./navigate";
import { createOverlay } from "./overlay";
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
  /** Grab ended from inside: a copy, or escape. */
  onExit(): void;
}

export interface Mode {
  /** Keys come through the control, ahead of the panel's, so escape stops here. */
  keydown(event: KeyboardEvent): void;
  /** End grab without a word to anyone. */
  stop(): void;
}

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
 */
export function startMode(options: ModeOptions): Mode {
  const overlay = createOverlay();
  const navigator = createNavigator();
  const ready = new WeakMap<Element, GrabEntry>();
  const warming = new WeakSet<Element>();
  const labels = new WeakMap<Element, string | null>();
  let current: Element | null = null;
  let picked: Element[] = [];
  let prepareTimer = 0;
  let point: { x: number; y: number } | null = null;
  let hitAt = 0;
  let hitTimer = 0;
  let stopped = false;

  ensureStyle("grab-cursor").textContent = "*:not([data-devknobs]){cursor:crosshair!important}";

  function warm(element: Element): void {
    if (ready.has(element) || warming.has(element)) return;
    warming.add(element);
    void grabEntry(element)
      .then((entry) => ready.set(element, entry))
      .catch(() => undefined)
      .finally(() => warming.delete(element));
  }

  function labelOf(element: Element): { tag: string; name: string | null } {
    let name = labels.get(element);
    if (name === undefined) {
      name = componentOf(element);
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
    const entries = elements.map((element) => ready.get(element) ?? quickEntry(element));
    const anchor = elements[elements.length - 1] ?? null;
    overlay.toast(copiedText(elements.length), anchor);
    void copyGrab({ content: joinEntries(entries), entries }).then((copied) => {
      if (!copied) overlay.toast("copy failed", anchor);
    });
    for (const element of elements) warm(element);
    exit();
  }

  function hit(): void {
    hitTimer = 0;
    if (!point) return;
    hitAt = performance.now();
    const target = grabTargetAt(document, point.x, point.y);
    if (target !== current) navigator.clear();
    select(target);
  }

  /** The hit test runs at most once in a while, and once more where the pointer came to rest. */
  function onPointerMove(event: PointerEvent): void {
    if (!event.isPrimary) return;
    point = { x: event.clientX, y: event.clientY };
    overlay.point(point.x);
    const wait = HIT_EVERY - (performance.now() - hitAt);
    if (wait <= 0) {
      clearTimeout(hitTimer);
      hit();
    } else if (!hitTimer) {
      hitTimer = window.setTimeout(hit, wait);
    }
  }

  function onBlocked(event: Event): void {
    if (fromDevknobs(event)) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.type !== "click" || !(event instanceof MouseEvent)) return;
    const target =
      grabTargetAt(document, event.clientX, event.clientY) ??
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
        overlay.point(null);
        select(next);
      }
      return;
    }
    if (event.repeat) {
      // The grab key, still held from turning grab on.
      if (isCLike(event.key, event.code)) event.preventDefault();
      return;
    }
    if (event.key !== "Enter" && !isCLike(event.key, event.code)) return;
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
    clearTimeout(hitTimer);
    for (const type of BLOCKED) window.removeEventListener(type, onBlocked, true);
    window.removeEventListener("pointermove", onPointerMove, true);
    window.removeEventListener("keyup", onKeyup, true);
    removeStyle("grab-cursor");
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
