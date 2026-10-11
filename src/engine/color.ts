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

const NUMBER = String.raw`(?:\d+(?:\.\d+)?|\.\d+)`;
const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const PLAIN = new RegExp(
  String.raw`^rgba?\(\s*${NUMBER}(?:(?:\s*,\s*${NUMBER}){2}(?:\s*,\s*${NUMBER})?|(?:\s+${NUMBER}){2}(?:\s*/\s*${NUMBER})?)\s*\)$`,
  "i",
);

/**
 * A color someone else wrote, taken only in its plainest forms: a hex of 3,
 * 4, 6 or 8 digits, or an `rgb()` or `rgba()` of plain numbers, the channels
 * from 0 to 255 and the alpha from 0 to 1. Null for anything else, a name, a
 * percentage and a channel out of range too.
 */
export function parsePlainColor(value: unknown): Color | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  let color: Color | null = null;
  if (HEX.test(text)) {
    const digits = text.slice(1);
    const wide = digits.length > 4 ? digits : digits.replace(/./g, "$&$&");
    const [red = 0, green = 0, blue = 0, alpha = 255] = (wide.match(/../g) ?? []).map((pair) =>
      Number.parseInt(pair, 16),
    );
    color = { red, green, blue, alpha: alpha / 255 };
  } else if (PLAIN.test(text)) {
    color = parseColor(text);
  }
  if (!color) return null;
  const { red, green, blue, alpha } = color;
  return [red, green, blue].every((channel) => channel <= 255) && alpha <= 1 ? color : null;
}
