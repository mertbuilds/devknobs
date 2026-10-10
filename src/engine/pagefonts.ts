import { quietFetch } from "../requests/quiet";

/**
 * The fonts of the page in the frame, for the picture of it the browser draws
 * while a foldable folds. A drawing of a copy of the page loads nothing, so a
 * font it shows has to be in the copy's `@font-face` rule itself, as data.
 * Fetching one takes longer than a fold may wait, so each is fetched ahead and
 * kept, and a copy takes those kept by then: a font not there yet is fetched
 * for the next copy, and its rule is left as it is. Only the faces the page
 * has loaded are fetched, and of each only the source the browser reads.
 */

/** The fonts of the page they were fetched for, each by its address: as data, or null while it is on its way or where it will not come. */
let kept: { doc: Document; fonts: Map<string, string | null>; stop: () => void } | null = null;

/** The formats of a font a browser reads. */
const READ = /^(woff2?|truetype|opentype|collection)(-variations)?$/;
/** The address in a `url()`, quoted either way or not at all. */
const URL_OF = /^url\(\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|([^)]*))\s*\)/i;
/** How many bytes are made text at once, as a call takes only so many arguments. */
const CHUNK = 0x8000;

/** `text` cut at each `mark` outside its quotes and brackets. */
function cut(text: string, mark: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote = "";
  let from = 0;
  for (let at = 0; at < text.length; at++) {
    const char = text[at];
    if (char === "\\") at++;
    else if (quote) quote = char === quote ? "" : quote;
    else if (char === '"' || char === "'") quote = char;
    else if (char === "(") depth++;
    else if (char === ")") depth--;
    else if (char === mark && depth === 0) {
      parts.push(text.slice(from, at));
      from = at + 1;
    }
  }
  parts.push(text.slice(from));
  return parts;
}

/**
 * What tells a font face from the others of its family, read the same from
 * its rule and from the face the page has loaded: its family without quotes,
 * its weight and its style in numbers and lower case, and its range of
 * characters without leading zeros. Each left out is as the browser has it.
 */
