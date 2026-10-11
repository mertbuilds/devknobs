import type { Rect } from "./mock";

/**
 * Where a picture, video or drawing lies in its element's box, as css
 * `object-fit` and `object-position` have it, for drawing one by hand: a
 * canvas stretches what it draws to the box it is given, so the part of the
 * picture that shows and the part of the box it shows in are worked out here.
 */

/** A place along an axis: a share of the room left over, and px on top of it. */
export interface Offset {
  share: number;
  px: number;
}

/** The part of a picture that shows, in its own px, and where in the box it shows, in the box's. */
export interface Placed {
  from: Rect;
  to: Rect;
}

const MIDDLE: Offset = { share: 0.5, px: 0 };

/** `text` cut at the spaces outside its brackets. */
function words(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let word = "";
  for (const char of text.trim()) {
    if (char === "(") depth++;
    if (char === ")") depth--;
    if (/\s/.test(char) && depth === 0) {
      if (word) parts.push(word);
      word = "";
    } else word += char;
  }
  if (word) parts.push(word);
  return parts;
}

/** A length or a percentage as an offset, a `calc()` of the two too. Null where it is neither. */
function offsetOf(word: string): Offset | null {
  const terms = Array.from(word.matchAll(/([+-])?\s*(\d*\.?\d+(?:e[+-]?\d+)?)(%|px)?/gi));
  if (terms.length === 0 || !/^(calc\(.*\)|[+-]?[\d.]+(e[+-]?\d+)?(%|px)?)$/i.test(word)) return null;
  const offset = { share: 0, px: 0 };
  for (const [, sign, digits = "0", unit] of terms) {
    const value = Number(digits) * (sign === "-" ? -1 : 1);
    if (unit === "%") offset.share += value / 100;
    else offset.px += value;
  }
  return offset;
}

/** An offset counted from the far edge, the right or the bottom, as one from the near edge. */
function fromFar(offset: Offset): Offset {
  return { share: 1 - offset.share, px: 0 - offset.px };
}

/**
 * An `object-position` as an offset across and one down. It is read as it is
 * written or as it computes: one to four words, lengths, percentages, the
 * edges by name with or without an offset from them, and `calc()`. What
 * cannot be read is the middle, as the browser starts.
 */
export function objectPosition(position: string): [Offset, Offset] {
  let x: Offset | null = null;
  let y: Offset | null = null;
  /** The plain values, which go across first, then down. */
  const plain: Offset[] = [];
  const list = words(position.toLowerCase());
  // Two words are an edge or a value for each axis: only among more does a value after an edge count from it.
  const counted = list.length > 2;
  for (let at = 0; at < list.length; at++) {
    const word = list[at] ?? "";
    const next = offsetOf(list[at + 1] ?? "");
    if (word === "left" || word === "right" || word === "top" || word === "bottom") {
      const far = word === "right" || word === "bottom";
      const edge = (counted && next) || { share: 0, px: 0 };
      if (counted && next) at++;
      const offset = far ? fromFar(edge) : edge;
      if (word === "left" || word === "right") x = offset;
      else y = offset;
    } else if (word === "center") plain.push(MIDDLE);
    else {
      const offset = offsetOf(word);
      if (offset) plain.push(offset);
    }
  }
  // A plain value takes the axis no edge was named for, across before down.
  for (const offset of plain) {
    if (!x) x = offset;
    else if (!y) y = offset;
  }
  return [x ?? MIDDLE, y ?? MIDDLE];
}

/**
 * Where a picture `natural` px as made lies in `box` for an `object-fit` and
 * an `object-position`: the part of it that shows, and the part of the box it
 * shows in. `cover` and `none` cut the picture, `contain` and `scale-down`
 * leave room around it, and `fill` stretches it over the box. Null where
 * nothing of it shows.
 */
export function objectPlace(
  fit: string,
  position: string,
  natural: { width: number; height: number },
  box: Rect,
): Placed | null {
  if (!(natural.width > 0 && natural.height > 0 && box.width > 0 && box.height > 0)) return null;
  const across = box.width / natural.width;
  const down = box.height / natural.height;
  const whole = Math.min(across, down);
  let size = { width: box.width, height: box.height };
  const scaled = (scale: number) => ({ width: natural.width * scale, height: natural.height * scale });
  if (fit === "contain") size = scaled(whole);
  else if (fit === "cover") size = scaled(Math.max(across, down));
  else if (fit === "none") size = scaled(1);
  else if (fit === "scale-down") size = scaled(Math.min(1, whole));
  const [x, y] = objectPosition(position);
  const left = box.x + (box.width - size.width) * x.share + x.px;
  const top = box.y + (box.height - size.height) * y.share + y.px;
  // Only what is inside the box shows.
  const to = {
    x: Math.max(left, box.x),
    y: Math.max(top, box.y),
    width: Math.min(left + size.width, box.x + box.width) - Math.max(left, box.x),
    height: Math.min(top + size.height, box.y + box.height) - Math.max(top, box.y),
  };
  if (!(to.width > 0 && to.height > 0)) return null;
  const wide = natural.width / size.width;
  const tall = natural.height / size.height;
  return {
    from: { x: (to.x - left) * wide, y: (to.y - top) * tall, width: to.width * wide, height: to.height * tall },
    to,
  };
}
