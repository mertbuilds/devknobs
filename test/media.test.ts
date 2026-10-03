import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  apply,
  destroy,
  mentionsFeature,
  rewriteAll,
  rewriteMediaText,
  splitQueryList,
  SYSTEM_MEDIA,
} from "../src/engine/media";

const SCHEME = "prefers-color-scheme";
const MOTION = "prefers-reduced-motion";
const CONTRAST = "prefers-contrast";
const TRANSPARENCY = "prefers-reduced-transparency";
const TRUE_TOKEN = "(min-width: 0px)";

describe("splitQueryList", () => {
  test("splits on top level commas only", () => {
    expect(splitQueryList("screen, print")).toEqual(["screen", "print"]);
    expect(splitQueryList("(min-width: 10px) and (max-width: 20px)")).toEqual([
      "(min-width: 10px) and (max-width: 20px)",
    ]);
    expect(splitQueryList("(prefers-color-scheme: dark), print")).toEqual([
      "(prefers-color-scheme: dark)",
      "print",
    ]);
  });

  test("drops empty entries", () => {
    expect(splitQueryList("")).toEqual([]);
    expect(splitQueryList("screen,")).toEqual(["screen"]);
  });
});

describe("rewriteMediaText", () => {
  test("leaves the text alone for system", () => {
    expect(rewriteMediaText(`(${SCHEME}: dark)`, SCHEME, "system")).toBe(`(${SCHEME}: dark)`);
  });

  test("leaves the text alone when the feature is absent", () => {
    expect(rewriteMediaText("screen and (min-width: 600px)", SCHEME, "dark")).toBe(
      "screen and (min-width: 600px)",
    );
  });

  test("turns a matching feature into an always true condition", () => {
    expect(rewriteMediaText(`(${SCHEME}: dark)`, SCHEME, "dark")).toBe(TRUE_TOKEN);
    expect(rewriteMediaText(`(${SCHEME}: light)`, SCHEME, "light")).toBe(TRUE_TOKEN);
  });

  test("turns a failing feature into a false query", () => {
    expect(rewriteMediaText(`(${SCHEME}: dark)`, SCHEME, "light")).toBe("not all");
    expect(rewriteMediaText(`(${SCHEME}: light)`, SCHEME, "dark")).toBe("not all");
  });

  test("keeps the rest of the query intact", () => {
    expect(rewriteMediaText(`screen and (${SCHEME}: dark)`, SCHEME, "dark")).toBe(
      `screen and ${TRUE_TOKEN}`,
    );
    expect(rewriteMediaText(`(min-width: 600px) and (${SCHEME}: dark)`, SCHEME, "dark")).toBe(
      `(min-width: 600px) and ${TRUE_TOKEN}`,
    );
    expect(rewriteMediaText(`screen and (${SCHEME}: dark)`, SCHEME, "light")).toBe("not all");
  });

  test("handles missing whitespace and odd casing", () => {
    expect(rewriteMediaText(`(${SCHEME}:dark)`, SCHEME, "dark")).toBe(TRUE_TOKEN);
    expect(rewriteMediaText(`( ${SCHEME} : DARK )`, SCHEME, "dark")).toBe(TRUE_TOKEN);
  });

  test("rewrites each query of a list on its own", () => {
    expect(rewriteMediaText(`(${SCHEME}: dark), print`, SCHEME, "light")).toBe("not all, print");
    expect(rewriteMediaText(`(${SCHEME}: dark), print`, SCHEME, "dark")).toBe(
      `${TRUE_TOKEN}, print`,
    );
  });

  test("flips negated queries", () => {
    expect(rewriteMediaText(`not all and (${SCHEME}: dark)`, SCHEME, "dark")).toBe("not all");
    expect(rewriteMediaText(`not all and (${SCHEME}: dark)`, SCHEME, "light")).toBe("all");
  });

  test("handles reduced motion", () => {
    expect(rewriteMediaText(`(${MOTION}: reduce)`, MOTION, "reduce")).toBe(TRUE_TOKEN);
    expect(rewriteMediaText(`(${MOTION}: no-preference)`, MOTION, "reduce")).toBe("not all");
    expect(rewriteMediaText(`(${MOTION})`, MOTION, "reduce")).toBe(TRUE_TOKEN);
  });

  test("handles contrast", () => {
    expect(rewriteMediaText(`(${CONTRAST}: more)`, CONTRAST, "more")).toBe(TRUE_TOKEN);
    expect(rewriteMediaText(`(${CONTRAST}: less)`, CONTRAST, "more")).toBe("not all");
    expect(rewriteMediaText(`(${CONTRAST}: custom)`, CONTRAST, "more")).toBe("not all");
    expect(rewriteMediaText(`(${CONTRAST}: no-preference)`, CONTRAST, "more")).toBe("not all");
  });

  test("handles reduced transparency", () => {
    expect(rewriteMediaText(`(${TRANSPARENCY}: reduce)`, TRANSPARENCY, "reduce")).toBe(TRUE_TOKEN);
    expect(rewriteMediaText(`(${TRANSPARENCY}: no-preference)`, TRANSPARENCY, "reduce")).toBe(
      "not all",
    );
    expect(rewriteMediaText(`(${TRANSPARENCY})`, TRANSPARENCY, "reduce")).toBe(TRUE_TOKEN);
  });

  test("rewrites every occurrence in one query", () => {
    expect(rewriteMediaText(`(${SCHEME}: dark) and (${SCHEME}: light)`, SCHEME, "dark")).toBe(
      "not all",
    );
  });
});

