import { blurWidths } from "./fold";
import { tune } from "./foldlook";
import type { Rect } from "./mock";

/**
 * An outside page on the screens of a fold's half that turns. It is on
 * another origin, so no picture of it can be taken, and a frame of the same
 * address stands in for each picture instead: one at the open screen's
 * size, one at the folded screen's, loaded ahead and kept while the page is
 * shown on a foldable. A frame moved in the page loads again, so each stays
 * for good in a row of boxes of its own, on a layer over the fold's, and a
 * fold lays those boxes as it lays its own: each takes the place, the
 * transform and the cut of the box of the fold it stands for, every time
 * the fold is drawn. The page so lies flat behind the turned screen as a
 * picture of it does, by the same numbers, and is cut on the same edges.
 * What the fold draws over its pictures goes over the copies too: its
 * shades, the browser's bars, and the turning half's case where the fold
 * draws that as frames.
 *
 * Nothing here reads a copy's window or its document. A copy takes no
 * pointer and no focus, and shows the screen's ground till it has loaded.
 */

/** The boxes a copy's frame is in, outermost first: the fold's place, its model of the render, its dark window, the cut in it, the page laid flat, and the screen as it lies. */
const DEPTH = 6;

/** Where the screen as it lies is among them, which holds the page. */
const STAGE = DEPTH - 1;

/** How wide a blur the browser draws for one of the fold's, as a share of its width: the fold's is how far its px are spread, the browser's how far most of one goes. */
const SIGMA = 0.4;

/** What a box of a copy takes of the box of the fold it stands for. */
const LAID = [
  "position",
  "left",
  "top",
  "right",
  "bottom",
  "inset",
  "width",
  "height",
  "transform",
  "transformOrigin",
  "clipPath",
  "overflow",
  "overflowX",
  "overflowY",
  "borderRadius",
  "opacity",
  "visibility",
] as const;

/** And what a shade over the page takes besides: its dark, and whether it is drawn at all. */
const SHADED = [...LAID, "background", "display"] as const;

/** A box of the fold, the copy's box that stands for it, and whether that one is a shade over the page. */
interface Twin {
  real: HTMLElement;
  twin: HTMLElement;
  shade: boolean;
}

/** How a screen of the half that turns lies, as its panel has it. */
export interface LiveSide {
  /** The way from the hinge to the free edge, as a gradient goes, and where the two are on the screen, in percent. */
  toward: string;
  span: [number, number];
  /** Does the hinge run down the screen, so its ends along it are its top and bottom. */
  across: boolean;
}

/** A shade of the fold that goes over a copy's page too. */
export interface LiveShade {
  /** The fold's own. */
  real: HTMLElement;
  /** Which of the copy's boxes it goes in, counted from the outermost. */
  box: number;
  /** Under what is in that box, not over it. */
  under?: boolean;
  /** Shades inside it, which go with it. */
  parts?: HTMLElement[];
}

/** A live copy of an outside page, for one screen of a foldable. */
export interface LiveCopy {
  /** The copy's frame. Nothing reads its window or its document. */
  frame: HTMLIFrameElement;
  /** The boxes it is in, outermost first. */
  boxes: HTMLElement[];
  /** The screen's ground, all over the screen, under the page. */
  ground: HTMLElement;
  /** Where the page is on the screen, on the ground till the frame has loaded. */
  page: HTMLElement;
  /** Over the page, each blurring what is under it a little more. */
  blurs: HTMLElement[];
  /** The dark at the page's two ends along the hinge. */
  ends: [HTMLElement, HTMLElement];
  /** How the screen lies in the fold it is laid for. */
  side: LiveSide | null;
  /** The boxes of the fold its own stand for, and what else the fold put over its page. */
  twins: Twin[];
  over: HTMLElement[];
  /** Its frame's load event came for the page it shows. */
  loaded: boolean;
}

