const SVG = "http://www.w3.org/2000/svg";

/** The light blue the mat's lines and numbers are drawn in. */
const LINE = "rgb(170, 205, 255)";

/** The mat in the letterbox's shadow root, under the strip and the stage, and never in the way of a pointer. */
export const MAT_CSS = `
.mat {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  fill: ${LINE};
}
.mat .cell { opacity: 0.07; }
.mat .major { opacity: 0.14; }
.mat .span { opacity: 0.26; }
.mat .angle { fill: none; stroke: ${LINE}; }
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

function node<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attributes: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG, tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, String(value));
  return element;
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
  const svg = node("svg", { class: "mat", "aria-hidden": "true" });
  const half = SPAN / 2;
  const minor: number[] = [];
  for (let at = CELL; at < SPAN; at += CELL) if (at !== half) minor.push(at);
  const arm = 6;
  const pattern = node("pattern", {
    id: "mat-grid",
    x: -half,
    y: -half,
    width: SPAN,
    height: SPAN,
    patternUnits: "userSpaceOnUse",
  });
  pattern.append(
    node("path", { class: "cell", d: lines(minor, SPAN, hair) }),
    node("path", { class: "major", d: lines([0], SPAN, hair) }),
    node("path", { class: "span", d: lines([half], SPAN, hair) }),
    node("path", {
      class: "mark",
      d: `M${half - arm} ${half}h${2 * arm + hair}v${hair}h${-2 * arm - hair}Z` +
        `M${half} ${half - arm}h${hair}v${2 * arm + hair}h${-hair}Z`,
    }),
  );
  const defs = node("defs", {});
  defs.append(pattern);
  const top = ticks(size.width)
    .map((tick) => `M${tick.at} 0h${hair}v${tick.size}h${-hair}Z`)
    .join("");
  const left = ticks(size.height)
    .map((tick) => `M0 ${tick.at}h${tick.size}v${hair}h${-tick.size}Z`)
    .join("");
  svg.append(
    defs,
    node("rect", { width: "100%", height: "100%", fill: "url(#mat-grid)" }),
    node("path", { class: "tick", d: top + left }),
  );
  const origin = vertex(size.height);
  if (origin) {
    const base = along(origin, 0, ARC);
    const rim = { x: origin.x, y: origin.y - ARC };
    const arc = node("path", {
      class: "angle",
      d: `M${base.x} ${base.y}A${ARC} ${ARC} 0 0 0 ${rim.x} ${rim.y}`,
      "stroke-width": hair,
    });
    arc.style.opacity = String(GUIDE.line);
    svg.append(arc);
    for (const angle of ANGLES) {
      const start = along(origin, angle, ARC);
      const end = exit(origin, angle, size);
      const line = node("path", {
        class: "angle",
        d: `M${start.x} ${start.y}L${end.x} ${end.y}`,
        "stroke-width": hair,
      });
      line.style.opacity = String(angle === 45 ? GUIDE.half : GUIDE.line);
      svg.append(line);
      const reach = Math.hypot(end.x - origin.x, end.y - origin.y);
      const at = along(origin, angle, LABEL.radius, LABEL.off);
      if (reach < LABEL.radius + LABEL.room || at.y < LABEL.top) continue;
      const text = node("text", { x: at.x, y: at.y, transform: `rotate(${-angle} ${at.x} ${at.y})` });
      text.textContent = `${angle}°`;
      svg.append(text);
    }
  }
  for (const at of numbers(size.width, avoid)) {
    const text = node("text", { x: at + 3, y: TICK.span + 1 });
    text.textContent = String(at);
    svg.append(text);
  }
  for (const at of numbers(size.height)) {
    const text = node("text", { x: TICK.span + 2, y: at, "dominant-baseline": "middle" });
    text.textContent = String(at);
    svg.append(text);
  }
  return svg;
}