describe("rewriteAll", () => {
  test("is a no-op when nothing is emulated", () => {
    const text = `screen and (${SCHEME}: dark)`;
    expect(rewriteAll(text, SYSTEM_MEDIA)).toBe(text);
    expect(rewriteAll("(min-width: 1024px)", SYSTEM_MEDIA)).toBe("(min-width: 1024px)");
  });

  test("applies every emulated feature", () => {
    const text = `(${SCHEME}: dark) and (${MOTION}: reduce)`;
    expect(rewriteAll(text, { ...SYSTEM_MEDIA, scheme: "dark", motion: "reduce" })).toBe(
      `${TRUE_TOKEN} and ${TRUE_TOKEN}`,
    );
    expect(rewriteAll(text, { ...SYSTEM_MEDIA, scheme: "dark" })).toBe(
      `${TRUE_TOKEN} and (${MOTION}: reduce)`,
    );
    expect(rewriteAll(text, { ...SYSTEM_MEDIA, scheme: "light", motion: "reduce" })).toBe(
      "not all",
    );
  });
});

describe("touch", () => {
  const TOUCH = { ...SYSTEM_MEDIA, touch: true };

  test("a coarse pointer that cannot hover", () => {
    expect(rewriteAll("(pointer: coarse)", TOUCH)).toBe(TRUE_TOKEN);
    expect(rewriteAll("(pointer: fine)", TOUCH)).toBe("not all");
    expect(rewriteAll("(hover: none)", TOUCH)).toBe(TRUE_TOKEN);
    expect(rewriteAll("(hover: hover)", TOUCH)).toBe("not all");
  });

  test("any pointer and any hover read the same", () => {
    expect(rewriteAll("(any-pointer: coarse) and (any-hover: none)", TOUCH)).toBe(
      `${TRUE_TOKEN} and ${TRUE_TOKEN}`,
    );
    expect(rewriteAll("(any-hover: hover), (any-pointer: fine)", TOUCH)).toBe("not all, not all");
  });

  test("hover alone is false, a pointer alone is true", () => {
    expect(rewriteAll("(hover)", TOUCH)).toBe("not all");
    expect(rewriteAll("(any-hover)", TOUCH)).toBe("not all");
    expect(rewriteAll("(pointer)", TOUCH)).toBe(TRUE_TOKEN);
  });

  test("flips a negated hover query and keeps the rest", () => {
    expect(rewriteAll("not all and (hover: hover)", TOUCH)).toBe("all");
    expect(rewriteAll("screen and (hover: none) and (min-width: 600px)", TOUCH)).toBe(
      `screen and ${TRUE_TOKEN} and (min-width: 600px)`,
    );
  });

  test("composes with the prefers knobs", () => {
    expect(rewriteAll(`(hover: none) and (${SCHEME}: dark)`, { ...TOUCH, scheme: "dark" })).toBe(
      `${TRUE_TOKEN} and ${TRUE_TOKEN}`,
    );
  });

  test("leaves pointer and hover alone without a touch screen", () => {
    expect(rewriteAll("(hover: hover) and (pointer: fine)", SYSTEM_MEDIA)).toBe(
      "(hover: hover) and (pointer: fine)",
    );
  });

  test("names the features", () => {
    expect(mentionsFeature("(hover: none)")).toBe(true);
    expect(mentionsFeature("(any-pointer: coarse)")).toBe(true);
    expect(mentionsFeature("(min-width: 600px)")).toBe(false);
  });
});

