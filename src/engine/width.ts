import type { DevknobsState, DprValue, PanelValue, ZoomValue } from "../types";
import { bezelMock, bezelUrl, loadBezel } from "./bezels";
import { BARS_CSS, type BrowserLayer, createBrowser } from "./browserdraw";
import { barsOf, layoutOf, viewportOf } from "./browserui";
import { deviceOf } from "./devices";
import { type Fit, fit, hasStrip, label, origin, STRIP, STRIP_TOP } from "./fit";
import {
  FRAME_ATTRIBUTE,
  FRAME_NAME,
  type FrameKnobs,
  needsFrame,
  post,
  readMessage,
  UNFRAMED,
  type ZoomAction,
} from "./frame";
import { drawMat, MAT_CSS } from "./mat";
import { type Mock, mockOf, placeIn, type Rect } from "./mock";
import { corners, drawMock, MOCK_CSS } from "./mockdraw";
import * as reload from "./reload";
import { ensureStyle, removeStyle } from "./style";
import { cover, uncover } from "./underneath";
import { visionFilter } from "./vision";
import { anchorScroll, percent, type Point, stepZoom, wheelZoom, ZOOM_PRESETS } from "./zoom";

export { type Fit, fit, label, origin, STRIP } from "./fit";

const NAME = "width";

/** What the frame takes from the knobs. */
export type ViewportValue = FrameKnobs &
  Pick<
    DevknobsState,
    | "scheme"
    | "device"
    | "orientation"
    | "mock"
    | "browser"
    | "bars"
    | "edgeToEdge"
    | "zoom"
    | "mat"
  > & {
    panel: Pick<PanelValue, "open" | "side">;
  };

/** One under the panel host, so the panel stays on top of the frame. */
const Z_INDEX = 2147483645;

/** How long a wheel or a pinch rests before its zoom goes in the store, in ms. */
const ZOOM_SETTLE = 200;

/**
 * How far black runs past the screen's edge under a picture of the body, in
 * css px of the screen. The picture's opening and the screen share an edge,
 * and where it falls between device pixels both are drawn part way, so the
 * mat would show through as a light line. The rim of the body there is black.
 */
const UNDER = 2;

/** The pixels a wheel line stands for, where a wheel counts in lines. */
const WHEEL_LINE = 20;

/** The chevron of the zoom control, as its own arrow is styled away. */
const CHEVRON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='6' height='4'%3E%3Cpath d='M.5.5 3 3.5 5.5.5' fill='none' stroke='%23fff' stroke-opacity='.7'/%3E%3C/svg%3E";

/**
 * Everything an app on this origin does unframed, pointer lock, presentation
 * and orientation lock included, short of navigating the window above on its
 * own: a frame-busting script would reload the page into its frame forever. A
 * click still can, so `target="_top"` links work.
 */
const SANDBOX = [
  "allow-scripts",
  "allow-same-origin",
  "allow-forms",
  "allow-popups",
  "allow-popups-to-escape-sandbox",
  "allow-modals",
  "allow-downloads",
  "allow-pointer-lock",
  "allow-presentation",
  "allow-orientation-lock",
  "allow-top-navigation-by-user-activation",
].join(" ");

/**
 * The letterbox around the frame. It lives in a shadow root like the panel,
 * so page css cannot reach it. A dark cutting mat reads as chrome in light and
 * dark, under a white page and a near black mock alike. Its grid and rulers
 * stay put from the top left as the frame is fitted or zoomed.
 */
