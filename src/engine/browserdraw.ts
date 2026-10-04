import type { Bars } from "./browserui";
import { type Actions, el, FONT, type Look, place } from "./browserkit";
import { CHROME_CSS, paintChrome } from "./chromedraw";
import { paintSafari, SAFARI_CSS } from "./safaridraw";

/**
 * The browser's bars drawn in the screen around the frame, in the viewport's
 * shadow root. They live in the page above, so they keep its cursor and never
 * take the focus, and only back, forward and reload do anything.
 */

type Painter = (bars: Bars, look: Look, actions: Actions) => Element[];

export const BARS_CSS = `
.browser {
  position: absolute;
  top: 0;
  left: 0;
  overflow: hidden;
  transform-origin: 0 0;
  pointer-events: none;
  cursor: default;
  user-select: none;
  -webkit-user-select: none;
  font-family: ${FONT};
  font-weight: 400;
  -webkit-font-smoothing: antialiased;
  line-height: 1;
}
.browser > *, .browser > * > * { position: absolute; box-sizing: border-box; }
.browser svg { overflow: visible; }
.browser .press { pointer-events: auto; cursor: default; }
${SAFARI_CSS}
${CHROME_CSS}
`;

const PAINTERS: Record<Bars["platform"], Painter> = { safari: paintSafari, chrome: paintChrome };

/** `rgb()` or `rgba()` as numbers, or null for a color in another form. */
function parseRgb(color: string): [number, number, number, number] | null {
  const match = /^rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)$/.exec(color);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4] ?? 1)];
}

/** Any css color as `rgb()`, through a canvas, for the forms getComputedStyle keeps as written. */
function toRgb(color: string): [number, number, number, number] | null {
  const parsed = parseRgb(color);
  if (parsed) return parsed;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;
    context.fillStyle = color;
    context.fillRect(0, 0, 1, 1);
    const [r = 0, g = 0, b = 0, a = 0] = context.getImageData(0, 0, 1, 1).data;
    return [r, g, b, a / 255];
  } catch {
    return null;
  }
}

/** Relative luminance, 0 for black to 1 for white. */
export function luminance(r: number, g: number, b: number): number {
  const linear = (value: number) => {
    const c = value / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/**
 * The color the page paints its canvas in: the root's background, else the
 * body's, over the browser's own canvas, which is dark only for a page that
 * takes a dark color scheme while the preference is dark.
 */
function backgroundOf(doc: Document, view: Window, dark: boolean): [number, number, number] {
  const root = view.getComputedStyle(doc.documentElement);
  const schemes = root.colorScheme ?? "";
  const canvasDark = schemes.includes("dark") && (dark || !schemes.includes("light"));
  let base: [number, number, number] = canvasDark ? [18, 18, 18] : [255, 255, 255];
  const layers = [doc.body, doc.documentElement].filter((node): node is HTMLElement => !!node);
  for (const node of layers) {
    const color = toRgb(view.getComputedStyle(node).backgroundColor);
    if (!color || color[3] === 0) continue;
    const [r, g, b, a] = color;
    base = [0, 1, 2].map((at) => {
      const over = [r, g, b][at] ?? 0;
      return Math.round(over * a + (base[at] ?? 0) * (1 - a));
    }) as [number, number, number];
  }
  return base;
}

interface FrameNavigation {
  canGoBack?: boolean;
  canGoForward?: boolean;
}

/** What the bars show for the page in the frame, white and empty while it is out of reach. */
export function readLook(frame: HTMLIFrameElement): Look {
  const fallback: Look = {
    background: "rgb(255, 255, 255)",
    dark: false,
    scheme: "light",
    host: "",
    canBack: false,
    canForward: false,
  };
  try {
    const view = frame.contentWindow;
    const doc = frame.contentDocument;
    if (!view || !doc?.documentElement) return fallback;
    const scheme = view.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    const [r, g, b] = backgroundOf(doc, view, scheme === "dark");
    const navigation = (view as Window & { navigation?: FrameNavigation }).navigation;
    return {
      background: `rgb(${r}, ${g}, ${b})`,
      dark: luminance(r, g, b) < 0.4,
      scheme,
      host: view.location.host,
      canBack: navigation?.canGoBack ?? view.history.length > 1,
      canForward: navigation?.canGoForward ?? false,
    };
  } catch {
    return fallback;
  }
}

export interface BrowserLayer {
  /** Draw the bars for a screen `size` css px, at the frame's zoom, or take them away. */
  show(bars: Bars | null, size: { width: number; height: number }, zoom: number): void;
  /** Read the page again: its background, scheme, address and history. */
  refresh(): void;
  remove(): void;
}

/** How long after a knob moves the page has had to restyle, in ms. */
const RESTYLE = 120;

/**
 * The bars over the frame in `glass`, which fills with the page's background
 * around the frame, as Safari and Chrome tint the screen around their bars.
 */
export function createBrowser(glass: HTMLElement, frame: HTMLIFrameElement): BrowserLayer {
  const layer = el("div", "browser");
  layer.setAttribute("aria-hidden", "true");
  let bars: Bars | null = null;
  let look: Look | null = null;
  let drawnKey = "";
  let later = 0;
  /** The frame's scheme query, which tells when the page changes scheme, and its page. */
  let query: MediaQueryList | null = null;
  let watched: Document | null = null;
  const actions: Actions = {
    back: () => frame.contentWindow?.history.back(),
    forward: () => frame.contentWindow?.history.forward(),
    reload: () => frame.contentWindow?.location.reload(),
  };
  const draw = () => {
    if (!bars) {
      layer.replaceChildren();
      glass.style.background = "";
      drawnKey = "";
      return;
    }
    look ??= readLook(frame);
    glass.style.background = look.background;
    const key = JSON.stringify([bars, look]);
    if (key === drawnKey) return;
    drawnKey = key;
    layer.replaceChildren(...(PAINTERS[bars.platform](bars, look, actions)));
  };
  const read = () => {
    try {
      // The window stays the same across loads, its document does not.
      const view = frame.contentWindow;
      const doc = frame.contentDocument;
      if (view && doc && doc !== watched) {
        query?.removeEventListener("change", read);
        query = view.matchMedia("(prefers-color-scheme: dark)");
        query.addEventListener("change", read);
        watched = doc;
      }
    } catch {
      query = null;
    }
    look = readLook(frame);
    draw();
  };
  return {
    show(next, size, zoom) {
      bars = next;
      if (bars && !layer.isConnected) glass.append(layer);
      if (!bars) layer.remove();
      place(layer, 0, 0, size.width, size.height);
      layer.style.transform = zoom === 1 ? "" : `scale(${zoom})`;
      draw();
    },
    refresh() {
      if (!bars) return;
      read();
      // A knob's change reaches the page a message later, and its styles after that.
      clearTimeout(later);
      later = window.setTimeout(read, RESTYLE);
    },
    remove() {
      clearTimeout(later);
      query?.removeEventListener("change", read);
      query = null;
      watched = null;
      layer.remove();
    },
  };
}