/** The copies of an outside page on a foldable: the layer they are on, and one for each screen. */
export interface LiveCopies {
  layer: HTMLElement;
  open: LiveCopy;
  closed: LiveCopy;
  /** Over both, the boxes the fold's picture of the turning half's case is put in while it folds, the boxes of the fold they stand for, and that picture. */
  top: HTMLElement[];
  topTwins: Twin[];
  cased: HTMLElement | null;
}

function box(): HTMLElement {
  return document.createElement("div");
}

function fill(node: HTMLElement): HTMLElement {
  node.style.position = "absolute";
  node.style.inset = "0";
  return node;
}

/** A copy shows its page once it has loaded, and the ground till then. */
function showLoaded(copy: LiveCopy, loaded: boolean): void {
  copy.loaded = loaded;
  copy.frame.style.visibility = loaded ? "" : "hidden";
}

function copyOf(frame: HTMLIFrameElement): LiveCopy {
  // Never a place the pointer, the keyboard or a reader goes.
  frame.inert = true;
  frame.setAttribute("inert", "");
  frame.setAttribute("tabindex", "-1");
  frame.setAttribute("aria-hidden", "true");
  frame.style.pointerEvents = "none";
  frame.style.transformOrigin = "0 0";
  const boxes = Array.from({ length: DEPTH }, box);
  boxes.forEach((one, index) => {
    const inside = boxes[index + 1];
    if (inside) one.append(inside);
  });
  const ground = fill(box());
  const page = box();
  page.style.position = "absolute";
  page.style.overflow = "hidden";
  page.append(frame);
  const ends: [HTMLElement, HTMLElement] = [box(), box()];
  for (const end of ends) {
    end.style.position = "absolute";
    end.style.display = "none";
  }
  boxes[STAGE]?.append(ground, page, ...ends);
  const copy: LiveCopy = { frame, boxes, ground, page, blurs: [], ends, side: null, twins: [], over: [], loaded: false };
  showLoaded(copy, false);
  frame.addEventListener("load", () => showLoaded(copy, true));
  return copy;
}

/**
 * Copies of an outside page for a foldable's two screens, in the frames
 * `open` and `closed`, which come as the frame's own does for such a page,
 * on a layer that shows nothing till a fold lays them.
 */
export function liveCopies(open: HTMLIFrameElement, closed: HTMLIFrameElement): LiveCopies {
  const layer = box();
  layer.className = "live";
  const top = [box(), box()];
  top[0]?.append(top[1] as HTMLElement);
  const copies: LiveCopies = { layer, open: copyOf(open), closed: copyOf(closed), top, topTwins: [], cased: null };
  for (const copy of [copies.open, copies.closed]) layer.append(copy.boxes[0] as HTMLElement);
  layer.append(top[0] as HTMLElement);
  restLive(copies);
  return copies;
}

/** Load the page at `outside` in each copy, again where it has it: its place shows the ground till it is in. */
export function loadLive(copies: LiveCopies, outside: string): void {
  for (const copy of [copies.open, copies.closed]) {
    showLoaded(copy, false);
    copy.frame.src = outside;
  }
}

/**
 * Put a copy's page where its screen has it, `page` in the screen's css px,
 * on the screen's `ground`, with the frame's own `zoom`, which gives its
 * page the device's pixels, its `scheme`, or none, and its `filter`.
 */
export function placeLive(copy: LiveCopy, page: Rect, zoom: number, ground: string, scheme: string, filter: string): void {
  const { frame } = copy;
  copy.ground.style.background = ground;
  copy.page.style.background = ground;
  copy.page.style.left = `${page.x}px`;
  copy.page.style.top = `${page.y}px`;
  copy.page.style.width = `${page.width}px`;
  copy.page.style.height = `${page.height}px`;
  frame.style.width = `${page.width}px`;
  frame.style.height = `${page.height}px`;
  frame.style.background = ground;
  // The zoom makes its box bigger by as much, which the scale takes back out.
  frame.style.zoom = zoom === 1 ? "" : String(zoom);
  frame.style.transform = zoom === 1 ? "" : `scale(${1 / zoom})`;
  if (scheme) frame.style.colorScheme = scheme;
  else frame.style.removeProperty("color-scheme");
  frame.style.filter = filter;
}