const CSS = `
.viewport {
  all: initial;
  box-sizing: border-box;
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  direction: ltr;
  background: var(--mat);
}
.size {
  position: relative;
  flex: none;
  box-sizing: border-box;
  /* A set height, so the room the frame is fitted to never waits on the text. */
  height: ${STRIP}px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: ${STRIP_TOP}px 8px 0;
  font: 11px/16px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  white-space: nowrap;
  color: rgba(255, 255, 255, 0.8);
  user-select: none;
  -webkit-user-select: none;
}
.size[hidden] { display: none; }
.zoom {
  appearance: none;
  -webkit-appearance: none;
  box-sizing: border-box;
  height: 18px;
  margin: 0;
  padding: 0 16px 0 6px;
  font: inherit;
  color: inherit;
  color-scheme: dark;
  background: url("${CHEVRON}") no-repeat right 5px center;
  border: 1px solid rgba(255, 255, 255, 0.4);
  border-radius: 4px;
  cursor: pointer;
}
.zoom:focus { outline: none; }
.zoom:hover, .zoom:focus-visible { color: #fff; border-color: rgba(255, 255, 255, 0.7); }
.stage {
  position: relative;
  flex: 1 1 0;
  min-height: 0;
  display: flex;
  overflow: auto;
}
/* As big as the frame is drawn, margins and all, so a bigger one scrolls both
   ways. Auto margins center a smaller one and drop to nothing on a bigger
   one, so every edge of it scrolls into view. */
.drawing {
  flex: none;
  position: relative;
  margin: auto;
}
/* Scales the frame to fit, or by the zoom. A transform keeps the device pixel
   ratio inside, where zoom would change it, and hit testing follows it into
   the frame, so clicks land where they are drawn. */
.screen {
  position: absolute;
  top: 0;
  left: 0;
  transform-origin: 0 0;
}
.glass { position: relative; }
/* Where a phone's browser leaves the page in its screen. */
.page.placed { position: absolute; }
iframe {
  display: block;
  border: 0;
  /* The canvas color of the frame's own scheme, which is what shows through a
     page that leaves its background to the browser. */
  background: Canvas;
}
.blocked {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font: 12px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  color: rgba(255, 255, 255, 0.85);
  background: var(--mat);
}
.blocked[hidden] { display: none; }
.blocked button {
  appearance: none;
  -webkit-appearance: none;
  margin: 0;
  padding: 2px 8px;
  font: inherit;
  color: inherit;
  background: none;
  border: 1px solid rgba(255, 255, 255, 0.5);
  border-radius: 4px;
  cursor: pointer;
}
.blocked button:hover { color: #fff; border-color: #fff; }
@media (color-gamut: p3) {
  .viewport, .blocked { background: var(--mat-p3); }
}
${MAT_CSS}
${MOCK_CSS}
${BARS_CSS}`;

let host: HTMLElement | null = null;
/** The mat around the frame, readout strip included, which the frame is fitted to. */
let letterbox: HTMLElement | null = null;
/** The mat's grid and rulers, drawn for the letterbox's size. */
let mat: SVGSVGElement | null = null;
/** The size, line and readout the mat was last drawn for. */
let matKey = "";
/** Under the readout strip, and scrolls a frame drawn bigger than it. */
let stage: HTMLElement | null = null;
let drawing: HTMLElement | null = null;
let screen: HTMLElement | null = null;
/** Holds the frame, and clips it to the screen's corners under a mock. */
let glass: HTMLElement | null = null;
/** Holds the frame where a phone's browser leaves the page. */
let pageBox: HTMLElement | null = null;
/** A phone's browser bars around the frame. */
let browser: BrowserLayer | null = null;
/** The device's body drawn around the frame, while it has one. */
let mockDrawing: SVGSVGElement | null = null;
/** The device and the way it is held that the mock was last drawn for. */
let mockKey = "";
let frame: HTMLIFrameElement | null = null;
let readout: HTMLElement | null = null;
/** What the readout says, before its zoom control. */
let caption: HTMLElement | null = null;
let picker: HTMLSelectElement | null = null;
/** The zoom control's options as they were last drawn. */
let pickerKey = "";
/** Where the frame went the last time it was drawn. */
let drawn: Fit | null = null;
/** A zoom from the wheel that is not in the store yet. */
let held: number | null = null;
/** The wait for the wheel to rest. */
let settling = 0;
/** Puts a zoom in the store. The engine hands it in. */
let zoomTo: ((zoom: ZoomValue) => void) | null = null;
/** Says so when the page will not load in a frame. */
let notice: HTMLElement | null = null;
/** Turns every knob that keeps the frame up off. The engine hands it in. */
let exit: (() => void) | null = null;
let current: ViewportValue = {
  ...UNFRAMED,
  scheme: "system",
  device: "none",
  orientation: "portrait",
  mock: true,
  browser: "auto",
  bars: "auto",
  edgeToEdge: true,
  zoom: "fit",
  mat: "blue",
  panel: { open: false, side: "right" },
};
/** The frame's page has loaded, so what it reports can be trusted. */
let loaded = false;
/** Where the frame was last seen on this origin. */
let frameUrl = "";
/** The window's own address when the frame came up, and its title once the frame's took over. */
let pageUrl = "";
let pageTitle: string | null = null;
/** The address last put in the window for the frame. Another one there means the window moved. */
let written = "";
/** Where the page underneath was scrolled to, which hiding it loses. */
let scroll = { x: 0, y: 0 };
/** Follows the frame's title, which a router sets after the url changes. */
let titleObserver: MutationObserver | null = null;
let latest: DevknobsState | null = null;
/** The window inside the frame, while there is one. */
export function frameWindow(): Window | null {
  return frame?.contentWindow ?? null;
}

