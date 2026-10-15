import type { Site, StoreCookie } from "../src/storage/site";

/** Fakes of what the storage view reads: a page's storages, its cookie jar, its databases and its caches. */

/** An error as the browser throws one, told by its name. */
export function named(name: string): Error {
  const error = new Error(name);
  error.name = name;
  return error;
}

/** A web storage over a map, which can be told to refuse writes. */
export class FakeStorage implements Storage {
  map = new Map<string, string>();
  /** What `setItem` throws, where it does. */
  refuse: Error | null = null;
  /** How many times it was read or written. */
  calls = 0;
  [name: string]: unknown;

  constructor(start: Record<string, string> = {}) {
    for (const [key, value] of Object.entries(start)) this.map.set(key, value);
  }

  get length(): number {
    this.calls++;
    return this.map.size;
  }

  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }

  getItem(key: string): string | null {
    this.calls++;
    return this.map.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.calls++;
    if (this.refuse) throw this.refuse;
    this.map.set(key, value);
  }

  removeItem(key: string): void {
    this.calls++;
    this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }

  /** What it holds, as a plain object. */
  all(): Record<string, string> {
    return Object.fromEntries(this.map);
  }
}

/** A cookie as the jar keeps it. */
export interface JarCookie {
  name: string;
  value: string;
  path: string;
  /** Null for a cookie of the host alone. */
  domain: string | null;
  expires: number | null;
  secure: boolean;
  sameSite: string;
  httpOnly: boolean;
}

/** A browser's cookie jar for one page, with the path and domain rules a write goes by. */
export class FakeJar {
  cookies: JarCookie[] = [];
  /** Every text written to `document.cookie`. */
  writes: string[] = [];

  constructor(
    readonly hostname: string,
    public pathname: string,
    readonly now: () => number = () => 1_000_000,
  ) {}

  put(cookie: Partial<JarCookie> & { name: string; value: string }): void {
    this.cookies.push({
      path: "/",
      domain: null,
      expires: null,
      secure: false,
      sameSite: "lax",
      httpOnly: false,
      ...cookie,
    });
  }

  /** The cookies this page is sent, script or not. */
  private matching(): JarCookie[] {
    return this.cookies.filter((cookie) => {
      const under =
        this.pathname === cookie.path ||
        this.pathname.startsWith(cookie.path.endsWith("/") ? cookie.path : `${cookie.path}/`);
      const host =
        cookie.domain === null ||
        this.hostname === cookie.domain ||
        this.hostname.endsWith(`.${cookie.domain}`);
      return under && host;
    });
  }

  /** The cookies page script reads. */
  readable(): JarCookie[] {
    return this.matching().filter((cookie) => !cookie.httpOnly);
  }

  read(): string {
    return this.readable()
      .map((cookie) => (cookie.name === "" ? cookie.value : `${cookie.name}=${cookie.value}`))
      .join("; ");
  }

  write(text: string): void {
    this.writes.push(text);
    const [pair = "", ...rest] = text.split(";").map((part) => part.trim());
    const cut = pair.indexOf("=");
    const name = cut < 0 ? "" : pair.slice(0, cut);
    const value = cut < 0 ? pair : pair.slice(cut + 1);
    const attributes = new Map(
      rest.map((part) => {
        const at = part.indexOf("=");
        return at < 0 ? [part.toLowerCase(), ""] : [part.slice(0, at).toLowerCase(), part.slice(at + 1)];
      }),
    );
    const folder = this.pathname.slice(0, this.pathname.lastIndexOf("/")) || "/";
    const path = attributes.get("path") ?? folder;
    const domain = attributes.get("domain") ?? null;
    // A domain the page is not on is refused.
    if (domain !== null && this.hostname !== domain && !this.hostname.endsWith(`.${domain}`)) return;
    let expires: number | null = null;
    const age = attributes.get("max-age");
    const date = attributes.get("expires");
    if (age !== undefined) expires = this.now() + Number(age) * 1000;
    else if (date !== undefined) expires = Date.parse(date);
    const same = (cookie: JarCookie) =>
      cookie.name === name && cookie.path === path && cookie.domain === domain;
    // Script cannot write over a cookie marked HttpOnly.
    if (this.cookies.some((cookie) => same(cookie) && cookie.httpOnly)) return;
    this.cookies = this.cookies.filter((cookie) => !same(cookie));
    if (expires !== null && expires <= this.now()) return;
    this.cookies.push({
      name,
      value,
      path,
      domain,
      expires,
      secure: attributes.has("secure"),
      sameSite: attributes.get("samesite") ?? "lax",
      httpOnly: false,
    });
  }

