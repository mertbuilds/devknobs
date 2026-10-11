import { afterEach, describe, expect, test } from "bun:test";
import { parsePlainColor } from "../src/engine/color";
import {
  clearOutside,
  getOutside,
  landOutside,
  lookOutside,
  parseLook,
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

describe("a color for an outside page", () => {
  test("is taken as a hex or an rgb of plain numbers", () => {
    const table: [string, [number, number, number, number]][] = [
      ["#fff", [255, 255, 255, 1]],
      ["#1a2B3c", [26, 43, 60, 1]],
      ["#0f08", [0, 255, 0, 136 / 255]],
      ["#11223380", [17, 34, 51, 128 / 255]],
      ["  #000  ", [0, 0, 0, 1]],
      ["rgb(1, 2, 3)", [1, 2, 3, 1]],
      ["rgb(1,2,3)", [1, 2, 3, 1]],
      ["RGB( 255 , 0 , 12.5 )", [255, 0, 12.5, 1]],
      ["rgba(10, 20, 30, 0.5)", [10, 20, 30, 0.5]],
      ["rgba(10, 20, 30, .25)", [10, 20, 30, 0.25]],
      ["rgb(10, 20, 30, 1)", [10, 20, 30, 1]],
      ["rgb(10 20 30)", [10, 20, 30, 1]],
      ["rgb(10 20 30 / 0.5)", [10, 20, 30, 0.5]],
    ];
    for (const [value, [red, green, blue, alpha]] of table) {
      expect(parsePlainColor(value)).toEqual({ red, green, blue, alpha });
    }
  });

  test("is refused in any other form", () => {
    for (const value of [
      "",
      "   ",
      "#",
      "#ff",
      "#fffff",
      "#fffffff",
      "#fffffffff",
      "#ggg",
      "fff",
      "# fff",
      "red",
      "transparent",
      "currentColor",
      "inherit",
      "rgb(256, 0, 0)",
      "rgb(0, 0, 0, 1.5)",
      "rgb(-1, 0, 0)",
      "rgb(1e2, 0, 0)",
      "rgb(10%, 20%, 30%)",
      "rgba(0, 0, 0, 50%)",
      "rgb(0, 0)",
      "rgb(0, 0, 0, 0, 0)",
      "rgb(0 0, 0)",
      "rgb(0, 0, 0 / 1)",
      "rgb(0, 0, 0",
      "rgb(0, 0, 0))",
      "rgb(calc(1), 0, 0)",
      "rgb(var(--a), 0, 0)",
      "rgb(from red r g b)",
      "rgb(none 0 0)",
      "hsl(0, 0%, 0%)",
      "color(srgb 0 0 0)",
      "oklch(0.5 0.1 20)",
      "light-dark(#fff, #000)",
      "#fff; background: url(https://example.com/x)",
      "#fff url(https://example.com/x)",
      "url(https://example.com/x)",
      "rgb(0, 0, 0); color: red",
      "#fff\n}",
    ]) {
      expect(parsePlainColor(value)).toBeNull();
    }
    for (const value of [null, undefined, 0, 0xffffff, {}, ["#fff"]]) {
      expect(parsePlainColor(value)).toBeNull();
    }
  });
});

describe("the colors of an outside page", () => {
  test("are the ones that are colors, trimmed, and null with none", () => {
    expect(parseLook({ light: " #fff ", dark: "rgb(1, 2, 3)" })).toEqual({ light: "#fff", dark: "rgb(1, 2, 3)" });
    expect(parseLook({ light: "#fff", dark: "red" })).toEqual({ light: "#fff" });
    expect(parseLook({ light: "url(x)", dark: "#000" })).toEqual({ dark: "#000" });
    expect(parseLook({ light: 1, dark: null, other: "#fff" })).toBeNull();
    for (const value of [null, undefined, "#fff", 1, [], {}, { light: "red" }]) {
      expect(parseLook(value)).toBeNull();
    }
  });
});

describe("what the frame shows", () => {
  const URL = "https://example.com/";

  afterEach(clearOutside);

  test("is the window's own page until an outside one is shown, and after it is cleared", () => {
    expect(getOutside()).toEqual({ outside: null, refused: false, loaded: false, look: null });
    setOutside(URL, false);
    expect(getOutside()).toEqual({ outside: URL, refused: false, loaded: false, look: null });
    clearOutside();
    expect(getOutside()).toEqual({ outside: null, refused: false, loaded: false, look: null });
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
    expect(getOutside()).toEqual({ outside: null, refused: false, loaded: false, look: null });
    setOutside(URL, true);
    landOutside();
    expect(getOutside().loaded).toBe(false);
  });

  test("carries the colors it was shown with, until another page or its own", () => {
    setOutside(URL, false, { light: "#fff" });
    expect(getOutside().look).toEqual({ light: "#fff" });
    landOutside();
    reloadingOutside();
    refuseOutside();
    expect(getOutside().look).toEqual({ light: "#fff" });
    setOutside("https://example.org/", false);
    expect(getOutside().look).toBeNull();
    setOutside(URL, false, { dark: "#000" });
    clearOutside();
    expect(getOutside().look).toBeNull();
  });

  test("takes colors given later, and gives them up, told once per change", () => {
    lookOutside({ light: "#fff" });
    expect(getOutside().look).toBeNull();
    setOutside(URL, false);
    landOutside();
    const heard: unknown[] = [];
    const stop = subscribeOutside((state) => heard.push(state.look));
    lookOutside({ light: "#fff" });
    lookOutside({ light: "#fff" });
    expect(getOutside()).toEqual({ outside: URL, refused: false, loaded: true, look: { light: "#fff" } });
    lookOutside({ light: "#fff", dark: "#000" });
    lookOutside(null);
    lookOutside(null);
    stop();
    expect(heard).toEqual([{ light: "#fff" }, { light: "#fff", dark: "#000" }, null]);
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
