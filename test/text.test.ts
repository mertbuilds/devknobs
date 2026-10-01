import { describe, expect, test } from "bun:test";
import {
  cascade,
  type Declaration,
  emulatedFontSize,
  emulateMediaText,
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
