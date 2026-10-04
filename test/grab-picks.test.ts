import { describe, expect, test } from "bun:test";
import { copiedText, flushPicks, togglePick } from "../src/grab/picks";

describe("picks", () => {
  test("shift and a click gather, and a second one takes it back out", () => {
    let picked = togglePick<string>([], "a");
    picked = togglePick(picked, "b");
    expect(picked).toEqual(["a", "b"]);
    expect(togglePick(picked, "a")).toEqual(["b"]);
  });

  test("a plain click copies the gathered ones and itself, once", () => {
    expect(flushPicks(["a", "b"], "c")).toEqual(["a", "b", "c"]);
    expect(flushPicks(["a", "b"], "a")).toEqual(["a", "b"]);
    expect(flushPicks(["a"], null)).toEqual(["a"]);
    expect(flushPicks([], "c")).toEqual(["c"]);
    expect(flushPicks<string>([], null)).toEqual([]);
  });

  test("the toast counts more than one", () => {
    expect(copiedText(1)).toBe("Copied");
    expect(copiedText(3)).toBe("Copied 3");
  });
});
