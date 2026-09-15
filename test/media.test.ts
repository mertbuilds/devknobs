import { describe, expect, test } from "bun:test";
import { rewriteAll, rewriteMediaText, splitQueryList, SYSTEM_MEDIA } from "../src/engine/media";

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

describe("rewriteAll", () => {
  test("is a no-op when nothing is emulated", () => {
    const text = `screen and (${SCHEME}: dark)`;
    expect(rewriteAll(text, SYSTEM_MEDIA)).toBe(text);
  });

  test("applies every emulated feature", () => {
    const text = `(${SCHEME}: dark) and (${MOTION}: reduce)`;
    expect(rewriteAll(text, { scheme: "dark", motion: "reduce", contrast: "system" })).toBe(
      `${TRUE_TOKEN} and ${TRUE_TOKEN}`,
    );
    expect(rewriteAll(text, { scheme: "dark", motion: "system", contrast: "system" })).toBe(
      `${TRUE_TOKEN} and (${MOTION}: reduce)`,
    );
    expect(rewriteAll(text, { scheme: "light", motion: "reduce", contrast: "system" })).toBe(
      "not all",
    );
  });
});
