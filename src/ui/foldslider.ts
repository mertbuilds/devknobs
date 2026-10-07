import * as engine from "../engine";
import { deviceOf } from "../engine/devices";
import { openOf } from "../engine/fold";
import { foldRest, letGo, moveHinge, takeHinge, watchFold } from "../engine/foldhand";
import type { DevknobsState, PostureValue } from "../types";
import { icon } from "./icons";

/**
 * A slider that folds a foldable open and shut by hand, as the one on Apple's
 * iPhone Duo page does. Experimental: it may go again. The thumb follows the
 * pointer and the hinge follows the thumb through its spring, so it lags a
 * little. Let go, the hinge springs to the nearest stop, shut, the landing a
 * third of the way open, or open, and the knobs take the posture only at an
 * end. Left at the landing, the device stays half open till the knobs change
 * or the window does, and lands as the knobs have it.
 */

/** Where the hinge stops once let go: shut, the landing, and open. */
export const FOLD_STOPS = [0, 0.333, 1] as const;

/** How near shut or open a hand puts the hinge all the way there, as Apple's magnets do. */
export const FOLD_MAGNET = 0.08;

/** The thumb's width and how far it sits inside the track, in px, as the stylesheet sets them. */
const THUMB = 28;
const INSET = 2;

/** The stop nearest to `at`. */
export function nearestStop(at: number): number {
  return FOLD_STOPS.reduce((best, stop) => (Math.abs(stop - at) < Math.abs(best - at) ? stop : best));
}

/** Where a hand at `at` of the track moves the hinge to: there, but all the way shut or open near either. */
export function heldTarget(at: number): number {
  const on = Math.min(Math.max(at, 0), 1);
  if (on <= FOLD_MAGNET) return 0;
  if (on >= 1 - FOLD_MAGNET) return 1;
  return on;
}

/** The next stop past `at` toward open, `way` 1, or toward shut, -1, or the end it is at. */
export function stepStop(at: number, way: 1 | -1): number {
  const past = FOLD_STOPS.filter((stop) => (way === 1 ? stop > at : stop < at));
  return (way === 1 ? past[0] : past[past.length - 1]) ?? (way === 1 ? 1 : 0);
}

/**
 * Where a key sends the hinge from `at`: left and down a stop toward shut,
 * right and up a stop toward open, home and end all the way. Null for any
 * other key.
 */
export function keyStop(key: string, at: number): number | null {
  if (key === "ArrowLeft" || key === "ArrowDown") return stepStop(at, -1);
  if (key === "ArrowRight" || key === "ArrowUp") return stepStop(at, 1);
  if (key === "Home") return 0;
  if (key === "End") return 1;
  return null;
}

/** The posture the knobs take once the hinge is let go at `stop`, where it changes from `posture`, else null. */
export function postureCommit(stop: number, posture: PostureValue): PostureValue | null {
  const at = stop === 1 ? "open" : stop === 0 ? "closed" : null;
  return at === posture ? null : at;
}

/** How far open the slider says the hinge is, 0 to 100. */
export function valueNow(at: number): number {
  return Math.round(Math.min(Math.max(at, 0), 1) * 100);
}

/** How the slider says it in words. */
export function valueText(at: number): string {
  if (at <= 0) return "closed";
  return at >= 1 ? "open" : "half open";
}

export interface FoldSlider {
  node: HTMLElement;
  update(state: DevknobsState): void;
}

