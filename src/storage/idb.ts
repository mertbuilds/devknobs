import { errorLine, type Site } from "./site";

/**
 * IndexedDB, read and never held. A connection the view keeps open would
 * block the page's own version upgrades, so every read here opens the
 * database, reads in one read-only transaction, and closes it again on every
 * path: done, failed, aborted or timed out. A database is opened by name
 * alone, with no version, so no upgrade is ever asked for: one that would
 * start anyway, as for a name that is gone, is aborted and creates nothing.
 * And should the page ask for an upgrade while a read runs, the connection
 * closes at once and lets it through.
 */

/** How long an open, a read or a delete may take before the view gives up, in ms. */
export const IDB_TIMEOUT = 1000;

/** How many records of a store are read at a time. */
export const RECORD_PAGE = 50;

export interface DatabaseName {
  name: string;
  version: number;
}

export interface DatabaseList {
  databases: DatabaseName[];
  /** Why there is no list: no IndexedDB here, or a browser that cannot list. */
  error: string | null;
}

export interface StoreInfo {
  name: string;
  /** The key path as written, empty for a store with keys of its own. */
  keyPath: string;
  autoIncrement: boolean;
  indexes: string[];
  /** How many records it holds, null where the count failed. */
  count: number | null;
}

export interface DatabaseRead {
  version: number;
  stores: StoreInfo[];
  error: string | null;
}

export interface RecordRow {
  key: unknown;
  value: unknown;
}

export interface RecordRead {
  records: RecordRow[];
  error: string | null;
}

/** What says a database could not be listed in this browser. */
export const NO_LIST = "this browser cannot list databases: indexedDB.databases() is missing";

/** The databases of the origin, by name and version. */
export async function listDatabases(site: Site): Promise<DatabaseList> {
  try {
    const factory = site.indexedDB;
    if (!factory) return { databases: [], error: "IndexedDB is not here" };
    if (typeof factory.databases !== "function") return { databases: [], error: NO_LIST };
    const listed = await factory.databases();
    const databases = listed.flatMap((entry) =>
      typeof entry.name === "string" ? [{ name: entry.name, version: entry.version ?? 0 }] : [],
    );
    return { databases, error: null };
  } catch (error) {
    return { databases: [], error: errorLine(error, "list the databases") };
  }
}

/** Why a read gave up. */
class Stopped extends Error {
  constructor(readonly line: string) {
    super(line);
  }
}

/**
 * Open a database by name, with no version. It settles within `ms`: a
 * connection that comes later than that, as after the page's upgrade let go,
 * is closed the moment it arrives.
 */
function open(
  factory: Pick<IDBFactory, "open">,
  name: string,
  ms: number,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let waiting = true;
    const request = factory.open(name);
    const timer = setTimeout(() => {
      waiting = false;
      reject(new Stopped(`${name} did not open in time: the page may be upgrading it`));
    }, ms);
    request.onupgradeneeded = () => {
      // Only a database that is gone asks for this, and opening it would make
      // it. Aborting leaves nothing behind, and fails the open.
      try {
        request.transaction?.abort();
      } catch {
        // Aborted already.
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      if (!waiting) {
        db.close();
        return;
      }
      waiting = false;
      clearTimeout(timer);
      resolve(db);
    };
    request.onerror = (event) => {
      event.preventDefault?.();
      if (!waiting) return;
      waiting = false;
      clearTimeout(timer);
      const gone = request.error?.name === "AbortError";
      reject(new Stopped(gone ? `${name} is gone` : errorLine(request.error, `open ${name}`)));
    };
  });
}

/** A read-only transaction, settled: done, or failed with the line that says so. */
function settled(transaction: IDBTransaction, ms: number, doing: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      try {
        transaction.abort();
      } catch {
        // Done or aborted already.
      }
      reject(new Stopped(`cannot ${doing}: it took too long`));
    }, ms);
    transaction.oncomplete = () => {
      clearTimeout(timer);
      resolve();
    };
    transaction.onabort = () => {
      clearTimeout(timer);
      reject(new Stopped(errorLine(transaction.error, doing)));
    };
    transaction.onerror = (event) => {
      event.preventDefault?.();
    };
  });
}

