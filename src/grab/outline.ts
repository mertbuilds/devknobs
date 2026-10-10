import { createOverlay, type Overlay } from "./overlay";

/**
 * The quiet box on the element the styles pane shows: grab's gathered box,
 * on a layer of its own with no glow, so it stays while no mode is on. It
 * follows its element as the page scrolls and lays out, as grab's boxes do.
 */
export interface Outline {
  /** Box an element, or with null take the box off. */
  show(element: Element | null): void;
  destroy(): void;
}

const NO_LABEL = { tag: "", name: null };

export function createOutline(make: (quiet: boolean) => Overlay = createOverlay): Outline {
  let overlay: Overlay | null = null;

  function show(element: Element | null): void {
    if (!element) {
      overlay?.destroy();
      overlay = null;
      return;
    }
    overlay ??= make(true);
    overlay.draw(null, NO_LABEL, [element]);
  }

  return { show, destroy: () => show(null) };
}
