import * as engine from "../engine";
import { DEFAULT_STATE } from "../engine/store";
import type { DevknobsState, DevknobsStatePatch } from "../types";
import {
  BARS,
  BROWSER,
  DEVICE,
  DPR,
  EDGE_TO_EDGE,
  FRAME,
  GRAB_COLOR,
  MAT,
  MOCK,
  OUTLINES,
  OVERFLOW,
  TOUCH_POINTER,
  UA,
  VISION,
  WIDTH,
  ZOOM,
} from "./deviceknobs";
import type { IconName } from "./icons";
import type { Binding } from "./keys";
import {
  CLOCK,
  CLOCK_MODE,
  CLOCK_SPEED,
  CONNECTION,
  CONTRAST,
  DIRECTION,
  GEO,
  GEO_ERROR,
  HEADER,
  LOCALE,
  MOTION,
  nameOf,
  ONLINE,
  PSEUDO,
  SAVE_DATA,
  SCHEME,
  SPACING,
  SPEED,
  TEXT,
  TIME_ZONE,
  TRANSPARENCY,
} from "./knobs";
import { stage } from "./stage";

export { hasMock } from "./deviceknobs";
export { nameOf, parseShift, shiftLabel, wallInput } from "./knobs";

/**
 * Every knob the panel offers, as data: what it is called, what it can be set
 * to and how, and how it reads back. The actions are here too, each with what
 * it does. The rows, their editors and the search all come from here.
 */

export type Category =
  | "look"
  | "motion"
  | "language"
  | "location and time"
  | "network"
  | "device"
  | "viewport"
  | "debug";

export const CATEGORIES: readonly Category[] = [
  "look",
  "motion",
  "language",
  "location and time",
  "network",
  "device",
  "viewport",
  "debug",
];

/**
 * How an editor sets the knob: on and off, a few choices, colors to pick
 * from, number chips, or a long list.
 */
export type Control = "switch" | "segments" | "swatches" | "chips" | "list";

export interface Option {
  /** What the knob is set to, as text. */
  value: string;
  /** What a chip, a segment or a list line says. */
  label: string;
  /** What a search result says after the knob's name, where the label is too short. */
  long?: string;
  /** More words search finds the option by. */
  aliases?: readonly string[];
  /** Picking it opens the knob's editor too, which has more to fill in. */
  opens?: boolean;
  /** The heading a long list shows it under. */
  group?: string;
  /** What a swatch is painted with, as a css background. */
  swatch?: string;
}

/** What changes without a knob moving. */
export interface Live {
  /** The time the page reads, in epoch ms. */
  now: number;
  /** The real time, in epoch ms. */
  real: number;
  /** How many boxes stick out sideways, null until it is known. */
  overflow: number | null;
}

export type KnobId =
  | "scheme"
  | "contrast"
  | "transparency"
  | "text"
  | "spacing"
  | "motion"
  | "speed"
  | "locale"
  | "direction"
  | "pseudo"
  | "geo"
  | "geoError"
  | "timeZone"
  | "clock"
  | "clockMode"
  | "clockSpeed"
  | "header"
  | "online"
  | "connection"
  | "saveData"
  | "device"
  | "mock"
  | "touchPointer"
  | "browser"
  | "bars"
  | "edgeToEdge"
  | "width"
  | "dpr"
  | "zoom"
  | "frame"
  | "mat"
  | "vision"
  | "ua"
  | "overflow"
  | "outlines"
  | "grabColor";

export interface Knob {
  id: KnobId;
  label: string;
  category: Category;
  control: Control;
  /** What the editor offers. A switch has two, off first. */
  options: readonly Option[];
  /** More words search finds the knob by. */
  aliases: readonly string[];
  /** The value that is on, as one of the option values where it is one. */
  read(state: DevknobsState): string;
  /** The patch that sets the knob to a value. */
  write(value: string, state: DevknobsState): DevknobsStatePatch;
  /** The patch that puts the knob back to its default. */
  reset: DevknobsStatePatch;
  /** The knob's part of its row's summary, asked only while it is off its default. */
  brief?(state: DevknobsState, live: Live): string;
  /** What a value outside the options is called. */
  name?(value: string): string;
  /** A value typed out in full that is not an option, or null. */
  parse?(text: string): Option | null;
  /** Search reads a typed value as this knob's even when the query does not name it. */
  bare?: boolean;
  /** More values search reaches than the editor lists. */
  extra?(): readonly Option[];
  /** False where the browser has nothing for the knob to act on. */
  available?(): boolean;
  /** The option values the editor shows for this state, in order, where they depend on it. */
  offers?(state: DevknobsState): readonly string[];
  /** False while the knob does nothing, so the editor hides it. Search still sets it. */
  shown?(state: DevknobsState): boolean;
  /**
   * The value another knob brought, which stands in for the default while it
   * does: such a value puts the knob off nothing, and its row's `×` puts it back.
   */
  base?(state: DevknobsState): string | undefined;
}

