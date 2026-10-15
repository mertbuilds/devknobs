/**
 * Checks the built files in dist.tmp, modules and declarations: none has any
 * of the controls a fold's look is tuned by, `src/engine/foldtune.ts`. Those
 * are for development from source only. The build defines `DEVKNOBS_TUNE`
 * false so the bundler leaves them out, and this fails a build where it did
 * not. The build runs it before dist.tmp becomes dist.
 *
 *   bun scripts/tunefree.ts
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");

/**
 * What only the controls have, each in a clean build nowhere: the module by
 * its name, which is in its key on `window` too, and the guard itself, left
 * in where the build did not define it, then names, labels and sentences of
 * the table, its switches and its sets.
 */
export const MARKERS = [
  "foldtune",
  "DEVKNOBS_TUNE",
  "foldTune",
  "installTune",
  "For finding what draws a line",
  "end blur hinge",
  "black as magenta",
  "backTint",
  "frameOn",
  "stillOn",
  "shadeOn",
  "jadon blur",
  "jadonBlur",
  "JADON",
  "drawnBy",
  "no fold has drawn yet",
] as const;

/** Which of the controls' marks these files have, by file name, or nothing. */
export function tuneFaults(files: Readonly<Record<string, string>>, markers: readonly string[] = MARKERS): string[] {
  return Object.entries(files).flatMap(([file, source]) =>
    markers.filter((marker) => source.includes(marker)).map((marker) => `${file}: has "${marker}"`),
  );
}

/** Is this a file the check reads: a module or a declaration. */
export function checked(file: string): boolean {
  return file.endsWith(".js") || file.endsWith(".d.ts");
}

if (import.meta.main) {
  const dir = join(ROOT, "dist.tmp");
  const files = existsSync(dir) ? readdirSync(dir, { recursive: true, encoding: "utf8" }).filter(checked) : [];
  const faults = tuneFaults(Object.fromEntries(files.map((file) => [file, readFileSync(join(dir, file), "utf8")])));
  if (faults.length > 0) {
    console.error(faults.join("\n"));
    console.error("The fold's tuning controls are in the build. They are for development from source and must not ship: see DEVKNOBS_TUNE in the README.");
    process.exit(1);
  }
}
