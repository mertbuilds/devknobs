/**
 * Writes src/engine/bezelurls.ts, where each image in assets/bezels gets its
 * own `new URL("./bezels/...", import.meta.url)`, written out so a bundler
 * finds the image and takes it along. Without the folder the map is empty, so
 * no bundle asks for a file that is not there. The build runs it first.
 *
 *   bun scripts/bezelurls.ts
 */
import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");

/** The images in a folder, by name, or none where there is no folder. */
export function bezelFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((file) => file.endsWith(".webp"))
    .sort();
}

function entry(file: string): string {
  const key = `  ${JSON.stringify(file)}: () =>`;
  const value = `new URL(${JSON.stringify(`./bezels/${file}`)}, import.meta.url).href,`;
  const line = `${key} ${value}`;
  return line.length <= 100 ? line : `${key}\n    ${value}`;
}

/** The module's source for these images. */
export function bezelUrlsModule(files: readonly string[]): string {
  const map = files.length === 0 ? "{}" : `{\n${files.map(entry).join("\n")}\n}`;
  return `// Written by scripts/bezelurls.ts from assets/bezels: run \`bun run build\` after changing the folder.

/** Where each image is, beside the built module. */
export const BEZEL_URLS: Record<string, () => string> = ${map};
`;
}

if (import.meta.main) {
  const files = bezelFiles(join(ROOT, "assets", "bezels"));
  writeFileSync(join(ROOT, "src", "engine", "bezelurls.ts"), bezelUrlsModule(files));
}
