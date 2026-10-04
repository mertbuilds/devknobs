import type { Fiber } from "bippy";
import {
  getDefinitionFrameFromOwnedChild,
  getOwnerStack,
  getRawOwnerStack,
  getRawSource,
  getSource,
  getSourceMap,
  type StackFrame,
} from "bippy/source";
import { displayName, isComposite } from "./fiber";
import { locateJsx, opensAt } from "./locate";
import { classifySourcePath, normalizeFilePath, rememberRoot, rootOf } from "./paths";
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

function ownerFiber(fiber: Fiber): Fiber | null {
  const owner: unknown = fiber._debugOwner;
  if (typeof owner !== "object" || owner === null || !("tag" in owner)) return null;
  return owner as Fiber;
}

/** The element a frame of the raw owner stack made, where its fiber is known. */
export interface Site {
  tag: string;
  host: boolean;
}

/**
 * The raw owner stack is every fiber's own stack, the element's first and its
 * owners' after. A fiber's first frame is where its jsx is written. The sites
 * by their place in the stack.
 */
function sites(fiber: Fiber, total: number): Map<number, Site> {
  const found = new Map<number, Site>();
  for (let current: Fiber | null = fiber; current; current = ownerFiber(current)) {
    const type: unknown = current.type;
    const tag = typeof type === "string" ? type : displayName(type);
    const start = total - getRawOwnerStack(current).length;
    if (tag && start < total) found.set(start, { tag, host: typeof type === "string" });
  }
  return found;
}

/** A module's text, for the jsx calls in it. A failed read leaves, so the next grab tries again. */
const codeCache = new Map<string, Promise<string | null>>();

function moduleCode(url: string): Promise<string | null> {
  let pending = codeCache.get(url);
  if (!pending) {
    pending = sourceFetch(url).then(
      (response) => (response.ok ? response.text() : null),
      () => null,
    );
    codeCache.set(url, pending);
    const own = pending;
    void own.then((code) => {
      if (code === null && codeCache.get(url) === own) codeCache.delete(url);
    });
  }
  return pending;
}

/** A source map's one source, with its text, to check a place against. */
export interface MappedSource {
  name: string;
  content: string;
}

/** The map put the frame where its element's tag opens. */
export function isSited(frame: StackFrame, site: Site, source: MappedSource): boolean {
  const { lineNumber: line, columnNumber: column } = frame;
  if (!frame.isSymbolicated || typeof line !== "number" || typeof column !== "number") return false;
  return opensAt(source.content, { line, column }, site.host ? site.tag : null);
}

/**
 * A frame the map left without a place, or on one where no tag opens, set on
 * the place its element is written, by a search of the source. With nothing
 * found, the frame stays as the map left it.
 */
export function relocated(
  frame: StackFrame,
  raw: StackFrame,
  site: Site,
  source: MappedSource,
  code: string | null,
): StackFrame {
  const call =
    typeof raw.lineNumber === "number" && typeof raw.columnNumber === "number"
      ? { line: raw.lineNumber, column: raw.columnNumber - 1 }
      : null;
  const place = locateJsx(source.content, site.tag, site.host, code, call);
  if (!place) return frame;
  return {
    ...frame,
    fileName: source.name,
    lineNumber: place.line,
    columnNumber: place.column,
    isSymbolicated: true,
  };
}

/** Only a map of one source with its text, as a dev server's is, can be checked. */
async function siteFrame(frame: StackFrame, raw: StackFrame, site: Site): Promise<StackFrame> {
  const url = raw.fileName;
  if (!url) return frame;
  const map = await getSourceMap(url, true, sourceFetch);
  if (!map) return frame;
  rememberRoot(rootOf(map.file, url));
  const [name] = map.sources;
  const content = map.sourcesContent?.[0];
  if (!name || !content || map.sources.length !== 1) return frame;
  const source = { name, content };
  if (isSited(frame, site, source)) return frame;
  const alone = relocated(frame, raw, site, source, null);
  return alone === frame ? relocated(frame, raw, site, source, await moduleCode(url)) : alone;
}

/**
 * The owner stack with its mapped frames set right. bippy maps the frame of
 * the fiber's own definition first, then the raw owner stack, one for one.
 */
async function ownerStack(fiber: Fiber, stack: StackFrame[], next: boolean): Promise<StackFrame[]> {
  const raw = getRawOwnerStack(fiber);
  if (stack.length !== raw.length + 1) {
    return stack.map((frame) => (frame.isSymbolicated ? mapped(frame, null, next) : frame));
  }
  const first = getDefinitionFrameFromOwnedChild(fiber);
  const found = sites(fiber, raw.length);
  return Promise.all(
    stack.map(async (frame, index) => {
      const rawFrame = index === 0 ? first : raw[index - 1];
      const site = found.get(index - 1);
      const placed = site && rawFrame ? await siteFrame(frame, rawFrame, site) : frame;
      return placed.isSymbolicated ? mapped(placed, rawFrame, next) : placed;
    }),
  );
}

function ownerName(fiber: Fiber, next: boolean): string | null {
  const owner = ownerFiber(fiber);
  return owner && isComposite(owner) ? sourceName(displayName(owner.type), next) : null;
}

/**
 * Where the element itself is written: the first app frame of its own stack,
 * which is its owner at the line and column of the element's jsx.
 */
function ownSource(fiber: Fiber, stack: StackFrame[], next: boolean): ResolvedSource | null {
  const raw = getRawOwnerStack(fiber);
  if (stack.length !== raw.length + 1) return null;
  const owner = ownerFiber(fiber);
  const own = raw.length - (owner ? getRawOwnerStack(owner).length : 0);
  const frame = stack
    .slice(1, 1 + own)
    .find((item) => classifySourcePath(item.fileName).origin === "app");
  if (!frame?.fileName) return null;
  return {
    filePath: normalizeFilePath(frame.fileName),
    lineNumber: frame.lineNumber ?? null,
    columnNumber: frame.columnNumber ?? null,
    componentName: sourceName(frame.functionName, next) ?? ownerName(fiber, next),
    origin: "app",
    symbolicated: frame.isSymbolicated === true,
  };
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
    const stack = await ownerStack(fiber, await getOwnerStack(fiber, true, sourceFetch), next);
    const source = ownSource(fiber, stack, next) ?? (await fiberSource(fiber, next));
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
