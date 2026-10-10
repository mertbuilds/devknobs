import { type RequestEntry, RING_SIZE } from "./types";

/** How long changes gather before the listeners hear of them, in ms. */
export const BATCH_MS = 50;

/** Hears the rows added or changed since it last heard. None after a clear. */
export type StoreListener = (changed: readonly RequestEntry[]) => void;

export interface RequestStore {
  /** The rows, oldest start first. */
  entries(): readonly RequestEntry[];
  get(id: string): RequestEntry | undefined;
  /** An id no other row has, the rows of the frame's store included. */
  nextId(): string;
  /** Add a row, or put it in place of the one with its id. */
  put(entry: RequestEntry): void;
  /** Change a row that is still in the log. */
  update(id: string, patch: Partial<RequestEntry>): void;
  clear(): void;
  subscribe(listener: StoreListener): () => void;
  /** Tell the listeners now what the batch holds. */
  flush(): void;
  /** Empty the log for good and let every listener go. */
  close(): void;
}

export interface StoreOptions {
  /** What every id of this store starts with. Each store on a page has its own. */
  seed: string;
  /** The real time, in epoch ms. */
  now(): number;
  /** Run `flush` a moment later. Returns the way to call that off. */
  schedule?(flush: () => void): () => void;
}

function later(flush: () => void): () => void {
  const timer = setTimeout(flush, BATCH_MS);
  return () => clearTimeout(timer);
}

/**
 * The log: the last `RING_SIZE` requests, in the order they started. A change
 * swaps the row for a new object, so a listener can tell a changed row by
 * identity. Listeners hear of a burst of changes once, and with none of them
 * nothing is gathered at all.
 */
export function createStore(options: StoreOptions): RequestStore {
  const schedule = options.schedule ?? later;
  let rows: RequestEntry[] = [];
  const byId = new Map<string, RequestEntry>();
  const listeners = new Set<StoreListener>();
  const dirty = new Set<string>();
  let cancel: (() => void) | null = null;
  let cleared = false;
  /** Rows that started before the last clear stay out, late news of them too. */
  let clearedAt = Number.NEGATIVE_INFINITY;
  let count = 0;

  function flush(): void {
    cancel?.();
    cancel = null;
    if (dirty.size === 0 && !cleared) return;
    const changed: RequestEntry[] = [];
    for (const id of dirty) {
      const entry = byId.get(id);
      if (entry) changed.push(entry);
    }
    dirty.clear();
    cleared = false;
    for (const listener of Array.from(listeners)) listener(changed);
  }

  function touch(id: string | null): void {
    if (listeners.size === 0) return;
    if (id === null) cleared = true;
    else dirty.add(id);
    cancel ??= schedule(flush);
  }

  function put(entry: RequestEntry): void {
    if (entry.timing.start < clearedAt) return;
    const old = byId.get(entry.id);
    byId.set(entry.id, entry);
    if (old) rows[rows.lastIndexOf(old)] = entry;
    else {
      let at = rows.length;
      while (at > 0 && (rows[at - 1]?.timing.start ?? 0) > entry.timing.start) at--;
      rows.splice(at, 0, entry);
      if (rows.length > RING_SIZE) {
        const gone = rows.shift();
        if (gone) byId.delete(gone.id);
        if (gone === entry) return;
      }
    }
    touch(entry.id);
  }

  return {
    entries: () => rows,
    get: (id) => byId.get(id),
    nextId: () => `${options.seed}-${++count}`,
    put,
    update(id, patch) {
      const entry = byId.get(id);
      if (entry) put({ ...entry, ...patch, id });
    },
    clear() {
      rows = [];
      byId.clear();
      dirty.clear();
      clearedAt = options.now();
      touch(null);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    flush,
    close() {
      cancel?.();
      cancel = null;
      rows = [];
      byId.clear();
      dirty.clear();
      listeners.clear();
    },
  };
}
