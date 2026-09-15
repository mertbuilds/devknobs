import { describe, expect, test } from "bun:test";
import {
  evaluateWidthCondition,
  parseLength,
  rewriteAll,
  rewriteMediaText,
  rewriteWidthText,
  splitQueryList,
  SYSTEM_MEDIA,
} from "../src/engine/media";

const SCHEME = "prefers-color-scheme";
const MOTION = "prefers-reduced-motion";
const CONTRAST = "prefers-contrast";
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

  test("rewrites every occurrence in one query", () => {
    expect(rewriteMediaText(`(${SCHEME}: dark) and (${SCHEME}: light)`, SCHEME, "dark")).toBe(
      "not all",
    );
  });
});

describe("parseLength", () => {
  test("reads px, rem and em", () => {
    expect(parseLength("1024px")).toBe(1024);
    expect(parseLength(" 64rem ")).toBe(1024);
    expect(parseLength("40em")).toBe(640);
    expect(parseLength("37.5px")).toBe(37.5);
    expect(parseLength(".5rem")).toBe(8);
  });

  test("reads a bare zero and nothing else without a unit", () => {
    expect(parseLength("0")).toBe(0);
    expect(parseLength("600")).toBeNull();
  });

  test("refuses lengths it cannot resolve on its own", () => {
    expect(parseLength("50vw")).toBeNull();
    expect(parseLength("calc(10px + 2rem)")).toBeNull();
    expect(parseLength("10q")).toBeNull();
    expect(parseLength("")).toBeNull();
  });
});

describe("evaluateWidthCondition", () => {
  test("leaves conditions that are not about width alone", () => {
    expect(evaluateWidthCondition("min-height: 800px", 390)).toBeNull();
    expect(evaluateWidthCondition(`${SCHEME}: dark`, 390)).toBeNull();
    expect(evaluateWidthCondition("min-width: 50vw", 390)).toBeNull();
  });

  test("reads the plain forms", () => {
    expect(evaluateWidthCondition("min-width: 320px", 390)).toBe(true);
    expect(evaluateWidthCondition("max-width: 320px", 390)).toBe(false);
    expect(evaluateWidthCondition("width: 390px", 390)).toBe(true);
    expect(evaluateWidthCondition("min-device-width: 1024px", 390)).toBe(false);
    expect(evaluateWidthCondition("max-device-width: 500px", 390)).toBe(true);
  });

  test("reads the range forms", () => {
    expect(evaluateWidthCondition("width >= 1024px", 1024)).toBe(true);
    expect(evaluateWidthCondition("width > 1024px", 1024)).toBe(false);
    expect(evaluateWidthCondition("device-width <= 500px", 390)).toBe(true);
    expect(evaluateWidthCondition("400px <= width <= 800px", 600)).toBe(true);
  });
});

