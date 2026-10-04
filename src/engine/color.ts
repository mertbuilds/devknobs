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
