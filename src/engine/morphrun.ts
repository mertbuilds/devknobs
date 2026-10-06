import { baseMatchMedia } from "./matchmedia";
import type { Rect } from "./mock";
import {
  bezier,
  type Curve,
  ease,
  FADE_CURVE,
  holePath,
  lerp,
  lerpRect,
  MAT_CURVE,
  MORPH_TIME,
  plan,
  type Run,
  type Step,
  sameRect,
  sequence,
} from "./morph";

/**
 * Runs a device change's plan on the frame's nodes, a step at a time. What it
 * needs of the frame comes in a `Scene`, so it holds no node of its own.
 */

/** What a device change moves, and what it asks of the frame. */
export interface Scene {
  /** The mat's paint, which a device change cuts its opening in. */
  back: HTMLElement;
  /** Hides the window's own page in its color while a device comes or goes. */
  veil: HTMLElement;
  /** The case, the page in the frame and the readout, which fade as one. */
  content(): HTMLElement[];
  /** Where the frame's screen is drawn now, in the letterbox. */
  screenRect(): Rect;
  /** The mat's opening at the whole window, a px past each edge. */
  fullRect(): Rect;
  /** The window's own page is hidden under the frame. */
  covered(): boolean;
  /** Hide the window's own page under the frame. */
  hidePage(): void;
  /** Is the frame's page in and ready to paint, with no reload on its way? */
  painted(): boolean;
  /** Draw the knobs the change goes to. */
  layout(): void;
  /** Hand the window its own page back, or leave for where the frame went. */
  release(): void;
  /** Take the frame away. */
  teardown(): void;
}

/** A part of a device change in flight, which knows where it stands when cut short. */
interface Flight {
  animations: Animation[];
  time: number;
  curve: Curve;
  /** Show the part `share` of its way along, and keep it there. */
  hold(share: number): void;
}

/** A device change on its way. */
let run: Run | null = null;
/** What shows of a device change: the veil, the case and page, and the mat's opening. */
let seen = { veil: 1, content: 1, hole: { x: 0, y: 0, width: 0, height: 0 } };
/** The mat has an opening cut in it, as it does only while a device changes. */
let clipped = false;
let flights: Flight[] = [];
/** The wait for the frame's page to paint in a device change. */
let waiting = 0;

/** Is a device change on its way? */
export function running(): boolean {
  return run !== null;
}

/** How far the veil is over the window's own page, 0 to 1. */
export function veilShare(): number {
  return seen.veil;
}

/** The frame is gone, and the mat with it. */
export function forget(): void {
  clipped = false;
}

/** No movement: the user asks for less, or the browser cannot animate. */
export function still(): boolean {
  if (typeof window.matchMedia !== "function" || typeof Element === "undefined") return true;
  if (typeof Element.prototype.animate !== "function") return true;
  return baseMatchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Is a css color fully see-through? */
function clear(color: string): boolean {
  return color === "" || color === "transparent" || /[,/]\s*0\)$/.test(color);
}

/** The veil takes the color the window's page paints its canvas in. */
function paintVeil(veil: HTMLElement): void {
  const root = getComputedStyle(document.documentElement);
  const body = document.body ? getComputedStyle(document.body).backgroundColor : "";
  const color = [root.backgroundColor, body].find((value) => !clear(value));
  veil.style.background = color ?? "Canvas";
  veil.style.colorScheme = root.colorScheme || "normal";
}

/**
 * A frame that comes up for a device change: nothing of it shows yet, and the
 * page is still there under a veil `share` of the way over it. None of the mat
 * shows either: its opening is the whole window.
 */
export function openVeiled(scene: Scene, share: number): void {
  seen = { veil: share, content: 0, hole: scene.fullRect() };
  paintVeil(scene.veil);
  scene.veil.style.opacity = String(share);
  for (const node of scene.content()) node.style.opacity = "0";
  scene.back.style.clipPath = holePath(seen.hole);
  clipped = true;
}

/**
 * Move a style of `nodes` from `from` to `to` over `time` ms on `curve`. The
 * end value goes in the style at once, so a move cut short or never run
 * leaves it there, and `hold` puts it where a cut left it.
 */
function tween(
  nodes: HTMLElement[],
  property: "opacity" | "clipPath",
  from: string,
  to: string,
  time: number,
  curve: Curve,
  hold: (share: number) => void,
): Promise<void> {
  for (const node of nodes) node.style[property] = to;
  if (time <= 0 || nodes.length === 0) return Promise.resolve();
  const animations = nodes.map((node) =>
    node.animate([{ [property]: from }, { [property]: to }], {
      duration: time,
      easing: bezier(curve),
    }),
  );
  const flight: Flight = { animations, time, curve, hold };
  flights.push(flight);
  return Promise.all(animations.map((animation) => animation.finished)).then(
    () => {
      flights = flights.filter((other) => other !== flight);
    },
    () => {},
  );
}

