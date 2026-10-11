import { afterEach, describe, expect, test } from "bun:test";
import {
  clearOutside,
  getOutside,
  landOutside,
  parseOutside,
  refuseOutside,
  reloadingOutside,
  setOutside,
  subscribeOutside,
} from "../src/engine/outside";

describe("an address for an outside page", () => {
  test("is taken when it is http or https, as the browser writes it", () => {
    expect(parseOutside("https://example.com")).toBe("https://example.com/");
    expect(parseOutside("  http://example.com/a?b=1#c ")).toBe("http://example.com/a?b=1#c");
    expect(parseOutside("HTTPS://Example.com/Path")).toBe("https://example.com/Path");
  });

  test("is refused when it is any other kind", () => {
    for (const url of [
      "javascript:alert(1)",
      "JavaScript:alert(1)",
      " javascript:alert(1)",
      "java\tscript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "blob:https://example.com/0b0c6f0e-4a59-4f0e-9d5a-3f6f0c1d2e3f",
      "file:///etc/passwd",
      "about:blank",
      "ftp://example.com/",
      "ws://example.com/",
      "view-source:https://example.com/",
    ]) {
      expect(parseOutside(url)).toBeNull();
    }
  });

  test("is refused when it is no address", () => {
    for (const url of ["", "   ", "example.com", "/pricing", "//example.com", "https://", "http:// a"]) {
      expect(parseOutside(url)).toBeNull();
    }
    for (const value of [null, undefined, 1, {}, ["https://example.com"]]) {
      expect(parseOutside(value)).toBeNull();
    }
  });
});

describe("what the frame shows", () => {
  const URL = "https://example.com/";

  afterEach(clearOutside);

  test("is the window's own page until an outside one is shown, and after it is cleared", () => {
    expect(getOutside()).toEqual({ outside: null, refused: false, loaded: false });
    setOutside(URL, false);
    expect(getOutside()).toEqual({ outside: URL, refused: false, loaded: false });
    clearOutside();
    expect(getOutside()).toEqual({ outside: null, refused: false, loaded: false });
  });

  test("is told to its listeners once per change, until they stop", () => {
    const heard: (string | boolean | null)[][] = [];
    const stop = subscribeOutside((state) => heard.push([state.outside, state.refused, state.loaded]));
    setOutside(URL, false);
    landOutside();
    landOutside();
    reloadingOutside();
    landOutside();
    refuseOutside();
    refuseOutside();
    clearOutside();
    clearOutside();
    stop();
    setOutside(URL, false);
    expect(heard).toEqual([
      [URL, false, false],
      [URL, false, true],
      [URL, false, false],
      [URL, false, true],
      [URL, true, false],
      [null, false, false],
    ]);
  });

  test("never loads while it refuses, or while it is the window's own page", () => {
    landOutside();
    refuseOutside();
    reloadingOutside();
    expect(getOutside()).toEqual({ outside: null, refused: false, loaded: false });
    setOutside(URL, true);
    landOutside();
    expect(getOutside().loaded).toBe(false);
  });

  test("is never written to storage", () => {
    const written: string[] = [];
    const storage = { getItem: () => null, setItem: (key: string) => written.push(key) };
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { sessionStorage: storage, localStorage: storage },
    });
    setOutside(URL, false);
    landOutside();
    clearOutside();
    Reflect.deleteProperty(globalThis, "window");
    expect(written).toEqual([]);
  });
});
