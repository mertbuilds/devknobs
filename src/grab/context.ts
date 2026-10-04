// adapted from react-grab (MIT, Copyright (c) 2025 Aiden Bai)
import type { StackFrame } from "bippy/source";
import { componentNames, getFiber, listKey, nearestFiberElement } from "./fiber";
import { htmlPreview } from "./preview";
import { elementSelector, nearestSemanticSelector, selectorTarget } from "./selector";
import { EMPTY, resolve } from "./source";
import {
  formatStack,
  HARD_MAX_LINES,
  isUsefulName,
  nameLines,
  resolveMaxLines,
  selectSource,
  sourceName,
  type Trace,
} from "./stack";
import type { GrabEntry, GrabFrame, GrabOptions, GrabPayload, ResolvedSource } from "./types";

const KEY_MAX = 120;

const nextByDocument = new WeakMap<Document, boolean>();

function hasNextScript(doc: Document, crossOrigin: boolean): boolean {
  return Array.from(doc.scripts).some((script) => {
    if (!script.src) return false;
    try {
      const url = new URL(script.src, doc.baseURI);
      const origin = new URL(doc.baseURI).origin;
      return (crossOrigin || url.origin === origin) && url.pathname.includes("/_next/static/");
    } catch {
      return false;
    }
  });
}

/** A Next.js page, by its data script, its dev portal or its static scripts. */
function isNext(doc: Document): boolean {
  let next = nextByDocument.get(doc);
  if (next === undefined) {
    const flight = Array.from(doc.scripts).some((script) =>
      script.textContent?.includes("self.__next_f.push"),
    );
    next = Boolean(
      doc.getElementById("__NEXT_DATA__") ||
      doc.querySelector("nextjs-portal") ||
      hasNextScript(doc, false) ||
      (flight && hasNextScript(doc, true)),
    );
    nextByDocument.set(doc, next);
  }
  return next;
}

/**
 * The trace below the element's html. With no app source in the owner stack,
 * the components above it in the fiber tree name it instead.
 */
export function buildTrace(
  stack: StackFrame[],
  fiberSource: ResolvedSource | null,
  ancestors: (max: number, accept: (name: string) => boolean) => string[],
  options: { maxLines?: number; next?: boolean } = {},
): Trace {
  const next = options.next ?? false;
  const selected = selectSource(fiberSource, stack, next);
  // A package's source never leads: node_modules paths are what the trace keeps out.
  const leading = selected?.origin === "app" ? selected : null;
  const maxLines = resolveMaxLines(options.maxLines);
  const trace = formatStack(stack, options, leading);
  if (trace.text) {
    if (trace.hasBudgetedFrame) return trace;
    const missing = ancestors(
      Math.min(maxLines, trace.room),
      (name) => sourceName(name, next) !== null && !trace.names.has(name),
    );
    return missing.length === 0
      ? trace
      : { ...trace, text: `${trace.text}${nameLines(missing)}`, room: trace.room - missing.length };
  }
  const names = ancestors(maxLines, () => true);
  return {
    text: nameLines(names),
    needsSelector: true,
    hasBudgetedFrame: false,
    names: new Set(names),
    room: Math.max(0, Math.max(maxLines, HARD_MAX_LINES) - names.length),
  };
}

/** `[preview trace key selector]` on one line, as react-grab copies it. */
export function formatEntry(
  preview: string,
  trace: string,
  key: string | null,
  selector: string | null,
): string {
  const keyHint = key !== null ? `\n  key: ${JSON.stringify(truncate(key, KEY_MAX))}` : "";
  const selectorHint = selector ? `\n  selector: ${selector}` : "";
  return `[${preview}${`${trace}${keyHint}${selectorHint}`.replace(/\n\s+/g, " ")}]`;
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

export function joinEntries(entries: GrabEntry[]): string {
  return entries.map((entry) => entry.content).join("\n");
}

function toFrame(frame: StackFrame): GrabFrame {
  return {
    functionName: frame.functionName,
    fileName: frame.fileName,
    lineNumber: frame.lineNumber,
    columnNumber: frame.columnNumber,
    isServer: frame.isServer,
    isSymbolicated: frame.isSymbolicated,
  };
}

/** Everything a grab knows about one element. */
export async function grabEntry(element: Element, options: GrabOptions = {}): Promise<GrabEntry> {
  const next = isNext(element.ownerDocument);
  const fiberElement = nearestFiberElement(element);
  const fiber = getFiber(fiberElement);
  const { fiberSource, stack } = fiber ? await resolve(fiber, next, options.signal) : EMPTY;
  const ancestors = (max: number, accept: (name: string) => boolean) =>
    componentNames(fiber, max, (name) => isUsefulName(name, next) && accept(name));
  const trace = buildTrace(stack, fiberSource, ancestors, { maxLines: options.maxLines, next });
  const found = trace.needsSelector
    ? elementSelector(selectorTarget(element))
    : nearestSemanticSelector(element);
  const selector = found && (trace.needsSelector || found.semantic) ? found.selector : null;
  const source = selectSource(fiberSource, stack, next);
  const componentName =
    componentNames(fiber, 1, (name) => isUsefulName(name, next))[0] ??
    source?.componentName ??
    undefined;
  return {
    tagName: (element.tagName || "").toLowerCase(),
    componentName,
    content: formatEntry(htmlPreview(element), trace.text, fiber ? listKey(fiber) : null, selector),
    source,
    stackContext: trace.text,
    frames: stack.map(toFrame),
  };
}

/** One entry per element, duplicates dropped, and their lines joined. */
export async function grabContext(
  elements: Element[],
  options: GrabOptions = {},
): Promise<GrabPayload> {
  const entries = await Promise.all(
    [...new Set(elements)].map((element) => grabEntry(element, options)),
  );
  return { content: joinEntries(entries), entries };
}