describe("rewriteWidthText", () => {
  test("leaves the text alone for full", () => {
    expect(rewriteWidthText("(min-width: 1024px)", "full")).toBe("(min-width: 1024px)");
    expect(rewriteWidthText("(min-width: 1024px)", 0)).toBe("(min-width: 1024px)");
  });

  test("leaves the text alone when no width feature is mentioned", () => {
    expect(rewriteWidthText(`screen and (${SCHEME}: dark)`, 390)).toBe(
      `screen and (${SCHEME}: dark)`,
    );
  });

  test("rewrites min-width", () => {
    expect(rewriteWidthText("(min-width: 320px)", 390)).toBe(TRUE_TOKEN);
    expect(rewriteWidthText("(min-width: 1024px)", 390)).toBe("not all");
  });

  test("rewrites max-width", () => {
    expect(rewriteWidthText("(max-width: 500px)", 390)).toBe(TRUE_TOKEN);
    expect(rewriteWidthText("(max-width: 320px)", 390)).toBe("not all");
  });

  test("rewrites an exact width", () => {
    expect(rewriteWidthText("(width: 390px)", 390)).toBe(TRUE_TOKEN);
    expect(rewriteWidthText("(width: 400px)", 390)).toBe("not all");
  });

  test("converts rem and em against 16px, not the text knob", () => {
    expect(rewriteWidthText("(width >= 64rem)", 1024)).toBe(TRUE_TOKEN);
    expect(rewriteWidthText("(width >= 64rem)", 1023)).toBe("not all");
    expect(rewriteWidthText("(max-width: 40em)", 640)).toBe(TRUE_TOKEN);
    expect(rewriteWidthText("(max-width: 40em)", 641)).toBe("not all");
  });

  test("takes a unitless zero", () => {
    expect(rewriteWidthText("(min-width: 0)", 390)).toBe(TRUE_TOKEN);
    expect(rewriteWidthText("(min-width: 0px)", 390)).toBe(TRUE_TOKEN);
  });

  test("leaves lengths it cannot resolve untouched", () => {
    expect(rewriteWidthText("(min-width: 50vw)", 390)).toBe("(min-width: 50vw)");
    expect(rewriteWidthText("(min-width: calc(10px + 2rem))", 390)).toBe(
      "(min-width: calc(10px + 2rem))",
    );
    expect(rewriteWidthText("(min-width: 600)", 390)).toBe("(min-width: 600)");
  });

  test("tells >= from > at the boundary", () => {
    expect(rewriteWidthText("(width >= 1024px)", 1024)).toBe(TRUE_TOKEN);
    expect(rewriteWidthText("(width > 1024px)", 1024)).toBe("not all");
    expect(rewriteWidthText("(width <= 390px)", 390)).toBe(TRUE_TOKEN);
    expect(rewriteWidthText("(width < 390px)", 390)).toBe("not all");
  });

  test("reads a reversed range", () => {
    expect(rewriteWidthText("(1024px >= width)", 390)).toBe(TRUE_TOKEN);
    expect(rewriteWidthText("(1024px <= width)", 390)).toBe("not all");
  });

  test("reads a double ended range", () => {
    expect(rewriteWidthText("(400px <= width <= 800px)", 600)).toBe(TRUE_TOKEN);
    expect(rewriteWidthText("(400px <= width <= 800px)", 390)).toBe("not all");
    expect(rewriteWidthText("(400px < width < 800px)", 400)).toBe("not all");
    expect(rewriteWidthText("(400px < width < 800px)", 401)).toBe(TRUE_TOKEN);
  });

  test("handles the device variants", () => {
    expect(rewriteWidthText("(min-device-width: 1024px)", 390)).toBe("not all");
    expect(rewriteWidthText("(max-device-width: 500px)", 390)).toBe(TRUE_TOKEN);
    expect(rewriteWidthText("(device-width >= 64rem)", 390)).toBe("not all");
  });

  test("handles missing whitespace and odd casing", () => {
    expect(rewriteWidthText("(width>=64rem)", 1024)).toBe(TRUE_TOKEN);
    expect(rewriteWidthText("(MIN-WIDTH: 320PX)", 390)).toBe(TRUE_TOKEN);
  });

  test("keeps the rest of the query intact", () => {
    expect(rewriteWidthText("screen and (min-width: 320px)", 390)).toBe(`screen and ${TRUE_TOKEN}`);
    expect(rewriteWidthText("(min-width: 320px) and (min-height: 800px)", 390)).toBe(
      `${TRUE_TOKEN} and (min-height: 800px)`,
    );
    expect(rewriteWidthText("screen and (min-width: 1024px)", 390)).toBe("not all");
  });

  test("rewrites each query of a list on its own", () => {
    expect(rewriteWidthText("(min-width: 1024px), (max-width: 500px)", 390)).toBe(
      `not all, ${TRUE_TOKEN}`,
    );
    expect(rewriteWidthText("(min-width: 1024px), print", 390)).toBe("not all, print");
  });

  test("flips negated queries", () => {
    expect(rewriteWidthText("not all and (min-width: 1024px)", 390)).toBe("all");
    expect(rewriteWidthText("not all and (max-width: 500px)", 390)).toBe("not all");
  });

  test("sinks the whole query when one of two width conditions fails", () => {
    expect(rewriteWidthText("(min-width: 320px) and (max-width: 500px)", 390)).toBe(
      `${TRUE_TOKEN} and ${TRUE_TOKEN}`,
    );
    expect(rewriteWidthText("(min-width: 320px) and (max-width: 380px)", 390)).toBe("not all");
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
    expect(
      rewriteAll(text, { scheme: "dark", motion: "reduce", contrast: "system", width: "full" }),
    ).toBe(`${TRUE_TOKEN} and ${TRUE_TOKEN}`);
    expect(
      rewriteAll(text, { scheme: "dark", motion: "system", contrast: "system", width: "full" }),
    ).toBe(`${TRUE_TOKEN} and (${MOTION}: reduce)`);
    expect(
      rewriteAll(text, { scheme: "light", motion: "reduce", contrast: "system", width: "full" }),
    ).toBe("not all");
  });

  test("mixes width with the prefers-* features in one query", () => {
    const text = `(${SCHEME}: dark) and (min-width: 1024px)`;
    expect(
      rewriteAll(text, { scheme: "dark", motion: "system", contrast: "system", width: 390 }),
    ).toBe("not all");
    expect(
      rewriteAll(text, { scheme: "dark", motion: "system", contrast: "system", width: 1440 }),
    ).toBe(`${TRUE_TOKEN} and ${TRUE_TOKEN}`);
    expect(
      rewriteAll(text, { scheme: "light", motion: "system", contrast: "system", width: 1440 }),
    ).toBe("not all");
    expect(
      rewriteAll(text, { scheme: "system", motion: "system", contrast: "system", width: 1440 }),
    ).toBe(`(${SCHEME}: dark) and ${TRUE_TOKEN}`);
  });
});
