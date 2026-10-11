import { formOf } from "./devices";

/**
 * The numbers a fold's look is drawn by, in one table read each time a fold
 * is drawn, so they can be tuned by hand on a live page: a development hook
 * on `window`, under `Symbol.for("devknobs.foldtune")`. Nothing is stored:
 * the table lives in memory, and a reload puts every number back. It also
 * says what drew the page on the half that turns the last time a fold was
 * drawn, and why, as WebGL2 and the layers are tuned apart, and, for
 * comparing with the fold it was modelled on, sets of numbers by name, the
 * hinge's angle, and the picture of the page a fold draws.
 */

/** Every number as it ships. Tuned values that are kept go here. */
export const TUNE_DEFAULTS = {
  /** The widest the blur gets, in css px at scale 1: at the free edge, the half standing at `blurAngle`. */
  blurMost: 48,
  /** The blur at the hinge, as a share of the blur at the free edge at the same angle. None as it ships: the hinge side is sharp. */
  blurHinge: 0,
  /** How the blur rises from the hinge to the free edge: 1 evenly, more keeps it low further from the hinge. */
  blurRise: 2,
  /** The hinge's angle the blur is widest at, in degrees: 180 open flat, 90 a right angle, 0 shut. */
  blurAngle: 90,
  /** How the blur falls off away from that angle: 1 evenly, more keeps it low further from it. */
  blurStand: 1.5,
  /** How much of its peak the blur keeps past that angle, on the side away from where the screen lies flat in sight: 0 falls as it rose, 1 stays at the peak. */
  blurHold: 0,
  /** How the blur rises to its peak: 0 by `blurStand`'s power, 1 slow at both ends, as jadon7/iphone-duo's does. */
  blurEase: 0,
  /** How wide the blur at the picture's ends along the hinge is at the hinge, in widths of the dark past them. */
  edgeHinge: 0.3,
  /** The same at the free edge. */
  edgeFree: 1,
  /** How far into the picture from an end the blur past it reaches, in widths of that blur. */
  edgeReach: 1.5,
  /** How far apart WebGL2's taps are, as a share of the blur's width: more is softer, till the taps show. */
  blurSpread: 0.5,
  /** How dark the turned screen's free edge gets, 0 to 1, the half standing at a right angle. None as it ships, so the four numbers under it do nothing till a hand raises it: 0.7 is as measured from Apple's. */
  darkMost: 0,
  /** How that dark falls off away from a right angle: more keeps it to fewer degrees about it. */
  darkPower: 3,
  /** Where that dark starts, as a share of the way from the hinge to the free edge. */
  darkFrom: 0.25,
  /** How wide the darkest strip at the free edge is, as a share of the same way. */
  darkBand: 0.05,
  /** How much of that dark comes on evenly from where it starts: the rest is the strip's. */
  darkBroad: 0.5,
  /** How strongly the half that turns is shaded toward its free edge as it turns. Not at all as it ships: Apple's is 1.5. */
  wipeShade: 0,
  /** How deep the shadow over the outer half of the open screen's half gets, 0 to 1. None as it ships: Apple's is 1. */
  farShade: 0,
  /** How much noise WebGL2 adds to a shade it draws, in steps of a screen's 256, so a dark, slow one shows no bands. */
  grain: 1,
  /** For finding what draws a line: 0 leaves every shade over the half that turns out, but the screen's own light. */
  shadeOn: 1,
  /** The same for its blur: 0 leaves it sharp. */
  blurOn: 1,
} satisfies Record<string, number>;

export type TuneKey = keyof typeof TUNE_DEFAULTS;

/** The numbers as they are now. Read where a fold is drawn, never copied. */
export const tune: Record<TuneKey, number> = { ...TUNE_DEFAULTS };

/** What a control for a number shows, and how far it lets it go. */
interface Range {
  label: string;
  min: number;
  max: number;
  step: number;
  unit?: string;
  hint: string;
}

