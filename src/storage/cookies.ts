import { byteSize } from "./format";
import { cookieText } from "./onload";
import { errorLine, type Site } from "./site";

/**
 * The cookies a page can read: what `document.cookie` gives, with the path,
 * domain and expiry where the browser's cookie store tells them. A cookie
 * marked HttpOnly is in neither, so it is never here. Writes go through
 * `document.cookie`, and each is checked by reading back, as the browser
 * says nothing when it refuses one.
 */

/** What the cookies page always says on top. */
export const HTTP_ONLY_NOTE = "cookies marked HttpOnly are not shown: a page cannot read them";

/** One cookie. A field the browser does not tell is null. */
export interface Cookie {
  name: string;
  value: string;
  domain: string | null;
  path: string | null;
  /** When it expires, in epoch ms. Null for a session cookie, or where it is not told. */
  expires: number | null;
  secure: boolean | null;
  sameSite: string | null;
  /** The weight of its name and value in bytes. */
  size: number;
  /** Whether the cookie store told its path, so a write lands on it for sure. */
  placed: boolean;
}

export interface CookieRead {
  cookies: Cookie[];
  error: string | null;
}

/** The names and values in a `document.cookie` text, in its order. */
export function parseCookies(text: string): { name: string; value: string }[] {
  const pairs: { name: string; value: string }[] = [];
  for (const part of text.split(";")) {
    const piece = part.trim();
    if (piece === "") continue;
    const cut = piece.indexOf("=");
    // A cookie with no `=` is a value with no name.
    pairs.push(
      cut < 0 ? { name: "", value: piece } : { name: piece.slice(0, cut), value: piece.slice(cut + 1) },
    );
  }
  return pairs;
}

function bare(name: string, value: string): Cookie {
  return {
    name,
    value,
    domain: null,
    path: null,
    expires: null,
    secure: null,
    sameSite: null,
    size: byteSize(name) + byteSize(value),
    placed: false,
  };
}

/** The cookies as `document.cookie` alone gives them: names and values. */
export function readPlain(site: Site): CookieRead {
  try {
    const pairs = parseCookies(site.document.cookie);
    return { cookies: pairs.map((pair) => bare(pair.name, pair.value)), error: null };
  } catch (error) {
    return { cookies: [], error: errorLine(error, "read the cookies") };
  }
}

/**
 * The cookies, with the fields the cookie store knows where there is one. A
 * store that fails, as in a page that is not secure, leaves the plain read.
 */
export async function readCookies(site: Site): Promise<CookieRead> {
  const plain = readPlain(site);
  const store = site.cookieStore;
  if (!store || plain.error !== null) return plain;
  try {
    const listed = await store.getAll();
    const cookies = listed.map((entry): Cookie => {
      const base = bare(entry.name ?? "", entry.value ?? "");
      return {
        ...base,
        domain: entry.domain ?? null,
        path: entry.path ?? null,
        expires: entry.expires ?? null,
        secure: entry.secure ?? null,
        sameSite: entry.sameSite ?? null,
        placed: typeof entry.path === "string",
      };
    });
    return { cookies, error: null };
  } catch {
    return plain;
  }
}

/** Whether two reads hold the same cookies, so the view draws nothing again. */
export function sameCookies(a: readonly Cookie[], b: readonly Cookie[]): boolean {
  return (
    a.length === b.length &&
    a.every((cookie, at) => {
      const other = b[at];
      return (
        other !== undefined &&
        cookie.name === other.name &&
        cookie.value === other.value &&
        cookie.path === other.path &&
        cookie.domain === other.domain &&
        cookie.expires === other.expires
      );
    })
  );
}

/**
 * The paths a cookie this page reads may be set on: the page's own path and
 * each folder above it, down to `/`.
 */
export function pathsOf(pathname: string): string[] {
  const paths = new Set<string>();
  let path = pathname.startsWith("/") ? pathname : "/";
  while (path.length > 1) {
    paths.add(path);
    path = path.endsWith("/") ? path.slice(0, -1) : path.slice(0, path.lastIndexOf("/") + 1);
  }
  paths.add("/");
  return [...paths];
}

