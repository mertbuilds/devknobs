import type { DevknobsState, DprValue, SideValue, ZoomValue } from "../types";
import { hushOnce } from "../requests/quiet";
import * as address from "./address";
import { bezelMock, bezelUrl, bodyOf, loadBezel } from "./bezels";
import { type BrowserLayer, createBrowser, readLook } from "./browserdraw";
import { barsOf, layoutOf, viewportOf } from "./browserui";
import { deviceOf, formId, formOf, hasTouch } from "./devices";
import { columnEdge, type Docked, dockEdges, dockWidth, onDockWidth } from "./dock";
import { type Fit, fit, hasStrip, label, origin } from "./fit";
import { carried, fresh, FRESH_ATTRIBUTE, loads, ownReload } from "./fresh";
import {
  FRAME_ATTRIBUTE,
  FRAME_NAME,
  type FrameKnobs,
  handsSchemeDown,
  needsFrame,
  OUTSIDE_ATTRIBUTE,
  plainFrame,
  post,
  reachable,
  readMessage,
  UNFRAMED,
  type ZoomAction,
} from "./frame";
import { drawMat } from "./mat";
import { landSplash, spreadMat } from "./matsplash";
import { createNotice } from "./notice";
import type { Mock, Rect } from "./mock";
import { getOutside, landOutside, reloadingOutside } from "./outside";
import { corners, drawMock, UNDER } from "./mockdraw";
import { drawnAt, glideFrame, landGlide, placeKey } from "./frameglide";
import {
  finishFold,
  foldableShown,
  type FoldScene,
  folding,
  foldDevice as foldIn,
  forgetFold,
  holdFold,
} from "./foldrun";
import { hingeMoved } from "./foldtune";
import { folds, type Hole, moves, readCorners, shapeOf, turnOf, windowRect } from "./morph";
import {
  forget,
  halt,
  openVeiled,
  running,
  type Scene,
  snap,
  start,
  still,
  veilShare,
} from "./morphrun";
import {
  adoptEarly,
  clearSnapshot,
  dropEarly,
  keepDrawing,
  readSnapshot,
  snapshotKey,
  stopAdopting,
  Z_INDEX,
} from "./placeholder";
import { warmFonts } from "./pagefonts";
import * as reload from "./reload";
import * as scrollkeep from "./scrollkeep";
import { ensureStyle, removeStyle } from "./style";
import { createTouchDot, type TouchDot } from "./touchdot";
import {
  finishTurn,
  forgetTurn,
  holdTurn,
  type TurnScene,
  turnDevice as turnIn,
  turning,
} from "./turnrun";
import { cover, uncover } from "./underneath";
import { VIEWPORT_CSS } from "./viewportcss";
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
    | "posture"
    | "mock"
    | "browser"
    | "bars"
    | "edgeToEdge"
    | "zoom"
    | "mat"
  > & {
    panel: Docked;
  };

/**
 * How long a frame of a pinned column's glide may take, in ms, before the page
 * is too slow to follow it: two such frames in a row, and the page takes its
 * final width at once.
 */
export const RIDE_SLOW = 50;

/** How long a wheel or a pinch rests before its zoom goes in the store, in ms. */
const ZOOM_SETTLE = 200;

/** The pixels a wheel line stands for, where a wheel counts in lines. */
const WHEEL_LINE = 20;

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
 * What an outside page gets: enough for a site to run as it does in a tab of
 * its own, and nothing that lets it navigate the window above, a click
 * included, as it is on another origin and its links are not the window's.
 */
const OUTSIDE_SANDBOX = [
  "allow-scripts",
  "allow-same-origin",
  "allow-forms",
  "allow-popups",
  "allow-popups-to-escape-sandbox",
].join(" ");

/** What the screen says for an outside page the host says refuses to be framed. */
const REFUSED = "this site does not allow being shown inside another page";

/** The size of that text, in the device's css px. */
const REFUSED_SIZE = 15;

