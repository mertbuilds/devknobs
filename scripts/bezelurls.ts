/**
 * Writes src/engine/bezelurls.ts, where each image in assets/bezels gets its
 * own `new URL("./bezels/...", import.meta.url)`, written out so a bundler
 * finds the image and takes it along, and the corners of the Duo's fold
 * frames in assets/bezels/duo-fold come from its manifest.json. Without the
 * folder the map is empty and there are no frames, so no bundle asks for a
 * file that is not there. The build runs it first.
 *
 *   bun scripts/bezelurls.ts
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { FoldShot, FoldShots, Pair, Quad } from "../src/engine/fold";

const ROOT = join(import.meta.dir, "..");

/** The folder of the Duo's fold frames, in assets/bezels. */
export const FOLD_FOLDER = "duo-fold";

/** The images in a folder and the folders in it, by name, or none where there is no folder. */
export function bezelFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .flatMap((file) =>
      statSync(join(dir, file)).isDirectory()
        ? bezelFiles(join(dir, file)).map((inner) => `${file}/${inner}`)
        : [file],
    )
    .filter((file) => file.endsWith(".webp"))
    .sort();
}

function numbers(value: unknown, length: number, what: string): number[] {
  if (!Array.isArray(value) || value.length !== length) throw new Error(`${what}: not ${length} numbers`);
  return value.map((item) => {
    if (typeof item !== "number" || !Number.isFinite(item)) throw new Error(`${what}: not a number`);
    return item;
  });
}

function quadOf(value: unknown, what: string): Quad {
  if (!Array.isArray(value) || value.length !== 4) throw new Error(`${what}: not 4 corners`);
  const [a, b, c, d] = value.map((corner): Pair => {
    const [x, y] = numbers(corner, 2, what);
    return [x, y];
  });
  if (!a || !b || !c || !d) throw new Error(`${what}: not 4 corners`);
  return [a, b, c, d];
}

function shotOf(value: unknown, index: number): FoldShot {
  const what = `frame ${index}`;
  if (typeof value !== "object" || value === null) throw new Error(`${what}: not an object`);
  const deg = "deg" in value ? value.deg : null;
  const file = "file" in value ? value.file : null;
  if (typeof deg !== "number" || typeof file !== "string" || !/^[\w.-]+\.webp$/.test(file)) {
    throw new Error(`${what}: no angle or file`);
  }
  const [left, top, right, bottom] = numbers("box" in value ? value.box : null, 4, `${what} box`);
  return {
    deg,
    file: `${FOLD_FOLDER}/${file}`,
    box: [left, top, right, bottom],
    inner: quadOf("inner" in value ? value.inner : null, `${what} inner`),
    cover: quadOf("cover" in value ? value.cover : null, `${what} cover`),
  };
}

/** The fold frames a manifest.json names, checked, from open to shut. */
export function foldShotsOf(json: unknown): FoldShots {
  if (typeof json !== "object" || json === null) throw new Error("manifest: not an object");
  const [x, y, width, height] = numbers("open" in json ? json.open : null, 4, "open");
  const list = "frames" in json ? json.frames : null;
  if (!Array.isArray(list) || list.length < 2) throw new Error("manifest: no frames");
  const frames = list.map(shotOf).sort((a, b) => a.deg - b.deg);
  if (frames[0]?.deg !== 0 || frames.at(-1)?.deg !== 180) throw new Error("manifest: not 0 to 180 degrees");
  return { open: [x, y, width, height], frames };
}

/** The frames in the folder, or null where it or its manifest is not there. */
export function foldShotsIn(dir: string): FoldShots | null {
  const manifest = join(dir, FOLD_FOLDER, "manifest.json");
  return existsSync(manifest) ? foldShotsOf(JSON.parse(readFileSync(manifest, "utf8"))) : null;
}

function entry(file: string): string {
  const key = `  ${JSON.stringify(file)}: () =>`;
  const value = `new URL(${JSON.stringify(`./bezels/${file}`)}, import.meta.url).href,`;
  const line = `${key} ${value}`;
  return line.length <= 100 ? line : `${key}\n    ${value}`;
}

function list(values: readonly (number | readonly number[])[]): string {
  return `[${values.map((value) => (typeof value === "number" ? String(value) : list(value))).join(", ")}]`;
}

function shotEntry(shot: FoldShot): string {
  return [
    "    {",
    `      deg: ${shot.deg},`,
    `      file: ${JSON.stringify(shot.file)},`,
    `      box: ${list(shot.box)},`,
    `      inner: ${list(shot.inner)},`,
    `      cover: ${list(shot.cover)},`,
    "    },",
  ].join("\n");
}

/** The module's source for these images, and these fold frames. */
export function bezelUrlsModule(files: readonly string[], shots: FoldShots | null = null): string {
  const map = files.length === 0 ? "{}" : `{\n${files.map(entry).join("\n")}\n}`;
  const fold = shots
    ? `{\n  open: ${list(shots.open)},\n  frames: [\n${shots.frames.map(shotEntry).join("\n")}\n  ],\n}`
    : "null";
  return `// Written by scripts/bezelurls.ts from assets/bezels: run \`bun run build\` after changing the folder.

import type { FoldShots } from "./fold";

/** Where each image is, beside the built module. */
export const BEZEL_URLS: Record<string, () => string> = ${map};

/** The frames of the Duo's turning half, in assets/bezels/${FOLD_FOLDER}, or null without them. */
export const DUO_FOLD: FoldShots | null = ${fold};
`;
}

if (import.meta.main) {
  const dir = join(ROOT, "assets", "bezels");
  writeFileSync(join(ROOT, "src", "engine", "bezelurls.ts"), bezelUrlsModule(bezelFiles(dir), foldShotsIn(dir)));
}