const RANGES: Record<TuneKey, Range> = {
  blurMost: { label: "largest blur", min: 0, max: 256, step: 1, unit: "px", hint: "How wide the blur gets at the free edge when the half stands at the peak angle." },
  blurHinge: { label: "blur at hinge", min: 0, max: 1, step: 0.01, hint: "Blur next to the hinge, as a share of the blur at the free edge." },
  blurRise: { label: "rise toward edge", min: 0.25, max: 6, step: 0.05, hint: "How the blur grows from the hinge to the free edge: 1 is even, more keeps it sharp further out." },
  blurAngle: { label: "blur peak angle", min: 20, max: 160, step: 1, unit: "deg", hint: "The hinge angle where the blur is widest: 180 is open flat, 0 is shut." },
  blurStand: { label: "blur angle falloff", min: 0.2, max: 6, step: 0.05, hint: "How fast the blur fades away from the peak angle: less keeps it blurred over more of the turn." },
  blurHold: { label: "blur hold past peak", min: 0, max: 1, step: 0.01, hint: "How much of the peak blur stays once the half has turned past the peak angle: 0 fades it again, 1 keeps all of it." },
  blurEase: { label: "blur rise shape", min: 0, max: 1, step: 1, hint: "How the blur comes on toward the peak angle: 0 by the angle falloff, 1 eased at both ends as the reference fold does." },
  edgeHinge: { label: "end blur hinge", min: 0, max: 2, step: 0.05, hint: "Blur at the top and bottom ends of the picture next to the hinge, hiding its line with the dark past it." },
  edgeFree: { label: "end blur edge", min: 0, max: 3, step: 0.05, hint: "The same blur at the top and bottom ends, at the free edge." },
  edgeReach: { label: "end blur reach", min: 0.1, max: 4, step: 0.05, hint: "How far into the picture the blur at its top and bottom ends reaches." },
  blurSpread: { label: "blur softness", min: 0.1, max: 1, step: 0.01, hint: "How far apart the blur's samples are: more is softer, too much shows the samples." },
  darkMost: { label: "edge dark strength", min: 0, max: 1, step: 0.01, hint: "How dark the free edge gets with the half at a right angle." },
  darkPower: { label: "edge dark falloff", min: 0.2, max: 8, step: 0.1, hint: "How fast that dark fades away from a right angle." },
  darkFrom: { label: "edge dark start", min: 0, max: 0.95, step: 0.01, hint: "Where the dark begins, as a share of the way from the hinge to the free edge." },
  darkBand: { label: "edge dark band", min: 0.01, max: 0.5, step: 0.01, hint: "How wide the darkest strip at the free edge is, as a share of the turning half." },
  darkBroad: { label: "edge dark spread", min: 0, max: 1, step: 0.01, hint: "How much of the dark comes on evenly from its start: the rest sits in the strip at the edge." },
  wipeShade: { label: "turning half shade", min: 0, max: 3, step: 0.05, hint: "How much the turning half darkens toward its free edge as it turns." },
  farShade: { label: "far side shadow", min: 0, max: 1, step: 0.01, hint: "How deep the shadow on the outer half of the open screen's turning half gets." },
  grain: { label: "shade grain", min: 0, max: 2, step: 0.05, hint: "Fine noise WebGL adds to a shade it draws, so a dark, slow one shows no bands: 1 is one step of the screen's 256." },
  shadeOn: { label: "shades on", min: 0, max: 1, step: 1, hint: "For finding what draws a line: 0 leaves out every shade over the turning half." },
  blurOn: { label: "blur on", min: 0, max: 1, step: 1, hint: "For finding what draws a line: 0 leaves the turning half sharp." },
};

/** A number of the table as a control shows it. */
export interface TuneRow extends Range {
  key: TuneKey;
  value: number;
  default: number;
}

/** What drew the page on the half that turns, the last time a fold was drawn, and why: in one plain sentence. */
export interface FoldInfo {
  drawnBy: "webgl" | "layers" | "none";
  why: string;
}

/** What is on `window` to tune a fold's look by. */
export interface FoldTune {
  readonly spec: TuneRow[];
  get(): Record<string, number>;
  set(key: string, value: number): void;
  reset(): void;
  /** Hear of every change to the table, to what `info` gives, and to the hinge's angle, once a frame at most as it moves. Returns the way to stop. */
  subscribe(listener: () => void): () => void;
  info(): FoldInfo;
  /** Sets of numbers by name, each with every key, for `set` to apply: nothing applies one by itself. */
  presets(): Record<string, Record<string, number>>;
  /** The picture of the page a fold draws on the screen that shows now, as a PNG its own size, or null where there is none or the browser will not let it out. Never kept. */
  shot(): Promise<Blob | null>;
  /** How the last `shot` went, in one plain sentence. */
  shotWhy(): string;
  /** The hinge's angle, 180 open flat to 0 shut, or null with no foldable up. */
  angle(): number | null;
}