/** The slider, which hands a posture let go at an end to `commit`. */
export function createFoldSlider(commit: (posture: PostureValue) => void): FoldSlider {
  const node = document.createElement("div");
  node.className = "fold-slider";
  node.tabIndex = 0;
  node.setAttribute("role", "slider");
  node.setAttribute("aria-label", "fold");
  node.setAttribute("aria-orientation", "horizontal");
  node.setAttribute("aria-valuemin", "0");
  node.setAttribute("aria-valuemax", "100");
  const tick = document.createElement("div");
  tick.className = "fold-tick";
  const thumb = document.createElement("div");
  thumb.className = "fold-thumb";
  thumb.append(icon("chevrons-left-right", 14));
  node.append(tick, thumb);
  /** How far along the thumb is, 0 to 1. */
  let at = 0;
  /** The pointer dragging the thumb, and where on the thumb it took it. */
  let pointer: number | null = null;
  let grip = THUMB / 2;

  function show(): void {
    node.style.setProperty("--at", String(Math.min(Math.max(at, 0), 1)));
    node.setAttribute("aria-valuenow", String(valueNow(at)));
    node.setAttribute("aria-valuetext", valueText(at));
  }

  /** Where the hinge is, by the knobs, unless a hand left it between the ends. */
  function settled(): void {
    at = foldRest() ?? openOf(engine.getState().posture);
    show();
  }

  function along(event: PointerEvent): number {
    const box = node.getBoundingClientRect();
    const room = box.width - THUMB - 2 * INSET;
    return room > 0 ? (event.clientX - box.left - INSET - grip) / room : 0;
  }

  function end(event: PointerEvent): void {
    if (pointer !== event.pointerId) return;
    pointer = null;
    node.classList.remove("held");
    if (node.hasPointerCapture(event.pointerId)) node.releasePointerCapture(event.pointerId);
  }

  node.addEventListener("pointerdown", (event: PointerEvent) => {
    if (event.button !== 0 || pointer !== null || !takeHinge(engine.getState())) return;
    event.preventDefault();
    node.focus();
    pointer = event.pointerId;
    node.setPointerCapture(event.pointerId);
    node.classList.add("held");
    // Taken by the thumb, it stays where it was under the pointer; anywhere else on the track, its middle goes there.
    const box = thumb.getBoundingClientRect();
    const onThumb = event.clientX >= box.left && event.clientX <= box.right;
    grip = onThumb ? event.clientX - box.left : THUMB / 2;
    at = Math.min(Math.max(along(event), 0), 1);
    moveHinge(heldTarget(at));
    show();
  });
  node.addEventListener("pointermove", (event: PointerEvent) => {
    if (pointer !== event.pointerId) return;
    at = Math.min(Math.max(along(event), 0), 1);
    // The fold ended under the hand, as a turn or another device took over.
    if (!moveHinge(heldTarget(at))) {
      end(event);
      settled();
      return;
    }
    show();
  });
  node.addEventListener("pointerup", (event: PointerEvent) => {
    if (pointer !== event.pointerId) return;
    end(event);
    const stop = nearestStop(heldTarget(at));
    if (!letGo(stop)) {
      settled();
      return;
    }
    at = stop;
    show();
    const posture = postureCommit(stop, engine.getState().posture);
    if (posture) commit(posture);
  });
  // Taken away from the slider, the hinge goes back to the posture the knobs hold.
  const cancel = (event: PointerEvent) => {
    if (pointer !== event.pointerId) return;
    end(event);
    letGo(openOf(engine.getState().posture));
    settled();
  };
  node.addEventListener("pointercancel", cancel);
  node.addEventListener("lostpointercapture", cancel);
  node.addEventListener("keydown", (event: KeyboardEvent) => {
    if (event.altKey || event.ctrlKey || event.metaKey || pointer !== null) return;
    const stop = keyStop(event.key, at);
    if (stop === null) return;
    event.preventDefault();
    const state = engine.getState();
    const posture = postureCommit(stop, state.posture);
    if (stop === 0 || stop === 1) {
      if (foldRest() !== null) letGo(stop);
    } else if (!takeHinge(state) || !letGo(stop)) return;
    at = stop;
    show();
    if (posture) commit(posture);
  });
  // The slider goes with the panel, and stops listening once it is off the page.
  const unwatch = watchFold(() => {
    if (!node.isConnected) unwatch();
    else if (pointer === null) settled();
  });
  show();
  return {
    node,
    update(state) {
      node.hidden = !deviceOf(state.device)?.postures;
      if (pointer === null) settled();
    },
  };
}
