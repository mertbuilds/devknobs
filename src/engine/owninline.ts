/**
 * The inline declarations devknobs itself writes on an element of the page,
 * such as the root size of the text size knob and the `color-scheme` of the
 * scheme knob. The styles view leaves them out, as they are not the page's:
 *
 *   markInline(root, "font-size", "20px");     // after writing it
 *   markInline(root, "font-size", null);       // after taking it back
 *   ownInline(root, "font-size");              // "20px", or null
 *
 * The note is kept on the element under a symbol every window on the origin
 * shares, so the page above reads what the copy in the device frame wrote.
 */

const OWN = Symbol.for("devknobs.inline");

function notes(element: object): object | null {
  const value: unknown = Reflect.get(element, OWN);
  return typeof value === "object" && value !== null ? value : null;
}

/** Note the value devknobs wrote for a property of an element's style, or with null that it is gone. */
export function markInline(element: object, property: string, value: string | null): void {
  const kept = notes(element);
  if (value === null || value === "") {
    if (kept) Reflect.deleteProperty(kept, property);
    return;
  }
  if (kept) Reflect.set(kept, property, value);
  else Reflect.set(element, OWN, { [property]: value });
}

/** The value devknobs wrote for a property of an element's style, or null where it wrote none. */
export function ownInline(element: object, property: string): string | null {
  const kept = notes(element);
  const value: unknown = kept ? Reflect.get(kept, property) : null;
  return typeof value === "string" ? value : null;
}
