// adapted from react-grab (MIT, Copyright (c) 2025 Aiden Bai)
import { type Color, luminance, parseColor } from "../engine/color";

/** What the page looks like where grab draws: the bar takes the other one. */
export type Theme = "light" | "dark";

/** A background under this relative luminance is a dark one. */
export const DARK_BACKGROUND = 0.18;
/** Text over this relative luminance is only read on a dark page. */
export const LIGHT_TEXT = 0.6;
/** A color no more solid than this says nothing: what is behind it shows through. */
export const SOLID = 0.5;

/** Attributes that name the theme, as the common frameworks set them. */
const THEME_ATTRIBUTES = [
  "data-theme",
  "data-mode",
  "data-color-scheme",
  "data-bs-theme",
  "data-mui-color-scheme",
  "data-mantine-color-scheme",
] as const;

/** The theme a painted background makes, or null where it is too clear to say. */
export function backgroundTheme(color: Color | null): Theme | null {
  if (!color || color.alpha <= SOLID) return null;
  return luminance(color.red, color.green, color.blue) < DARK_BACKGROUND ? "dark" : "light";
}

/**
 * The theme the text gives away: light text is only there for a dark page.
 * Dark text is the default on any page, so it says nothing.
 */
export function textTheme(color: Color | null): Theme | null {
  if (!color || color.alpha <= SOLID) return null;
  return luminance(color.red, color.green, color.blue) > LIGHT_TEXT ? "dark" : null;
}

/**
 * The theme an element is marked with: a `dark` or `light` class, one of the
 * theme attributes, or a bare `data-dark` or `data-light`.
 */
export function markerTheme(
  hasClass: (name: string) => boolean,
  attribute: (name: string) => string | null,
): Theme | null {
  if (hasClass("dark")) return "dark";
  if (hasClass("light")) return "light";
  for (const name of THEME_ATTRIBUTES) {
    const value = attribute(name)?.toLowerCase();
    if (value === "dark" || value === "light") return value;
  }
  if (attribute("data-dark") !== null) return "dark";
  if (attribute("data-light") !== null) return "light";
  return null;
}

/**
 * The theme a `color-scheme` forces: only one that lists a single scheme.
 * With both, the system picks, and with neither, nothing is said.
 */
export function schemeTheme(value: string): Theme | null {
  const tokens = value.trim().toLowerCase().split(/\s+/);
  const dark = tokens.includes("dark");
  if (dark === tokens.includes("light")) return null;
  return dark ? "dark" : "light";
}

/** What was read off the page, each null where it says nothing. */
export interface ThemeSignals {
  /** The nearest painted background from the element up, short of the body. */
  surface: Theme | null;
  /** A theme marker on the html or the body. */
  marker: Theme | null;
  /** A `color-scheme` on the html, the body or in a meta. */
  scheme: Theme | null;
  /** The painted background of the body, or of the html. */
  backdrop: Theme | null;
  /** The text color of the html. */
  text: Theme | null;
}

/**
 * The theme where an element is. What is painted right behind it counts
 * first, so a dark section on a light page is dark. Then what the page says
 * it is, then what it paints, then its text. A page that says nothing is light.
 */
export function decideTheme(signals: ThemeSignals): Theme {
  return (
    signals.surface ??
    signals.marker ??
    signals.scheme ??
    signals.backdrop ??
    signals.text ??
    "light"
  );
}

/** The color grab draws in where it picks its own: blue, or green on a blue page. */
export type GrabTone = "blue" | "green";

/** The hues a blue goes from and to, in degrees. */
const BLUE_HUES = [190, 260] as const;
/** A color no more saturated than this is a gray, or a tint, not a blue. */
const BLUE_SATURATION = 0.35;
/** The lightness a blue goes from and to: under it is black, over it white. */
const BLUE_LIGHTNESS = [0.15, 0.85] as const;

/** A color in HSL: the hue in degrees, the saturation and the lightness from 0 to 1. */
export function toHsl(color: Color): { hue: number; saturation: number; lightness: number } {
  const red = color.red / 255;
  const green = color.green / 255;
  const blue = color.blue / 255;
  const high = Math.max(red, green, blue);
  const low = Math.min(red, green, blue);
  const spread = high - low;
  const lightness = (high + low) / 2;
  if (spread === 0) return { hue: 0, saturation: 0, lightness };
  const saturation = spread / (1 - Math.abs(2 * lightness - 1));
  let hue: number;
  if (high === red) hue = ((green - blue) / spread) % 6;
  else if (high === green) hue = (blue - red) / spread + 2;
  else hue = (red - green) / spread + 4;
  return { hue: (hue * 60 + 360) % 360, saturation, lightness };
}

/** Whether a color is a blue that grab's own blue would be lost on. Not a clear one. */
export function isBlue(color: Color | null): boolean {
  if (!color || color.alpha <= SOLID) return false;
  const { hue, saturation, lightness } = toHsl(color);
  return (
    hue >= BLUE_HUES[0] &&
    hue <= BLUE_HUES[1] &&
    saturation > BLUE_SATURATION &&
    lightness >= BLUE_LIGHTNESS[0] &&
    lightness <= BLUE_LIGHTNESS[1]
  );
}