function share(): void {
  if (latest) post(frameWindow(), { source: "devknobs", type: "state", state: latest });
}

/** Keep the knobs and hand them to the frame, which applies them to its own page. */
export function sync(state: DevknobsState): void {
  latest = state;
  share();
  reload.knobs(state);
}

/** Where the frame is now. A frame that left the origin keeps the last place seen. */
function locate(): string {
  try {
    const href = frame?.contentWindow?.location.href;
    if (href && href !== "about:blank") frameUrl = href;
  } catch {
    // Another origin: the frame cannot be followed there.
  }
  return frameUrl;
}

export function onExit(handler: (() => void) | null): void {
  exit = handler;
}

export function onZoom(handler: ((zoom: ZoomValue) => void) | null): void {
  zoomTo = handler;
}

/** The page in the frame, or null once it is on another origin, or an error page. */
function frameDocument(): Document | null {
  try {
    return frame?.contentDocument ?? null;
  } catch {
    return null;
  }
}

/**
 * Over the frame when the page is out of reach: `X-Frame-Options` or a
 * `frame-ancestors` policy left an error page there, or a link led away to
 * another origin. Either way none of the knobs can follow it.
 */
function createNotice(): HTMLElement {
  const box = document.createElement("div");
  box.className = "blocked";
  box.hidden = true;
  const text = document.createElement("div");
  text.textContent = "this page refuses to load in a frame";
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "close the frame";
  button.addEventListener("click", () => exit?.());
  box.append(text, button);
  return box;
}

/** Swap the window's url without a router in the page underneath hearing of it. */
function replaceUrl(href: string): void {
  if (href !== window.location.href) {
    History.prototype.replaceState.call(window.history, window.history.state, "", href);
  }
}

/** Put where the frame is in the window's address bar and tab, so a reload lands there. */
function mirror(): void {
  const doc = frameDocument();
  if (!doc) return;
  replaceUrl(locate());
  written = window.location.href;
  browser?.refresh();
  if (doc.title === document.title) return;
  pageTitle ??= document.title;
  document.title = doc.title;
}

/**
 * Mirror the frame's same-document navigations too. The navigation api's
 * `currententrychange` comes after every url change, `pushState` included,
 * where `navigate` comes before and skips it. Without it, wrap the frame's
 * history. Both go with the frame's window on its next load.
 */
function watch(view: Window, doc: Document): void {
  const navigation = reload.navigationOf(view);
  if (navigation) {
    navigation.addEventListener("currententrychange", mirror);
  } else {
    const history = view.history;
    const push = history.pushState;
    const replace = history.replaceState;
    history.pushState = (...args: Parameters<History["pushState"]>) => {
      push.apply(history, args);
      mirror();
    };
    history.replaceState = (...args: Parameters<History["replaceState"]>) => {
      replace.apply(history, args);
      mirror();
    };
    view.addEventListener("popstate", mirror);
    view.addEventListener("hashchange", mirror);
  }
  titleObserver ??= new MutationObserver(mirror);
  titleObserver.disconnect();
  titleObserver.observe(doc.head ?? doc.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
  });
}

function onLoad(): void {
  loaded = true;
  const doc = frameDocument();
  if (notice) notice.hidden = doc !== null;
  locate();
  const view = frameWindow();
  if (view && doc) {
    watch(view, doc);
    mirror();
    // A page the watch missed: the next one is patched still.
    reload.land(view);
  }
  browser?.refresh();
  checkZoom();
  share();
  reload.settle();
}

