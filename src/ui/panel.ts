import * as engine from "../engine";
import { now, realNow } from "../engine/clock";
import { deviceOf } from "../engine/devices";
import { frameForced, type KeyAction, needsFrame, readMessage } from "../engine/frame";
import { onCount, overflowCount } from "../engine/overflow";
import { resolveTimeZone } from "../engine/time";
import { isMac, userAgentOf } from "../engine/ua";
import { frameWindow, zoomKey } from "../engine/width";
import type { GrabControl } from "../grab/control";
import type {
  ClockValue,
  DevknobsState,
  DevknobsStatePatch,
  EdgeValue,
  PanelValue,
  SideValue,
} from "../types";
import {
  ACTIONS,
  type Action,
  browse,
  isActive,
  type Knob,
  type KnobId,
  knobsOf,
  type Live,
  nameOf,
  type Option,
  ROWS,
  type Row,
  type RowId,
  rowOf,
  wallInput,
} from "./catalog";
import { BINDING_WORDS, BINDINGS, createKeys, type LiveKeys, recordStep } from "./bindings";
import { createFoldSlider, foldChip } from "./foldslider";
import { ACTION_ICONS, icon, ROW_ICONS } from "./icons";
import {
  type Binding,
  comboLabel,
  comboSpoken,
  escapeStep,
  highlightAt,
  isSearchKey,
  KEYS_FIELD,
  type Keys,
  keyAction,
  paletteMove,
  radioMove,
  typeAhead,
  zoomAction,
} from "./keys";
import {
  arrange,
  isListed,
  isReset,
  listedOrder,
  movePatch,
  pinPatch,
  removePatch,
  rowOrder,
  rowText,
  showsLabel,
} from "./list";
import { createPrefs } from "./prefs";
import { filterOptions, type Result, resultText, search, searchActions } from "./search";
import { createSlide, focusOn, type View } from "./slide";
import { CSS } from "./styles";

export { wallInput } from "./catalog";

export interface PanelOptions {
  /**
   * The keys in force, which the panel shows and lets the user set.
   * Defaults to the built-in ones.
   */
  keys?: LiveKeys;
  /** Grab, where it is on, to show and to turn on from the search. */
  grab?: GrabControl | null;
  /**
   * Show the handle while the panel is closed. Defaults to true. What the
   * user sets in the panel wins over it.
   */
  handle?: boolean;
}

export interface Panel {
  /** Take the panel off the page and drop every listener. */
  destroy(): void;
}

/** What an editor control keeps in step with the knobs. */
type Update = (state: DevknobsState) => void;

interface RowView {
  row: Row;
  box: HTMLElement;
  grip: HTMLButtonElement;
  main: HTMLButtonElement;
  value: HTMLElement;
  clear: HTMLButtonElement;
  /** Folds the editor away under the row's line, and out to its height. */
  fold: HTMLElement;
  editor: HTMLElement;
  updates: Update[];
}

/** A line of the results or the browse list, and what picking it does. */
interface Entry {
  node: HTMLElement;
  pick(): void;
}

/** Pointer travel that turns a click on the handle into a drag. */
const DRAG_SLOP = 4;

/** How long a row's editor takes to fold out, in ms, as the stylesheet sets it. */
const FOLD = 180;

/** The space between two rows, in px, as the stylesheet sets it. */
const ROW_GAP = 1;

/** How near the rows' top or bottom a dragged row scrolls them, and how far a move, in px. */
const ROW_EDGE = 16;
const ROW_SCROLL = 8;

/** How far back the pointer's speed is read from when a drag ends, in ms. */
export const FLING_SPAN = 150;

/** The shortest stretch of a drag a speed is read over, in ms. */
export const FLING_STRETCH = 40;

/** The shortest a whole drag can be and still have a speed, in ms. */
const FLING_LEAST = 8;

/** Speed across, in px per ms, that throws the panel to the other side. */
export const FLING = 0.5;

/** How many times faster than up or down a fling must go across to count as one. */
export const FLING_LEAN = 1.5;

/** Travel across, in px, a drag needs before it can be flung, so a hurried click never is. */
const FLING_TRAVEL = 16;

/** How long a glide takes at the least and at the most, in ms. */
export const GLIDE = 220;
export const GLIDE_MAX = 440;

/** The fastest a glide goes on average, in px per ms, until it takes `GLIDE_MAX`. */
export const GLIDE_SPEED = 6;

/** Space the panel keeps between itself and the top or bottom of the viewport. */
export const PANEL_GAP = 8;

/**
 * How near an edge pulls a box flush with it, in px. More than the panel's
 * corner radius, so the handle never sits on the curve of a corner.
 */
export const SNAP = 24;

const CUSTOM_DEBOUNCE = 200;

/** How long the pointer rests on a control before its tooltip shows, in ms. */
export const TIP_DELAY = 400;

/** Space between a tooltip and its control, and between a tooltip and the window's edge, in px. */
export const TIP_GAP = 6;
export const TIP_MARGIN = 8;

/** How long a chip stays red, and its reason shows, after a key it cannot take, in ms. */
const REFUSED_RED = 1000;
const REFUSED_TIP = 1800;

/** How long the way back to a panel whose handle was just hidden shows, in ms. */
const HANDLE_HINT = 4000;

/**
 * The host's own style. It is as wide and as tall as an open panel whatever
 * the panel is doing, so it never takes a pointer: the stylesheet hands that
 * back to the handle and to a panel that is out, and every other pixel of the
 * box belongs to the page underneath. The side it lives on anchors it to the
 * left or the right edge.
 */
export const HOST_STYLE = "position:fixed;top:0;z-index:2147483646;pointer-events:none";

/**
 * What the footer says about the overflow knob, such as `2 overflowing`.
 * Nothing while the knob is off, or before the count is known.
 */
export function overflowBadge(on: boolean, count: number | null): string {
  return on && count !== null ? `${count} overflowing` : "";
}

/** What a footer hint does when it is clicked or its key is pressed. */
export type Command = "panel" | "search" | "grab" | "replay" | "reset";

/** A key in the footer and the words for what it does. */
export interface KeyChip {
  command: Command;
  key: string;
  word: string;
}

/**
 * The keys the footer names, most used first: the panel's, the search key,
 * the grab key where there is a grab, replay's, and reset last, each as
 * `comboLabel` shows it.
 */
export function keyChips(keys: Keys, grab: boolean, mac: boolean): KeyChip[] {
  const chips: KeyChip[] = [
    { command: "panel", key: comboLabel(keys.panel, mac), word: BINDING_WORDS.panel },
    { command: "search", key: "/", word: "search" },
  ];
  if (grab) {
    chips.push({ command: "grab", key: comboLabel(keys.grab, mac), word: BINDING_WORDS.grab });
  }
  chips.push(
    { command: "replay", key: comboLabel(keys.replay, mac), word: BINDING_WORDS.replay },
    { command: "reset", key: comboLabel(keys.reset, mac), word: BINDING_WORDS.reset },
  );
  return chips;
}

/**
 * What the panel says as the user hides the handle, so the way back to a
 * closed panel is never lost: the panel's key, as `comboLabel` shows it.
 */
export function handleHint(keys: Keys, mac: boolean): string {
  return `press ${comboLabel(keys.panel, mac)} to open knobs`;
}

/**
 * What a drag on the handle moves: a plain one the panel and the handle as
 * one, a shift one the handle alone along the panel's edge. A closed panel
 * has only the handle to move.
 */
export function dragTarget(shift: boolean, open: boolean): "panel" | "handle" {
  return open && !shift ? "panel" : "handle";
}

/** Where the handle and the panel sit, and the edges they sit flush with. */
export type Place = Pick<PanelValue, "y" | "top" | "edge" | "tab">;

/** The heights a layout works with, in px: the window's, the panel's and the handle's. */
export interface Room {
  view: number;
  panel: number;
  handle: number;
}