let host: HTMLElement | null = null;
/** The mat around the frame, readout strip included, which the frame is fitted to. */
let letterbox: HTMLElement | null = null;
/** The mat's paint, its grid and rulers in it, under the strip and the stage. */
let back: HTMLElement | null = null;
/** Hides the window's own page in its color while a device comes or goes. */
let veil: HTMLElement | null = null;
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
/** The touch cursor over the page and the bars, while the device has a touch screen. */
let touchDot: TouchDot | null = null;
/** Covers the screen in the page's color while a device that turns lays it out the other way. */
let turnCover: HTMLElement | null = null;
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
/** Says so on the device's screen, over the frame, for an outside page that refuses to be framed. */
let refusal: HTMLElement | null = null;
/** The outside page the frame was last pointed at, or null for the window's own. */
let there: string | null = null;
/** That page was put there as one that refuses to be framed. */
let denied = false;
/** Turns every knob that keeps the frame up off. The engine hands it in. */
let exit: (() => void) | null = null;
/** Puts the window's own page back in the frame. The engine hands it in. */
let own: (() => void) | null = null;
let current: ViewportValue = {
  ...UNFRAMED,
  scheme: "system",
  device: "none",
  orientation: "portrait",
  posture: "closed",
  mock: true,
  browser: "auto",
  bars: "auto",
  edgeToEdge: true,
  zoom: "fit",
  mat: "blue",
  panel: { open: false, side: "right", docked: false },
};
/** The frame's page has loaded, so what it reports can be trusted. */
let loaded = false;
/** Where the frame was last seen on this origin. */
let frameUrl = "";
/** Where the page underneath was scrolled to, which hiding it loses. */
let scroll = { x: 0, y: 0 };
let latest: DevknobsState | null = null;
/** Where the frame is drawn, or on its way to, from `shapeOf`. */
let heading = "closed";
/** The knobs were applied once, so what comes next is a change, not the first paint. */
let settled = false;
/** The knobs a device change draws once the last device faded out. */
let pending: ViewportValue | null = null;
/** The window's own page is hidden under the frame. */
let covered = false;
/** The window has its own page back, and the frame is only fading off it. */
let released = false;

/** The window inside the frame, while there is one. */
export function frameWindow(): Window | null {
  return frame && reachable(frame) ? frame.contentWindow : null;
}

function share(): void {
  if (latest) post(frameWindow(), { source: "devknobs", type: "state", state: latest });
}

/**
 * Does the frame's screen take the mouse as a finger? Not once the window has
 * its own page back, and not over an outside page, which has no copy to say
 * where the pointer is on it.
 */
function touching(): boolean {
  return (
    latest !== null && !released && there === null && hasTouch(latest.device) && latest.touchPointer
  );
}

/** Keep the knobs and hand them to the frame, which applies them to its own page. */
export function sync(state: DevknobsState): void {
  latest = state;
  touchDot?.apply(touching());
  share();
  reload.knobs(state);
}

/** Where the frame is now. A frame that left the origin keeps the last place seen. */
function locate(): string {
  if (!frame || !reachable(frame)) return frameUrl;
  try {
    const href = frame.contentWindow?.location.href;
    if (href && href !== "about:blank") frameUrl = href;
  } catch {
    // Another origin: the frame cannot be followed there.
  }
  return frameUrl;
}

export function onExit(handler: (() => void) | null): void {
  exit = handler;
}

export function onOwn(handler: (() => void) | null): void {
  own = handler;
}

export function onZoom(handler: ((zoom: ZoomValue) => void) | null): void {
  zoomTo = handler;
}

/** The page in the frame, or null once it is on another origin, or an error page. */
function frameDocument(): Document | null {
  if (!frame || !reachable(frame)) return null;
  try {
    return frame.contentDocument;
  } catch {
    return null;
  }
}

/** The fonts of a foldable's page are fetched ahead, for the picture of it that turns as it folds. */
function warmFold(): void {
  const doc = frameDocument();
  if (doc && deviceOf(current.device)?.postures) warmFonts(doc);
}

function onLoad(): void {
  loaded = true;
  // The window's own page is back in the frame, and can be read again.
  if (there === null) frame?.removeAttribute(OUTSIDE_ATTRIBUTE);
  else if (!denied) landOutside();
  const doc = frameDocument();
  // An outside page is out of reach as it should be, which is nothing to say.
  if (notice) notice.hidden = doc !== null || there !== null;
  locate();
  const view = frameWindow();
  if (view && doc) {
    address.watch(view, doc);
    address.mirror();
    // A page the watch missed: the next one is patched still.
    reload.land(view);
  }
  browser?.refresh();
  checkZoom();
  warmFold();
  share();
  reload.settle();
}

