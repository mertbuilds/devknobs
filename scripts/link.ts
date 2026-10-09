/**
 * Puts this checkout's build into an app's node_modules as a real copy, to try
 * a local build there, and takes it out again. A symlink does not do: Turbopack
 * refuses a package linked from outside the app's root, and other bundlers take
 * the real path for the app's own source. The installed copy waits beside it,
 * as node_modules/.devknobs-installed, until the unlink moves it back. The
 * local copy is made whole in node_modules/.devknobs-linking, then moved into
 * place. Nothing outside those three folders is touched.
 *
 *   bun run link <app-dir>
 *   bun run unlink <app-dir>
 *
 * `pnpm run` does the same. A relative <app-dir> is from this checkout's folder,
 * where both runners start the script.
 */
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

const ROOT = join(import.meta.dir, "..");

/** The package's name, and its folder in node_modules. */
export const NAME = "devknobs";

/** The folder in node_modules where the installed copy waits. */
export const KEPT = ".devknobs-installed";

/** The folder in node_modules where a local copy is made before it takes the package's place, and where the one it replaces goes. */
export const STAGING = ".devknobs-linking";

/** What marks a version as a local copy's. */
export const LOCAL = "-local.";

/** What npm packs whatever the `files` field says. */
const ALWAYS = ["package.json", "README.md", "LICENSE"];

/** What ships where package.json has no `files` field. */
const FILES = ["dist", "CHANGELOG.md", "THIRD_PARTY_NOTICES.md"];

/** The app's folder for what was typed: absolute, under the home folder for `~`, or from where the caller stands. */
export function appDir(typed: string, cwd: string, home: string = homedir()): string {
  if (typed === "~") return home;
  if (typed.startsWith("~/")) return join(home, typed.slice(2));
  return resolve(cwd, typed);
}

/** The app's node_modules, the package's folder in it, where the installed copy waits and where a local copy is made. */
export function linkPaths(app: string): { modules: string; target: string; kept: string; staging: string } {
  const modules = join(app, "node_modules");
  return { modules, target: join(modules, NAME), kept: join(modules, KEPT), staging: join(modules, STAGING) };
}

/** Whether a path is the package's folder, the kept copy or the staging folder in a node_modules, the only three a removal may take. */
export function removable(path: string): boolean {
  const name = basename(path);
  return (name === NAME || name === KEPT || name === STAGING) && basename(dirname(path)) === "node_modules";
}

/** The version a local copy carries, new each second, so a cache keyed on the version sees a new one. */
export function localVersion(version: string, now: number): string {
  return `${version}${LOCAL}${Math.floor(now / 1000)}`;
}

/** The files and folders the published package holds, for a package.json. */
export function published(manifest: Record<string, unknown>): string[] {
  const files = manifest.files;
  const listed = Array.isArray(files) ? files.filter((file) => typeof file === "string") : FILES;
  return [...new Set([...listed, ...ALWAYS])];
}

/** Whether something is at a path, a link to nowhere too. */
function present(path: string): boolean {
  return lstatSync(path, { throwIfNoEntry: false }) !== undefined;
}

function manifestOf(dir: string): Record<string, unknown> {
  const json: unknown = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  if (typeof json !== "object" || json === null || Array.isArray(json)) {
    throw new Error(`${join(dir, "package.json")}: not an object`);
  }
  return { ...json };
}

/** Whether a path holds a local copy: a real folder, not a link, whose version is a local one. */
function isLocal(path: string): boolean {
  if (!lstatSync(path, { throwIfNoEntry: false })?.isDirectory()) return false;
  return existsSync(join(path, "package.json")) && String(manifestOf(path).version).includes(LOCAL);
}

/** Takes the package's folder, the kept copy or the staging folder, or the link in its place, out of a node_modules, and nothing else. */
function remove(path: string): void {
  if (!removable(path)) throw new Error(`will not remove ${path}`);
  rmSync(path, { recursive: true, force: true });
}