/** A page that mounts late asks for the knobs once it listens. */
function onMessage(event: MessageEvent): void {
  if (readMessage(event, frameWindow(), window.location.origin)?.type === "ready") share();
}

/**
 * Does the browser hand a frame element's `color-scheme` to the page inside
 * as its `prefers-color-scheme`? css color adjust says it should (csswg #7493,
 * chrome 129, firefox 105). Asked once, of a blank probe frame that takes each
 * scheme in turn, so a dark system cannot pass for support.
 */
let schemeHandover: boolean | null = null;

function handsSchemeDown(root: Node): boolean {
  if (schemeHandover !== null) return schemeHandover;
  if (!root.isConnected) return false;
  const probe = document.createElement("iframe");
  probe.style.cssText = "position:absolute;width:0;height:0;border:0;visibility:hidden";
  root.appendChild(probe);
  const ask = (scheme: "light" | "dark"): boolean => {
    probe.style.colorScheme = scheme;
    // The frame only sees the scheme once the style above it is current.
    getComputedStyle(probe).getPropertyValue("color-scheme");
    return probe.contentWindow?.matchMedia(`(prefers-color-scheme: ${scheme})`).matches === true;
  };
  try {
    schemeHandover = ask("dark") && ask("light");
  } catch {
    schemeHandover = false;
  }
  probe.remove();
  return schemeHandover;
}

/**
 * Zoom on a frame multiplies the device pixel ratio of the page inside it
 * (csswg #9644, chromium since 2024), with the frame's css size unchanged.
 * False once a browser is seen not to, so its zoom never stretches a viewport.
 */
let zoomWorks = true;

function zoomFor(dpr: DprValue): number {
  if (!zoomWorks || typeof dpr !== "number" || !(window.devicePixelRatio > 0)) return 1;
  return dpr / window.devicePixelRatio;
}

/** Did the page inside get the ratio? If not, drop the zoom for good. */
function checkZoom(): void {
  const view = frameWindow();
  if (!frame || !view || !loaded || zoomFor(current.dpr) === 1) return;
  // The ratio inside follows the zoom once the layout above it is current.
  frame.getBoundingClientRect();
  try {
    if (Math.abs(view.devicePixelRatio - Number(current.dpr)) < 0.01) return;
  } catch {
    return;
  }
  zoomWorks = false;
  resize();
}

/** The zoom control: fit and what it comes to, the presets, and a zoom of the wheel's own. */
function showZoom(place: Fit): void {
  if (!picker) return;
  const zoom = current.zoom;
  const known = zoom === "fit" || ZOOM_PRESETS.includes(zoom);
  const scales = known ? ZOOM_PRESETS : [...ZOOM_PRESETS, zoom].sort((a, b) => a - b);
  const options: [string, string][] = [
    ["fit", `fit ${percent(place.fit)}`],
    ...scales.map((scale): [string, string] => [String(scale), percent(scale)]),
  ];
  const key = options.join("|");
  if (key !== pickerKey) {
    pickerKey = key;
    picker.replaceChildren(
      ...options.map(([value, text]) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = text;
        return option;
      }),
    );
  }
  picker.value = String(zoom);
}

/** How much of its edge an open panel covers. Its host is as wide as the panel out. */
function panelWidth(): number {
  return document.querySelector<HTMLElement>('[data-devknobs="panel"]')?.offsetWidth ?? 0;
}

/** Draw the mock around the frame, at the zoom the frame is at, or take it away. */
function showMock(mock: Mock | null, place: Fit): void {
  if (!screen || !glass) return;
  const href = mock?.image ? bezelUrl(mock.image.file) : null;
  const key = mock ? `${current.device}|${current.orientation}|${mock.image?.file}|${href}` : "";
  if (key !== mockKey) {
    mockKey = key;
    mockDrawing?.remove();
    mockDrawing = mock ? drawMock(mock, place, href) : null;
    if (mockDrawing) screen.append(mockDrawing);
    glass.className = mock ? "glass mocked" : "glass";
  }
  const zoom = place.zoom;
  glass.style.left = mock ? `${mock.inset.left * zoom}px` : "";
  glass.style.top = mock ? `${mock.inset.top * zoom}px` : "";
  const round = mock ? corners(mock.screenRadius).map((radius) => `${radius * zoom}px`) : [];
  glass.style.borderRadius = round.join(" ");
  glass.style.boxShadow = href ? `0 0 0 ${UNDER * zoom}px #000` : "";
  if (mock && mockDrawing) {
    mockDrawing.style.width = `${mock.width * zoom}px`;
    mockDrawing.style.height = `${mock.height * zoom}px`;
  }
}

