/**
 * Shift and a click gather elements, and a click again takes one back out.
 * They are copied together once shift is let go, or with a plain click.
 */
export function togglePick<T>(picked: readonly T[], item: T): T[] {
  return picked.includes(item) ? picked.filter((entry) => entry !== item) : [...picked, item];
}

/** What a copy takes: the gathered elements, in order, and the one clicked last if it is new. */
export function flushPicks<T>(picked: readonly T[], clicked: T | null): T[] {
  if (clicked === null || picked.includes(clicked)) return [...picked];
  return [...picked, clicked];
}

/** What the toast says: `copied`, or `copied 3` for more than one. */
export function copiedText(count: number): string {
  return count > 1 ? `copied ${count}` : "copied";
}
