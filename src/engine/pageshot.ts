import { blurWidths } from "./fold";
import { objectPlace } from "./objectfit";
import { embedFonts, forgetFonts } from "./pagefonts";

/**
 * A rough picture of the page in the frame, for the copies of a foldable's
 * screens that turn while it folds, where the frame cannot be. It is mostly
 * blurred where it shows, so it only needs the page's shapes and colors: each
 * box's background, its pictures, and its lines of text as bands in their
 * color, painted small. What is pinned to the screen goes over the rest. A
 * page that has not changed since its last picture gives that one again.
 */

/** How many of the picture's px a css px of the screen takes. The blur hides anything finer. */
const RES = 0.25;
/** At most this many elements are looked at, so a long page costs no more than a short one. */
const MOST = 1500;
/** At most this long is spent painting a picture, in ms, so a heavy page holds no fold up. */
const BUDGET = 6;
/** How much of a line of text its ink covers. */
const INK = 0.4;

/** A canvas `width` by `height` px, and its pen, or null where it cannot be drawn on. */
function canvasOf(width: number, height: number): { canvas: HTMLCanvasElement; pen: CanvasRenderingContext2D } | null {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const pen = canvas.getContext("2d");
  return pen ? { canvas, pen } : null;
}

function clear(color: string): boolean {
  return color === "" || color === "transparent" || /^rgba\(.*,\s*0\)$/.test(color);
}

/** The elements of a page that show a picture of their own, which a drawing of the page cannot load and a rough one draws by hand. */
const MEDIA = "img, video, canvas";
type MediaNode = HTMLImageElement | HTMLVideoElement | HTMLCanvasElement;

/** A picture, video or drawing of the page that can be drawn now, and its size as made, in its own px. */
interface Media {
  source: CanvasImageSource;
  width: number;
  height: number;
}

/** What `node` shows, where it has it by now: a picture that has loaded, a video with a frame, a drawing with a size. */
function mediaOf(node: MediaNode): Media | null {
  // Told apart by what they have, as the frame's elements are not of this window's classes.
  if ("naturalWidth" in node) {
    const loaded = node.complete && node.naturalWidth > 0 && node.naturalHeight > 0;
    return loaded ? { source: node, width: node.naturalWidth, height: node.naturalHeight } : null;
  }
  if ("videoWidth" in node) {
    const playing = node.readyState >= 2 && node.videoWidth > 0 && node.videoHeight > 0;
    return playing ? { source: node, width: node.videoWidth, height: node.videoHeight } : null;
  }
  return node.width > 0 && node.height > 0 ? { source: node, width: node.width, height: node.height } : null;
}

/** A corner's radius across and down, in px of a box `wide` by `tall`, as it computes: one or two lengths or percentages. */
function radiusOf(value: string, wide: number, tall: number): { x: number; y: number } {
  const [across = "0", down = across] = value.trim().split(/\s+/);
  const px = (text: string, of: number) => (text.endsWith("%") ? (Number.parseFloat(text) / 100) * of : Number.parseFloat(text)) || 0;
  return { x: px(across, wide), y: px(down, tall) };
}

/**
 * Draw one of the page's pictures where its element shows it, `rect`, as its
 * `style` fits it in: inside the border and padding, cut and placed as
 * `object-fit` and `object-position` have it, within the element's round
 * corners. A canvas stretches a picture over the box it is given, so one
 * drawn into the element's box whole is squeezed wherever the page cuts it
 * to cover the box, or leaves room around it.
 */