/**
 * Put the frame where the phone's browser leaves the page in the screen, and
 * draw the browser around it, or fill the screen with the frame again.
 */
function showBrowser(
  bars: ReturnType<typeof barsOf>,
  page: Rect | null,
  place: Fit,
  follow: boolean,
): void {
  if (!glass || !pageBox || !browser) return;
  const zoom = place.zoom;
  const box = pageBox;
  const sizeFrame = () => {
    if (!frame) return;
    frame.style.width = `${page?.width ?? place.width}px`;
    frame.style.height = `${page?.height ?? place.height}px`;
    box.className = page ? "page placed" : "page";
    box.style.left = page ? `${page.x * zoom}px` : "";
    box.style.top = page ? `${page.y * zoom}px` : "";
  };
  glass.style.width = page ? `${place.width * zoom}px` : "";
  glass.style.height = page ? `${place.height * zoom}px` : "";
  browser.show({ bars, page, size: place, zoom, follow, sizeFrame });
  browser.refresh();
}

/**
 * Draw the mat for the letterbox's size, its lines one device pixel thin, and
 * its top ruler unnumbered under the readout.
 */
function showMat(size: { width: number; height: number }): void {
  if (!letterbox || !readout || !caption || !picker) return;
  const hair = Math.max(0.5, 1 / (window.devicePixelRatio || 1));
  const avoid = readout.hidden
    ? undefined
    : { from: caption.offsetLeft - 8, to: picker.offsetLeft + picker.offsetWidth + 8 };
  const key = `${size.width}|${size.height}|${hair}|${avoid?.from}|${avoid?.to}`;
  if (key === matKey) return;
  matKey = key;
  const next = drawMat(size, hair, avoid);
  if (mat) mat.replaceWith(next);
  else letterbox.prepend(next);
  mat = next;
}

/**
 * The body around the frame: the maker's bezel image where the device has
 * one, and the drawn mock where it has none or the image does not load. While
 * the image loads the drawn mock stands in its room, so the frame never moves
 * as it comes in.
 */
function bodyOf(value: ViewportValue): Mock | null {
  if (!value.mock) return null;
  const drawn = mockOf(value.device, value.orientation);
  const bezel = bezelMock(value.device, value.orientation);
  if (!bezel?.image) return drawn;
  const state = loadBezel(bezel.image.file, resize);
  if (state === "ready") return bezel;
  return state === "loading" && drawn ? placeIn(drawn, bezel) : drawn;
}

function resize(): void {
  if (!frame || !letterbox || !stage || !drawing || !screen || !readout || !caption) return;
  readout.hidden = !hasStrip(current);
  letterbox.setAttribute("data-mat", current.mat);
  const size = { width: letterbox.clientWidth, height: letterbox.clientHeight };
  const aside = current.panel.open ? panelWidth() : 0;
  const mock = bodyOf(current);
  const place = fit(current, size, {
    frameZoom: zoomFor(current.dpr),
    aside,
    side: current.panel.side,
    mock: mock?.inset,
  });
  drawn = place;
  const device = deviceOf(current.device);
  const layout = device ? layoutOf(device.id, current.browser) : null;
  const auto = current.bars === "auto";
  const min = current.bars === "minimized" || (auto && browser?.minimized() === true);
  const edge = current.edgeToEdge;
  const bars = device ? barsOf(device, current.orientation, layout, min, edge) : null;
  const page = bars && device ? viewportOf(device, current.orientation, layout, min, edge) : null;
  const knobs = { ...current, dpr: zoomWorks ? current.dpr : "system" };
  caption.textContent = label(place, knobs, page ?? place);
  showZoom(place);
  showMat(size);
  // A fitted frame never scrolls, so no rounding can bring a scrollbar.
  stage.style.overflow = current.zoom === "fit" ? "hidden" : "";
  frame.style.zoom = place.zoom === 1 ? "" : String(place.zoom);
  showBrowser(bars, page, place, auto);
  drawing.style.width = `${place.box.width}px`;
  drawing.style.height = `${place.box.height}px`;
  // The wrapper starts at the mock's corner, and the frame sits in it by as much.
  screen.style.left = `${place.left - (mock?.inset.left ?? 0) * place.scale}px`;
  screen.style.top = `${place.top - (mock?.inset.top ?? 0) * place.scale}px`;
  showMock(mock, place);
  screen.style.transform = place.transform === 1 ? "" : `scale(${place.transform})`;
  // Natively, the page inside gets the scheme as its real preference. System
  // leaves the frame to follow the window.
  const native = current.scheme !== "system" && handsSchemeDown(frame.getRootNode());
  if (native) frame.style.colorScheme = current.scheme;
  else frame.style.removeProperty("color-scheme");
  frame.style.filter = visionFilter(current.vision);
  checkZoom();
}