  /** A cookie store over the jar, which tells each cookie's place. */
  store(): { getAll(): Promise<StoreCookie[]>; listeners: Set<() => void> } & NonNullable<Site["cookieStore"]> {
    const listeners = new Set<() => void>();
    return {
      listeners,
      getAll: async () =>
        this.readable().map((cookie) => ({
          name: cookie.name,
          value: cookie.value,
          domain: cookie.domain,
          path: cookie.path,
          expires: cookie.expires,
          secure: cookie.secure,
          sameSite: cookie.sameSite,
        })),
      addEventListener: (_type, listener) => void listeners.add(listener),
      removeEventListener: (_type, listener) => void listeners.delete(listener),
    };
  }
}

/** How a fake database answers. */
export type DatabaseMode = "ok" | "never" | "fail" | "late" | "abort" | "hang" | "throw";

export interface FakeStoreData {
  keyPath?: string | string[] | null;
  autoIncrement?: boolean;
  indexes?: string[];
  records: [key: unknown, value: unknown][];
}

interface FakeRequest<T> {
  result: T;
  error: { name: string } | null;
  transaction: { abort(): void } | null;
  onsuccess: (() => void) | null;
  onerror: ((event: { preventDefault(): void }) => void) | null;
  onupgradeneeded: (() => void) | null;
  onblocked: (() => void) | null;
}

function request<T>(result: T): FakeRequest<T> {
  return {
    result,
    error: null,
    transaction: null,
    onsuccess: null,
    onerror: null,
    onupgradeneeded: null,
    onblocked: null,
  };
}

const EVENT = { preventDefault() {} };

/** One connection a test can look at afterwards. */
export interface FakeConnection {
  name: string;
  closed: boolean;
  /** The mode of every transaction opened on it. */
  modes: string[];
  onversionchange: (() => void) | null;
}

/**
 * IndexedDB, as far as the view reads it: databases with stores and cursors.
 * It records every open, with the version asked for, and every connection
 * with whether it was closed, and a database can be told to block, fail,
 * come late, abort its transaction or never finish one.
 */
export class FakeIdb {
  data = new Map<string, { version: number; stores: Record<string, FakeStoreData> }>();
  modes = new Map<string, DatabaseMode>();
  /** Every `open`, with the arguments it was called with. */
  opens: unknown[][] = [];
  connections: FakeConnection[] = [];
  /** Names an open created, which the view must never do. */
  created: string[] = [];
  /** Upgrades that were aborted. */
  aborted: string[] = [];
  deletes: string[] = [];
  /** Names whose delete is blocked by a connection of the page. */
  held = new Set<string>();
  /** How late a `late` database opens, in ms. */
  lateBy = 30;

  add(name: string, version: number, stores: Record<string, FakeStoreData>): void {
    this.data.set(name, { version, stores });
  }

  /** Connections left open: what blocks the page's own upgrades. */
  openNow(): FakeConnection[] {
    return this.connections.filter((connection) => !connection.closed);
  }