/**
 * The domains a cookie this page reads may be set on: the host, and each
 * parent of it that has a dot. An address by number, or a host of one label,
 * has only itself.
 */
export function domainsOf(hostname: string): string[] {
  if (hostname === "" || /^[\d.]+$/.test(hostname) || hostname.includes(":")) return [];
  const labels = hostname.split(".");
  const domains: string[] = [];
  for (let at = 0; at < labels.length - 1; at++) domains.push(labels.slice(at).join("."));
  return domains;
}

/** How many cookies of a name the page reads now, and whether each has the value. */
function count(site: Site, name: string, value?: string): number {
  return parseCookies(site.document.cookie).filter(
    (pair) => pair.name === name && (value === undefined || pair.value === value),
  ).length;
}

const GONE = "Thu, 01 Jan 1970 00:00:00 GMT";

/** Every place a cookie may sit, the surest first: the place it is known at, else each path with and without each domain. */
function places(site: Site, cookie: Cookie): { path: string; domain?: string }[] {
  const paths = cookie.path !== null ? [cookie.path] : pathsOf(site.location.pathname).reverse();
  // The cookie store names the host for a cookie of the host alone, which has no domain attribute.
  const domains: (string | undefined)[] =
    cookie.placed && cookie.domain !== null
      ? [cookie.domain, undefined]
      : [undefined, ...domainsOf(site.location.hostname)];
  return paths.flatMap((path) => domains.map((domain) => ({ path, domain })));
}

/**
 * Delete a cookie by expiring it at each place it may sit, until the page
 * reads one less of its name. Says whether it went: one set on a path this
 * page is not under, or marked HttpOnly since, does not.
 */
export function deleteCookie(site: Site, cookie: Cookie): boolean {
  try {
    const before = count(site, cookie.name);
    if (before === 0) return true;
    for (const place of places(site, cookie)) {
      site.document.cookie = cookieText({ name: cookie.name, value: "", expires: GONE, ...place });
      if (count(site, cookie.name) < before) return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Give a cookie a new value where it sits, keeping what is known of it. With
 * the place not known, each is tried: a write that made a second cookie of
 * the name in place of changing this one is taken back. Says whether the
 * page now reads the new value.
 */
export function setCookie(site: Site, cookie: Cookie, value: string, now = Date.now()): boolean {
  try {
    const before = count(site, cookie.name);
    const had = count(site, cookie.name, value);
    const kept: Record<string, unknown> = { name: cookie.name, value };
    if (cookie.expires !== null) kept.maxAge = Math.max(Math.round((cookie.expires - now) / 1000), 1);
    if (cookie.sameSite !== null) kept.sameSite = cookie.sameSite;
    if (cookie.secure === true) kept.secure = true;
    for (const place of places(site, cookie)) {
      site.document.cookie = cookieText({ ...kept, ...place });
      const after = count(site, cookie.name);
      if (after === before && count(site, cookie.name, value) > had) return true;
      if (after === before && cookie.value === value) return true;
      // A new cookie beside the old one: this was not its place.
      if (after > before) {
        site.document.cookie = cookieText({ name: cookie.name, value: "", expires: GONE, ...place });
      }
    }
    return false;
  } catch {
    return false;
  }
}

/** A new cookie for the whole site, kept for the session. Says whether the page reads it. */
export function addCookie(site: Site, name: string, value: string): boolean {
  try {
    site.document.cookie = cookieText({ name, value, path: "/" });
    return count(site, name, value) > 0;
  } catch {
    return false;
  }
}

/** The cookies a filter leaves: those whose name or value has the text, in any case. */
export function filterCookies(cookies: readonly Cookie[], query: string): Cookie[] {
  const text = query.trim().toLowerCase();
  if (text === "") return [...cookies];
  return cookies.filter(
    (cookie) => cookie.name.toLowerCase().includes(text) || cookie.value.toLowerCase().includes(text),
  );
}
