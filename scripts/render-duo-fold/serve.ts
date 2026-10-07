/**
 * Serves the renderer and a clone of jadon7/iphone-duo with its assets
 * prepared, and writes what the renderer sends to /save/ into the master
 * folder. Offline only, never part of the package: see README.md here.
 *
 *   [PORT=8767] bun scripts/render-duo-fold/serve.ts <iphone-duo clone> <master folder>
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, normalize, resolve } from "node:path";

const [clone, master] = process.argv.slice(2).map((path) => resolve(path));
if (!clone || !master) throw new Error("usage: serve.ts <iphone-duo clone> <master folder>");
mkdirSync(master, { recursive: true });
const HERE = import.meta.dir;
const PORT = Number(process.env.PORT) || 8767;

/** A file under `root`, or null for a path that leaves it. */
function under(root: string, path: string): string | null {
  const file = normalize(join(root, path));
  return file.startsWith(`${root}/`) ? file : null;
}

Bun.serve({
  hostname: "127.0.0.1",
  port: PORT,
  async fetch(request) {
    const { pathname } = new URL(request.url);
    const saving = /^\/save\/([\w.-]+)$/.exec(pathname);
    if (saving?.[1] && request.method === "POST") {
      writeFileSync(join(master, saving[1]), new Uint8Array(await request.arrayBuffer()));
      return new Response("saved");
    }
    const file = pathname.startsWith("/iphone-duo/")
      ? under(clone, decodeURIComponent(pathname.slice("/iphone-duo/".length)))
      : under(HERE, pathname === "/" ? "render.html" : pathname.slice(1));
    const found = file ? Bun.file(file) : null;
    return found && (await found.exists()) ? new Response(found) : new Response("not found", { status: 404 });
  },
});
console.log(`open http://127.0.0.1:${PORT}/?run to render into ${master}`);
