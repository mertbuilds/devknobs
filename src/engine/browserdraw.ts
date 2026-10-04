import {
  BARS_START,
  type Bars,
  type BarsEvent,
  type BarsMotion,
  barsOf,
  barsStep,
  endRoom,
} from "./browserui";
import { type Actions, el, FONT, type Look, MORPH, type Painted, place } from "./browserkit";
import { buildChrome, CHROME_CSS } from "./chromedraw";
import { type Color, luminance, parseColor } from "./color";
import { give } from "./endroom";
import { baseMatchMedia } from "./matchmedia";
import type { Rect } from "./mock";
import { buildSafari, SAFARI_CSS } from "./safaridraw";

/**
 * The browser's bars drawn in the screen around the frame, in the viewport's
 * shadow root. They live in the page above, so they keep its cursor and never
 * take the focus, and only back, forward and reload do anything.
 */

type Builder = (full: Bars, mini: Bars, look: Look, actions: Actions) => Painted;

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

const BUILDERS: Record<Bars["platform"], Builder> = { safari: buildSafari, chrome: buildChrome };

/** Any css color as a color, through a canvas for the forms `parseColor` leaves. */
function toRgb(color: string): Color | null {
  const parsed = parseColor(color);
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
    return { red: r, green: g, blue: b, alpha: a / 255 };
  } catch {
    return null;
  }
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
    if (!color || color.alpha === 0) continue;
    const { red, green, blue, alpha } = color;
    const [r, g, b] = base;
    const over = (top: number, under: number) => Math.round(top * alpha + under * (1 - alpha));
    base = [over(red, r), over(green, g), over(blue, b)];
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

/** Can the frame's page be read? Not on another origin, or behind an error page. */
function reaches(frame: HTMLIFrameElement): boolean {
  try {
    return !!frame.contentDocument?.documentElement;
  } catch {
    return false;
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
   * Draw the bars, or take them away. Bars that only minimize or expand move
   * between their two states in place, and the frame takes a new size when
   * that never leaves a gap: at once when it grows, at the end of the morph
   * when it shrinks.
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

function same(a: Rect | null, b: Rect | null): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
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
  let painted: Painted | null = null;
  /** What the bars were built for: everything but minimized. */
  let built = "";
  /** The page box the frame has now, and the wait to give it a smaller one. */
  let applied: Rect | null = null;
  let shrinking = 0;
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
  /**
   * Give the page the room its end needs under the bars it is drawn under.
   * Another room moves the end of the page's scroll as another size does, so
   * it locks the scroll too, and a page at its end stays at its end as the
   * room grows, clear of the bars that came back.
   */
  const roomFrame = () => {
    const bars = view?.bars ?? null;
    try {
      const page = frame.contentWindow;
      const doc = frame.contentDocument;
      if (!page || !doc?.documentElement) return;
      const room = bars
        ? endRoom(bars.screen, bars.orientation, bars.layout, bars.minimized, bars.edge)
        : 0;
      const had = give(doc, room);
      if (had === room) return;
      step({ type: "resize", time: performance.now() });
      const end = doc.documentElement.scrollHeight - page.innerHeight;
      if (room < had || page.scrollY <= 1 || page.scrollY < end - (room - had) - 1) return;
      const still = baseMatchMedia("(prefers-reduced-motion: reduce)").matches;
      page.scrollTo({ top: end, behavior: still ? "instant" : "smooth" });
    } catch {
      // Another origin: no page there to give room.
    }
  };
  /** Give the frame its page box. A new size locks the scroll, as the page settles into it. */
  const sizeFrame = () => {
    if (!view) return;
    view.sizeFrame();
    if (!same(view.page, applied)) step({ type: "resize", time: performance.now() });
    applied = view.page;
    roomFrame();
  };
  /** The frame grows at once, under bars that are leaving, and shrinks once the bars are in. */
  const placeFrame = (instant: boolean) => {
    const page = view?.page ?? null;
    const shrinks = !instant && page && applied && page.height < applied.height;
    clearTimeout(shrinking);
    if (!shrinks) {
      sizeFrame();
      return;
    }
    shrinking = window.setTimeout(() => {
      if (same(view?.page ?? null, page)) sizeFrame();
    }, MORPH.expand);
  };
  /**
   * The frame's own background takes the page's color. The frame's edges fall
   * between device pixels at most scales, where its background is drawn into
   * the part of a pixel the page is not, and its stylesheet's white there is a
   * hairline along the edge of a dark page, which comes and goes as the page
   * is drawn in new layers. A page out of reach keeps the stylesheet's.
   */
  const back = () => {
    frame.style.background = reaches(frame) ? (look ??= readLook(frame)).background : "";
  };
  const draw = () => {
    const bars = view?.bars ?? null;
    if (!view || !bars) {
      clearTimeout(shrinking);
      layer.replaceChildren();
      glass.style.background = "";
      back();
      painted = null;
      built = "";
      if (view) sizeFrame();
      return;
    }
    look ??= readLook(frame);
    glass.style.background = look.background;
    back();
    const { platform, layout, screen, orientation, edge } = bars;
    const base = JSON.stringify([platform, layout, screen, orientation, edge, view.follow]);
    const fresh = base !== built || !painted;
    const instant = fresh || baseMatchMedia("(prefers-reduced-motion: reduce)").matches;
    if (fresh) {
      const other = barsOf(screen, orientation, layout, !bars.minimized, edge);
      const full = bars.minimized ? other : bars;
      const mini = bars.minimized ? bars : other;
      const shown = { ...actions, expand: view.follow ? actions.expand : undefined };
      if (!full || !mini) return;
      painted = BUILDERS[bars.platform](full, mini, look, shown);
      layer.replaceChildren(painted.root);
      built = base;
    }
    // A first drawing, or reduced motion, takes the state without a transition.
    if (instant) layer.setAttribute("data-instant", "");
    painted?.apply(bars.minimized, look);
    if (instant) {
      void layer.offsetWidth;
      layer.removeAttribute("data-instant");
    }
    placeFrame(instant);
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
      draw();
    },
    refresh() {
      if (!view) return;
      // Without bars only the frame's background follows the page.
      const again = view.bars
        ? read
        : () => {
            look = readLook(frame);
            back();
          };
      again();
      // A knob's change reaches the page a message later, and its styles after that.
      clearTimeout(later);
      later = window.setTimeout(again, RESTYLE);
    },
    minimized: () => motion.minimized,
    remove() {
      clearTimeout(later);
      clearTimeout(shrinking);
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
