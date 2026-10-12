import { afterEach, describe, expect, test } from "bun:test";
import type { CustomColor } from "../src/types";
import { knobOf } from "../src/ui/catalog";
import {
  addColor,
  type Colors,
  COLORS_KEY,
  COLORS_VERSION,
  colorsText,
  createColors,
  dropColor,
  MOST_COLORS,
  pickColor,
  readColors,
} from "../src/ui/colors";

const NONE: Colors = { mat: [], grab: [] };

/** `count` colors, each another. */
function some(count: number): CustomColor[] {
  return Array.from(
    { length: count },
    (_, at): CustomColor => `#0000${String(at).padStart(2, "0")}`,
  );
}

describe("readColors", () => {
  test("keeps each knob's list apart, in the order they were added", () => {
    const stored: Colors = { mat: ["#ffd400", "#101820"], grab: ["#ff8c00"] };
    expect(readColors(JSON.stringify(stored))).toEqual(stored);
    expect(readColors(JSON.stringify({ grab: ["#ff8c00"] }))).toEqual({
      mat: [],
      grab: ["#ff8c00"],
    });
  });

  test("drops what does not read", () => {
    expect(readColors(null)).toEqual(NONE);
    expect(readColors("")).toEqual(NONE);
    expect(readColors("{")).toEqual(NONE);
    expect(readColors("7")).toEqual(NONE);
    expect(readColors(JSON.stringify({ mat: "#ffd400", grab: { 0: "#ff8c00" } }))).toEqual(NONE);
    expect(
      readColors(JSON.stringify({ mat: ["#ffd400", "#FFD400", "#fd0", "red", 3, null, "#101820"] })),
    ).toEqual({ mat: ["#ffd400", "#101820"], grab: [] });
  });

  test("keeps a color once, and no more than the most, the newest of them", () => {
    expect(readColors(JSON.stringify({ mat: ["#ffd400", "#101820", "#ffd400"] })).mat).toEqual([
      "#ffd400",
      "#101820",
    ]);
    const many = some(MOST_COLORS + 3);
    expect(readColors(JSON.stringify({ grab: many })).grab).toEqual(many.slice(3));
  });

  test("reads its own version and one kept before versions, and leaves a newer one alone", () => {
    const colors: Colors = { mat: ["#ffd400"], grab: ["#ff8c00"] };
    expect(readColors(JSON.stringify({ v: COLORS_VERSION, ...colors }))).toEqual(colors);
    expect(readColors(JSON.stringify(colors))).toEqual(colors);
    expect(readColors(JSON.stringify({ v: COLORS_VERSION + 1, ...colors }))).toEqual(NONE);
  });

  test("reads back what it keeps, with its version", () => {
    const colors = { mat: some(3), grab: some(MOST_COLORS) };
    const text = colorsText(colors);
    expect(JSON.parse(text)).toEqual({ v: COLORS_VERSION, ...colors });
    expect(readColors(text)).toEqual(colors);
  });
});

describe("addColor", () => {
  test("adds a color at the end", () => {
    expect(addColor([], "#ffd400")).toEqual(["#ffd400"]);
    expect(addColor(["#ffd400"], "#101820")).toEqual(["#ffd400", "#101820"]);
  });

  test("leaves a color the list has where it is", () => {
    expect(addColor(["#ffd400", "#101820"], "#ffd400")).toEqual(["#ffd400", "#101820"]);
  });

  test("holds eight, and one more takes the oldest off", () => {
    expect(MOST_COLORS).toBe(8);
    const full = some(MOST_COLORS);
    const next = addColor(full, "#ffd400");
    expect(next).toHaveLength(MOST_COLORS);
    expect(next).toEqual([...full.slice(1), "#ffd400"]);
    expect(addColor(full, full[0] ?? "#000000")).toEqual(full);
  });
});

describe("dropColor", () => {
  test("takes a color off, and leaves a list without it as it is", () => {
    expect(dropColor(["#ffd400", "#101820"], "#ffd400")).toEqual(["#101820"]);
    expect(dropColor(["#101820"], "#ffd400")).toEqual(["#101820"]);
  });
});

