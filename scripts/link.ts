/**
 * Puts this checkout's build into an app's node_modules as a real copy, to try
 * a local build there, and takes it out again. A symlink does not do: Turbopack
 * refuses a package linked from outside the app's root, and other bundlers take
 * the real path for the app's own source. The installed copy waits beside it,
 * as node_modules/.devknobs-installed, until the unlink moves it back. Nothing
 * outside those two folders is touched.
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

/** The app's node_modules, the package's folder in it and where the installed copy waits. */
export function linkPaths(app: string): { modules: string; target: string; kept: string } {
  const modules = join(app, "node_modules");
  return { modules, target: join(modules, NAME), kept: join(modules, KEPT) };
}

/** Whether a path is the package's folder or the kept copy in a node_modules, the only two a removal may take. */
export function removable(path: string): boolean {
  const name = basename(path);
  return (name === NAME || name === KEPT) && basename(dirname(path)) === "node_modules";
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

/** Takes the package's folder or the kept copy, or the link in its place, out of a node_modules, and nothing else. */
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

function runBuild(): void {
  const { status } = spawnSync(process.execPath, ["run", "build"], { cwd: ROOT, stdio: "inherit" });
  if (status !== 0) throw new Error("the build failed");
}

/**
 * Builds, then puts a copy of the published package in the app's node_modules.
 * The installed copy moves aside the first time, a link like a real folder.
 * Where the app installed the package again since, that newer install takes
 * the kept copy's place. Gives back what to say.
 */
export function link(
  app: string,
  build: () => void = runBuild,
  root: string = ROOT,
  now: number = Date.now(),
): string[] {
  const { target, kept } = pathsOf(app);
  build();
  const manifest = manifestOf(root);
  const version = localVersion(String(manifest.version), now);
  if (present(target) && !isLocal(target)) {
    remove(kept);
    renameSync(target, kept);
  } else remove(target);
  mkdirSync(target);
  for (const file of published(manifest)) {
    if (existsSync(join(root, file))) cpSync(join(root, file), join(target, file), { recursive: true });
  }
  writeFileSync(join(target, "package.json"), `${JSON.stringify({ ...manifest, version }, null, 2)}\n`);
  return [`linked ${NAME} ${version} into ${target}, as a copy`, "restart the app's dev server to pick it up"];
}

/**
 * Takes the local copy out and moves the installed copy back. Where the app
 * installed the package again since the link, that newer install stays and the
 * kept copy is removed. Without one to move back, a local copy is still
 * removed, and anything else stays. Gives back what to say.
 */
export function unlink(app: string): string[] {
  const { target, kept } = pathsOf(app);
  const restart = "restart the app's dev server to pick it up";
  const local = isLocal(target);
  if (present(kept)) {
    if (present(target) && !local) {
      remove(kept);
      return [`left the newer installed ${NAME} in ${target} and removed the older kept copy`];
    }
    remove(target);
    renameSync(kept, target);
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
