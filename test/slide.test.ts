import { describe, expect, test } from "bun:test";
import { focusOn, slideOf } from "../src/ui/slide";

describe("slideOf", () => {
  test("pushes into the settings and pops back out of them", () => {
    expect(slideOf("home", "keys", true, true)).toBe("push");
    expect(slideOf("keys", "home", true, true)).toBe("pop");
  });

  test("a feature's view sits between the two: over the rows, under the settings", () => {
    expect(slideOf("home", "view", true, true)).toBe("push");
    expect(slideOf("view", "home", true, true)).toBe("pop");
    expect(slideOf("view", "keys", true, true)).toBe("push");
    expect(slideOf("keys", "view", true, true)).toBe("pop");
  });

  test("does nothing for the view already shown", () => {
    expect(slideOf("home", "home", true, true)).toBeNull();
    expect(slideOf("keys", "keys", false, false)).toBeNull();
  });

  test("swaps at once while the panel is closed or nothing animates", () => {
    expect(slideOf("keys", "home", false, true)).toBe("swap");
    expect(slideOf("home", "keys", true, false)).toBe("swap");
  });
});

describe("focusOn", () => {
  test("the settings take the focus on their back button, the rows give it to the toggle", () => {
    expect(focusOn("keys")).toBe("back");
    expect(focusOn("home")).toBe("toggle");
  });
});
