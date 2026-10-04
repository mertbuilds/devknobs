import { BARS_START, type Bars, type BarsEvent, type BarsMotion, barsStep } from "./browserui";
import { type Actions, el, FONT, type Look, place } from "./browserkit";
import { CHROME_CSS, paintChrome } from "./chromedraw";
import { baseMatchMedia } from "./matchmedia";
import type { Rect } from "./mock";
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
.browser > *,
.browser > * > *,
.browser .group > * {
  position: absolute;
  box-sizing: border-box;
}
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

/** What the bars are drawn for. */
export interface BrowserView {
  bars: Bars | null;
  /** Where the page sits in the screen. */
  page: Rect | null;
  /** The screen, in css px. */
  size: { width: number; height: number };
  /** The frame's zoom, which the bars are drawn at too. */
  zoom: number;
  /** The bars follow the page's scroll, so the minimized one expands on a tap. */
  follow: boolean;
  /** Puts the frame at the page's size and place. */
  sizeFrame(): void;
}

export interface BrowserLayer {
  /**
   * Draw the bars, or take them away. Bars that only minimize or expand
   * morph into each other, and the frame takes its new size when that never
   * leaves a gap: at the start when it grows, at the end when it shrinks.
   */
  show(view: BrowserView): void;
  /** Read the page again: its background, scheme, address and history. */
  refresh(): void;
  /** Has the page's scroll minimized the bars? */
  minimized(): boolean;
  remove(): void;
}

/** How long after a knob moves the page has had to restyle, in ms. */
const RESTYLE = 120;

/** The morph between expanded and minimized bars, close to iOS's ease out. */
const MORPH = 320;
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
/** How far the leaving bars shrink, and the arriving ones start grown or shrunk. */
const SHRINK = 0.6;
const GROW = 1.6;

/** A morph under way: the bars it leaves, and the frame size it waits to apply. */
interface Morph {
  old: Element;
  animations: Animation[];
  timer: number;
  sizeFrame: (() => void) | null;
}

/**
 * Where the bars shrink to and grow from: Safari's minimized pill at the
 * bottom, under the status bar in Top, the top row turned across, or the edge
 * Chrome's toolbar slides out of.
 */
function focusOf(bars: Bars, size: { width: number; height: number }): { x: number; y: number } {
  const x = size.width / 2;
  const across = size.width > size.height;
  if (bars.platform === "chrome") {
    return { x, y: bars.layout === "bottom" && !across ? size.height : 0 };
  }
  if (across) return { x, y: 32 };
  if (bars.layout === "top") return { x, y: (bars.status?.height ?? 0) + 16 };
  return { x, y: size.height - 30 };
}

/**
 * The bars over the frame in `glass`, which fills with the page's background
 * around the frame, as Safari and Chrome tint the screen around their bars.
 * The page's scroll moves `minimized()`, and `onChange` hears when it does.
 */
