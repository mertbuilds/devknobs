import { errorLine, type Site } from "./site";

/**
 * Cache Storage, read only: the caches' names, and for a cache its requests
 * with what the response's headers say. No body is read.
 */

/** How many requests of a cache are read at a time. */
export const CACHE_PAGE = 100;

export interface CacheList {
  names: string[];
  error: string | null;
}

export interface CacheEntry {
  method: string;
  url: string;
  /** The response's status, null where it is gone since the list was read. */
  status: number | null;
  type: string;
  /** The response's size in bytes, where `content-length` says. */
  size: number | null;
}

export interface CacheRead {
  /** How many requests the cache holds in all. */
  total: number;
  entries: CacheEntry[];
  error: string | null;
}

/** The caches of the origin, where the page is secure and has them. */
export async function listCaches(site: Site): Promise<CacheList> {
  try {
    if (site.isSecureContext === false) {
      return { names: [], error: "Cache Storage needs a secure page (https or localhost)" };
    }
    const caches = site.caches;
    if (!caches) return { names: [], error: "Cache Storage is not here" };
    return { names: await caches.keys(), error: null };
  } catch (error) {
    return { names: [], error: errorLine(error, "list the caches") };
  }
}

/** `limit` requests of a cache from the `offset`th on, each with its response's status, type and size. */
export async function readCache(
  site: Site,
  name: string,
  offset: number,
  limit = CACHE_PAGE,
): Promise<CacheRead> {
  try {
    const caches = site.caches;
    if (!caches) return { total: 0, entries: [], error: "Cache Storage is not here" };
    const cache = await caches.open(name);
    const requests = await cache.keys();
    const entries = await Promise.all(
      requests.slice(offset, offset + limit).map(async (request): Promise<CacheEntry> => {
        const response = await cache.match(request);
        const length = response?.headers.get("content-length");
        const size = length ? Number(length) : Number.NaN;
        return {
          method: request.method,
          url: request.url,
          status: response?.status ?? null,
          type: response?.headers.get("content-type") ?? "",
          size: Number.isFinite(size) ? size : null,
        };
      }),
    );
    return { total: requests.length, entries, error: null };
  } catch (error) {
    return { total: 0, entries: [], error: errorLine(error, `read ${name}`) };
  }
}

/** Delete a whole cache. Says whether it went. */
export async function deleteCache(site: Site, name: string): Promise<boolean> {
  try {
    return (await site.caches?.delete(name)) ?? false;
  } catch {
    return false;
  }
}