export function drawMedia(pen: CanvasRenderingContext2D, media: Media, rect: DOMRect, style: CSSStyleDeclaration): void {
  const px = (value: string) => Number.parseFloat(value) || 0;
  const left = px(style.borderLeftWidth) + px(style.paddingLeft);
  const right = px(style.borderRightWidth) + px(style.paddingRight);
  const top = px(style.borderTopWidth) + px(style.paddingTop);
  const bottom = px(style.borderBottomWidth) + px(style.paddingBottom);
  const box = { x: rect.left + left, y: rect.top + top, width: rect.width - left - right, height: rect.height - top - bottom };
  const placed = objectPlace(style.objectFit, style.objectPosition, media, box);
  if (!placed) return;
  // The corners of what it holds are the element's, less the border and padding between.
  const corner = (value: string, across: number, down: number) => {
    const radius = radiusOf(value, rect.width, rect.height);
    return { x: Math.max(0, radius.x - across), y: Math.max(0, radius.y - down) };
  };
  const corners = [
    corner(style.borderTopLeftRadius, left, top),
    corner(style.borderTopRightRadius, right, top),
    corner(style.borderBottomRightRadius, right, bottom),
    corner(style.borderBottomLeftRadius, left, bottom),
  ];
  const { from, to } = placed;
  pen.save();
  if (corners.some((radius) => radius.x > 0 && radius.y > 0)) {
    pen.beginPath();
    pen.roundRect(box.x, box.y, box.width, box.height, corners);
    pen.clip();
  }
  if (style.imageRendering === "pixelated" || style.imageRendering === "crisp-edges") pen.imageSmoothingEnabled = false;
  pen.drawImage(media.source, from.x, from.y, from.width, from.height, to.x, to.y, to.width, to.height);
  pen.restore();
}

/**
 * What the page's pictures show now, which no change to the page tells of: a
 * picture another source was picked for, or one that has loaded since, each
 * by its address and its size as made. Null where the page has a video or a
 * drawing, which may show something else any frame.
 */
export function picturesKey(doc: Document): string | null {
  const parts: string[] = [];
  for (const node of doc.querySelectorAll<MediaNode>(MEDIA)) {
    if (!("naturalWidth" in node)) return null;
    // Its length and its end tell an address apart, and keep one that is a whole picture as data short.
    const address = node.currentSrc;
    parts.push(`${address.length}:${address.slice(-64)}@${node.naturalWidth}x${node.naturalHeight}`);
  }
  return parts.join(" ");
}

/** All a rough picture of a page depends on that the page changing does not tell of. */
export interface ShotAt {
  /** The screen it is of, in css px, the color under it, and the knobs that lay the page out on it. */
  size: { width: number; height: number };
  color: string;
  layout: string;
  /** Where the frame sits in the screen and how wide it is there, in the screen's css px, however large the device is drawn. */
  frame: { x: number; y: number; width: number };
  /** The page's viewport and how far it is scrolled, in its css px. */
  view: { width: number; height: number };
  scroll: { x: number; y: number };
  /** How many device px a css px of the page takes, the root's text size, and what the page's pictures show. */
  dpr: number;
  text: string;
  pictures: string;
}

/**
 * What a rough picture is kept by: one taken at any other is not this one. A
 * foldable's two screens differ in size and in the knobs, so a picture of the
 * folded one never stands in for the open one's, or the other way round.
 */
export function shotKey(at: ShotAt): string {
  const { size, frame, view, scroll } = at;
  return JSON.stringify([
    [size.width, size.height, at.color, at.layout],
    [frame.x, frame.y, frame.width],
    [view.width, view.height, scroll.x, scroll.y],
    [at.dpr, at.text, at.pictures],
  ]);
}

/**
 * A picture of the page in `frame` as the screen `glass` shows it, `size` css
 * px, on `color`, laid out for the knobs `layout` names, or null where its
 * page is out of reach.
 */
