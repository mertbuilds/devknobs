import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  readSnapshot,
  SNAPSHOT_KEY,
  type Snapshot,
  snapshotKey,
  writeSnapshot,
} from "../src/engine/placeholder";
import { DEFAULT_STATE, merge } from "../src/engine/store";

const PHONE = merge(DEFAULT_STATE, { device: "iphone-18-pro" });
const VIEW = { innerWidth: 1440, innerHeight: 900, devicePixelRatio: 2 };
const LOOK = {
  background: "rgb(255, 255, 255)",
  dark: false,
  scheme: "light",
  host: "localhost:3000",
  canBack: false,
  canForward: false,
} as const;

let items: Map<string, string>;

beforeEach(() => {
  items = new Map();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      sessionStorage: {
        getItem: (key: string) => items.get(key) ?? null,
        setItem: (key: string, value: string) => items.set(key, value),
        removeItem: (key: string) => items.delete(key),
      },
    },
  });
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, "window");
});

function kept(): Snapshot {
  return { key: snapshotKey(PHONE, VIEW), css: ".viewport{}", html: "<div></div>", look: LOOK };
}

describe("the kept drawing", () => {
  test("is shown for the knobs and the window it was drawn for", () => {
    writeSnapshot(kept());
    expect(readSnapshot(PHONE, VIEW)).toEqual(kept());
  });

  test("is not shown for another device, a turn, or a window of another size", () => {
    writeSnapshot(kept());
    expect(readSnapshot(merge(PHONE, { device: "pixel-10" }), VIEW)).toBeNull();
    expect(readSnapshot(merge(PHONE, { orientation: "landscape" }), VIEW)).toBeNull();
    expect(readSnapshot(PHONE, { ...VIEW, innerWidth: 1280 })).toBeNull();
    expect(readSnapshot(PHONE, { ...VIEW, devicePixelRatio: 1 })).toBeNull();
  });

  test("is not shown when what was kept is not in its shape", () => {
    items.set(SNAPSHOT_KEY, "{");
    expect(readSnapshot(PHONE, VIEW)).toBeNull();
    items.set(SNAPSHOT_KEY, JSON.stringify({ ...kept(), html: 1 }));
    expect(readSnapshot(PHONE, VIEW)).toBeNull();
    items.set(SNAPSHOT_KEY, JSON.stringify({ ...kept(), look: { ...LOOK, background: "red" } }));
    expect(readSnapshot(PHONE, VIEW)).toBeNull();
    items.set(SNAPSHOT_KEY, JSON.stringify({ ...kept(), look: { ...LOOK, scheme: "dim" } }));
    expect(readSnapshot(PHONE, VIEW)).toBeNull();
  });
});