/**
 * Draw the frame at the zoom it has now, and scroll the letterbox so the point
 * of the frame at `pointer`, in the stage's visible area, stays put.
 */
function rezoom(pointer: Point): void {
  const view = stage;
  if (!view || !drawn) {
    resize();
    return;
  }
  const room = () => ({ width: view.clientWidth, height: view.clientHeight });
  const scrolled = { x: view.scrollLeft, y: view.scrollTop };
  const before = { origin: origin(drawn, room()), scale: drawn.scale };
  resize();
  const after = { origin: origin(drawn, room()), scale: drawn.scale };
  const to = anchorScroll(pointer, scrolled, before, after);
  view.scrollLeft = to.x;
  view.scrollTop = to.y;
}

/** Put a zoom in the store, which draws it. A zoom the wheel still holds gives way. */
function setZoom(zoom: ZoomValue): void {
  clearTimeout(settling);
  held = null;
  zoomTo?.(zoom);
}

/**
 * Ctrl or meta with the wheel, and a trackpad pinch, which sends the same,
 * zoom around the pointer. The drawing follows each event, and the store
 * hears once the wheel rests. A plain wheel scrolls, here and in the frame.
 */
function onWheel(event: WheelEvent): void {
  if ((!event.ctrlKey && !event.metaKey) || !stage || !drawn) return;
  event.preventDefault();
  const delta = event.deltaMode === 0 ? event.deltaY : event.deltaY * WHEEL_LINE;
  const zoom = wheelZoom(drawn.scale, delta);
  if (zoom === drawn.scale) return;
  held = zoom;
  current = { ...current, zoom };
  const rect = stage.getBoundingClientRect();
  rezoom({
    x: Math.min(Math.max(event.clientX - rect.left, 0), stage.clientWidth),
    y: Math.min(Math.max(event.clientY - rect.top, 0), stage.clientHeight),
  });
  clearTimeout(settling);
  settling = window.setTimeout(() => setZoom(zoom), ZOOM_SETTLE);
}

function onPick(): void {
  if (picker) setZoom(picker.value === "fit" ? "fit" : Number(picker.value));
}

/**
 * A zoom key: a step in or out from the scale the frame is drawn at, or back
 * to fit. False while there is no frame, so the key zooms the browser.
 */
export function zoomKey(action: ZoomAction): boolean {
  if (!host || !drawn) return false;
  setZoom(action === "zoom-fit" ? "fit" : stepZoom(drawn.scale, action === "zoom-in" ? 1 : -1));
  return true;
}

/**
 * Cover the window with a frame that loads this page at the knob's width. The
 * page underneath stops scrolling and takes no input until the frame goes.
 */