function fade(scene: Scene, part: "veil" | "content", to: number, time: number): Promise<void> {
  const nodes = part === "veil" ? [scene.veil] : scene.content();
  const from = seen[part];
  seen[part] = to;
  return tween(nodes, "opacity", String(from), String(to), time, FADE_CURVE, (share) => {
    const value = lerp(from, to, share);
    seen[part] = value;
    for (const node of nodes) node.style.opacity = String(value);
  });
}

function moveHole(scene: Scene, to: Rect, time: number): Promise<void> {
  const node = scene.back;
  const from = seen.hole;
  seen.hole = to;
  clipped = true;
  const span = sameRect(from, to) ? 0 : time;
  return tween([node], "clipPath", holePath(from), holePath(to), span, MAT_CURVE, (share) => {
    const rect = lerpRect(from, to, share);
    seen.hole = rect;
    node.style.clipPath = holePath(rect);
  });
}

/** Wait for `ready` a frame at a time, `cap` ms at most. */
function until(ready: () => boolean, cap: number): Promise<void> {
  const end = performance.now() + cap;
  return new Promise((resolve) => {
    const look = () => {
      waiting = 0;
      if (ready() || performance.now() >= end) resolve();
      else waiting = window.requestAnimationFrame(look);
    };
    look();
  });
}

/** The frame as it stays: the mat whole, the case and the page in full. */
function rest(scene: Scene): void {
  scene.back.style.clipPath = "";
  scene.veil.style.opacity = "";
  for (const node of scene.content()) node.style.opacity = "";
  clipped = false;
  seen = { veil: 1, content: 1, hole: seen.hole };
}

/**
 * One step of a device change. Whatever a step changes at once it changes
 * before it waits, so a step run `instant` is done when it returns.
 */
async function perform(
  scene: Scene,
  step: Step,
  target: "open" | "closed",
  instant: boolean,
): Promise<void> {
  if (step.kind === "fade") {
    const time = instant ? 0 : step.time;
    await Promise.all([
      step.veil === undefined ? null : fade(scene, "veil", step.veil, time),
      step.content === undefined ? null : fade(scene, "content", step.content, time),
    ]);
  } else if (step.kind === "cover") {
    // The page's scrollbar goes with it, and the window's opening grows by as much.
    const whole = sameRect(seen.hole, scene.fullRect());
    scene.hidePage();
    if (whole) void moveHole(scene, scene.fullRect(), 0);
  } else if (step.kind === "layout") {
    scene.layout();
  } else if (step.kind === "mat") {
    const to = step.to === "screen" ? scene.screenRect() : scene.fullRect();
    await moveHole(scene, to, instant ? 0 : step.time);
  } else if (step.kind === "wait") {
    if (!instant) await until(scene.painted, MORPH_TIME.wait);
  } else if (step.kind === "release") {
    scene.release();
  } else if (target === "open") rest(scene);
  else scene.teardown();
}

/** Start a device change from what shows now, toward a frame or none. */
export function start(scene: Scene, target: "open" | "closed"): void {
  if (!clipped) {
    // From the frame as it stays: the opening is its screen, and nothing changes to see yet.
    seen = { veil: 1, content: 1, hole: scene.screenRect() };
    paintVeil(scene.veil);
    scene.veil.style.opacity = "1";
    scene.back.style.clipPath = holePath(seen.hole);
    clipped = true;
  }
  const shown = { ...seen, covered: scene.covered(), open: sameRect(seen.hole, scene.fullRect()) };
  const next = sequence(plan(shown, target), target);
  run = next;
  void next.run((step) => perform(scene, step, target, false)).then(() => {
    if (run === next && !next.live()) run = null;
  });
}

/** Stop a device change where it is, each part held where it got to. */
export function halt(): void {
  run?.cancel();
  run = null;
  for (const flight of flights) {
    const elapsed = flight.animations[0]?.currentTime;
    const share = typeof elapsed === "number" ? elapsed / flight.time : 0;
    flight.hold(ease(flight.curve, share));
    for (const animation of flight.animations) animation.cancel();
  }
  flights = [];
  if (waiting) window.cancelAnimationFrame(waiting);
  waiting = 0;
}

/** Finish a device change at once, as it would end. */
export function snap(scene: Scene | null): void {
  const last = run;
  halt();
  if (!last || !scene) return;
  for (const step of last.rest()) void perform(scene, step, last.target, true);
}