/**
 * What the frame and its fold tell the hook of, as it asks: how far open the
 * hinge is drawn, 0 shut to 1 open, or null with no foldable up, and the
 * pictures of the page on the screen that shows now, the best first, or why
 * there is none, in a plain sentence.
 */
export interface TuneLive {
  open(): number | null;
  pictures(): Promise<HTMLCanvasElement[] | string>;
}

const listeners = new Set<() => void>();
/** Those who listen on `window`, who hear of what draws the page too. The folds' own do not: a number has not changed. */
const hearers = new Set<() => void>();
let info: FoldInfo = { drawnBy: "none", why: "no fold has drawn yet" };
let changes = 0;
let live: TuneLive | null = null;
/** The angle those who listen on `window` last heard of, and are they told of a new one at the next frame? */
let told: number | null = null;
let due = false;
let shotSaid = "no picture has been asked for yet";

function isKey(key: string): key is TuneKey {
  return Object.hasOwn(TUNE_DEFAULTS, key);
}

/** The table's keys, in the order it lists them. */
function keys(): TuneKey[] {
  return Object.keys(TUNE_DEFAULTS).filter(isKey);
}

function changed(): void {
  changes++;
  for (const listener of Array.from(listeners)) listener();
}

/** How many times the table has changed, for what keeps a drawing till its numbers change. */
export function tuneChanges(): number {
  return changes;
}