export function shootPage(
  frame: HTMLIFrameElement,
  glass: HTMLElement,
  size: { width: number; height: number },
  color: string,
  layout = "",
): HTMLCanvasElement | null {
  const doc = frame.contentDocument;
  const view = frame.contentWindow;
  const screen = glass.getBoundingClientRect();
  const box = frame.getBoundingClientRect();
  if (!doc?.body || !view || screen.width <= 0 || view.innerWidth <= 0) return null;
  const shown = picturesKey(doc);
  // The page's css px on the screen's, from where the frame sits on it.
  const css = size.width / screen.width;
  const near = (value: number) => Math.round(value * css * 1e3) / 1e3;
  const key = shotKey({
    size,
    color,
    layout,
    frame: { x: near(box.left - screen.left), y: near(box.top - screen.top), width: near(box.width) },
    view: { width: view.innerWidth, height: view.innerHeight },
    scroll: { x: view.scrollX, y: view.scrollY },
    dpr: view.devicePixelRatio,
    text: view.getComputedStyle(doc.documentElement).fontSize,
    pictures: shown ?? "",
  });
  const kept = shown === null || !unchanged(doc) ? null : shots.get(doc)?.get(key);
  if (kept) return kept;
  const drawn = canvasOf(size.width * RES, size.height * RES);
  if (!drawn) return null;
  const { canvas, pen } = drawn;
  pen.fillStyle = color;
  pen.fillRect(0, 0, canvas.width, canvas.height);
  const scale = (box.width * css) / view.innerWidth;
  pen.setTransform(
    RES * scale,
    0,
    0,
    RES * scale,
    RES * (box.left - screen.left) * css,
    RES * (box.top - screen.top) * css,
  );
  pen.beginPath();
  pen.rect(0, 0, view.innerWidth, view.innerHeight);
  pen.clip();
  const pictures = new Map<Element, Media>();
  for (const node of doc.querySelectorAll<MediaNode>(MEDIA)) {
    const media = mediaOf(node);
    if (media) pictures.set(node, media);
  }
  const range = doc.createRange();
  const tall = view.innerHeight;
  let seen = 0;
  /** Elements pinned to the screen, drawn once the rest is. */
  const pinned: [Element, number][] = [];

  const deadline = performance.now() + BUDGET;
  const draw = (node: Element, alpha: number, lifted: boolean): void => {
    if (seen++ > MOST || (seen % 50 === 0 && performance.now() > deadline)) return;
    // Only the page: nothing devknobs put on it.
    if (node.hasAttribute("data-devknobs")) return;
    const style = view.getComputedStyle(node);
    if (style.display === "none") return;
    if (!lifted && (style.position === "fixed" || style.position === "sticky")) {
      pinned.push([node, alpha]);
      return;
    }
    const rect = node.getBoundingClientRect();
    const area = rect.width > 0 && rect.height > 0;
    // A box off the screen keeps what it holds off it too.
    if (area && (rect.bottom < 0 || rect.top > tall)) return;
    const shown = alpha * (Number.parseFloat(style.opacity) || 0);
    if (shown <= 0) return;
    if (area && style.visibility !== "hidden") {
      pen.globalAlpha = shown;
      if (!clear(style.backgroundColor)) {
        pen.fillStyle = style.backgroundColor;
        pen.beginPath();
        pen.roundRect(rect.left, rect.top, rect.width, rect.height, Number.parseFloat(style.borderTopLeftRadius) || 0);
        pen.fill();
      }
      const picture = pictures.get(node);
      if (picture) drawMedia(pen, picture, rect, style);
      pen.fillStyle = style.color;
      pen.globalAlpha = shown * INK;
      for (const text of node.childNodes) {
        if (text.nodeType !== Node.TEXT_NODE || !text.textContent?.trim()) continue;
        range.selectNodeContents(text);
        for (const line of range.getClientRects()) pen.fillRect(line.left, line.top, line.width, line.height);
      }
    }
    for (const child of node.children) draw(child, shown, lifted);
  };

  for (const child of doc.body.children) draw(child, 1, false);
  for (const [node, alpha] of pinned) draw(node, alpha, true);
  // A video or a drawing may show something else by the next picture, so one with either is not kept.
  if (shown !== null) keepShot(doc, key, canvas);
  return canvas;
}

/** The pictures of each page by what they were taken at, and the page watched for changes since. */
let shots = new WeakMap<Document, Map<string, HTMLCanvasElement>>();
let watched: { doc: Document; changed: boolean; observer: MutationObserver } | null = null;

/** Let go of the pictures kept, of the page watched and of its fonts, as the frame goes. */
export function forgetShots(): void {
  watched?.observer.disconnect();
  watched = null;
  shots = new WeakMap();
  forgetFonts();
}

