import { BLURS } from "./fold";
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

/**
 * A picture of the page in `frame` as the screen `glass` shows it, `size` css
 * px, on `color`, or null where its page is out of reach.
 */
export function shootPage(
  frame: HTMLIFrameElement,
  glass: HTMLElement,
  size: { width: number; height: number },
  color: string,
): HTMLCanvasElement | null {
  const doc = frame.contentDocument;
  const view = frame.contentWindow;
  const screen = glass.getBoundingClientRect();
  const box = frame.getBoundingClientRect();
  if (!doc?.body || !view || screen.width <= 0 || view.innerWidth <= 0) return null;
  const key = [size.width, size.height, color, box.left - screen.left, box.top - screen.top, box.width]
    .concat([view.innerWidth, view.innerHeight, view.scrollX, view.scrollY])
    .join("|");
  const kept = shots.get(doc)?.get(key);
  if (kept && watched?.doc === doc && !watched.changed) return kept;
  const drawn = canvasOf(size.width * RES, size.height * RES);
  if (!drawn) return null;
  const { canvas, pen } = drawn;
  pen.fillStyle = color;
  pen.fillRect(0, 0, canvas.width, canvas.height);
  // The page's css px on the screen's, from where the frame sits on it.
  const css = size.width / screen.width;
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
  const pictures = new Map<Element, CanvasImageSource>();
  for (const image of doc.images) if (image.complete && image.naturalWidth > 0) pictures.set(image, image);
  for (const video of doc.querySelectorAll("video")) if (video.readyState >= 2) pictures.set(video, video);
  for (const drawing of doc.querySelectorAll("canvas")) pictures.set(drawing, drawing);
  const range = doc.createRange();
  const tall = view.innerHeight;
  let seen = 0;
  /** Elements pinned to the screen, drawn once the rest is. */
  const pinned: [Element, number][] = [];

  const deadline = performance.now() + BUDGET;
  const draw = (node: Element, alpha: number, lifted: boolean): void => {
    if (seen++ > MOST || (seen % 50 === 0 && performance.now() > deadline)) return;
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
      if (picture) pen.drawImage(picture, rect.left, rect.top, rect.width, rect.height);
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
  keepShot(doc, key, canvas);
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

/** Keep a picture of `doc` for as long as the page does not change. */
function keepShot(doc: Document, key: string, canvas: HTMLCanvasElement): void {
  if (watched?.doc !== doc || watched.changed) {
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

/**
 * A picture of a screen `width` css px wide blurred as wide as each of the
 * fold's `BLURS` past the sharp one: halved over and over, then doubled back
 * up, so each step smooths what the last left. Drawn once, each is as cheap
 * to show as the picture. Each lies on black past the picture's ends along
 * the hinge, its top and bottom `across` and its sides otherwise, as far as
 * `blurMargin` has it, so the blur spreads those ends into the dark past
 * them, as jadon7/iphone-duo blurs the picture and black together.
 */
export function blurPictures(shot: HTMLCanvasElement, width: number, across: boolean): HTMLCanvasElement[] {
  // How many times finer than `RES` the picture is, so how many more halvings each blur takes.
  const finer = Math.log2(shot.width / (width * RES));
  return BLURS.slice(1).map((wide) => {
    const times = Math.max(0, Math.round(Math.log2(wide * RES) + finer));
    const margin = blurMargin(times);
    const padded = canvasOf(shot.width + (across ? 0 : 2 * margin), shot.height + (across ? 2 * margin : 0));
    if (!padded) return blurPicture(shot, times);
    padded.pen.fillStyle = "#000";
    padded.pen.fillRect(0, 0, padded.canvas.width, padded.canvas.height);
    padded.pen.drawImage(shot, across ? 0 : margin, across ? margin : 0);
    return blurPicture(padded.canvas, times);
  });
}

/**
 * How far the black under a picture halved `times` over reaches past its
 * ends, in its px: two of the smallest picture's px, past where the blur
 * spreads it, so none of it is cut off.
 */
export function blurMargin(times: number): number {
  return 2 ** (times + 1);
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

/** `shot` halved `times` over, then doubled back up to its size. */
function blurPicture(shot: HTMLCanvasElement, times: number): HTMLCanvasElement {
  let at: HTMLCanvasElement = shot;
  const steps: HTMLCanvasElement[] = [];
  for (let step = 0; step < times; step++) {
    const half = canvasOf(at.width / 2, at.height / 2);
    if (!half) return at;
    half.pen.drawImage(at, 0, 0, half.canvas.width, half.canvas.height);
    steps.push(at);
    at = half.canvas;
  }
  for (const size of steps.reverse()) {
    const up = canvasOf(size.width, size.height);
    if (!up) return at;
    up.pen.imageSmoothingQuality = "high";
    up.pen.drawImage(at, 0, 0, up.canvas.width, up.canvas.height);
    at = up.canvas;
  }
  return at;
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
  for (const node of root.querySelectorAll("script, link, style, noscript")) node.remove();
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
 * A picture of the page in `frame` as the browser draws it, from `copy`, laid
 * out and scrolled as the frame is now, on a canvas of the screen `glass`
 * shows it on, `size` css px, on `color`. Its pictures, videos and drawings
 * go on as they are now, as a drawing of the copy loads none. Null where the
 * browser will not draw it.
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
  const media: [CanvasImageSource, DOMRect][] = [];
  for (const node of doc.querySelectorAll<HTMLImageElement | HTMLVideoElement | HTMLCanvasElement>(
    "img, video, canvas",
  )) {
    const ready =
      "naturalWidth" in node ? node.complete && node.naturalWidth > 0 : !("readyState" in node) || node.readyState >= 2;
    const rect = node.getBoundingClientRect();
    if (ready && rect.bottom > 0 && rect.top < height && rect.width > 0) media.push([node, rect]);
  }
  const root = copy.cloneNode(true) as Element;
  // Scrolled as the frame is, what is pinned to the screen staying put.
  const scrolled = `position:relative;left:${-scrollX}px;top:${-scrollY}px`;
  root.setAttribute("style", `${root.getAttribute("style") ?? ""};${scrolled}`);
  const markup = new XMLSerializer().serializeToString(root);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
    `<foreignObject width="100%" height="100%">${markup}</foreignObject></svg>`;
  const image = new Image();
  // As data, not a blob: Chrome marks a drawing from a blob as foreign, and its canvas could not go to the GPU.
  try {
    image.src = svgUrl(svg);
    await image.decode();
  } catch {
    return null;
  }
  const drawn = canvasOf(size.width, size.height);
  if (!drawn) return null;
  const { canvas, pen } = drawn;
  pen.fillStyle = color;
  pen.fillRect(0, 0, canvas.width, canvas.height);
  pen.setTransform(scale, 0, 0, scale, at.x, at.y);
  pen.drawImage(image, 0, 0, width, height);
  for (const [source, rect] of media) {
    try {
      pen.drawImage(source, rect.left, rect.top, rect.width, rect.height);
    } catch {
      // A picture that will not draw is left out.
    }
  }
  return canvas;
}
