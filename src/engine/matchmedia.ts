/**
 * The one patch over `window.matchMedia` that the knobs share. Text size takes
 * em and rem to px, and the prefers knobs track the lists they hand out, each
 * as a layer. The layers run in a fixed order, whichever came in first, and
 * the browser's own `matchMedia` goes back when the last one leaves, whichever
 * that is.
 */

type MatchMedia = (query: string) => MediaQueryList;

/** One step of the patch. It gets the query and the rest of the chain below it. */
export type Layer = (query: string, next: MatchMedia) => MediaQueryList;

/**
 * Outermost first. Text size goes before the prefers knobs, so the query they
 * track and evaluate is the one the browser matches, in px.
 */
const ORDER = ["text", "media"] as const;

export type LayerName = (typeof ORDER)[number];

const layers = new Map<LayerName, Layer>();
/** `window.matchMedia` as it was before the patch went on. */
let base: MatchMedia | null = null;
let patch: MatchMedia | null = null;

function run(at: number, query: string, below: MatchMedia): MediaQueryList {
  for (let i = at; i < ORDER.length; i++) {
    const layer = layers.get(ORDER[i]);
    if (layer) return layer(query, (next) => run(i + 1, next, below));
  }
  return below.call(window, query);
}

/** Match a query under every layer, as `matchMedia` did before the patch. */
export function baseMatchMedia(query: string): MediaQueryList {
  return (base ?? window.matchMedia).call(window, query);
}

/** Put a layer in. The patch goes on with the first one. */
export function addLayer(name: LayerName, layer: Layer): void {
  layers.set(name, layer);
  if (patch) return;
  const below = window.matchMedia;
  const own: MatchMedia = function matchMedia(query: string): MediaQueryList {
    const text = String(query);
    // Once off, a patch the page wrapped over passes queries straight through.
    return patch === own ? run(0, text, below) : below.call(window, text);
  };
  base = below;
  patch = own;
  window.matchMedia = own;
}

/** Take a layer out. The last one out puts `matchMedia` back. */
export function removeLayer(name: LayerName): void {
  layers.delete(name);
  if (layers.size > 0 || !patch) return;
  // Wrapped over since: the patch stays under that wrapper and passes queries through.
  if (window.matchMedia === patch && base) window.matchMedia = base;
  patch = null;
  base = null;
}
