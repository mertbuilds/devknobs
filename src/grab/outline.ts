import type { BoxRing } from "./boxmodel";
import { type BoxOverlay, createOverlay } from "./overlay";

/**
 * The quiet box on an element the styles pane points at, for as long as it
 * does: grab's gathered box, on a layer of its own with no glow and no mode
 * on, over the tints of the element's margin, border, padding and content. It
 * follows its element as the page scrolls and lays out, as grab's boxes do.
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
  /** The area to tint alone, kept for the layer the next box is drawn on. */
  let only: BoxRing | null = null;

  function show(element: Element | null): void {
    if (!element) {
      overlay?.destroy();
      overlay = null;
      return;
    }
    if (!overlay) {
      overlay = make(true, true);
      if (only) overlay.area(only);
    }
    overlay.draw(null, NO_LABEL, [element]);
  }

  function area(ring: BoxRing | null): void {
    only = ring;
    overlay?.area(ring);
  }

  return { show, area, destroy: () => show(null) };
}
