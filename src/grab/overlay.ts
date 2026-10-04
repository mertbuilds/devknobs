import { baseMatchMedia } from "../engine/matchmedia";
import { createThemeReader, GRAB_COLORS, invertTheme } from "./theme";

/** Over everything, the panel too. It never takes a pointer. */
const Z_INDEX = 2147483647;

/** How long the toast stays, in ms. */
export const TOAST_TIME = 1200;

/** Space between a box and its label or toast, in px. */
const GAP = 4;

/** Space the label keeps from the window's edge, in px. */
const MARGIN = 8;

/** The least a box's corners round, in px. */
const MIN_RADIUS = 2;

// adapted from react-grab (MIT, Copyright (c) 2025 Aiden Bai)
/** How much of the way to its target the box goes in one frame at 60 a second. */
export const LERP = 0.3;
/** One frame at 60 a second, in ms. */
const FRAME = 1000 / 60;
/** Nearer its target than this, in px, the box is there. */
const SNAP = 0.5;
/** How long the box and the label take to fade, in ms. */
const FADE = 125;
/** How long the box waits on its element once nothing is under the pointer, in ms. */
const HIDE_WAIT = 100;
/** How often the bounds are read again, to catch the page's layout moving, in ms. */
const SYNC_EVERY = 100;

/**
 * One color for the boxes and the glow, wider where the screen shows P3: a
 * blue, and a green where the page is blue. The label goes by the page:
 * light on a dark one, dark on a light one.
 */
const CSS = `
.layer {
  all: initial;
  position: fixed;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  direction: ltr;
  --grab: ${GRAB_COLORS.blue.srgb};
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  font-size: 11px;
  font-weight: 400;
  line-height: 16px;
  -webkit-font-smoothing: antialiased;
}
.layer[data-grab="green"] { --grab: ${GRAB_COLORS.green.srgb}; }
@media (color-gamut: p3) {
  .layer { --grab: ${GRAB_COLORS.blue.p3}; }
  .layer[data-grab="green"] { --grab: ${GRAB_COLORS.green.p3}; }
}
.glow {
  position: absolute;
  inset: 0;
  opacity: 0;
  box-shadow: inset 0 0 50px color-mix(in srgb, var(--grab) 15%, transparent);
  transition: opacity ${FADE}ms ease-out, box-shadow ${FADE}ms ease-out;
}
.glow.on { opacity: 1; }
.box {
  position: absolute;
  top: 0;
  left: 0;
  box-sizing: border-box;
  opacity: 0;
  border: 1px solid color-mix(in srgb, var(--grab) 50%, transparent);
  border-radius: ${MIN_RADIUS}px;
  background: color-mix(in srgb, var(--grab) 8%, transparent);
  transition:
    opacity ${FADE}ms ease-out,
    border-color ${FADE}ms ease-out,
    background-color ${FADE}ms ease-out,
    box-shadow ${FADE}ms ease-out;
}
.box.on { opacity: 1; }
.box.copied {
  border-color: color-mix(in srgb, var(--grab) 90%, transparent);
  box-shadow:
    0 0 0 3px color-mix(in srgb, var(--grab) 25%, transparent),
    0 0 24px color-mix(in srgb, var(--grab) 45%, transparent);
}
.box.pick {
  opacity: 1;
  border-color: color-mix(in srgb, var(--grab) 30%, transparent);
  background: color-mix(in srgb, var(--grab) 5%, transparent);
  transition: border-color ${FADE}ms ease-out, background-color ${FADE}ms ease-out;
}
.pill {
  position: absolute;
  top: 0;
  left: 0;
  display: flex;
  gap: 6px;
  max-width: calc(100% - ${2 * MARGIN}px);
  box-sizing: border-box;
  padding: 3px 7px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  opacity: 0;
  color: #ffffff;
  background: #161616;
  border-radius: 6px;
  box-shadow: 0 0 0 1px rgb(255 255 255 / 12%), 0 2px 8px rgb(0 0 0 / 24%);
  transition: opacity ${FADE}ms ease-out;
}
.pill.on { opacity: 1; }
.tag { color: #a7a7a7; }
.pill[data-bar="light"] {
  color: #171717;
  background: #ffffff;
  box-shadow: 0 0 0 1px rgb(0 0 0 / 10%), 0 2px 8px rgb(0 0 0 / 32%);
}
.pill[data-bar="light"] .tag { color: #737373; }
.layer [hidden] { display: none; }
.layer[data-still] * { transition: none; }
`;

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), Math.max(low, high));
}

