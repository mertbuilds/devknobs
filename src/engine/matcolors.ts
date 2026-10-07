import type { MatColorValue } from "../types";

/**
 * A mat's paint: its three stops, a little lighter up top and deeper toward
 * the edges, in sRGB and wider in P3, and the light tint of its own hue its
 * lines and numbers are drawn in.
 */
export interface MatPaint {
  srgb: readonly [string, string, string];
  p3: readonly [string, string, string];
  line: string;
}

/**
 * Each color of the mat. The others take blue's lightness at each stop and
 * its lines' lightness and chroma in OKLCH at their own hue, calmer where the
 * hue is louder, and their P3 stops about 15% more chroma, as blue's have.
 * Green is the classic cutting mat's, a little lighter, and graphite the
 * dark grey one's, a little darker.
 */
export const MAT_COLORS: Record<MatColorValue, MatPaint> = {
  blue: {
    srgb: ["rgb(20, 70, 152)", "rgb(12, 48, 114)", "rgb(7, 31, 80)"],
    p3: [
      "color(display-p3 0.1 0.27 0.61)",
      "color(display-p3 0.06 0.19 0.46)",
      "color(display-p3 0.035 0.12 0.32)",
    ],
    line: "rgb(170, 205, 255)",
  },
  green: {
    srgb: ["rgb(26, 96, 71)", "rgb(14, 71, 51)", "rgb(8, 49, 35)"],
    p3: [
      "color(display-p3 0.159 0.377 0.279)",
      "color(display-p3 0.102 0.277 0.2)",
      "color(display-p3 0.065 0.194 0.136)",
    ],
    line: "rgb(160, 218, 191)",
  },
  magenta: {
    srgb: ["rgb(123, 37, 88)", "rgb(90, 22, 63)", "rgb(62, 12, 42)"],
    p3: [
      "color(display-p3 0.462 0.14 0.342)",
      "color(display-p3 0.34 0.081 0.246)",
      "color(display-p3 0.234 0.043 0.165)",
    ],
    line: "rgb(238, 185, 211)",
  },
  purple: {
    srgb: ["rgb(86, 56, 130)", "rgb(62, 38, 96)", "rgb(42, 24, 67)"],
    p3: [
      "color(display-p3 0.326 0.209 0.521)",
      "color(display-p3 0.233 0.138 0.387)",
      "color(display-p3 0.156 0.086 0.269)",
    ],
    line: "rgb(209, 193, 242)",
  },
  red: {
    srgb: ["rgb(132, 36, 36)", "rgb(97, 21, 22)", "rgb(68, 11, 12)"],
    p3: [
      "color(display-p3 0.499 0.139 0.133)",
      "color(display-p3 0.369 0.079 0.078)",
      "color(display-p3 0.256 0.041 0.042)",
    ],
    line: "rgb(239, 188, 183)",
  },
  graphite: {
    srgb: ["rgb(64, 68, 74)", "rgb(43, 46, 51)", "rgb(26, 28, 32)"],
    p3: [
      "color(display-p3 0.25 0.264 0.291)",
      "color(display-p3 0.169 0.179 0.2)",
      "color(display-p3 0.102 0.11 0.126)",
    ],
    line: "rgb(198, 203, 211)",
  },
};

/** The names of the colors, in the order the panel shows them. */
export const MAT_COLOR_NAMES: readonly MatColorValue[] = [
  "blue",
  "green",
  "magenta",
  "purple",
  "red",
  "graphite",
];

/** The mat's background: its stops spread from the middle of its top edge. */
export function matGradient(stops: readonly [string, string, string]): string {
  return `radial-gradient(140% 100% at 50% 0%, ${stops[0]}, ${stops[1]} 60%, ${stops[2]})`;
}
