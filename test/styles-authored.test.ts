import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { apply, destroy, SYSTEM_MEDIA } from "../src/engine/media";
import { inspect } from "../src/styles";
import { as, element, media, page, rule, sheet } from "./styles-cssom";

const DARK = "(prefers-color-scheme: dark)";
const LIGHT = "(prefers-color-scheme: light)";

/** A list with the browser's own `matches` getter on its prototype, for the knobs to patch. */
class FakeMediaQueryList extends EventTarget {
  constructor(readonly media: string) {
    super();
  }

  get matches(): boolean {
    return this.media === "(min-width: 0px)";
  }
}

function define(name: string, value: unknown): void {
  Object.defineProperty(globalThis, name, { configurable: true, value });
}

describe("a media query a knob rewrote", () => {
  const dark = media(DARK, [rule(".a", "color: white")]);
  const light = media(LIGHT, [rule(".a", "color: black")]);
  const sheets = [sheet([dark, light])];

  beforeEach(() => {
    define("window", { matchMedia: (query: string) => new FakeMediaQueryList(query) });
    const style = new Map<string, string>();
    define("document", {
      documentElement: {
        style: {
          getPropertyValue: (name: string) => style.get(name) ?? "",
          setProperty: (name: string, value: string) => style.set(name, value),
          removeProperty: (name: string) => style.delete(name),
        },
      },
      styleSheets: sheets,
      adoptedStyleSheets: [],
    });
    define("MediaQueryList", FakeMediaQueryList);
    define("MediaQueryListEvent", Event);
  });

  afterEach(() => {
    destroy();
    for (const name of ["window", "document", "MediaQueryList", "MediaQueryListEvent"]) {
      Reflect.deleteProperty(globalThis, name);
    }
  });

  test("shows as the page wrote it, and applies as the browser now matches it", () => {
    apply({ ...SYSTEM_MEDIA, scheme: "dark" });
    // What the prefers knob made of the two queries, which is what the browser matches.
    expect(dark.media.mediaText).toBe("(min-width: 0px)");
    expect(light.media.mediaText).toBe("not all");

    const doc = page(["(min-width: 0px)"]);
    doc.styleSheets = sheets;
    const found = inspect(as(element(doc, "div", { matches: [".a"] })));
    const blocks = found.blocks.filter((block) => block.kind === "rule");
    expect(blocks.map((block) => block.context)).toEqual([[`@media ${DARK}`]]);
    expect(blocks[0]?.declarations[0]?.value).toBe("white");
    expect(doc.mediaCalls.sort()).toEqual(["(min-width: 0px)", "not all"]);
  });
});
