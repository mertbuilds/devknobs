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
 * A picture of a screen `width` css px wide blurred two ways, by about 16 and
 * 64 css px: halved over and over, then doubled back up, so each step smooths
 * what the last left. Drawn once, each is as cheap to show as the picture.
 */
export function blurPictures(shot: HTMLCanvasElement, width: number): [HTMLCanvasElement, HTMLCanvasElement] {
  const finer = Math.max(0, Math.round(Math.log2(shot.width / (width * RES))));
  return [blurPicture(shot, 2 + finer), blurPicture(shot, 4 + finer)];
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
  // Its styles inlined, as a drawing of it loads nothing of its own.
  const rules: string[] = [];
  for (const sheet of doc.styleSheets) {
    try {
      for (const rule of sheet.cssRules) rules.push(rule.cssText);
    } catch {
      // A sheet from another origin keeps its rules to itself.
    }
  }
  // The frame's own Element, which the window's `instanceof` would not know.
  const root = doc.documentElement.cloneNode(true) as Element;
  for (const node of root.querySelectorAll("script, link, style, noscript")) node.remove();
  const style = doc.createElement("style");
  style.textContent = rules.join("\n");
  (root.querySelector("head") ?? root).append(style);
  return root;
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
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  const image = new Image();
  image.src = url;
  try {
    await image.decode();
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
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