export function faceKey(family: string, weight: string, style: string, range: string): string {
  const name = family
    .trim()
    .replace(/^(["'])(.*)\1$/, "$2")
    .toLowerCase();
  const plain = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ") || "normal";
  const heavy = plain(weight)
    .replace(/\bnormal\b/g, "400")
    .replace(/\bbold\b/g, "700");
  const chars = (range.trim() || "U+0-10FFFF")
    .toLowerCase()
    .split(",")
    .map((part) =>
      part
        .trim()
        .replace(/^u\+/, "")
        .split("-")
        .map((end) => end.replace(/^0+(?=.)/, ""))
        .join("-"),
    )
    .join(",");
  return [name, heavy, plain(style), chars].join("|");
}

/** `bytes` as base64. */
function base64(bytes: Uint8Array): string {
  let text = "";
  for (let at = 0; at < bytes.length; at += CHUNK) text += String.fromCharCode(...bytes.subarray(at, at + CHUNK));
  return btoa(text);
}

/** Fetch the font at `url` into `fonts`, once: one that will not come stays null, and is not asked for again. */
function fetchFont(url: string, fonts: Map<string, string | null>): void {
  fonts.set(url, null);
  void quietFetch(url)
    .then(async (response) => {
      if (!response.ok) return;
      const type = /^[\w.+-]+\/[\w.+-]+/.exec(response.headers.get("content-type") ?? "")?.[0];
      const bytes = new Uint8Array(await response.arrayBuffer());
      fonts.set(url, `data:${type ?? "application/octet-stream"};base64,${base64(bytes)}`);
    })
    .catch(() => {
      // A font from another origin that does not share itself is left out.
    });
}

/**
 * The `@font-face` rule `css` with its font as data, where the page has
 * loaded a face in `used` from it and `fonts` has the font: its `src` is then
 * the one source the browser reads, the first in a format it knows, after any
 * `local()` before it. Its address is taken from `base`. A font not in `fonts`
 * yet is fetched, and the rule is as it was, as is one whose font is data
 * already.
 */
function faceWith(css: string, base: string, used: Set<string>, fonts: Map<string, string | null>): string {
  const open = css.indexOf("{");
  const close = css.lastIndexOf("}");
  if (open < 0 || close < open) return css;
  const parts = cut(css.slice(open + 1, close), ";");
  const named = (name: string) => {
    const part = parts.find((part) => part.split(":")[0]?.trim().toLowerCase() === name);
    return part ? part.slice(part.indexOf(":") + 1).trim() : "";
  };
  if (!used.has(faceKey(named("font-family"), named("font-weight"), named("font-style"), named("unicode-range")))) {
    return css;
  }
  const sources = cut(named("src"), ",").map((source) => source.trim());
  const at = sources.findIndex((source) => {
    const format = /format\(\s*["']?([\w-]+)["']?\s*\)/i.exec(source)?.[1];
    return URL_OF.test(source) && (!format || READ.test(format.toLowerCase()));
  });
  const source = sources[at];
  const found = source ? URL_OF.exec(source) : null;
  if (!source || !found) return css;
  const address = (found[1] ?? found[2] ?? found[3] ?? "").trim().replace(/\\(.)/g, "$1");
  if (/^data:/i.test(address)) return css;
  let url: string;
  try {
    url = new URL(address, base).href;
  } catch {
    return css;
  }
  const data = fonts.get(url);
  if (data === undefined) fetchFont(url, fonts);
  if (!data) return css;
  const locals = sources.slice(0, at).filter((source) => /^local\(/i.test(source));
  const src = [...locals, `url("${data}")${source.slice(found[0].length)}`].join(", ");
  const next = parts.map((part) => (part.split(":")[0]?.trim().toLowerCase() === "src" ? ` src: ${src}` : part));
  return `${css.slice(0, open + 1)}${next.join(";")}${css.slice(close)}`;
}

/** Does a rule hold rules of its own, as `@media`, `@supports` and `@layer` do? */
function holdsRules(rule: CSSRule): rule is CSSGroupingRule {
  return "cssRules" in rule;
}

/** The fonts kept for `doc`, those of any other page let go of. They are fetched again as the page loads more. */
function keptFor(doc: Document): Map<string, string | null> {
  if (kept?.doc === doc) return kept.fonts;
  forgetFonts();
  const set: FontFaceSet | undefined = doc.fonts;
  const again = () => fetchFonts(doc);
  set?.addEventListener("loadingdone", again);
  kept = { doc, fonts: new Map(), stop: () => set?.removeEventListener("loadingdone", again) };
  return kept.fonts;
}

/**
 * What writes a rule of `doc` out for a copy of the page: as it is, but a
 * `@font-face` the page has loaded a face from with its font as data, where
 * that is kept, on its own or in a rule that holds it.
 */
export function embedFonts(doc: Document): (rule: CSSRule) => string {
  const fonts = keptFor(doc);
  const used = new Set<string>();
  const set: FontFaceSet | undefined = doc.fonts;
  if (set) {
    for (const face of set) {
      if (face.status === "loaded") used.add(faceKey(face.family, face.weight, face.style, face.unicodeRange));
    }
  }
  const embed = (rule: CSSRule): string => {
    let css = rule.cssText;
    if (used.size === 0 || !css.includes("@font-face")) return css;
    if (!holdsRules(rule)) {
      const base = rule.parentStyleSheet?.href ?? doc.baseURI;
      return css.startsWith("@font-face") ? faceWith(css, base, used, fonts) : css;
    }
    for (const inner of rule.cssRules) {
      const next = embed(inner);
      if (next !== inner.cssText) css = css.split(inner.cssText).join(next);
    }
    return css;
  };
  return embed;
}

/** Fetch the fonts `doc` has loaded faces from, those not fetched yet. */
function fetchFonts(doc: Document): void {
  const embed = embedFonts(doc);
  for (const sheet of doc.styleSheets) {
    try {
      for (const rule of sheet.cssRules) embed(rule);
    } catch {
      // A sheet from another origin keeps its rules to itself.
    }
  }
}

/**
 * Fetch the fonts of `doc` ahead of a fold, and those it loads later as they
 * come. Asked again for the same page, it does nothing, so it costs nothing
 * each time the frame is drawn.
 */
export function warmFonts(doc: Document): void {
  if (kept?.doc !== doc) fetchFonts(doc);
}

/** Let go of the fonts kept, as the frame goes. */
export function forgetFonts(): void {
  kept?.stop();
  kept = null;
}
