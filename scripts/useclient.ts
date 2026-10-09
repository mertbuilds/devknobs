/**
 * Checks the built modules in dist.tmp: a `"use client"` directive is on a
 * module's first line or nowhere in it, and the react entry has one. Next.js
 * under webpack refuses a module with the directive below other code. The
 * build runs it before dist.tmp becomes dist.
 *
 *   bun scripts/useclient.ts
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");

const DIRECTIVE = /^\s*(["'])use client\1;?\s*$/;

/** The lines, from 1, where a module has the directive. */
export function directiveLines(source: string): number[] {
  return source.split("\n").flatMap((line, index) => (DIRECTIVE.test(line) ? [index + 1] : []));
}

/** What is wrong with the directives of these modules, by file name, or nothing. */
export function directiveFaults(modules: Readonly<Record<string, string>>, entry = "react.js"): string[] {
  const faults = Object.entries(modules).flatMap(([file, source]) =>
    directiveLines(source)
      .filter((line) => line !== 1)
      .map((line) => `${file}:${line}: "use client" below the first line`),
  );
  const first = modules[entry]?.split("\n")[0] ?? "";
  return DIRECTIVE.test(first) ? faults : [...faults, `${entry}: no "use client" on the first line`];
}

if (import.meta.main) {
  const dir = join(ROOT, "dist.tmp");
  const files = existsSync(dir) ? readdirSync(dir).filter((file) => file.endsWith(".js")) : [];
  const faults = directiveFaults(Object.fromEntries(files.map((file) => [file, readFileSync(join(dir, file), "utf8")])));
  if (faults.length > 0) {
    console.error(faults.join("\n"));
    process.exit(1);
  }
}
