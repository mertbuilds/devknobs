import type { MatColorValue } from "../types";
import { svgNode } from "./browserkit";

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

/**
 * Each color as variables on the element whose `data-mat` names it: `--mat`
 * and `--mat-p3` for the background, `--mat-line` for the lines and numbers.
 */
function colorRules(): string {
  return MAT_COLOR_NAMES.map((name) => {
    const paint = MAT_COLORS[name];
    return `[data-mat="${name}"] { --mat: ${matGradient(paint.srgb)}; --mat-p3: ${matGradient(paint.p3)}; --mat-line: ${paint.line}; }`;
  }).join("\n");
}

/** The mat in the letterbox's shadow root, under the strip and the stage, and never in the way of a pointer. */
export const MAT_CSS = `
${colorRules()}
.mat {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  fill: var(--mat-line);
}
.mat .cell { opacity: 0.07; }
.mat .major { opacity: 0.14; }
.mat .span { opacity: 0.26; }
.mat .angle { fill: none; stroke: var(--mat-line); }
.mat .mark, .mat .tick { opacity: 0.55; }
.mat text {
  font: 9px/1 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-variant-numeric: tabular-nums;
  opacity: 0.5;
}`;

/** The grid of the mat, in css px: a fine line, a stronger one, and the strongest with a mark where two cross. */
export const CELL = 10;
export const MAJOR = 50;
export const SPAN = 100;

/** How far each tick of a ruler reaches into the mat, in css px. */
const TICK = { cell: 3, major: 5, span: 9 };

/**
 * The angle guides, in degrees up from the baseline, how faint each is next
 * to the spans (0.26), the radius of the arc at their vertex, where they
 * start, the radius their labels sit at, how far off the line, and the room
 * a label leaves the rulers and readout up top, all in css px.
 */
const ANGLES = [15, 30, 45, 60, 75];
const GUIDE = { line: 0.15, half: 0.22 };
const ARC = 40;
const LABEL = { radius: 240, off: 3, top: 40, room: 24 };

/** How far above the bottom edge the vertex sits at least, in css px. */
const FOOT = 30;

/** The room a ruler's number takes along its edge, in css px. */
const NUMBER = 24;

/** A tick on a ruler: where it is from the mat's edge, and how far in it reaches. */
export interface Tick {
  at: number;
  size: number;
}

/** The ticks along an edge `length` px long, one every cell, longer on the major lines and spans. */
export function ticks(length: number): Tick[] {
  const out: Tick[] = [];
  for (let at = CELL; at < length; at += CELL) {
    const size = at % SPAN === 0 ? TICK.span : at % MAJOR === 0 ? TICK.major : TICK.cell;
    out.push({ at, size });
  }
  return out;
}

/**
 * Where a ruler is numbered: every span along an edge `length` px long, whole
 * numbers only, short of one that would run off the end or into `avoid`, the
 * stretch of the edge that something else holds.
 */
export function numbers(length: number, avoid?: { from: number; to: number }): number[] {
  const out: number[] = [];
  for (let at = SPAN; at + NUMBER <= length; at += SPAN) {
    if (avoid && at + NUMBER > avoid.from && at < avoid.to) continue;
    out.push(at);
  }
  return out;
}

/** Thin rects as path data, one per line, so a line is as thin as `hair` and no stroke blurs it. */
function lines(across: number[], length: number, hair: number): string {
  return across
    .map((at) => `M${at} 0h${hair}v${length}h${-hair}ZM0 ${at}h${length}v${hair}h${-length}Z`)
    .join("");
}

/** A point on the mat, in css px from its top left. */
export interface Point {
  x: number;
  y: number;
}

/**
 * The vertex of the angle guides on a mat `height` px tall: on the left edge,
 * at the lowest span crossing at least `FOOT` px above the bottom, so its
 * span line is the baseline and the left edge stands at 90 degrees. Null on a
 * mat too short to hold one.
 */
export function vertex(height: number): Point | null {
  const y = Math.floor((height - FOOT) / SPAN) * SPAN;
  return y > 0 ? { x: 0, y } : null;
}

/** The unit step of a ray `angle` degrees up from the baseline, counterclockwise. */
function direction(angle: number): Point {
  const turn = (angle * Math.PI) / 180;
  return { x: Math.cos(turn), y: -Math.sin(turn) };
}

/**
 * Where a ray from `from`, `angle` degrees up from the baseline (0 to 90),
 * leaves a `width` by `height` box through its top or right edge, landing
 * exactly on that edge.
 */
