import type { Fiber } from "bippy";
import {
  getDefinitionFrameFromOwnedChild,
  getOwnerStack,
  getRawOwnerStack,
  getRawSource,
  getSource,
  type StackFrame,
} from "bippy/source";
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

/** The parts of a frame a source map rewrites. */
interface Place {
  fileName?: string;
  functionName?: string;
  columnNumber?: number;
}

const ROOTED = /^(?:[a-z][a-z0-9+.-]*:|[/\\])/i;

/** An inline source map names its file next to its script. The path from the server's root. */
function scriptPath(fileName: string | undefined, script: string | undefined): string | undefined {
  if (!fileName || !script || ROOTED.test(fileName) || !/^https?:\/\//.test(script)) {
    return fileName;
  }
  try {
    const path = new URL(fileName, script).pathname;
    return path.startsWith("/@fs/") ? path.slice(4) : path.slice(1);
  } catch {
    return fileName;
  }
}

/**
 * A place a source map gave, set right against the frame it came from. The
 * map's column counts from 0, where a stack and an editor count from 1. Its
 * path can be relative to the script. And its name is the token at the call,
 * `map` in `list.map(...)`, where the frame names the function itself.
 */
export function mapped<T extends Place>(place: T, raw: Place | null | undefined, next = false): T {
  return {
    ...place,
    fileName: scriptPath(place.fileName, raw?.fileName),
    functionName: sourceName(raw?.functionName, next) ?? place.functionName,
    columnNumber:
      typeof place.columnNumber === "number" ? place.columnNumber + 1 : place.columnNumber,
  };
}

/**
 * The owner stack with its mapped frames set right. bippy maps the frame of
 * the fiber's own definition first, then the raw owner stack, one for one.
 */
function ownerStack(fiber: Fiber, stack: StackFrame[], next: boolean): StackFrame[] {
  const raw = getRawOwnerStack(fiber);
  const aligned = stack.length === raw.length + 1;
  const first = aligned ? getDefinitionFrameFromOwnedChild(fiber) : null;
  return stack.map((frame, index) => {
    if (!frame.isSymbolicated) return frame;
    return mapped(frame, aligned ? (index === 0 ? first : raw[index - 1]) : null, next);
  });
}

function ownerName(fiber: Fiber, next: boolean): string | null {
  const owner: unknown = fiber._debugOwner;
  if (typeof owner !== "object" || owner === null || !("tag" in owner)) return null;
  const ownerFiber = owner as Fiber;
  return isComposite(ownerFiber) ? sourceName(displayName(ownerFiber.type), next) : null;
}

async function fiberSource(fiber: Fiber, next: boolean): Promise<ResolvedSource | null> {
  const found = await getSource(fiber, true, sourceFetch);
  if (!found?.fileName) return null;
  // React's own debug source is exact. Otherwise the line counts only when a source map moved it.
  const raw = fiber._debugSource ? null : getRawSource(fiber);
  const moved = !fiber._debugSource && found.fileName !== raw?.fileName;
  const source = moved ? mapped(found, raw, next) : found;
  return {
    filePath: normalizeFilePath(source.fileName),
    lineNumber: source.lineNumber ?? null,
    columnNumber: source.columnNumber ?? null,
    componentName: sourceName(source.functionName, next) ?? ownerName(fiber, next),
    origin: classifySourcePath(source.fileName).origin,
    symbolicated: Boolean(fiber._debugSource) || moved,
  };
}

async function resolveFiber(fiber: Fiber, next: boolean): Promise<Resolution | null> {
  try {
    const [source, stack] = await Promise.all([
      fiberSource(fiber, next),
      getOwnerStack(fiber, true, sourceFetch),
    ]);
    return { fiberSource: source, stack: ownerStack(fiber, stack, next) };
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
