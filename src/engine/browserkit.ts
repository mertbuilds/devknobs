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
}

/** The system font, never a bundled one. */
export const FONT = '-apple-system, system-ui, "SF Pro Text", Roboto, sans-serif';

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

