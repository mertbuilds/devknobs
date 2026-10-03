import { afterEach, describe, expect, test } from "bun:test";
import {
  FRAME_ATTRIBUTE,
  FRAME_NAME,
  framed,
  isDevknobsFrame,
  nativeScheme,
  needsFrame,
  readMessage,
  UNFRAMED,
} from "../src/engine/frame";
import { DEFAULT_STATE } from "../src/engine/store";

const ORIGIN = "http://localhost:3000";

function setWindow(frameElement: () => unknown, name = ""): void {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      name,
      get frameElement() {
        return frameElement();
      },
    },
  });
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, "window");
});

describe("framed", () => {
  test("keeps the width full inside the frame", () => {
    expect(framed({ ...DEFAULT_STATE, scheme: "dark", width: 390 })).toEqual({
      ...DEFAULT_STATE,
      scheme: "dark",
      width: "full",
    });
  });

  test("leaves the frame knobs off inside the frame", () => {
    expect(framed({ ...DEFAULT_STATE, frame: true })).toEqual(DEFAULT_STATE);
    expect(framed({ ...DEFAULT_STATE, vision: "tritanopia" })).toEqual(DEFAULT_STATE);
    expect(framed({ ...DEFAULT_STATE, dpr: 3 })).toEqual(DEFAULT_STATE);
    expect(framed({ ...DEFAULT_STATE, height: 874 })).toEqual(DEFAULT_STATE);
  });

  test("keeps the device inside the frame, for its touch screen", () => {
    const phone = { ...DEFAULT_STATE, width: 402, height: 874, dpr: 3, device: "iphone-16-pro" };
    expect(framed(phone)).toEqual({ ...DEFAULT_STATE, device: "iphone-16-pro" });
  });

  test("hands back a state that is already full", () => {
    const state = { ...DEFAULT_STATE, text: 20 };
    expect(framed(state)).toBe(state);
  });
});

describe("needsFrame", () => {
  test("is true for a width, a height, the frame knob, a ratio or a vision deficiency", () => {
    expect(needsFrame({ ...UNFRAMED, width: 390 })).toBe(true);
    expect(needsFrame({ ...UNFRAMED, height: 700 })).toBe(true);
    expect(needsFrame({ ...UNFRAMED, frame: true })).toBe(true);
    expect(needsFrame({ ...UNFRAMED, vision: "blur" })).toBe(true);
    expect(needsFrame({ ...UNFRAMED, dpr: 2 })).toBe(true);
  });

  test("is false with every frame knob off, or for a width that is no size", () => {
    expect(needsFrame(UNFRAMED)).toBe(false);
    expect(needsFrame({ ...UNFRAMED, width: 0 })).toBe(false);
    expect(needsFrame({ ...UNFRAMED, dpr: 0 })).toBe(false);
  });
});