/** The colors read where an element is, each null where there is none. */
export interface GrabSignals {
  /** The nearest painted background from the element up, the page's too. */
  surface: Color | null;
  /** The element's own background. */
  own: Color | null;
  /** The element's border, where it has one. */
  border: Color | null;
  /** The element's text color. */
  text: Color | null;
}

/**
 * The tone grab takes on an element: green where what is behind it is blue,
 * or where the element is clear and its border or its text is blue. Blue
 * anywhere else.
 */
export function decideGrab(signals: GrabSignals): GrabTone {
  if (isBlue(signals.surface)) return "green";
  const clear = !signals.own || signals.own.alpha <= SOLID;
  if (clear && (isBlue(signals.border) || isBlue(signals.text))) return "green";
  return "blue";
}

/** The other theme: the one a bar takes to stand out on a page. */
export function invertTheme(theme: Theme): Theme {
  return theme === "dark" ? "light" : "dark";
}

/** What a reader finds where an element is: the theme, and the tone grab takes. */
export interface Reading {
  theme: Theme;
  grab: GrabTone;
}

/** What is read off the page once: its signals, and the color of its backdrop. */
interface Page {
  signals: Omit<ThemeSignals, "surface">;
  backdrop: Color | null;
}

/**
 * Reads the theme of this document where an element is, or of the page with
 * none, and the tone grab takes there. The page is read once and each
 * element once, so a reader is good for one run of grab.
 */
export function createThemeReader(): (element: Element | null) => Reading {
  const colors = new Map<string, Color | null>();
  const surfaces = new WeakMap<Element, Color | null>();
  const tones = new WeakMap<Element, GrabTone>();
  let context: CanvasRenderingContext2D | null | undefined;
  let page: Page | null = null;

  /**
   * A color the parser does not know, such as `oklch()`, painted on a pixel
   * and read back.
   */
  function paint(value: string): Color | null {
    if (!CSS.supports("color", value)) return null;
    if (context === undefined) {
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      context = canvas.getContext("2d", { willReadFrequently: true });
    }
    if (!context) return null;
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = value;
    context.fillRect(0, 0, 1, 1);
    const [red = 0, green = 0, blue = 0, alpha = 0] = context.getImageData(0, 0, 1, 1).data;
    return { red, green, blue, alpha: alpha / 255 };
  }

  function colorOf(value: string): Color | null {
    let color = colors.get(value);
    if (color === undefined) {
      color = parseColor(value) ?? paint(value);
      colors.set(value, color);
    }
    return color;
  }

  function parentOf(element: Element): Element | null {
    if (element.parentElement) return element.parentElement;
    const root = element.getRootNode();
    return root instanceof ShadowRoot ? root.host : null;
  }

  /** A color that is painted, or null for one too clear to say anything. */
  function solid(color: Color | null): Color | null {
    return color && color.alpha > SOLID ? color : null;
  }

  function surfaceOf(element: Element): Color | null {
    const walked: Element[] = [];
    let found: Color | null = null;
    let node: Element | null = element;
    while (node && node !== document.body && node !== document.documentElement) {
      const known = surfaces.get(node);
      if (known !== undefined) {
        found = known;
        break;
      }
      walked.push(node);
      found = solid(colorOf(getComputedStyle(node).backgroundColor));
      if (found) break;
      node = parentOf(node);
    }
    for (const each of walked) surfaces.set(each, found);
    return found;
  }

  function first<Value>(
    roots: readonly (HTMLElement | null)[],
    read: (root: HTMLElement) => Value | null,
  ): Value | null {
    for (const root of roots) {
      const value = root ? read(root) : null;
      if (value) return value;
    }
    return null;
  }

  /** The markers are read html first, the paint body first: that is where each tends to be. */
  function readPage(): Page {
    const html = document.documentElement;
    const body = document.body;
    const meta = document.querySelector('meta[name="color-scheme"]')?.getAttribute("content");
    const backdrop = first([body, html], (root) =>
      solid(colorOf(getComputedStyle(root).backgroundColor)),
    );
    const signals = {
      marker: first([html, body], (root) =>
        markerTheme(
          (name) => root.classList.contains(name),
          (name) => root.getAttribute(name),
        ),
      ),
      scheme:
        first([html, body], (root) =>
          schemeTheme(root.style.colorScheme || getComputedStyle(root).colorScheme),
        ) ?? schemeTheme(meta ?? ""),
      backdrop: backgroundTheme(backdrop),
      text: textTheme(colorOf(getComputedStyle(html).color)),
    };
    return { signals, backdrop };
  }

  function toneOf(element: Element, surface: Color | null): GrabTone {
    let tone = tones.get(element);
    if (tone === undefined) {
      const style = getComputedStyle(element);
      tone = decideGrab({
        surface,
        own: colorOf(style.backgroundColor),
        border: Number.parseFloat(style.borderTopWidth) > 0 ? colorOf(style.borderTopColor) : null,
        text: colorOf(style.color),
      });
      tones.set(element, tone);
    }
    return tone;
  }

  return (element) => {
    page ??= readPage();
    const near = element ? surfaceOf(element) : null;
    const surface = near ?? page.backdrop;
    return {
      theme: decideTheme({ surface: backgroundTheme(near), ...page.signals }),
      grab: element
        ? toneOf(element, surface)
        : decideGrab({ surface, own: null, border: null, text: null }),
    };
  };
}