/** Is `doc` the page watched, with no change since its pictures were kept? One it has not been told of yet counts. */
function unchanged(doc: Document): boolean {
  if (watched?.doc !== doc) return false;
  if (watched.observer.takeRecords().length > 0) watched.changed = true;
  return !watched.changed;
}

/** Keep a picture of `doc` for as long as the page does not change. */
function keepShot(doc: Document, key: string, canvas: HTMLCanvasElement): void {
  if (!unchanged(doc)) {
    watched?.observer.disconnect();
    shots = new WeakMap();
    const Observer = doc.defaultView?.MutationObserver;
    if (!Observer) return;
    const observer = new Observer(() => {
      if (watched?.observer === observer) watched.changed = true;
      observer.disconnect();
    });
    observer.observe(doc, { subtree: true, childList: true, attributes: true, characterData: true });
    watched = { doc, changed: false, observer };
  }
  const kept = shots.get(doc) ?? new Map<string, HTMLCanvasElement>();
  kept.set(key, canvas);
  shots.set(doc, kept);
}

/** How many px a blurred picture keeps across its blur's width. The browser stretches it the rest of the way as it shows it, as smooth. */
const KEPT = 8;

/** A blurred picture of a screen, and how long it is along the hinge with its black, in the sharp one's px. */
export interface Blurred {
  canvas: HTMLCanvasElement;
  long: number;
}

/**
 * A picture of a screen `width` css px wide blurred as wide as each of
 * `widths`, the fold's blurs past the sharp one: made smaller a half at a
 * time till a px of it is as wide as the blur, then doubled back up, so each
 * step smooths what the last left, but only till `KEPT` px cross the blur.
 * The wide blurs are so kept small, and the lot takes fewer px than the
 * pictures it is made of. Drawn once, each is as cheap to show as the
 * picture. Each lies on black past the picture's ends along the hinge, its
 * top and bottom `across` and its sides otherwise, as far as `blurMargin`
 * has it, so the blur spreads those ends into the dark past them, as
 * jadon7/iphone-duo blurs the picture and black together.
 */
export function blurPictures(
  shot: HTMLCanvasElement,
  width: number,
  across: boolean,
  widths = blurWidths().slice(1),
): Blurred[] {
  const length = across ? shot.height : shot.width;
  return widths.map((wide) => {
    // How many of the picture's px the blur is wide: a rough picture's px is a few css px already.
    const coarse = Math.max(1, (wide * shot.width) / width);
    const margin = blurMargin(coarse);
    const padded = canvasOf(shot.width + (across ? 0 : 2 * margin), shot.height + (across ? 2 * margin : 0));
    if (!padded) return { canvas: blurPicture(shot, coarse), long: length };
    padded.pen.fillStyle = "#000";
    padded.pen.fillRect(0, 0, padded.canvas.width, padded.canvas.height);
    padded.pen.drawImage(shot, across ? 0 : margin, across ? margin : 0);
    const canvas = blurPicture(padded.canvas, coarse);
    if (canvas !== padded.canvas) spend(padded.canvas);
    return { canvas, long: length + 2 * margin };
  });
}

/**
 * How far the black under a picture blurred `coarse` of its px wide reaches
 * past its ends, in its px: two of the smallest picture's px, past where the
 * blur spreads it, so none of it is cut off.
 */
export function blurMargin(coarse: number): number {
  return Math.ceil(2 * coarse);
}

/**
 * Where a blurred picture `padded` px long lies along its screen, whose
 * picture is `shot` px long, in percent of the screen: its black reaching as
 * far past either end, so its picture lies on the sharp one.
 */
export function marginPlace(shot: number, padded: number): { start: number; size: number } {
  const exact = (value: number) => Math.round(value * 1e4) / 1e4;
  return { start: exact(((shot - padded) / 2 / shot) * 100), size: exact((padded / shot) * 100) };
}

/** Let go of a canvas's px at once, where it was only a step on the way. */
function spend(canvas: HTMLCanvasElement): void {
  canvas.width = 0;
  canvas.height = 0;
}

