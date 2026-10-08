import { between } from "./place";

/**
 * The tooltip the panel's icon-only controls share: where it goes, and when
 * it shows and hides. One shows at a time.
 */

/** How long the pointer rests on a control before its tooltip shows, in ms. */
export const TIP_DELAY = 400;

/** Space between a tooltip and its control, and between a tooltip and the window's edge, in px. */
export const TIP_GAP = 6;
export const TIP_MARGIN = 8;

/**
 * Where a tooltip goes, in window px: centered over its control, under it
 * where there is no room above, and kept inside the window either way.
 */
export function tipAt(
  control: { left: number; top: number; width: number; bottom: number },
  tip: { width: number; height: number },
  view: { width: number; height: number },
): { x: number; y: number } {
  const x = between(
    control.left + (control.width - tip.width) / 2,
    TIP_MARGIN,
    view.width - TIP_MARGIN - tip.width,
  );
  const above = control.top - TIP_GAP - tip.height;
  const y =
    above >= TIP_MARGIN
      ? above
      : between(control.bottom + TIP_GAP, TIP_MARGIN, view.height - TIP_MARGIN - tip.height);
  return { x, y };
}

/** The shared tooltip, and the controls it shows for. */
export interface Tips {
  /** Show the tooltip over a control now, red with `hot`. */
  show(node: HTMLElement, text: string, hot?: boolean): void;
  /** Hide the tooltip, and say whether one showed. */
  hide(): boolean;
  /** Hide the tooltip once a while has passed, in ms. */
  hideAfter(delay: number): void;
  /** Whether the tooltip shows, or is about to, for a control. */
  isFor(node: HTMLElement): boolean;
  /** Give an icon-only control a tooltip. */
  tooltip(node: HTMLElement, text: string): void;
  destroy(): void;
}

/** Drive the tooltip node `tip`, placed in `wrap`. */
export function createTips(tip: HTMLElement, wrap: HTMLElement): Tips {
  /** The control whose tooltip shows, or is about to once the pointer rests. */
  let tipFor: HTMLElement | null = null;
  let tipTimer = 0;

  function showTip(node: HTMLElement, text: string, hot = false): void {
    clearTimeout(tipTimer);
    tipFor = node;
    tip.textContent = text;
    tip.classList.toggle("hot", hot);
    const place = tipAt(
      node.getBoundingClientRect(),
      { width: tip.offsetWidth, height: tip.offsetHeight },
      { width: window.innerWidth, height: window.innerHeight },
    );
    // The wrapper is translated, so it is what the tooltip is placed in.
    const box = wrap.getBoundingClientRect();
    tip.style.left = `${place.x - box.left}px`;
    tip.style.top = `${place.y - box.top}px`;
    tip.classList.add("on");
  }

  /** Hide the tooltip, and say whether one showed. */
  function hideTip(): boolean {
    clearTimeout(tipTimer);
    const shown = tip.classList.contains("on");
    tip.classList.remove("on");
    tipFor = null;
    return shown;
  }

  /**
   * Give an icon-only control a tooltip: after a rest of the pointer, or at
   * once when the keys bring the focus to it. A press, leaving or escape
   * hides it, and a pressed control keeps it hidden until the pointer leaves.
   */
  function tooltip(node: HTMLElement, text: string): void {
    let pressed = false;
    node.addEventListener("pointerenter", () => {
      if (pressed || tipFor === node) return;
      clearTimeout(tipTimer);
      tipFor = node;
      tipTimer = window.setTimeout(() => showTip(node, text), TIP_DELAY);
    });
    node.addEventListener("pointerleave", () => {
      pressed = false;
      if (tipFor === node && !node.matches(":focus-visible")) hideTip();
    });
    node.addEventListener("pointerdown", () => {
      pressed = true;
      hideTip();
    });
    node.addEventListener("focus", () => {
      if (node.matches(":focus-visible")) showTip(node, text);
    });
    node.addEventListener("blur", () => {
      if (tipFor === node) hideTip();
    });
  }

  return {
    show: showTip,
    hide: hideTip,
    hideAfter(delay: number): void {
      tipTimer = window.setTimeout(hideTip, delay);
    },
    isFor: (node) => tipFor === node,
    tooltip,
    destroy(): void {
      clearTimeout(tipTimer);
    },
  };
}
