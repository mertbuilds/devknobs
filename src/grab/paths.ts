// adapted from react-grab (MIT, Copyright (c) 2025 Aiden Bai)
import { isSourceFile, normalizeFileName } from "bippy/source";
import type { SourceOrigin } from "./types";

export interface SourceClass {
  origin: SourceOrigin;
  packageName: string | null;
}

/** A bundler layer such as Next's `(app-pages-browser)/`, at the start of a path. */
const LAYER_PREFIX = /^(?:\.\/)?\/?\([a-z][a-z0-9-]*\)\//;

/** A path as an editor wants it: bundler schemes, query strings and layers gone. */
export function normalizeFilePath(fileName: string): string {
  const path = normalizeFileName(fileName).replace(LAYER_PREFIX, "");
  return path.startsWith("./") ? path.slice(2) : path;
}

function decode(input: string): string {
  try {
    return decodeURIComponent(input);
  } catch {
    return input;
  }
}

const NODE_MODULES = /(?:^|[/\\])node_modules[/\\]/;
const VITE_DEPS = /[/\\]\.vite[/\\]deps[^/\\]*[/\\]/;
const EXTENSION = /\.[mc]?[jt]sx?$/i;
const VITE_CHUNK = /^chunk-[A-Za-z0-9_-]+$/;
const SEPARATOR = /[/\\]/;
const NAME_AT_VERSION = /^(.+?)@v?\d/;

function segments(path: string): string[] {
  return path.split(SEPARATOR).filter(Boolean);
}

function nodeModulesPackage(after: string): string | null {
  const [first, second] = segments(after);
  if (!first || first.startsWith(".")) return null;
  if (!first.startsWith("@")) return first;
  return second ? `${first}/${second}` : null;
}

/** Vite flattens `@scope/name` to `@scope_name.js` in its optimized deps. */
function viteDepPackage(after: string): string | null {
  const first = segments(after)[0];
  if (!first) return null;
  const stem = first.replace(EXTENSION, "");
  if (VITE_CHUNK.test(stem)) return null;
  if (!stem.startsWith("@")) return stem;
  const boundary = stem.indexOf("_");
  return boundary === -1 ? null : `${stem.slice(0, boundary)}/${stem.slice(boundary + 1)}`;
}

function afterLastMarker(
  input: string,
  marker: RegExp,
  read: (after: string) => string | null,
): string | null {
  const parts = input.split(marker);
  const last = parts[parts.length - 1];
  return parts.length > 1 && last !== undefined ? read(last) : null;
}

/** A package on a cdn url, as in `/npm/@scope/name@1.2.3/...`. */
function cdnPackage(fileName: string): string | null {
  let url: URL;
  try {
    url = new URL(fileName);
  } catch {
    return null;
  }
  if (!url.hostname) return null;
  const parts = segments(url.pathname).map(decode);
  for (const [index, part] of parts.entries()) {
    const name = NAME_AT_VERSION.exec(part.startsWith("@") ? (parts[index + 1] ?? "") : part)?.[1];
    if (name) return part.startsWith("@") ? `${part}/${name}` : name;
  }
  return null;
}

function markedPackage(fileName: string): string | null {
  const normalized = normalizeFileName(fileName);
  if (!normalized) return null;
  const decoded = decode(normalized);
  return (
    afterLastMarker(decoded, VITE_DEPS, viteDepPackage) ??
    afterLastMarker(decoded, NODE_MODULES, nodeModulesPackage) ??
    cdnPackage(fileName)
  );
}

const SCOPE = /^@[A-Za-z0-9][A-Za-z0-9._-]*$/;
const PACKAGE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** Workspace names a monorepo gives its own app, never a dependency. */
const APP_PACKAGES = new Set(["app", "web", "website", "frontend", "client", "src"]);

/** Scopes that are path aliases, as in `@components/forms`, not npm orgs. */
const ALIAS_SCOPES = new Set([
  "app",
  "src",
  "components",
  "pages",
  "features",
  "modules",
  "hooks",
  "lib",
  "utils",
  "ui",
  "shared",
  "common",
  "core",
  "styles",
  "assets",
]);

/** A source mapped dependency with no marker, as in `../@acme/ui/src/button.tsx`. */
function scopedPackage(fileName: string): string | null {
  let path = decode(normalizeFileName(fileName));
  while (path.startsWith("../") || path.startsWith("./")) {
    path = path.slice(path.startsWith("../") ? 3 : 2);
  }
  if (path.startsWith("/")) return null;
  const [scope, name, ...inner] = segments(path);
  if (
    !scope ||
    !name ||
    inner.length === 0 ||
    !SCOPE.test(scope) ||
    ALIAS_SCOPES.has(scope.slice(1)) ||
    !PACKAGE_SEGMENT.test(name) ||
    EXTENSION.test(name) ||
    APP_PACKAGES.has(name)
  ) {
    return null;
  }
  return `${scope}/${name}`;
}

export function packageName(fileName: string | null | undefined): string | null {
  if (!fileName) return null;
  return markedPackage(fileName) ?? scopedPackage(fileName);
}

/** App source, a package's, or neither, as a bundle or an anonymous script is. */
export function classifySourcePath(fileName: string | null | undefined): SourceClass {
  if (!fileName) return { origin: "unknown", packageName: null };
  const name = packageName(fileName);
  if (name) return { origin: "package", packageName: name };
  if (!isSourceFile(fileName)) return { origin: "unknown", packageName: null };
  return { origin: "app", packageName: null };
}

const SHARED_UI = [
  "/components/ui/",
  "/packages/ui/",
  "/design-system/",
  "/design-systems/",
  "/primitives/",
];

/**
 * A shadcn `components/ui`, a design system or headless primitives: app code,
 * but wrapped around many features, so it says little about the one grabbed.
 */
export function isSharedUiPath(fileName: string | null | undefined): boolean {
  if (!fileName) return false;
  const path = `/${normalizeFilePath(fileName)}/`.toLowerCase();
  return SHARED_UI.some((segment) => path.includes(segment));
}

const BUNDLES = [
  /\/assets\/[^/?#]+-[a-z0-9_-]{6,}\.(?:c|m)?js(?:[?#]|$)/,
  /\/_next\/static\/.*\.(?:c|m)?js(?:[?#]|$)/,
  /\/static\/chunks\/.*\.(?:c|m)?js(?:[?#]|$)/,
];

export function isBundlePath(fileName: string | null | undefined): boolean {
  if (!fileName) return false;
  const path = `/${normalizeFilePath(fileName)}`.toLowerCase();
  return BUNDLES.some((pattern) => pattern.test(path));
}

/** App source that is neither shared ui nor a bundle, and so names the feature. */
export function isTrustedAppPath(fileName: string | null | undefined): boolean {
  return !isSharedUiPath(fileName) && !isBundlePath(fileName);
}
