import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { MAT_COLOR_NAMES, MAT_COLORS, matGradient } from "../src/engine/matcolors";
import {
  EARLY,
  readSnapshot,
  SNAPSHOT_KEY,
  type Snapshot,
  showEarly,
  snapshotKey,
  writeSnapshot,
} from "../src/engine/placeholder";
import { DEFAULT_STATE, merge, parse } from "../src/engine/store";

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
      setTimeout: () => 0,
    },
  });
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, "window");
  Reflect.deleteProperty(globalThis, "document");
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

  test("is not shown once the mat has another color", () => {
    writeSnapshot(kept());
    expect(readSnapshot(merge(PHONE, { mat: "green" }), VIEW)).toBeNull();
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

/** The early style's text, from a session stored as `stored`. */
function earlyCover(stored: string): string {
  const added: { textContent: string; attributes: Map<string, string> }[] = [];
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      head: { append: (node: (typeof added)[number]) => added.push(node) },
      createElement: () => {
        const attributes = new Map<string, string>();
        return {
          textContent: "",
          attributes,
          setAttribute: (name: string, value: string) => attributes.set(name, value),
        };
      },
    },
  });
  showEarly(parse(stored));
  const style = added.find((node) => node.attributes.get("data-devknobs") === EARLY);
  if (!style) throw new Error("no early style");
  return style.textContent;
}

describe("the early cover", () => {
  test("lies on the stored mat color, in sRGB and in P3", () => {
    for (const mat of MAT_COLOR_NAMES) {
      const cover = earlyCover(JSON.stringify({ width: 390, mat }));
      const paint = MAT_COLORS[mat];
      expect(cover).toContain(`background:${matGradient(paint.srgb)};pointer-events:none}`);
      expect(cover).toContain(
        `@media (color-gamut:p3){html::after{background:${matGradient(paint.p3)}}}`,
      );
    }
  });

  test("lies on blue for a session stored before the mat had colors, or with one it does not know", () => {
    const blue = MAT_COLORS.blue;
    expect(earlyCover(JSON.stringify({ width: 390 }))).toContain(matGradient(blue.srgb));
    expect(earlyCover(JSON.stringify({ width: 390, mat: "teal" }))).toContain(matGradient(blue.p3));
  });
});
