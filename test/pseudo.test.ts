import { describe, expect, test } from "bun:test";
import { pseudoText } from "../src/engine/pseudo";

describe("pseudoText", () => {
  test("accents every letter, grows the string and brackets it", () => {
    expect(pseudoText("Settings")).toBe("[Ŝéţţîñĝš ···]");
    expect(pseudoText("Save")).toBe("[Ŝáṽé ··]");
  });

  test("keeps the whitespace around the string outside the brackets", () => {
    expect(pseudoText("\n  Save  ")).toBe("\n  [Ŝáṽé ··]  ");
  });

  test("leaves what has no letters alone", () => {
    expect(pseudoText("")).toBe("");
    expect(pseudoText("  ")).toBe("  ");
    expect(pseudoText("42 / 7")).toBe("42 / 7");
    expect(pseudoText("→")).toBe("→");
  });

  test("keeps digits, punctuation and letters it has no accent for", () => {
    expect(pseudoText("2 items, ğ")).toBe("[2 îţéɱš, ğ ····]");
  });
});
