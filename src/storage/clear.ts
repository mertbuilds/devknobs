import { listCaches, deleteCache } from "./cache";
import { deleteCookie, readCookies } from "./cookies";
import { deleteDatabase, IDB_TIMEOUT, listDatabases } from "./idb";
import type { Site } from "./site";
import { clearWeb, filterItems, readWeb } from "./web";

/**
 * Clear site data: everything of the page's that page script can remove, in
 * one go. What it cannot remove is counted and said, never hidden.
 */

/** How many of each kind there are, or went. */
export interface SiteCounts {
  local: number;
  session: number;
  cookies: number;
  databases: number;
  caches: number;
}

/** What is there to clear. devknobs' own items count only where `own` says they go too. */
export async function countSite(site: Site, own: boolean): Promise<SiteCounts> {
  const [cookies, databases, caches] = await Promise.all([
    readCookies(site),
    listDatabases(site),
    listCaches(site),
  ]);
  return {
    local: filterItems(readWeb(site, "local").items, "", own).length,
    session: filterItems(readWeb(site, "session").items, "", own).length,
    cookies: cookies.cookies.length,
    databases: databases.databases.length,
    caches: caches.names.length,
  };
}

const WORDS: readonly [kind: keyof SiteCounts, one: string, many: string][] = [
  ["local", "local", "local"],
  ["session", "session", "session"],
  ["cookies", "cookie", "cookies"],
  ["databases", "database", "databases"],
  ["caches", "cache", "caches"],
];

/** Counts as they are said: `12 local, 3 session, 5 cookies, 2 databases, 1 cache`. Kinds with none are left out. */
export function countsText(counts: SiteCounts): string {
  const parts = WORDS.flatMap(([kind, one, many]) =>
    counts[kind] > 0 ? [`${counts[kind]} ${counts[kind] === 1 ? one : many}`] : [],
  );
  return parts.length > 0 ? parts.join(", ") : "nothing";
}

/** What a clear did, and what it could not. */
export interface ClearReport {
  removed: SiteCounts;
  /** Cookies the page still reads: set on another path, or not the page's to remove. */
  cookiesLeft: number;
  /** Databases the page holds open, which go once it lets go. */
  blocked: string[];
  /** Everything else that went wrong, a line each. */
  errors: string[];
}

/**
 * Remove the page's items in both storages, every cookie the page can
 * delete, every database and every cache. devknobs' own items stay unless
 * `own` says they go too.
 */
export async function clearSite(site: Site, own: boolean, ms = IDB_TIMEOUT): Promise<ClearReport> {
  const report: ClearReport = {
    removed: { local: 0, session: 0, cookies: 0, databases: 0, caches: 0 },
    cookiesLeft: 0,
    blocked: [],
    errors: [],
  };
  for (const kind of ["local", "session"] as const) {
    const cleared = clearWeb(site, kind, own);
    report.removed[kind] = cleared.removed;
    if (cleared.error !== null) report.errors.push(cleared.error);
  }
  const cookies = await readCookies(site);
  if (cookies.error !== null) report.errors.push(cookies.error);
  for (const cookie of cookies.cookies) {
    if (deleteCookie(site, cookie)) report.removed.cookies++;
    else report.cookiesLeft++;
  }
  const databases = await listDatabases(site);
  const results = await Promise.all(
    databases.databases.map((database) => deleteDatabase(site, database.name, ms)),
  );
  results.forEach((result, at) => {
    const name = databases.databases[at]?.name ?? "";
    if (result === "deleted") report.removed.databases++;
    else if (result === "blocked") report.blocked.push(name);
    else report.errors.push(`cannot delete ${name}`);
  });
  const caches = await listCaches(site);
  for (const name of caches.names) {
    if (await deleteCache(site, name)) report.removed.caches++;
    else report.errors.push(`cannot delete the cache ${name}`);
  }
  return report;
}

/** What a clear came to, a line each: what went first, then what could not. */
export function reportLines(report: ClearReport): string[] {
  const lines = [`cleared ${countsText(report.removed)}`];
  if (report.cookiesLeft > 0) {
    const count = report.cookiesLeft;
    lines.push(
      `${count} ${count === 1 ? "cookie" : "cookies"} could not be removed: set on another path or domain`,
    );
  }
  for (const name of report.blocked) {
    lines.push(`${name} is held open by the page: it goes once the page lets go, or on reload`);
  }
  return [...lines, ...report.errors];
}
