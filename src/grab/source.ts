import type { Fiber } from "bippy";
import { getOwnerStack, getRawSource, getSource, type StackFrame } from "bippy/source";
import { displayName, isComposite } from "./fiber";
import { classifySourcePath, normalizeFilePath } from "./paths";
import { sourceName } from "./stack";
import type { ResolvedSource } from "./types";

/** How long a grab waits on bundles and source maps before it goes without them. */
export const TIMEOUT = 1500;

export interface Resolution {
  fiberSource: ResolvedSource | null;
  stack: StackFrame[];
}

export const EMPTY: Resolution = { fiberSource: null, stack: [] };

function sameOrigin(url: string): boolean {
  try {
    return new URL(url, location.href).origin === location.origin;
  } catch {
    return false;
  }
}

/**
 * The fetch bippy reads bundles and source maps with. It only reaches the
 * page's own origin, a dev server, and never anything else. One function for
 * every grab, so bippy keeps its source map cache across them.
 */
function sourceFetch(url: string, init?: RequestInit): Promise<Response> {
  if (!sameOrigin(url)) return Promise.resolve(new Response(null, { status: 404 }));
  const timeout = AbortSignal.timeout(TIMEOUT);
  const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
  return fetch(url, { ...init, signal });
}

/** Resolves to `fallback` once `ms` pass or `signal` aborts, whichever is first. */
export function settle<T>(
  work: Promise<T>,
  fallback: T,
  ms: number,
  signal?: AbortSignal,
): Promise<T> {
  if (signal?.aborted) return Promise.resolve(fallback);
  return new Promise((resolve) => {
    const done = (value: T) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      resolve(value);
    };
    const abort = () => done(fallback);
    const timer = setTimeout(abort, ms);
    signal?.addEventListener("abort", abort, { once: true });
    work.then(done, abort);
  });
}

function ownerName(fiber: Fiber, next: boolean): string | null {
  const owner: unknown = fiber._debugOwner;
  if (typeof owner !== "object" || owner === null || !("tag" in owner)) return null;
  const ownerFiber = owner as Fiber;
  return isComposite(ownerFiber) ? sourceName(displayName(ownerFiber.type), next) : null;
}

async function fiberSource(fiber: Fiber, next: boolean): Promise<ResolvedSource | null> {
  const source = await getSource(fiber, true, sourceFetch);
  if (!source?.fileName) return null;
  // React's own debug source is exact. Otherwise the line counts only when a source map moved it.
  const raw = fiber._debugSource ? null : getRawSource(fiber);
  return {
    filePath: normalizeFilePath(source.fileName),
    lineNumber: source.lineNumber ?? null,
    columnNumber: source.columnNumber ?? null,
    componentName: sourceName(source.functionName, next) ?? ownerName(fiber, next),
    origin: classifySourcePath(source.fileName).origin,
    symbolicated: Boolean(fiber._debugSource) || source.fileName !== raw?.fileName,
  };
}

async function resolveFiber(fiber: Fiber, next: boolean): Promise<Resolution | null> {
  try {
    const [source, stack] = await Promise.all([
      fiberSource(fiber, next),
      getOwnerStack(fiber, true, sourceFetch),
    ]);
    return { fiberSource: source, stack };
  } catch {
    return null;
  }
}

/** Per fiber. A failed or timed out lookup leaves, so the next grab tries again. */
const cache = new WeakMap<Fiber, Promise<Resolution | null>>();

/**
 * The fiber's own source and its owner stack, both symbolicated through the
 * page's source maps where it serves them. Gives up after `TIMEOUT`, or when
 * `signal` aborts, with an empty resolution.
 */
export async function resolve(
  fiber: Fiber,
  next: boolean,
  signal?: AbortSignal,
): Promise<Resolution> {
  let pending = cache.get(fiber);
  if (!pending) {
    pending = resolveFiber(fiber, next);
    cache.set(fiber, pending);
    const own = pending;
    void own.then((value) => {
      if (value === null && cache.get(fiber) === own) cache.delete(fiber);
    });
  }
  const result = await settle<Resolution | null>(pending, null, TIMEOUT, signal);
  return result ?? EMPTY;
}
