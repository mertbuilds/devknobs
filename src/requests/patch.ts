/** A function devknobs put in place of the browser's, and what it took the place of. */
export interface Patch {
  target: object;
  key: string;
  original: unknown;
  value: unknown;
}

/**
 * Make `wrapper` answer for `native` where a page looks: its name, how many
 * arguments it takes, and what it prints as. A page that tells a real `fetch`
 * from a polyfill by these still finds the real one.
 */
function disguise(wrapper: object, native: object): void {
  // And whatever a polyfill or a runtime hung on it, such as a flag it tells itself by.
  for (const key of ["name", "length", ...Object.keys(native)]) {
    const own = Object.getOwnPropertyDescriptor(native, key);
    if (own) Object.defineProperty(wrapper, key, own);
  }
  Object.defineProperty(wrapper, "toString", {
    configurable: true,
    writable: true,
    value: () => Function.prototype.toString.call(native),
  });
}

/** Put `make(original)` in place of the function at `key`, and note it in `patches`. */
export function install<T extends object>(
  patches: Patch[],
  target: object,
  key: string,
  make: (original: T) => T,
): void {
  const original: unknown = Reflect.get(target, key);
  if (typeof original !== "function") return;
  const value = make(original as T);
  disguise(value, original);
  if (Reflect.set(target, key, value)) patches.push({ target, key, original, value });
}

/**
 * Put the browser's own back, last patch first. One that the page or another
 * tool has wrapped since stays where it is, so their chain holds: it passes
 * straight through from then on.
 */
export function restore(patches: Patch[]): void {
  for (const { target, key, original, value } of patches.reverse()) {
    if (Reflect.get(target, key) === value) Reflect.set(target, key, original);
  }
  patches.length = 0;
}
