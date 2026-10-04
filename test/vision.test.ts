import { describe, expect, test } from "bun:test";
import { visionFilter } from "../src/engine/vision";

/** The `values` of the color matrix inside a filter's data url. */
function matrix(filter: string): number[] {
  const match = /^url\("data:image\/svg\+xml,(.*)#f"\)$/.exec(filter);
  const svg = decodeURIComponent(match?.[1] ?? "");
  const values = /<feColorMatrix values="([^"]*)"\/>/.exec(svg)?.[1] ?? "";
  return values.split(" ").map(Number);
}

describe("visionFilter", () => {
  test("is empty for none and a plain blur for blurred vision", () => {
    expect(visionFilter("none")).toBe("");
    expect(visionFilter("blur")).toBe("blur(2px)");
  });

  test("draws each deficiency as a 4 by 5 color matrix that keeps alpha", () => {
    for (const value of ["protanopia", "deuteranopia", "tritanopia", "achromatopsia"] as const) {
      const values = matrix(visionFilter(value));
      expect(values).toHaveLength(20);
      expect(values.every(Number.isFinite)).toBe(true);
      expect(values.slice(15)).toEqual([0, 0, 0, 1, 0]);
    }
  });

  test("keeps white white, as every row of the model sums to one", () => {
    for (const value of ["protanopia", "deuteranopia", "tritanopia", "achromatopsia"] as const) {
      const values = matrix(visionFilter(value));
      for (const row of [0, 1, 2]) {
        const sum = values.slice(row * 5, row * 5 + 3).reduce((a, b) => a + b, 0);
        expect(sum).toBeCloseTo(1, 2);
      }
    }
  });
});
