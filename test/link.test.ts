import { afterEach, describe, expect, test } from "bun:test";
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { appDir, KEPT, link, linkPaths, localVersion, published, removable, STAGING, unlink } from "../scripts/link";

const made: string[] = [];

/** A new folder of its own under the temp folder, removed after the test. */
function temp(): string {
  const dir = mkdtempSync(join(tmpdir(), "devknobs-link-"));
  made.push(dir);
  return dir;
}

/** Writes a file and the folders above it. */
function write(path: string, text: string): void {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, text);
}

/** A checkout with a package.json and a README, and no build yet. */
function fakeRoot(): string {
  const root = temp();
  write(join(root, "package.json"), JSON.stringify({ name: "devknobs", version: "1.2.3", files: ["dist", "CHANGELOG.md"] }));
  write(join(root, "README.md"), "readme");
  write(join(root, "CHANGELOG.md"), "changes");
  write(join(root, "scripts", "link.ts"), "not published");
  return root;
}

/** A build that writes the checkout's dist. */
function fakeBuild(root: string): () => void {
  return () => write(join(root, "dist", "ui", "index.js"), "local");
}

/** An app with the package installed from the registry. */
function fakeApp(): string {
  const app = temp();
  write(join(app, "node_modules", "devknobs", "package.json"), JSON.stringify({ name: "devknobs", version: "1.0.0" }));
  write(join(app, "node_modules", "devknobs", "dist", "index.js"), "installed");
  write(join(app, "node_modules", "other", "index.js"), "other");
  return app;
}

/** An app with the package installed the pnpm way: a relative link into a store in its node_modules. */
function fakePnpmApp(version = "1.0.0"): string {
  const app = temp();
  write(join(storeOf(app, version), "package.json"), JSON.stringify({ name: "devknobs", version }));
  write(join(storeOf(app, version), "dist", "index.js"), "installed");
  symlinkSync(storeLink(version), linkPaths(app).target);
  return app;
}

/** The store folder for a version in a pnpm app. */
function storeOf(app: string, version: string): string {
  return join(app, "node_modules", storeLink(version));
}

/** What the pnpm link for a version says. */
function storeLink(version: string): string {
  return join(".pnpm", `devknobs@${version}`, "node_modules", "devknobs");
}

/** A copy that writes what comes before `file`, then fails as a full disk does. */
function failingCopy(file: string): (from: string, to: string) => void {
  return (from, to) => {
    if (basename(from) === file) throw new Error("the disk is full");
    cpSync(from, to, { recursive: true });
  };
}

function versionAt(dir: string): unknown {
  const json: unknown = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  return typeof json === "object" && json !== null && "version" in json ? json.version : null;
}

afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("link paths", () => {
  test("an app's folder is absolute, under the home folder or from where the caller stands", () => {
    expect(appDir("/apps/site", "/work", "/home/me")).toBe("/apps/site");
    expect(appDir("../site", "/work/devknobs", "/home/me")).toBe("/work/site");
    expect(appDir("site/", "/work", "/home/me")).toBe("/work/site");
    expect(appDir("~", "/work", "/home/me")).toBe("/home/me");
    expect(appDir("~/code/site", "/work", "/home/me")).toBe("/home/me/code/site");
    expect(appDir("~site", "/work", "/home/me")).toBe("/work/~site");
  });

  test("the three folders are in the app's node_modules", () => {
    expect(linkPaths("/apps/site")).toEqual({
      modules: "/apps/site/node_modules",
      target: "/apps/site/node_modules/devknobs",
      kept: `/apps/site/node_modules/${KEPT}`,
      staging: `/apps/site/node_modules/${STAGING}`,
    });
  });

  test("only the package's folder, the kept copy and the staging folder in a node_modules may be removed", () => {
    expect(removable("/apps/site/node_modules/devknobs")).toBe(true);
    expect(removable("/apps/site/node_modules/devknobs/")).toBe(true);
    expect(removable("/apps/site/node_modules")).toBe(false);
    expect(removable("/apps/site/node_modules/react")).toBe(false);
    expect(removable("/apps/site/node_modules/devknobs/dist")).toBe(false);
    expect(removable("/apps/site/node_modules/@scope/devknobs")).toBe(false);
    expect(removable("/apps/devknobs")).toBe(false);
    expect(removable(`/apps/site/node_modules/${KEPT}`)).toBe(true);
    expect(removable(`/apps/site/node_modules/${KEPT}/dist`)).toBe(false);
    expect(removable(`/apps/site/node_modules/@scope/${KEPT}`)).toBe(false);
    expect(removable(`/apps/${KEPT}`)).toBe(false);
    expect(removable(`/apps/site/node_modules/${STAGING}`)).toBe(true);
    expect(removable(`/apps/site/node_modules/${STAGING}/dist`)).toBe(false);
    expect(removable(`/apps/site/node_modules/@scope/${STAGING}`)).toBe(false);
    expect(removable(`/apps/${STAGING}`)).toBe(false);
    expect(removable(`/apps/site/node_modules/${STAGING}x`)).toBe(false);
    expect(removable("/apps/site/node_modules/.devknobs")).toBe(false);
    expect(removable("/")).toBe(false);
  });

  test("a local version carries the second it was made", () => {
    expect(localVersion("0.1.1", 1_760_000_000_999)).toBe("0.1.1-local.1760000000");
  });

  test("the published files are the files field and what npm always packs", () => {
    expect(published({ files: ["dist", "CHANGELOG.md", "README.md"] })).toEqual([
      "dist",
      "CHANGELOG.md",
      "README.md",
      "package.json",
      "LICENSE",
    ]);
    expect(published({})).toEqual([
      "dist",
      "CHANGELOG.md",
      "THIRD_PARTY_NOTICES.md",
      "package.json",
      "README.md",
      "LICENSE",
    ]);
  });
});

