import type { BoxRing } from "./boxmodel";
import { type BoxOverlay, createOverlay } from "./overlay";

/**
 * The quiet box on the element the styles pane shows: grab's gathered box,
 * on a layer of its own with no glow, so it stays while no mode is on, over
 * the tints of the element's margin, border, padding and content. It follows
 * its element as the page scrolls and lays out, as grab's boxes do.
 */
export interface Outline {
  /** Box an element, or with null take the box off. */
  show(element: Element | null): void;
  /** Tint one area of the box alone, or with null all four again. */
  area(ring: BoxRing | null): void;
  destroy(): void;
}

const NO_LABEL = { tag: "", name: null };

export function createOutline(
  make: (quiet: boolean, model: boolean) => BoxOverlay = createOverlay,
): Outline {
  let overlay: BoxOverlay | null = null;

  function show(element: Element | null): void {
    if (!element) {
      overlay?.destroy();
      overlay = null;
      return;
    }
    overlay ??= make(true, true);
    overlay.draw(null, NO_LABEL, [element]);
  }

  return { show, area: (ring) => overlay?.area(ring), destroy: () => show(null) };
}