/** The app's paths, or an error where it is no app that depends on the package. */
function pathsOf(app: string): ReturnType<typeof linkPaths> {
  const paths = linkPaths(app);
  if (!statSync(app, { throwIfNoEntry: false })?.isDirectory()) throw new Error(`no folder at ${app}`);
  if (!statSync(paths.modules, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(`no node_modules in ${app}: install its packages first`);
  }
  if (!present(paths.target) && !present(paths.kept)) {
    throw new Error(`${app} does not depend on ${NAME}: no node_modules/${NAME}`);
  }
  return paths;
}

/**
 * Moves a local copy out of the package's place into the staging folder, in
 * one step, so no part of it stays there where its removal stops partway: a
 * part of one would pass for a newer install.
 */
function aside(target: string, staging: string): void {
  if (!present(target)) return;
  mkdirSync(staging, { recursive: true });
  renameSync(target, join(staging, "old"));
}

function copyAll(from: string, to: string): void {
  cpSync(from, to, { recursive: true });
}

function runBuild(): void {
  const { status } = spawnSync(process.execPath, ["run", "build"], { cwd: ROOT, stdio: "inherit" });
  if (status !== 0) throw new Error("the build failed");
}

/**
 * Builds, then puts a copy of the published package in the app's node_modules.
 * The installed copy moves aside the first time, a link like a real folder.
 * Where the app installed the package again since, that newer install takes
 * the kept copy's place. The copy is made whole in the staging folder first,
 * and only renames put it in place, so one that fails partway leaves the
 * installed copy where it was, or kept for an unlink to move back. Gives back
 * what to say.
 */
export function link(
  app: string,
  build: () => void = runBuild,
  root: string = ROOT,
  now: number = Date.now(),
  copy: (from: string, to: string) => void = copyAll,
): string[] {
  const { target, kept, staging } = pathsOf(app);
  build();
  const manifest = manifestOf(root);
  const version = localVersion(String(manifest.version), now);
  const made = join(staging, "new");
  const local = isLocal(target);
  remove(staging);
  mkdirSync(made, { recursive: true });
  for (const file of published(manifest)) {
    if (existsSync(join(root, file))) copy(join(root, file), join(made, file));
  }
  writeFileSync(join(made, "package.json"), `${JSON.stringify({ ...manifest, version }, null, 2)}\n`);
  if (present(target) && !local) {
    remove(kept);
    renameSync(target, kept);
  } else aside(target, staging);
  renameSync(made, target);
  remove(staging);
  return [`linked ${NAME} ${version} into ${target}, as a copy`, "restart the app's dev server to pick it up"];
}

/**
 * Takes the local copy out and moves the installed copy back. Where the app
 * installed the package again since the link, that newer install stays and the
 * kept copy is removed. Without one to move back, a local copy is still
 * removed, and anything else stays. What a link that failed left in the
 * staging folder is removed too. Gives back what to say.
 */
export function unlink(app: string): string[] {
  const { target, kept, staging } = pathsOf(app);
  const restart = "restart the app's dev server to pick it up";
  remove(staging);
  const local = isLocal(target);
  if (present(kept)) {
    if (present(target) && !local) {
      remove(kept);
      return [`left the newer installed ${NAME} in ${target} and removed the older kept copy`];
    }
    aside(target, staging);
    renameSync(kept, target);
    remove(staging);
    return [`removed the local copy and restored the installed ${NAME} in ${target}`, restart];
  }
  if (!local) return [`nothing to restore: ${target} is not a local copy`];
  remove(target);
  return [`removed the local copy at ${target}`, `nothing to restore: install ${NAME} in the app again`];
}

if (import.meta.main) {
  const [command, typed] = process.argv.slice(2);
  try {
    if ((command !== "link" && command !== "unlink") || !typed) {
      throw new Error("usage: bun run link <app-dir>, bun run unlink <app-dir>");
    }
    const app = appDir(typed, process.cwd());
    console.log((command === "link" ? link(app) : unlink(app)).join("\n"));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