describe("link and unlink", () => {
  test("a link copies the build in and an unlink puts the installed copy back", () => {
    const root = fakeRoot();
    const app = fakeApp();
    const { target, kept } = linkPaths(app);

    const said = link(app, fakeBuild(root), root, 5_000);
    expect(said).toHaveLength(2);
    expect(said[0]).toContain("1.2.3-local.5");
    expect(said[1]).toContain("restart");
    expect(lstatSync(target).isSymbolicLink()).toBe(false);
    expect(readFileSync(join(target, "dist", "ui", "index.js"), "utf8")).toBe("local");
    expect(readFileSync(join(target, "README.md"), "utf8")).toBe("readme");
    expect(readFileSync(join(target, "CHANGELOG.md"), "utf8")).toBe("changes");
    expect(existsSync(join(target, "scripts"))).toBe(false);
    expect(existsSync(join(target, "dist", "index.js"))).toBe(false);
    expect(versionAt(target)).toBe("1.2.3-local.5");
    expect(versionAt(root)).toBe("1.2.3");
    expect(versionAt(kept)).toBe("1.0.0");

    expect(unlink(app)[0]).toContain("restored");
    expect(existsSync(kept)).toBe(false);
    expect(versionAt(target)).toBe("1.0.0");
    expect(readFileSync(join(target, "dist", "index.js"), "utf8")).toBe("installed");
    expect(existsSync(join(target, "dist", "ui"))).toBe(false);
    expect(readFileSync(join(app, "node_modules", "other", "index.js"), "utf8")).toBe("other");
  });

  test("a second link keeps the first installed copy", () => {
    const root = fakeRoot();
    const app = fakeApp();
    const { target, kept } = linkPaths(app);
    link(app, fakeBuild(root), root, 5_000);
    link(app, fakeBuild(root), root, 9_000);
    expect(versionAt(target)).toBe("1.2.3-local.9");
    expect(versionAt(kept)).toBe("1.0.0");
    unlink(app);
    expect(versionAt(target)).toBe("1.0.0");
  });

  test("a link in the package's place is kept and put back, and what it points at stays", () => {
    const root = fakeRoot();
    const app = fakePnpmApp();
    const { target, kept } = linkPaths(app);
    const store = storeOf(app, "1.0.0");

    link(app, fakeBuild(root), root, 5_000);
    expect(lstatSync(target).isSymbolicLink()).toBe(false);
    expect(versionAt(target)).toBe("1.2.3-local.5");
    expect(lstatSync(kept).isSymbolicLink()).toBe(true);
    expect(realpathSync(kept)).toBe(realpathSync(store));
    expect(versionAt(store)).toBe("1.0.0");
    expect(existsSync(join(store, "dist", "ui"))).toBe(false);

    expect(unlink(app)[0]).toContain("restored");
    expect(existsSync(kept)).toBe(false);
    expect(lstatSync(target).isSymbolicLink()).toBe(true);
    expect(readlinkSync(target)).toBe(storeLink("1.0.0"));
    expect(realpathSync(target)).toBe(realpathSync(store));
    expect(versionAt(target)).toBe("1.0.0");
    expect(readFileSync(join(store, "dist", "index.js"), "utf8")).toBe("installed");
    expect(existsSync(join(store, "dist", "ui"))).toBe(false);
  });

  test("an unlink after the app installed a real folder again leaves it and drops the kept copy", () => {
    const root = fakeRoot();
    const app = fakeApp();
    const { target, kept } = linkPaths(app);
    link(app, fakeBuild(root), root, 5_000);
    rmSync(target, { recursive: true });
    write(join(target, "package.json"), JSON.stringify({ name: "devknobs", version: "2.0.0" }));

    const said = unlink(app);
    expect(said[0]).toContain("newer");
    expect(said[0]).not.toContain("restored");
    expect(versionAt(target)).toBe("2.0.0");
    expect(existsSync(kept)).toBe(false);
  });

  test("an unlink after the app installed a link again leaves it and drops the kept copy", () => {
    const root = fakeRoot();
    const app = fakePnpmApp();
    const { target, kept } = linkPaths(app);
    link(app, fakeBuild(root), root, 5_000);
    rmSync(target, { recursive: true });
    write(join(storeOf(app, "2.0.0"), "package.json"), JSON.stringify({ name: "devknobs", version: "2.0.0" }));
    symlinkSync(storeLink("2.0.0"), target);

    expect(unlink(app)[0]).toContain("newer");
    expect(readlinkSync(target)).toBe(storeLink("2.0.0"));
    expect(versionAt(target)).toBe("2.0.0");
    expect(lstatSync(kept, { throwIfNoEntry: false })).toBeUndefined();
    expect(versionAt(storeOf(app, "1.0.0"))).toBe("1.0.0");
    expect(versionAt(storeOf(app, "2.0.0"))).toBe("2.0.0");
  });

  test("a link after the app installed a real folder again keeps the newer install", () => {
    const root = fakeRoot();
    const app = fakeApp();
    const { target, kept } = linkPaths(app);
    link(app, fakeBuild(root), root, 5_000);
    rmSync(target, { recursive: true });
    write(join(target, "package.json"), JSON.stringify({ name: "devknobs", version: "2.0.0" }));

    link(app, fakeBuild(root), root, 9_000);
    expect(versionAt(target)).toBe("1.2.3-local.9");
    expect(versionAt(kept)).toBe("2.0.0");
    expect(unlink(app)[0]).toContain("restored");
    expect(versionAt(target)).toBe("2.0.0");
    expect(existsSync(kept)).toBe(false);
  });

  test("a link after the app installed a link again keeps the newer install", () => {
    const root = fakeRoot();
    const app = fakePnpmApp();
    const { target, kept } = linkPaths(app);
    link(app, fakeBuild(root), root, 5_000);
    rmSync(target, { recursive: true });
    write(join(storeOf(app, "2.0.0"), "package.json"), JSON.stringify({ name: "devknobs", version: "2.0.0" }));
    symlinkSync(storeLink("2.0.0"), target);

    link(app, fakeBuild(root), root, 9_000);
    expect(versionAt(target)).toBe("1.2.3-local.9");
    expect(readlinkSync(kept)).toBe(storeLink("2.0.0"));
    expect(unlink(app)[0]).toContain("restored");
    expect(readlinkSync(target)).toBe(storeLink("2.0.0"));
    expect(versionAt(target)).toBe("2.0.0");
    expect(versionAt(storeOf(app, "1.0.0"))).toBe("1.0.0");
    expect(existsSync(join(storeOf(app, "2.0.0"), "dist"))).toBe(false);
  });

  test("an unlink with nothing linked leaves the installed copy", () => {
    const app = fakeApp();
    expect(unlink(app)).toHaveLength(1);
    expect(unlink(app)[0]).toContain("nothing to restore");
    expect(versionAt(linkPaths(app).target)).toBe("1.0.0");
  });

  test("an app that is missing, has no node_modules or no devknobs is an error, before any build", () => {
    const root = fakeRoot();
    const build = (): void => {
      throw new Error("built");
    };
    const empty = temp();
    expect(() => link(join(empty, "nowhere"), build, root)).toThrow("no folder");
    expect(() => link(empty, build, root)).toThrow("no node_modules");
    expect(() => unlink(empty)).toThrow("no node_modules");
    mkdirSync(join(empty, "node_modules"));
    expect(() => link(empty, build, root)).toThrow("does not depend on devknobs");
    expect(() => unlink(empty)).toThrow("does not depend on devknobs");
  });

  test("a build that fails leaves the app as it was", () => {
    const root = fakeRoot();
    const app = fakeApp();
    const { target, kept } = linkPaths(app);
    expect(() =>
      link(app, () => {
        throw new Error("the build failed");
      }, root),
    ).toThrow("the build failed");
    expect(versionAt(target)).toBe("1.0.0");
    expect(existsSync(kept)).toBe(false);
  });

  test("a copy that fails partway leaves the installed copy in place, and an unlink leaves it", () => {
    const root = fakeRoot();
    const app = fakeApp();
    const { target, kept, staging } = linkPaths(app);
    expect(() => link(app, fakeBuild(root), root, 5_000, failingCopy("README.md"))).toThrow("the disk is full");
    expect(versionAt(target)).toBe("1.0.0");
    expect(readFileSync(join(target, "dist", "index.js"), "utf8")).toBe("installed");
    expect(existsSync(kept)).toBe(false);

    expect(unlink(app)[0]).toContain("nothing to restore");
    expect(versionAt(target)).toBe("1.0.0");
    expect(existsSync(staging)).toBe(false);
  });

  test("a copy that fails partway over a local copy keeps the kept copy, and an unlink restores it", () => {
    const root = fakeRoot();
    const app = fakeApp();
    const { target, kept, staging } = linkPaths(app);
    link(app, fakeBuild(root), root, 5_000);
    expect(() => link(app, fakeBuild(root), root, 9_000, failingCopy("README.md"))).toThrow("the disk is full");
    expect(versionAt(target)).toBe("1.2.3-local.5");
    expect(versionAt(kept)).toBe("1.0.0");

    expect(unlink(app)[0]).toContain("restored");
    expect(versionAt(target)).toBe("1.0.0");
    expect(readFileSync(join(target, "dist", "index.js"), "utf8")).toBe("installed");
    expect(existsSync(kept)).toBe(false);
    expect(existsSync(staging)).toBe(false);
  });

  test("a copy that fails partway beside a link leaves the link, and what it points at stays", () => {
    const root = fakeRoot();
    const app = fakePnpmApp();
    const { target, kept, staging } = linkPaths(app);
    expect(() => link(app, fakeBuild(root), root, 5_000, failingCopy("README.md"))).toThrow("the disk is full");
    expect(readlinkSync(target)).toBe(storeLink("1.0.0"));
    expect(lstatSync(kept, { throwIfNoEntry: false })).toBeUndefined();
    unlink(app);
    expect(readlinkSync(target)).toBe(storeLink("1.0.0"));
    expect(versionAt(storeOf(app, "1.0.0"))).toBe("1.0.0");
    expect(existsSync(join(storeOf(app, "1.0.0"), "dist", "ui"))).toBe(false);
    expect(existsSync(staging)).toBe(false);
  });

  test("a staging folder left by a link that failed is removed by the next link, and never linked", () => {
    const root = fakeRoot();
    const app = fakeApp();
    const { target, kept, staging } = linkPaths(app);
    // What the failed link wrote where it made its copy, beside what it copied.
    const stray = (from: string, to: string): void => {
      write(join(to, "..", "stale.js"), "stale");
      failingCopy("dist")(from, to);
    };
    expect(() => link(app, fakeBuild(root), root, 5_000, stray)).toThrow("the disk is full");
    expect(existsSync(staging)).toBe(true);

    link(app, fakeBuild(root), root, 9_000);
    expect(existsSync(staging)).toBe(false);
    expect(existsSync(join(target, "stale.js"))).toBe(false);
    expect(versionAt(target)).toBe("1.2.3-local.9");
    expect(readFileSync(join(target, "README.md"), "utf8")).toBe("readme");
    expect(versionAt(kept)).toBe("1.0.0");
    unlink(app);
    expect(versionAt(target)).toBe("1.0.0");
  });

  test("an installed copy whose package.json does not parse is an error that leaves it, and no staging folder", () => {
    const root = fakeRoot();
    const app = fakeApp();
    const { target, kept, staging } = linkPaths(app);
    write(join(target, "package.json"), "{");

    expect(() => link(app, fakeBuild(root), root, 5_000)).toThrow(SyntaxError);
    expect(existsSync(staging)).toBe(false);
    expect(existsSync(kept)).toBe(false);
    expect(readFileSync(join(target, "package.json"), "utf8")).toBe("{");
    expect(readFileSync(join(target, "dist", "index.js"), "utf8")).toBe("installed");

    write(join(staging, "new", "stale.js"), "stale");
    expect(() => unlink(app)).toThrow(SyntaxError);
    expect(existsSync(staging)).toBe(false);
    expect(readFileSync(join(target, "package.json"), "utf8")).toBe("{");
    expect(readFileSync(join(target, "dist", "index.js"), "utf8")).toBe("installed");
  });
});