/** The rows of knobs. */
export type KnobRowId =
  | "scheme"
  | "contrast"
  | "transparency"
  | "vision"
  | "text"
  | "motion"
  | "locale"
  | "location"
  | "clock"
  | "network"
  | "device"
  | "viewport"
  | "debug";

/** Every row: the rows of knobs, and one for each action, under the action's id. */
export type RowId = KnobRowId | Action["id"];

/** One line of the list, with the knobs that read best together. */
export interface KnobRow {
  id: KnobRowId;
  label: string;
  knobs: readonly KnobId[];
  action?: undefined;
}

/**
 * An action's line of the list. It is a row as a knob row is, so the list
 * keeps, orders and drops it by the same rules: it has no knob to set, and
 * the action to run in their place.
 */
export interface ActionRow {
  id: Action["id"];
  label: string;
  /** None, ever: what a knob row sets, an action's row runs. */
  knobs: readonly KnobId[];
  action: Action;
}

export type Row = KnobRow | ActionRow;

/** Something the panel does rather than a knob it sets. Its row comes from what is said here. */
export interface Action {
  id: "grab" | "replay";
  label: string;
  /** What a search result says after the name. */
  long: string;
  /** More words search finds the action by. */
  aliases: readonly string[];
  /** The icon its row and its search result show. */
  icon: IconName;
  /** The binding whose key runs it, which its row shows. */
  binding?: Binding;
  /** Do it. A mode goes on, or off where it is on. */
  run(): void;
  /** Whether a mode or a toggle is on. An action that is neither has none. */
  state?(): "on" | "off" | null;
  /** Turn a mode off, as its row's `×` and reset all do. A toggle those leave alone has none. */
  off?(): void;
  /** Hear a mode go on or off, however it did. Returns the way to stop. */
  watch?(listener: () => void): () => void;
  /** False where the page has nothing for the action to act on. */
  available?(): boolean;
}

/**
 * Every action, in the order the browse list shows them. A new one is an
 * entry here, and its id in `Action`: its row, its search result and its
 * place in the list all follow.
 */
export const ACTIONS: readonly Action[] = [
  {
    id: "grab",
    label: "grab",
    long: "pick an element to copy",
    aliases: ["inspect", "pick", "element", "component", "select", "agent"],
    icon: "square-dashed-mouse-pointer",
    binding: "grab",
    run: () => stage.grab?.set(!stage.grab.isOn()),
    state: () => (stage.grab ? (stage.grab.isOn() ? "on" : "off") : null),
    off: () => stage.grab?.set(false),
    watch: (listener) => stage.grab?.subscribe(() => listener()) ?? (() => {}),
    available: () => stage.grab !== null,
  },
  {
    id: "replay",
    label: "replay animations",
    long: "restart every animation from the start",
    aliases: ["restart", "animation", "rerun"],
    icon: "rotate-ccw",
    binding: "replay",
    run: () => engine.replay(),
  },
];

/** An action's row: named as the action is, with nothing to set. */
export function actionRow(action: Action): ActionRow {
  return { id: action.id, label: action.label, knobs: [], action };
}

/**
 * Every knob, in the order search breaks ties by, the most asked for first:
 * `reduce` is motion before it is transparency. The browse list keeps this
 * order inside each category.
 */
export const KNOBS: readonly Knob[] = [
  SCHEME,
  MOTION,
  SPEED,
  CONTRAST,
  TRANSPARENCY,
  TEXT,
  SPACING,
  LOCALE,
  DIRECTION,
  PSEUDO,
  GEO,
  GEO_ERROR,
  TIME_ZONE,
  CLOCK,
  CLOCK_MODE,
  CLOCK_SPEED,
  HEADER,
  ONLINE,
  CONNECTION,
  SAVE_DATA,
  DEVICE,
  MOCK,
  TOUCH_POINTER,
  BROWSER,
  BARS,
  EDGE_TO_EDGE,
  WIDTH,
  DPR,
  ZOOM,
  FRAME,
  MAT,
  VISION,
  UA,
  OVERFLOW,
  OUTLINES,
  GRAB_COLOR,
];

