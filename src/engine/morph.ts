import type { DevknobsState } from "../types";
import { deviceOf } from "./devices";
import { type FrameKnobs, needsFrame } from "./frame";
import type { Rect } from "./mock";

/**
 * The move from one device to another: the page fades out, the mat closes in
 * from the window's edges to the new screen, and the case and the page fade
 * in. Everything here is pure: the plan, the curves and the shapes. The frame
 * runs it.
 */

/** How long each part takes, in ms, and how long the page in the frame may keep the fade in waiting. */
export const MORPH_TIME = {
  /** The page, or the case and the page in it, fade out. */
  out: 140,
  /** The mat's opening goes from one screen to the next. */
  mat: 280,
  /** The case and the page fade in, or the window's own page comes back. */
  in: 180,
  wait: 1200,
} as const;

/** A cubic bezier's two control points, as css takes them. */
export type Curve = readonly [number, number, number, number];

/** The mat moves on an iOS spring's curve, quick to start and long to settle. */
export const MAT_CURVE: Curve = [0.32, 0.72, 0, 1];

/** Fades ease out, as the panel's own do. */
export const FADE_CURVE: Curve = [0, 0, 0.58, 1];

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

/** Where the mat's opening is `elapsed` ms into a move of `time` ms from one rect to the next. */
export function holeAt(from: Rect, to: Rect, elapsed: number, time: number): Rect {
  return lerpRect(from, to, time > 0 ? ease(MAT_CURVE, elapsed / time) : 1);
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

/** The opening as wide as a window of `size`, a px past each edge so no hairline of mat shows. */
export function windowRect(size: { width: number; height: number }): Rect {
  return { x: -1, y: -1, width: size.width + 2, height: size.height + 2 };
}

function px(value: number): string {
  return `${Math.round(value * 100) / 100}px`;
}

/**
 * The mat with an opening at `hole`: the whole box, and the hole cut out of
 * it by the even odd rule. Every one has the same points, so one goes into
 * the next.
 */
export function holePath(hole: Rect): string {
  const left = px(hole.x);
  const top = px(hole.y);
  const right = px(hole.x + hole.width);
  const bottom = px(hole.y + hole.height);
  const inner = [`${left} ${top}`, `${right} ${top}`, `${right} ${bottom}`, `${left} ${bottom}`];
  return `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${inner.join(", ")}, ${left} ${top})`;
}

/**
 * Which way the frame is drawn, for a move: `closed`, `frame` for one with no
 * device, or the device and the way it is held.
 */
export function shapeOf(knobs: FrameKnobs & Pick<DevknobsState, "device" | "orientation">): string {
  if (!needsFrame(knobs)) return "closed";
  return deviceOf(knobs.device) ? `${knobs.device}|${knobs.orientation}` : "frame";
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
  /** The mat's opening is the whole window, so none of the mat shows. */
  open: boolean;
}

export type Step =
  | { kind: "fade"; veil?: number; content?: number; time: number }
  | { kind: "mat"; to: "screen" | "window"; time: number }
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
  if (!shown.open) steps.push({ kind: "mat", to: "window", time: MORPH_TIME.mat });
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