/** Can the browser blur what is under a box? */
function blursUnder(): boolean {
  if (typeof CSS === "undefined" || typeof CSS.supports !== "function") return false;
  return CSS.supports("backdrop-filter", "blur(1px)") || CSS.supports("-webkit-backdrop-filter", "blur(1px)");
}

/**
 * The page of a copy and the blurs over it, for a panel of the fold to light
 * as it does a picture and its blurrier ones: a box for each of the fold's
 * blurs past the sharp one, which blurs the page under it, and the boxes
 * under it with it, to that blur's width. The panel fades each in from the
 * hinge to the free edge as it does a picture, so the hinge side is as
 * sharp. None where the browser cannot blur what is under a box.
 */
export function liveBlurs(copy: LiveCopy): HTMLElement[] {
  for (const blur of copy.blurs) blur.remove();
  const widths = blursUnder() ? blurWidths() : [];
  copy.blurs = widths.slice(1).map((width, index) => {
    const blur = fill(box());
    // Over the blurs under it, it adds only what they leave of its width.
    const under = index === 0 ? 0 : (widths[index] ?? 0);
    const wide = `blur(${Math.round(SIGMA * Math.sqrt(width * width - under * under) * 100) / 100}px)`;
    blur.style.backdropFilter = wide;
    blur.style.setProperty("-webkit-backdrop-filter", wide);
    // Not at all till the panel says how much.
    blur.style.opacity = "0";
    blur.style.display = "none";
    return blur;
  });
  if (copy.blurs.length > 0) copy.page.after(...copy.blurs);
  return [copy.page, ...copy.blurs];
}

/** Take what a fold laid over a copy's page off it, and its boxes back to where nothing lays them. */
function unlay(copy: LiveCopy): void {
  for (const node of copy.over) node.remove();
  copy.over = [];
  copy.twins = [];
  copy.side = null;
  for (const one of copy.boxes) for (const key of LAID) one.style[key] = "";
  for (const end of copy.ends) end.style.display = "none";
}

/**
 * Lay a copy for a fold: each of its boxes stands for the box of the fold in
 * the same place in `boxes`, none where the fold has none, and takes its
 * place, transform and cut each time the fold is drawn. The copy of the
 * browser's `bars` goes over its page, then the fold's `shades`, each in the
 * box said. The screen lies as `side` has it.
 */
export function layLive(
  copy: LiveCopy,
  side: LiveSide,
  boxes: (HTMLElement | null)[],
  shades: LiveShade[],
  bars: HTMLElement | null,
): void {
  unlay(copy);
  copy.side = side;
  boxes.forEach((real, index) => {
    const twin = copy.boxes[index];
    if (real && twin) copy.twins.push({ real, twin, shade: false });
  });
  if (bars) {
    copy.boxes[STAGE]?.append(bars);
    copy.over.push(bars);
  }
  const shadeOf = (real: HTMLElement): HTMLElement => {
    const twin = box();
    twin.className = real.className;
    copy.twins.push({ real, twin, shade: true });
    return twin;
  };
  for (const { real, box: at, under, parts = [] } of shades) {
    const twin = shadeOf(real);
    twin.append(...parts.map(shadeOf));
    if (under) copy.boxes[at]?.prepend(twin);
    else copy.boxes[at]?.append(twin);
    copy.over.push(twin);
  }
  const [start, end] = copy.ends;
  for (const one of copy.ends) for (const key of ["left", "top", "right", "bottom", "width", "height"] as const) one.style[key] = "";
  const along = side.across ? "width" : "height";
  start.style[along] = end.style[along] = "100%";
  start.style[side.across ? "left" : "top"] = end.style[side.across ? "left" : "top"] = "0";
  start.style[side.across ? "top" : "left"] = "0";
  end.style[side.across ? "bottom" : "right"] = "0";
  start.style.background = `linear-gradient(${side.across ? "to bottom" : "to right"}, #000, transparent)`;
  end.style.background = `linear-gradient(${side.across ? "to top" : "to left"}, #000, transparent)`;
  syncCopy(copy);
}

