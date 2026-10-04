// adapted from react-grab (MIT, Copyright (c) 2025 Aiden Bai)

/** What the page looks like where grab draws: the bar takes the other one. */
export type Theme = "light" | "dark";

/** A color in sRGB: the channels from 0 to 255, the alpha from 0 to 1. */
export interface Color {
  red: number;
  green: number;
  blue: number;
  alpha: number;
}

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

/** The relative luminance of an sRGB color, from 0 for black to 1 for white. */
export function luminance(red: number, green: number, blue: number): number {
  const [r = 0, g = 0, b = 0] = [red, green, blue].map((channel) => {
    const share = channel / 255;
    return share <= 0.03928 ? share / 12.92 : ((share + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function part(value: string, whole: number): number {
  return value.endsWith("%") ? (Number.parseFloat(value) / 100) * whole : Number.parseFloat(value);
}

/**
 * A computed `rgb()`, `rgba()` or `color(srgb ...)` as a color, with commas
 * or with spaces and a slash. Null for anything else, `transparent` too.
 */
export function parseColor(value: string): Color | null {
  const match = /^(rgba?|color)\(\s*(srgb\s+)?([^)]+)\)$/i.exec(value.trim());
  if (!match) return null;
  const srgb = match[1]?.toLowerCase() === "color";
  if (srgb !== Boolean(match[2])) return null;
  const parts = (match[3] ?? "").split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 3 || parts.length > 4) return null;
  // `color(srgb)` counts its channels to 1, `rgb()` to 255.
  const scale = srgb ? 255 : 1;
  const [red, green, blue] = parts
    .slice(0, 3)
    .map((channel) => (channel.endsWith("%") ? part(channel, 255) : part(channel, 1) * scale));
  const alpha = parts[3] === undefined ? 1 : part(parts[3], 1);
  if (red === undefined || green === undefined || blue === undefined) return null;
  if ([red, green, blue, alpha].some((channel) => !Number.isFinite(channel))) return null;
  return { red, green, blue, alpha };
}

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

/** The other theme: the one a bar takes to stand out on a page. */
export function invertTheme(theme: Theme): Theme {
  return theme === "dark" ? "light" : "dark";
}

/**
 * Reads the theme of this document where an element is, or of the page with
 * none. The page is read once and each element's surface once, so a reader
 * is good for one run of grab.
 */
export function createThemeReader(): (element: Element | null) => Theme {
  const colors = new Map<string, Color | null>();
  const surfaces = new WeakMap<Element, Theme | null>();
  let context: CanvasRenderingContext2D | null | undefined;
  let page: Omit<ThemeSignals, "surface"> | null = null;

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

  function surfaceOf(element: Element): Theme | null {
    const walked: Element[] = [];
    let found: Theme | null = null;
    let node: Element | null = element;
    while (node && node !== document.body && node !== document.documentElement) {
      const known = surfaces.get(node);
      if (known !== undefined) {
        found = known;
        break;
      }
      walked.push(node);
      found = backgroundTheme(colorOf(getComputedStyle(node).backgroundColor));
      if (found) break;
      node = parentOf(node);
    }
    for (const each of walked) surfaces.set(each, found);
    return found;
  }

  function first(
    roots: readonly (HTMLElement | null)[],
    read: (root: HTMLElement) => Theme | null,
  ): Theme | null {
    for (const root of roots) {
      const theme = root ? read(root) : null;
      if (theme) return theme;
    }
    return null;
  }

  /** The markers are read html first, the paint body first: that is where each tends to be. */
  function readPage(): Omit<ThemeSignals, "surface"> {
    const html = document.documentElement;
    const body = document.body;
    const meta = document.querySelector('meta[name="color-scheme"]')?.getAttribute("content");
    return {
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
      backdrop: first([body, html], (root) =>
        backgroundTheme(colorOf(getComputedStyle(root).backgroundColor)),
      ),
      text: textTheme(colorOf(getComputedStyle(html).color)),
    };
  }

  return (element) => {
    page ??= readPage();
    return decideTheme({ surface: element ? surfaceOf(element) : null, ...page });
  };
}