/** A value kept between two bounds. With no room between them, the lower one. */
function between(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

/**
 * Where a tooltip goes, in window px: centered over its control, under it
 * where there is no room above, and kept inside the window either way.
 */
export function tipAt(
  control: { left: number; top: number; width: number; bottom: number },
  tip: { width: number; height: number },
  view: { width: number; height: number },
): { x: number; y: number } {
  const x = between(
    control.left + (control.width - tip.width) / 2,
    TIP_MARGIN,
    view.width - TIP_MARGIN - tip.width,
  );
  const above = control.top - TIP_GAP - tip.height;
  const y =
    above >= TIP_MARGIN
      ? above
      : between(control.bottom + TIP_GAP, TIP_MARGIN, view.height - TIP_MARGIN - tip.height);
  return { x, y };
}

/**
 * A value kept between two bounds and pulled flush with the nearer one once
 * it is within `SNAP` of it.
 */
export function snap(value: number, min: number, max: number): number {
  const end = Math.max(min, max);
  const at = between(value, min, end);
  if (at - min <= SNAP && at - min <= end - at) return min;
  return end - at <= SNAP ? end : at;
}

/**
 * The end of a span a value sits at, to the half px. A box as big as its span
 * sits at both, and keeps the one it had.
 */
function edgeOf(value: number, min: number, max: number, had: EdgeValue): EdgeValue {
  const top = Math.abs(value - min) < 0.5;
  const bottom = Math.abs(value - max) < 0.5;
  if (top && bottom) return had === "none" ? "top" : had;
  return top ? "top" : bottom ? "bottom" : "none";
}

/**
 * Lay the handle and the panel out for the heights there are. The panel goes
 * to the edge of the window it sits flush with, so one at the bottom grows
 * upward, and the handle to the corner of the panel it sits flush with. What
 * sits flush with nothing keeps its place. Then the window's edges, less the
 * gap, pull the panel flush within `SNAP` and keep it inside, and the panel's
 * corners do the same for the handle. The edges they end up flush with are
 * what the next layout keeps them to, so a layout of a layout moves nothing.
 */
export function settle(place: Place, room: Room): Place {
  const last = room.view - PANEL_GAP - room.panel;
  const top = snap(
    place.edge === "top" ? PANEL_GAP : place.edge === "bottom" ? last : place.top,
    PANEL_GAP,
    last,
  );
  const low = top + room.panel - room.handle;
  const y = snap(place.tab === "top" ? top : place.tab === "bottom" ? low : place.y, top, low);
  return {
    y,
    top,
    edge: edgeOf(top, PANEL_GAP, last, place.edge),
    tab: edgeOf(y, top, low, place.tab),
  };
}

/**
 * The corner of a panel whose top is at `top` that a handle at `y` covers, if
 * any. A closed panel stays where it last showed while its handle may move
 * on, so this is what tells the two apart while the slide back still shows it.
 */
export function cornerAt(y: number, top: number, room: Room): EdgeValue {
  return edgeOf(y, top, top + room.panel - room.handle, "none");
}

/**
 * Where a drag lands, from where it started and where the pointer would put
 * what it moves with no edge pulling: the panel's top for a plain drag, the
 * handle's top for a shift drag or a closed panel's. A plain drag carries the
 * handle along, a shift drag slides it along the panel, and a closed panel's
 * handle snaps to the window's edges and carries the hidden panel along as
 * far as the window lets it, so the panel opens where the handle left it.
 */
export function dragTo(
  target: "panel" | "handle",
  open: boolean,
  to: number,
  from: Place,
  room: Room,
): Place {
  const offset = from.y - from.top;
  if (target === "panel") {
    const top = snap(to, PANEL_GAP, room.view - PANEL_GAP - room.panel);
    return settle({ y: top + offset, top, edge: "none", tab: "none" }, room);
  }
  if (open) return settle({ ...from, y: to, tab: "none" }, room);
  const y = snap(to, PANEL_GAP, room.view - PANEL_GAP - room.handle);
  return settle({ y, top: y - offset, edge: "none", tab: "none" }, room);
}

/** Where the pointer was at a moment of a drag, in px and ms. */
export interface Sample {
  t: number;
  x: number;
  y: number;
}

/** The speed from one sample to a later one, in px per ms. */
function speedOf(from: Sample, to: Sample): { x: number; y: number } {
  const time = to.t - from.t;
  return { x: (to.x - from.x) / time, y: (to.y - from.y) / time };
}

/**
 * The pointer's speed in px per ms as a drag ends: that of its fastest
 * stretch in the `FLING_SPAN` before `at`. A hand slows down, and often
 * stops, before the button comes up, so the speed at the release itself says
 * little about the throw. A stretch is `FLING_STRETCH` long or a little more,
 * so one jittery event does not make a fling, and a pointer that stopped a
 * span before it let go has none. A drag shorter than a stretch is read whole.
 */
export function velocity(samples: Sample[], at: number): { x: number; y: number } {
  const recent = samples.filter((sample) => sample.t >= at - FLING_SPAN && sample.t <= at);
  let fastest = { x: 0, y: 0 };
  let read = false;
  for (const [index, end] of recent.entries()) {
    // The shortest stretch that ends here: from the last sample far enough back.
    let start: Sample | undefined;
    for (const sample of recent.slice(0, index)) {
      if (end.t - sample.t >= FLING_STRETCH) start = sample;
    }
    if (!start) continue;
    const speed = speedOf(start, end);
    if (!read || Math.hypot(speed.x, speed.y) > Math.hypot(fastest.x, fastest.y)) fastest = speed;
    read = true;
  }
  const first = recent[0];
  const last = recent[recent.length - 1];
  if (!read && first && last && last.t - first.t >= FLING_LEAST) return speedOf(first, last);
  return fastest;
}

/** How long a glide over a distance in px takes, in ms: longer the farther it goes. */
export function glideTime(distance: number): number {
  return between(distance / GLIDE_SPEED, GLIDE, GLIDE_MAX);
}

/**
 * The side a dragged panel lands on, from the side it left, the middle of
 * what was dragged across a window `width` wide, and the pointer's speed. A
 * fling toward the other side lands it there wherever it is. Past the middle
 * of the window it lands there too, unless it was flung back home. A fling
 * goes mostly across, so a fast drag up or down never changes sides.
 */
export function landSide(
  side: SideValue,
  x: number,
  width: number,
  vx: number,
  vy: number,
): SideValue {
  const other = side === "right" ? "left" : "right";
  // Speed toward the other side, less than zero toward home.
  const toward = side === "right" ? -vx : vx;
  const across = Math.abs(vx) >= FLING && Math.abs(vx) > FLING_LEAN * Math.abs(vy);
  const past = side === "right" ? x < width / 2 : x > width / 2;
  if (across && toward > 0) return other;
  if (across && toward < 0) return side;
  return past ? other : side;
}

/** A computed `translate`, such as `-120px 4px` or `none`, as px. */
export function translateOf(value: string): { x: number; y: number } {
  const [x = 0, y = 0] = value === "none" ? [] : value.split(" ").map((part) => parseFloat(part));
  return { x: Number.isFinite(x) ? x : 0, y: Number.isFinite(y) ? y : 0 };
}

/** What the clock note says: the time the page reads. */
function clockReadout(): string {
  return `now: ${new Date(now()).toLocaleString()}`;
}

function el(tag: string, className: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(className: string, label: string): HTMLButtonElement {
  const node = document.createElement("button");
  node.type = "button";
  node.className = className;
  node.textContent = label;
  return node;
}

/**
 * A row: its line, with the grip's column kept in the main's leading padding
 * whether a grip is in it or not, its icon, its title and what it ends with,
 * its value or a control, and its x after the main. The knob rows and the
 * settings are all built here, so they line up and take the same styles.
 */
function rowBox(
  main: HTMLElement,
  glyph: Element,
  title: string,
  value?: HTMLElement,
  clear?: HTMLElement,
  grip?: HTMLElement,
): HTMLElement {
  const box = el("div", "row");
  const line = el("div", "line");
  main.append(glyph, el("span", "row-label", title));
  if (value) main.append(value);
  if (grip) line.append(grip);
  line.append(main);
  if (clear) line.append(clear);
  box.append(line);
  return box;
}

function field(className: string, placeholder: string, label: string): HTMLInputElement {
  const node = document.createElement("input");
  node.className = `field ${className}`;
  node.placeholder = placeholder;
  node.autocomplete = "off";
  node.spellcheck = false;
  node.setAttribute("aria-label", label);
  return node;
}

function numberField(placeholder: string, label = placeholder): HTMLInputElement {
  const node = field("field-num", placeholder, label);
  node.type = "number";
  node.step = "any";
  node.inputMode = "decimal";
  return node;
}

/** A number the geo knob can use, so that a half-typed value is not an error. */
function toNumber(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Mark a control as on or off, for the eye and for assistive tech. */
function mark(node: HTMLElement, on: boolean, attribute = "aria-pressed"): void {
  node.classList.toggle("on", on);
  node.setAttribute(attribute, on ? "true" : "false");
}

/**
 * Scroll a box just enough to show a node in it, its top first where all of
 * it does not fit. The box is the node's offset parent.
 */
function reveal(node: HTMLElement, box: HTMLElement): void {
  const top = node.offsetTop;
  const bottom = top + node.offsetHeight;
  if (top < box.scrollTop) box.scrollTop = top;
  else if (bottom > box.scrollTop + box.clientHeight) {
    box.scrollTop = Math.min(top, bottom - box.clientHeight);
  }
}

/** The first control in a box that the tab key stops at and that shows. */
function firstControl(box: Element | null): HTMLElement | null {
  if (!box) return null;
  const controls = Array.from(box.querySelectorAll<HTMLElement>("button, input, textarea"));
  return controls.find((node) => node.tabIndex >= 0 && node.getClientRects().length > 0) ?? null;
}

/** Scroll a box to put a node in its middle. The box is the node's offset parent. */
function center(node: HTMLElement, box: HTMLElement): void {
  box.scrollTop = node.offsetTop - (box.clientHeight - node.offsetHeight) / 2;
}

/**
 * Build the panel, put it on the page and keep it in step with the engine. The
 * host carries an open shadow root, so the page cannot style the panel and the
 * panel cannot style the page.
 *
 * The panel lists the knobs that are off their default or were set from it,
 * one row each, in the order they were added or dragged to, and a row opens
 * into an editor. A fresh panel lists the default rows. Everything else is a
 * search away: the add knob button under the rows opens a field that finds
 * knobs and values, and with nothing typed lists every knob.
 */
export function createPanel(options: PanelOptions = {}): Panel {
  const keys = options.keys ?? createKeys();
  const prefs = createPrefs({ handle: options.handle });
  const grab = options.grab ?? null;
  const mac = isMac();
  /** The actions search finds: grab only where there is one. */
  const actionsHere = grab ? ACTIONS : ACTIONS.filter((action) => action.id !== "grab");
  /** The keys the shortcuts list: grab's only where there is one. */
  const bindingsHere = BINDINGS.filter((binding) => binding !== "grab" || grab !== null);

  const host = document.createElement("div");
  host.setAttribute("data-devknobs", "panel");
  host.style.cssText = HOST_STYLE;
  const root = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = CSS;

  const wrap = el("div", "wrap");
  const handle = button("handle", "knobs");
  handle.title = "drag to move · shift-drag moves the handle";
  const panel = el("div", "panel");

  // A label, so a click anywhere around the field lands in it.
  const head = el("label", "head");
  const searchInput = document.createElement("input");
  searchInput.className = "search";
  searchInput.placeholder = "search knobs";
  searchInput.autocomplete = "off";
  searchInput.spellcheck = false;
  searchInput.setAttribute(KEYS_FIELD, "");
  searchInput.setAttribute("role", "combobox");
  searchInput.setAttribute("aria-label", "find a knob");
  searchInput.setAttribute("aria-autocomplete", "list");
  searchInput.setAttribute("aria-controls", "devknobs-results");
  searchInput.setAttribute("aria-expanded", "false");
  // For the pointer: escape does the same from the keys.
  const closeSearch = button("search-close", "");
  closeSearch.append(icon("x"));
  closeSearch.tabIndex = -1;
  closeSearch.setAttribute("aria-label", "close the search");
  head.append(searchInput, closeSearch);
  // Where the search opens, under the rows, with its results under it.
  const add = button("add", "");
  add.append(icon("plus"), "add knob");

  const body = el("div", "body");
  const empty = el("div", "empty", "nothing emulated");
  const rows = el("div", "rows");
  const results = el("div", "results");
  results.id = "devknobs-results";
  results.setAttribute("role", "listbox");
  results.setAttribute("aria-label", "knobs");
  // Says where a row moved to, and why a key was not taken, for assistive tech.
  const said = el("div", "said");
  said.setAttribute("aria-live", "polite");
  // The settings, in place of the rows: a way back to them, whether the
  // handle shows while the panel is closed, then each binding's key, to set
  // or put back. A key that is not taken shakes its chip and says why in the
  // tooltip.
  const keysView = el("div", "keys pane");
  keysView.setAttribute("role", "group");
  keysView.setAttribute("aria-label", "settings");
  const keysBack = button("main", "");
  keysBack.setAttribute("aria-label", "back from settings");
  const handleSwitch = button("switch row-control", "");
  handleSwitch.setAttribute("role", "switch");
  handleSwitch.setAttribute("aria-label", "show handle");
  // The handle's line has no x, but keeps its room so its switch lines up with the keys.
  const noClear = el("span", "clear");
  noClear.hidden = true;
  keysView.append(
    rowBox(keysBack, icon("chevron-left"), "settings"),
    rowBox(el("div", "main"), el("span", "glyph blank"), "show handle", handleSwitch, noClear),
    el("div", "group-label", "shortcuts"),
  );
  const keyViews = new Map<
    Binding,
    { set: HTMLButtonElement; back: HTMLButtonElement }
  >();
  for (const binding of bindingsHere) {
    const word = BINDING_WORDS[binding];
    const set = button("key-set row-control", "");
    const back = button("clear", "");
    back.append(icon("x"));
    back.setAttribute("aria-label", `put the ${word} key back`);
    keysView.append(rowBox(el("div", "main"), el("span", "glyph blank"), word, set, back));
    keyViews.set(binding, { set, back });
  }
  // The rows view, which the settings slide in over.
  const home = el("div", "home pane");
  home.append(rows, empty, add, head, results);
  body.append(home, keysView, said);
  const slide = createSlide(body, { home, keys: keysView });

  const foot = el("div", "foot");
  const badge = el("span", "badge");
  // The legend of the keys, and the controls they press.
  const meta = el("div", "meta");
  const hints = new Map<Command, HTMLButtonElement>();
  const hintKeys = new Map<Command, HTMLElement>();
  for (const chip of keyChips(keys.get(), grab !== null, mac)) {
    const node = button("hint", "");
    node.dataset.command = chip.command;
    const key = el("kbd", "hint-key", chip.key);
    node.append(key, chip.word);
    meta.append(node);
    hints.set(chip.command, node);
    hintKeys.set(chip.command, key);
  }
  // Opens the settings, where the keys are set.
  const keysToggle = button("hint keys-toggle", "");
  keysToggle.append(icon("settings", 12));
  keysToggle.setAttribute("aria-label", "settings");
  meta.append(keysToggle);
  foot.append(badge, meta);
  // The tooltip the icon-only controls share. Their aria-label already says
  // the same, so assistive tech is not told twice.
  const tip = el("div", "tip");
  tip.setAttribute("aria-hidden", "true");

  panel.append(body, foot, tip);
  wrap.append(handle, panel);
  root.append(style, wrap);

  /** The row whose editor is open. */
  let openRow: RowId | null = null;
  /** The search has focus and lists every knob, as nothing is typed. */
  let browsing = false;
  /** The query the results last showed, so a new one puts the highlight back on top. */
  let shownQuery = "";
  /** A pointer is down, so a blur it caused waits for its click to land. */
  let pressing = false;
  /** What the results or the browse list show, and which one Enter picks. */
  let entries: Entry[] = [];
  let cursor = 0;
  /** The shortcuts show in place of the rows. */
  let editingKeys = false;
  /** The binding waiting for its new key. */
  let recording: Binding | null = null;
  /** Takes the red off a chip whose key was not taken. */
  let refusedTimer = 0;

  /** Leave an input alone while it has the caret, so typing is never cut off. */
  function fill(input: HTMLInputElement | HTMLTextAreaElement, value: string): void {
    if (root.activeElement === input) return;
    if (input.value !== value) input.value = value;
  }

  /** Set knobs from the panel. Their row stays listed from here on. */
  function commit(row: RowId, patch: DevknobsStatePatch): void {
    engine.setState(pinPatch(engine.getState(), row, patch));
  }

  function set(knob: Knob, value: string): void {
    commit(rowOf(knob.id).id, knob.write(value, engine.getState()));
  }

  /** Typing commits once it pauses, each field on a timer of its own. */
  const pending = new Map<() => void, number>();

  function queue(commit: () => void): void {
    clearTimeout(pending.get(commit));
    pending.set(
      commit,
      window.setTimeout(() => {
        pending.delete(commit);
        commit();
      }, CUSTOM_DEBOUNCE),
    );
  }

  /**
   * A radio group is one tab stop, on the choice that is on, and the arrows
   * move the choice as they move the focus.
   */
  function radioGroup(
    knob: Knob,
    track: HTMLElement,
    items: { node: HTMLButtonElement; value: string }[],
  ): Update {
    // The choices shown, in the order they stand.
    const shown = () =>
      Array.from(track.children).flatMap((node) => {
        const item = items.find((entry) => entry.node === node);
        return item && !item.node.hidden ? [item] : [];
      });
    track.addEventListener("keydown", (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const list = shown();
      const at = list.findIndex((item) => item.node === event.target);
      const next = at < 0 ? null : radioMove(event.key, at, list.length);
      const item = next === null ? undefined : list[next];
      if (!item) return;
      event.preventDefault();
      item.node.focus();
      set(knob, item.value);
    });
    return (state) => {
      const current = knob.read(state);
      const list = shown();
      const known = list.some((item) => item.value === current);
      for (const item of items) {
        const on = item.value === current;
        mark(item.node, on, "aria-checked");
        item.node.tabIndex = on || (!known && item === list[0]) ? 0 : -1;
      }
    };
  }

  function segments(knob: Knob): [HTMLElement, Update] {
    const track = el("div", "seg");
    track.setAttribute("role", "radiogroup");
    track.setAttribute("aria-label", knob.label);
    const items = knob.options.map((option) => {
      const node = button("seg-item", option.label);
      node.setAttribute("role", "radio");
      node.addEventListener("click", () => set(knob, option.value));
      track.append(node);
      return { node, value: option.value };
    });
    const update = radioGroup(knob, track, items);
    const offers = knob.offers;
    if (!offers) return [track, update];
    // Only the choices the state offers, in its order.
    return [
      track,
      (state) => {
        const offered = offers(state);
        const order = offered.flatMap((value) => items.filter((item) => item.value === value));
        for (const item of items) item.node.hidden = !order.includes(item);
        const standing = Array.from(track.children).filter(
          (node) => node instanceof HTMLElement && !node.hidden,
        );
        if (order.some((item, at) => standing[at] !== item.node)) {
          track.append(...order.map((item) => item.node));
        }
        update(state);
      },
    ];
  }

  /** Colors as swatches, the one that is on with a ring around it. */
  function swatches(knob: Knob): [HTMLElement, Update] {
    const track = el("div", "swatches");
    track.setAttribute("role", "radiogroup");
    track.setAttribute("aria-label", knob.label);
    const items = knob.options.map((option) => {
      const node = button("swatch", "");
      node.setAttribute("role", "radio");
      node.setAttribute("aria-label", option.label);
      node.title = option.label;
      node.style.background = option.swatch ?? "";
      node.addEventListener("click", () => set(knob, option.value));
      track.append(node);
      return { node, value: option.value };
    });
    return [track, radioGroup(knob, track, items)];
  }

  /**
   * Presets as chips. A value set some other way, from search say, shows as a
   * chip of its own, or in the custom field where the knob has one.
   */
  function chips(knob: Knob, custom: HTMLInputElement | null): [HTMLElement, Update] {
    const box = el("div", "chips");
    box.setAttribute("aria-label", knob.label);
    const items = knob.options.map((option) => {
      const node = button("chip", option.label);
      node.addEventListener("click", () => set(knob, option.value));
      box.append(node);
      return { node, value: option.value };
    });
    const other = el("span", "chip on");
    box.append(custom ?? other);
    return [
      box,
      (state) => {
        const current = knob.read(state);
        let known = false;
        for (const item of items) {
          mark(item.node, item.value === current);
          known ||= item.value === current;
        }
        if (custom) {
          custom.classList.toggle("on", !known);
          fill(custom, known ? "" : current);
          return;
        }
        other.hidden = known || current === "";
        other.textContent = nameOf(knob, current);
      },
    ];
  }

  function toggleSwitch(knob: Knob): [HTMLElement, Update] {
    const [off, on] = knob.options;
    const node = button("switch", "");
    node.setAttribute("role", "switch");
    node.setAttribute("aria-label", knob.label);
    node.addEventListener("click", () => {
      if (!off || !on) return;
      set(knob, knob.read(engine.getState()) === on.value ? off.value : on.value);
    });
    return [node, (state) => mark(node, knob.read(state) === on?.value, "aria-checked")];
  }

  function pickOption(knob: Knob, option: Option): void {
    set(knob, option.value);
    if (!option.opens) return;
    openEditor(rowOf(knob.id).id);
    focusCustom(knob);
  }

  /** Custom user agent picked, its field takes the focus to be typed in. */
  function focusCustom(knob: Knob): void {
    if (knob.id !== "ua") return;
    const field = viewOf(rowOf(knob.id).id)?.editor.querySelector<HTMLElement>(".field-ua");
    field?.focus({ preventScroll: true });
  }

  /**
   * A long list with a filter that also takes a value typed out in full.
   * Unfiltered, grouped values sit under their headings.
   */
  function list(knob: Knob): [HTMLElement, Update] {
    const box = el("div", "list");
    const filter = field("filter", "filter", `filter ${knob.label}`);
    const items = el("div", "items");
    items.setAttribute("role", "listbox");
    items.setAttribute("aria-label", knob.label);
    // A pick keeps the focus where it was, as the list is drawn again under it.
    items.addEventListener("mousedown", (event: MouseEvent) => event.preventDefault());
    box.append(filter, items);
    let shown: Option[] = [];
    let at = -1;
    const draw = (state: DevknobsState) => {
      const current = knob.read(state);
      shown = filterOptions(knob, filter.value);
      if (filter.value.trim() === "" && !shown.some((option) => option.value === current)) {
        shown.unshift({ value: current, label: nameOf(knob, current) });
      }
      const grouped = filter.value.trim() === "";
      const nodes: HTMLElement[] = [];
      let group: string | undefined;
      shown.forEach((option, index) => {
        if (grouped && option.group && option.group !== group) {
          nodes.push(el("div", "group-label", option.group));
        }
        group = option.group;
        const node = button("item", option.label);
        node.setAttribute("role", "option");
        node.tabIndex = -1;
        mark(node, option.value === current, "aria-selected");
        node.classList.toggle("cursor", index === at);
        node.addEventListener("click", () => pickOption(knob, option));
        nodes.push(node);
      });
      items.replaceChildren(...nodes);
      const cursorNode = items.querySelector(".cursor");
      if (cursorNode instanceof HTMLElement) reveal(cursorNode, items);
    };
    filter.addEventListener("input", () => {
      at = filter.value.trim() ? 0 : -1;
      items.scrollTop = 0;
      draw(engine.getState());
    });
    filter.addEventListener("keydown", (event: KeyboardEvent) => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const step = event.key === "ArrowDown" ? 1 : -1;
        at = Math.min(Math.max(at + step, 0), shown.length - 1);
        draw(engine.getState());
      } else if (event.key === "Enter") {
        event.preventDefault();
        const option = shown[Math.max(at, 0)];
        if (option) pickOption(knob, option);
      }
    });
    return [box, draw];
  }

  const widthField = field("chip chip-field", "other", "custom width in pixels");
  widthField.type = "number";
  widthField.inputMode = "numeric";

  function commitWidth(): void {
    const width = Number(widthField.value);
    if (Number.isFinite(width) && width > 0) commit("viewport", { width });
  }

  widthField.addEventListener("input", () => queue(commitWidth));

  function control(knob: Knob): [HTMLElement, Update] {
    if (knob.control === "switch") return toggleSwitch(knob);
    if (knob.control === "segments") return segments(knob);
    if (knob.control === "swatches") return swatches(knob);
    if (knob.control === "list") return list(knob);
    return chips(knob, knob.id === "width" ? widthField : null);
  }

  /** Set the clock to an instant, running unless it stands frozen already. */
  function travel(at: number, since = realNow()): void {
    const frozen = engine.getState().clock.mode === "frozen";
    commit("clock", { clock: { mode: frozen ? "frozen" : "offset", at, since } });
  }

  function clockExtra(): [HTMLElement, Update] {
    const box = el("div", "extra");
    const at = field("field-clock", "", "clock date and time");
    at.type = "datetime-local";
    const note = el("div", "note");
    box.append(at, note);
    // A date and time picked whole runs the clock from there.
    at.addEventListener("change", () => {
      const time = Date.parse(at.value);
      if (!Number.isNaN(time)) travel(time);
    });
    return [
      box,
      (state) => {
        fill(at, state.clock.mode === "system" ? "" : wallInput(state.clock.at));
        note.hidden = state.clock.mode === "system";
        note.textContent = clockReadout();
      },
    ];
  }

  function geoExtra(): [HTMLElement, Update] {
    const box = el("div", "extra");
    const lat = numberField("lat", "latitude");
    const lng = numberField("lng", "longitude");
    const custom = el("div", "fields");
    custom.append(el("span", "unit", "lat"), lat, el("span", "unit", "lng"), lng);
    const route = document.createElement("textarea");
    route.className = "field field-route";
    route.placeholder = "lat,lng per line, or gpx";
    route.spellcheck = false;
    route.setAttribute("aria-label", "route");
    const speed = numberField("speed", "route speed in kilometers per hour");
    const pace = el("div", "fields");
    pace.append(speed, el("span", "unit", "kilometers per hour"));
    const travelBox = el("div", "extra");
    travelBox.append(route, pace);
    box.append(custom, travelBox);
    const commitCustom = () =>
      commit("location", {
        geo: { preset: "custom", lat: toNumber(lat.value), lng: toNumber(lng.value) },
      });
    const commitRoute = () => commit("location", { geo: { preset: "route", route: route.value } });
    const commitSpeed = () => commit("location", { geo: { speed: toNumber(speed.value) } });
    for (const input of [lat, lng]) input.addEventListener("input", () => queue(commitCustom));
    route.addEventListener("input", () => queue(commitRoute));
    speed.addEventListener("input", () => queue(commitSpeed));
    return [
      box,
      (state) => {
        custom.hidden = state.geo.preset !== "custom";
        travelBox.hidden = state.geo.preset !== "route";
        fill(lat, String(state.geo.lat));
        fill(lng, String(state.geo.lng));
        fill(route, state.geo.route);
        fill(speed, String(state.geo.speed));
      },
    ];
  }

  /** A width and a height of the frame's own, a turn of it, and a fold of a foldable, by a chip and by a slider. */
  function deviceExtra(): [HTMLElement, Update] {
    const extra = el("div", "extra extra-device");
    const box = el("div", "fields");
    const width = numberField("width", "viewport width in pixels");
    const height = numberField("height", "viewport height in pixels");
    const rotate = button("chip", "rotate");
    const fold = button("chip", "unfold");
    box.append(width, el("span", "unit", "×"), height, rotate, fold);
    const slider = createFoldSlider((posture) => commit("device", { posture }));
    extra.append(box, slider.node);
    // An empty field is the window's own size.
    const size = (input: HTMLInputElement) => {
      const value = toNumber(input.value);
      return value > 0 ? value : "full";
    };
    const commitSize = () => commit("device", { width: size(width), height: size(height) });
    for (const input of [width, height]) input.addEventListener("input", () => queue(commitSize));
    rotate.addEventListener("click", () => {
      const turned = engine.getState().orientation === "portrait" ? "landscape" : "portrait";
      commit("device", { orientation: turned });
    });
    // The chip takes the hinge from the slider, held or springing, and folds it to the other posture.
    fold.addEventListener("click", () => {
      commit("device", { posture: foldChip(engine.getState().posture).posture });
    });
    return [
      extra,
      (state) => {
        fill(width, typeof state.width === "number" ? String(state.width) : "");
        fill(height, typeof state.height === "number" ? String(state.height) : "");
        rotate.hidden = typeof state.width !== "number" || typeof state.height !== "number";
        fold.hidden = !deviceOf(state.device)?.postures;
        fold.textContent = foldChip(state.posture).label;
        slider.update(state);
      },
    ];
  }

  function zoneExtra(): [HTMLElement, Update] {
    const note = el("div", "note");
    return [
      note,
      (state) => {
        // Only following geo leaves the zone in use unsaid.
        note.hidden = state.timeZone !== "geo";
        note.textContent = `in use: ${resolveTimeZone(state.timeZone, state.geo) ?? "system"}`;
      },
    ];
  }

  /** The custom user agent, shown while custom is picked, and editing it keeps it the custom one. */
  function uaExtra(): [HTMLElement, Update] {
    const custom = document.createElement("textarea");
    custom.className = "field field-ua";
    custom.placeholder = "custom user agent";
    custom.spellcheck = false;
    custom.setAttribute("aria-label", "custom user agent");
    const commitCustom = () => commit("device", { ua: { preset: "custom", custom: custom.value } });
    custom.addEventListener("input", () => queue(commitCustom));
    return [
      custom,
      (state) => {
        custom.hidden = state.ua.preset !== "custom";
        fill(custom, userAgentOf(state.ua));
      },
    ];
  }

  /** What some knobs add under their control: free values and readouts. */
  const EXTRAS: Partial<Record<KnobId, () => [HTMLElement, Update]>> = {
    clock: clockExtra,
    device: deviceExtra,
    geo: geoExtra,
    timeZone: zoneExtra,
    ua: uaExtra,
  };

  function buildEditor(row: Row, editor: HTMLElement): Update[] {
    const updates: Update[] = [];
    for (const knob of knobsOf(row)) {
      const line = el("div", `knob knob-${knob.control}`);
      line.dataset.knob = knob.id;
      const [node, update] = control(knob);
      // The control keeps the knob's name for assistive tech where the label goes.
      if (showsLabel(row, knob)) line.append(el("div", "knob-label", knob.label));
      line.append(node);
      updates.push(update);
      const extra = EXTRAS[knob.id]?.();
      if (extra) {
        line.append(extra[0]);
        updates.push(extra[1]);
      }
      // A knob hides while it does nothing, or while its choices depend on the device and it offers none.
      const { shown, offers } = knob;
      if (shown || offers) {
        updates.push((state) => {
          line.hidden = !(shown?.(state) ?? true) || offers?.(state).length === 0;
        });
      }
      editor.append(line);
    }
    return updates;
  }

  const views: RowView[] = ROWS.map((row) => {
    const grip = button("grip", "");
    grip.append(icon("grip-vertical"));
    grip.setAttribute("aria-label", `move ${row.label}`);
    grip.title = "drag, or press up or down, to reorder";
    const main = button("main", "");
    main.setAttribute("aria-expanded", "false");
    const value = el("span", "row-value");
    const clear = button("clear", "");
    clear.append(icon("x"));
    clear.setAttribute("aria-label", `reset ${row.label}`);
    const box = rowBox(main, icon(ROW_ICONS[row.id]), row.label, value, clear, grip);
    box.dataset.row = row.id;
    const fold = el("div", "fold");
    const editor = el("div", "editor");
    editor.hidden = true;
    fold.inert = true;
    fold.append(editor);
    box.append(fold);
    // A folded editor leaves the layout once it is out of sight, and an open
    // one is in view once it is all out, however late its frames came.
    for (const type of ["transitionend", "transitioncancel"] as const) {
      fold.addEventListener(type, (event: TransitionEvent) => {
        if (event.target !== fold) return;
        if (openRow !== row.id) editor.hidden = true;
        else if (type === "transitionend") reveal(box, rows);
      });
    }
    main.addEventListener("click", () => openEditor(openRow === row.id ? null : row.id));
    clear.addEventListener("click", () => {
      if (openRow === row.id) openRow = null;
      engine.setState(removePatch(engine.getState(), row));
    });
    grip.addEventListener("pointerdown", (event: PointerEvent) => startReorder(event, row.id));
    grip.addEventListener("pointermove", onReorderMove);
    grip.addEventListener("pointerup", (event: PointerEvent) => {
      if (event.pointerId === reorder?.pointer) endReorder(true);
    });
    // The browser took the pointer away: the rows go back where they were.
    for (const type of ["pointercancel", "lostpointercapture"] as const) {
      grip.addEventListener(type, (event: PointerEvent) => {
        if (event.pointerId === reorder?.pointer) endReorder(false);
      });
    }
    grip.addEventListener("keydown", (event: KeyboardEvent) => {
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      event.preventDefault();
      moveRow(row.id, event.key === "ArrowUp" ? -1 : 1);
    });
    return { row, box, grip, main, value, clear, fold, editor, updates: buildEditor(row, editor) };
  });

  /**
   * Stand the rows in the order the state lists them, moving nothing that is
   * in place. A row moved goes off the page and back, which would take its
   * focus and its lists' scroll, so the row with the focus and the open row
   * stay put and the others move around them.
   */
  function orderRows(state: DevknobsState): void {
    const boxes = rowOrder(state).flatMap((id) => viewOf(id)?.box ?? []);
    const focused = root.activeElement;
    const keep = views.flatMap((view) => (focused && view.box.contains(focused) ? [view.box] : []));
    const open = openRow ? viewOf(openRow) : undefined;
    if (open) keep.push(open.box);
    for (const [box, before] of arrange(Array.from(rows.children), boxes, keep)) {
      // An open row that moves anyway, past the row with the focus, keeps its lists' place.
      const lists = Array.from(box.querySelectorAll<HTMLElement>(".items"));
      const tops = lists.map((list) => list.scrollTop);
      rows.insertBefore(box, before);
      lists.forEach((list, at) => {
        list.scrollTop = tops[at] ?? 0;
      });
    }
  }

  /** A listed row dragged by its grip, and where the rows stood when it was picked up. */
  interface Reorder {
    pointer: number;
    grip: HTMLButtonElement;
    /** The pointer's y and the rows' scroll as the press began, and the pointer's y now. */
    startY: number;
    startScroll: number;
    y: number;
    /** It moved past the slop, so it is a drag and not a press. */
    started: boolean;
    boxes: HTMLElement[];
    tops: number[];
    heights: number[];
    /** The row's place in the list, and where it lands if let go now. */
    from: number;
    to: number;
  }

  let reorder: Reorder | null = null;

  /** Say where a row stands now, for assistive tech. */
  function announce(id: RowId): void {
    const order = listedOrder(engine.getState());
    const label = viewOf(id)?.row.label ?? id;
    said.textContent = `${label} moved to ${order.indexOf(id) + 1} of ${order.length}`;
  }

  /**
   * Pick a listed row up by its grip. It is a drag once the pointer travels
   * the slop. The press keeps the focus where it was, so a search stays open.
   */
  function startReorder(event: PointerEvent, id: RowId): void {
    if (event.button !== 0 || reorder || dragging) return;
    const order = listedOrder(engine.getState());
    const from = order.indexOf(id);
    const grip = viewOf(id)?.grip;
    if (from < 0 || !grip) return;
    event.preventDefault();
    const boxes = order.flatMap((entry) => viewOf(entry)?.box ?? []);
    reorder = {
      pointer: event.pointerId,
      grip,
      startY: event.clientY,
      startScroll: rows.scrollTop,
      y: event.clientY,
      started: false,
      boxes,
      tops: boxes.map((box) => box.offsetTop),
      heights: boxes.map((box) => box.offsetHeight),
      from,
      to: from,
    };
    grip.setPointerCapture(event.pointerId);
  }

  /**
   * Put the dragged row under the pointer, held inside the list, and move the
   * rows it passed out of its way. It passes a row once its leading edge is
   * past that row's middle, so an open row, tall with its editor, passes the
   * short ones as readily as they pass it. A scroll of the rows meanwhile
   * counts as travel, so the row stays under the pointer.
   */
  function placeReorder(): void {
    const at = reorder;
    if (!at?.started) return;
    const last = at.boxes.length - 1;
    const top = at.tops[at.from] ?? 0;
    const height = at.heights[at.from] ?? 0;
    const end = (at.tops[last] ?? 0) + (at.heights[last] ?? 0);
    const travel = at.y - at.startY + rows.scrollTop - at.startScroll;
    const shift = between(travel, (at.tops[0] ?? 0) - top, end - top - height);
    at.to = at.boxes.filter((box, index) => {
      const edge = index < at.from ? top + shift : top + height + shift;
      return index !== at.from && (at.tops[index] ?? 0) + (at.heights[index] ?? 0) / 2 < edge;
    }).length;
    const step = height + ROW_GAP;
    at.boxes.forEach((box, index) => {
      let y = 0;
      if (index === at.from) y = shift;
      else if (index > at.from && index <= at.to) y = -step;
      else if (index < at.from && index >= at.to) y = step;
      box.style.transform = y === 0 ? "" : `translateY(${y}px)`;
    });
  }

  function onReorderMove(event: PointerEvent): void {
    const at = reorder;
    if (!at || event.pointerId !== at.pointer) return;
    at.y = event.clientY;
    if (!at.started && Math.abs(at.y - at.startY) < DRAG_SLOP) return;
    if (!at.started) {
      at.started = true;
      rows.classList.add("reordering");
      at.boxes[at.from]?.classList.add("lifted");
    }
    // Near the top or the bottom of the rows, a list taller than its room scrolls.
    const area = rows.getBoundingClientRect();
    if (at.y < area.top + ROW_EDGE) rows.scrollTop -= ROW_SCROLL;
    else if (at.y > area.bottom - ROW_EDGE) rows.scrollTop += ROW_SCROLL;
    placeReorder();
  }

  /**
   * Let a dragged row go: where it was dragged to with `keep`, else back
   * where it was. The rows jump to their places, as they already show there.
   */
  function endReorder(keep: boolean): void {
    const at = reorder;
    if (!at) return;
    reorder = null;
    if (at.grip.hasPointerCapture(at.pointer)) at.grip.releasePointerCapture(at.pointer);
    rows.classList.remove("reordering");
    for (const box of at.boxes) {
      box.classList.remove("lifted");
      box.style.transform = "";
    }
    if (!keep || !at.started || at.to === at.from) return;
    const id = listedOrder(engine.getState())[at.from];
    engine.setState(movePatch(engine.getState(), at.from, at.to));
    if (id) announce(id);
  }

  /** Move a listed row a step up or down from the keys, its grip keeping the focus. */
  function moveRow(id: RowId, step: number): void {
    const state = engine.getState();
    const order = listedOrder(state);
    const from = order.indexOf(id);
    const to = between(from + step, 0, order.length - 1);
    const view = viewOf(id);
    if (from < 0 || to === from || !view) return;
    engine.setState(movePatch(state, from, to));
    reveal(view.box, rows);
    announce(id);
  }

  function viewOf(id: RowId): RowView | undefined {
    return views.find((view) => view.row.id === id);
  }

  /** The frame that keeps an opening row in view, while its editor folds out. */
  let following = 0;

  /**
   * Keep a row in view as its editor folds out: all of it where it fits, else
   * its line at the top. Rows above it stay where they are while it fits.
   */
  function follow(view: RowView): void {
    cancelAnimationFrame(following);
    const until = performance.now() + FOLD;
    const step = (time: number) => {
      if (openRow !== view.row.id) return;
      reveal(view.box, rows);
      if (time < until) following = requestAnimationFrame(step);
    };
    reveal(view.box, rows);
    following = requestAnimationFrame(step);
  }

  /**
   * Open one row's editor in place under its line, closing any other, or
   * close them all with null. The focus in an editor that closes goes back to
   * its row's line.
   */
  function openEditor(id: RowId | null): void {
    const closing = openRow && openRow !== id ? viewOf(openRow) : undefined;
    const focused = root.activeElement;
    openRow = id;
    render();
    if (closing && focused && closing.fold.contains(focused)) {
      closing.main.focus({ preventScroll: true });
    }
    const view = id ? viewOf(id) : undefined;
    if (!view) return;
    // A long list opens with the value that is on in its middle.
    for (const items of Array.from(view.editor.querySelectorAll<HTMLElement>(".items"))) {
      const on = items.querySelector<HTMLElement>(".on");
      if (on) center(on, items);
    }
    follow(view);
  }

  /**
   * Fold a row's editor out or away. It is laid out while it folds and while
   * it is open, and leaves the layout once it has folded away, or at once
   * where nothing animates. A row that was not on the page has nothing to
   * fold out from, so it shows folded first.
   */
  function foldRow(view: RowView, expanded: boolean, shown: boolean): void {
    const was = view.box.classList.contains("open");
    if (expanded && !was && !shown) view.box.getBoundingClientRect();
    view.box.classList.toggle("open", expanded);
    view.fold.inert = !expanded;
    if (expanded) view.editor.hidden = false;
    else if (!was || view.box.hidden || getComputedStyle(view.fold).transitionDuration === "0s") {
      view.editor.hidden = true;
    }
  }

  /** What the copy inside the width knob's frame last counted, null until it says. */
  let frameCount: number | null = null;

  function liveOf(state: DevknobsState): Live {
    const framed = needsFrame(state);
    if (!framed) frameCount = null;
    return { now: now(), real: realNow(), overflow: framed ? frameCount : overflowCount() };
  }

  function setCursor(index: number): void {
    cursor = highlightAt(index, entries.length);
    entries.forEach((entry, at) => {
      entry.node.classList.toggle("cursor", at === cursor);
      entry.node.setAttribute("aria-selected", at === cursor ? "true" : "false");
    });
    const current = entries[cursor];
    if (current) {
      searchInput.setAttribute("aria-activedescendant", current.node.id);
      reveal(current.node, results);
    } else searchInput.removeAttribute("aria-activedescendant");
  }

  function entry(id: number, pick: () => void, ...parts: (Element | string)[]): Entry {
    const node = el("div", "entry");
    node.id = `devknobs-entry-${id}`;
    node.setAttribute("role", "option");
    node.append(...parts);
    node.addEventListener("click", pick);
    node.addEventListener("pointermove", () => {
      if (entries[cursor]?.node === node) return;
      setCursor(entries.findIndex((item) => item.node === node));
    });
    return { node, pick };
  }

  function actionEntry(id: number, action: Action): Entry {
    return entry(
      id,
      () => runAction(action.id),
      icon(ACTION_ICONS[action.id]),
      el("span", "entry-knob", action.label),
      el("span", "entry-value", action.long),
    );
  }

  function resultEntries(query: string, state: DevknobsState): Entry[] {
    const actions = searchActions(query, actionsHere);
    const found = search(query).map((result, index) => {
      const text = resultText(result);
      const value = el("span", "entry-value", text.value);
      const current = result.option !== null && result.knob.read(state) === result.option.value;
      value.classList.toggle("current", current);
      return entry(
        actions.length + index,
        () => pick(result),
        icon(ROW_ICONS[rowOf(result.knob.id).id]),
        el("span", "entry-knob", text.knob),
        value,
      );
    });
    return [...actions.map((action, index) => actionEntry(index, action)), ...found];
  }

  function browseEntries(state: DevknobsState): { nodes: HTMLElement[]; list: Entry[] } {
    const nodes: HTMLElement[] = [];
    const list: Entry[] = [];
    nodes.push(el("div", "group-label", "actions"));
    for (const action of actionsHere) {
      const item = actionEntry(list.length, action);
      list.push(item);
      nodes.push(item.node);
    }
    for (const group of browse()) {
      nodes.push(el("div", "group-label", group.category));
      for (const knob of group.knobs) {
        const item = entry(
          list.length,
          () => openKnob(knob),
          icon(ROW_ICONS[rowOf(knob.id).id]),
          el("span", "entry-name", knob.label),
          el("span", "entry-now", nameOf(knob, knob.read(state))),
        );
        list.push(item);
        nodes.push(item.node);
      }
    }
    return { nodes, list };
  }

  /** Show the active rows, the results of a query, or every knob to browse. */
  function renderBody(state: DevknobsState): void {
    const query = searchInput.value.trim();
    const mode = editingKeys ? "keys" : query ? "results" : browsing ? "browse" : "rows";
    slide.show(mode === "keys" ? "keys" : "home", state.panel.open, () => {
      wrap.dataset.mode = mode;
    });
    searchInput.setAttribute("aria-expanded", mode === "rows" ? "false" : "true");
    if (mode === "results") {
      entries = resultEntries(query, state);
      const nodes = entries.map((item) => item.node);
      results.replaceChildren(...(nodes.length ? nodes : [el("div", "empty", "no knob found")]));
    } else if (mode === "browse") {
      const { nodes, list: items } = browseEntries(state);
      entries = items;
      results.replaceChildren(...nodes);
    } else {
      entries = [];
      results.replaceChildren();
    }
    setCursor(highlightAt(cursor, entries.length, query !== shownQuery));
    shownQuery = query;
  }

  /** Close the results and leave the search, query and all, for the rows. */
  function leaveSearch(): void {
    searchInput.value = "";
    browsing = false;
    cursor = 0;
    results.scrollTop = 0;
    // The blur renders.
    if (root.activeElement === searchInput) searchInput.blur();
    else render();
  }

  /**
   * Bring a row into view and hand it the focus the search had: the knob's
   * first control where its editor is open, so its value can be set at once,
   * else the row itself.
   */
  function showRow(id: RowId, knob: Knob): void {
    const view = viewOf(id);
    if (!view) return;
    reveal(view.box, rows);
    const line = openRow === id ? view.editor.querySelector(`[data-knob="${knob.id}"]`) : null;
    // The rows keep the row in view themselves, as its editor folds out.
    (firstControl(line) ?? view.main).focus({ preventScroll: true });
  }

  /** Do what an action says. */
  function runAction(id: Action["id"]): void {
    if (id === "replay") {
      engine.replay();
      return;
    }
    grab?.set(true);
  }

  /**
   * Grab, however it went on, takes the focus out of the panel, to the page,
   * so the arrows, Enter, `c` and escape are grab's at once. Off, it leaves
   * the focus where it is.
   */
  function onGrab(on: boolean): void {
    if (on) {
      if (browsing || searchInput.value) leaveSearch();
      const focused = root.activeElement;
      if (focused instanceof HTMLElement) focused.blur();
    }
  }

  /** Set a result's value, or add and open the row of a knob found by name. */
  function pick(result: Result): void {
    const { knob, option } = result;
    if (!option) {
      openKnob(knob);
      return;
    }
    const id = rowOf(knob.id).id;
    leaveSearch();
    // Another knob holds the frame up, so the frame knob has nothing to set.
    if (knob.id === "frame" && frameForced(engine.getState())) return;
    if (knob.offers && !knob.offers(engine.getState()).includes(option.value)) return;
    set(knob, option.value);
    if (option.opens) openEditor(id);
    showRow(id, knob);
    if (option.opens) focusCustom(knob);
  }

  /** A knob picked by name adds its row as it is, listed until its `×` takes it off. */
  function openKnob(knob: Knob): void {
    const id = rowOf(knob.id).id;
    leaveSearch();
    commit(id, {});
    openEditor(id);
    showRow(id, knob);
  }

  function render(): void {
    const state = engine.getState();
    const open = state.panel.open;
    wrap.dataset.open = open ? "true" : "false";
    const handleShown = prefs.get().handle;
    wrap.dataset.handle = handleShown ? "shown" : "hidden";
    mark(handleSwitch, handleShown, "aria-checked");
    panel.toggleAttribute("inert", !open);
    handle.setAttribute("aria-expanded", open ? "true" : "false");
    const live = liveOf(state);
    let anyShown = false;
    orderRows(state);
    for (const view of views) {
      const listed = isListed(view.row, state);
      const expanded = openRow === view.row.id;
      anyShown ||= listed || expanded;
      const shown = !view.box.hidden;
      view.box.hidden = !listed && !expanded;
      foldRow(view, expanded, shown);
      view.main.setAttribute("aria-expanded", expanded ? "true" : "false");
      view.value.textContent = rowText(view.row, state, live);
      view.value.classList.toggle("idle", !isActive(view.row, state));
      view.clear.hidden = !listed;
      view.grip.hidden = !listed;
      if (expanded) for (const update of view.updates) update(state);
    }
    const hot = state.overflow && live.overflow !== null && live.overflow > 0;
    viewOf("debug")?.value.classList.toggle("hot", hot);
    empty.hidden = anyShown;
    rows.hidden = !anyShown;
    const resetHint = hints.get("reset");
    if (resetHint) resetHint.disabled = isReset(state);
    badge.textContent = overflowBadge(state.overflow, live.overflow);
    badge.hidden = badge.textContent === "";
    badge.classList.toggle("hot", hot);
    renderBody(state);
    renderKeys();
    layout();
  }

  /** Show the keys in force: on the handle, the footer and the shortcuts. */
  function renderKeys(): void {
    const now = keys.get();
    handle.setAttribute("aria-label", `devknobs, press ${comboSpoken(now.panel)}`);
    for (const chip of keyChips(now, grab !== null, mac)) {
      const key = hintKeys.get(chip.command);
      if (key) key.textContent = chip.key;
    }
    keysToggle.setAttribute("aria-pressed", editingKeys ? "true" : "false");
    for (const [binding, view] of keyViews) {
      const word = BINDING_WORDS[binding];
      const on = recording === binding;
      view.set.textContent = on ? "press keys…" : comboLabel(now[binding], mac);
      view.set.classList.toggle("recording", on);
      view.set.setAttribute(
        "aria-label",
        on ? `press the new ${word} key` : `${word}, ${comboSpoken(now[binding])}, change`,
      );
      view.back.hidden = !keys.custom(binding);
    }
  }

  /** The keys of the bindings listed, which a new key must not be one of. */
  function keysHere(): Partial<Keys> {
    const now = keys.get();
    return Object.fromEntries(bindingsHere.map((binding) => [binding, now[binding]]));
  }

  /**
   * Wait for a binding's new key. Until it comes, every key goes to the
   * recording and to nothing else: not to the panel, grab or the page.
   */
  function startRecording(binding: Binding): void {
    recording = binding;
    keys.recording = true;
    // Grab's mode reads the keys ahead of the panel, escape and the arrows too.
    grab?.set(false);
    renderKeys();
    keyViews.get(binding)?.set.focus({ preventScroll: true });
  }

  function stopRecording(): void {
    if (recording === null) return;
    const chip = keyViews.get(recording)?.set;
    recording = null;
    keys.recording = false;
    if (chip) unrefuse(chip);
    renderKeys();
  }

  /**
   * A key pressed while a binding records. Tab moves on, and the blur that
   * follows ends it. Every other key is swallowed: escape cancels, a key the
   * binding can take becomes its key, and one it cannot says why.
   */
  function recordKey(event: KeyboardEvent, binding: Binding): void {
    if (event.key === "Tab") {
      stopRecording();
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    const step = recordStep(event, binding, keysHere());
    const chip = keyViews.get(binding)?.set;
    // The reason a key was refused stays until the next key.
    if (chip && tipFor === chip) hideTip();
    if (step.type === "cancel") stopRecording();
    else if (step.type === "refuse" && chip) refuse(chip, step.reason);
    else if (step.type === "keep") {
      stopRecording();
      keys.set(binding, step.combo);
    }
  }

  /**
   * A key the chip's binding cannot take: the chip shakes and goes red for a
   * moment, and the tooltip over it says why, as the live region does. A
   * second one starts it all again.
   */
  function refuse(chip: HTMLElement, reason: string): void {
    clearTimeout(refusedTimer);
    chip.classList.remove("refused");
    // Read the layout, so the shake starts over.
    void chip.offsetWidth;
    chip.classList.add("refused");
    refusedTimer = window.setTimeout(() => chip.classList.remove("refused"), REFUSED_RED);
    showTip(chip, reason, true);
    tipTimer = window.setTimeout(hideTip, REFUSED_TIP);
    said.textContent = reason;
  }

  function unrefuse(chip: HTMLElement): void {
    clearTimeout(refusedTimer);
    chip.classList.remove("refused");
    if (tipFor === chip) hideTip();
  }

  /** Hand the focus to what a view takes it on, as it slides there. */
  function focusView(view: View): void {
    (focusOn(view) === "back" ? keysBack : keysToggle).focus({ preventScroll: true });
  }

  function openKeys(): void {
    if (browsing || searchInput.value) leaveSearch();
    editingKeys = true;
    render();
    focusView("keys");
  }

  /** The control whose tooltip shows, or is about to once the pointer rests. */
  let tipFor: HTMLElement | null = null;
  let tipTimer = 0;

  function showTip(node: HTMLElement, text: string, hot = false): void {
    clearTimeout(tipTimer);
    tipFor = node;
    tip.textContent = text;
    tip.classList.toggle("hot", hot);
    const place = tipAt(
      node.getBoundingClientRect(),
      { width: tip.offsetWidth, height: tip.offsetHeight },
      { width: window.innerWidth, height: window.innerHeight },
    );
    // The wrapper is translated, so it is what the tooltip is placed in.
    const box = wrap.getBoundingClientRect();
    tip.style.left = `${place.x - box.left}px`;
    tip.style.top = `${place.y - box.top}px`;
    tip.classList.add("on");
  }

  /** Hide the tooltip, and say whether one showed. */
  function hideTip(): boolean {
    clearTimeout(tipTimer);
    const shown = tip.classList.contains("on");
    tip.classList.remove("on");
    tipFor = null;
    return shown;
  }

  /**
   * Give an icon-only control a tooltip: after a rest of the pointer, or at
   * once when the keys bring the focus to it. A press, leaving or escape
   * hides it, and a pressed control keeps it hidden until the pointer leaves.
   */
  function tooltip(node: HTMLElement, text: string): void {
    let pressed = false;
    node.addEventListener("pointerenter", () => {
      if (pressed || tipFor === node) return;
      clearTimeout(tipTimer);
      tipFor = node;
      tipTimer = window.setTimeout(() => showTip(node, text), TIP_DELAY);
    });
    node.addEventListener("pointerleave", () => {
      pressed = false;
      if (tipFor === node && !node.matches(":focus-visible")) hideTip();
    });
    node.addEventListener("pointerdown", () => {
      pressed = true;
      hideTip();
    });
    node.addEventListener("focus", () => {
      if (node.matches(":focus-visible")) showTip(node, text);
    });
    node.addEventListener("blur", () => {
      if (tipFor === node) hideTip();
    });
  }

  function leaveKeys(): void {
    stopRecording();
    editingKeys = false;
    render();
    focusView("home");
  }

  keysToggle.addEventListener("click", () => (editingKeys ? leaveKeys() : openKeys()));
  keysBack.addEventListener("click", leaveKeys);
  tooltip(keysToggle, "settings");
  // Hiding the handle says how to bring the closed panel back, so nobody is shut out.
  handleSwitch.addEventListener("click", () => {
    const on = !prefs.get().handle;
    prefs.setHandle(on);
    if (on) {
      if (tipFor === handleSwitch) hideTip();
      return;
    }
    const hint = handleHint(keys.get(), mac);
    showTip(handleSwitch, hint);
    tipTimer = window.setTimeout(hideTip, HANDLE_HINT);
    said.textContent = hint;
  });
  for (const [binding, view] of keyViews) {
    view.set.addEventListener("click", () => {
      if (recording === binding) stopRecording();
      else startRecording(binding);
    });
    view.set.addEventListener("blur", () => {
      if (recording === binding) stopRecording();
    });
    view.back.addEventListener("click", () => {
      stopRecording();
      keys.set(binding, null);
      view.set.focus({ preventScroll: true });
    });
  }

  /** The clock runs between knob changes, and its readouts with it. */
  function tick(): void {
    const state = engine.getState();
    if (!state.panel.open) return;
    const live = liveOf(state);
    for (const view of views) {
      if (!view.box.hidden) view.value.textContent = rowText(view.row, state, live);
    }
    if (openRow === "clock") for (const update of viewOf("clock")?.updates ?? []) update(state);
  }

  /** The heights the panel lays itself out with, as they are now. */
  function measure(): Room {
    return {
      view: window.innerHeight,
      panel: panel.getBoundingClientRect().height,
      handle: handle.getBoundingClientRect().height,
    };
  }

  /** Where the panel last showed, and whether it showed the last time it was placed. */
  let shownTop = engine.getState().panel.top;
  let shownOpen = engine.getState().panel.open;

  /**
   * Make a change to the wrapper show at once, with no transition. A slide
   * that was running stops where the change puts it.
   */
  function jump(change: () => void): void {
    const was = wrap.style.transitionProperty;
    wrap.style.transitionProperty = "none";
    change();
    // Read the style back, so the change is in before the transitions return.
    wrap.getBoundingClientRect();
    wrap.style.transitionProperty = was;
  }

  /**
   * Put the handle and the panel where a place says, on the side it says.
   * `tab` tells the stylesheet which corner of the panel the handle covers,
   * if any, open or closed, so that corner stays square for as long as the
   * panel shows, the slide back and a toggle halfway through it included.
   * Closed, the panel stays where it last showed, so it slides out from its
   * own spot whatever the handle does, and takes the place it has by then
   * when it opens. The layout that closes it still moves it, as closing
   * leaves the search and the panel shows a last time at its new height.
   * The closed slide points the other way on the other side, so a change of
   * side jumps there rather than sweep across the window.
   */
  function placePanel(at: Place, open: boolean, side: SideValue): void {
    if (open || shownOpen) shownTop = at.top;
    shownOpen = open;
    if (wrap.dataset.side !== side) {
      jump(() => {
        wrap.dataset.side = side;
        host.style.left = side === "left" ? "0" : "";
        host.style.right = side === "right" ? "0" : "";
      });
    }
    wrap.dataset.tab = open ? at.tab : cornerAt(at.y, shownTop, measure());
    host.style.top = `${at.y}px`;
    panel.style.marginTop = `${shownTop - at.y}px`;
  }

  /**
   * Lay the panel out for the heights there are now and store where it
   * landed. The store renders again from here, which lays it out a second
   * time and finds nothing left to move. A drag owns the place until it ends,
   * and a handle with no height is off the page, with nothing to measure.
   */
  function layout(): void {
    if (dragging) return;
    const stored = engine.getState().panel;
    const room = measure();
    const next = room.handle > 0 ? settle(stored, room) : stored;
    placePanel(next, stored.open, stored.side);
    const moved =
      next.y !== stored.y ||
      next.top !== stored.top ||
      next.edge !== stored.edge ||
      next.tab !== stored.tab;
    if (moved) engine.setState({ panel: next });
  }

  /** What had the focus on the page when the panel opened. */
  let focusBefore: Element | null = null;

  /**
   * Open or close the panel. Opened, it shows by the time the store has
   * rendered, and the add knob button takes the focus, where typing a knob's
   * name opens the search with it. Closed, it keeps no focus, so the next
   * keys go to the page, to what had them before it opened when that is
   * still there. Says whether the focus moved, so the key that did it is not
   * typed where the focus went.
   */
  function toggle(open?: boolean): boolean {
    const was = engine.getState().panel.open;
    const next = open ?? !was;
    let moved = false;
    if (!next) {
      browsing = false;
      searchInput.value = "";
      editingKeys = false;
      stopRecording();
      hideTip();
      const focused = root.activeElement;
      if (focused instanceof HTMLElement) {
        moved = true;
        focused.blur();
        const back = focusBefore;
        // A hidden handle hides once the panel has slid away, which would drop the focus.
        const shown = back !== handle || prefs.get().handle;
        if (back instanceof HTMLElement && back !== document.body && back.isConnected && shown) {
          back.focus({ preventScroll: true });
        }
      }
      focusBefore = null;
    } else if (!was) {
      // The focus inside a shadow root, the handle's included, as the host takes none.
      let at = document.activeElement;
      while (at?.shadowRoot?.activeElement) at = at.shadowRoot.activeElement;
      focusBefore = at;
    }
    engine.setState({ panel: { open: next } });
    if (!next || was) return moved;
    add.focus({ preventScroll: true });
    return true;
  }

  /**
   * Open the search where the add knob button was, list the knobs and focus
   * it, with `text` typed in where there is some. The field shows only once
   * it is open, so it is opened before it takes the focus.
   */
  function startBrowsing(text = ""): void {
    stopRecording();
    editingKeys = false;
    if (text) {
      searchInput.value += text;
      results.scrollTop = 0;
    }
    if (!browsing || text) {
      browsing = true;
      render();
    }
    searchInput.focus({ preventScroll: true });
  }

  searchInput.addEventListener("focus", () => {
    if (browsing) return;
    browsing = true;
    render();
  });
  add.addEventListener("click", () => startBrowsing());
  searchInput.addEventListener("blur", () => {
    // The window lost the focus and the search kept it, or a press took it and
    // leaves the search once its click has landed.
    if (root.activeElement === searchInput || pressing) return;
    leaveSearch();
  });
  // A click around the field lands here too.
  searchInput.addEventListener("click", () => startBrowsing());
  searchInput.addEventListener("input", () => {
    browsing = true;
    results.scrollTop = 0;
    render();
  });
  searchInput.addEventListener("keydown", (event: KeyboardEvent) => {
    const move = event.isComposing ? null : paletteMove(event.key, cursor, entries.length);
    if (!move) return;
    event.preventDefault();
    if (event.key !== "Enter" && !browsing && !searchInput.value.trim()) {
      browsing = true;
      render();
      return;
    }
    setCursor(move.cursor);
    if (move.pick) entries[move.cursor]?.pick();
  });
  // A press on a result or the scrollbar keeps the focus in the search, so the
  // list stays put under it.
  results.addEventListener("mousedown", (event: MouseEvent) => event.preventDefault());
  rows.addEventListener("scroll", placeReorder);
  closeSearch.addEventListener("mousedown", (event: MouseEvent) => event.preventDefault());
  closeSearch.addEventListener("click", () => {
    leaveSearch();
    add.focus({ preventScroll: true });
  });

  function onPointerDown(): void {
    pressing = true;
  }

  /**
   * A press anywhere but the search and its results leaves the search. It
   * does so after the click, as the rows that come back move what was under
   * the pointer, and the click would land on something else.
   */
  function onPointerUp(): void {
    pressing = false;
    if (!browsing && !searchInput.value) return;
    window.setTimeout(() => {
      if (root.activeElement !== searchInput && (browsing || searchInput.value)) leaveSearch();
    });
  }

  /** Every knob back to its default, the default rows listed and the search left. */
  function resetAll(): void {
    openRow = null;
    searchInput.value = "";
    engine.reset();
  }

  function runCommand(command: Command): void {
    if (command === "panel") toggle(false);
    else if (command === "search") startBrowsing();
    else if (command === "grab") runAction("grab");
    else if (command === "replay") engine.replay();
    else resetAll();
  }

  for (const [command, node] of hints) node.addEventListener("click", () => runCommand(command));

  let dragging = false;
  let dragged = false;
  /** The pointer that drags. Another one pressed meanwhile is left alone. */
  let pointer = -1;
  let startPointer = 0;
  let lastPointer = 0;
  let startX = 0;
  let lastX = 0;
  /** What the drag moves, where things sat when it took that over, and where they sit now. */
  let moving: "panel" | "handle" | null = null;
  let dragFrom: Place = engine.getState().panel;
  let dragAt: Place = dragFrom;
  /** Where the pointer would put what the drag moves, with no edge pulling it. */
  let loose = 0;
  /**
   * How far the drag carries what shows across, off its side, and down, which
   * is more than nothing only where it took over a glide that had not ended.
   */
  let across = 0;
  let down = 0;
  /** Where the pointer went lately, for its speed as it lets go. */
  let samples: Sample[] = [];

  /** The box of what shows: the handle, and the panel with it while it is open. */
  function shownBox(open: boolean): { left: number; top: number; width: number } {
    const tab = handle.getBoundingClientRect();
    if (!open) return { left: tab.left, top: tab.top, width: tab.width };
    const box = panel.getBoundingClientRect();
    const left = Math.min(tab.left, box.left);
    return { left, top: Math.min(tab.top, box.top), width: Math.max(tab.right, box.right) - left };
  }

  /** The window's width less a scrollbar, the room the host is fixed in. */
  function viewWidth(): number {
    return document.documentElement.clientWidth || window.innerWidth;
  }

  function sample(event: PointerEvent): void {
    samples = samples.filter((at) => at.t >= event.timeStamp - FLING_SPAN);
    samples.push({ t: event.timeStamp, x: event.clientX, y: event.clientY });
  }

  // A mouse press must not focus the handle: a key held mid-drag (shift) would
  // otherwise turn that focus into a visible ring. Keyboard focus is unaffected.
  handle.addEventListener("mousedown", (event: MouseEvent) => event.preventDefault());
  handle.addEventListener("pointerdown", (event: PointerEvent) => {
    if (event.button !== 0 || dragging) return;
    const { y, top, edge, tab } = engine.getState().panel;
    dragging = true;
    dragged = false;
    pointer = event.pointerId;
    startPointer = event.clientY;
    lastPointer = event.clientY;
    startX = event.clientX;
    lastX = event.clientX;
    samples = [];
    sample(event);
    moving = null;
    dragAt = { y, top, edge, tab };
    handle.setPointerCapture(event.pointerId);
  });

  handle.addEventListener("pointermove", (event: PointerEvent) => {
    if (!dragging || event.pointerId !== pointer) return;
    // Every move goes by its own step, so the slop is never paid back as a
    // jump and shift can take over halfway through without one either.
    const step = event.clientY - lastPointer;
    const stepX = event.clientX - lastX;
    lastPointer = event.clientY;
    lastX = event.clientX;
    sample(event);
    const travel = Math.hypot(event.clientX - startX, event.clientY - startPointer);
    if (!dragged && travel < DRAG_SLOP) return;
    if (!dragged) {
      // A glide still running stops where it shows, and the drag carries it on
      // from there, one to one with the pointer. An open or close slide runs on.
      ({ x: across, y: down } = translateOf(getComputedStyle(wrap).translate));
      wrap.style.transitionProperty = "transform";
      // The edge takes its free shape in the usual time, whatever the last glide took.
      wrap.style.removeProperty("--glide");
    }
    dragged = true;
    // The panel and the handle move as one, and shift lets the handle go
    // alone, halfway through a drag too, from where it shows.
    const { open, side } = engine.getState().panel;
    const target = dragTarget(event.shiftKey, open);
    wrap.dataset.drag = target;
    if (target !== moving) {
      moving = target;
      dragFrom = dragAt;
      loose = target === "panel" ? dragAt.top : dragAt.y;
    }
    loose += step;
    // Not through the store: a pointermove is no reason to re-apply every knob.
    dragAt = dragTo(target, open, loose, dragFrom, measure());
    placePanel(dragAt, open, side);
    // Across, what shows follows the pointer as far as the window goes. A
    // shift drag slides the handle along the panel and nowhere else.
    if (target === "panel" || !open) {
      const box = shownBox(open);
      const home = box.left - across;
      across = between(across + stepX, -home, viewWidth() - box.width - home);
    }
    wrap.style.translate = `${across}px ${down}px`;
    // Off its edge, the side that was against the window is drawn as a free one.
    wrap.dataset.float = across !== 0 ? "true" : "false";
  });

  /**
   * Put the panel down at a place, or back at its own with null, and glide it
   * there from where it shows: the place goes in, side and all, what shows is
   * measured there, moved back by the difference, and let go, so it slides
   * the rest of the way. The side swaps first, so the glide starts from what
   * shows under the pointer. A long way takes longer, and the edge eases back
   * flush in the same time, so it only stops floating here.
   */
  function land(next: DevknobsStatePatch["panel"] | null): void {
    const { open } = engine.getState().panel;
    const from = shownBox(open);
    wrap.style.transitionProperty = "transform";
    wrap.style.translate = "";
    if (next) engine.setState({ panel: next });
    else render();
    const to = shownBox(open);
    const x = from.left - to.left;
    const y = from.top - to.top;
    wrap.style.setProperty("--glide", `${glideTime(Math.hypot(x, y))}ms`);
    wrap.dataset.float = "false";
    if (x !== 0 || y !== 0) {
      wrap.style.translate = `${x}px ${y}px`;
      wrap.getBoundingClientRect();
    }
    wrap.style.transitionProperty = "";
    wrap.style.translate = "";
  }

  /**
   * End a drag. One the pointer let go of lands on the side `landSide` picks
   * for where it was let go and how fast it went, at the place it was
   * dragged to. One cut short goes back where it came from. A shift drag of
   * an open panel only slid the handle along it, so it keeps its side.
   */
  function endDrag(event: PointerEvent | null): void {
    if (!dragging) return;
    dragging = false;
    wrap.dataset.drag = "false";
    if (handle.hasPointerCapture(pointer)) handle.releasePointerCapture(pointer);
    if (dragged && event) {
      sample(event);
      const { open, side } = engine.getState().panel;
      const box = shownBox(open);
      const speed = velocity(samples, event.timeStamp);
      const flung = Math.abs(event.clientX - startX) >= FLING_TRAVEL ? speed.x : 0;
      const middle = box.left + box.width / 2;
      const slid = open && moving === "handle";
      land({
        ...dragAt,
        side: slid ? side : landSide(side, middle, viewWidth(), flung, speed.y),
      });
      // Only a move the user makes is kept for new tabs.
      engine.keepPlace();
    } else if (dragged) land(null);
    else render();
    // A pointer press leaves focus on the handle, and the next keypress (the
    // hotkey, say) would then promote it to :focus-visible. Keyboard users
    // never come through here, so they keep their focus.
    handle.blur();
  }

  handle.addEventListener("pointerup", (event: PointerEvent) => {
    if (event.pointerId === pointer) endDrag(event);
  });
  handle.addEventListener("pointercancel", (event: PointerEvent) => {
    if (event.pointerId !== pointer) return;
    endDrag(null);
    // No click follows a cancel, so there is none to swallow.
    dragged = false;
  });
  // The browser can take the pointer away, and a window that lost the focus
  // may never hear it come up. Either way the panel goes back to its place,
  // and the next click on the handle toggles it. The capture a pointerup lets
  // go of finds the drag already ended, and its click is still swallowed.
  handle.addEventListener("lostpointercapture", (event: PointerEvent) => {
    if (!dragging || event.pointerId !== pointer) return;
    endDrag(null);
    dragged = false;
  });
  function onBlur(): void {
    stopRecording();
    endReorder(false);
    if (!dragging) return;
    endDrag(null);
    dragged = false;
  }

  // The drag that just ended still sends a click. Swallow that one.
  handle.addEventListener("click", () => {
    if (dragged) {
      dragged = false;
      return;
    }
    toggle();
  });

  /** Run a key's action. */
  function onAction(action: KeyAction): void {
    if (action === "zoom-in" || action === "zoom-out" || action === "zoom-fit") {
      zoomKey(action);
      return;
    }
    // A drag owns the handle until the pointer is up, hotkey and escape too.
    if (dragging) return;
    if (action === "toggle") {
      toggle();
      return;
    }
    if (!engine.getState().panel.open) return;
    if (action === "replay") runCommand("replay");
    else if (action === "reset") runCommand("reset");
    else if (action === "search") startBrowsing();
    else toggle(false);
  }

  /**
   * Escape takes one step back at a time, as `escapeStep` says. With the focus
   * out on the page, it closes the panel straight away. A row being dragged
   * goes back where it was first.
   */
  function escape(): void {
    if (dragging || !engine.getState().panel.open) return;
    if (reorder) {
      endReorder(false);
      return;
    }
    const focused = root.activeElement;
    const filter =
      focused instanceof HTMLInputElement && focused.classList.contains("filter") ? focused : null;
    const view = openRow ? viewOf(openRow) : undefined;
    const step = escapeStep({
      search: browsing || searchInput.value !== "",
      filter: filter !== null && filter.value !== "",
      keys: editingKeys,
      editor: focused !== null && view !== undefined,
    });
    if (step === "search") {
      // Back to the button the search opened from, while the focus was in it.
      const inSearch = focused === searchInput;
      leaveSearch();
      if (inSearch) add.focus({ preventScroll: true });
    } else if (step === "filter" && filter) {
      filter.value = "";
      filter.dispatchEvent(new Event("input"));
    } else if (step === "keys") {
      leaveKeys();
    } else if (step === "editor" && view) {
      openEditor(null);
      view.main.focus();
    } else if (step === "panel") toggle(false);
  }

  /**
   * Shift and the hotkey toggles the panel unless the focus is in a field
   * other than the search. While the panel is out and the focus is in no
   * field, `/` opens the search without typing into it, and with the focus on
   * one of the panel's controls a character opens it with that typed in.
   * While the frame is up, the zoom keys zoom it instead of the browser.
   * Every other key goes to the page.
   */
  function onKeydown(event: KeyboardEvent): void {
    if (recording !== null) {
      recordKey(event, recording);
      return;
    }
    // Escape takes a tooltip away first, and nothing else with it.
    if (event.key === "Escape" && hideTip()) {
      event.preventDefault();
      return;
    }
    const zoom = zoomAction(event);
    if (zoom && zoomKey(zoom)) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const action = keyAction(event, keys.get());
    // A key the panel acts on does only that, not the browser's own as well:
    // the toggle unless a drag holds it, replay and reset while the panel is
    // open. In the search no key the panel took is typed.
    const acts =
      action !== null &&
      action !== "close" &&
      !dragging &&
      (action === "toggle" || engine.getState().panel.open);
    const inSearch = event.composedPath()[0] === searchInput;
    if (acts || (action && action !== "close" && inSearch)) event.preventDefault();
    if (action === "close") escape();
    else if (action) onAction(action);
    if (action || dragging || reorder || !engine.getState().panel.open) return;
    const text = event.composedPath().includes(panel) ? typeAhead(event) : null;
    if (text === null && !isSearchKey(event)) return;
    event.preventDefault();
    event.stopPropagation();
    startBrowsing(text ?? "");
  }

  /**
   * The width knob's frame keeps the keys while it has focus and sends these
   * up, along with how many boxes stick out inside it.
   */
  function onMessage(event: MessageEvent): void {
    const message = readMessage(event, frameWindow(), window.location.origin);
    if (message?.type === "key") onAction(message.action);
    else if (message?.type === "overflow") {
      frameCount = message.count;
      render();
    }
  }

  const ticker = window.setInterval(tick, 1000);
  const unsubscribe = engine.subscribe(render);
  const stopKeys = keys.subscribe(renderKeys);
  const stopPrefs = prefs.subscribe(render);
  const stopGrab = grab?.subscribe(onGrab);
  const stopCount = onCount(render);
  window.addEventListener("keydown", onKeydown, true);
  window.addEventListener("pointerdown", onPointerDown, true);
  window.addEventListener("pointerup", onPointerUp, true);
  window.addEventListener("pointercancel", onPointerUp, true);
  window.addEventListener("message", onMessage);
  window.addEventListener("resize", layout);
  window.addEventListener("blur", onBlur);
  // The panel also grows and shrinks between renders, as a list filters or a
  // text box is resized, and lays itself out again each time.
  const resizes = new ResizeObserver(() => layout());
  resizes.observe(panel);

  function attach(): void {
    if (document.body && host.parentNode !== document.body) document.body.append(host);
  }

  render();
  (document.body ?? document.documentElement).append(host);
  if (!document.body) document.addEventListener("DOMContentLoaded", attach, { once: true });
  layout();

  return {
    destroy(): void {
      stopRecording();
      unsubscribe();
      stopKeys();
      if (!options.keys) keys.destroy();
      stopPrefs();
      prefs.destroy();
      stopGrab?.();
      stopCount();
      clearInterval(ticker);
      clearTimeout(tipTimer);
      clearTimeout(refusedTimer);
      cancelAnimationFrame(following);
      slide.destroy();
      for (const timer of pending.values()) clearTimeout(timer);
      window.removeEventListener("keydown", onKeydown, true);
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("pointerup", onPointerUp, true);
      window.removeEventListener("pointercancel", onPointerUp, true);
      window.removeEventListener("message", onMessage);
      window.removeEventListener("resize", layout);
      window.removeEventListener("blur", onBlur);
      resizes.disconnect();
      document.removeEventListener("DOMContentLoaded", attach);
      host.remove();
    },
  };
}
