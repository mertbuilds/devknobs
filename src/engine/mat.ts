const SVG = "http://www.w3.org/2000/svg";

/** The grid of the mat, in css px: a fine line, a stronger one, and the strongest with a mark where two cross. */
export const CELL = 10;
export const MAJOR = 50;
export const SPAN = 100;

/** How far each tick of a ruler reaches into the mat, in css px. */
const TICK = { cell: 3, major: 5, span: 9 };

/** The angle guides from the bottom left corner, in degrees, and how long they run, in css px. */
const ANGLES = [30, 45, 60];
const GUIDE = 220;

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
 * from the top left, and angle guides in the bottom left corner. Its tile is set off by half a span, so each
 * mark sits whole in it.
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
  for (const angle of ANGLES) {
    const turn = (angle * Math.PI) / 180;
    const end = { x: GUIDE * Math.cos(turn), y: size.height - GUIDE * Math.sin(turn) };
    const text = node("text", { x: end.x + 4, y: end.y, "dominant-baseline": "middle" });
    text.textContent = `${angle}°`;
    svg.append(
      node("path", { class: "angle", d: `M0 ${size.height}L${end.x} ${end.y}`, "stroke-width": hair }),
      text,
    );
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
