/**
 * Colors, for what inspect says of an element's text: a css color as
 * channels, one color over another, the background that is really behind
 * the text, and how well the two are told apart. Nothing here touches the page.
 */

import { type Color, luminance, parseColor } from "../engine/color";

/**
 * The colors css names that a page is likely to be read with here: the
 * sixteen of css 1, `orange` and `rebeccapurple`. A computed style never
 * names one, so the rest of the list is left out.
 */
const NAMED: Record<string, string> = {
  black: "#000000",
  silver: "#c0c0c0",
  gray: "#808080",
  grey: "#808080",
  white: "#ffffff",
  maroon: "#800000",
  red: "#ff0000",
  purple: "#800080",
  fuchsia: "#ff00ff",
  green: "#008000",
  lime: "#00ff00",
  olive: "#808000",
  yellow: "#ffff00",
  navy: "#000080",
  blue: "#0000ff",
  teal: "#008080",
  aqua: "#00ffff",
  orange: "#ffa500",
  rebeccapurple: "#663399",
};

const WHITE: Color = { red: 255, green: 255, blue: 255, alpha: 1 };

function hex(value: string): Color | null {
  const match = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(value);
  if (!match?.[1]) return null;
  const digits = match[1];
  const wide = digits.length <= 4 ? [...digits].map((digit) => digit + digit).join("") : digits;
  const channel = (at: number) => Number.parseInt(wide.slice(at, at + 2), 16);
  return {
    red: channel(0),
    green: channel(2),
    blue: channel(4),
    alpha: wide.length === 8 ? channel(6) / 255 : 1,
  };
}

/** An angle in degrees, from a bare number or one with a unit. */
function degrees(value: string): number {
  const number = Number.parseFloat(value);
  if (value.endsWith("turn")) return number * 360;
  if (value.endsWith("grad")) return number * 0.9;
  if (value.endsWith("rad")) return (number * 180) / Math.PI;
  return number;
}

function hsl(value: string): Color | null {
  const match = /^hsla?\(([^)]+)\)$/i.exec(value);
  if (!match?.[1]) return null;
  const parts = match[1].split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 3 || parts.length > 4) return null;
  const [h = "", s = "", l = "", a] = parts;
  const hue = (((degrees(h) % 360) + 360) % 360) / 30;
  const saturation = Math.min(Math.max(Number.parseFloat(s) / 100, 0), 1);
  const lightness = Math.min(Math.max(Number.parseFloat(l) / 100, 0), 1);
  const alpha =
    a === undefined ? 1 : a.endsWith("%") ? Number.parseFloat(a) / 100 : Number.parseFloat(a);
  if (![hue, saturation, lightness, alpha].every(Number.isFinite)) return null;
  const reach = saturation * Math.min(lightness, 1 - lightness);
  const channel = (n: number) => {
    const k = (n + hue) % 12;
    return 255 * (lightness - reach * Math.max(-1, Math.min(k - 3, 9 - k, 1)));
  };
  return { red: channel(0), green: channel(8), blue: channel(4), alpha };
}

/**
 * A css color as channels: a hex, `rgb()` and `rgba()`, `hsl()` and `hsla()`,
 * `color(srgb ...)`, `transparent` and the common names. Null for anything
 * else, as a color in another space is, which only the browser can paint.
 */
export function parseCss(value: string): Color | null {
  const text = value.trim().toLowerCase();
  if (text === "transparent") return { red: 0, green: 0, blue: 0, alpha: 0 };
  const named = Object.hasOwn(NAMED, text) ? NAMED[text] : undefined;
  return hex(named ?? text) ?? hsl(text) ?? parseColor(text);
}

/** One color over another, as the page paints them. */
export function composite(top: Color, under: Color): Color {
  const alpha = top.alpha + under.alpha * (1 - top.alpha);
  if (alpha <= 0) return { red: 0, green: 0, blue: 0, alpha: 0 };
  const mix = (over: number, below: number) =>
    (over * top.alpha + below * under.alpha * (1 - top.alpha)) / alpha;
  return {
    red: mix(top.red, under.red),
    green: mix(top.green, under.green),
    blue: mix(top.blue, under.blue),
    alpha,
  };
}

function byte(channel: number): number {
  return Math.min(255, Math.max(0, Math.round(channel)));
}

/** A color in its short form: a hex where it is solid, `rgb()` with its alpha where it is not. */
export function shortColor(color: Color): string {
  const channels = [byte(color.red), byte(color.green), byte(color.blue)];
  const alpha = Math.round(color.alpha * 100) / 100;
  if (alpha <= 0) return "transparent";
  if (alpha >= 1) return `#${channels.map((one) => one.toString(16).padStart(2, "0")).join("")}`;
  return `rgb(${channels.join(" ")} / ${alpha})`;
}

/** The most ancestors the walk for a background goes up. */
export const WALK_CAP = 20;

/**
 * The backgrounds behind an element, its own first, then each ancestor's,
 * up to the first solid one or `cap` ancestors, whichever comes first.
 */
export function walkBackgrounds<Node>(
  start: Node,
  read: (node: Node) => Color | null,
  parent: (node: Node) => Node | null,
  cap = WALK_CAP,
): (Color | null)[] {
  const found: (Color | null)[] = [];
  let node: Node | null = start;
  while (node !== null && found.length <= cap) {
    const color = read(node);
    found.push(color);
    if (color && color.alpha >= 1) break;
    node = parent(node);
  }
  return found;
}

/**
 * The color behind the text: the backgrounds one over another, the nearest on
 * top, over white where none of them is solid, as a page with no background
 * of its own is white.
 */
export function effectiveBackground(backgrounds: readonly (Color | null)[]): Color {
  let color = WHITE;
  for (let at = backgrounds.length - 1; at >= 0; at -= 1) {
    const layer = backgrounds[at];
    if (layer && layer.alpha > 0) color = composite(layer, color);
  }
  return color;
}

/** The wcag contrast ratio of two solid colors, from 1 to 21. */
export function contrastRatio(a: Color, b: Color): number {
  const first = luminance(a.red, a.green, a.blue);
  const second = luminance(b.red, b.green, b.blue);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

/** Text of this size is large to wcag: 18pt, or 14pt where it is bold. In css px. */
export const LARGE = 24;
export const LARGE_BOLD = 18.66;
/** A weight from here on is bold. */
export const BOLD = 700;

/** The ratio level AA asks of text of a size and a weight: 3 for large text, 4.5 for the rest. */
export function aaRatio(size: number, weight: number): number {
  return size >= LARGE || (size >= LARGE_BOLD && weight >= BOLD) ? 3 : 4.5;
}

/** Whether a contrast ratio meets level AA for text of a size and a weight. */
export function passesAA(ratio: number, size: number, weight: number): boolean {
  return ratio >= aaRatio(size, weight);
}
