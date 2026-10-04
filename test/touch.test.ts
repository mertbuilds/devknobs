import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { apply, reset } from "../src/engine/touch";

const realNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");

/** A desktop browser: no touch handler on the window, no touch points. */
class FakeNavigator {
  get maxTouchPoints(): number {
    return 0;
  }
}

beforeEach(() => {
  Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: new FakeNavigator(),
  });
});

afterEach(() => {
  reset();
  Reflect.deleteProperty(globalThis, "window");
  if (realNavigator) Object.defineProperty(globalThis, "navigator", realNavigator);
  else Reflect.deleteProperty(globalThis, "navigator");
});

describe("touch", () => {
  test("puts ontouchstart on the window and touch points on the navigator", () => {
    apply({ on: true, points: true });
    expect("ontouchstart" in window).toBe(true);
    expect(navigator.maxTouchPoints).toBe(5);
    reset();
    expect("ontouchstart" in window).toBe(false);
    expect(navigator.maxTouchPoints).toBe(0);
  });

  test("leaves the touch points to the ua knob when it has them", () => {
    apply({ on: true, points: false });
    expect("ontouchstart" in window).toBe(true);
    expect(navigator.maxTouchPoints).toBe(0);
  });

  test("leaves a window that has a touch handler of its own alone", () => {
    const handler = () => {};
    Object.assign(window, { ontouchstart: handler });
    apply({ on: true, points: true });
    reset();
    expect(Reflect.get(window, "ontouchstart")).toBe(handler);
  });

  test("does nothing while off", () => {
    apply({ on: false, points: true });
    expect("ontouchstart" in window).toBe(false);
    expect(navigator.maxTouchPoints).toBe(0);
  });
});
