import type { DevknobsState } from "../types";
import { deviceOf } from "./devices";
import { type FrameKnobs, needsFrame } from "./frame";
import type { Rect } from "./mock";

/**
 * The move from one device to another: the page fades out, the corners of the
 * mat's opening round, the mat closes in from the window's edges to the new
 * screen, and the case and the page fade in. A device that turns stays in view
 * and turns as one, and a foldable folds in view, as fold.ts lays it out.
 * Everything here is pure: the plan, the curves and the shapes. The frame
 * runs it.
 */

/** How long each part takes, in ms, and how long the page in the frame may keep the fade in waiting. */
export const MORPH_TIME = {
  /** The page, or the case and the page in it, fade out. */
  out: 140,
  /** The mat's opening goes from one screen to the next. */
  mat: 280,
  /** The corners of the window's opening round before it closes in, or square off once it is the window again. */
  round: 110,
  /** The case and the page fade in, or the window's own page comes back. */
  in: 180,
  /** A device turns a quarter, to be held the other way. */
  turn: 400,
  /** The page on the screen of a device that turned or folded sharpens, laid out the other way. */
  uncover: 200,
  /** A foldable folds open or shut, a half turn of its hinge. */
  fold: 480,
  /** The page on a foldable's screen blurs before it folds. */
  foldCover: 120,
  wait: 1200,
} as const;

/** How round the corners of the window's opening go before it closes in, in px. */
export const ROUND = 20;

/** A radius for each corner, in px: top left, top right, bottom right, bottom left. */
export type Corners = readonly [number, number, number, number];

/** The mat's opening: where it is, and how round each of its corners is. */
export interface Hole extends Rect {
  radius: Corners;
}

/** A cubic bezier's two control points, as css takes them. */
export type Curve = readonly [number, number, number, number];

/** The mat moves on an iOS spring's curve, quick to start and long to settle. */
export const MAT_CURVE: Curve = [0.32, 0.72, 0, 1];

/** Fades ease out, as the panel's own do. */
export const FADE_CURVE: Curve = [0, 0, 0.58, 1];

/** A device turns slowly out and slowly in, as a hand turns it. */
export const TURN_CURVE: Curve = [0.42, 0, 0.58, 1];

export function bezier(curve: Curve): string {
  return `cubic-bezier(${curve.join(", ")})`;
}

/** How far along a curve is at `time`, 0 to 1 of the way through. */
export function ease(curve: Curve, time: number): number {
  const [x1, y1, x2, y2] = curve;
  const at = (a: number, b: number, t: number) =>
    3 * a * t * (1 - t) ** 2 + 3 * b * t ** 2 * (1 - t) + t ** 3;
  const t = Math.min(1, Math.max(0, time));
  if (t === 0 || t === 1) return t;
  // The x of the curve only grows, so halving the range finds the point for `t`.
  let low = 0;
  let high = 1;
  for (let i = 0; i < 30; i++) {
    const middle = (low + high) / 2;
    if (at(x1, x2, middle) < t) low = middle;
    else high = middle;
  }
  return at(y1, y2, (low + high) / 2);
}

export function lerp(from: number, to: number, share: number): number {
  return from + (to - from) * share;
}

export function lerpRect(from: Rect, to: Rect, share: number): Rect {
  return {
    x: lerp(from.x, to.x, share),
    y: lerp(from.y, to.y, share),
    width: lerp(from.width, to.width, share),
    height: lerp(from.height, to.height, share),
  };
}

/** Where the mat's opening is `elapsed` ms into a move of `time` ms, its corners on the way too. */
export function holeAt(from: Hole, to: Hole, elapsed: number, time: number): Hole {
  const share = time > 0 ? ease(MAT_CURVE, elapsed / time) : 1;
  if (share === 1) return to;
  const [a, b, c, d] = from.radius;
  const [e, f, g, h] = to.radius;
  const radius: Corners = [lerp(a, e, share), lerp(b, f, share), lerp(c, g, share), lerp(d, h, share)];
  return { ...lerpRect(from, to, share), radius };
}

