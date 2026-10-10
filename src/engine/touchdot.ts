import type { Rect } from "./mock";
import { DOT_LOOK, MARK_EVENT, readMark } from "./touchmark";
import type { Point } from "./zoom";

/**
 * The touch cursor over a device's whole screen, drawn by the page above the
 * frame. The screen is the page in the frame and the browser's bars and
 * status bar around and over it, and nothing in a frame can paint over what
 * the page above draws on it. So the one cursor lives here, in a layer over
 * the page and the bars, in the screen's own px: it is scaled, moved and
 * turned with the screen, and needs no sum for any of that. Over the page the
 * frame's copy says where the pointer is, and over the bars the pointer's own
 * events here do. The mouse cursor is hidden on all of the screen meanwhile.
 */

export const TOUCH_DOT_CSS = `
/* Over the page, the bars and the mock's island, clipped to the screen. */
.touchdot {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 1;
  overflow: hidden;
  transform-origin: 0 0;
  pointer-events: none;
}
.touchdot[hidden] { display: none; }
.touchdot .dot { position: absolute; }
${DOT_LOOK}
/* The screen is touched, not pointed at: the bars and their buttons show no mouse cursor. */
.glass[data-touch], .glass[data-touch] * { cursor: none !important; }
`;

/** Who says where the pointer is: the frame's copy over the page, the page above over the bars. */
export type Side = "page" | "bars";

/** The cursor on the screen: who shows it, or null while it is hidden, and where, in css px of the screen. */
export interface Dot {
  by: Side | null;
  x: number;
  y: number;
  pressed: boolean;
}

export const NO_DOT: Dot = { by: null, x: 0, y: 0, pressed: false };

/** One side's word on the pointer: where it is on the screen, or null as it leaves that side. */
export interface Cue {
  from: Side;
  at: Point | null;
  pressed: boolean;
}

/**
 * The cursor after a cue. Either side takes it by showing it. Only the side
 * that shows it can hide it: as the pointer crosses between the page and the
 * bars, one side's goodbye and the other's hello come in no set order, and a
 * late goodbye must not hide the cursor the other side just took.
 */
export function dotStep(dot: Dot, cue: Cue): Dot {
  if (cue.at) return { by: cue.from, x: cue.at.x, y: cue.at.y, pressed: cue.pressed };
  return dot.by === cue.from ? NO_DOT : dot;
}

/** A point of the frame's page on the screen, whose corner the page starts at `origin`. */
export function fromPage(point: Point, origin: Point): Point {
  return { x: origin.x + point.x, y: origin.y + point.y };
}

/**
 * A point of the window on the screen, in the screen's own px, through the
 * box the screen is drawn in now. Right for a screen that is scaled or moved,
 * each axis by its own, and not for one mid turn, whose box is not its shape.
 * Null while the screen is drawn with no size.
 */
export function fromWindow(
  point: Point,
  drawn: Rect,
  size: { width: number; height: number },
): Point | null {
  if (!(drawn.width > 0) || !(drawn.height > 0)) return null;
  return {
    x: ((point.x - drawn.x) * size.width) / drawn.width,
    y: ((point.y - drawn.y) * size.height) / drawn.height,
  };
}

/** What the cursor asks of the frame. */
export interface TouchScene {
  /** The device's screen: holds the page and the bars. */
  glass: HTMLElement;
  frame: HTMLIFrameElement;
  /** Where the page's corner is on the screen now, in css px of the screen. */
  origin(): Point;
  /** Is the device turning or folding? No cursor shows on a screen in motion. */
  moving(): boolean;
}

export interface TouchDot {
  /** The device has a touch screen and the touch pointer is on, or not. */
  apply(on: boolean): void;
  /** The screen's size in its own css px, and the zoom it is drawn at. */
  fit(size: { width: number; height: number }, zoom: number): void;
  /** Hide the cursor until the pointer moves again. */
  rest(): void;
  remove(): void;
}

/** The pointer events of the bars that say where the pointer is, or that a press began or ended. */
const POINTER = ["pointerover", "pointermove", "pointerdown", "pointerup", "pointercancel"] as const;

export function createTouchDot(scene: TouchScene): TouchDot {
  const { glass, frame } = scene;
  const layer = document.createElement("div");
  layer.className = "touchdot";
  layer.setAttribute("aria-hidden", "true");
  layer.hidden = true;
  const node = document.createElement("div");
  node.className = "dot";
  node.hidden = true;
  layer.append(node);
  glass.append(layer);
  let on = false;
  /** The frame's copy has the touch pointer paused, as grab picks there. */
  let held = false;
  let size = { width: 0, height: 0 };
  let dot = NO_DOT;

  const live = () => on && !held;
  const draw = () => {
    node.hidden = dot.by === null;
    if (dot.by !== null) node.style.transform = `translate(${dot.x}px, ${dot.y}px)`;
    node.classList.toggle("pressed", dot.pressed);
  };
  const step = (cue: Cue) => {
    dot = scene.moving() ? NO_DOT : dotStep(dot, cue);
    draw();
  };
  /** The mouse cursor goes from the whole screen while the touch cursor is live, and comes back with it gone. */
  const sync = () => {
    layer.hidden = !live();
    if (live()) {
      glass.setAttribute("data-touch", "");
      return;
    }
    glass.removeAttribute("data-touch");
    dot = NO_DOT;
    draw();
  };
  const onMark = (event: Event) => {
    const mark = readMark("detail" in event ? event.detail : null);
    // Left alone, the frame's copy draws its own cursor.
    if (!mark || !on) return;
    event.preventDefault();
    held = mark.held;
    sync();
    if (held) return;
    const at = mark.at ? fromPage(mark.at, scene.origin()) : null;
    step({ from: "page", at, pressed: mark.pressed });
  };
  const onPointer = (event: PointerEvent) => {
    if (!live() || !event.isTrusted || event.pointerType !== "mouse") return;
    // Over the frame the pointer is the page's, and the frame's copy says where.
    if (event.target === frame) {
      step({ from: "bars", at: null, pressed: false });
      return;
    }
    const box = glass.getBoundingClientRect();
    const drawn = { x: box.left, y: box.top, width: box.width, height: box.height };
    const at = fromWindow({ x: event.clientX, y: event.clientY }, drawn, size);
    step({ from: "bars", at, pressed: event.buttons !== 0 });
  };
  const onLeave = () => {
    if (live()) step({ from: "bars", at: null, pressed: false });
  };

  frame.addEventListener(MARK_EVENT, onMark);
  for (const type of POINTER) glass.addEventListener(type, onPointer);
  // Not in capture: there it would hear the pointer leave each bar too.
  glass.addEventListener("pointerleave", onLeave);

  return {
    apply(next) {
      if (next === on) return;
      on = next;
      sync();
    },
    fit(next, zoom) {
      size = { width: next.width, height: next.height };
      layer.style.width = `${next.width}px`;
      layer.style.height = `${next.height}px`;
      layer.style.transform = zoom === 1 ? "" : `scale(${zoom})`;
    },
    rest() {
      dot = NO_DOT;
      draw();
    },
    remove() {
      frame.removeEventListener(MARK_EVENT, onMark);
      for (const type of POINTER) glass.removeEventListener(type, onPointer);
      glass.removeEventListener("pointerleave", onLeave);
      glass.removeAttribute("data-touch");
      layer.remove();
    },
  };
}