/** A page that mounts late asks for the knobs once it listens. */
function onMessage(event: MessageEvent): void {
  if (readMessage(event, frameWindow(), window.location.origin)?.type === "ready") share();
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

/**
 * How much of its edge an open panel covers. Its host is as wide as the panel
 * out, and takes a new width at once where the panel glides to it.
 */
function panelWidth(): number {
  return document.querySelector<HTMLElement>('[data-devknobs="panel"]')?.offsetWidth ?? 0;
}

/**
 * How much of the mat an open panel lies over, which a frame of a set width
 * is fitted beside. A pinned one lies over none of it: the room it takes is
 * not the frame's to begin with.
 */
function asideOf(panel: Docked): number {
  return panel.open && !panel.docked ? panelWidth() : 0;
}

/** The px a pinned panel's column takes from the page on each side, as the frame is drawn. */
let room: Record<SideValue, number> = { left: 0, right: 0 };
/** The frame in which the stage takes the width of a column under the strip. */
let following = 0;

/** The page following a pinned column that slides or glides, frame by frame. */
interface Ride {
  /** The room the page had as the column set off. */
  from: Record<SideValue, number>;
  /** What the column covered as it set off across the window, null until it is read. */
  start: number | null;
  /** The next frame it follows in. */
  frame: number;
  /** When the last frame came, null before the first, and how many in a row came late. */
  seen: number | null;
  slow: number;
}

let ride: Ride | null = null;

/** Stop following the column. The room is the one it ends at from the next draw. */
function endRide(): void {
  if (ride?.frame) window.cancelAnimationFrame(ride.frame);
  ride = null;
}

/**
 * Keep the stage clear of a pinned panel's column, as wide as `dockWidth`
 * says the panel is, or as far as the column has got while it is followed.
 * The mat still lies under it, so no edge of it shows as it slides. The
 * notice keeps to the stage as well.
 */
function makeRoom(): void {
  if (!letterbox) return;
  // The letterbox is as wide as the window, the room the column takes included.
  if (!ride) room = dockEdges(current.panel, letterbox.clientWidth, dockWidth());
  for (const box of [letterbox, notice]) {
    if (!box) continue;
    box.style.paddingLeft = room.left ? `${room.left}px` : "";
    box.style.paddingRight = room.right ? `${room.right}px` : "";
  }
}

/**
 * The room for a column on `side` that covers `cover` px of the window on its
 * way to `to`, in whole px. On the side it was on, the page's edge is the
 * column's. From the other side the column crosses over the page, which
 * slides across as far as the column has come, as wide as it was.
 */
function rideRoom(now: Ride, side: SideValue, to: number, cover: number): Record<SideValue, number> {
  const other = side === "left" ? "right" : "left";
  const from = now.from[side];
  let mine = Math.min(Math.max(cover, Math.min(from, to)), Math.max(from, to));
  let theirs = 0;
  if (now.from[other] > 0) {
    now.start ??= cover;
    const way = now.start - to;
    const share = way === 0 ? 1 : Math.min(Math.max((now.start - cover) / way, 0), 1);
    mine = from + (to - from) * share;
    theirs = now.from[other] * (1 - share);
  }
  mine = Math.round(mine);
  theirs = Math.round(theirs);
  return side === "left" ? { left: mine, right: theirs } : { left: theirs, right: mine };
}

/**
 * A frame of the column's way: the page takes the room the column leaves
 * where it shows now, once. The column at rest, or gone, ends it, and so does
 * a page too slow to keep up, and the page takes the room it ends at.
 */
function step(time: number): void {
  const now = ride;
  if (!now) return;
  now.frame = 0;
  now.slow = now.seen !== null && time - now.seen > RIDE_SLOW ? now.slow + 1 : 0;
  now.seen = time;
  const side = current.panel.side;
  const edge = letterbox && !released && now.slow < 2 ? columnEdge(side) : null;
  if (!letterbox || !edge?.moving) {
    endRide();
    resize();
    return;
  }
  const to = dockEdges(current.panel, letterbox.clientWidth, dockWidth())[side];
  room = rideRoom(now, side, to, edge.cover);
  resize();
  now.frame = window.requestAnimationFrame(step);
}

/**
 * The room a pinned column takes changes as `draw` draws it, and the column
 * slides or glides there: opening, closing, crossing to the other side, or
 * gliding to a new width. The page keeps its room for now and follows the
 * column's edge from the next frame, so it is laid out as the column moves,
 * as under the strip. With less motion the column jumps, and the page is
 * resized once. Nothing waits where the room stays as it is.
 */
function follow(draw: () => void): void {
  if (still() || !letterbox) {
    endRide();
    draw();
    return;
  }
  ride = { from: { ...room }, start: null, frame: ride?.frame ?? 0, seen: null, slow: 0 };
  draw();
  const to = dockEdges(current.panel, letterbox.clientWidth, dockWidth());
  if (to.left === room.left && to.right === room.right) endRide();
  else ride.frame ||= window.requestAnimationFrame(step);
}

/**
 * The panel got wider or narrower. A pinned one's column takes that room in
 * the next frame, and once a frame however often its width changes, so the
 * page follows its edge as it is dragged and is laid out no more than it is
 * painted.
 */
function followSoon(): void {
  if (!host || !current.panel.docked) return;
  following ||= window.requestAnimationFrame(() => {
    following = 0;
    resize();
  });
}

onDockWidth(followSoon);

/** The room the frame is fitted to: the letterbox less what the column takes. */
function stageSize(): { width: number; height: number } {
  const width = (letterbox?.clientWidth ?? 0) - room.left - room.right;
  return { width: Math.max(0, width), height: letterbox?.clientHeight ?? 0 };
}

/**
 * The panel changed its width, and with `glide` it glides to it. A floating
 * panel's frame is fitted beside it again, and glides to its place as the
 * panel does. A pinned panel's column is followed either way: under the
 * strip as `followSoon` says, which a glide still on its way gives way to,
 * and as it glides, by its edge, frame by frame. A device is fitted in the
 * room each frame, with no glide of its own.
 */
export function panelSized(glide: boolean): void {
  const pinned = current.panel.docked;
  if (!glide) {
    if (!pinned) resize();
    else if (ride) {
      endRide();
      followSoon();
    }
    return;
  }
  if (following) window.cancelAnimationFrame(following);
  following = 0;
  if (pinned) follow(resize);
  else glideFrame(screen, { first: false, from: current.panel, to: current.panel, sized: true }, resize);
}

/** Draw the mock around the frame, at the zoom the frame is at, or take it away. */
function showMock(mock: Mock | null, place: Fit): void {
  if (!screen || !glass) return;
  const href = mock?.image ? bezelUrl(mock.image.file) : null;
  const id = formId(current.device, current.posture);
  const key = mock ? `${id}|${current.orientation}|${mock.image?.file}|${href}` : "";
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
  showRefusal();
}

/**
 * Draw the mat for the stage's size, its lines one device pixel thin, and
 * its top ruler unnumbered under the readout. Its grid runs on under a
 * pinned panel's column, and its rulers count from the stage's edge.
 */
function showMat(size: { width: number; height: number }): void {
  if (!letterbox || !readout || !caption || !picker) return;
  const hair = Math.max(0.5, 1 / (window.devicePixelRatio || 1));
  const avoid = readout.hidden
    ? undefined
    : { from: caption.offsetLeft - 8, to: picker.offsetLeft + picker.offsetWidth + 8 };
  const key = `${size.width}|${size.height}|${hair}|${avoid?.from}|${avoid?.to}|${room.left}|${room.right}`;
  if (key === matKey) return;
  matKey = key;
  const next = drawMat(size, hair, avoid, room);
  if (mat) mat.replaceWith(next);
  else back?.append(next);
  mat = next;
}

/** The body around the frame for `value`, which draws the frame again once its picture is in. */
function bodyFor(value: ViewportValue): Mock | null {
  return bodyOf(value, resize);
}

function resize(): void {
  if (!frame || !letterbox || !stage || !drawing || !screen || !readout || !caption) return;
  // The window has its own page back: the frame stays as it was until it goes.
  // A device turning is drawn the way it ends up once it is there.
  if (released || turning() || folding()) return;
  readout.hidden = !hasStrip(current);
  letterbox.setAttribute("data-mat", current.mat);
  makeRoom();
  const size = stageSize();
  const aside = asideOf(current.panel);
  const mock = bodyFor(current);
  const place = fit(current, size, {
    frameZoom: zoomFor(current.dpr),
    aside,
    side: current.panel.side,
    mock: mock?.inset,
  });
  drawn = place;
  drawnAt(placeKey(origin(place, size), place.transform));
  const device = formOf(current.device, current.posture);
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
  if (refusal) refusal.style.fontSize = `${REFUSED_SIZE * place.zoom}px`;
  // Natively, the page inside gets the scheme as its real preference. System
  // leaves the frame to follow the window. Set before the bars are drawn,
  // which follow it at once around an outside page.
  const native = current.scheme !== "system" && handsSchemeDown(frame.getRootNode());
  if (native) frame.style.colorScheme = current.scheme;
  else frame.style.removeProperty("color-scheme");
  showBrowser(bars, page, place, auto);
  touchDot?.fit(place, place.zoom);
  drawing.style.width = `${place.box.width}px`;
  drawing.style.height = `${place.box.height}px`;
  // The wrapper starts at the mock's corner, and the frame sits in it by as much.
  screen.style.left = `${place.left - (mock?.inset.left ?? 0) * place.scale}px`;
  screen.style.top = `${place.top - (mock?.inset.top ?? 0) * place.scale}px`;
  showMock(mock, place);
  screen.style.transform = place.transform === 1 ? "" : `scale(${place.transform})`;
  frame.style.filter = visionFilter(current.vision);
  checkZoom();
  warmFold();
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
  // The page in a pinned panel's frame is the page: the browser zooms it.
  if ((!event.ctrlKey && !event.metaKey) || !stage || !drawn || plainFrame(current)) return;
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
 * to fit. False while there is no frame, or only a pinned panel's, so the key
 * zooms the browser.
 */
export function zoomKey(action: ZoomAction): boolean {
  if (!host || !drawn || plainFrame(current)) return false;
  setZoom(action === "zoom-fit" ? "fit" : stepZoom(drawn.scale, action === "zoom-in" ? 1 : -1));
  return true;
}

/** Is the frame's page in and ready to paint, with no reload on its way? */
function painted(): boolean {
  if (!loaded || reload.pending()) return false;
  const doc = frameDocument();
  return doc === null || doc.readyState === "complete";
}

/** The mat's opening at the whole window, a px past each edge, square. */
function fullRect(): Hole {
  return windowRect({ width: letterbox?.clientWidth ?? 0, height: letterbox?.clientHeight ?? 0 });
}

/**
 * Where the frame's screen is drawn now, in the letterbox, and how round its
 * corners are there: the screen's own radius, drawn at the wrapper's scale.
 */
function screenRect(): Hole {
  if (!glass || !letterbox) return fullRect();
  const box = letterbox.getBoundingClientRect();
  const rect = glass.getBoundingClientRect();
  const scale = drawn?.transform ?? 1;
  const [a, b, c, d] = readCorners(glass.style.borderRadius);
  return {
    x: rect.left - box.left,
    y: rect.top - box.top,
    width: rect.width,
    height: rect.height,
    radius: [a * scale, b * scale, c * scale, d * scale],
  };
}

/**
 * Where the frame's screen would be drawn for `value`, in the letterbox, as
 * `resize` would place it, without drawing it.
 */
function screenFor(value: ViewportValue): Rect | null {
  if (!letterbox || !stage) return null;
  const mock = bodyFor(value);
  const place = fit(value, stageSize(), {
    frameZoom: zoomFor(value.dpr),
    aside: asideOf(value.panel),
    side: value.panel.side,
    mock: mock?.inset,
  });
  const room = { width: stage.clientWidth, height: stage.clientHeight };
  const at = origin(place, room);
  const box = letterbox.getBoundingClientRect();
  const view = stage.getBoundingClientRect();
  // A box that grows past the room keeps its scroll, as far as it still goes.
  const scrolled = (scroll: number, length: number, room: number) =>
    Math.min(scroll, Math.max(0, length - room));
  return {
    x: view.left - box.left + at.x - scrolled(stage.scrollLeft, place.box.width, room.width),
    y: view.top - box.top + at.y - scrolled(stage.scrollTop, place.box.height, room.height),
    width: place.width * place.scale,
    height: place.height * place.scale,
  };
}

/** What a device turning moves, while there is a frame to turn. */
function turnScene(): TurnScene | null {
  if (!screen || !letterbox || !glass || !frame || !turnCover || !drawn) return null;
  const page = frame;
  return {
    unit: screen,
    letterbox,
    glass,
    frame: page,
    cover: turnCover,
    base: drawn.transform,
    background: () => (browser?.look() ?? readLook(page)).background,
    screenRect,
  };
}

/**
 * Turn the device to be held the way `value` holds it, in view all along,
 * case and page as one, and draw it that way once it is there.
 */
function turnDevice(value: ViewportValue): void {
  touchDot?.rest();
  const angle = turnOf(shapeOf(current), shapeOf(value));
  turnIn(value, angle, angle === 0 ? null : screenFor(value), turnScene(), draw);
}

/** What a foldable folding moves, while there is a frame to fold. */
function foldScene(): FoldScene | null {
  const scene = turnScene();
  if (!scene || !notice) return null;
  const next = notice;
  return {
    ...scene,
    place: (layer) => scene.letterbox.insertBefore(layer, next),
    body: bodyFor,
    screenFor,
  };
}

// The fold's tuning hook asks which foldable is up, and how it is drawn.
foldableShown(() => {
  const scene = deviceOf(current.device)?.postures ? foldScene() : null;
  return scene && { scene, value: current };
});

/** Fold the device to the posture `value` has, in view, and draw it that way once it is there, or, `held`, as a hand moves it. */
export function foldDevice(value: ViewportValue, held = false): boolean {
  landGlide();
  touchDot?.rest();
  return foldIn(current, value, foldScene(), draw, held);
}

/** Hide the window's own page under the frame, its popovers too. */
function hidePage(): void {
  const body = document.body;
  if (covered || !body) return;
  covered = true;
  cover(body);
  // Popovers paint in the top layer, over the frame, wherever they sit.
  ensureStyle(NAME).textContent =
    "html{overflow:hidden!important}:popover-open:not([data-devknobs]){display:none!important}";
}

function showPage(): void {
  if (!covered) return;
  covered = false;
  uncover();
  removeStyle(NAME);
}

/** The case, the page in the frame and the readout, which fade as one. */
function contentNodes(): HTMLElement[] {
  return [readout, stage, notice].filter((node): node is HTMLElement => node !== null);
}

/**
 * The knobs as the frame draws them. A zoom the wheel holds stays until it
 * is in the store, and a frame up for a pinned panel alone is never zoomed.
 */
function drawnOf(value: ViewportValue): ViewportValue {
  if (plainFrame(value)) return { ...value, zoom: "fit" };
  return held === null ? value : { ...value, zoom: held };
}

/** Draw the knobs: a new zoom from elsewhere keeps the middle of the letterbox where it is. */
function draw(value: ViewportValue): void {
  const zoom = current.zoom;
  current = drawnOf(value);
  if (stage && current.zoom !== zoom) rezoom({ x: stage.clientWidth / 2, y: stage.clientHeight / 2 });
  else resize();
  if (typeof DEVKNOBS_TUNE === "undefined" || DEVKNOBS_TUNE) hingeMoved();
}

/** Draw the knobs a device change goes to, once the last device faded out. */
function layout(): void {
  const next = pending;
  pending = null;
  if (next) draw(next);
  else resize();
}

/**
 * Send the window to where the frame went. Only a move that loads a page is
 * marked as devknobs' own: one inside the document has no load to read the mark.
 */
function leave(target: string): void {
  if (loads(target, window.location.href)) ownReload();
  window.location.assign(target);
}

/** A device change hands the window its own page back, or leaves for where the frame went. */
function handBack(): void {
  const target = release(true);
  if (target && target !== window.location.href) {
    halt();
    teardown();
    leave(target);
    return;
  }
  // Under the veil, which then lifts off it.
  showPage();
  window.scrollTo({ left: scroll.x, top: scroll.y, behavior: "instant" });
}

/** What a device change moves and asks of the frame, while there is one. */
function scene(): Scene | null {
  if (!host || !back || !veil) return null;
  return {
    back,
    veil,
    content: contentNodes,
    screenRect,
    fullRect,
    covered: () => covered,
    hidePage,
    painted,
    layout,
    release: handBack,
    teardown,
  };
}

/** Start a device change toward a frame or none, where there is a frame to change. */
function change(target: "open" | "closed"): void {
  const now = scene();
  if (now) start(now, target);
}

/** Keep the frame's drawing for the next page. One on its way somewhere, or scrolled, keeps none. */
function keep(): void {
  landSplash();
  const moving = running() || turning() || folding();
  // A pinned panel's frame is the page, with no drawing to stand in for it.
  const plain = plainFrame(current);
  const away = moving || released || plain || stage?.scrollLeft || stage?.scrollTop;
  if (!letterbox || !frame || !picker || away) {
    clearSnapshot();
    return;
  }
  const shown = browser?.look() ?? readLook(frame);
  // The next page is the window's own, whatever outside page is in the frame now.
  const look = there === null ? shown : { ...shown, host: window.location.host };
  const key = snapshotKey(current, window);
  keepDrawing({ letterbox, zoom: picker.value, key, css: VIEWPORT_CSS, look });
}

/** Is the device's picture still on its way? */
function pictureLoading(): boolean {
  const id = formId(current.device, current.posture);
  const bezel = current.mock ? bezelMock(id, current.orientation) : null;
  return bezel?.image ? loadBezel(bezel.image.file, resize) === "loading" : false;
}

function onReloading(): void {
  // An outside page says nothing but that it loaded, so the screen waits for that.
  if (frame && there !== null && !denied) {
    loaded = false;
    reloadingOutside();
  }
  if (!running()) browser?.startLoading(null);
}

/** Follow the pages of the frame for the reloads, while the window's own page is in it. */
function track(): void {
  reload.track({
    view: frameWindow,
    page: frameDocument,
    loaded: () => loaded,
    reloading: onReloading,
  });
}

/**
 * The screen says so, over the frame, while its outside page refuses to be
 * framed, on the ground and in the ink of the scheme that page is given.
 */
function showRefusal(): void {
  if (!refusal) return;
  refusal.hidden = !denied;
  if (!frame || !denied) return;
  const look = readLook(frame);
  refusal.style.background = look.background;
  refusal.classList.toggle("dark", look.dark);
}

/**
 * Put the page the frame is for in it: an outside page, which nothing reads
 * from then on, or the window's own again. `fresh` is a frame that just came
 * up, with no page in it yet.
 */
function aim(fresh = false): void {
  const { outside, refused } = getOutside();
  if (!frame || released || (!fresh && outside === there && refused === denied)) return;
  const was = there;
  there = outside;
  denied = outside !== null && refused;
  touchDot?.apply(touching());
  if (outside === null) {
    // Its own page again, under the same sandbox as before, read once it has loaded.
    if (!fresh) frame.setAttribute(OUTSIDE_ATTRIBUTE, frameUrl);
    frame.removeAttribute("referrerpolicy");
    frame.setAttribute("sandbox", SANDBOX);
    loaded = false;
    // The frame's page lists its own load. Here it would be a second row for it.
    hushOnce(frameUrl);
    frame.src = frameUrl;
    track();
  } else {
    // The window's own page is let go of while it can still be reached.
    if (was === null && !fresh) {
      address.unwatch();
      reload.untrack();
    }
    frame.setAttribute(OUTSIDE_ATTRIBUTE, outside);
    frame.setAttribute("referrerpolicy", "no-referrer");
    frame.setAttribute("sandbox", OUTSIDE_SANDBOX);
    if (notice) notice.hidden = true;
    // A page that refuses to be framed is never asked for.
    loaded = denied;
    frame.src = denied ? "about:blank" : outside;
  }
  showRefusal();
  if (fresh) return;
  browser?.stopLoading();
  // The bars say where the frame is going at once, over a blank screen until it is there.
  if (!loaded && !running()) browser?.startLoading(readLook(frame));
  else browser?.refresh();
}

/**
 * Cover the window with a frame that loads this page at the knob's width. The
 * page underneath stops scrolling and takes no input until the frame goes.
 * `veiled` brings it up for a device change, nothing of it showing yet and the
 * page still there under a veil that far over it. `first` is a reload's first
 * paint, which shows the page loading in the frame.
 */
function open(veiled: number | null, first: boolean): void {
  const body = document.body;
  if (host || !needsFrame(current) || !body) return;
  host = document.createElement("div");
  host.setAttribute("data-devknobs", "viewport");
  host.style.cssText = `position:fixed;inset:0;z-index:${Z_INDEX}`;
  const root = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = VIEWPORT_CSS;
  letterbox = document.createElement("div");
  letterbox.className = "viewport";
  veil = document.createElement("div");
  veil.className = "veil";
  back = document.createElement("div");
  back.className = "back";
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
  // The page in the frame follows this one's mode, whatever its own address says.
  if (fresh()) frame.setAttribute(FRESH_ATTRIBUTE, "");
  frame.name = FRAME_NAME;
  frame.title = "devknobs viewport";
  frameUrl = window.location.href;
  address.follow({ page: frameDocument, locate, refresh: () => browser?.refresh() });
  scroll = { x: window.scrollX, y: window.scrollY };
  // A frame a knob brings up starts where the page was. One a reload brings up
  // has its own place, kept before the reload.
  if (!first) scrollkeep.keep(window, "frame");
  scrollkeep.follow(frameWindow);
  notice = createNotice(() => exit?.());
  refusal = document.createElement("div");
  refusal.className = "refused";
  refusal.textContent = REFUSED;
  aim(true);
  frame.addEventListener("load", onLoad);
  pageBox = document.createElement("div");
  pageBox.className = "page";
  pageBox.append(frame, refusal);
  glass.append(pageBox);
  // The page's scroll minimizing or bringing back the bars resizes the frame.
  browser = createBrowser(glass, frame, resize, onReloading, painted, () => own?.());
  touchDot = createTouchDot({
    glass,
    frame,
    origin: () => browser?.page() ?? { x: 0, y: 0 },
    moving: () => turning() || folding(),
  });
  touchDot.apply(touching());
  turnCover = document.createElement("div");
  turnCover.className = "screenblank";
  turnCover.hidden = true;
  screen.append(glass);
  drawing.append(screen);
  stage.append(drawing);
  letterbox.append(veil, back, readout, stage, notice);
  letterbox.addEventListener("wheel", onWheel, { passive: false });
  root.append(style, letterbox);
  if (veiled === null) hidePage();
  window.addEventListener("message", onMessage);
  window.addEventListener("resize", resize);
  window.addEventListener("pagehide", keep);
  body.append(host);
  const now = scene();
  if (veiled !== null && now) openVeiled(now, veiled);
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
  if (first) browser.startLoading(readSnapshot(current, window)?.look ?? null);
  adoptEarly(pictureLoading);
}

/** Open the frame once there is a body, as the first paint. */
function openLater(): void {
  open(null, true);
}

/**
 * Hand the window its own page back: its own address and title, and none of
 * the frame's listeners. Returns where the window should go after the frame,
 * or nothing.
 */
function release(follow: boolean): string {
  current = { ...current, ...UNFRAMED };
  released = true;
  // The window went back to another entry meanwhile. It stays there, and the
  // frame is not followed.
  const moved = address.moved();
  const target = follow && !moved ? carried(locate()) : "";
  window.removeEventListener("message", onMessage);
  window.removeEventListener("resize", resize);
  window.removeEventListener("pagehide", keep);
  frame?.removeEventListener("load", onLoad);
  touchDot?.apply(false);
  address.unwatch();
  reload.untrack();
  scrollkeep.follow(null);
  browser?.stopLoading();
  clearSnapshot();
  // The window shows its own page again, so its own address and title too.
  address.giveBack(!moved);
  return target;
}

/** Take the frame away, and show the window's own page. */
function teardown(): void {
  host?.remove();
  host = null;
  letterbox = null;
  back = null;
  veil = null;
  mat = null;
  matKey = "";
  stage = null;
  drawing = null;
  screen = null;
  glass = null;
  pageBox = null;
  browser?.remove();
  browser = null;
  touchDot?.remove();
  touchDot = null;
  turnCover = null;
  mockDrawing = null;
  mockKey = "";
  frame = null;
  notice = null;
  refusal = null;
  there = null;
  denied = false;
  readout = null;
  caption = null;
  picker = null;
  pickerKey = "";
  drawn = null;
  clearTimeout(settling);
  held = null;
  if (following) window.cancelAnimationFrame(following);
  following = 0;
  endRide();
  room = { left: 0, right: 0 };
  pending = null;
  forgetTurn();
  forgetFold();
  forget();
  landSplash();
  released = false;
  stopAdopting();
  dropEarly();
  showPage();
}

/** Take the frame away at once. `follow` brings the window to where the frame went. */
function close(follow: boolean): void {
  document.removeEventListener("DOMContentLoaded", openLater);
  halt();
  if (!host) {
    current = { ...current, ...UNFRAMED };
    dropEarly();
    return;
  }
  if (released) {
    teardown();
    return;
  }
  const target = release(follow);
  teardown();
  // Hidden, the page had no height to keep its scroll position in.
  if (target && target !== window.location.href) leave(target);
  else window.scrollTo({ left: scroll.x, top: scroll.y, behavior: "instant" });
}

export function apply(value: ViewportValue): void {
  aim();
  const shape = shapeOf(value);
  const from = heading;
  heading = shape;
  const first = !settled;
  settled = true;
  const animate = !first && moves(from, shape) && !still();
  // A device that changes, turns or folds is measured where it is drawn.
  if (from !== shape) landGlide();
  // A device turned or folded while it stands does so in view. One on its way changes as any other change.
  const turns = animate && !running() && turnOf(from, shape) !== 0;
  const bends = animate && !running() && folds(from, shape);
  // The mat takes a new color now, also while a device change holds the other knobs back.
  if (host) current = { ...current, mat: value.mat };
  if (letterbox && back) spreadMat({ letterbox, back, paper: mat, screen: screenRect }, value.mat);
  if (folding()) {
    if (from === shape) {
      // The fold goes on, and the frame takes the other knobs once it is there.
      holdFold(value);
      return;
    }
    if (bends) {
      foldDevice(value);
      return;
    }
    finishFold();
  }
  if (turning()) {
    if (from === shape) {
      // The turn goes on, and the frame takes the other knobs once it is there.
      holdTurn(value);
      return;
    }
    if (animate && turnOf(from, shape) !== 0) {
      turnDevice(value);
      return;
    }
    finishTurn();
  }
  /** How far the veil was over a page that a device change was giving back. */
  let veiled = 0;
  if (running()) {
    if (from === shape) {
      // The change goes on, and the frame takes the other knobs as it draws its own.
      if (shape !== "closed") {
        if (pending) pending = value;
        else draw(value);
      }
      return;
    }
    if (released) {
      halt();
      veiled = veilShare();
      teardown();
    } else if (animate) halt();
    else snap(scene());
  }
  if (!needsFrame(value)) {
    if (animate && host && !released) change("closed");
    else close(true);
    return;
  }
  if (!host) {
    current = drawnOf(value);
    if (document.body) open(animate ? veiled : null, first);
    else document.addEventListener("DOMContentLoaded", openLater, { once: true });
    if (animate) change("open");
    return;
  }
  if (turns) {
    turnDevice(value);
    return;
  }
  if (bends) {
    foldDevice(value);
    return;
  }
  if (animate) {
    pending = value;
    change("open");
    return;
  }
  // A pinned panel's page, or the device in its stage, follows the column as
  // it opens, closes or crosses to the other side, and has no glide of its own.
  const at = current.panel;
  if (at.docked && value.panel.docked) {
    if (at.open !== value.panel.open || at.side !== value.panel.side) follow(() => draw(value));
    else draw(value);
    return;
  }
  // Pinned or let go, the column is where it was: the room comes or goes at once.
  endRide();
  if (plainFrame(value) && at.side === value.panel.side) draw(value);
  else glideFrame(screen, { first, from: at, to: value.panel }, () => draw(value));
}

/** Take the frame away and leave the window where it is. */
export function reset(): void {
  close(false);
  heading = "closed";
  settled = false;
}
