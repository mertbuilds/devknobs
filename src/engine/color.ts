import type { CustomColor } from "../types";

/** A color in sRGB: the channels from 0 to 255, the alpha from 0 to 1. */
export interface Color {
  red: number;
  green: number;
  blue: number;
  alpha: number;
}

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

/** Whether a value is a color as the knobs keep one of the user's own. */
export function isCustomColor(value: unknown): value is CustomColor {
  return typeof value === "string" && /^#[0-9a-f]{6}$/.test(value);
}

/** A solid color as the knobs keep it, each channel rounded and held from 0 to 255. */
export function toHex(color: Pick<Color, "red" | "green" | "blue">): CustomColor {
  const pair = (channel: number) =>
    Math.min(255, Math.max(0, Math.round(channel))).toString(16).padStart(2, "0");
  return `#${pair(color.red)}${pair(color.green)}${pair(color.blue)}`;
}

/** A hex color, `#rgb` or `#rrggbb` in either case, as a solid color. Null for anything else. */
export function parseHex(value: string): Color | null {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
  const digits = match?.[1];
  if (!digits) return null;
  const pairs =
    digits.length === 3 ? Array.from(digits, (digit) => digit + digit) : digits.match(/../g);
  const [red = 0, green = 0, blue = 0] = (pairs ?? []).map((pair) => Number.parseInt(pair, 16));
  return { red, green, blue, alpha: 1 };
}

/**
 * A color typed or pasted, as the knobs keep it: a hex, `#rgb` or `#rrggbb`
 * with or without its `#`, or a solid `rgb()` with every channel from 0 to
 * 255. Null for anything else, a color that is not solid too.
 */
export function readColor(text: string): CustomColor | null {
  const value = text.trim();
  const color = parseHex(value.startsWith("#") ? value : `#${value}`) ?? parseColor(value);
  if (!color || color.alpha !== 1) return null;
  const channels = [color.red, color.green, color.blue];
  return channels.every((channel) => channel >= 0 && channel <= 255) ? toHex(color) : null;
}

/** How far apart two relative luminances are, as the contrast ratio from 1 to 21. */
export function contrast(a: number, b: number): number {
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** A solid color `share` of the way from `from` to `to`, 0 to 1. */
export function mix(from: Color, to: Color, share: number): Color {
  const at = (a: number, b: number) => a + (b - a) * share;
  return {
    red: at(from.red, to.red),
    green: at(from.green, to.green),
    blue: at(from.blue, to.blue),
    alpha: 1,
  };
}

const WHITE: Color = { red: 255, green: 255, blue: 255, alpha: 1 };
const BLACK: Color = { red: 0, green: 0, blue: 0, alpha: 1 };

/** How far an ink goes from its color toward white or black, 0 to 1. */
const INK = 0.9;

/**
 * The ink that reads on every one of `grounds`: a tint of `color` toward
 * white or a shade of it toward black, whichever stands out more from the
 * ground it stands out from least.
 */
export function inkOn(color: Color, grounds: readonly Color[]): Color {
  const least = (ink: Color) => {
    const own = luminance(ink.red, ink.green, ink.blue);
    return Math.min(
      ...grounds.map((ground) => contrast(own, luminance(ground.red, ground.green, ground.blue))),
    );
  };
  const light = mix(color, WHITE, INK);
  const dark = mix(color, BLACK, INK);
  return least(light) >= least(dark) ? light : dark;
}
