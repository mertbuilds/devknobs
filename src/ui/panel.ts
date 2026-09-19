import * as engine from "../engine";
import { CLOCK_PRESETS, now, realNow } from "../engine/clock";
import { type KeyAction, needsFrame, readMessage } from "../engine/frame";
import { GEO_PRESETS, resolveGeo } from "../engine/geo";
import { LOCALE_PRESETS } from "../engine/locale";
import { onCount, overflowCount } from "../engine/overflow";
import { resolveTimeZone, TIME_ZONE_PRESETS } from "../engine/time";
import { frameWindow } from "../engine/width";
import type {
  ClockMode,
  ClockValue,
  ConnectionValue,
  ContrastValue,
  DevknobsState,
  DirValue,
  GeoErrorValue,
  MotionValue,
  OnlineValue,
  SaveDataValue,
  SchemeValue,
  TransparencyValue,
  VisionValue,
} from "../types";
import { hotkeyOf, keyAction } from "./keys";
import { CSS } from "./styles";

export interface PanelOptions {
  /** Key that toggles the panel. Defaults to `d`. */
  hotkey?: string;
}

export interface Panel {
  /** Take the panel off the page and drop every listener. */
  destroy(): void;
}

interface Choice {
  label: string;
  value: string;
}

interface Group {
  label: string;
  choices: Choice[];
  /** The value that is on right now. */
  current(state: DevknobsState): string;
  select(value: string): void;
}

