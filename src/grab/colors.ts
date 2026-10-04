import type { GrabColorValue } from "../types";
import type { GrabTone } from "./theme";

/** A color grab draws its boxes and its glow in. */
export type GrabColor = Exclude<GrabColorValue, "auto">;

/** Each color as the `--grab` variable takes it, in sRGB and wider in P3. */
export const GRAB_COLORS: Record<GrabColor, { srgb: string; p3: string }> = {
  blue: { srgb: "rgb(41, 151, 255)", p3: "color(display-p3 0.2 0.6 1)" },
  green: { srgb: "rgb(48, 209, 88)", p3: "color(display-p3 0.25 0.85 0.4)" },
  // react-grab's own (MIT, Copyright (c) 2025 Aiden Bai)
  pink: { srgb: "rgb(210, 57, 192)", p3: "color(display-p3 0.84 0.19 0.78)" },
  orange: { srgb: "rgb(255, 149, 0)", p3: "color(display-p3 1 0.58 0)" },
  purple: { srgb: "rgb(175, 82, 222)", p3: "color(display-p3 0.69 0.3 0.9)" },
  cyan: { srgb: "rgb(50, 200, 230)", p3: "color(display-p3 0.2 0.8 0.92)" },
};

/** The names of the colors, in the order the panel shows them. */
export const GRAB_COLOR_NAMES = Object.keys(GRAB_COLORS) as GrabColor[];

/**
 * The color grab draws in: the one that was picked, whatever the page, or
 * with `auto` the tone the page asks for.
 */
export function grabColor(value: GrabColorValue, tone: GrabTone): GrabColor {
  return value === "auto" ? tone : value;
}
