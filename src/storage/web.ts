import { byteSize } from "./format";
import { errorLine, isOwn, type Site, type WebKind, webOf } from "./site";

/**
 * `localStorage` and `sessionStorage`, read into plain items and written one
 * key at a time. Nothing here listens to the page's own writes: the view asks
 * again on a slow tick, and `sameItems` tells it whether anything moved.
 */

/** One stored key. */
export interface WebItem {
  key: string;
  value: string;
  /** The value's weight in bytes, as UTF-8. */
  size: number;
  /** One of devknobs' own, which the view hides until asked. */
  own: boolean;
}

/** A storage as read: its items in the storage's order, or the line that says why not. */
export interface WebRead {
  items: WebItem[];
  error: string | null;
}

/**
 * Every item of a storage. With `before`, an item that did not change keeps
 * its object, so its size is not counted again and the view can tell it is
 * the same.
 */
export function readWeb(site: Site, kind: WebKind, before: readonly WebItem[] = []): WebRead {
  const storage = webOf(site, kind);
  if (typeof storage === "string") return { items: [], error: storage };
  try {
    const known = new Map(before.map((item) => [item.key, item]));
    const items: WebItem[] = [];
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index);
      if (key === null) continue;
      const value = storage.getItem(key) ?? "";
      const same = known.get(key);
      items.push(
        same && same.value === value ? same : { key, value, size: byteSize(value), own: isOwn(key) },
      );
    }
    return { items, error: null };
  } catch (error) {
    return { items: [], error: errorLine(error, `read ${kind}Storage`) };
  }
}

/** Whether two reads hold the same items in the same order, `readWeb`'s kept objects telling. */
export function sameItems(a: readonly WebItem[], b: readonly WebItem[]): boolean {
  return a.length === b.length && a.every((item, at) => item === b[at]);
}

/** Set a key. Returns the line that says why it was not saved, or null. */
export function writeWeb(site: Site, kind: WebKind, key: string, value: string): string | null {
  const storage = webOf(site, kind);
  if (typeof storage === "string") return storage;
  try {
    storage.setItem(key, value);
    return null;
  } catch (error) {
    return errorLine(error, `save ${key}`);
  }
}

/** Remove a key. Returns the line that says why not, or null. */
export function removeWeb(site: Site, kind: WebKind, key: string): string | null {
  const storage = webOf(site, kind);
  if (typeof storage === "string") return storage;
  try {
    storage.removeItem(key);
    return null;
  } catch (error) {
    return errorLine(error, `delete ${key}`);
  }
}

/** What a clear did. */
export interface Cleared {
  removed: number;
  error: string | null;
}

/**
 * Remove every item of a storage, key by key. devknobs' own items stay
 * unless `own` says they go too: they are the tool's, not the page's.
 */
export function clearWeb(site: Site, kind: WebKind, own: boolean): Cleared {
  const read = readWeb(site, kind);
  if (read.error !== null) return { removed: 0, error: read.error };
  let removed = 0;
  for (const item of read.items) {
    if (item.own && !own) continue;
    const error = removeWeb(site, kind, item.key);
    if (error !== null) return { removed, error };
    removed++;
  }
  return { removed, error: null };
}

/** The items a filter leaves: those whose key or value has the text, in any case. */
export function filterItems(
  items: readonly WebItem[],
  query: string,
  own: boolean,
): WebItem[] {
  const text = query.trim().toLowerCase();
  return items.filter((item) => {
    if (item.own && !own) return false;
    if (text === "") return true;
    return item.key.toLowerCase().includes(text) || item.value.toLowerCase().includes(text);
  });
}

/** A key and the value to keep under it. */
export interface Entry {
  name: string;
  value: string;
}

/**
 * What was typed or pasted into the add field: a json object, each of its
 * keys an entry, a value that is not text kept as its json, or lines of
 * `key=value`. Null where it is neither, or names no key.
 */
export function parseEntries(text: string): Entry[] | null {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  if (trimmed.startsWith("{")) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        const entries = Object.entries(parsed).map(([name, value]: [string, unknown]) => ({
          name,
          value: typeof value === "string" ? value : JSON.stringify(value),
        }));
        return entries.length > 0 ? entries : null;
      }
    } catch {
      // Not json: it may still be lines of key=value.
    }
  }
  const entries: Entry[] = [];
  for (const line of trimmed.split("\n")) {
    if (line.trim() === "") continue;
    const cut = line.indexOf("=");
    if (cut <= 0) return null;
    const name = line.slice(0, cut).trim();
    if (name === "") return null;
    entries.push({ name, value: line.slice(cut + 1).trim() });
  }
  return entries.length > 0 ? entries : null;
}

/** The name a duplicate of `key` takes: `key copy`, or `key copy 2` where that is taken. */
export function copyName(key: string, taken: ReadonlySet<string>): string {
  const base = `${key} copy`;
  if (!taken.has(base)) return base;
  let count = 2;
  while (taken.has(`${base} ${count}`)) count++;
  return `${base} ${count}`;
}
