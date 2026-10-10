/**
 * What inspect reads of the page for an element: its box on every look, and
 * once it has been rested on, what its card says of its text.
 */

import type { Color } from "../engine/color";
import {
  alignQuads,
  type BoxModel,
  type BoxRing,
  boxModel,
  hasBox,
  isPlain,
  oneQuad,
  type Quad,
  RINGS,
} from "./boxmodel";
import type { CardFacts } from "./card";
import { walkBackgrounds } from "./colorvalue";
import { fontCheck, usedFamily } from "./fontused";

/** The most child nodes looked at for text of the element's own. */
const TEXT_CAP = 40;

/** Controls that show text with no text node in them. */
const TEXT_CONTROLS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

function parentOf(element: Element): Element | null {
  if (element.parentElement) return element.parentElement;
  const root = element.getRootNode();
  return root instanceof ShadowRoot ? root.host : null;
}

/** Whether an element has text of its own: a text node under it that is not only space. */
export function hasOwnText(element: Element): boolean {
  if (TEXT_CONTROLS.has(element.tagName)) return true;
  const nodes = element.childNodes;
  for (let at = 0; at < nodes.length && at < TEXT_CAP; at += 1) {
    const node = nodes[at];
    if (node?.nodeType === 3 && (node.textContent ?? "").trim() !== "") return true;
  }
  return false;
}

/**
 * What the card says of an element's text, read through the computed style
 * the box was read from. Only the walk up for a background reads any other.
 */
export function readFacts(
  element: Element,
  style: CSSStyleDeclaration,
  colorOf: (value: string) => Color | null,
): Omit<CardFacts, "margin" | "padding"> {
  const text = hasOwnText(element);
  return {
    text,
    color: colorOf(style.color),
    backgrounds: walkBackgrounds(
      element,
      (node) => colorOf((node === element ? style : getComputedStyle(node)).backgroundColor),
      parentOf,
    ),
    family: text ? usedFamily(style.fontFamily, fontCheck(element.ownerDocument.fonts)) : null,
    fontSize: style.fontSize,
    lineHeight: style.lineHeight,
    fontWeight: style.fontWeight,
    letterSpacing: style.letterSpacing,
  };
}

/** The box of an element as read: what its style says, and its corners where it is turned. */
export interface BoxRead {
  model: BoxModel;
  /** The outer edge of each area by its corners, for an element a transform turns or scales. */
  quads: Record<BoxRing, Quad> | null;
}

/**
 * The corners of each area by `getBoxQuads`, where the browser has it and a
 * transform changes the element's shape. Null otherwise, and the areas are
 * then worked out from the bounding box, as if nothing turned the element.
 */
function quadsOf(element: Element, bounds: DOMRect): Record<BoxRing, Quad> | null {
  const read: unknown = Reflect.get(element, "getBoxQuads");
  if (typeof read !== "function") return null;
  const found = new Map<BoxRing, Quad>();
  for (const ring of RINGS) {
    let answer: unknown = null;
    try {
      answer = Reflect.apply(read, element, [{ box: ring }]);
    } catch {
      return null;
    }
    const quad = oneQuad(answer);
    if (!quad) return null;
    found.set(ring, quad);
  }
  const [margin, border, padding, content] = RINGS.map((ring) => found.get(ring));
  if (!margin || !border || !padding || !content) return null;
  const laid =
    element instanceof HTMLElement
      ? { width: element.offsetWidth, height: element.offsetHeight }
      : null;
  if (isPlain(border, laid)) return null;
  return alignQuads({ margin, border, padding, content }, { x: bounds.left, y: bounds.top });
}

/** Read an element's box. Null for one with no box to draw. */
export function readBox(element: Element, style: CSSStyleDeclaration): BoxRead | null {
  const bounds = element.getBoundingClientRect();
  if (!hasBox(style.display, bounds)) return null;
  return { model: boxModel(style), quads: quadsOf(element, bounds) };
}