// adapted from react-grab (MIT, Copyright (c) 2025 Aiden Bai)
/**
 * One frame of some numbers on their way to their targets, `elapsed` ms after
 * the last. The same share of what is left goes each 60th of a second,
 * whatever the frame rate. With reduced motion they are there at once.
 */
export function tweenStep(
  from: readonly number[],
  to: readonly number[],
  elapsed: number,
  reduce: boolean,
): { values: number[]; done: boolean } {
  const share = reduce ? 1 : 1 - (1 - LERP) ** (Math.max(elapsed, 1) / FRAME);
  const values = to.map((end, index) => {
    const start = from[index] ?? end;
    return start + (end - start) * share;
  });
  const done = values.every((value, index) => Math.abs((to[index] ?? value) - value) < SNAP);
  return done ? { values: [...to], done } : { values, done };
}

/**
 * Where the label goes by a box: under it, over it where there is no room,
 * kept in the window. Sideways it is centered on the pointer, as far as the
 * pointer is over the box, or on the box when the keys moved it.
 */
export function labelPlace(
  box: { top: number; bottom: number; left: number; right: number },
  pill: { width: number; height: number },
  view: { width: number; height: number },
  pointerX: number | null,
): { x: number; y: number } {
  const anchor =
    pointerX === null ? (box.left + box.right) / 2 : clamp(pointerX, box.left, box.right);
  const x = clamp(anchor - pill.width / 2, MARGIN, view.width - pill.width - MARGIN);
  let y = box.bottom + GAP;
  if (y + pill.height > view.height - MARGIN) y = box.top - pill.height - GAP;
  y = clamp(y, MARGIN, view.height - pill.height - MARGIN);
  return { x, y };
}

/** The first px length of a computed `border-radius`, or 0 where it has none. */
export function parseRadius(value: string): number {
  const match = /(\d*\.?\d+)px/.exec(value);
  return match ? Number(match[1]) : 0;
}

/** The radius a box takes from its element: at most half its short side, at least the least. */
export function boxRadius(radius: number, width: number, height: number): number {
  return Math.max(MIN_RADIUS, Math.min(radius, Math.min(width, height) / 2));
}

export interface Overlay {
  /**
   * Box the current element, with its label, and every gathered one lighter.
   * The box goes over to a new element on the frames after, and waits a
   * moment on the last one when there is none.
   */
  draw(
    current: Element | null,
    label: { tag: string; name: string | null },
    picked: Element[],
  ): void;
  /** Where the pointer is sideways, for the label. Null once the keys move the box. */
  point(x: number | null): void;
  /**
   * Say something by an element for a moment, where its label was, with the
   * box on it and glowing. The glow goes with the toast.
   */
  toast(text: string, near: Element | null): void;
  /** Fade out and go, once a toast is over where there is one. */
  destroy(): void;
}

/** A box as the tween takes it: x, y, width, height and radius. */
type Shape = [number, number, number, number, number];

function place(node: HTMLElement, [x, y, width, height, radius]: readonly number[]): void {
  node.style.transform = `translate(${x}px, ${y}px)`;
  node.style.width = `${width}px`;
  node.style.height = `${height}px`;
  node.style.borderRadius = `${radius}px`;
}