/**
 * `shot` made smaller till a px of it is `coarse` of its own, a half at a
 * time, the first step what is left over of a half, then doubled back up
 * till `KEPT` px cross the blur, or to its size where that is fewer.
 */
function blurPicture(shot: HTMLCanvasElement, coarse: number): HTMLCanvasElement {
  const halvings = Math.ceil(Math.log2(coarse) - 1e-9);
  const { width, height } = shot;
  const sized = (level: number) => {
    const scale = Math.min(1, 2 ** level / coarse);
    return canvasOf(width * scale, height * scale);
  };
  let at = shot;
  const step = (level: number, smooth: boolean): boolean => {
    const next = sized(level);
    if (!next) return false;
    if (smooth) next.pen.imageSmoothingQuality = "high";
    next.pen.drawImage(at, 0, 0, next.canvas.width, next.canvas.height);
    if (at !== shot) spend(at);
    at = next.canvas;
    return true;
  };
  for (let level = halvings - 1; level >= 0; level--) if (!step(level, false)) return at;
  for (let level = 1; level <= Math.min(Math.log2(KEPT), halvings); level++) if (!step(level, true)) return at;
  return at;
}

/** A picture of nothing, `width` by `height` px as made, as data: it holds a picture's place and draws none. */
export function blankUrl(width: number, height: number): string {
  return svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"/>`);
}

/**
 * Give each picture in `copy` of the page `live` a picture of nothing in its
 * place, as large as the page's is as made. A drawing of the copy cannot
 * load the page's own, and the browser draws its box for a missing picture
 * there, an outline, a mark and the picture's text, which shows wherever the
 * picture drawn over it by hand does not cover its whole box. One as large
 * lays the page out as the real one does, and draws nothing.
 */
function blankPictures(live: Element, copy: Element): void {
  const shown = live.querySelectorAll("img");
  copy.querySelectorAll("img").forEach((image, index) => {
    const from = shown[index];
    if (!from || !from.complete || !(from.naturalWidth > 0 && from.naturalHeight > 0)) return;
    // Nothing else is left to pick a source by.
    for (const name of ["srcset", "sizes", "loading"]) image.removeAttribute(name);
    const holder = image.parentElement;
    if (holder?.localName === "picture") for (const source of holder.querySelectorAll("source")) source.remove();
    image.setAttribute("src", blankUrl(from.naturalWidth, from.naturalHeight));
  });
}

/** The page in `frame`, copied as it is now for `paintPage`, or null where it is out of reach. */
export function copyPage(frame: HTMLIFrameElement): Element | null {
  const doc = frame.contentDocument;
  if (!doc?.documentElement) return null;
  // Its styles inlined, as a drawing of it loads nothing of its own, and the
  // fonts it shows with them, those fetched by now.
  const rules: string[] = [];
  const written = embedFonts(doc);
  for (const sheet of doc.styleSheets) {
    try {
      for (const rule of sheet.cssRules) rules.push(written(rule));
    } catch {
      // A sheet from another origin keeps its rules to itself.
    }
  }
  // Made in a document of its own, which loads nothing and runs nothing: a
  // copy in the frame's would fetch its pictures again and run their handlers.
  const inert = doc.implementation.createHTMLDocument("");
  const root = inert.importNode(doc.documentElement, true);
  blankPictures(doc.documentElement, root);
  // And nothing devknobs put on the page: what its knobs write is in the rules.
  for (const node of root.querySelectorAll("script, link, style, noscript, [data-devknobs]")) node.remove();
  const style = inert.createElement("style");
  style.textContent = rules.join("\n");
  (root.querySelector("head") ?? root).append(style);
  return root;
}

/** Half of an emoji or other pair of utf-16 units, its other half cut off. */
const LONE_HALF = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

