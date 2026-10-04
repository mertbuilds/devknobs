/**
 * Where the mounted copy of devknobs leaves its way out. A dev server's hot
 * update can load a second copy of the module and run the app's `mount` call
 * again. The new copy takes the page over through it: the old one takes its
 * panel, frame and patches away first, so they never stack.
 */
const OWNER = Symbol.for("devknobs.owner");

type Scope = Record<symbol, (() => void) | undefined>;

/** Take the page for `release`. Another copy that holds it lets go first. */
export function claim(scope: object, release: () => void): void {
  const held = scope as Scope;
  const previous = held[OWNER];
  if (previous && previous !== release) previous();
  held[OWNER] = release;
}

/** Does another copy hold the page now? Then this one has nothing left to undo. */
export function superseded(scope: object, release: () => void): boolean {
  const owner = (scope as Scope)[OWNER];
  return owner !== undefined && owner !== release;
}

/** Let the page go, if `release` still holds it. */
export function free(scope: object, release: () => void): void {
  const held = scope as Scope;
  if (held[OWNER] === release) Reflect.deleteProperty(held, OWNER);
}
