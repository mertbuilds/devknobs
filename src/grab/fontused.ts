/**
 * The font an element's text is likely set in. The computed `font-family` is
 * the whole list the page asked for, and the browser does not tell a page's
 * script which of them a glyph was drawn with. So this takes the first family
 * of the list that the browser says is there. Nothing here touches the page.
 */

/** Families that are a kind of font and always come to one. */
const GENERIC = new Set([
  "serif",
  "sans-serif",
  "monospace",
  "cursive",
  "fantasy",
  "system-ui",
  "ui-serif",
  "ui-sans-serif",
  "ui-monospace",
  "ui-rounded",
  "math",
  "emoji",
  "fangsong",
  "-apple-system",
  "blinkmacsystemfont",
]);

/** The families of a `font-family`, in order, with no quotes around them. */
export function families(stack: string): string[] {
  const found: string[] = [];
  let name = "";
  let quote = "";
  for (const char of stack) {
    if (quote) {
      if (char === quote) quote = "";
      else name += char;
    } else if (char === '"' || char === "'") quote = char;
    else if (char === ",") {
      found.push(name.trim());
      name = "";
    } else name += char;
  }
  found.push(name.trim());
  return found.filter((family) => family !== "");
}

export function isGeneric(family: string): boolean {
  return GENERIC.has(family.toLowerCase());
}

/**
 * The first family of a list that is there: a generic one, or one `available`
 * says the browser has. Null where none is, and the browser's own fallback
 * shows, which has no name to read.
 */
export function usedFamily(stack: string, available: (family: string) => boolean): string | null {
  return families(stack).find((family) => isGeneric(family) || available(family)) ?? null;
}

/**
 * Whether a document has a family, by its `fonts.check`. For a web font that
 * is whether it has loaded. For any other name most browsers answer true
 * whether the system has the font or not, so a system family is taken on trust.
 */
export function fontCheck(
  fonts: { check(font: string): boolean } | null | undefined,
): (family: string) => boolean {
  return (family) => {
    if (!fonts) return false;
    try {
      return fonts.check(`16px "${family.replace(/["\\]/g, "\\$&")}"`);
    } catch {
      return false;
    }
  };
}