/** What the browser itself matches: a light system, where `(min-width: 0px)` always holds. */
function holds(query: string): boolean {
  return query === "all" || query === "(min-width: 0px)" || query === `(${SCHEME}: light)`;
}

/** A list with the browser's own `matches` getter on its prototype, for the knobs to patch. */
class FakeMediaQueryList extends EventTarget {
  constructor(readonly media: string) {
    super();
  }

  get matches(): boolean {
    return holds(this.media);
  }
}

class FakeMediaQueryListEvent extends Event {
  readonly media: string;
  readonly matches: boolean;

  constructor(type: string, init: { media: string; matches: boolean }) {
    super(type);
    this.media = init.media;
    this.matches = init.matches;
  }
}

/** Where the early script leaves its patches for the full one. */
const EARLY = Symbol.for("devknobs.early");
const DARK = `(${SCHEME}: dark)`;

/** Every `matches` a list's change events carried, in order. */
function hear(list: FakeMediaQueryList): boolean[] {
  const heard: boolean[] = [];
  list.addEventListener("change", (event) => {
    heard.push((event as FakeMediaQueryListEvent).matches);
  });
  return heard;
}

function define(name: string, value: unknown): void {
  Object.defineProperty(globalThis, name, { configurable: true, value });
}

describe("the prefers knobs across an unmount", () => {
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
      styleSheets: [],
      adoptedStyleSheets: [],
    });
    define("MediaQueryList", FakeMediaQueryList);
    define("MediaQueryListEvent", FakeMediaQueryListEvent);
  });

  afterEach(() => {
    destroy();
    for (const name of ["window", "document", "MediaQueryList", "MediaQueryListEvent"]) {
      Reflect.deleteProperty(globalThis, name);
    }
  });

  test("tell a list made before the unmount about a scheme set after the next mount", () => {
    apply(SYSTEM_MEDIA);
    const list = window.matchMedia(DARK);
    const heard = hear(list as unknown as FakeMediaQueryList);
    destroy();
    apply(SYSTEM_MEDIA);
    apply({ ...SYSTEM_MEDIA, scheme: "dark" });
    expect(list.matches).toBe(true);
    expect(heard).toEqual([true]);
  });

  test("a list reads the touch screen and hears it come and go", () => {
    apply(SYSTEM_MEDIA);
    const list = window.matchMedia("(pointer: coarse)");
    const heard = hear(list as unknown as FakeMediaQueryList);
    expect(list.matches).toBe(false);
    apply({ ...SYSTEM_MEDIA, touch: true });
    expect(list.matches).toBe(true);
    expect(window.matchMedia("(hover: hover)").matches).toBe(false);
    apply(SYSTEM_MEDIA);
    expect(list.matches).toBe(false);
    expect(heard).toEqual([true, false]);
  });

  test("tell a list the early script handed over, after an unmount and a mount", () => {
    const list = new FakeMediaQueryList(DARK);
    let forward: ((event: Event) => void) | null = null;
    // The early script's guard, first in line, passes every event on once released.
    list.addEventListener("change", (event) => forward?.(event));
    const heard = hear(list);
    Object.assign(window, {
      [EARLY]: {
        release(next: (event: Event) => void) {
          forward = next;
          return [{ list, query: DARK, heard: false }];
        },
      },
    });
    apply(SYSTEM_MEDIA);
    destroy();
    apply(SYSTEM_MEDIA);
    apply({ ...SYSTEM_MEDIA, scheme: "dark" });
    expect(list.matches).toBe(true);
    expect(heard).toEqual([true]);
  });
});