/** Do two rects cover the same pixels, near enough? */
export function sameRect(a: Rect, b: Rect): boolean {
  return (
    Math.abs(a.x - b.x) < 0.5 &&
    Math.abs(a.y - b.y) < 0.5 &&
    Math.abs(a.width - b.width) < 0.5 &&
    Math.abs(a.height - b.height) < 0.5
  );
}

/** Do two openings cover the same pixels, their corners too, near enough? */
export function sameHole(a: Hole, b: Hole): boolean {
  const near = (radius: number, corner: number) => Math.abs(radius - b.radius[corner]) < 0.5;
  return sameRect(a, b) && a.radius.every(near);
}

/**
 * The opening as wide as a window of `size`, a px past each edge so no
 * hairline of mat shows, with square corners.
 */
export function windowRect(size: { width: number; height: number }): Hole {
  return { x: -1, y: -1, width: size.width + 2, height: size.height + 2, radius: [0, 0, 0, 0] };
}

/** The same opening with its corners rounded, as the window's is before it closes in. */
export function rounded(hole: Hole): Hole {
  return { ...hole, radius: [ROUND, ROUND, ROUND, ROUND] };
}

/** Far past any window's edge, so the mat's outline takes in all of it. */
const FAR = 100000;

function num(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * The corners of a rect as css draws them: where two on a side would overlap,
 * all of them shrink by as much, and none is rounder than half the short side.
 */
export function fitCorners(rect: Rect, radius: Corners): Corners {
  const [a, b, c, d] = radius.map((value) => Math.max(0, value));
  const room = (side: number, sum: number) => (sum > 0 ? side / sum : 1);
  const scale = Math.min(
    1,
    room(rect.width, a + b),
    room(rect.height, b + c),
    room(rect.width, c + d),
    room(rect.height, d + a),
  );
  const most = Math.max(0, Math.min(rect.width, rect.height) / 2);
  const each = (value: number) => Math.min(value * scale, most);
  return [each(a), each(b), each(c), each(d)];
}

/**
 * The radius of each corner from a css `border-radius`, one to four values,
 * the first of each pair where a corner is elliptical.
 */
export function readCorners(text: string): Corners {
  const values = (text.split("/")[0] ?? "")
    .trim()
    .split(/\s+/)
    .map((value) => Number.parseFloat(value) || 0);
  const [a = 0, b = a, c = a, d = b] = values;
  return [a, b, c, d];
}

/**
 * The mat with an opening at `hole`: a square far past the box, and the hole
 * cut out of it by the even odd rule, each corner as round as it asks. A
 * shape such as `inset()` keeps what is inside it, where the mat keeps what is
 * outside.
 */
export function holePath(hole: Hole): string {
  const { x, y, width, height } = hole;
  const [a, b, c, d] = fitCorners(hole, hole.radius);
  const arc = (r: number, toX: number, toY: number) =>
    `A${num(r)} ${num(r)} 0 0 1 ${num(toX)} ${num(toY)}`;
  const inner = [
    `M${num(x + a)} ${num(y)}`,
    `H${num(x + width - b)}`,
    arc(b, x + width, y + b),
    `V${num(y + height - c)}`,
    arc(c, x + width - c, y + height),
    `H${num(x + d)}`,
    arc(d, x, y + height - d),
    `V${num(y + a)}`,
    arc(a, x + a, y),
    "Z",
  ].join("");
  return `path(evenodd, "M${-FAR} ${-FAR}H${FAR}V${FAR}H${-FAR}Z${inner}")`;
}

/**
 * How the screen stands as a device turns, against how it stood at the
 * start: where its middle is, its angle in degrees, clockwise, and its scale.
 */
export interface Pose {
  x: number;
  y: number;
  angle: number;
  scale: number;
}

/** A screen at `rect` as it stands, unturned. */
export function poseOf(rect: Rect): Pose {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, angle: 0, scale: 1 };
}