/** Hear of every change to the table. Returns the way to stop. */
export function watchTune(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Why WebGL2 draws the page where it does. */
export const BY_WEBGL = "the picture went up as a texture";

/** Take note of what drew the page on the half that turns, and why, and tell who listens on `window` where either has changed. */
export function drew(drawnBy: FoldInfo["drawnBy"], why: string): void {
  if (info.drawnBy === drawnBy && info.why === why) return;
  info = { drawnBy, why };
  for (const hearer of Array.from(hearers)) hearer();
}

/** Whoever knows the frame and its fold says so, for the hook to ask. */
export function tuneLive(source: TuneLive | null): void {
  live = source;
}

/** The hinge's angle as jadon7/iphone-duo's slider has it: 180 open flat, 0 shut. Null with no foldable up. */
function angle(): number | null {
  const open = live?.open() ?? null;
  return open === null ? null : 180 * open;
}

/**
 * The hinge may have moved: those who listen on `window` hear of its new
 * angle at the next frame, once however often it moved till then, and not
 * where it is the angle they last heard of. With none listening, nothing.
 */
export function hingeMoved(): void {
  if (hearers.size === 0 || due) return;
  due = true;
  const tell = () => {
    due = false;
    const now = angle();
    if (now === told) return;
    told = now;
    for (const hearer of Array.from(hearers)) hearer();
  };
  if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") window.requestAnimationFrame(tell);
  else tell();
}

/** Hear of every change to the table, to what draws the page and to the hinge's angle. Returns the way to stop. */
function subscribe(listener: () => void): () => void {
  const stop = watchTune(listener);
  // The first to listen hears of the angle from where it is now.
  if (hearers.size === 0) told = angle();
  hearers.add(listener);
  return () => {
    stop();
    hearers.delete(listener);
  };
}

/** Set a number, held to its range. A key the table does not have, or what is not a number, changes nothing. */
export function setTune(key: string, value: number): void {
  if (!isKey(key) || !Number.isFinite(value)) return;
  const { min, max } = RANGES[key];
  const next = Math.min(max, Math.max(min, value));
  if (next === tune[key]) return;
  tune[key] = next;
  changed();
}

/** Put every number back as it ships. */
export function resetTune(): void {
  if (keys().every((key) => tune[key] === TUNE_DEFAULTS[key])) return;
  Object.assign(tune, TUNE_DEFAULTS);
  changed();
}

/**
 * jadon7/iphone-duo, the fold this one was modelled on, blurs by a radius of
 * up to `radius` px of its screens' pictures, its taps a radius apart: the
 * open screen's picture `inner` px across the hinge, in its own pictures and
 * in one uploaded, and the folded body's own `cover` px. As its main.js and
 * ui.js have them.
 */
export const JADON = { radius: 72, inner: 1600, cover: 774 } as const;

/**
 * How wide jadon7/iphone-duo's widest blur is in the css px of the Duo's
 * screen of `pane`, as the devices list sizes it: its radius by the css px
 * one px of its picture takes. The open screen is held across, its long
 * side over the hinge: 72 * 951 / 1600 = 42.795. The folded body's is
 * upright: 72 * 466 / 774 = 43.349.
 */
export function jadonBlur(pane: "inner" | "cover"): number {
  const form = formOf("iphone-duo", pane === "inner" ? "open" : "closed");
  if (!form) return 0;
  const across = pane === "inner" ? Math.max(form.width, form.height) : Math.min(form.width, form.height);
  return (JADON.radius * across) / JADON[pane];
}

/**
 * Sets of numbers by name. `ours` is the table as it ships. `jadon blur` is
 * jadon7/iphone-duo's blur in this table's terms: none at the hinge, rising
 * by the power 1.35 toward the free edge, eased up to a right angle and held past
 * it, its taps as far apart as the blur is wide, `blurSpread` 1, and the
 * widest 43 css px, which 72 px of its pictures come to on both of the Duo's
 * screens, to the px, as `jadonBlur` works out. `jadon` darkens as it does
 * too, as near as the table has it: from 0.2 of the way out, `darkFrom`, to
 * black at the free edge at a right angle, `darkMost` 1, all of it coming on
 * from there, `darkBroad` 1, and evenly by angle, `darkPower` 1, the nearest
 * to its eased rise. Its dark is twice as steep across and black from two
 * thirds of the way out, rises by 1.35 where this one's eases, and stays
 * past a right angle, none of which the table has. The wipe and the far
 * side's shadow are Apple's, not its, and stay off.
 */
function presets(): Record<string, Record<string, number>> {
  const blur = {
    ...TUNE_DEFAULTS,
    blurMost: Math.round(jadonBlur("inner")),
    blurHinge: 0,
    blurRise: 1.35,
    blurAngle: 90,
    blurHold: 1,
    blurEase: 1,
    blurSpread: 1,
    darkMost: 0,
    wipeShade: 0,
    farShade: 0,
  };
  return {
    ours: { ...TUNE_DEFAULTS },
    jadon: { ...blur, darkMost: 1, darkFrom: 0.2, darkPower: 1, darkBroad: 1, shadeOn: 1 },
    "jadon blur": blur,
  };
}

/** Why a picture did not come out, from what was thrown. */
function thrown(error: unknown): string {
  const name = error instanceof Error ? error.name : String(error);
  const tainted = "as a picture, video or canvas from another origin is drawn in it, or a drawing of the page this browser does not trust";
  return `the browser will not let the picture out: ${name}${name === "SecurityError" ? `, ${tainted}` : ""}`;
}

/** A canvas as a PNG its own size, or why it did not come out. */
function pngOf(canvas: HTMLCanvasElement): Promise<Blob | string> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob ?? "the browser made no PNG of the picture"), "image/png");
    } catch (error) {
      resolve(thrown(error));
    }
  });
}

/** The picture of the page on the screen that shows now as a PNG, the first of those there are that comes out, or null, and how it went noted. */
async function shot(): Promise<Blob | null> {
  try {
    const found = live ? await live.pictures() : "no frame is up to take a picture in";
    let why = typeof found === "string" ? found : "there is no picture of the page";
    for (const canvas of typeof found === "string" ? [] : found) {
      const png = await pngOf(canvas);
      if (typeof png !== "string") {
        shotSaid = `the picture came out as a PNG, ${canvas.width} by ${canvas.height} px`;
        return png;
      }
      why = png;
    }
    shotSaid = why;
  } catch (error) {
    shotSaid = `the picture could not be taken: ${error instanceof Error ? error.name : String(error)}`;
  }
  return null;
}

export const foldTune: FoldTune = {
  get spec() {
    return keys().map((key) => ({ key, ...RANGES[key], value: tune[key], default: TUNE_DEFAULTS[key] }));
  },
  get: () => ({ ...tune }),
  set: setTune,
  reset: resetTune,
  subscribe,
  info: () => ({ ...info }),
  presets,
  shot,
  shotWhy: () => shotSaid,
  angle,
};

/** Where the table is on `window`. */
export const TUNE_KEY = Symbol.for("devknobs.foldtune");

/** Put the table on this page's `window`, where there is one. */
export function installTune(): void {
  if (typeof window !== "undefined") Reflect.set(window, TUNE_KEY, foldTune);
}