describe("readMessage", () => {
  const parent = {};

  function from(data: unknown, source: unknown = parent, origin = ORIGIN) {
    return readMessage({ data, origin, source }, parent, ORIGIN);
  }

  test("reads a state, falling back to the defaults field by field", () => {
    expect(
      from({ source: "devknobs", type: "state", state: { scheme: "dark", width: 390 } }),
    ).toEqual({
      source: "devknobs",
      type: "state",
      state: { ...DEFAULT_STATE, scheme: "dark", width: 390 },
    });
    expect(
      from({ source: "devknobs", type: "state", state: { scheme: "loud", stray: 1 } }),
    ).toEqual({ source: "devknobs", type: "state", state: DEFAULT_STATE });
  });

  test("reads keys, ready and replay", () => {
    expect(from({ source: "devknobs", type: "key", action: "toggle" })).toEqual({
      source: "devknobs",
      type: "key",
      action: "toggle",
    });
    expect(from({ source: "devknobs", type: "key", action: "close" })).toEqual({
      source: "devknobs",
      type: "key",
      action: "close",
    });
    expect(from({ source: "devknobs", type: "ready" })).toEqual({
      source: "devknobs",
      type: "ready",
    });
    expect(from({ source: "devknobs", type: "replay" })).toEqual({
      source: "devknobs",
      type: "replay",
    });
  });

  test("reads the overflow count the frame reports", () => {
    expect(from({ source: "devknobs", type: "overflow", count: 3 })).toEqual({
      source: "devknobs",
      type: "overflow",
      count: 3,
    });
    expect(from({ source: "devknobs", type: "overflow", count: -1 })).toBeNull();
    expect(from({ source: "devknobs", type: "overflow", count: 1.5 })).toBeNull();
    expect(from({ source: "devknobs", type: "overflow", count: "3" })).toBeNull();
    expect(from({ source: "devknobs", type: "overflow" })).toBeNull();
  });

  test("refuses another origin or another window", () => {
    const message = { source: "devknobs", type: "ready" };
    expect(from(message, parent, "http://evil.test")).toBeNull();
    expect(from(message, {})).toBeNull();
    expect(from(message, null)).toBeNull();
    expect(readMessage({ data: message, origin: ORIGIN, source: null }, null, ORIGIN)).toBeNull();
  });

  test("refuses anything that is not a devknobs message", () => {
    expect(from(null)).toBeNull();
    expect(from("devknobs")).toBeNull();
    expect(from({ type: "ready" })).toBeNull();
    expect(from({ source: "other", type: "ready" })).toBeNull();
    expect(from({ source: "devknobs", type: "unknown" })).toBeNull();
    expect(from({ source: "devknobs", type: "state" })).toBeNull();
    expect(from({ source: "devknobs", type: "state", state: "dark" })).toBeNull();
    expect(from({ source: "devknobs", type: "key", action: "open" })).toBeNull();
    expect(from({ source: "devknobs", type: "key" })).toBeNull();
  });
});

describe("isDevknobsFrame", () => {
  test("knows its frame by the attribute", () => {
    setWindow(() => ({ hasAttribute: (name: string) => name === FRAME_ATTRIBUTE }));
    expect(isDevknobsFrame()).toBe(true);
  });

  test("is false at the top and in other frames", () => {
    setWindow(() => null);
    expect(isDevknobsFrame()).toBe(false);
    setWindow(() => ({ hasAttribute: () => false }));
    expect(isDevknobsFrame()).toBe(false);
  });

  test("falls back to the window name when the frame element is out of reach", () => {
    setWindow(() => {
      throw new Error("cross-origin");
    }, FRAME_NAME);
    expect(isDevknobsFrame()).toBe(true);
    setWindow(() => null, FRAME_NAME);
    expect(isDevknobsFrame()).toBe(true);
    setWindow(() => {
      throw new Error("cross-origin");
    });
    expect(isDevknobsFrame()).toBe(false);
  });
});

describe("nativeScheme", () => {
  /** A frame element with this inline `color-scheme`. */
  function owner(colorScheme: string) {
    return {
      style: { getPropertyValue: (name: string) => (name === "color-scheme" ? colorScheme : "") },
    };
  }

  test("is true when the frame element carries the same scheme", () => {
    setWindow(() => owner("dark"));
    expect(nativeScheme("dark")).toBe(true);
    setWindow(() => owner("light"));
    expect(nativeScheme("light")).toBe(true);
  });

  test("is false for system, another scheme or none at all", () => {
    setWindow(() => owner("dark"));
    expect(nativeScheme("system")).toBe(false);
    expect(nativeScheme("light")).toBe(false);
    setWindow(() => owner(""));
    expect(nativeScheme("dark")).toBe(false);
    setWindow(() => null);
    expect(nativeScheme("dark")).toBe(false);
  });

  test("is false when the frame element is out of reach", () => {
    setWindow(() => {
      throw new Error("cross-origin");
    });
    expect(nativeScheme("dark")).toBe(false);
  });
});
