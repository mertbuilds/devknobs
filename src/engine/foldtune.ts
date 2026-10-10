/**
 * The numbers a fold's look is drawn by, in one table read each time a fold
 * is drawn, so they can be tuned by hand on a live page: a development hook
 * on `window`, under `Symbol.for("devknobs.foldtune")`. Nothing is stored:
 * the table lives in memory, and a reload puts every number back.
 */

/** Every number as it ships. Tuned values that are kept go here. */
export const TUNE_DEFAULTS = {
  /** The widest the blur gets, in css px at scale 1: at the free edge, the half standing at `blurAngle`. */
  blurMost: 48,
  /** The blur at the hinge, as a share of the blur at the free edge at the same angle. */
  blurHinge: 0.04,
  /** How the blur rises from the hinge to the free edge: 1 evenly, more keeps it low further from the hinge. */
  blurRise: 2,
  /** The hinge's angle the blur is widest at, in degrees: 180 open flat, 90 a right angle, 0 shut. */
  blurAngle: 90,
  /** How the blur falls off away from that angle: 1 evenly, more keeps it low further from it. */
  blurStand: 1.5,
  /** How wide the blur at the picture's ends along the hinge is at the hinge, in widths of the dark past them. */
  edgeHinge: 0.3,
  /** The same at the free edge. */
  edgeFree: 1,
  /** How far into the picture from an end the blur past it reaches, in widths of that blur. */
  edgeReach: 1.5,
  /** How far apart WebGL2's taps are, as a share of the blur's width: more is softer, till the taps show. */
  blurSpread: 0.5,
  /** How dark the turned screen's free edge gets, 0 to 1, the half standing at a right angle. */
  darkMost: 0.7,
  /** How that dark falls off away from a right angle: more keeps it to fewer degrees about it. */
  darkPower: 3,
  /** Where that dark starts, as a share of the way from the hinge to the free edge. */
  darkFrom: 0.25,
  /** How wide the darkest strip at the free edge is, as a share of the same way. */
  darkBand: 0.05,
  /** How much of that dark comes on evenly from where it starts: the rest is the strip's. */
  darkBroad: 0.5,
  /** How strongly the half that turns is shaded toward its free edge as it turns. */
  wipeShade: 1.5,
  /** How deep the shadow over the outer half of the open screen's half gets, 0 to 1. */
  farShade: 1,
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
};

/** A number of the table as a control shows it. */
export interface TuneRow extends Range {
  key: TuneKey;
  value: number;
  default: number;
}

/** What is on `window` to tune a fold's look by. */
export interface FoldTune {
  readonly spec: TuneRow[];
  get(): Record<string, number>;
  set(key: string, value: number): void;
  reset(): void;
  subscribe(listener: () => void): () => void;
}

const listeners = new Set<() => void>();
let changes = 0;

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

export const foldTune: FoldTune = {
  get spec() {
    return keys().map((key) => ({ key, ...RANGES[key], value: tune[key], default: TUNE_DEFAULTS[key] }));
  },
  get: () => ({ ...tune }),
  set: setTune,
  reset: resetTune,
  subscribe: watchTune,
};

/** Where the table is on `window`. */
export const TUNE_KEY = Symbol.for("devknobs.foldtune");

/** Put the table on this page's `window`, where there is one. */
export function installTune(): void {
  if (typeof window !== "undefined") Reflect.set(window, TUNE_KEY, foldTune);
}
