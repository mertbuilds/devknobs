// adapted from react-grab (MIT, Copyright (c) 2025 Aiden Bai)
import type { StackFrame } from "bippy/source";
import {
  classifySourcePath,
  isBundlePath,
  isTrustedAppPath,
  normalizeFilePath,
  type SourceClass,
} from "./paths";
import type { ResolvedSource, SourceOrigin } from "./types";

/** App source lines a trace spends its budget on. */
export const DEFAULT_MAX_LINES = 3;

/** Lines a trace never goes past, library and shared ui lines included. */
export const HARD_MAX_LINES = 20;

export interface TraceOptions {
  maxLines?: number;
  /** Next.js, which gets its own internal names and path form. */
  next?: boolean;
}

export interface Trace {
  text: string;
  /** No trusted app source made it in, so a selector has to point at the element. */
  needsSelector: boolean;
  /** An owner stack frame spent the budget, so fiber ancestors need not fill in. */
  hasBudgetedFrame: boolean;
  names: Set<string>;
  /** Lines left under the hard cap. */
  room: number;
}

const NON_COMPONENT_PREFIXES = [
  "_",
  "$",
  "motion.",
  "styled.",
  "chakra.",
  "ark.",
  "Primitive.",
  "Slot.",
];

const NEXT_INTERNAL = new Set([
  "AppRouter",
  "AppRouterAnnouncer",
  "AppDevOverlay",
  "AppDevOverlayErrorBoundary",
  "ClientPageRoot",
  "ClientSegmentRoot",
  "DevRootHTTPAccessFallbackBoundary",
  "ErrorBoundary",
  "ErrorBoundaryHandler",
  "GracefulDegradeBoundary",
  "HTTPAccessErrorFallback",
  "HTTPAccessFallbackBoundary",
  "HTTPAccessFallbackErrorBoundary",
  "HandleRedirect",
  "Head",
  "HistoryUpdater",
  "HotReload",
  "InnerLayoutRouter",
  "InnerScrollAndFocusHandler",
  "InnerScrollAndFocusHandlerOld",
  "InnerScrollAndMaybeFocusHandler",
  "InnerScrollHandlerNew",
  "LinkComponent",
  "LoadableComponent",
  "LoadingBoundary",
  "LoadingBoundaryProvider",
  "NotAllowedRootHTTPFallbackError",
  "OfflineProvider",
  "OuterLayoutRouter",
  "RedirectBoundary",
  "RedirectErrorBoundary",
  "RenderFromTemplateContext",
  "RenderValidationBoundaryAtThisLevel",
  "ReplaySsrOnlyErrors",
  "RootErrorBoundary",
  "RootLevelDevOverlayElement",
  "Router",
  "ScrollAndFocusHandler",
  "ScrollAndMaybeFocusHandler",
  "SegmentBoundaryTrigger",
  "SegmentBoundaryTriggerNode",
  "SegmentStateProvider",
  "SegmentTrieNode",
  "SegmentViewNode",
  "SegmentViewStateNode",
  "ServerRoot",
  "body",
  "html",
]);

const INTERNAL = new Set([
  "<anonymous>",
  "<unknown>",
  "Anonymous",
  "Unknown",
  "Suspense",
  "Fragment",
  "StrictMode",
  "Profiler",
  "SuspenseList",
  "MotionDOMComponent",
  "Slot",
  "SlotClone",
]);

const INTERNAL_SUFFIXES = [
  ".Consumer",
  ".Context",
  ".Provider",
  ".Slot",
  ".SlotClone",
  ".Slottable",
  "ProviderProvider",
];

export function isInternalName(name: string, next = false): boolean {
  if (INTERNAL.has(name) || (next && NEXT_INTERNAL.has(name))) return true;
  return (
    INTERNAL_SUFFIXES.some((suffix) => name.endsWith(suffix)) ||
    NON_COMPONENT_PREFIXES.some((prefix) => name.startsWith(prefix))
  );
}

/** Worth a line in a trace: not React's or a library's plumbing. */
export function isUsefulName(name: string, next = false): boolean {
  return name !== "" && !isInternalName(name, next);
}

/** A capitalized component name of the app's own, or null. */
export function sourceName(name: string | null | undefined, next = false): string | null {
  if (!name || name.length <= 1 || isInternalName(name, next)) return null;
  return name[0] === name[0]?.toUpperCase() ? name : null;
}

/** Next.js renders from absolute paths. `/./app/page.tsx` is short, as in its own stacks. */
const NEXT_MARKERS = ["/src/app/", "/src/pages/", "/app/", "/pages/"];

function displayPath(filePath: string, next: boolean): string {
  const path = normalizeFilePath(filePath);
  if (!next || !path.startsWith("/")) return path;
  for (const marker of NEXT_MARKERS) {
    const index = path.indexOf(marker);
    if (index !== -1) return `/./${path.slice(index + 1)}`;
  }
  return path;
}

/**
 * `in Comp (at path:line:col)`. react-grab drops the line and column outside
 * Next.js, where the owner stack points into transformed code. Here they show
 * whenever a source map put them back, on Vite too.
 */
export function sourceLine(source: ResolvedSource, next = false): string {
  const path = displayPath(source.filePath, next);
  const showsLine = (next || source.symbolicated) && source.lineNumber;
  const column = source.columnNumber ? `:${source.columnNumber}` : "";
  const location = showsLine ? `${path}:${source.lineNumber}${column}` : path;
  return source.componentName
    ? `\n  in ${source.componentName} (at ${location})`
    : `\n  in ${location}`;
}

