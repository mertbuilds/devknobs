import type { MatColorName } from "../types";
import { type Color, inkOn, isCustomColor, parseHex } from "./color";

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
export const MAT_COLORS: Record<MatColorName, MatPaint> = {
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
export const MAT_COLOR_NAMES: readonly MatColorName[] = [
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

/** Whether a value names one of the mat's own colors. */
export function isMatName(value: unknown): value is MatColorName {
  return MAT_COLOR_NAMES.some((name) => name === value);
}

/**
 * How deep each stop of a color of the user's own is, as a share of the color:
 * the color itself up top and deeper toward the edges, as the mat's own are.
 */
const SHADE = [1, 0.82, 0.64] as const;

function rgb(color: Color): string {
  return `rgb(${Math.round(color.red)}, ${Math.round(color.green)}, ${Math.round(color.blue)})`;
}

/** A color of the user's own at each stop: itself up top, and deeper toward the edges. */
function shades(color: Color): [Color, Color, Color] {
  const shade = (share: number): Color => ({
    red: color.red * share,
    green: color.green * share,
    blue: color.blue * share,
    alpha: 1,
  });
  return [shade(SHADE[0]), shade(SHADE[1]), shade(SHADE[2])];
}

/** The color a hex of the user's own stands for, or null for anything else. */
function customColor(mat: string): Color | null {
  return isCustomColor(mat) ? parseHex(mat) : null;
}

/** The mat's stops alone, in sRGB and in P3. */
export type MatStops = Pick<MatPaint, "srgb" | "p3">;

/**
 * The stops of any color the mat takes, which is all the early script paints:
 * one of the mat's own by name, one of the user's from its hex, the same in
 * P3, which a hex does not reach past sRGB, and blue's for anything else.
 */
export function matStops(mat: string): MatStops {
  if (isMatName(mat)) return MAT_COLORS[mat];
  const color = customColor(mat);
  if (!color) return MAT_COLORS.blue;
  const [top, middle, edge] = shades(color);
  const stops = [rgb(top), rgb(middle), rgb(edge)] as const;
  return { srgb: stops, p3: stops };
}

/**
 * The paint of any color the mat takes. One of the user's own has its lines
 * and numbers in the ink that reads on all three of its stops, light on a
 * dark color and dark on a light one.
 */
export function matPaint(mat: string): MatPaint {
  if (isMatName(mat)) return MAT_COLORS[mat];
  const color = customColor(mat);
  return color ? { ...matStops(mat), line: rgb(inkOn(color, shades(color))) } : MAT_COLORS.blue;
}

/** The variables that paint the mat, as the rule of a color of its own sets them. */
const MAT_VARIABLES = ["--mat", "--mat-p3", "--mat-line"] as const;

/**
 * Give `node` a color of the mat: `data-mat` names it, and the rule of one of
 * the mat's own paints it from there. A color of the user's has no rule, so
 * its paint goes on the node itself. Null takes the color off again.
 */
export function putMat(node: HTMLElement | SVGElement, mat: string | null): void {
  if (mat === null) node.removeAttribute("data-mat");
  else node.setAttribute("data-mat", mat);
  if (mat === null || isMatName(mat)) {
    for (const name of MAT_VARIABLES) node.style.removeProperty(name);
    return;
  }
  const paint = matPaint(mat);
  node.style.setProperty("--mat", matGradient(paint.srgb));
  node.style.setProperty("--mat-p3", matGradient(paint.p3));
  node.style.setProperty("--mat-line", paint.line);
}
