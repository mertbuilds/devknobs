/**
 * What inspect says of a box, as text: a length, a size, the four sides in
 * one line. Nothing here touches the page.
 */

import { pxOf, SIDES, type Sides } from "./boxmodel";

/** What stands for a length of 0, or for none, as the browsers' own box has it. */
export const NONE = "-";

/** A number with two decimals at most, and no zeros after them. */
export function short(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

/** A length of the box in css px, with no unit: a dash for 0 and for a side that has none. */
export function boxValue(value: number | null): string {
  if (value === null) return NONE;
  const text = short(value);
  return text === "0" ? NONE : text;
}

/** A size as `width × height`, in css px with no unit. */
export function sizeText(width: number, height: number): string {
  return `${short(width)} × ${short(height)}`;
}

/** A computed length with its number cut to two decimals. Anything else stays as it is. */
export function tidy(value: string): string {
  const px = pxOf(value);
  return px === null ? value : `${short(px)}px`;
}

/** The four sides as the shorthand has them: top, right, bottom, left. Null where all are 0. */
export function shorthand(sides: Sides): string | null {
  const texts = SIDES.map((side) => short(sides[side]));
  if (texts.every((text) => text === "0")) return null;
  return texts.map((text) => (text === "0" ? "0" : `${text}px`)).join(" ");
}
