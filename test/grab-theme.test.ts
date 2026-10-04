import { describe, expect, test } from "bun:test";
import {
  backgroundTheme,
  decideGrab,
  decideTheme,
  GRAB_COLORS,
  type GrabSignals,
  invertTheme,
  isBlue,
  luminance,
  markerTheme,
  parseColor,
  schemeTheme,
  textTheme,
  type ThemeSignals,
  toHsl,
} from "../src/grab/theme";

const none: ThemeSignals = {
  surface: null,
  marker: null,
  scheme: null,
  backdrop: null,
  text: null,
};

function marks(classes: string[], attributes: Record<string, string> = {}) {
  return markerTheme(
    (name) => classes.includes(name),
    (name) => attributes[name] ?? null,
  );
}

describe("luminance", () => {
  test("goes from 0 for black to 1 for white", () => {
    expect(luminance(0, 0, 0)).toBe(0);
    expect(luminance(255, 255, 255)).toBeCloseTo(1);
  });

  test("weighs green over red over blue", () => {
    expect(luminance(255, 0, 0)).toBeCloseTo(0.2126);
    expect(luminance(0, 255, 0)).toBeCloseTo(0.7152);
    expect(luminance(0, 0, 255)).toBeCloseTo(0.0722);
  });

  test("puts a middle gray near a fifth", () => {
    expect(luminance(128, 128, 128)).toBeCloseTo(0.2159, 3);
  });
});

describe("parseColor", () => {
  test("reads a computed rgb and rgba", () => {
    expect(parseColor("rgb(22, 22, 22)")).toEqual({ red: 22, green: 22, blue: 22, alpha: 1 });
    expect(parseColor("rgba(0, 0, 0, 0)")).toEqual({ red: 0, green: 0, blue: 0, alpha: 0 });
    expect(parseColor("rgba(255, 0, 10, 0.5)")).toEqual({
      red: 255,
      green: 0,
      blue: 10,
      alpha: 0.5,
    });
  });

  test("reads spaces, a slash and percents", () => {
    expect(parseColor("rgb(10 20 30 / 50%)")).toEqual({ red: 10, green: 20, blue: 30, alpha: 0.5 });
    expect(parseColor("rgb(100% 0% 0%)")).toEqual({ red: 255, green: 0, blue: 0, alpha: 1 });
  });

  test("reads color(srgb), its channels counted to 1", () => {
    expect(parseColor("color(srgb 1 0.5 0 / 0.8)")).toEqual({
      red: 255,
      green: 127.5,
      blue: 0,
      alpha: 0.8,
    });
  });

  test("leaves anything else", () => {
    expect(parseColor("transparent")).toBeNull();
    expect(parseColor("oklch(0.2 0.01 250)")).toBeNull();
    expect(parseColor("color(display-p3 1 0 0)")).toBeNull();
    expect(parseColor("rgb(srgb 1 0 0)")).toBeNull();
    expect(parseColor("rgb(1, 2)")).toBeNull();
    expect(parseColor("")).toBeNull();
  });
});

describe("backgroundTheme", () => {
  test("is dark under the threshold and light over it", () => {
    expect(backgroundTheme(parseColor("rgb(22, 22, 22)"))).toBe("dark");
    expect(backgroundTheme(parseColor("rgb(255, 255, 255)"))).toBe("light");
    expect(backgroundTheme(parseColor("rgb(128, 128, 128)"))).toBe("light");
    expect(backgroundTheme(parseColor("rgb(110, 110, 110)"))).toBe("dark");
  });

  test("says nothing where it is clear, or not there", () => {
    expect(backgroundTheme(parseColor("rgba(0, 0, 0, 0)"))).toBeNull();
    expect(backgroundTheme(parseColor("rgba(0, 0, 0, 0.5)"))).toBeNull();
    expect(backgroundTheme(parseColor("rgba(0, 0, 0, 0.6)"))).toBe("dark");
    expect(backgroundTheme(null)).toBeNull();
  });
});

