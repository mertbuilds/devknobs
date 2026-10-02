import * as engine from "../engine";
import { now, realNow } from "../engine/clock";
import { type KeyAction, needsFrame, readMessage } from "../engine/frame";
import { onCount, overflowCount } from "../engine/overflow";
import { resolveTimeZone } from "../engine/time";
import { frameWindow } from "../engine/width";
import type { ClockValue, DevknobsState } from "../types";
import {
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
  resetPatch,
  rowOf,
  summary,
  wallInput,
} from "./catalog";
import { hotkeyOf, isSearchKey, keyAction } from "./keys";
import { filterOptions, type Result, resultText, search } from "./search";
import { CSS } from "./styles";

export { wallInput } from "./catalog";

export interface PanelOptions {
  /** Key that toggles the panel. Defaults to `d`. */
  hotkey?: string;
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
const PANEL_GAP = 8;

const CUSTOM_DEBOUNCE = 200;

const SITE_URL = "https://knobs.dev/?utm_source=devknobs&utm_medium=panel&utm_campaign=footer";

/**
 * The host's own style. It is as wide and as tall as an open panel whatever
 * the panel is doing, so it never takes a pointer: the stylesheet hands that
 * back to the handle and to a panel that is out, and every other pixel of the
 * box belongs to the page underneath.
 */
export const HOST_STYLE = "position:fixed;right:0;top:0;z-index:2147483646;pointer-events:none";

/**
 * What the footer says about the overflow knob, such as ` · 2 overflowing`.
 * Nothing while the knob is off, or before the count is known.
 */
export function overflowBadge(on: boolean, count: number | null): string {
  return on && count !== null ? ` · ${count} overflowing` : "";
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

/** Scroll a box just enough to show a node in it. The box is the node's offset parent. */
function reveal(node: HTMLElement, box: HTMLElement): void {
  const top = node.offsetTop;
  const bottom = top + node.offsetHeight;
  if (top < box.scrollTop) box.scrollTop = top;
  else if (bottom > box.scrollTop + box.clientHeight) box.scrollTop = bottom - box.clientHeight;
}

/**
 * Build the panel, put it on the page and keep it in step with the engine. The
 * host carries an open shadow root, so the page cannot style the panel and the
 * panel cannot style the page.
 *
 * The panel lists only the knobs that are off their default, one row each, and
 * a row opens into an editor. Everything else is a search away: the field at
 * the top finds knobs and values, and with nothing typed lists every knob.
 */
export function createPanel(options: PanelOptions = {}): Panel {
  const hotkey = hotkeyOf(options.hotkey);

  const host = document.createElement("div");
  host.setAttribute("data-devknobs", "panel");
  host.style.cssText = HOST_STYLE;
  const root = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = CSS;

  const wrap = el("div", "wrap");
  const handle = button("handle", "knobs");
  handle.setAttribute("aria-label", `devknobs, press ${hotkey}`);
  const panel = el("div", "panel");

  // A label, so a click on the name lands in the field too.
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
  head.append(el("span", "name", "knobs"), searchInput);

  const body = el("div", "body");
  const empty = el("div", "empty", "nothing emulated");
  const rows = el("div", "rows");
  const results = el("div", "results");
  results.id = "devknobs-results";
  results.setAttribute("role", "listbox");
  results.setAttribute("aria-label", "knobs");
  body.append(empty, rows, results);

  const foot = el("div", "foot");
  const actions = el("div", "actions");
  const replayButton = button("act", "replay");
  const resetButton = button("act", "reset all");
  const badge = el("span", "badge");
  actions.append(replayButton, resetButton, badge);
  const home = document.createElement("a");
  home.className = "foot-link";
  home.href = SITE_URL;
  home.target = "_blank";
  home.rel = "noopener noreferrer";
  home.textContent = "knobs.dev";
  const meta = el("div", "meta");
  meta.append(
    home,
    ` · dev only · press ${hotkey}`,
    el("br", ""),
    "/ to search · shift-drag moves",
  );
  foot.append(actions, meta);

  panel.append(head, body, foot);
  wrap.append(handle, panel);
  root.append(style, wrap);

  /** The row whose editor is open. */
  let openRow: RowId | null = null;
  /** The search has focus and lists every knob, as nothing is typed. */
  let browsing = false;
  /** What the results or the browse list show, and which one Enter picks. */
  let entries: Entry[] = [];
  let cursor = 0;

  /** Leave an input alone while it has the caret, so typing is never cut off. */
  function fill(input: HTMLInputElement | HTMLTextAreaElement, value: string): void {
    if (root.activeElement === input) return;
    if (input.value !== value) input.value = value;
  }

  function set(knob: Knob, value: string): void {
    engine.setState(knob.write(value, engine.getState()));
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
    return [
      track,
      (state) => {
        const current = knob.read(state);
        for (const item of items) mark(item.node, item.value === current, "aria-checked");
      },
    ];
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

  /** A long list with a filter that also takes a value typed out in full. */
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
      items.replaceChildren(
        ...shown.map((option, index) => {
          const node = button("item", option.label);
          node.setAttribute("role", "option");
          node.tabIndex = -1;
          mark(node, option.value === current, "aria-selected");
          node.classList.toggle("cursor", index === at);
          node.addEventListener("click", () => pickOption(knob, option));
          return node;
        }),
      );
      const cursorNode = items.children[at];
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
    if (Number.isFinite(width) && width > 0) engine.setState({ width });
  }

  widthField.addEventListener("input", () => queue(commitWidth));

  function control(knob: Knob): [HTMLElement, Update] {
    if (knob.control === "switch") return toggleSwitch(knob);
    if (knob.control === "segments") return segments(knob);
    if (knob.control === "list") return list(knob);
    return chips(knob, knob.id === "width" ? widthField : null);
  }

  /** Set the clock to an instant, running unless it stands frozen already. */
  function travel(at: number, since = realNow()): void {
    const frozen = engine.getState().clock.mode === "frozen";
    engine.setState({ clock: { mode: frozen ? "frozen" : "offset", at, since } });
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
      engine.setState({
        geo: { preset: "custom", lat: toNumber(lat.value), lng: toNumber(lng.value) },
      });
    const commitRoute = () => engine.setState({ geo: { preset: "route", route: route.value } });
    const commitSpeed = () => engine.setState({ geo: { speed: toNumber(speed.value) } });
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

  function zoneExtra(): [HTMLElement, Update] {
    const note = el("div", "note");
    return [
      note,
      (state) => {
        note.textContent = `in use: ${resolveTimeZone(state.timeZone, state.geo) ?? "system"}`;
      },
    ];
  }

  /** What some knobs add under their control: free values and readouts. */
  const EXTRAS: Partial<Record<KnobId, () => [HTMLElement, Update]>> = {
    clock: clockExtra,
    geo: geoExtra,
    timeZone: zoneExtra,
  };

  function buildEditor(row: Row, editor: HTMLElement): Update[] {
    const updates: Update[] = [];
    for (const knob of knobsOf(row)) {
      const line = el("div", `knob knob-${knob.control}`);
      const [node, update] = control(knob);
      line.append(el("div", "knob-label", knob.label), node);
      updates.push(update);
      const extra = EXTRAS[knob.id]?.();
      if (extra) {
        line.append(extra[0]);
        updates.push(extra[1]);
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
      engine.setState(resetPatch(row));
    });
    return { row, box, main, value, clear, editor, updates: buildEditor(row, editor) };
  });

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
    // A long list opens on the value that is on.
    for (const items of Array.from(view.editor.querySelectorAll<HTMLElement>(".items"))) {
      const on = items.querySelector<HTMLElement>(".on");
      if (on) reveal(on, items);
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
    cursor = Math.min(Math.max(index, 0), entries.length - 1);
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

  function resultEntries(query: string, state: DevknobsState): Entry[] {
    return search(query).map((result, index) => {
      const text = resultText(result);
      const value = el("span", "entry-value", text.value);
      const current = result.option !== null && result.knob.read(state) === result.option.value;
      value.classList.toggle("current", current);
      return entry(index, () => pick(result), el("span", "entry-knob", text.knob), value);
    });
  }

  function browseEntries(state: DevknobsState): { nodes: HTMLElement[]; list: Entry[] } {
    const nodes: HTMLElement[] = [];
    const list: Entry[] = [];
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
    setCursor(cursor);
  }

  function setQuery(text: string): void {
    searchInput.value = text;
    cursor = 0;
    body.scrollTop = 0;
    render();
  }

  /** Set a result's value, or open the editor of a knob found by name. */
  function pick(result: Result): void {
    if (!result.option) {
      openKnob(result.knob);
      return;
    }
    searchInput.value = "";
    browsing = false;
    cursor = 0;
    set(result.knob, result.option.value);
    if (result.option.opens) openEditor(rowOf(result.knob.id).id);
    else render();
  }

  function openKnob(knob: Knob): void {
    searchInput.value = "";
    browsing = false;
    searchInput.blur();
    openEditor(rowOf(knob.id).id);
    viewOf(rowOf(knob.id).id)?.main.focus();
  }

  function render(): void {
    const state = engine.getState();
    const open = state.panel.open;
    wrap.dataset.open = open ? "true" : "false";
    host.style.top = `${state.panel.y}px`;
    panel.toggleAttribute("inert", !open);
    handle.setAttribute("aria-expanded", open ? "true" : "false");
    const live = liveOf(state);
    let anyActive = false;
    let anyShown = false;
    for (const view of views) {
      const active = isActive(view.row, state);
      const expanded = openRow === view.row.id;
      anyActive ||= active;
      anyShown ||= active || expanded;
      view.box.hidden = !active && !expanded;
      view.box.classList.toggle("open", expanded);
      view.main.setAttribute("aria-expanded", expanded ? "true" : "false");
      view.value.textContent = summary(view.row, state, live);
      view.clear.hidden = !active;
      view.editor.hidden = !expanded;
      if (expanded) for (const update of view.updates) update(state);
    }
    const hot = state.overflow && live.overflow !== null && live.overflow > 0;
    viewOf("debug")?.value.classList.toggle("hot", hot);
    empty.hidden = anyShown;
    resetButton.disabled = !anyActive;
    badge.textContent = overflowBadge(state.overflow, live.overflow);
    badge.hidden = badge.textContent === "";
    badge.classList.toggle("hot", hot);
    renderBody(state);
    shiftPanel(state.panel.y);
  }

  /** The clock runs between knob changes, and its readouts with it. */
  function tick(): void {
    const state = engine.getState();
    if (!state.panel.open) return;
    const live = liveOf(state);
    for (const view of views) {
      if (!view.box.hidden) view.value.textContent = summary(view.row, state, live);
    }
    if (openRow === "clock") for (const update of viewOf("clock")?.updates ?? []) update(state);
  }

  /**
   * Keep the handle on screen. `y` is the handle's top, open or closed, and it
   * keeps the same gap as the panel, so the two edges can line up.
   */
  function clamp(y: number): number {
    const room = Math.max(PANEL_GAP, window.innerHeight - PANEL_GAP - handle.offsetHeight);
    return Math.min(Math.max(y, PANEL_GAP), room);
  }

  /**
   * Where the panel's top belongs for a handle at `y`, given the top it has
   * now: the panel stays put while the handle slides along it, and only moves
   * when the handle would leave by the top or the bottom edge and pushes it.
   * The gap to the viewport has the last word.
   */
  function resolveTop(y: number, current: number): number {
    const height = panel.offsetHeight;
    const pushed = Math.max(Math.min(current, y), y + handle.offsetHeight - height);
    const room = Math.max(PANEL_GAP, window.innerHeight - PANEL_GAP - height);
    return Math.min(Math.max(pushed, PANEL_GAP), room);
  }

  /**
   * Place the panel for a handle at `y` and say where its top ended up. `tab`
   * tells the stylesheet which corner of the panel the handle covers, if any.
   */
  function placePanel(y: number, current: number): number {
    // Closed: leave the panel where it was, so it slides out from its own spot
    // and back in to it. The next open resolves a fresh position.
    if (!engine.getState().panel.open) return current;
    const height = panel.offsetHeight;
    const top = resolveTop(y, current);
    panel.style.marginTop = `${top - y}px`;
    if (top === y) wrap.dataset.tab = "top";
    // offsetHeight rounds, so the two bottom edges only have to agree to the px.
    else if (Math.abs(top + height - y - handle.offsetHeight) <= 1) wrap.dataset.tab = "bottom";
    else wrap.dataset.tab = "mid";
    return top;
  }

  /**
   * Place the panel from the stored top and store where it landed. The store
   * renders again from here, which places the panel a second time and finds
   * nothing left to move, because a resolved top resolves to itself.
   */
  function shiftPanel(y: number): void {
    const { top } = engine.getState().panel;
    const next = placePanel(y, top);
    if (next !== top) engine.setState({ panel: { top: next } });
  }

  function clampY(): void {
    const { y } = engine.getState().panel;
    const next = clamp(y);
    if (next !== y) engine.setState({ panel: { y: next } });
    else shiftPanel(y);
  }

  function toggle(open?: boolean): void {
    const next = open ?? !engine.getState().panel.open;
    // A closed panel keeps no focus, so the next keys go to the page.
    if (!next) {
      browsing = false;
      const focused = root.activeElement;
      if (focused instanceof HTMLElement) focused.blur();
    }
    engine.setState({ panel: { open: next } });
    clampY();
  }

  searchInput.addEventListener("focus", () => {
    browsing = true;
    render();
  });
  searchInput.addEventListener("blur", () => {
    browsing = false;
    render();
  });
  searchInput.addEventListener("input", () => {
    browsing = true;
    cursor = 0;
    body.scrollTop = 0;
    render();
  });
  searchInput.addEventListener("keydown", (event: KeyboardEvent) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!browsing && !searchInput.value.trim()) {
        browsing = true;
        render();
        return;
      }
      setCursor(cursor + (event.key === "ArrowDown" ? 1 : -1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      entries[cursor]?.pick();
    }
  });
  // A click on a result keeps the focus in the search, so the list stays put under it.
  results.addEventListener("mousedown", (event: MouseEvent) => event.preventDefault());

  replayButton.addEventListener("click", () => engine.replay());
  resetButton.addEventListener("click", () => {
    openRow = null;
    searchInput.value = "";
    engine.reset();
  });

  let dragging = false;
  let dragged = false;
  let startPointer = 0;
  let lastPointer = 0;
  let dragTop = 0;
  let dragPanelTop = 0;

  // A mouse press must not focus the handle: a key held mid-drag (shift) would
  // otherwise turn that focus into a visible ring. Keyboard focus is unaffected.
  handle.addEventListener("mousedown", (event: MouseEvent) => event.preventDefault());
  handle.addEventListener("pointerdown", (event: PointerEvent) => {
    if (event.button !== 0) return;
    const { y, top } = engine.getState().panel;
    dragging = true;
    dragged = false;
    startPointer = event.clientY;
    lastPointer = event.clientY;
    dragTop = y;
    dragPanelTop = top;
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
    // Shift moves the panel and the handle as one, until the panel meets the
    // viewport gap. A closed panel has nothing to move, so there shift is an
    // ordinary drag.
    const movePanel = event.shiftKey && engine.getState().panel.open;
    wrap.dataset.drag = movePanel ? "panel" : "true";
    // Not through the store: a pointermove is no reason to re-apply every knob.
    if (movePanel) {
      const room = Math.max(PANEL_GAP, window.innerHeight - PANEL_GAP - panel.offsetHeight);
      const nextPanelTop = Math.min(Math.max(dragPanelTop + step, PANEL_GAP), room);
      dragTop = clamp(dragTop + (nextPanelTop - dragPanelTop));
      dragPanelTop = nextPanelTop;
      host.style.top = `${dragTop}px`;
      dragPanelTop = placePanel(dragTop, dragPanelTop);
      return;
    }
    dragTop = clamp(dragTop + step);
    host.style.top = `${dragTop}px`;
    dragPanelTop = placePanel(dragTop, dragPanelTop);
  });

  function endDrag(event: PointerEvent, keep: boolean): void {
    if (!dragging) return;
    dragging = false;
    wrap.dataset.drag = "false";
    if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
    if (keep && dragged) engine.setState({ panel: { y: dragTop, top: dragPanelTop } });
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
    // A drag owns the handle until the pointer is up, hotkey and escape too.
    if (dragging) return;
    if (action === "toggle") toggle();
    else if (engine.getState().panel.open) toggle(false);
  }

  /**
   * Escape takes one step back at a time: it clears the query, leaves the
   * search, then closes the open editor, and only then the panel. With the
   * focus out on the page, it closes the panel straight away.
   */
  function escape(): void {
    if (dragging || !engine.getState().panel.open) return;
    const focused = root.activeElement;
    if (focused === searchInput) {
      if (searchInput.value) setQuery("");
      else searchInput.blur();
      return;
    }
    const filter = focused instanceof HTMLInputElement && focused.classList.contains("filter");
    if (filter && focused.value) {
      focused.value = "";
      focused.dispatchEvent(new Event("input"));
      return;
    }
    if (searchInput.value) {
      setQuery("");
      return;
    }
    const view = openRow ? viewOf(openRow) : undefined;
    if (focused && view) {
      openEditor(null);
      view.main.focus();
      return;
    }
    toggle(false);
  }

  /**
   * The hotkey toggles the panel unless the focus is in a field, the search
   * included. While the panel is out and the focus is in no field, `/` focuses
   * the search without typing into it. Every other key goes to the page.
   */
  function onKeydown(event: KeyboardEvent): void {
    const action = keyAction(event, hotkey);
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
  const stopCount = onCount(render);
  window.addEventListener("keydown", onKeydown, true);
  window.addEventListener("message", onMessage);
  window.addEventListener("resize", clampY);

  function attach(): void {
    if (document.body && host.parentNode !== document.body) document.body.append(host);
  }

  render();
  (document.body ?? document.documentElement).append(host);
  if (!document.body) document.addEventListener("DOMContentLoaded", attach, { once: true });
  clampY();

  return {
    destroy(): void {
      unsubscribe();
      stopCount();
      clearInterval(ticker);
      for (const timer of pending.values()) clearTimeout(timer);
      window.removeEventListener("keydown", onKeydown, true);
      window.removeEventListener("message", onMessage);
      window.removeEventListener("resize", clampY);
      document.removeEventListener("DOMContentLoaded", attach);
      host.remove();
    },
  };
}
