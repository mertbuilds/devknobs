import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  addLayer,
  baseMatchMedia,
  type Layer,
  type LayerName,
  removeLayer,
} from "../src/engine/matchmedia";
import { mentionsFeature, rewriteAll, SYSTEM_MEDIA } from "../src/engine/media";
import { emulateMediaText } from "../src/engine/text";

/** One condition, in a light window 1000px wide whose em is 16px. */
function holds(condition: string): boolean {
  if (condition === "not all") return false;
  const width = /^\(min-width:\s*([\d.]+)(px|em)\)$/.exec(condition);
  if (width) return Number(width[1]) * (width[2] === "em" ? 16 : 1) <= 1000;
  return condition === "(prefers-color-scheme: light)";
}

/** Every query the browser's own `matchMedia` was asked. */
const asked: string[] = [];

function native(query: string): MediaQueryList {
  asked.push(query);
  const matches = query.split(" and ").every(holds);
  return { media: query, matches } as unknown as MediaQueryList;
}

/** As text size does it at 30. */
const text: Layer = (query, next) => {
  const emulated = emulateMediaText(query, 30);
  const list = next(emulated);
  if (emulated !== query) Object.defineProperty(list, "media", { value: query });
  return list;
};

/** As the prefers knobs do it with dark on: a list that names a feature reads the emulated verdict. */
const media: Layer = (query, next) => {
  const list = next(query);
  if (mentionsFeature(query)) {
    const emulated = rewriteAll(query, { ...SYSTEM_MEDIA, scheme: "dark" });
    Object.defineProperty(list, "matches", { value: baseMatchMedia(emulated).matches });
  }
  return list;
};

const LAYERS: Record<LayerName, Layer> = { text, media };

function add(...names: LayerName[]): void {
  for (const name of names) addLayer(name, LAYERS[name]);
}

beforeEach(() => {
  asked.length = 0;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { matchMedia: native },
  });
});

afterEach(() => {
  removeLayer("text");
  removeLayer("media");
  Reflect.deleteProperty(globalThis, "window");
});

describe("matchMedia layers", () => {
  for (const order of [
    ["text", "media"],
    ["media", "text"],
  ] as LayerName[][]) {
    test(`take em to px before the prefers knobs see the query, added ${order.join(" then ")}`, () => {
      add(...order);
      const em = window.matchMedia("(min-width: 40em)");
      expect(em.matches).toBe(false);
      expect(em.media).toBe("(min-width: 40em)");
      expect(asked).toContain("(min-width: 1200px)");
      expect(window.matchMedia("(prefers-color-scheme: dark)").matches).toBe(true);
      expect(window.matchMedia("(prefers-color-scheme: dark) and (min-width: 30em)").matches).toBe(
        true,
      );
      expect(window.matchMedia("(prefers-color-scheme: dark) and (min-width: 40em)").matches).toBe(
        false,
      );
    });

    test(`put the browser's own back with the last one out, ${order.join(" then ")}`, () => {
      add("text", "media");
      removeLayer(order[0] as LayerName);
      expect(window.matchMedia).not.toBe(native);
      removeLayer(order[1] as LayerName);
      expect(window.matchMedia).toBe(native);
    });
  }

  test("read under every layer through baseMatchMedia", () => {
    add("text", "media");
    expect(baseMatchMedia("(min-width: 40em)").matches).toBe(true);
    expect(asked).toEqual(["(min-width: 40em)"]);
  });

  test("leave a patch the page wrapped over in place, passing queries through", () => {
    add("text");
    const patched = window.matchMedia;
    const wrapper = (query: string) => patched(query);
    window.matchMedia = wrapper;
    removeLayer("text");
    expect(window.matchMedia).toBe(wrapper);
    expect(wrapper("(min-width: 40em)").matches).toBe(true);
    expect(asked).toEqual(["(min-width: 40em)"]);
  });
});