/**
 * Darken a copy's page toward its two ends along the hinge, where the turned
 * screen reaches past them into the dark, the blur there `wide` css px at
 * the turned screen's free edge, seen `free` of the way from the hinge to
 * the page's: as far in as that blur would reach, by the fold's own number,
 * not at all at the hinge and all of it at the free edge.
 */
export function liveEnds(copy: LiveCopy, wide: number, free: number): void {
  const { side } = copy;
  const reach = Math.round(tune.edgeReach * wide * 100) / 100;
  for (const end of copy.ends) {
    end.style.display = side && reach > 0 ? "" : "none";
    if (!side || !(reach > 0)) continue;
    end.style[side.across ? "height" : "width"] = `${reach}px`;
    const [hinge, edge] = side.span;
    const seen = Math.round((hinge + (edge - hinge) * free) * 100) / 100;
    const mask = `linear-gradient(${side.toward}, transparent ${hinge}%, #000 ${seen}%)`;
    end.style.maskImage = mask;
    end.style.setProperty("-webkit-mask-image", mask);
  }
}

/** Lay boxes as the boxes of the fold they stand for are now, and shades as dark as the fold's. Never a box's own dark: the fold's stays where the fold has it. */
function lay(twins: Twin[]): void {
  for (const { real, twin, shade } of twins) for (const key of shade ? SHADED : LAID) twin.style[key] = real.style[key];
}

/** Lay a copy's boxes as the fold's are now, its shades as dark, and leave a blur that shows nothing undrawn. */
function syncCopy(copy: LiveCopy): void {
  lay(copy.twins);
  for (const blur of copy.blurs) blur.style.display = blur.style.opacity === "0" ? "none" : "";
}

/** The fold is drawn: lay the copies, and the case over them, as it has its own boxes now. */
export function syncLive(copies: LiveCopies): void {
  syncCopy(copies.open);
  syncCopy(copies.closed);
  lay(copies.topTwins);
}

/** Take the fold's picture of the case off the copies, and its boxes back to where nothing lays them. */
function uncase(copies: LiveCopies): void {
  copies.cased?.remove();
  copies.cased = null;
  copies.topTwins = [];
  for (const one of copies.top) for (const key of LAID) one.style[key] = "";
}

/**
 * Put the fold's picture of the turning half's case, `cased`, over the
 * copies, as it lies over the fold's own pictures of a page: in boxes that
 * stand for the fold's place and its model of the render, `boxes`, which it
 * was in. A canvas loses nothing as it is moved.
 */
export function caseLive(copies: LiveCopies, boxes: [HTMLElement, HTMLElement], cased: HTMLElement): void {
  uncase(copies);
  copies.topTwins = boxes.map((real, index) => ({ real, twin: copies.top[index] as HTMLElement, shade: false }));
  copies.top[1]?.append(cased);
  copies.cased = cased;
  lay(copies.topTwins);
}

/** A fold is drawn: the copies show over it. */
export function wakeLive(copies: LiveCopies): void {
  copies.layer.style.visibility = "visible";
}

/** No fold is drawn: the copies show nothing, and stay loaded, at their size, for the next. */
export function restLive(copies: LiveCopies): void {
  copies.layer.style.visibility = "hidden";
  uncase(copies);
  for (const copy of [copies.open, copies.closed]) {
    unlay(copy);
    for (const blur of copy.blurs) blur.remove();
    copy.blurs = [];
  }
}