/** The layer grab draws on, in a shadow root of its own on this document. */
export function createOverlay(): Overlay {
  const host = document.createElement("div");
  host.setAttribute("data-devknobs", "grab");
  host.style.cssText = `position:fixed;inset:0;pointer-events:none;z-index:${Z_INDEX}`;
  const root = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = CSS;
  const layer = document.createElement("div");
  layer.className = "layer";
  const glow = document.createElement("div");
  glow.className = "glow";
  const box = document.createElement("div");
  box.className = "box";
  const label = document.createElement("div");
  label.className = "pill";
  const tag = document.createElement("span");
  tag.className = "tag";
  const name = document.createElement("span");
  label.append(tag, name);
  const picks: HTMLElement[] = [];
  layer.append(glow, box, label);
  root.append(style, layer);
  (document.body ?? document.documentElement).append(host);

  /** The real setting, under the motion knob: the layer is devknobs' own. */
  const reduce = baseMatchMedia("(prefers-reduced-motion: reduce)");
  const radii = new WeakMap<Element, number>();
  const read = createThemeReader();
  /** The element the box is on, or on its way to. */
  let element: Element | null = null;
  /** The element the target was last read from. */
  let measured: Element | null = null;
  let picked: Element[] = [];
  let at: readonly number[] | null = null;
  let target: Shape | null = null;
  let labelAt: readonly number[] | null = null;
  let shown = false;
  /** The bounds are to be read again on the next frame. */
  let stale = false;
  let pointerX: number | null = null;
  let text: { tag: string; name: string | null } = { tag: "", name: null };
  /** The text the label's size was read for. */
  let sized: string | null = null;
  let size = { width: 0, height: 0 };
  let toasting = false;
  let closing = false;
  let removed = false;
  let frame = 0;
  let last = 0;
  let hideTimer = 0;
  let toastTimer = 0;
  let fadeTimer = 0;

  function fade(): number {
    return reduce.matches ? 0 : FADE;
  }

  function still(): void {
    layer.toggleAttribute("data-still", reduce.matches);
  }

  function schedule(): void {
    if (!frame && !removed) frame = window.requestAnimationFrame(draw);
  }

  function sync(): void {
    if (!element && picked.length === 0) return;
    stale = true;
    schedule();
  }

  function radiusOf(of: Element): number {
    let radius = radii.get(of);
    if (radius === undefined) {
      radius = parseRadius(getComputedStyle(of).borderRadius);
      radii.set(of, radius);
    }
    return radius;
  }

  function shapeOf(of: Element): Shape {
    const rect = of.getBoundingClientRect();
    const radius = boxRadius(radiusOf(of), rect.width, rect.height);
    return [rect.left, rect.top, rect.width, rect.height, radius];
  }

  function drawPicks(): void {
    while (picks.length < picked.length) {
      const node = document.createElement("div");
      node.className = "box pick";
      layer.insertBefore(node, box);
      picks.push(node);
    }
    picks.forEach((node, index) => {
      const pick = picked[index];
      node.hidden = !pick?.isConnected;
      if (pick && !node.hidden) place(node, shapeOf(pick));
    });
  }

  /**
   * Read the bounds. A new element is glided to, and one that moved takes the
   * box and the label with it.
   */
  function measure(): void {
    if (element && !element.isConnected) element = null;
    drawPicks();
    if (element || toasting) {
      const { theme, grab } = read(element);
      label.dataset.bar = invertTheme(theme);
      layer.dataset.grab = grab;
    }
    if (!element) {
      measured = null;
      target = null;
      return;
    }
    const next = shapeOf(element);
    if (!shown || !at || !target) {
      at = next;
      labelAt = null;
    } else if (measured === element) {
      const from = target;
      at = at.map((value, index) => value + (next[index] ?? 0) - (from[index] ?? 0));
      if (labelAt) {
        labelAt = [(labelAt[0] ?? 0) + next[0] - from[0], (labelAt[1] ?? 0) + next[1] - from[1]];
      }
    }
    target = next;
    measured = element;
  }

  function writeLabel(): void {
    const key = `${text.tag}\n${text.name ?? ""}`;
    if (key === sized) return;
    tag.textContent = text.tag;
    tag.hidden = !text.tag;
    name.textContent = text.name ?? "";
    name.hidden = !text.name;
    size = { width: label.offsetWidth, height: label.offsetHeight };
    sized = key;
  }

  function draw(now: number): void {
    frame = 0;
    if (removed) return;
    if (stale) {
      stale = false;
      measure();
    }
    const view = {
      width: document.documentElement.clientWidth,
      height: document.documentElement.clientHeight,
    };
    shown = at !== null && target !== null;
    box.classList.toggle("on", shown);
    label.classList.toggle("on", shown || toasting);
    if (!at || !target) {
      last = 0;
      labelAt = null;
      if (!toasting) return;
      writeLabel();
      const x = Math.round((view.width - size.width) / 2);
      label.style.transform = `translate(${x}px, ${MARGIN * 2}px)`;
      return;
    }
    const elapsed = last ? now - last : FRAME;
    const step = tweenStep(at, target, elapsed, reduce.matches);
    at = step.values;
    place(box, at);
    writeLabel();
    const spot = labelPlace(
      {
        top: target[1],
        bottom: target[1] + target[3],
        left: target[0],
        right: target[0] + target[2],
      },
      size,
      view,
      pointerX,
    );
    const goal = [Math.round(spot.x), Math.round(spot.y)];
    const move = tweenStep(labelAt ?? goal, goal, elapsed, reduce.matches);
    labelAt = move.values;
    label.style.transform = `translate(${labelAt[0]}px, ${labelAt[1]}px)`;
    const done = step.done && move.done;
    last = done ? 0 : now;
    if (!done) schedule();
  }

  /** Take the box and the label out of sight. The layer stays for the next element. */
  function hide(): void {
    hideTimer = 0;
    element = null;
    box.classList.remove("on");
    label.classList.remove("on");
    stale = true;
    schedule();
  }

  function remove(): void {
    if (removed) return;
    removed = true;
    clearTimeout(hideTimer);
    clearTimeout(toastTimer);
    clearTimeout(fadeTimer);
    clearInterval(ticker);
    if (frame) window.cancelAnimationFrame(frame);
    window.removeEventListener("scroll", sync, true);
    window.removeEventListener("resize", sync);
    reduce.removeEventListener("change", still);
    host.remove();
  }

  still();
  reduce.addEventListener("change", still);
  window.addEventListener("scroll", sync, { capture: true, passive: true });
  window.addEventListener("resize", sync);
  const ticker = window.setInterval(sync, SYNC_EVERY);
  // The styles are worked out once with the glow off, so that it fades in.
  void getComputedStyle(glow).opacity;
  glow.classList.add("on");

  return {
    draw(current, next, gathered) {
      if (closing) return;
      picked = gathered;
      if (current) {
        clearTimeout(hideTimer);
        hideTimer = 0;
        element = current;
        text = next;
      } else if (element && !hideTimer) {
        hideTimer = window.setTimeout(hide, HIDE_WAIT);
      }
      stale = true;
      schedule();
    },
    point(x) {
      if (closing || x === pointerX) return;
      pointerX = x;
      if (element) schedule();
    },
    toast(message, near) {
      if (removed) return;
      clearTimeout(hideTimer);
      clearTimeout(toastTimer);
      clearTimeout(fadeTimer);
      hideTimer = 0;
      toasting = true;
      box.classList.add("copied");
      element = near?.isConnected ? near : null;
      text = { tag: "", name: message };
      stale = true;
      schedule();
      toastTimer = window.setTimeout(() => {
        toasting = false;
        hide();
        // On the way out the glow fades with the box, and goes with the layer.
        if (!closing) box.classList.remove("copied");
        if (closing) fadeTimer = window.setTimeout(remove, fade());
      }, TOAST_TIME);
    },
    destroy() {
      if (closing) return;
      closing = true;
      clearTimeout(hideTimer);
      glow.classList.remove("on");
      picked = [];
      drawPicks();
      if (toasting) return;
      hide();
      fadeTimer = window.setTimeout(remove, fade());
    },
  };
}