export function createBrowser(
  glass: HTMLElement,
  frame: HTMLIFrameElement,
  onChange: () => void,
): BrowserLayer {
  const layer = el("div", "browser");
  layer.setAttribute("aria-hidden", "true");
  let view: BrowserView | null = null;
  let look: Look | null = null;
  let drawnKey = "";
  /** The bars as drawn, but for minimized, and whether they were minimized. */
  let drawnBase = "";
  let drawnMin = false;
  let drawnPage: Rect | null = null;
  let morph: Morph | null = null;
  let later = 0;
  /** The frame's scheme query, which tells when the page changes scheme, and its page. */
  let query: MediaQueryList | null = null;
  let watched: Document | null = null;
  let href = "";
  let motion: BarsMotion = BARS_START;
  const step = (event: BarsEvent) => {
    const before = motion.minimized;
    motion = barsStep(motion, event);
    // Heard after the step, so a step taken while the frame is drawn never redraws inside it.
    if (motion.minimized !== before) queueMicrotask(onChange);
  };
  const onScroll = () => {
    const page = frame.contentWindow;
    if (page) step({ type: "scroll", y: page.scrollY, time: performance.now() });
  };
  const actions: Actions = {
    back: () => frame.contentWindow?.history.back(),
    forward: () => frame.contentWindow?.history.forward(),
    reload: () => frame.contentWindow?.location.reload(),
    expand: () => step({ type: "tap" }),
  };
  /** End a morph now: the old bars go and the frame takes the size it waited for. */
  const settle = () => {
    if (!morph) return;
    const done = morph;
    morph = null;
    clearTimeout(done.timer);
    for (const animation of done.animations) animation.cancel();
    done.old.remove();
    if (done.sizeFrame) {
      done.sizeFrame();
      step({ type: "resize", time: performance.now() });
    }
    draw();
  };
  const paint = (bars: Bars, sight: Look) => {
    const shown = { ...actions, expand: view?.follow ? actions.expand : undefined };
    return PAINTERS[bars.platform](bars, sight, shown);
  };
  const draw = () => {
    const bars = view?.bars ?? null;
    if (!view || !bars) {
      settle();
      layer.replaceChildren();
      glass.style.background = "";
      drawnKey = "";
      drawnBase = "";
      return;
    }
    look ??= readLook(frame);
    glass.style.background = look.background;
    const key = JSON.stringify([bars, look, view.follow]);
    // A morph under way finishes before anything is drawn again.
    if (key === drawnKey || morph) return;
    const base = JSON.stringify([bars.platform, bars.layout, bars.handle, view.size]);
    const minimized = isMinimized(bars);
    const swap = base === drawnBase && minimized !== drawnMin && layer.firstElementChild !== null;
    const grows = (view.page?.height ?? 0) > (drawnPage?.height ?? 0);
    drawnKey = key;
    drawnBase = base;
    drawnMin = minimized;
    drawnPage = view.page;
    const next = paint(bars, look);
    const reduce = baseMatchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!swap || reduce) {
      layer.replaceChildren(...next);
      view.sizeFrame();
      if (swap) step({ type: "resize", time: performance.now() });
      return;
    }
    const old = layer.firstElementChild as Element;
    const root = next[0];
    if (!root) return;
    layer.append(root);
    if (grows) {
      view.sizeFrame();
      step({ type: "resize", time: performance.now() });
    }
    morph = {
      old,
      animations: animate(old, root, focusOf(bars, view.size), minimized),
      timer: window.setTimeout(settle, MORPH),
      sizeFrame: grows ? null : view.sizeFrame,
    };
  };
  const read = () => {
    try {
      // The window stays the same across loads, its document does not.
      const page = frame.contentWindow;
      const doc = frame.contentDocument;
      if (page && doc && doc !== watched) {
        query?.removeEventListener("change", read);
        query = page.matchMedia("(prefers-color-scheme: dark)");
        query.addEventListener("change", read);
        page.addEventListener("scroll", onScroll, { passive: true });
        watched = doc;
      }
      // A new page, or a new address in this one, starts with the bars out.
      const now = page?.location.href ?? "";
      if (now !== href) {
        href = now;
        step({ type: "navigate" });
      }
    } catch {
      query = null;
    }
    look = readLook(frame);
    draw();
  };
  return {
    show(next) {
      view = next;
      if (next.bars && !layer.isConnected) glass.append(layer);
      if (!next.bars) layer.remove();
      place(layer, 0, 0, next.size.width, next.size.height);
      layer.style.transform = next.zoom === 1 ? "" : `scale(${next.zoom})`;
      if (!next.bars) {
        settle();
        next.sizeFrame();
      } else if (morph) {
        // The frame takes the latest size, now or when the morph ends.
        if (morph.sizeFrame) morph.sizeFrame = next.sizeFrame;
        else next.sizeFrame();
        if (JSON.stringify(next.page) !== JSON.stringify(drawnPage)) settle();
      }
      draw();
      // Nothing new to draw, but the frame still follows the zoom and the fit.
      if (!morph && next.bars && JSON.stringify(next.page) === JSON.stringify(drawnPage)) {
        next.sizeFrame();
      }
    },
    refresh() {
      if (!view?.bars) return;
      read();
      // A knob's change reaches the page a message later, and its styles after that.
      clearTimeout(later);
      later = window.setTimeout(read, RESTYLE);
    },
    minimized: () => motion.minimized,
    remove() {
      clearTimeout(later);
      settle();
      query?.removeEventListener("change", read);
      try {
        frame.contentWindow?.removeEventListener("scroll", onScroll);
      } catch {
        // The frame went to another origin.
      }
      query = null;
      watched = null;
      layer.remove();
    },
  };
}

/** Minimized bars keep only the pill, or nothing. */
function isMinimized(bars: Bars): boolean {
  if (bars.platform === "chrome") return !bars.shapes.some((shape) => shape.kind === "toolbar");
  return bars.shapes.every((shape) => shape.kind === "pill");
}

/**
 * Morph `old` into `root` around `focus`: the leaving bars shrink or grow
 * into it and fade, the arriving ones come out of it, Chrome's toolbar
 * slides instead, and a part both have, the scroll edge, moves across.
 */
function animate(
  old: Element,
  root: Element,
  focus: { x: number; y: number },
  minimizing: boolean,
): Animation[] {
  const timing: KeyframeAnimationOptions = { duration: MORPH, easing: EASE, fill: "both" };
  const chrome = root.classList.contains("chrome");
  const away = (scale: number) =>
    chrome ? `translateY(${focus.y === 0 ? -24 : 24}px)` : `scale(${scale})`;
  // What stands still shows once, from the arriving bars.
  for (const node of Array.from(old.children) as HTMLElement[]) {
    if (!node.classList.contains("group")) node.style.visibility = "hidden";
  }
  const animations: Animation[] = [];
  const leaving = old.querySelector<HTMLElement>(":scope > .group");
  const arriving = root.querySelector<HTMLElement>(":scope > .group");
  for (const group of [leaving, arriving]) {
    if (group) group.style.transformOrigin = `${focus.x}px ${focus.y}px`;
  }
  if (leaving) {
    const to = away(minimizing ? SHRINK : GROW);
    animations.push(leaving.animate([{ opacity: 1 }, { opacity: 0, transform: to }], timing));
  }
  if (arriving) {
    const from = away(minimizing ? GROW : SHRINK);
    const frames = [{ opacity: 0, transform: from }, { opacity: 1, transform: "none" }];
    animations.push(arriving.animate(frames, timing));
  }
  for (const node of Array.from(root.querySelectorAll<HTMLElement>("[data-key]"))) {
    const key = node.getAttribute("data-key");
    const before = old.querySelector<HTMLElement>(`[data-key="${key}"]`);
    const dy = before ? before.offsetTop - node.offsetTop : 0;
    if (dy !== 0) {
      animations.push(
        node.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }], timing),
      );
    }
  }
  return animations;
}