describe("textTheme", () => {
  test("takes light text for a dark page, and dark text for nothing", () => {
    expect(textTheme(parseColor("rgb(240, 240, 240)"))).toBe("dark");
    expect(textTheme(parseColor("rgb(23, 23, 23)"))).toBeNull();
    expect(textTheme(parseColor("rgb(150, 150, 150)"))).toBeNull();
  });

  test("leaves faint text", () => {
    expect(textTheme(parseColor("rgba(255, 255, 255, 0.4)"))).toBeNull();
    expect(textTheme(null)).toBeNull();
  });
});

describe("markerTheme", () => {
  test("reads a class", () => {
    expect(marks(["app", "dark"])).toBe("dark");
    expect(marks(["light"])).toBe("light");
    expect(marks(["darkish"])).toBeNull();
  });

  test("reads a theme attribute, whatever its case", () => {
    expect(marks([], { "data-theme": "Dark" })).toBe("dark");
    expect(marks([], { "data-bs-theme": "light" })).toBe("light");
    expect(marks([], { "data-theme": "system" })).toBeNull();
  });

  test("reads a bare data-dark or data-light", () => {
    expect(marks([], { "data-dark": "" })).toBe("dark");
    expect(marks([], { "data-light": "" })).toBe("light");
  });

  test("takes the class over the attribute", () => {
    expect(marks(["light"], { "data-theme": "dark" })).toBe("light");
  });
});

describe("schemeTheme", () => {
  test("is forced by a single scheme only", () => {
    expect(schemeTheme("dark")).toBe("dark");
    expect(schemeTheme("only light")).toBe("light");
    expect(schemeTheme("light dark")).toBeNull();
    expect(schemeTheme("normal")).toBeNull();
    expect(schemeTheme("")).toBeNull();
  });
});

describe("decideTheme", () => {
  test("is light where the page says nothing", () => {
    expect(decideTheme(none)).toBe("light");
  });

  test("takes what is painted behind the element over all the page says", () => {
    const light = { ...none, marker: "light", scheme: "light", backdrop: "light" } as const;
    expect(decideTheme({ ...light, surface: "dark" })).toBe("dark");
    expect(decideTheme({ ...none, surface: "light", marker: "dark" })).toBe("light");
  });

  test("goes down from the marker to the scheme, the backdrop and the text", () => {
    expect(decideTheme({ ...none, marker: "dark", scheme: "light" })).toBe("dark");
    expect(decideTheme({ ...none, scheme: "dark", backdrop: "light" })).toBe("dark");
    expect(decideTheme({ ...none, backdrop: "light", text: "dark" })).toBe("light");
    expect(decideTheme({ ...none, text: "dark" })).toBe("dark");
  });
});

describe("invertTheme", () => {
  test("gives the bar the other theme", () => {
    expect(invertTheme("dark")).toBe("light");
    expect(invertTheme("light")).toBe("dark");
  });
});

const clear: GrabSignals = { surface: null, own: null, border: null, text: null };

function blue(value: string): boolean {
  return isBlue(parseColor(value));
}

describe("toHsl", () => {
  test("puts the primaries a third of the wheel apart", () => {
    expect(toHsl({ red: 255, green: 0, blue: 0, alpha: 1 })).toEqual({
      hue: 0,
      saturation: 1,
      lightness: 0.5,
    });
    expect(toHsl({ red: 0, green: 255, blue: 0, alpha: 1 }).hue).toBe(120);
    expect(toHsl({ red: 0, green: 0, blue: 255, alpha: 1 }).hue).toBe(240);
  });

  test("wraps a hue under red back onto the wheel", () => {
    expect(toHsl({ red: 255, green: 0, blue: 128, alpha: 1 }).hue).toBeCloseTo(329.88, 1);
  });

  test("gives a gray no hue and no saturation", () => {
    expect(toHsl({ red: 128, green: 128, blue: 128, alpha: 1 })).toEqual({
      hue: 0,
      saturation: 0,
      lightness: 128 / 255,
    });
  });
});

