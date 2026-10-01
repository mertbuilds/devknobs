import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as media from "../src/engine/media";
import {
  apply,
  cascade,
  type Declaration,
  emulatedFontSize,
  emulateMediaText,
  reset,
  specificity,
  splitSelectors,
  substituteVars,
} from "../src/engine/text";

describe("emulatedFontSize", () => {
  test("takes relative sizes against the setting", () => {
    expect(emulatedFontSize("62.5%", 20)).toBe("12.5px");
    expect(emulatedFontSize("100%", 20)).toBe("20px");
    expect(emulatedFontSize("1.25em", 16)).toBe("20px");
    expect(emulatedFontSize("1rem", 13)).toBe("13px");
    expect(emulatedFontSize(".5rem", 20)).toBe("10px");
  });

  test("takes keywords against the setting", () => {
    expect(emulatedFontSize("medium", 20)).toBe("20px");
    expect(emulatedFontSize(" Large ", 20)).toBe("24px");
    expect(emulatedFontSize("initial", 17)).toBe("17px");
  });

  test("keeps everything else in a calculation as it is", () => {
    expect(emulatedFontSize("calc(1rem + 0.5vw)", 20)).toBe("calc(20px + 0.5vw)");
    expect(emulatedFontSize("clamp(1rem, 2vw, 1.5rem)", 20)).toBe("clamp(20px, 2vw, 30px)");
  });

  test("leaves absolute sizes alone", () => {
    expect(emulatedFontSize("10px", 20)).toBeNull();
    expect(emulatedFontSize("12pt", 20)).toBeNull();
    expect(emulatedFontSize("calc(10px + 1vw)", 20)).toBeNull();
  });
});

describe("emulateMediaText", () => {
  test("takes em and rem against the setting", () => {
    expect(emulateMediaText("(min-width: 48em)", 20)).toBe("(min-width: 960px)");
    expect(emulateMediaText("screen and (width >= 40rem)", 15)).toBe("screen and (width >= 600px)");
    expect(emulateMediaText("(min-width: 30em) and (max-width: 47.99em)", 20)).toBe(
      "(min-width: 600px) and (max-width: 959.8px)",
    );
  });

  test("leaves px and other features alone", () => {
    expect(emulateMediaText("(min-width: 768px)", 20)).toBe("(min-width: 768px)");
    expect(emulateMediaText("(min-resolution: 2dppx)", 20)).toBe("(min-resolution: 2dppx)");
    expect(emulateMediaText("(prefers-color-scheme: dark)", 20)).toBe(
      "(prefers-color-scheme: dark)",
    );
  });
});

describe("substituteVars", () => {
  const vars: Record<string, string> = { "--root": " 62.5%", "--alias": "var(--root)" };
  const lookup = (name: string) => vars[name] ?? "";

  test("reads custom properties, chains and fallbacks", () => {
    expect(substituteVars("var(--root)", lookup)).toBe("62.5%");
    expect(substituteVars("var(--alias)", lookup)).toBe("62.5%");
    expect(substituteVars("var(--missing, 1rem)", lookup)).toBe("1rem");
    expect(substituteVars("100%", lookup)).toBe("100%");
  });

  test("is null for a property nobody set", () => {
    expect(substituteVars("var(--missing)", lookup)).toBeNull();
  });
});

describe("selectors", () => {
  test("split on top-level commas only", () => {
    expect(splitSelectors("html, :root")).toEqual(["html", ":root"]);
    expect(splitSelectors(':is(html, body), [data-x="a,b"]')).toEqual([
      ":is(html, body)",
      '[data-x="a,b"]',
    ]);
  });

  test("rank ids over classes over types", () => {
    expect(specificity("html")).toBe(1);
    expect(specificity(":root")).toBe(1000);
    expect(specificity("html.dark")).toBe(1001);
    expect(specificity('html[lang="en"]')).toBe(1001);
    expect(specificity("#app")).toBe(1e6);
    expect(specificity(":where(html)")).toBe(0);
    expect(specificity("html:not(.x)")).toBe(1001);
  });
});

describe("cascade", () => {
  function declaration(patch: Partial<Declaration>): Declaration {
    return {
      value: "",
      important: false,
      inline: false,
      layered: false,
      specificity: 1,
      order: 0,
      ...patch,
    };
  }

  test("the later of equals wins", () => {
    const first = declaration({ value: "a", order: 0 });
    const second = declaration({ value: "b", order: 1 });
    expect(cascade([first, second])).toBe(second);
    expect(cascade([second, first])).toBe(second);
  });

  test("specificity beats order", () => {
    const root = declaration({ value: "a", specificity: 1000, order: 0 });
    const html = declaration({ value: "b", specificity: 1, order: 1 });
    expect(cascade([root, html])).toBe(root);
  });

  test("unlayered beats layered, until important flips it", () => {
    const layered = declaration({ value: "a", layered: true, order: 1 });
    const plain = declaration({ value: "b", order: 0 });
    expect(cascade([layered, plain])).toBe(plain);
    const layeredImportant = declaration({ ...layered, important: true });
    const plainImportant = declaration({ ...plain, important: true });
    expect(cascade([plainImportant, layeredImportant])).toBe(layeredImportant);
  });

  test("inline beats rules, important beats inline", () => {
    const inline = declaration({ value: "a", inline: true, specificity: 0 });
    const rule = declaration({ value: "b", specificity: 1e6, order: 5 });
    expect(cascade([rule, inline])).toBe(inline);
    const important = declaration({ value: "c", important: true });
    expect(cascade([inline, important])).toBe(important);
  });

  test("is null without declarations", () => {
    expect(cascade([])).toBeNull();
  });
});