  factory(listable = true): NonNullable<Site["indexedDB"]> {
    const self = this;
    const made = {
      open(...args: unknown[]) {
        self.opens.push(args);
        const name = String(args[0]);
        const mode = self.modes.get(name) ?? "ok";
        const opening = request<unknown>(null);
        const succeed = (): void => {
          opening.result = self.connect(name, mode);
          opening.onsuccess?.();
        };
        queueMicrotask(() => {
          if (mode === "never") return;
          if (mode === "fail") {
            opening.error = { name: "UnknownError" };
            opening.onerror?.(EVENT);
            return;
          }
          if (!self.data.has(name)) {
            // A name that is gone: the browser starts an upgrade that would make it.
            let stopped = false;
            opening.transaction = {
              abort() {
                stopped = true;
                self.aborted.push(name);
              },
            };
            opening.onupgradeneeded?.();
            opening.transaction = null;
            if (stopped) {
              opening.error = { name: "AbortError" };
              opening.onerror?.(EVENT);
              return;
            }
            self.created.push(name);
            self.data.set(name, { version: 1, stores: {} });
          }
          if (mode === "late") setTimeout(succeed, self.lateBy);
          else succeed();
        });
        return opening;
      },
      deleteDatabase(name: string) {
        self.deletes.push(name);
        const deleting = request<undefined>(undefined);
        queueMicrotask(() => {
          if (self.held.has(name)) {
            deleting.onblocked?.();
            return;
          }
          self.data.delete(name);
          deleting.onsuccess?.();
        });
        return deleting;
      },
      databases: async () =>
        Array.from(self.data, ([name, database]) => ({ name, version: database.version })),
    };
    const { databases, ...bare } = made;
    return (listable ? made : bare) as unknown as NonNullable<Site["indexedDB"]>;
  }

  private connect(name: string, mode: DatabaseMode): unknown {
    const self = this;
    const database = this.data.get(name);
    const stores = database?.stores ?? {};
    const connection: FakeConnection = { name, closed: false, modes: [], onversionchange: null };
    this.connections.push(connection);
    return {
      get version() {
        return database?.version ?? 0;
      },
      objectStoreNames: Object.keys(stores),
      set onversionchange(listener: (() => void) | null) {
        connection.onversionchange = listener;
      },
      close() {
        connection.closed = true;
      },
      transaction(names: string[], kind: string) {
        connection.modes.push(kind);
        if (mode === "throw") throw named("InvalidStateError");
        if (names.some((store) => !(store in stores))) throw named("NotFoundError");
        return self.transact(stores, names, mode);
      },
    };
  }

  private transact(stores: Record<string, FakeStoreData>, names: string[], mode: DatabaseMode): unknown {
    let pending = 0;
    let over = false;
    const transaction = {
      error: null as { name: string } | null,
      oncomplete: null as (() => void) | null,
      onabort: null as (() => void) | null,
      onerror: null as ((event: unknown) => void) | null,
      abort() {
        if (over) throw named("InvalidStateError");
        over = true;
        transaction.error = { name: "AbortError" };
        queueMicrotask(() => transaction.onabort?.());
      },
      objectStore(name: string) {
        if (!names.includes(name)) throw named("NotFoundError");
        const store = stores[name] ?? { records: [] };
        return {
          keyPath: store.keyPath ?? null,
          autoIncrement: store.autoIncrement ?? false,
          indexNames: store.indexes ?? [],
          count: () => step(() => store.records.length),
          openCursor() {
            let at = 0;
            const walking = request<unknown>(null);
            const land = (): void => {
              pending++;
              queueMicrotask(() => {
                pending--;
                if (over || mode === "hang") return;
                const record = store.records[at];
                walking.result = record
                  ? {
                      key: record[0],
                      value: record[1],
                      continue() {
                        at++;
                        land();
                      },
                      advance(count: number) {
                        at += count;
                        land();
                      },
                    }
                  : null;
                walking.onsuccess?.();
                settle();
              });
            };
            land();
            return walking;
          },
        };
      },
    };
    function settle(): void {
      queueMicrotask(() => {
        if (pending > 0 || over || mode === "hang") return;
        over = true;
        transaction.oncomplete?.();
      });
    }
    function step<T>(produce: () => T): FakeRequest<T | null> {
      const asking = request<T | null>(null);
      pending++;
      queueMicrotask(() => {
        pending--;
        if (over || mode === "hang") return;
        if (mode === "abort") {
          over = true;
          transaction.error = { name: "AbortError" };
          transaction.onabort?.();
          return;
        }
        asking.result = produce();
        asking.onsuccess?.();
        settle();
      });
      return asking;
    }
    if (mode === "abort") {
      queueMicrotask(() => {
        if (over) return;
        over = true;
        transaction.error = { name: "AbortError" };
        transaction.onabort?.();
      });
    }
    return transaction;
  }
}

