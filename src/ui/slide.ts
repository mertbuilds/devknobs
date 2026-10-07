/**
 * The panel's two views, the rows and the settings, and the slide between
 * them. The settings push in from the right and push the rows out to the
 * left, and going back pops them off the same way, as a navigation does on
 * iOS. The view that leaves is out of sight by the time it lands. It goes left to right on either side of the
 * window: the order is that of the views, not of the dock.
 *
 * The stylesheet holds the motion. Each view rests where the view shown puts
 * it, and a view that comes in starts from where it rests while it is away.
 * A slide that is turned round on its way goes back from where it is, as
 * the transitions take their new ends from there. What is left here is the
 * height: the view that leaves is taken out of the flow at the height it
 * had, the one that comes in is held at its own, and the body eases from the
 * one to the other, while the panel lays itself out again each frame. It
 * all lands once the view coming in is in place, or a while after it should
 * have been, where the page held the frames up.
 */

/** The rows view, the search and its results with it, or the settings. */
export type View = "home" | "keys";

/** How long a slide takes, in ms, as the stylesheet sets it. */
export const SLIDE = 500;

/** How long past its time a slide lands without its end, in ms. */
const SLIDE_LATE = 500;

/**
 * How a change of view shows: none for the same view, at once where the
 * panel is closed or nothing animates, else a push into the settings or a
 * pop back out of them.
 */
export function slideOf(
  from: View,
  to: View,
  open: boolean,
  motion: boolean,
): "push" | "pop" | "swap" | null {
  if (from === to) return null;
  if (!open || !motion) return "swap";
  return to === "keys" ? "push" : "pop";
}

/**
 * What has the focus once the panel goes to a view from the settings toggle,
 * the back button or escape: the back button in the settings, the toggle on
 * the way back.
 */
export function focusOn(to: View): "back" | "toggle" {
  return to === "keys" ? "back" : "toggle";
}

export interface Slide {
  /**
   * Show a view, with `apply` making the change of view in the page. It
   * slides there while `open`, else lands at once, a slide on its way
   * included.
   */
  show(view: View, open: boolean, apply: () => void): void;
  /** Land at once and stop listening. */
  destroy(): void;
}

/** Slide the panes of a body between the views. */
export function createSlide(body: HTMLElement, panes: Record<View, HTMLElement>): Slide {
  let shown: View = "home";
  let timer = 0;

  /** Put the body and the panes back as they are at rest. */
  function land(): void {
    clearTimeout(timer);
    timer = 0;
    delete body.dataset.slide;
    body.style.height = "";
    for (const pane of Object.values(panes)) {
      pane.classList.remove("leaving");
      pane.style.height = "";
      pane.inert = false;
    }
  }

  /**
   * Whether the panes animate: the stylesheet times them only while the body
   * slides, and times nothing under reduced motion, where a slide would only
   * leave both views up for its length.
   */
  function moves(pane: HTMLElement): boolean {
    body.dataset.slide = "";
    return !getComputedStyle(pane).transitionDuration.split(",").every(isZero);
  }

  function show(view: View, open: boolean, apply: () => void): void {
    const from = shown;
    const step = slideOf(from, view, open, open && view !== from && moves(panes[view]));
    shown = view;
    if (step === null) {
      apply();
      return;
    }
    if (step === "swap") {
      land();
      apply();
      return;
    }
    const leaving = panes[from];
    const coming = panes[view];
    clearTimeout(timer);
    const now = body.getBoundingClientRect().height;
    const away = leaving.getBoundingClientRect().height;
    coming.classList.remove("leaving");
    coming.style.height = "";
    coming.inert = false;
    leaving.classList.add("leaving");
    leaving.style.height = `${away}px`;
    apply();
    // The height the view coming in takes at rest, with the body free to fit it.
    body.style.transition = "none";
    body.style.height = "";
    const next = coming.getBoundingClientRect().height;
    coming.style.height = `${next}px`;
    body.style.height = `${now}px`;
    // Read the layout, so the body eases from where it is.
    body.getBoundingClientRect();
    body.style.transition = "";
    body.style.height = `${next}px`;
    leaving.inert = true;
    timer = window.setTimeout(land, SLIDE + SLIDE_LATE);
  }

  /** The view coming in is in place. A slide turned round cancels, and does not end. */
  function onEnd(event: TransitionEvent): void {
    if (timer && event.target === panes[shown] && event.propertyName === "transform") land();
  }

  body.addEventListener("transitionend", onEnd);

  return {
    show,
    destroy(): void {
      land();
      body.removeEventListener("transitionend", onEnd);
    },
  };
}

function isZero(duration: string): boolean {
  return parseFloat(duration) === 0;
}