describe("isBlue", () => {
  test("takes the blues brands paint with", () => {
    expect(blue("rgb(0, 112, 243)")).toBe(true);
    expect(blue("rgb(24, 119, 242)")).toBe(true);
    expect(blue("rgb(37, 99, 235)")).toBe(true);
    expect(blue("rgb(29, 155, 240)")).toBe(true);
    expect(blue("rgb(79, 70, 229)")).toBe(true);
    expect(blue(GRAB_COLORS.blue.srgb)).toBe(true);
  });

  test("takes a navy", () => {
    expect(blue("rgb(0, 0, 128)")).toBe(true);
    expect(blue("rgb(30, 58, 138)")).toBe(true);
  });

  test("leaves a light sky tint, under the saturation or over the lightness", () => {
    expect(blue("rgb(200, 210, 220)")).toBe(false);
    expect(blue("rgb(226, 232, 240)")).toBe(false);
    expect(blue("rgb(240, 249, 255)")).toBe(false);
  });

  test("leaves white, black and the grays", () => {
    expect(blue("rgb(255, 255, 255)")).toBe(false);
    expect(blue("rgb(0, 0, 0)")).toBe(false);
    expect(blue("rgb(22, 22, 22)")).toBe(false);
    expect(blue("rgb(128, 128, 128)")).toBe(false);
  });

  test("leaves a blue too dark to tell from black", () => {
    expect(blue("rgb(2, 6, 23)")).toBe(false);
  });

  test("leaves the other hues", () => {
    expect(blue("rgb(48, 209, 88)")).toBe(false);
    expect(blue("rgb(22, 163, 74)")).toBe(false);
    expect(blue("rgb(239, 68, 68)")).toBe(false);
    expect(blue("rgb(255, 0, 0)")).toBe(false);
    expect(blue("rgb(210, 57, 192)")).toBe(false);
    expect(blue("rgb(124, 58, 237)")).toBe(false);
    expect(blue("rgb(20, 184, 166)")).toBe(false);
  });

  test("leaves a blue that is clear, or not there", () => {
    expect(blue("rgba(0, 112, 243, 0.5)")).toBe(false);
    expect(blue("rgba(0, 112, 243, 0.6)")).toBe(true);
    expect(isBlue(null)).toBe(false);
  });
});

describe("decideGrab", () => {
  const brand = parseColor("rgb(0, 112, 243)");
  const white = parseColor("rgb(255, 255, 255)");
  const none = parseColor("rgba(0, 0, 0, 0)");
  const ink = parseColor("rgb(23, 23, 23)");

  test("is blue where the page says nothing", () => {
    expect(decideGrab(clear)).toBe("blue");
  });

  test("is blue on white, on black, on green and on red", () => {
    const values = ["rgb(255, 255, 255)", "rgb(0, 0, 0)", "rgb(22, 163, 74)", "rgb(239, 68, 68)"];
    for (const value of values) {
      const surface = parseColor(value);
      expect(decideGrab({ surface, own: surface, border: null, text: ink })).toBe("blue");
    }
  });

  test("is green on a blue surface", () => {
    expect(decideGrab({ ...clear, surface: brand, own: brand })).toBe("green");
    expect(decideGrab({ ...clear, surface: brand, own: none })).toBe("green");
    expect(decideGrab({ ...clear, surface: parseColor("rgb(0, 0, 128)") })).toBe("green");
  });

  test("is green on a clear element with a blue border or blue text", () => {
    expect(decideGrab({ surface: white, own: none, border: brand, text: ink })).toBe("green");
    expect(decideGrab({ surface: white, own: none, border: null, text: brand })).toBe("green");
    expect(decideGrab({ surface: white, own: null, border: null, text: brand })).toBe("green");
  });

  test("leaves the border and the text of an element that paints its own background", () => {
    expect(decideGrab({ surface: white, own: white, border: brand, text: brand })).toBe("blue");
  });
});

describe("GRAB_COLORS", () => {
  test("gives each tone an sRGB color and a P3 one", () => {
    expect(GRAB_COLORS.blue).toEqual({
      srgb: "rgb(41, 151, 255)",
      p3: "color(display-p3 0.2 0.6 1)",
    });
    expect(GRAB_COLORS.green).toEqual({
      srgb: "rgb(48, 209, 88)",
      p3: "color(display-p3 0.25 0.85 0.4)",
    });
  });

  test("has a green that is not a blue, to stand out where the blue does not", () => {
    expect(blue(GRAB_COLORS.green.srgb)).toBe(false);
  });
});