interface Binding {
  button: HTMLButtonElement;
  group: Group;
  value: string;
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

function choices(...values: string[]): Choice[] {
  return values.map((value) => ({ label: value, value }));
}

const SCHEME: Group = {
  label: "scheme",
  choices: choices("system", "light", "dark"),
  current: (state) => state.scheme,
  select: (value) => engine.setState({ scheme: value as SchemeValue }),
};

const MOTION: Group = {
  label: "motion",
  choices: choices("system", "reduce"),
  current: (state) => state.motion,
  select: (value) => engine.setState({ motion: value as MotionValue }),
};

const SPEED: Group = {
  label: "speed",
  choices: [...choices("1", "0.25", "0.1"), { label: "pause", value: "0" }],
  current: (state) => String(state.speed),
  select: (value) => engine.setState({ speed: Number(value) }),
};

const CONTRAST: Group = {
  label: "contrast",
  choices: choices("system", "more"),
  current: (state) => state.contrast,
  select: (value) => engine.setState({ contrast: value as ContrastValue }),
};

const TRANSPARENCY: Group = {
  label: "transparency",
  choices: choices("system", "reduce"),
  current: (state) => state.transparency,
  select: (value) => engine.setState({ transparency: value as TransparencyValue }),
};

const LOCALE: Group = {
  label: "locale",
  choices: [
    { label: "system", value: "system" },
    ...LOCALE_PRESETS.map((tag) => ({ label: tag.toLowerCase(), value: tag })),
  ],
  current: (state) => state.locale.lang,
  select: (value) => engine.setState({ locale: { lang: value } }),
};

const DIRECTION: Group = {
  label: "direction",
  choices: choices("system", "ltr", "rtl"),
  current: (state) => state.locale.dir,
  select: (value) => engine.setState({ locale: { dir: value as DirValue } }),
};

const PSEUDO: Group = {
  label: "pseudo",
  choices: choices("off", "on"),
  current: (state) => (state.pseudo ? "on" : "off"),
  select: (value) => engine.setState({ pseudo: value === "on" }),
};

const GEO: Group = {
  label: "geo",
  choices: [
    { label: "system", value: "system" },
    ...GEO_PRESETS.map((preset) => ({ label: preset.label.toLowerCase(), value: preset.id })),
    { label: "route", value: "route" },
  ],
  current: (state) => state.geo.preset,
  select: (value) => engine.setState({ geo: { preset: value } }),
};

const GEO_ERROR: Group = {
  label: "geo error",
  choices: choices("none", "denied", "unavailable", "timeout"),
  current: (state) => state.geo.error,
  select: (value) => engine.setState({ geo: { error: value as GeoErrorValue } }),
};

/** `America/New_York` reads as `new york` on a button. */
function zoneLabel(zone: string): string {
  return (zone.split("/").pop() ?? zone).replace(/_/g, " ").toLowerCase();
}

const TIME_ZONE: Group = {
  label: "time zone",
  choices: [
    ...choices("geo", "system"),
    ...TIME_ZONE_PRESETS.map((zone) => ({ label: zoneLabel(zone), value: zone })),
  ],
  current: (state) => state.timeZone,
  select: (value) => engine.setState({ timeZone: value }),
};

/** Set the clock to an instant, running unless it stands frozen already. */
function travel(at: number, since = realNow()): void {
  const frozen = engine.getState().clock.mode === "frozen";
  engine.setState({ clock: { mode: frozen ? "frozen" : "offset", at, since } });
}

const CLOCK: Group = {
  label: "clock",
  choices: [
    { label: "system", value: "system" },
    ...CLOCK_PRESETS.map((preset) => ({ label: preset.label, value: String(preset.ms) })),
  ],
  // A preset stays on until the clock moves some other way.
  current: (state) =>
    state.clock.mode === "system" ? "system" : String(state.clock.at - state.clock.since),
  select: (value) => {
    if (value === "system") {
      engine.setState({ clock: { mode: "system" } });
      return;
    }
    const real = realNow();
    travel(real + Number(value), real);
  },
};

const CLOCK_MODE: Group = {
  label: "clock mode",
  choices: choices("offset", "frozen"),
  current: (state) => state.clock.mode,
  select: (value) => engine.setState({ clock: { mode: value as ClockMode } }),
};

const CLOCK_SPEED: Group = {
  label: "clock speed",
  choices: choices("1", "60", "3600"),
  current: (state) => String(state.clock.speed),
  // A speed only shows on a running clock, so the real one starts running from here.
  select: (value) => {
    const { mode } = engine.getState().clock;
    engine.setState({ clock: { mode: mode === "system" ? "offset" : mode, speed: Number(value) } });
  },
};

const CLOCK_HEADER: Group = {
  label: "send to server",
  choices: choices("off", "on"),
  current: (state) => (state.clock.header ? "on" : "off"),
  select: (value) => engine.setState({ clock: { header: value === "on" } }),
};

const ONLINE: Group = {
  label: "online",
  choices: choices("system", "offline"),
  current: (state) => state.network.online,
  select: (value) => engine.setState({ network: { online: value as OnlineValue } }),
};

const CONNECTION: Group = {
  label: "connection",
  choices: choices("system", "slow-2g", "2g", "3g", "4g"),
  current: (state) => state.network.type,
  select: (value) => engine.setState({ network: { type: value as ConnectionValue } }),
};

const SAVE_DATA: Group = {
  label: "save data",
  choices: choices("system", "on", "off"),
  current: (state) => state.network.saveData,
  select: (value) => engine.setState({ network: { saveData: value as SaveDataValue } }),
};

const TEXT: Group = {
  label: "text",
  choices: choices("system", "13", "15", "17", "20"),
  current: (state) => String(state.text),
  select: (value) => engine.setState({ text: value === "system" ? "system" : Number(value) }),
};

const SPACING: Group = {
  label: "spacing",
  choices: choices("off", "on"),
  current: (state) => (state.spacing ? "on" : "off"),
  select: (value) => engine.setState({ spacing: value === "on" }),
};

const WIDTH: Group = {
  label: "width",
  choices: choices("full", "1024", "768", "390"),
  current: (state) => String(state.width),
  select: (value) => engine.setState({ width: value === "full" ? "full" : Number(value) }),
};

const FRAME: Group = {
  label: "frame",
  choices: choices("off", "on"),
  current: (state) => (state.frame ? "on" : "off"),
  select: (value) => engine.setState({ frame: value === "on" }),
};

const DPR: Group = {
  label: "dpr",
  choices: choices("system", "1", "2", "3"),
  current: (state) => String(state.dpr),
  select: (value) => engine.setState({ dpr: value === "system" ? "system" : Number(value) }),
};

const VISION: Group = {
  label: "vision",
  choices: choices("none", "protanopia", "deuteranopia", "tritanopia", "achromatopsia", "blur"),
  current: (state) => state.vision,
  select: (value) => engine.setState({ vision: value as VisionValue }),
};

const OVERFLOW: Group = {
  label: "overflow",
  choices: choices("off", "on"),
  current: (state) => (state.overflow ? "on" : "off"),
  select: (value) => engine.setState({ overflow: value === "on" }),
};

const OUTLINES: Group = {
  label: "outlines",
  choices: choices("off", "on"),
  current: (state) => (state.outlines ? "on" : "off"),
  select: (value) => engine.setState({ outlines: value === "on" }),
};

/**
 * What the width label says about the overflow knob, such as ` · 2 overflowing`.
 * Nothing while the knob is off, or before the count is known.
 */
export function overflowBadge(on: boolean, count: number | null): string {
  return on && count !== null ? ` · ${count} overflowing` : "";
}

/**
 * `2026-10-04T09:30`, an instant the way a `datetime-local` input reads it,
 * on the page's own clock face.
 */
export function wallInput(time: number): string {
  const date = new Date(time);
  const pad = (value: number, length = 2) => String(value).padStart(length, "0");
  const day = `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return `${day}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
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

function numberField(placeholder: string): HTMLInputElement {
  const node = field("field-num", placeholder, placeholder);
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

function addGroup(parent: HTMLElement, group: Group, bindings: Binding[]): HTMLElement {
  const box = el("div", "group");
  box.append(el("div", "label", group.label));
  const row = el("div", "row");
  for (const choice of group.choices) {
    const node = button("btn", choice.label);
    node.addEventListener("click", () => group.select(choice.value));
    bindings.push({ button: node, group, value: choice.value });
    row.append(node);
  }
  box.append(row);
  parent.append(box);
  return box;
}

/**
 * Build the panel, put it on the page and keep it in step with the engine. The
 * host carries an open shadow root, so the page cannot style the panel and the
 * panel cannot style the page.
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
  const bindings: Binding[] = [];

  addGroup(panel, SCHEME, bindings);
  addGroup(panel, MOTION, bindings);
  addGroup(panel, SPEED, bindings);
  addGroup(panel, CONTRAST, bindings);
  addGroup(panel, TRANSPARENCY, bindings);
  addGroup(panel, LOCALE, bindings);
  addGroup(panel, DIRECTION, bindings);
  addGroup(panel, PSEUDO, bindings);

  const geoBox = addGroup(panel, GEO, bindings);
  const lat = numberField("lat");
  const lng = numberField("lng");
  const fields = el("div", "fields");
  fields.append(lat, lng);
  const route = document.createElement("textarea");
  route.className = "field field-route";
  route.placeholder = "lat,lng per line, or gpx";
  route.spellcheck = false;
  route.setAttribute("aria-label", "route");
  const speed = numberField("km/h");
  const routeFields = el("div", "fields");
  routeFields.append(route, speed);
  geoBox.append(el("div", "label", "custom"), fields, el("div", "label", "route"), routeFields);
  addGroup(panel, GEO_ERROR, bindings);

  const zoneBox = addGroup(panel, TIME_ZONE, bindings);
  const zone = field("field-tz", "Europe/Istanbul", "time zone");
  const zoneFields = el("div", "fields");
  zoneFields.append(zone);
  const zoneNote = el("div", "note");
  zoneBox.append(el("div", "label", "custom"), zoneFields, zoneNote);

  const clockBox = addGroup(panel, CLOCK, bindings);
  const clockAt = field("field-clock", "", "clock date and time");
  clockAt.type = "datetime-local";
  const clockFields = el("div", "fields");
  clockFields.append(clockAt);
  const clockNote = el("div", "note");
  clockBox.append(el("div", "label", "custom"), clockFields, clockNote);
  addGroup(panel, CLOCK_MODE, bindings);
  addGroup(panel, CLOCK_SPEED, bindings);
  addGroup(panel, CLOCK_HEADER, bindings);

  addGroup(panel, ONLINE, bindings);
  // Only Chromium has navigator.connection, so elsewhere these would do nothing.
  if ("connection" in navigator) {
    addGroup(panel, CONNECTION, bindings);
    addGroup(panel, SAVE_DATA, bindings);
  }

  addGroup(panel, TEXT, bindings);
  addGroup(panel, SPACING, bindings);
  const widthBox = addGroup(panel, WIDTH, bindings);
  const badge = el("span", "badge");
  widthBox.firstElementChild?.append(badge);
  addGroup(panel, FRAME, bindings);
  addGroup(panel, DPR, bindings);
  addGroup(panel, VISION, bindings);
  addGroup(panel, OVERFLOW, bindings);
  addGroup(panel, OUTLINES, bindings);

  const actions = el("div", "group");
  const actionRow = el("div", "row");
  const replayButton = button("btn", "replay");
  const resetButton = button("btn", "reset");
  actionRow.append(replayButton, resetButton);
  actions.append(actionRow);

  const foot = el("div", "foot");
  const home = document.createElement("a");
  home.className = "foot-link";
  home.href = SITE_URL;
  home.target = "_blank";
  home.rel = "noopener noreferrer";
  home.textContent = "knobs.dev";
  foot.append(home, ` · dev only · press ${hotkey}`, el("br", ""), "shift-drag moves the panel");
  panel.append(actions, foot);

  wrap.append(handle, panel);
  root.append(style, wrap);

  const darkQuery = window.matchMedia?.("(prefers-color-scheme: dark)") ?? null;

  function schemeOf(state: DevknobsState): SchemeValue {
    if (state.scheme !== "system") return state.scheme;
    return darkQuery?.matches ? "dark" : "light";
  }

  /** Leave an input alone while it has the caret, so typing is never cut off. */
  function fill(input: HTMLInputElement | HTMLTextAreaElement, value: string): void {
    if (root.activeElement === input) return;
    if (input.value !== value) input.value = value;
  }

  /** What the copy inside the width knob's frame last counted, null until it says. */
  let frameCount: number | null = null;

  function render(): void {
    const state = engine.getState();
    const open = state.panel.open;
    wrap.dataset.open = open ? "true" : "false";
    wrap.dataset.scheme = schemeOf(state);
    wrap.dataset.motion = state.motion;
    host.style.top = `${state.panel.y}px`;
    panel.toggleAttribute("inert", !open);
    handle.setAttribute("aria-expanded", open ? "true" : "false");
    for (const binding of bindings) {
      binding.button.classList.toggle("on", binding.group.current(state) === binding.value);
    }
    const fix = resolveGeo(state.geo);
    fill(lat, fix ? String(fix.lat) : "");
    fill(lng, fix ? String(fix.lng) : "");
    fill(route, state.geo.route);
    fill(speed, String(state.geo.speed));
    const keyword = state.timeZone === "geo" || state.timeZone === "system";
    fill(zone, keyword ? "" : state.timeZone);
    zoneNote.textContent = `time zone: ${resolveTimeZone(state.timeZone, state.geo) ?? "system"}`;
    fill(clockAt, state.clock.mode === "system" ? "" : wallInput(state.clock.at));
    clockNote.textContent = clockReadout(state.clock);
    const framed = needsFrame(state);
    if (!framed) frameCount = null;
    const count = framed ? frameCount : overflowCount();
    badge.textContent = overflowBadge(state.overflow, count);
    badge.hidden = badge.textContent === "";
    badge.classList.toggle("hot", count !== null && count > 0);
    shiftPanel(state.panel.y);
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
    engine.setState({ panel: { open: next } });
    clampY();
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

  function commitCustom(): void {
    engine.setState({
      geo: { preset: "custom", lat: toNumber(lat.value), lng: toNumber(lng.value) },
    });
  }

  function commitRoute(): void {
    engine.setState({ geo: { preset: "route", route: route.value } });
  }

  function commitSpeed(): void {
    engine.setState({ geo: { speed: toNumber(speed.value) } });
  }

  /** An emptied field goes back to following geo. */
  function commitZone(): void {
    engine.setState({ timeZone: zone.value.trim() || "geo" });
  }

  /** A date and time picked whole runs the clock from there. */
  function commitClock(): void {
    const at = Date.parse(clockAt.value);
    if (!Number.isNaN(at)) travel(at);
  }

  for (const input of [lat, lng]) input.addEventListener("input", () => queue(commitCustom));
  route.addEventListener("input", () => queue(commitRoute));
  speed.addEventListener("input", () => queue(commitSpeed));
  zone.addEventListener("input", () => queue(commitZone));
  clockAt.addEventListener("change", commitClock);
  replayButton.addEventListener("click", () => engine.replay());
  resetButton.addEventListener("click", () => engine.reset());

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

  function onKeydown(event: KeyboardEvent): void {
    const action = keyAction(event, hotkey);
    if (action) onAction(action);
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

  function onSchemeChange(): void {
    render();
  }

  // The clock runs between knob changes, and its readout with it.
  const ticker = window.setInterval(() => {
    clockNote.textContent = clockReadout(engine.getState().clock);
  }, 1000);
  const unsubscribe = engine.subscribe(render);
  const stopCount = onCount(render);
  window.addEventListener("keydown", onKeydown, true);
  window.addEventListener("message", onMessage);
  window.addEventListener("resize", clampY);
  darkQuery?.addEventListener("change", onSchemeChange);

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
      darkQuery?.removeEventListener("change", onSchemeChange);
      document.removeEventListener("DOMContentLoaded", attach);
      host.remove();
    },
  };
}
