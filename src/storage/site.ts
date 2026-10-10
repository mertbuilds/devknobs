/**
 * The page's storage as the storage view reaches it: the parts of the window
 * it reads, and nothing else of it. Every reader takes one of these, so a
 * test hands in a small fake. The view only ever calls what is here: it
 * wraps and patches nothing of the page's.
 */
export interface Site {
  readonly localStorage: Storage;
  readonly sessionStorage: Storage;
  readonly document: { cookie: string };
  readonly location: { origin: string; hostname: string; pathname: string; reload(): void };
  /** Chromium's cookie store, which knows a cookie's path, domain and expiry. */
  readonly cookieStore?: CookieStoreLike;
  readonly indexedDB?: Pick<IDBFactory, "open" | "deleteDatabase"> &
    Partial<Pick<IDBFactory, "databases">>;
  readonly caches?: Pick<CacheStorage, "keys" | "open" | "delete">;
  readonly isSecureContext?: boolean;
}

/** A cookie as a cookie store lists it. A browser may leave out all but the name and value. */
export interface StoreCookie {
  name?: string;
  value?: string;
  domain?: string | null;
  path?: string;
  expires?: number | null;
  secure?: boolean;
  sameSite?: string;
}

/** The parts of a cookie store the view uses. */
export interface CookieStoreLike {
  getAll(): Promise<StoreCookie[]>;
  addEventListener(type: "change", listener: () => void): void;
  removeEventListener(type: "change", listener: () => void): void;
}

/** Either web storage, by the name the view shows it under. */
export type WebKind = "local" | "session";

/** Is `key` an item devknobs keeps for itself, not one of the page's? */
export function isOwn(key: string): boolean {
  return key === "devknobs" || key.startsWith("devknobs:");
}

function nameOf(error: unknown): string {
  if (typeof error !== "object" || error === null) return "";
  const name: unknown = Reflect.get(error, "name");
  return typeof name === "string" ? name : "";
}

/**
 * One calm line for what went wrong while `doing` something, such as
 * `read localStorage`. The view shows it and nothing is thrown.
 */
export function errorLine(error: unknown, doing: string): string {
  const name = nameOf(error);
  if (name === "SecurityError") return `cannot ${doing}: the browser blocks storage on this page`;
  if (name === "QuotaExceededError") return `cannot ${doing}: the storage is full`;
  if (name === "InvalidStateError") return `cannot ${doing}: the storage is not ready`;
  return `cannot ${doing}${name ? `: ${name}` : ""}`;
}

/** One of the page's two web storages, or the line that says why it cannot be reached. */
export function webOf(site: Site, kind: WebKind): Storage | string {
  try {
    const storage = kind === "local" ? site.localStorage : site.sessionStorage;
    if (storage) return storage;
    return `${kind}Storage is not here`;
  } catch (error) {
    return errorLine(error, `read ${kind}Storage`);
  }
}