/**
 * Open a database, read from it, and close it, whatever happens in between.
 * The page asking for an upgrade closes it at once.
 */
async function withDatabase<T>(
  site: Site,
  name: string,
  ms: number,
  read: (db: IDBDatabase) => Promise<T>,
): Promise<T> {
  const factory = site.indexedDB;
  if (!factory) throw new Stopped("IndexedDB is not here");
  const db = await open(factory, name, ms);
  db.onversionchange = () => db.close();
  try {
    return await read(db);
  } finally {
    db.close();
  }
}

function lineOf(error: unknown, doing: string): string {
  return error instanceof Stopped ? error.line : errorLine(error, doing);
}

function pathText(path: string | string[] | null): string {
  if (path === null) return "";
  return typeof path === "string" ? path : path.join(", ");
}

/** A database's stores: their key path, indexes and how many records each holds. */
export async function readDatabase(
  site: Site,
  name: string,
  ms = IDB_TIMEOUT,
): Promise<DatabaseRead> {
  try {
    return await withDatabase(site, name, ms, async (db) => {
      const names = Array.from(db.objectStoreNames);
      if (names.length === 0) return { version: db.version, stores: [], error: null };
      const transaction = db.transaction(names, "readonly");
      const done = settled(transaction, ms, `read ${name}`);
      // Heard below. A throw before that must not leave it unheard.
      done.catch(() => {});
      const stores = names.map((storeName): StoreInfo => {
        const store = transaction.objectStore(storeName);
        const info: StoreInfo = {
          name: storeName,
          keyPath: pathText(store.keyPath),
          autoIncrement: store.autoIncrement,
          indexes: Array.from(store.indexNames),
          count: null,
        };
        const counting = store.count();
        counting.onsuccess = () => {
          info.count = counting.result;
        };
        return info;
      });
      await done;
      return { version: db.version, stores, error: null };
    });
  } catch (error) {
    return { version: 0, stores: [], error: lineOf(error, `read ${name}`) };
  }
}

/** `limit` records of a store from the `offset`th on, in key order. */
export async function readRecords(
  site: Site,
  name: string,
  storeName: string,
  offset: number,
  limit = RECORD_PAGE,
  ms = IDB_TIMEOUT,
): Promise<RecordRead> {
  const doing = `read ${storeName}`;
  try {
    return await withDatabase(site, name, ms, async (db) => {
      const transaction = db.transaction([storeName], "readonly");
      const done = settled(transaction, ms, doing);
      done.catch(() => {});
      const records: RecordRow[] = [];
      const walking = transaction.objectStore(storeName).openCursor();
      let skipped = offset === 0;
      walking.onsuccess = () => {
        const cursor = walking.result;
        if (!cursor || records.length >= limit) return;
        if (!skipped) {
          skipped = true;
          cursor.advance(offset);
          return;
        }
        records.push({ key: cursor.key, value: cursor.value });
        if (records.length < limit) cursor.continue();
      };
      await done;
      return { records, error: null };
    });
  } catch (error) {
    return { records: [], error: lineOf(error, doing) };
  }
}

/** What deleting a database came to. */
export type Deleted = "deleted" | "blocked" | "failed";

/**
 * Delete a whole database. One the page holds open cannot go until the page
 * lets go: that says `blocked` once `ms` passed, and the browser deletes it
 * when it can.
 */
export function deleteDatabase(site: Site, name: string, ms = IDB_TIMEOUT): Promise<Deleted> {
  return new Promise((resolve) => {
    try {
      const factory = site.indexedDB;
      if (!factory) {
        resolve("failed");
        return;
      }
      const request = factory.deleteDatabase(name);
      const timer = setTimeout(() => resolve("blocked"), ms);
      request.onsuccess = () => {
        clearTimeout(timer);
        resolve("deleted");
      };
      request.onerror = (event) => {
        event.preventDefault?.();
        clearTimeout(timer);
        resolve("failed");
      };
    } catch {
      resolve("failed");
    }
  });
}