/**
 * The screen at `from` turned a quarter by `angle` onto `to`: its middle on
 * the middle of `to`, and as big as it.
 */
export function turnedPose(from: Rect, to: Rect, angle: number): Pose {
  return { ...poseOf(to), angle, scale: (to.width + to.height) / (from.width + from.height) };
}

/**
 * How far into a turn the page on the screen starts to blur, so it is laid
 * out the other way unseen, 0 to 1.
 */
export const TURN_COVER = 0.6;

/**
 * How far the cover is over the page `elapsed` ms into a turn of `time` ms,
 * 0 to 1: on its way over in the turn's last part, or off all through a turn
 * back to the way the page is laid out.
 */
export function coverAt(from: number, to: number, elapsed: number, time: number): number {
  const share = time > 0 ? elapsed / time : 1;
  const part = to > from ? (share - TURN_COVER) / (1 - TURN_COVER) : share;
  return lerp(from, to, ease(FADE_CURVE, part));
}

/** How the screen stands `elapsed` ms into a turn of `time` ms. */
export function poseAt(from: Pose, to: Pose, elapsed: number, time: number): Pose {
  const share = time > 0 ? ease(TURN_CURVE, elapsed / time) : 1;
  return {
    x: lerp(from.x, to.x, share),
    y: lerp(from.y, to.y, share),
    angle: lerp(from.angle, to.angle, share),
    scale: lerp(from.scale, to.scale, share),
  };
}

/** Where a point of the screen drawn at `start` is at `pose`. */
export function posePoint(start: Rect, pose: Pose, point: { x: number; y: number }) {
  const turn = (pose.angle * Math.PI) / 180;
  const dx = (point.x - start.x - start.width / 2) * pose.scale;
  const dy = (point.y - start.y - start.height / 2) * pose.scale;
  return {
    x: pose.x + dx * Math.cos(turn) - dy * Math.sin(turn),
    y: pose.y + dx * Math.sin(turn) + dy * Math.cos(turn),
  };
}

/**
 * The css transform that stands the device at `pose`, on the element that
 * holds the case and the screen: its top left at `corner`, scaled by `base`
 * from that corner as it stands, and the screen at `start`.
 */
export function poseTransform(
  start: Rect,
  pose: Pose,
  corner: { x: number; y: number },
  base: number,
): string {
  const at = posePoint(start, pose, corner);
  return `translate(${num(at.x - corner.x)}px, ${num(at.y - corner.y)}px) rotate(${num(pose.angle * 1000) / 1000}deg) scale(${pose.scale * base})`;
}

/**
 * Does going from one shape to the other turn the device the other way up?
 * A turn to be held across goes a quarter anticlockwise, the top of the phone
 * to the left as its mock turns, and back the other way.
 */
export function turnOf(from: string, to: string): number {
  const [device, held, posture] = from.split("|");
  const [next, now, after] = to.split("|");
  if (!held || !now || device !== next || held === now || posture !== after) return 0;
  return now === "landscape" ? -90 : 90;
}

/**
 * Does going from one shape to the other fold a foldable open or shut? Its
 * hinge stays where it is, so the screen it goes to is held the other way.
 */
export function folds(from: string, to: string): boolean {
  const [device, held, posture] = from.split("|");
  const [next, now, after] = to.split("|");
  return Boolean(posture && after) && device === next && posture !== after && held !== now;
}

/**
 * Which way the frame is drawn, for a move: `closed`, `frame` for one with no
 * device, or the device and the way it is held, and a foldable's posture.
 */
export function shapeOf(
  knobs: FrameKnobs & Pick<DevknobsState, "device" | "orientation" | "posture">,
): string {
  if (!needsFrame(knobs)) return "closed";
  const device = deviceOf(knobs.device);
  if (!device) return "frame";
  const held = `${knobs.device}|${knobs.orientation}`;
  return device.postures ? `${held}|${knobs.posture}` : held;
}

