import type { RequestStore } from "./store";
import type { RequestEntry } from "./types";

/** The shape of what the copies of devknobs on a page share. A copy that finds another starts over. */
export const SHARED_VERSION = 1;

/**
 * The one recorder on a page. The early script and the full one are two
 * copies of this code, and the first to run patches the page and leaves the
 * recorder here, on the window. The second finds it and patches nothing. The
 * copy in the device frame reaches the page's log through it too.
 */
export interface Shared {
  version: typeof SHARED_VERSION;
  store: RequestStore;
  /** Run `request`, which asks for `url`, and keep it out of the log. */
  quietly<T>(url: string, request: () => T): T;
  /** Keep what loads from `url` out of the log: always, or the next load only. */
  hush(url: string, once: boolean): void;
  /** Take in rows of the copy in the device frame, marked as the frame's. */
  adopt(rows: readonly RequestEntry[]): void;
  /** Hand the page back to the browser and drop the log. */
  uninstall(): void;
}

const SHARED = Symbol.for("devknobs.requests");

function isShared(value: unknown): value is Shared {
  return typeof value === "object" && value !== null && Reflect.get(value, "version") === SHARED_VERSION;
}

/** The recorder on `scope`, this window unless told. Null where there is none, or none to read. */
export function shared(scope: object = globalThis): Shared | null {
  try {
    const value: unknown = Reflect.get(scope, SHARED);
    return isShared(value) ? value : null;
  } catch {
    // A window on another origin.
    return null;
  }
}

export function share(recorder: Shared | null): void {
  if (recorder) Reflect.set(globalThis, SHARED, recorder);
  else Reflect.deleteProperty(globalThis, SHARED);
}

/** Let a recorder of another version go, so this copy can start its own. */
export function evict(): void {
  const other: unknown = Reflect.get(globalThis, SHARED);
  if (typeof other !== "object" || other === null) return;
  const uninstall: unknown = Reflect.get(other, "uninstall");
  try {
    if (typeof uninstall === "function") uninstall.call(other);
  } catch {
    // It let go of what it could.
  }
  Reflect.deleteProperty(globalThis, SHARED);
}
