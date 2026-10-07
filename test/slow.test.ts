import { afterEach, describe, expect, test } from "bun:test";
import { slowed, slowness } from "../src/engine/slow";

const before = Reflect.get(globalThis, "window");

function stored(value: string | null): void {
  Reflect.set(globalThis, "window", { localStorage: { getItem: () => value } });
}

afterEach(() => {
  Reflect.set(globalThis, "window", before);
});

describe("slowness", () => {
  test("runs moves as many times slower as stored, and as they are for anything but a number above 0", () => {
    stored("5");
    expect(slowness()).toBe(5);
    expect(slowed(500, slowness())).toBe(100);
    for (const value of [null, "", "0", "-2", "fast", "Infinity"]) {
      stored(value);
      expect(slowness()).toBe(1);
    }
    Reflect.set(globalThis, "window", {});
    expect(slowness()).toBe(1);
  });
});