/** `svg` as a data url, any lone half of a pair made U+FFFD first, as encoding one throws. */
export function svgUrl(svg: string): string {
  const whole = typeof svg.toWellFormed === "function" ? svg.toWellFormed() : svg.replace(LONE_HALF, "\uFFFD");
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(whole)}`;
}

/**
 * The root font size of the page in `doc` as it computes now, as css for both
 * roots of a drawing of its copy. A drawing's root is its `svg`, not the
 * copy's `html`: every rem is taken against the `svg`, which knows nothing of
 * the page's root size, set by the page or by the text size knob, and a root
 * size in % or em would be taken against it too. So both get the size in px.
 */
export function rootSize(doc: Document, view: Window): string {
  const size = view.getComputedStyle(doc.documentElement).fontSize;
  return size ? `font-size:${size} !important` : "";
}

/**
 * A picture of the page in `frame` as the browser draws it, from `copy`, laid
 * out and scrolled as the frame is now, on a canvas of the screen `glass`
 * shows it on, `size` css px, on `color`. Its pictures, videos and drawings
 * go on as they are now, fitted in their boxes as the page fits them, as a
 * drawing of the copy loads none. Null where the browser will not draw it.
 */
export async function paintPage(
  frame: HTMLIFrameElement,
  glass: HTMLElement,
  size: { width: number; height: number },
  color: string,
  copy: Element,
): Promise<HTMLCanvasElement | null> {
  const doc = frame.contentDocument;
  const view = frame.contentWindow;
  const screen = glass.getBoundingClientRect();
  const box = frame.getBoundingClientRect();
  if (!doc || !view || screen.width <= 0 || view.innerWidth <= 0) return null;
  const { innerWidth: width, innerHeight: height, scrollX, scrollY } = view;
  const css = size.width / screen.width;
  const scale = (box.width * css) / width;
  const at = { x: (box.left - screen.left) * css, y: (box.top - screen.top) * css };
  // The page's pictures go on a canvas of their own now, as the page shows
  // them now. The drawing of the copy comes in later, and by then a fold has
  // laid the frame out for its other screen and back, and the page may show
  // other pictures in other boxes.
  let over: { canvas: HTMLCanvasElement; pen: CanvasRenderingContext2D } | null = null;
  for (const node of doc.querySelectorAll<MediaNode>(MEDIA)) {
    const media = node.closest("[data-devknobs]") ? null : mediaOf(node);
    const rect = node.getBoundingClientRect();
    if (!media || rect.bottom <= 0 || rect.top >= height || rect.width <= 0) continue;
    if (!over) {
      over = canvasOf(size.width, size.height);
      over?.pen.setTransform(scale, 0, 0, scale, at.x, at.y);
    }
    try {
      if (over) drawMedia(over.pen, media, rect, view.getComputedStyle(node));
    } catch {
      // A picture that will not draw is left out.
    }
  }
  const root = copy.cloneNode(true) as Element;
  // Scrolled as the frame is, what is pinned to the screen staying put.
  const scrolled = `position:relative;left:${-scrollX}px;top:${-scrollY}px`;
  const sized = rootSize(doc, view);
  root.setAttribute("style", `${root.getAttribute("style") ?? ""};${sized};${scrolled}`);
  const markup = new XMLSerializer().serializeToString(root);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" style="${sized}">` +
    `<foreignObject width="100%" height="100%">${markup}</foreignObject></svg>`;
  const image = new Image();
  // As data, not a blob: Chrome marks a drawing from a blob as foreign, and its canvas could not go to the GPU.
  try {
    image.src = svgUrl(svg);
    await image.decode();
  } catch {
    if (over) spend(over.canvas);
    return null;
  }
  const drawn = canvasOf(size.width, size.height);
  if (!drawn) return null;
  const { canvas, pen } = drawn;
  pen.fillStyle = color;
  pen.fillRect(0, 0, canvas.width, canvas.height);
  pen.setTransform(scale, 0, 0, scale, at.x, at.y);
  pen.drawImage(image, 0, 0, width, height);
  if (over) {
    pen.setTransform(1, 0, 0, 1, 0, 0);
    pen.drawImage(over.canvas, 0, 0);
    spend(over.canvas);
  }
  return canvas;
}