/** Named as the browser's, since text size tells rules apart by their constructor's name. */
class CSSStyleRule {
  readonly style: Pick<CSSStyleDeclaration, "getPropertyValue" | "getPropertyPriority">;

  constructor(
    readonly selectorText: string,
    fontSize: string,
  ) {
    this.style = {
      getPropertyValue: (name: string) => (name === "font-size" ? fontSize : ""),
      getPropertyPriority: () => "",
    };
  }
}

class CSSMediaRule {
  readonly cssRules: unknown[] = [];
  readonly media: { mediaText: string };

  constructor(mediaText: string) {
    this.media = { mediaText };
  }
}

/** A list with the browser's own `matches` getter, for the prefers knobs to patch. */
class FakeMediaQueryList extends EventTarget {
  constructor(readonly media: string) {
    super();
  }

  get matches(): boolean {
    return this.media !== "print" && this.media !== "not all";
  }
}

interface Sheet {
  cssRules: unknown[];
  media: { mediaText: string };
  disabled: boolean;
}

function sheet(rules: unknown[], media = "", disabled = false): Sheet {
  return { cssRules: rules, media: { mediaText: media }, disabled };
}

/** The inline style of `<html>`, and how many times anything wrote it. */
let inline: Map<string, { value: string; priority: string }>;
let writes: number;
let sheets: Sheet[];

function rootSize(): string {
  return inline.get("font-size")?.value ?? "";
}

/** The page sets its own inline root size. */
function setRootSize(value: string): void {
  inline.set("font-size", { value, priority: "" });
}

function define(name: string, value: unknown): void {
  Object.defineProperty(globalThis, name, { configurable: true, value });
}

describe("text size on a page", () => {
  beforeEach(() => {
    inline = new Map();
    writes = 0;
    sheets = [];
    define("window", {
      matchMedia: (query: string) => new FakeMediaQueryList(query),
      addEventListener: () => {},
      removeEventListener: () => {},
    });
    define("document", {
      documentElement: {
        matches: (selector: string) => selector === "html",
        style: {
          getPropertyValue: (name: string) => inline.get(name)?.value ?? "",
          getPropertyPriority: (name: string) => inline.get(name)?.priority ?? "",
          setProperty: (name: string, value: string, priority = "") => {
            writes++;
            if (value) inline.set(name, { value, priority });
            else inline.delete(name);
          },
          removeProperty: (name: string) => {
            writes++;
            inline.delete(name);
          },
        },
      },
      get styleSheets() {
        return sheets;
      },
      adoptedStyleSheets: [],
    });
    define("getComputedStyle", () => ({ fontSize: "16px", getPropertyValue: () => "" }));
  });

  afterEach(() => {
    reset();
    for (const name of ["window", "document", "getComputedStyle"]) {
      Reflect.deleteProperty(globalThis, name);
    }
  });

  test("follows a root size the page sets inline while on, and leaves it after", () => {
    setRootSize("62.5%");
    apply(20);
    expect(rootSize()).toBe("12.5px");
    setRootSize("50%");
    apply(20);
    expect(rootSize()).toBe("10px");
    reset();
    expect(rootSize()).toBe("50%");
  });

  test("leaves a root size the page wrote over devknobs' own", () => {
    setRootSize("62.5%");
    apply(20);
    setRootSize("18px");
    reset();
    expect(rootSize()).toBe("18px");
  });

  test("writes nothing for a root size that ignores the setting", () => {
    sheets = [sheet([new CSSStyleRule("html", "10px")])];
    apply(20);
    reset();
    expect(writes).toBe(0);
  });

  test("reads the root size from the sheets that apply on screen only", () => {
    sheets = [
      sheet([new CSSStyleRule("html", "62.5%")]),
      sheet([new CSSStyleRule("html", "10px")], "print"),
      sheet([new CSSStyleRule("html", "10px")], "", true),
    ];
    apply(20);
    expect(rootSize()).toBe("12.5px");
    sheets.push(sheet([new CSSStyleRule("html", "125%")], "screen"));
    apply(20);
    expect(rootSize()).toBe("25px");
  });

  describe("with the prefers knobs", () => {
    beforeEach(() => {
      define("MediaQueryList", FakeMediaQueryList);
    });

    afterEach(() => {
      media.destroy();
      Reflect.deleteProperty(globalThis, "MediaQueryList");
    });

    /** As the engine applies the knobs: the prefers knobs, then text size. */
    function knobs(scheme: "dark" | "system", size: 20 | "system"): void {
      media.apply({ ...media.SYSTEM_MEDIA, scheme });
      apply(size);
    }

    test("gives a rule updated in place its authored media back", () => {
      const authored = "(min-width: 40em) and (prefers-color-scheme: dark)";
      const style = sheet([new CSSMediaRule(authored)]);
      sheets = [style];
      knobs("system", 20);
      // A hot update swaps the sheet's text in place, and text size follows it.
      const updated = new CSSMediaRule(authored);
      style.cssRules = [updated];
      apply(20);
      expect(updated.media.mediaText).toBe("(min-width: 800px) and (prefers-color-scheme: dark)");
      knobs("dark", 20);
      expect(updated.media.mediaText).toBe("(min-width: 800px) and (min-width: 0px)");
      knobs("dark", "system");
      knobs("system", "system");
      expect(updated.media.mediaText).toBe(authored);
    });
  });
});