/**
 * Does going from one shape to the other move? A device that comes, goes,
 * changes or turns does. A width, a height or a zoom changes in place, as
 * they are dragged and typed, and so does a frame with no device coming up.
 */
export function moves(from: string, to: string): boolean {
  if (from === to) return false;
  const bare = (shape: string) => shape === "closed" || shape === "frame";
  return !(bare(from) && bare(to));
}

/** What shows of a move, between steps: the veil over the page, the mat's opening, and the frame with its case. */
export interface Shown {
  /** The veil in the page's color over the window's own page, 0 to 1. */
  veil: number;
  /** The case, the page in the frame and the readout, 0 to 1. */
  content: number;
  /** The window's own page is hidden under the frame. */
  covered: boolean;
  /** The mat's opening is the whole window, square, so none of the mat shows. */
  open: boolean;
}

export type Step =
  | { kind: "fade"; veil?: number; content?: number; time: number }
  /** The mat's opening goes to the screen, to the window with round corners, or to the window square. */
  | { kind: "mat"; to: "screen" | "round" | "window"; time: number }
  /** Hide the window's own page under the frame. */
  | { kind: "cover" }
  /** Draw the knobs the move goes to. */
  | { kind: "layout" }
  /** Wait for the page in the frame to be ready to paint. */
  | { kind: "wait" }
  /** Hand the window its own page back. */
  | { kind: "release" }
  /** The frame as it stays, or none. */
  | { kind: "end" };

/**
 * The steps from what shows now to a frame with its new device, or to none.
 * A move cut short starts the next from where it was, so each step is left
 * out once what it does is done.
 */
export function plan(shown: Shown, to: "open" | "closed"): Step[] {
  const steps: Step[] = [];
  if (to === "open") {
    const out = {
      ...(shown.content > 0 ? { content: 0 } : {}),
      ...(shown.veil < 1 ? { veil: 1 } : {}),
    };
    if (shown.content > 0 || shown.veil < 1) steps.push({ kind: "fade", ...out, time: MORPH_TIME.out });
    if (!shown.covered) steps.push({ kind: "cover" });
    if (shown.open) steps.push({ kind: "mat", to: "round", time: MORPH_TIME.round });
    steps.push(
      { kind: "layout" },
      { kind: "mat", to: "screen", time: MORPH_TIME.mat },
      { kind: "wait" },
      { kind: "fade", content: 1, time: MORPH_TIME.in },
      { kind: "end" },
    );
    return steps;
  }
  let veil = shown.veil;
  if (shown.content > 0) {
    steps.push({ kind: "fade", content: 0, ...(veil < 1 ? { veil: 1 } : {}), time: MORPH_TIME.out });
    veil = 1;
  }
  if (!shown.open) {
    steps.push(
      { kind: "mat", to: "round", time: MORPH_TIME.mat },
      { kind: "mat", to: "window", time: MORPH_TIME.round },
    );
  }
  steps.push({ kind: "release" });
  if (veil > 0) steps.push({ kind: "fade", veil: 0, time: MORPH_TIME.in });
  steps.push({ kind: "end" });
  return steps;
}

/** A plan on its way. Cancelled, it starts no step after the one in flight. */
export interface Run {
  readonly steps: readonly Step[];
  readonly target: "open" | "closed";
  /** The step in flight, or the next one. */
  at(): number;
  /** The steps not done yet, the one in flight first. */
  rest(): Step[];
  live(): boolean;
  cancel(): void;
  /** Go through the steps in turn, each once the last is done. */
  run(perform: (step: Step) => Promise<void> | void): Promise<void>;
}

export function sequence(steps: Step[], target: "open" | "closed"): Run {
  let at = 0;
  let live = true;
  return {
    steps,
    target,
    at: () => at,
    rest: () => steps.slice(at),
    live: () => live,
    cancel() {
      live = false;
    },
    async run(perform) {
      while (live && at < steps.length) {
        const step = steps[at];
        if (step) await perform(step);
        if (!live) return;
        at++;
      }
      live = false;
    },
  };
}
