import * as engine from "../engine";
import { now, realNow } from "../engine/clock";
import { hasTouch } from "../engine/devices";
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
} from "../types";
import {
  ACTIONS,
  type Action,
  browse,
  hasMock,
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
import {
  escapeStep,
  highlightAt,
  hotkeyOf,
  isSearchKey,
  keyAction,
  paletteMove,
  REPLAY_KEY,
  radioMove,
  zoomAction,
} from "./keys";
import { isListed, pinPatch, removePatch, rowText } from "./list";
import { filterOptions, type Result, resultText, search, searchActions } from "./search";
import { CSS } from "./styles";

export { wallInput } from "./catalog";

export interface PanelOptions {
  /** Key that toggles the panel. Defaults to `d`. */
  hotkey?: string;
  /** Grab, where it is on, to show and to turn on from the search. */
  grab?: GrabControl | null;
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
  main: HTMLButtonElement;
  value: HTMLElement;
  clear: HTMLButtonElement;
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

/** Space the panel keeps between itself and the top or bottom of the viewport. */
export const PANEL_GAP = 8;

/**
 * How near an edge pulls a box flush with it, in px. More than the panel's
 * corner radius, so the handle never sits on the curve of a corner.
 */
export const SNAP = 24;

const CUSTOM_DEBOUNCE = 200;

/**
 * The host's own style. It is as wide and as tall as an open panel whatever
 * the panel is doing, so it never takes a pointer: the stylesheet hands that
 * back to the handle and to a panel that is out, and every other pixel of the
 * box belongs to the page underneath.
 */
export const HOST_STYLE = "position:fixed;right:0;top:0;z-index:2147483646;pointer-events:none";

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
 * The grab key as its chip shows it. A Mac label such as `⌘C` stays as it is,
 * and `ctrl+C` reads `Ctrl C`.
 */
export function chipKey(label: string): string {
  return label
    .replace(/\+(?=.)/g, " ")
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/**
 * The keys the footer names, most used first: the hotkey, the search key, the
 * grab key where there is a grab, the replay key, and reset last.
 */
export function keyChips(hotkey: string, grabLabel: string | null, mac: boolean): KeyChip[] {
  const chips: KeyChip[] = [
    { command: "panel", key: hotkey, word: "panel" },
    { command: "search", key: "/", word: "search" },
  ];
  if (grabLabel !== null) chips.push({ command: "grab", key: chipKey(grabLabel), word: "grab" });
  chips.push(
    { command: "replay", key: REPLAY_KEY, word: "replay animations" },
    { command: "reset", key: mac ? "⇧⌫" : "Shift Backspace", word: "reset" },
  );
  return chips;
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

/** What the clock note says: the time the page reads, or that it reads the real one. */
function clockReadout(clock: ClockValue): string {
  return clock.mode === "system" ? "clock: system" : `now: ${new Date(now()).toLocaleString()}`;
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
 * one row each, and a row opens into an editor. Everything else is a search away: the field at
 * the top finds knobs and values, and with nothing typed lists every knob.
 */
export function createPanel(options: PanelOptions = {}): Panel {
  const hotkey = hotkeyOf(options.hotkey);
  const grab = options.grab ?? null;
  /** The actions search finds: grab only where there is one. */
  const actionsHere = grab ? ACTIONS : ACTIONS.filter((action) => action.id !== "grab");

  const host = document.createElement("div");
  host.setAttribute("data-devknobs", "panel");
  host.style.cssText = HOST_STYLE;
  const root = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = CSS;

  const wrap = el("div", "wrap");
  const handle = button("handle", "knobs");
  handle.setAttribute("aria-label", `devknobs, press ${hotkey}`);
  handle.title = "drag to move · shift-drag moves the handle";
  const panel = el("div", "panel");

  // A label, so a click anywhere in the header lands in the field.
  const head = el("label", "head");
  const searchInput = document.createElement("input");
  searchInput.className = "search";
  searchInput.placeholder = "add a knob";
  searchInput.autocomplete = "off";
  searchInput.spellcheck = false;
  searchInput.setAttribute("role", "combobox");
  searchInput.setAttribute("aria-label", "find a knob");
  searchInput.setAttribute("aria-autocomplete", "list");
  searchInput.setAttribute("aria-controls", "devknobs-results");
  searchInput.setAttribute("aria-expanded", "false");
  // For the pointer: escape does the same from the keys.
  const closeSearch = button("search-close", "×");
  closeSearch.tabIndex = -1;
  closeSearch.setAttribute("aria-label", "close the search");
  head.append(searchInput, closeSearch);

  const body = el("div", "body");
  const empty = el("div", "empty", "nothing emulated");
  const rows = el("div", "rows");
  const results = el("div", "results");
  results.id = "devknobs-results";
  results.setAttribute("role", "listbox");
  results.setAttribute("aria-label", "knobs");
  body.append(empty, rows, results);

  const foot = el("div", "foot");
  const badge = el("span", "badge");
  // The legend of the keys, and the controls they press.
  const meta = el("div", "meta");
  const hints = new Map<Command, HTMLButtonElement>();
  for (const chip of keyChips(hotkey, grab ? grab.label : null, isMac())) {
    const node = button("hint", "");
    node.dataset.command = chip.command;
    node.append(el("kbd", "hint-key", chip.key), chip.word);
    meta.append(node);
    hints.set(chip.command, node);
  }
  foot.append(badge, meta);

  panel.append(head, body, foot);
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
        const standing = Array.from(track.children).filter((node) => !(node as HTMLElement).hidden);
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
    if (option.opens) openEditor(rowOf(knob.id).id);
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
        note.textContent = clockReadout(state.clock);
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

  /** A width and a height of the frame's own, and a turn of it. */
  function deviceExtra(): [HTMLElement, Update] {
    const box = el("div", "fields");
    const width = numberField("width", "viewport width in pixels");
    const height = numberField("height", "viewport height in pixels");
    const rotate = button("chip", "rotate");
    box.append(width, el("span", "unit", "×"), height, rotate);
    // An empty field is the window's own size.
    const size = (input: HTMLInputElement) => {
      const value = toNumber(input.value);
      return value > 0 ? value : "full";
    };
    const commitSize = () => commit("viewport", { width: size(width), height: size(height) });
    for (const input of [width, height]) input.addEventListener("input", () => queue(commitSize));
    rotate.addEventListener("click", () => {
      const turned = engine.getState().orientation === "portrait" ? "landscape" : "portrait";
      commit("viewport", { orientation: turned });
    });
    return [
      box,
      (state) => {
        fill(width, typeof state.width === "number" ? String(state.width) : "");
        fill(height, typeof state.height === "number" ? String(state.height) : "");
        rotate.hidden = typeof state.width !== "number" || typeof state.height !== "number";
      },
    ];
  }

  function zoneExtra(): [HTMLElement, Update] {
    const note = el("div", "note");
    return [
      note,
      (state) => {
        note.textContent = `in use: ${resolveTimeZone(state.timeZone, state.geo) ?? "system"}`;
      },
    ];
  }

  /** The user agent in use, and editing it makes it the custom one. */
  function uaExtra(): [HTMLElement, Update] {
    const custom = document.createElement("textarea");
    custom.className = "field field-ua";
    custom.placeholder = "custom user agent";
    custom.spellcheck = false;
    custom.setAttribute("aria-label", "custom user agent");
    const commitCustom = () => commit("ua", { ua: { preset: "custom", custom: custom.value } });
    custom.addEventListener("input", () => queue(commitCustom));
    return [custom, (state) => fill(custom, userAgentOf(state.ua))];
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
      line.append(el("div", "knob-label", knob.label), node);
      updates.push(update);
      const extra = EXTRAS[knob.id]?.();
      if (extra) {
        line.append(extra[0]);
        updates.push(extra[1]);
      }
      // The frame switch changes nothing to see while another knob holds the frame up.
      if (knob.id === "frame") {
        updates.push((state) => {
          line.hidden = frameForced(state);
        });
      }
      // The mock switch only shows for a device that has one.
      if (knob.id === "mock") {
        updates.push((state) => {
          line.hidden = !hasMock(state);
        });
      }
      // So does the touch pointer for a device that takes touch.
      if (knob.id === "touchPointer") {
        updates.push((state) => {
          line.hidden = !hasTouch(state.device);
        });
      }
      // And a knob whose choices depend on the device, while it offers none.
      const offers = knob.offers;
      if (offers) {
        updates.push((state) => {
          line.hidden = offers(state).length === 0;
        });
      }
      editor.append(line);
    }
    return updates;
  }

  const views: RowView[] = ROWS.map((row) => {
    const box = el("div", "row");
    const line = el("div", "line");
    const main = button("main", "");
    main.setAttribute("aria-expanded", "false");
    const value = el("span", "row-value");
    main.append(el("span", "row-label", row.label), value);
    const clear = button("clear", "×");
    clear.setAttribute("aria-label", `reset ${row.label}`);
    line.append(main, clear);
    const editor = el("div", "editor");
    box.append(line, editor);
    rows.append(box);
    main.addEventListener("click", () => openEditor(openRow === row.id ? null : row.id));
    clear.addEventListener("click", () => {
      if (openRow === row.id) openRow = null;
      engine.setState(removePatch(engine.getState(), row));
    });
    return { row, box, main, value, clear, editor, updates: buildEditor(row, editor) };
  });

  /** Shown while grab is on, with the way out of it. */
  const grabRow = el("div", "row");
  const grabLine = el("div", "line");
  const grabMain = el("div", "main");
  grabMain.append(el("span", "row-label", "grab"), el("span", "row-value", "pick an element"));
  const grabClear = button("clear", "×");
  grabClear.setAttribute("aria-label", "stop grabbing");
  grabClear.addEventListener("click", () => grab?.set(false));
  grabLine.append(grabMain, grabClear);
  grabRow.append(grabLine);
  grabRow.hidden = true;
  rows.prepend(grabRow);

  function viewOf(id: RowId): RowView | undefined {
    return views.find((view) => view.row.id === id);
  }

  /** Open one row's editor, closing any other, or close them all with null. */
  function openEditor(id: RowId | null): void {
    openRow = id;
    render();
    const view = id ? viewOf(id) : undefined;
    if (!view) return;
    reveal(view.box, body);
    // A long list opens with the value that is on in its middle.
    for (const items of Array.from(view.editor.querySelectorAll<HTMLElement>(".items"))) {
      const on = items.querySelector<HTMLElement>(".on");
      if (on) center(on, items);
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
      reveal(current.node, body);
    } else searchInput.removeAttribute("aria-activedescendant");
  }

  function entry(id: number, pick: () => void, ...parts: (HTMLElement | string)[]): Entry {
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
    const mode = query ? "results" : browsing ? "browse" : "rows";
    wrap.dataset.mode = mode;
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
    body.scrollTop = 0;
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
    reveal(view.box, body);
    const line = openRow === id ? view.editor.querySelector(`[data-knob="${knob.id}"]`) : null;
    (firstControl(line) ?? view.main).focus();
  }

  /** Do what an action says. Grab takes the focus out of the panel, to the page. */
  function runAction(id: Action["id"]): void {
    if (id === "replay") {
      engine.replay();
      return;
    }
    if (!grab) return;
    leaveSearch();
    const focused = root.activeElement;
    if (focused instanceof HTMLElement) focused.blur();
    grab.set(true);
  }

  /** Set a result's value, or open the editor of a knob found by name. */
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
    if (knob.id === "mock" && !hasMock(engine.getState())) return;
    if (knob.id === "touchPointer" && !hasTouch(engine.getState().device)) return;
    if (knob.offers && !knob.offers(engine.getState()).includes(option.value)) return;
    set(knob, option.value);
    if (option.opens) openEditor(id);
    showRow(id, knob);
  }

  function openKnob(knob: Knob): void {
    const id = rowOf(knob.id).id;
    leaveSearch();
    openEditor(id);
    showRow(id, knob);
  }

  function render(): void {
    const state = engine.getState();
    const open = state.panel.open;
    wrap.dataset.open = open ? "true" : "false";
    panel.toggleAttribute("inert", !open);
    handle.setAttribute("aria-expanded", open ? "true" : "false");
    const live = liveOf(state);
    let anyListed = false;
    let anyShown = false;
    for (const view of views) {
      const listed = isListed(view.row, state);
      const expanded = openRow === view.row.id;
      anyListed ||= listed;
      anyShown ||= listed || expanded;
      view.box.hidden = !listed && !expanded;
      view.box.classList.toggle("open", expanded);
      view.main.setAttribute("aria-expanded", expanded ? "true" : "false");
      view.value.textContent = rowText(view.row, state, live);
      view.value.classList.toggle("idle", !isActive(view.row, state));
      view.clear.hidden = !listed;
      view.editor.hidden = !expanded;
      if (expanded) for (const update of view.updates) update(state);
    }
    grabRow.hidden = !grab?.isOn();
    anyShown ||= !grabRow.hidden;
    const hot = state.overflow && live.overflow !== null && live.overflow > 0;
    viewOf("debug")?.value.classList.toggle("hot", hot);
    empty.hidden = anyShown;
    const resetHint = hints.get("reset");
    if (resetHint) resetHint.disabled = !anyListed;
    badge.textContent = overflowBadge(state.overflow, live.overflow);
    badge.hidden = badge.textContent === "";
    badge.classList.toggle("hot", hot);
    renderBody(state);
    layout();
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

  /** Where the panel last showed. */
  let shownTop = engine.getState().panel.top;

  /**
   * Put the handle and the panel where a place says. `tab` tells the
   * stylesheet which corner of the panel the handle covers, if any. Closed,
   * the panel stays where it last showed, so it slides out from its own spot
   * whatever the handle does, and takes the place it has by then when it opens.
   */
  function placePanel(at: Place, open: boolean): void {
    host.style.top = `${at.y}px`;
    if (open) {
      shownTop = at.top;
      wrap.dataset.tab = at.tab;
    }
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
    placePanel(next, stored.open);
    const moved =
      next.y !== stored.y ||
      next.top !== stored.top ||
      next.edge !== stored.edge ||
      next.tab !== stored.tab;
    if (moved) engine.setState({ panel: next });
  }

  function toggle(open?: boolean): void {
    const next = open ?? !engine.getState().panel.open;
    // A closed panel keeps no focus, so the next keys go to the page.
    if (!next) {
      browsing = false;
      searchInput.value = "";
      const focused = root.activeElement;
      if (focused instanceof HTMLElement) focused.blur();
    }
    engine.setState({ panel: { open: next } });
  }

  searchInput.addEventListener("focus", () => {
    browsing = true;
    render();
  });
  searchInput.addEventListener("blur", () => {
    // The window lost the focus and the search kept it, or a press took it and
    // leaves the search once its click has landed.
    if (root.activeElement === searchInput || pressing) return;
    leaveSearch();
  });
  searchInput.addEventListener("input", () => {
    browsing = true;
    body.scrollTop = 0;
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
  body.addEventListener("mousedown", (event: MouseEvent) => {
    if (wrap.dataset.mode !== "rows") event.preventDefault();
  });
  closeSearch.addEventListener("mousedown", (event: MouseEvent) => event.preventDefault());
  closeSearch.addEventListener("click", leaveSearch);

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

  /** Every knob back to its default, the list emptied and the search left. */
  function resetAll(): void {
    openRow = null;
    searchInput.value = "";
    engine.reset();
  }

  function runCommand(command: Command): void {
    if (command === "panel") toggle(false);
    else if (command === "search") searchInput.focus();
    else if (command === "grab") runAction("grab");
    else if (command === "replay") engine.replay();
    else resetAll();
  }

  for (const [command, node] of hints) node.addEventListener("click", () => runCommand(command));

  let dragging = false;
  let dragged = false;
  let startPointer = 0;
  let lastPointer = 0;
  /** What the drag moves, where things sat when it took that over, and where they sit now. */
  let moving: "panel" | "handle" | null = null;
  let dragFrom: Place = engine.getState().panel;
  let dragAt: Place = dragFrom;
  /** Where the pointer would put what the drag moves, with no edge pulling it. */
  let loose = 0;

  // A mouse press must not focus the handle: a key held mid-drag (shift) would
  // otherwise turn that focus into a visible ring. Keyboard focus is unaffected.
  handle.addEventListener("mousedown", (event: MouseEvent) => event.preventDefault());
  handle.addEventListener("pointerdown", (event: PointerEvent) => {
    if (event.button !== 0) return;
    const { y, top, edge, tab } = engine.getState().panel;
    dragging = true;
    dragged = false;
    startPointer = event.clientY;
    lastPointer = event.clientY;
    moving = null;
    dragAt = { y, top, edge, tab };
    handle.setPointerCapture(event.pointerId);
  });

  handle.addEventListener("pointermove", (event: PointerEvent) => {
    if (!dragging) return;
    // Every move goes by its own step, so the slop is never paid back as a
    // jump and shift can take over halfway through without one either.
    const step = event.clientY - lastPointer;
    lastPointer = event.clientY;
    if (!dragged && Math.abs(event.clientY - startPointer) < DRAG_SLOP) return;
    dragged = true;
    // The panel and the handle move as one, and shift lets the handle go
    // alone, halfway through a drag too, from where it shows.
    const { open } = engine.getState().panel;
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
    placePanel(dragAt, open);
  });

  function endDrag(event: PointerEvent, keep: boolean): void {
    if (!dragging) return;
    dragging = false;
    wrap.dataset.drag = "false";
    if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
    if (keep && dragged) engine.setState({ panel: dragAt });
    else render();
    // A pointer press leaves focus on the handle, and the next keypress (the
    // hotkey, say) would then promote it to :focus-visible. Keyboard users
    // never come through here, so they keep their focus.
    handle.blur();
  }

  handle.addEventListener("pointerup", (event: PointerEvent) => endDrag(event, true));
  handle.addEventListener("pointercancel", (event: PointerEvent) => {
    dragged = false;
    endDrag(event, false);
  });

  // The drag that just ended still sends a click. Swallow that one.
  handle.addEventListener("click", () => {
    if (dragged) {
      dragged = false;
      return;
    }
    toggle();
  });

  function onAction(action: KeyAction): void {
    if (action === "zoom-in" || action === "zoom-out" || action === "zoom-fit") {
      zoomKey(action);
      return;
    }
    // A drag owns the handle until the pointer is up, hotkey and escape too.
    if (dragging) return;
    if (action === "toggle") toggle();
    else if (!engine.getState().panel.open) return;
    else if (action === "replay") runCommand("replay");
    else if (action === "reset") runCommand("reset");
    else if (action === "search") searchInput.focus();
    else toggle(false);
  }

  /**
   * Escape takes one step back at a time, as `escapeStep` says. With the focus
   * out on the page, it closes the panel straight away.
   */
  function escape(): void {
    if (dragging || !engine.getState().panel.open) return;
    const focused = root.activeElement;
    const filter =
      focused instanceof HTMLInputElement && focused.classList.contains("filter") ? focused : null;
    const view = openRow ? viewOf(openRow) : undefined;
    const step = escapeStep({
      search: focused === searchInput || browsing || searchInput.value !== "",
      filter: filter !== null && filter.value !== "",
      editor: focused !== null && view !== undefined,
    });
    if (step === "search") leaveSearch();
    else if (step === "filter" && filter) {
      filter.value = "";
      filter.dispatchEvent(new Event("input"));
    } else if (step === "editor" && view) {
      openEditor(null);
      view.main.focus();
    } else if (step === "panel") toggle(false);
  }

  /**
   * The hotkey toggles the panel unless the focus is in a field, the search
   * included. While the panel is out and the focus is in no field, `/` focuses
   * the search without typing into it. While the frame is up, the zoom keys
   * zoom it instead of the browser. Every other key goes to the page.
   */
  function onKeydown(event: KeyboardEvent): void {
    const zoom = zoomAction(event);
    if (zoom && zoomKey(zoom)) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const action = keyAction(event, hotkey);
    if (action === "reset" && !dragging && engine.getState().panel.open) event.preventDefault();
    if (action === "close") escape();
    else if (action) onAction(action);
    if (action || dragging || !engine.getState().panel.open || !isSearchKey(event)) return;
    event.preventDefault();
    event.stopPropagation();
    searchInput.focus();
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
  const stopGrab = grab?.subscribe(render);
  const stopCount = onCount(render);
  window.addEventListener("keydown", onKeydown, true);
  window.addEventListener("pointerdown", onPointerDown, true);
  window.addEventListener("pointerup", onPointerUp, true);
  window.addEventListener("pointercancel", onPointerUp, true);
  window.addEventListener("message", onMessage);
  window.addEventListener("resize", layout);
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
      unsubscribe();
      stopGrab?.();
      stopCount();
      clearInterval(ticker);
      for (const timer of pending.values()) clearTimeout(timer);
      window.removeEventListener("keydown", onKeydown, true);
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("pointerup", onPointerUp, true);
      window.removeEventListener("pointercancel", onPointerUp, true);
      window.removeEventListener("message", onMessage);
      window.removeEventListener("resize", layout);
      resizes.disconnect();
      document.removeEventListener("DOMContentLoaded", attach);
      host.remove();
    },
  };
}
