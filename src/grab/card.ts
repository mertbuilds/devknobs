/**
 * What inspect's card says of the element under the pointer, as rows of text:
 * its colors, its font, how well its text reads and its spacing, each only
 * where it applies. Nothing here touches the page.
 */

import type { Color } from "../engine/color";
import { pxOf, type Sides } from "./boxmodel";
import { shorthand, tidy } from "./boxtext";
import {
  composite,
  contrastRatio,
  effectiveBackground,
  passesAA,
  shortColor,
} from "./colorvalue";

/** The rows of the card, in the order they stand. `type` goes on from `font` and has no label. */
export const CARD_KEYS = [
  "color",
  "background",
  "font",
  "type",
  "contrast",
  "margin",
  "padding",
] as const;

export type CardKey = (typeof CARD_KEYS)[number];

/** What each row is labelled. */
export const CARD_LABELS: Record<CardKey, string> = {
  color: "color",
  background: "background",
  font: "font",
  type: "",
  contrast: "contrast",
  margin: "margin",
  padding: "padding",
};

export interface CardRow {
  key: CardKey;
  text: string;
  /** A color to show before the text. */
  swatch?: string;
  /** The value is not the element's own: the background of an ancestor. */
  quiet?: boolean;
  /** Whether the contrast meets level AA at the text's size. */
  pass?: boolean;
}

/** What was read of an element for its card. */
export interface CardFacts {
  /** The element has text of its own. */
  text: boolean;
  color: Color | null;
  /** The backgrounds behind it, its own first, as far as the walk went. */
  backgrounds: readonly (Color | null)[];
  /** The family its text is likely set in, or null where none of its list is there. */
  family: string | null;
  fontSize: string;
  lineHeight: string;
  fontWeight: string;
  letterSpacing: string;
  margin: Sides;
  padding: Sides;
}

function colorRow(key: CardKey, color: Color, quiet = false): CardRow {
  const text = shortColor(color);
  return quiet ? { key, text, swatch: text, quiet } : { key, text, swatch: text };
}

/**
 * The rows for an element. The color, the font and the contrast are for an
 * element with text of its own. The background is the element's where it has
 * one, and for text on none of its own the one that shows through from an
 * ancestor, said quietly. The margin and the padding show where any side has some.
 */
export function cardRows(facts: CardFacts): CardRow[] {
  const rows: CardRow[] = [];
  const own = facts.backgrounds[0] ?? null;
  const behind = effectiveBackground(facts.backgrounds);
  if (facts.text && facts.color) rows.push(colorRow("color", facts.color));
  if (own && own.alpha > 0) rows.push(colorRow("background", own));
  else if (facts.text) rows.push(colorRow("background", behind, true));
  if (facts.text) {
    const parts = [`${tidy(facts.fontSize)} / ${tidy(facts.lineHeight)}`, facts.fontWeight];
    if (facts.letterSpacing !== "normal") parts.push(tidy(facts.letterSpacing));
    // With no family to name, the size is what the font row says.
    if (facts.family) rows.push({ key: "font", text: facts.family });
    rows.push({ key: facts.family ? "type" : "font", text: parts.join(" · ") });
    if (facts.color) {
      const ratio = contrastRatio(composite(facts.color, behind), behind);
      const size = pxOf(facts.fontSize) ?? 16;
      const weight = Number.parseFloat(facts.fontWeight) || 400;
      rows.push({ key: "contrast", text: ratio.toFixed(2), pass: passesAA(ratio, size, weight) });
    }
  }
  const margin = shorthand(facts.margin);
  if (margin) rows.push({ key: "margin", text: margin });
  const padding = shorthand(facts.padding);
  if (padding) rows.push({ key: "padding", text: padding });
  return rows;
}
