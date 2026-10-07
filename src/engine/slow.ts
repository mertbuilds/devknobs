/**
 * Temporary debugging aid, to remove before release: how many times slower
 * devknobs' own device moves run, from `localStorage["devknobs:slow"]`, so a
 * fold or a turn can be watched closely. Read as each move starts, so it can
 * change between moves. Anything but a number above 0 runs them as they are.
 */
export function slowness(): number {
  try {
    const factor = Number(window.localStorage.getItem("devknobs:slow"));
    return Number.isFinite(factor) && factor > 0 ? factor : 1;
  } catch {
    return 1;
  }
}

/** The time a move has been going, `ms`, as far as it has got run `factor` times slower. */
export function slowed(ms: number, factor: number): number {
  return ms / factor;
}