describe("pickColor", () => {
  const mat = knobOf("mat").options;
  const grab = knobOf("grabColor").options;

  test("adds a new color to the list and picks it, however it was typed", () => {
    expect(pickColor("#FFD400", mat, [])).toEqual({ value: "#ffd400", list: ["#ffd400"] });
    expect(pickColor("rgb(255, 212, 0)", mat, ["#101820"])).toEqual({
      value: "#ffd400",
      list: ["#101820", "#ffd400"],
    });
    expect(pickColor("fd0", grab, [])).toEqual({ value: "#ffdd00", list: ["#ffdd00"] });
  });

  test("picks a color the list has, with no second one", () => {
    expect(pickColor("#ffd400", mat, ["#ffd400", "#101820"])).toEqual({
      value: "#ffd400",
      list: ["#ffd400", "#101820"],
    });
  });

  test("picks the knob's own color for the same one, and adds nothing", () => {
    expect(pickColor("#144698", mat, ["#101820"])).toEqual({ value: "blue", list: ["#101820"] });
    expect(pickColor("rgb(64, 68, 74)", mat, [])).toEqual({ value: "graphite", list: [] });
    expect(pickColor("#D239C0", grab, [])).toEqual({ value: "pink", list: [] });
    // The mat's blue is not grab's.
    expect(pickColor("#144698", grab, [])).toEqual({ value: "#144698", list: ["#144698"] });
  });

  test("drops the oldest for one past the most", () => {
    const full = some(MOST_COLORS);
    expect(pickColor("#ffd400", mat, full)).toEqual({
      value: "#ffd400",
      list: [...full.slice(1), "#ffd400"],
    });
  });

  test("takes nothing that does not read as a color", () => {
    for (const text of ["", "yellow", "#ffd4", "rgb(300, 0, 0)", "rgba(0, 0, 0, 0.5)"]) {
      expect(pickColor(text, mat, ["#101820"])).toBeNull();
    }
  });
});

function stubWindow(): {
  local: Map<string, string>;
  fire: (key: string | null) => void;
  listening: () => number;
} {
  const local = new Map<string, string>();
  const listeners = new Set<(event: { key: string | null }) => void>();
  const localStorage = {
    getItem: (key: string) => local.get(key) ?? null,
    setItem: (key: string, value: string) => {
      local.set(key, value);
    },
    removeItem: (key: string) => {
      local.delete(key);
    },
  };
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage,
      addEventListener: (type: string, listener: (event: { key: string | null }) => void) => {
        if (type === "storage") listeners.add(listener);
      },
      removeEventListener: (type: string, listener: (event: { key: string | null }) => void) => {
        if (type === "storage") listeners.delete(listener);
      },
    },
  });
  return {
    local,
    fire: (key) => {
      for (const listener of listeners) listener({ key });
    },
    listening: () => listeners.size,
  };
}

describe("createColors", () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, "window");
  });

  test("starts with none, and with the ones the site kept", () => {
    const { local } = stubWindow();
    const none = createColors();
    expect(none.get()).toEqual(NONE);
    none.destroy();
    local.set(COLORS_KEY, JSON.stringify({ mat: ["#ffd400"] }));
    const kept = createColors();
    expect(kept.get()).toEqual({ mat: ["#ffd400"], grab: [] });
    kept.destroy();
  });

  test("keeps a list with its version, apart from the other, and nothing once both are empty", () => {
    const { local } = stubWindow();
    const colors = createColors();
    let heard = 0;
    colors.subscribe(() => heard++);
    colors.set("mat", ["#ffd400"]);
    colors.set("grab", ["#ff8c00", "#101820"]);
    expect(JSON.parse(local.get(COLORS_KEY) ?? "")).toEqual({
      v: COLORS_VERSION,
      mat: ["#ffd400"],
      grab: ["#ff8c00", "#101820"],
    });
    expect(colors.get().mat).toEqual(["#ffd400"]);
    colors.set("grab", []);
    expect(colors.get()).toEqual({ mat: ["#ffd400"], grab: [] });
    colors.set("mat", []);
    expect(local.has(COLORS_KEY)).toBe(false);
    expect(heard).toBe(4);
    colors.destroy();
  });

  test("a new panel of the site has what the last one kept", () => {
    stubWindow();
    const first = createColors();
    first.set("mat", addColor(first.get().mat, "#ffd400"));
    first.destroy();
    const second = createColors();
    expect(second.get().mat).toEqual(["#ffd400"]);
    second.destroy();
  });

  test("hears a color another document of the origin added", () => {
    const { local, fire, listening } = stubWindow();
    const colors = createColors();
    local.set(COLORS_KEY, JSON.stringify({ grab: ["#ff8c00"] }));
    fire("devknobs:prefs");
    expect(colors.get().grab).toEqual([]);
    fire(COLORS_KEY);
    expect(colors.get().grab).toEqual(["#ff8c00"]);
    colors.destroy();
    expect(listening()).toBe(0);
  });

  test("works without storage, the colors just do not stick", () => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        get localStorage(): Storage {
          throw new Error("denied");
        },
        addEventListener: () => {},
        removeEventListener: () => {},
      },
    });
    const colors = createColors();
    colors.set("mat", ["#ffd400"]);
    expect(colors.get().mat).toEqual(["#ffd400"]);
    colors.destroy();
  });
});