export const KNOB_ROWS: readonly KnobRow[] = [
  { id: "scheme", label: "scheme", knobs: ["scheme"] },
  { id: "contrast", label: "contrast", knobs: ["contrast"] },
  { id: "transparency", label: "transparency", knobs: ["transparency"] },
  { id: "vision", label: "vision", knobs: ["vision"] },
  { id: "text", label: "text", knobs: ["text", "spacing"] },
  { id: "motion", label: "motion", knobs: ["motion", "speed"] },
  { id: "locale", label: "locale", knobs: ["locale", "direction", "pseudo"] },
  { id: "location", label: "location", knobs: ["geo", "geoError"] },
  {
    id: "clock",
    label: "time",
    knobs: ["clock", "clockMode", "clockSpeed", "timeZone", "header"],
  },
  { id: "network", label: "network", knobs: ["online", "connection", "saveData"] },
  {
    id: "device",
    label: "device",
    knobs: ["device", "mock", "touchPointer", "browser", "bars", "edgeToEdge", "ua"],
  },
  { id: "viewport", label: "viewport", knobs: ["width", "dpr", "zoom", "frame", "mat"] },
  { id: "debug", label: "debug", knobs: ["overflow", "outlines", "grabColor"] },
];

/** Every row: the rows of knobs in the catalog's order, then the actions' in theirs. */
export const ROWS: readonly Row[] = [...KNOB_ROWS, ...ACTIONS.map(actionRow)];

export function knobOf(id: KnobId): Knob {
  const knob = KNOBS.find((entry) => entry.id === id);
  if (!knob) throw new Error(`devknobs: no knob ${id}`);
  return knob;
}

export function rowOf(id: KnobId): KnobRow {
  const row = KNOB_ROWS.find((entry) => entry.knobs.includes(id));
  if (!row) throw new Error(`devknobs: no row for ${id}`);
  return row;
}

/** The knobs this browser can use. */
export function availableKnobs(): Knob[] {
  return KNOBS.filter((knob) => knob.available?.() ?? true);
}

/** The knobs of a row this browser can use. */
export function knobsOf(row: Row): Knob[] {
  return row.knobs.map(knobOf).filter((knob) => knob.available?.() ?? true);
}

export function offDefault(knob: Knob, state: DevknobsState): boolean {
  return knob.read(state) !== (knob.base?.(state) ?? knob.read(DEFAULT_STATE));
}

/** The knob's part of a row summary, empty while it is at its default. */
export function brief(knob: Knob, state: DevknobsState, live: Live): string {
  if (!offDefault(knob, state)) return "";
  return knob.brief?.(state, live) ?? nameOf(knob, knob.read(state));
}

/** The actions this page has something for. */
export function availableActions(): Action[] {
  return ACTIONS.filter((action) => action.available?.() ?? true);
}

/** Whether the row has a place on this page: a row of knobs always, an action's where it has one. */
export function rowHere(row: Row): boolean {
  return row.action?.available?.() ?? true;
}

/** Does any knob of the row differ from its default, or is its action's mode on? */
export function isActive(row: Row, state: DevknobsState): boolean {
  if (row.action) return row.action.state?.() === "on";
  return knobsOf(row).some((knob) => offDefault(knob, state));
}

/** What the row says it emulates, such as `390 · dpr 2`. Empty while it emulates nothing. */
export function summary(row: Row, state: DevknobsState, live: Live): string {
  return knobsOf(row)
    .map((knob) => brief(knob, state, live))
    .filter((part) => part !== "")
    .join(" · ");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Patches as one, merged a level deep like the store merges them. */
export function combine(patches: readonly DevknobsStatePatch[]): DevknobsStatePatch {
  const out: Record<string, unknown> = {};
  for (const patch of patches) {
    for (const [key, value] of Object.entries(patch)) {
      const before = out[key];
      out[key] = isRecord(value) && isRecord(before) ? { ...before, ...value } : value;
    }
  }
  return out as DevknobsStatePatch;
}

/** The patch that puts every knob of the row back to its default. */
export function resetPatch(row: Row): DevknobsStatePatch {
  return combine(row.knobs.map((id) => knobOf(id).reset));
}

/** The browse list: every knob the browser can use, by category. */
export function browse(): { category: Category; knobs: Knob[] }[] {
  const knobs = availableKnobs();
  return CATEGORIES.map((category) => ({
    category,
    knobs: knobs.filter((knob) => knob.category === category),
  })).filter((group) => group.knobs.length > 0);
}
