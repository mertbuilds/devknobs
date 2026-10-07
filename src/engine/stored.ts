/**
 * Every item devknobs keeps in web storage is json with its version in a
 * top-level `v`, and each key has its version as a constant beside it. One
 * kept before items had a version reads as version 0, and its reader takes it
 * up as the current one, so nothing kept is lost. One from a newer devknobs
 * reads as nothing kept, and the next write here replaces it. To change an
 * item's shape, bump its constant and have its reader take the older
 * versions up.
 */

/** The version a stored value was kept at: its `v`, or 0 for one kept before items had one. */
export function versionOf(value: unknown): number {
  if (typeof value !== "object" || value === null) return 0;
  const v: unknown = Reflect.get(value, "v");
  return typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : 0;
}

/** Whether a stored value is from a newer devknobs than one at `current`. */
export function newer(value: unknown, current: number): boolean {
  return versionOf(value) > current;
}

/** `value` as kept at version `v`. */
export function stamped<T extends object>(value: T, v: number): { v: number } & T {
  return { v, ...value };
}
