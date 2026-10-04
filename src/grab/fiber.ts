// adapted from bippy (MIT, Copyright 2024-present Aiden Bai)
// adapted from react-grab (MIT, Copyright (c) 2025 Aiden Bai)
import type { Fiber } from "bippy";

/**
 * These few fiber helpers are bippy's, kept here because the `bippy` entry
 * imports react itself, which would land in every bundle of devknobs. Only
 * `bippy/source` is imported, and it has no react in it.
 */

const FORWARD_REF = Symbol.for("react.forward_ref");
const MEMO = Symbol.for("react.memo");

function isFiber(value: unknown): value is Fiber {
  return (
    typeof value === "object" &&
    value !== null &&
    "tag" in value &&
    "stateNode" in value &&
    "return" in value &&
    "child" in value &&
    "sibling" in value
  );
}

function isFiberKey(key: string): boolean {
  return key.startsWith("__reactFiber") || key.startsWith("__reactInternalInstance$");
}

/** The fiber React keeps on a dom node it rendered, from any realm. */
export function getFiber(element: Element): Fiber | null {
  for (const key of Object.keys(element)) {
    if (!isFiberKey(key)) continue;
    const fiber: unknown = Reflect.get(element, key);
    if (isFiber(fiber)) return fiber;
  }
  return null;
}

/** The nearest element up the tree, shadow hosts included, that React rendered. */
export function nearestFiberElement(element: Element): Element {
  let current: Element | null = element;
  while (current?.ownerDocument === element.ownerDocument) {
    if (getFiber(current)) return current;
    if (current.parentElement) {
      current = current.parentElement;
      continue;
    }
    const root = current.getRootNode();
    current = "host" in root ? (root as ShadowRoot).host : null;
  }
  return element;
}

function typeName(value: object): string | null {
  const displayName: unknown = Reflect.get(value, "displayName");
  if (typeof displayName === "string" && displayName) return displayName;
  const name: unknown = Reflect.get(value, "name");
  return typeof name === "string" && name ? name : null;
}

/** A component's name, through `memo` and `forwardRef` wrappers. */
export function displayName(type: unknown): string | null {
  if (typeof type === "string") return type;
  if ((typeof type !== "function" && typeof type !== "object") || type === null) return null;
  const own = typeName(type);
  if (own) return own;
  const seen = new Set<object>();
  let current: unknown = type;
  while (typeof current === "object" && current !== null && !seen.has(current)) {
    seen.add(current);
    current = Reflect.get(current, "type") ?? Reflect.get(current, "render");
  }
  return typeof current === "function" ? typeName(current) : null;
}

/** A function, class, `memo` or `forwardRef` component, by its type, as tags vary by version. */
export function isComposite(fiber: Fiber): boolean {
  const type: unknown = fiber.type;
  if (typeof type === "function") return true;
  if (typeof type !== "object" || type === null) return false;
  const tag: unknown = Reflect.get(type, "$$typeof");
  return tag === FORWARD_REF || tag === MEMO;
}

function hasKeyedSibling(fiber: Fiber): boolean {
  for (let sibling = fiber.return?.child ?? null; sibling; sibling = sibling.sibling) {
    if (sibling !== fiber && sibling.key !== null) return true;
  }
  return false;
}

/**
 * The key of the list item the fiber sits in. Items made by one `.map()` share
 * a source line, so the key tells them apart. The walk crosses one component
 * boundary at most, so a route's key far above never shows.
 */
export function listKey(fiber: Fiber | null): string | null {
  let crossed = 0;
  for (let current = fiber; current; current = current.return) {
    if (current.key !== null && hasKeyedSibling(current)) return String(current.key);
    if (isComposite(current) && ++crossed === 2) break;
  }
  return null;
}

/** Names of the components above the fiber, nearest first, that `accept` lets through. */
export function componentNames(
  fiber: Fiber | null,
  max: number,
  accept: (name: string) => boolean,
): string[] {
  const names: string[] = [];
  for (let current = fiber; current && names.length < max; current = current.return) {
    if (!isComposite(current)) continue;
    const name = displayName(current.type);
    if (name && accept(name)) names.push(name);
  }
  return names;
}
