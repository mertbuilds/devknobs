import type { Glyph, Mark } from "./browserui";

/** What the browser drawings share: the page they show, their actions, and their parts. */

const SVG = "http://www.w3.org/2000/svg";

/** What the bars take from the page in the frame. */
export interface Look {
  /** The page's background, which fills the screen around the frame. */
  background: string;
  /** Is that background dark, so the glass and the glyphs on it go dark too? */
  dark: boolean;
  /** Does the page get a dark `prefers-color-scheme`? Chrome's own colors follow it. */
  scheme: "light" | "dark";
  host: string;
  canBack: boolean;
  canForward: boolean;
}

/** What the working buttons do to the frame. */
export interface Actions {
  back(): void;
  forward(): void;
  reload(): void;
  /** Bring the minimized bars back, where they follow the scroll. */
  expand?: () => void;
}

/** The system font, never a bundled one. */
export const FONT = '-apple-system, system-ui, "SF Pro Text", Roboto, sans-serif';

/** The battery's charge in percent, on Safari's and Chrome's status bars. */
export const CHARGE = 69;

export function el(tag: string, className: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function svgNode<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attributes: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG, tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value));
  return node;
}

/** Place a node by its box, in css px of the screen. */
export function place(node: HTMLElement | SVGElement, x: number, y: number, w: number, h: number) {
  node.style.left = `${x}px`;
  node.style.top = `${y}px`;
  node.style.width = `${w}px`;
  node.style.height = `${h}px`;
}

/** The paths of one glyph, centered on 0, 0, in css px. */
export type Shapes = SVGElement[];

/**
 * A glyph centered on its mark, in a box `box` px across, drawn by `paths`.
 * A pressable one takes the pointer and does its action.
 */
export function glyphAt(
  mark: Mark,
  paths: Record<Glyph, () => Shapes>,
  box: number,
  className: string,
  press?: () => void,
): SVGSVGElement {
  const half = box / 2;
  const svg = svgNode("svg", {
    class: `glyph ${className}`,
    viewBox: `${-half} ${-half} ${box} ${box}`,
    "aria-hidden": "true",
  });
  place(svg, mark.x - half, mark.y - half, box, box);
  svg.append(...paths[mark.glyph]());
  if (press) {
    svg.classList.add("press");
    svg.addEventListener("click", press);
  }
  return svg;
}


/** Bars drawn once for a layout, then moved between expanded and minimized in place. */
export interface Painted {
  root: HTMLElement;
  /** Show the bars expanded or minimized, for the page as it looks now. */
  apply(minimized: boolean, look: Look): void;
}

/**
 * The morph between expanded and minimized bars, from the transitions.dev
 * motion tokens: --duration-very-slow to minimize and --duration-slow to
 * expand. Its curve is css's own ease: it answers the scroll at once and
 * settles slowly. --ease-smooth-out, and an iOS spring's cubic-bezier(0.32,
 * 0.72, 0, 1) too, cover three quarters of the way in the first quarter of
 * the time, which reads as a snap, and a standard ease in out lags.
 */
export const MORPH = {
  minimize: 500,
  expand: 400,
  ease: "cubic-bezier(0.25, 0.1, 0.25, 1)",
} as const;

let measure: CanvasRenderingContext2D | null = null;

/** How wide `text` sets in the system font at `size` px and `weight`. */
export function textWidth(text: string, size: number, weight: number, spacing = 0): number {
  try {
    measure ??= document.createElement("canvas").getContext("2d");
  } catch {
    measure = null;
  }
  if (!measure) return text.length * size * 0.55;
  measure.font = `${weight} ${size}px ${FONT}`;
  return measure.measureText(text).width + spacing * text.length;
}