interface FrameLine {
  text: string;
  /** Real app source, which makes a selector unneeded. */
  isApp: boolean;
  /** Trusted app source, which spends the budget. Shared ui and library lines are free. */
  spends: boolean;
}

function frameLine(
  frame: StackFrame,
  kind: SourceClass,
  name: string | null,
  next: boolean,
): FrameLine | null {
  const pkg = kind.packageName;
  const appFile = kind.origin === "app" ? frame.fileName : undefined;
  if (frame.isServer && !appFile && (name || !frame.functionName)) {
    const tag = pkg ? `${pkg} at Server` : "at Server";
    return { text: `\n  in ${name ?? "<anonymous>"} (${tag})`, isApp: false, spends: false };
  }
  if (!appFile && name) {
    return {
      text: pkg ? `\n  in ${name} (${pkg})` : `\n  in ${name}`,
      isApp: false,
      spends: false,
    };
  }
  if (pkg) return { text: `\n  in ${pkg}`, isApp: false, spends: false };
  if (!appFile) return null;
  const source: ResolvedSource = {
    filePath: appFile,
    lineNumber: frame.lineNumber ?? null,
    columnNumber: frame.columnNumber ?? null,
    componentName: name,
    origin: "app",
    symbolicated: frame.isSymbolicated === true,
  };
  return { text: sourceLine(source, next), isApp: true, spends: isTrustedAppPath(appFile) };
}

export function resolveMaxLines(maxLines: number | undefined): number {
  if (maxLines === undefined || !Number.isFinite(maxLines)) return DEFAULT_MAX_LINES;
  return Math.max(0, Math.floor(maxLines));
}

/**
 * The owner stack as `in Comp (...)` lines, after a leading source line when
 * there is one. Only trusted app lines spend `maxLines`; library and shared ui
 * lines are free up to the hard cap of 20, so wrapper noise never crowds out
 * the app's own components.
 */
export function formatStack(
  stack: StackFrame[],
  options: TraceOptions = {},
  leading: ResolvedSource | null = null,
): Trace {
  const maxLines = resolveMaxLines(options.maxLines);
  const hardMax = Math.max(maxLines, HARD_MAX_LINES);
  const next = options.next ?? false;
  const lines: string[] = [];
  const names = new Set<string>();
  let previousLibrary: string | null = null;
  let dedupedLeading = false;
  let trusted = false;
  let hasBudgetedFrame = false;
  let spent = 0;

  if (leading) {
    // A leading shared ui or bundle source keeps the budget free for the feature above it.
    trusted = leading.origin === "app" && isTrustedAppPath(leading.filePath);
    if (trusted) spent += 1;
    if (leading.componentName) names.add(leading.componentName);
    lines.push(sourceLine(leading, next));
  }

  for (const frame of stack) {
    if (!maxLines || lines.length >= hardMax) break;
    const kind = classifySourcePath(frame.fileName);
    const name = sourceName(frame.functionName, next);
    const library = kind.packageName
      ? `${kind.packageName}:${name ?? ""}:${frame.isServer ? "server" : "client"}`
      : null;
    if (library && library === previousLibrary) continue;
    // The top frame usually names the leading line's component again. Drop that one only.
    if (!dedupedLeading && name && name === leading?.componentName) {
      dedupedLeading = true;
      continue;
    }
    const line = frameLine(frame, kind, name, next);
    if (!line) continue;
    if (line.spends && spent >= maxLines) continue;
    if (line.text === lines[lines.length - 1]) continue;
    if (line.isApp && line.spends) trusted = true;
    if (line.spends) {
      spent += 1;
      hasBudgetedFrame = true;
    }
    if (name) names.add(name);
    lines.push(line.text);
    previousLibrary = library;
  }

  return {
    text: lines.join(""),
    needsSelector: !trusted,
    hasBudgetedFrame,
    names,
    room: Math.max(0, hardMax - lines.length),
  };
}

export function nameLines(names: string[]): string {
  return names.map((name) => `\n  in ${name}`).join("");
}

function stackSource(
  frames: StackFrame[],
  origin: SourceOrigin,
  next: boolean,
): ResolvedSource | null {
  const frame = frames[0];
  if (!frame?.fileName) return null;
  return {
    filePath: normalizeFilePath(frame.fileName),
    lineNumber: frame.lineNumber ?? null,
    columnNumber: frame.columnNumber ?? null,
    componentName: sourceName(frame.functionName, next),
    origin,
    symbolicated: frame.isSymbolicated === true,
  };
}

/**
 * The source that best names the element: trusted app source first, from the
 * fiber or the stack, then shared ui, then a package's.
 */
export function selectSource(
  fiberSource: ResolvedSource | null,
  stack: StackFrame[],
  next = false,
): ResolvedSource | null {
  const fiberOrigin = fiberSource?.origin;
  if (fiberOrigin === "app" && isTrustedAppPath(fiberSource?.filePath)) return fiberSource;
  const app = stack.filter((frame) => classifySourcePath(frame.fileName).origin === "app");
  const trusted = stackSource(
    app.filter((frame) => isTrustedAppPath(frame.fileName)),
    "app",
    next,
  );
  if (trusted) return trusted;
  if (fiberOrigin === "app" && !isBundlePath(fiberSource?.filePath)) return fiberSource;
  const shared = stackSource(app, "app", next);
  if (shared) return shared;
  if (fiberOrigin === "app" || fiberOrigin === "package") return fiberSource;
  const packages = stack.filter((frame) => classifySourcePath(frame.fileName).origin === "package");
  return stackSource(packages, "package", next);
}
