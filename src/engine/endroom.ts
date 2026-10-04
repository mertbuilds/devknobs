import { ensureStyle } from "./style";

const NAME = "endroom";

/** The room at the end of the page, in px, which the page above sets. */
export const VARIABLE = "--devknobs-end-room";

/**
 * Edge to edge, the frame runs under Safari's bars, past the end of the
 * viewport the phone gives the page. There the page stops over the bars and
 * its background fills the rest, so the document gets that much room after
 * its end and its last content scrolls clear of them. A margin on the root
 * adds it and moves nothing: padding would shrink a border box root of a set
 * height and all in it, and a pseudo element or a spacer would be the page's
 * to style. The viewport paints the root's background there. A page that
 * scrolls a box of its own, or content that overflows a root of a set height,
 * gets none.
 */
export const CSS = `:root{${VARIABLE}:0px}html{margin-bottom:var(${VARIABLE})!important}`;

function sheetOf(doc: Document): HTMLStyleElement | null {
  return doc.querySelector<HTMLStyleElement>(`style[data-devknobs="${NAME}"]`);
}

/** The rule that holds the variable, once the sheet is parsed. */
function holder(style: HTMLStyleElement): CSSStyleDeclaration | null {
  const rule = style.sheet?.cssRules[0] as CSSStyleRule | undefined;
  return rule?.style ?? null;
}

/**
 * Give the page in `doc` this much room after its end, from the page above
 * its frame, and say how much it had. Only the variable moves while there is
 * room, in the sheet and never on the root, which a page's own framework
 * checks. No room takes the sheet away, so nothing of the page is overridden.
 */
export function give(doc: Document, room: number): number {
  const existing = sheetOf(doc);
  const held = existing ? holder(existing) : null;
  const had = Number.parseFloat(held?.getPropertyValue(VARIABLE) ?? "") || 0;
  if (room <= 0) {
    existing?.remove();
    return had;
  }
  if (had === room) return had;
  const style = existing ?? ensureStyle(NAME, doc);
  if (!existing) style.textContent = CSS;
  holder(style)?.setProperty(VARIABLE, `${room}px`);
  return had;
}
