/**
 * A rough picture of the page in the frame, for the copies of a foldable's
 * screens that turn while it folds, where the frame cannot be. It is blurred
 * where it shows, so it only needs the page's shapes and colors: each box's
 * background, its pictures, and its lines of text as bands in their color,
 * painted small. What is pinned to the screen goes over the rest.
 */

/** How many of the picture's px a css px of the screen takes. The blur hides anything finer. */
const RES = 0.25;
/** At most this many elements are looked at, so a long page costs no more than a short one. */
const MOST = 1500;
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

  const draw = (node: Element, alpha: number, lifted: boolean): void => {
    if (seen++ > MOST) return;
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
  return canvas;
}

/**
 * The picture `shot` stretched over a screen `size` css px, on a canvas that
 * reaches `margin` css px past each of its edges with the picture's edges
 * drawn on out, so a blur of it keeps its color to the screen's edge.
 */
export function pictureOf(
  shot: HTMLCanvasElement,
  size: { width: number; height: number },
  margin: number,
): HTMLCanvasElement | null {
  const width = size.width * RES;
  const height = size.height * RES;
  const edge = margin * RES;
  const drawn = canvasOf(width + 2 * edge, height + 2 * edge);
  if (!drawn) return null;
  const { canvas, pen } = drawn;
  const w = shot.width;
  const h = shot.height;
  const far = { x: edge + width, y: edge + height };
  pen.drawImage(shot, 0, 0, w, h, edge, edge, width, height);
  // Each side, then each corner, its last row of px drawn on out.
  pen.drawImage(shot, 0, 0, 1, h, 0, edge, edge, height);
  pen.drawImage(shot, w - 1, 0, 1, h, far.x, edge, edge, height);
  pen.drawImage(shot, 0, 0, w, 1, edge, 0, width, edge);
  pen.drawImage(shot, 0, h - 1, w, 1, edge, far.y, width, edge);
  pen.drawImage(shot, 0, 0, 1, 1, 0, 0, edge, edge);
  pen.drawImage(shot, w - 1, 0, 1, 1, far.x, 0, edge, edge);
  pen.drawImage(shot, 0, h - 1, 1, 1, 0, far.y, edge, edge);
  pen.drawImage(shot, w - 1, h - 1, 1, 1, far.x, far.y, edge, edge);
  return canvas;
}