function open(): void {
  const body = document.body;
  if (host || !needsFrame(current) || !body) return;
  host = document.createElement("div");
  host.setAttribute("data-devknobs", "viewport");
  host.style.cssText = `position:fixed;inset:0;z-index:${Z_INDEX}`;
  const root = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = CSS;
  letterbox = document.createElement("div");
  letterbox.className = "viewport";
  readout = document.createElement("div");
  readout.className = "size";
  caption = document.createElement("span");
  picker = document.createElement("select");
  picker.className = "zoom";
  picker.setAttribute("aria-label", "zoom");
  picker.addEventListener("change", onPick);
  readout.append(caption, picker);
  stage = document.createElement("div");
  stage.className = "stage";
  drawing = document.createElement("div");
  drawing.className = "drawing";
  screen = document.createElement("div");
  screen.className = "screen";
  glass = document.createElement("div");
  glass.className = "glass";
  frame = document.createElement("iframe");
  frame.setAttribute(FRAME_ATTRIBUTE, "");
  frame.name = FRAME_NAME;
  frame.title = "devknobs viewport";
  frame.setAttribute("sandbox", SANDBOX);
  frameUrl = window.location.href;
  pageUrl = frameUrl;
  written = frameUrl;
  scroll = { x: window.scrollX, y: window.scrollY };
  pageTitle = null;
  loaded = false;
  frame.src = frameUrl;
  frame.addEventListener("load", onLoad);
  reload.track({ view: frameWindow, page: frameDocument, loaded: () => loaded });
  notice = createNotice();
  pageBox = document.createElement("div");
  pageBox.className = "page";
  pageBox.append(frame);
  glass.append(pageBox);
  // The page's scroll minimizing or bringing back the bars resizes the frame.
  browser = createBrowser(glass, frame, resize);
  screen.append(glass);
  drawing.append(screen);
  stage.append(drawing);
  letterbox.append(readout, stage, notice);
  letterbox.addEventListener("wheel", onWheel, { passive: false });
  root.append(style, letterbox);
  cover(body);
  // Popovers paint in the top layer, over the frame, wherever they sit.
  ensureStyle(NAME).textContent =
    "html{overflow:hidden!important}:popover-open:not([data-devknobs]){display:none!important}";
  window.addEventListener("message", onMessage);
  window.addEventListener("resize", resize);
  body.append(host);
  // The first page takes over the blank window the frame starts with, patches
  // and all, and it starts no sooner than this task ends, after the knobs.
  queueMicrotask(() => {
    const view = frameWindow();
    if (view && !loaded) reload.arrive(view);
  });
  // Before the frame's page starts, which is no sooner than this task ends.
  resize();
  // The panel comes up after the frame, and is measured for the fit once it is there.
  window.requestAnimationFrame(resize);
}

/** Take the frame away. `follow` brings the window to where the frame went. */
function close(follow: boolean): void {
  current = { ...current, ...UNFRAMED };
  document.removeEventListener("DOMContentLoaded", open);
  if (!host) return;
  // The window went back to another entry meanwhile. It stays there, and the
  // frame is not followed.
  const moved = window.location.href !== written;
  const target = follow && !moved ? locate() : "";
  window.removeEventListener("message", onMessage);
  window.removeEventListener("resize", resize);
  frame?.removeEventListener("load", onLoad);
  titleObserver?.disconnect();
  reload.untrack();
  // The window shows its own page again, so its own address and title too.
  if (!moved) replaceUrl(pageUrl);
  if (pageTitle !== null) document.title = pageTitle;
  pageTitle = null;
  host.remove();
  host = null;
  letterbox = null;
  mat = null;
  matKey = "";
  stage = null;
  drawing = null;
  screen = null;
  glass = null;
  pageBox = null;
  browser?.remove();
  browser = null;
  mockDrawing = null;
  mockKey = "";
  frame = null;
  notice = null;
  readout = null;
  caption = null;
  picker = null;
  pickerKey = "";
  drawn = null;
  clearTimeout(settling);
  held = null;
  uncover();
  removeStyle(NAME);
  // Hidden, the page had no height to keep its scroll position in.
  if (target && target !== window.location.href) window.location.assign(target);
  else window.scrollTo({ left: scroll.x, top: scroll.y, behavior: "instant" });
}

export function apply(value: ViewportValue): void {
  if (!needsFrame(value)) {
    close(true);
    return;
  }
  const zoom = current.zoom;
  // A zoom the wheel holds stays until it is in the store.
  current = held === null ? value : { ...value, zoom: held };
  if (!host) {
    if (document.body) open();
    else document.addEventListener("DOMContentLoaded", open, { once: true });
  } else if (stage && current.zoom !== zoom) {
    // A new zoom from elsewhere keeps the middle of the letterbox where it is.
    rezoom({ x: stage.clientWidth / 2, y: stage.clientHeight / 2 });
  } else resize();
}

/** Take the frame away and leave the window where it is. */
export function reset(): void {
  close(false);
}
