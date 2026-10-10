import { describe, expect, test } from "bun:test";
import type { StyleDeclaration } from "../src/styles/types";
import {
  colorIn,
  crumbText,
  fileName,
  hiddenLine,
  matchesFilter,
  middle,
  sourceOf,
  swatchOf,
  valueParts,
  variableTip,
} from "../src/ui/stylesformat";

function declaration(name: string, value: string, important = false): StyleDeclaration {
  return { name, value, important, longhands: [name], overridden: false, variables: [] };
}

/** The browser's word on a color, for the few this file names. */
const COLORS = new Set(["red", "tan", "rebeccapurple", "transparent", "inherit", "currentcolor"]);
function supports(text: string): boolean {
  if (/^#[0-9a-f]{3,8}$/i.test(text)) return true;
  if (/^(rgba?|hsla?|oklch|color-mix|light-dark)\(.*\)$/i.test(text)) return true;
  return COLORS.has(text.toLowerCase());
}

describe("middle", () => {
  test("leaves a text that fits as it is", () => {
    expect(middle("button#save.primary", 44)).toBe("button#save.primary");
  });

  test("cuts a long one in its middle, to the length asked, keeping both ends", () => {
    const cut = middle("div#app.shell.layout.is-open.theme-dark.wide", 21);
    expect(cut).toBe("div#app.sh…-dark.wide");
    expect([...cut]).toHaveLength(21);
    expect([...middle("abcdefghijklmnopqrstuvwxyz", 9)]).toHaveLength(9);
    expect(middle("abcdefghijklmnopqrstuvwxyz", 9)).toBe("abcd…wxyz");
  });
});

describe("crumbText", () => {
  test("is the tag with its id, or with its first class", () => {
    expect(crumbText("div#app.shell.wide")).toBe("div#app");
    expect(crumbText("button.primary.large")).toBe("button.primary");
    expect(crumbText("body")).toBe("body");
  });

  test("is cut short where an id or a class runs long", () => {
    expect([...crumbText("div.a-very-long-class-name-from-a-css-module__x9f2a")]).toHaveLength(24);
  });
});

describe("fileName", () => {
  test("is the last segment of the stylesheet's address, less its query and hash", () => {
    expect(fileName("https://example.com/assets/app.css")).toBe("app.css");
    expect(fileName("http://localhost:3000/_next/static/css/app.css?v=1712#x")).toBe("app.css");
    expect(fileName("https://example.com/styles/")).toBe("styles");
  });

  test("keeps the name of a stylesheet with no address", () => {
    expect(fileName("<style>")).toBe("<style>");
    expect(fileName("constructed")).toBe("constructed");
  });
});

describe("sourceOf", () => {
  test("shows the file and keeps the whole address for the tooltip", () => {
    const origin = { sheet: "https://example.com/assets/app.css", owner: "link", path: [3] };
    expect(sourceOf(origin)).toEqual({ text: "app.css", tip: "https://example.com/assets/app.css" });
  });

  test("names the element of an inline one, and says a constructed one is script's", () => {
    expect(sourceOf({ sheet: "<style>", owner: "style#theme", path: [0] })).toEqual({
      text: "<style>",
      tip: "a style element, style#theme",
    });
    expect(sourceOf({ sheet: "constructed", owner: null, path: [0] }).tip).toBe(
      "a stylesheet made by script",
    );
  });
});

describe("matchesFilter", () => {
  test("keeps a declaration by its name or its value, in any case", () => {
    const one = declaration("background-color", "var(--Brand)");
    expect(matchesFilter(one, "color")).toBe(true);
    expect(matchesFilter(one, "BACK")).toBe(true);
    expect(matchesFilter(one, "brand")).toBe(true);
    expect(matchesFilter(one, "margin")).toBe(false);
  });

  test("an empty filter keeps everything", () => {
    expect(matchesFilter(declaration("color", "red"), "")).toBe(true);
    expect(matchesFilter(declaration("color", "red"), "  ")).toBe(true);
  });
});

describe("hiddenLine", () => {
  test("says which stylesheet is hidden and why, and guesses nothing", () => {
    expect(hiddenLine({ sheet: "https://cdn.example.com/lib/theme.css", reason: "cross-origin" })).toBe(
      "rules hidden: theme.css (another origin)",
    );
    expect(hiddenLine({ sheet: "<style>", reason: "unreadable" })).toBe(
      "rules hidden: <style> (could not be read)",
    );
  });
});

describe("valueParts", () => {
  test("a value with no custom property is one piece", () => {
    expect(valueParts("1px solid red")).toEqual([{ kind: "text", text: "1px solid red" }]);
  });

  test("each name read through var() is a piece of its own, fallbacks included", () => {
    expect(valueParts("var(--gap)")).toEqual([
      { kind: "text", text: "var(" },
      { kind: "var", text: "--gap" },
      { kind: "text", text: ")" },
    ]);
    expect(valueParts("calc(var( --a ) + var(--b, var(--c, 4px)))").filter((part) => part.kind === "var")).toEqual([
      { kind: "var", text: "--a" },
      { kind: "var", text: "--b" },
      { kind: "var", text: "--c" },
    ]);
  });

  test("the pieces put together are the value", () => {
    const value = "0 0 0 1px var(--ring, rgb(0 0 0 / 10%)), var(--shadow)";
    expect(valueParts(value).map((part) => part.text).join("")).toBe(value);
  });
});

describe("variableTip", () => {
  test("says what the element sees for the property, or that it is not set", () => {
    expect(variableTip("--brand", { value: "#0af", definedIn: 2 })).toBe("--brand: #0af");
    expect(variableTip("--gone", { value: "", definedIn: null })).toBe("--gone is not set");
  });
});

describe("colorIn", () => {
  test("finds a hex, of every length", () => {
    expect(colorIn("color", "#0af", supports)).toBe("#0af");
    expect(colorIn("color", "#00AAFF", supports)).toBe("#00AAFF");
    expect(colorIn("border", "1px solid #00aaff80", supports)).toBe("#00aaff80");
  });

  test("finds a color function whole, brackets inside it and all", () => {
    expect(colorIn("color", "rgb(0 170 255 / 50%)", supports)).toBe("rgb(0 170 255 / 50%)");
    expect(colorIn("box-shadow", "0 1px 2px hsl(210, 50%, calc(10% + 5%))", supports)).toBe(
      "hsl(210, 50%, calc(10% + 5%))",
    );
    expect(colorIn("color", "oklch(70% 0.1 200)", supports)).toBe("oklch(70% 0.1 200)");
  });

  test("finds a named color where the property takes one", () => {
    expect(colorIn("color", "red", supports)).toBe("red");
    expect(colorIn("border-bottom", "2px dashed rebeccapurple", supports)).toBe("rebeccapurple");
    expect(colorIn("--accent", "tan", supports)).toBe("tan");
  });

  test("a word that names a color is none in a property that takes none", () => {
    expect(colorIn("font-family", "Tan", supports)).toBeNull();
    expect(colorIn("animation-name", "red", supports)).toBeNull();
  });

  test("a keyword that parses as a color and names none has no swatch", () => {
    expect(colorIn("color", "inherit", supports)).toBeNull();
    expect(colorIn("color", "currentcolor", supports)).toBeNull();
  });

  test("nothing the browser does not take as a color is painted", () => {
    expect(colorIn("color", "#12345", () => false)).toBeNull();
    expect(colorIn("border", "1px solid", supports)).toBeNull();
    expect(colorIn("width", "100px", supports)).toBeNull();
  });

  test("a color that reads a custom property cannot be painted from the pane", () => {
    expect(colorIn("color", "rgb(var(--r) 0 0)", supports)).toBeNull();
    expect(colorIn("background", "url(#fff)", supports)).toBeNull();
  });

  test("takes the color that comes first in the value", () => {
    expect(colorIn("background", "red linear-gradient(#fff, #000)", supports)).toBe("red");
  });
});

describe("swatchOf", () => {
  test("is the color the value names", () => {
    expect(swatchOf(declaration("color", "#0af"), {}, supports)).toBe("#0af");
    expect(swatchOf(declaration("margin", "0 auto"), {}, supports)).toBeNull();
  });

  test("is what the custom property resolves to, where the value is one var() alone", () => {
    const variables = { "--brand": { value: "#0af", definedIn: 1 } };
    expect(swatchOf(declaration("color", "var(--brand)"), variables, supports)).toBe("#0af");
    expect(swatchOf(declaration("color", "var(--unknown)"), variables, supports)).toBeNull();
    expect(swatchOf(declaration("padding", "var(--brand) 0"), variables, supports)).toBeNull();
  });
});
