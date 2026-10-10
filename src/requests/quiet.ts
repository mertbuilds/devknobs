import { QUIET, shared } from "./shared";

/**
 * The requests devknobs makes for itself, which the log leaves out. Every
 * `fetch` of devknobs' own goes through `quietFetch`, and every address it
 * loads another way is hushed first. This file stays small: it is all the
 * rest of devknobs needs of the log.
 */

/** `fetch`, for devknobs' own use. The page's `fetch` makes it, so what the page put on `fetch` still runs. */
export function quietFetch(url: string, init?: RequestInit): Promise<Response> {
  const recorder = shared();
  if (!recorder) return fetch(url, init);
  // The call carries its own mark: a wrapper of the page's may pass it on a moment later.
  const marked = { ...init, [QUIET]: true };
  return recorder.quietly(url, () => fetch(url, marked));
}

/** Devknobs loads `url` by other means than `fetch`, an image say, and may again. */
export function hush(url: string): void {
  shared()?.hush(url, false);
}

/** Devknobs is about to load `url` once, as the device frame loads the page. */
export function hushOnce(url: string): void {
  shared()?.hush(url, true);
}