export function exit(from: Point, angle: number, size: { width: number; height: number }): Point {
  const step = direction(angle);
  const toTop = step.y < 0 ? from.y / -step.y : Infinity;
  const toRight = step.x > 0 ? (size.width - from.x) / step.x : Infinity;
  if (toTop <= toRight) return { x: from.x + toTop * step.x, y: 0 };
  return { x: size.width, y: from.y + toRight * step.y };
}

/** The point `radius` px from `from` along a ray `angle` degrees up from the baseline, moved `off` px to its left. */
export function along(from: Point, angle: number, radius: number, off = 0): Point {
  const step = direction(angle);
  return { x: from.x + radius * step.x + off * step.y, y: from.y + radius * step.y - off * step.x };
}

/**
 * The cutting mat, `size` css px, with lines `hair` px thin: a grid with a
 * mark where the spans cross, rulers along the top and left edges numbered
 * from the top left, and angle guides from a span crossing on the left edge
 * to the far edges. Its tile is set off by half a span, so each mark sits
 * whole in it.
 */
export function drawMat(
  size: { width: number; height: number },
  hair: number,
  avoid?: { from: number; to: number },
): SVGSVGElement {
  const svg = svgNode("svg", { class: "mat", "aria-hidden": "true" });
  const half = SPAN / 2;
  const minor: number[] = [];
  for (let at = CELL; at < SPAN; at += CELL) if (at !== half) minor.push(at);
  const arm = 6;
  const pattern = svgNode("pattern", {
    id: "mat-grid",
    x: -half,
    y: -half,
    width: SPAN,
    height: SPAN,
    patternUnits: "userSpaceOnUse",
  });
  pattern.append(
    svgNode("path", { class: "cell", d: lines(minor, SPAN, hair) }),
    svgNode("path", { class: "major", d: lines([0], SPAN, hair) }),
    svgNode("path", { class: "span", d: lines([half], SPAN, hair) }),
    svgNode("path", {
      class: "mark",
      d: `M${half - arm} ${half}h${2 * arm + hair}v${hair}h${-2 * arm - hair}Z` +
        `M${half} ${half - arm}h${hair}v${2 * arm + hair}h${-hair}Z`,
    }),
  );
  const defs = svgNode("defs", {});
  defs.append(pattern);
  const top = ticks(size.width)
    .map((tick) => `M${tick.at} 0h${hair}v${tick.size}h${-hair}Z`)
    .join("");
  const left = ticks(size.height)
    .map((tick) => `M0 ${tick.at}h${tick.size}v${hair}h${-tick.size}Z`)
    .join("");
  svg.append(
    defs,
    svgNode("rect", { width: "100%", height: "100%", fill: "url(#mat-grid)" }),
    svgNode("path", { class: "tick", d: top + left }),
  );
  const origin = vertex(size.height);
  if (origin) {
    const base = along(origin, 0, ARC);
    const rim = { x: origin.x, y: origin.y - ARC };
    const arc = svgNode("path", {
      class: "angle",
      d: `M${base.x} ${base.y}A${ARC} ${ARC} 0 0 0 ${rim.x} ${rim.y}`,
      "stroke-width": hair,
    });
    arc.style.opacity = String(GUIDE.line);
    svg.append(arc);
    for (const angle of ANGLES) {
      const start = along(origin, angle, ARC);
      const end = exit(origin, angle, size);
      const line = svgNode("path", {
        class: "angle",
        d: `M${start.x} ${start.y}L${end.x} ${end.y}`,
        "stroke-width": hair,
      });
      line.style.opacity = String(angle === 45 ? GUIDE.half : GUIDE.line);
      svg.append(line);
      const reach = Math.hypot(end.x - origin.x, end.y - origin.y);
      const at = along(origin, angle, LABEL.radius, LABEL.off);
      if (reach < LABEL.radius + LABEL.room || at.y < LABEL.top) continue;
      const text = svgNode("text", {
        x: at.x,
        y: at.y,
        transform: `rotate(${-angle} ${at.x} ${at.y})`,
      });
      text.textContent = `${angle}°`;
      svg.append(text);
    }
  }
  for (const at of numbers(size.width, avoid)) {
    const text = svgNode("text", { x: at + 3, y: TICK.span + 1 });
    text.textContent = String(at);
    svg.append(text);
  }
  for (const at of numbers(size.height)) {
    const text = svgNode("text", { x: TICK.span + 2, y: at, "dominant-baseline": "middle" });
    text.textContent = String(at);
    svg.append(text);
  }
  return svg;
}