/** A response in a cache, as far as its headers go. */
export interface FakeCached {
  url: string;
  method?: string;
  status?: number;
  type?: string;
  length?: string;
}

/** Cache Storage over plain lists. */
export class FakeCaches {
  caches = new Map<string, FakeCached[]>();
  /** How many responses were looked up. */
  matches = 0;

  storage(): NonNullable<Site["caches"]> {
    const self = this;
    const made = {
      keys: async () => Array.from(self.caches.keys()),
      delete: async (name: string) => self.caches.delete(name),
      async open(name: string) {
        const entries = self.caches.get(name);
        if (!entries) throw named("NotFoundError");
        return {
          keys: async () => entries.map((entry) => ({ url: entry.url, method: entry.method ?? "GET" })),
          async match(asked: { url: string }) {
            self.matches++;
            const entry = entries.find((candidate) => candidate.url === asked.url);
            if (!entry) return undefined;
            const headers = new Map<string, string>();
            if (entry.type) headers.set("content-type", entry.type);
            if (entry.length) headers.set("content-length", entry.length);
            return { status: entry.status ?? 200, headers: { get: (name: string) => headers.get(name) ?? null } };
          },
        };
      },
    };
    return made as unknown as NonNullable<Site["caches"]>;
  }
}

/** A page, as far as the storage view reads one. */
export interface FakeSite extends Site {
  localStorage: FakeStorage;
  sessionStorage: FakeStorage;
  jar: FakeJar;
  idb: FakeIdb;
  cached: FakeCaches;
  /** How many times the page was asked to reload. */
  reloads: number;
}

export interface SiteOptions {
  local?: Record<string, string>;
  session?: Record<string, string>;
  hostname?: string;
  pathname?: string;
  /** Whether the browser has a cookie store. Defaults to none, as off Chromium. */
  cookieStore?: boolean;
  /** Whether `indexedDB.databases()` is there. Defaults to true. */
  listable?: boolean;
}

export function fakeSite(options: SiteOptions = {}): FakeSite {
  const hostname = options.hostname ?? "app.example.com";
  const jar = new FakeJar(hostname, options.pathname ?? "/shop/cart");
  const idb = new FakeIdb();
  const cached = new FakeCaches();
  const site: FakeSite = {
    localStorage: new FakeStorage(options.local),
    sessionStorage: new FakeStorage(options.session),
    document: {
      get cookie() {
        return jar.read();
      },
      set cookie(text: string) {
        jar.write(text);
      },
    },
    location: {
      origin: `https://${hostname}`,
      hostname,
      get pathname() {
        return jar.pathname;
      },
      reload() {
        site.reloads++;
      },
    },
    cookieStore: options.cookieStore ? jar.store() : undefined,
    indexedDB: idb.factory(options.listable ?? true),
    caches: cached.storage(),
    isSecureContext: true,
    jar,
    idb,
    cached,
    reloads: 0,
  };
  return site;
}

/** Let what is queued run: promises, and timers of 0. */
export function settle(ms = 0): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
