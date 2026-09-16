import * as engine from "../engine";
import { GEO_PRESETS, resolveGeo } from "../engine/geo";
import { LOCALE_PRESETS } from "../engine/locale";
import type {
  ContrastValue,
  DevknobsState,
  DirValue,
  MotionValue,
  SchemeValue,
} from "../types";
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

const CONTRAST: Group = {
  label: "contrast",
  choices: choices("system", "more"),
  current: (state) => state.contrast,
  select: (value) => engine.setState({ contrast: value as ContrastValue }),
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

const GEO: Group = {
  label: "geo",
  choices: [
    { label: "system", value: "system" },
    ...GEO_PRESETS.map((preset) => ({ label: preset.label.toLowerCase(), value: preset.id })),
  ],
  current: (state) => state.geo.preset,
  select: (value) => engine.setState({ geo: { preset: value } }),
};

const TEXT: Group = {
  label: "text",
  choices: choices("system", "13", "15", "17", "20"),
  current: (state) => String(state.text),
  select: (value) => engine.setState({ text: value === "system" ? "system" : Number(value) }),
};

const WIDTH: Group = {
  label: "width",
  choices: choices("full", "1024", "768", "390"),
  current: (state) => String(state.width),
  select: (value) => engine.setState({ width: value === "full" ? "full" : Number(value) }),
};

const OUTLINES: Group = {
  label: "outlines",
  choices: choices("off", "on"),
  current: (state) => (state.outlines ? "on" : "off"),
  select: (value) => engine.setState({ outlines: value === "on" }),
};

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

function isEditable(node: EventTarget | null): boolean {
  const element = node as HTMLElement | null;
  const tag = element?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return element?.isContentEditable === true;
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
  const hotkey = (options.hotkey ?? "d").toLowerCase();

  const host = document.createElement("div");
  host.setAttribute("data-devknobs", "panel");
  host.style.cssText = "position:fixed;right:0;top:0;z-index:2147483646";
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
  addGroup(panel, CONTRAST, bindings);
  addGroup(panel, LOCALE, bindings);
  addGroup(panel, DIRECTION, bindings);

  const geoBox = addGroup(panel, GEO, bindings);
  const lat = numberField("lat");
  const lng = numberField("lng");
  const zone = field("field-tz", "Europe/Istanbul", "time zone");
  const fields = el("div", "fields");
  fields.append(lat, lng, zone);
  const zoneNote = el("div", "note");
  geoBox.append(el("div", "label", "custom"), fields, zoneNote);

  addGroup(panel, TEXT, bindings);
  const widthBox = addGroup(panel, WIDTH, bindings);
  widthBox.append(el("div", "note", "container queries and vw units still use the window"));
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
  foot.append(home, ` · dev only · press ${hotkey}`);
  panel.append(actions, foot);

  wrap.append(handle, panel);
  root.append(style, wrap);

  const darkQuery = window.matchMedia?.("(prefers-color-scheme: dark)") ?? null;

  function schemeOf(state: DevknobsState): SchemeValue {
    if (state.scheme !== "system") return state.scheme;
    return darkQuery?.matches ? "dark" : "light";
  }

  /** Leave an input alone while it has the caret, so typing is never cut off. */
  function fill(input: HTMLInputElement, value: string): void {
    if (root.activeElement === input) return;
    if (input.value !== value) input.value = value;
  }

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
    fill(zone, fix?.timeZone ?? "");
    zoneNote.textContent = `time zone: ${fix?.timeZone || "system"}`;
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

  let debounce = 0;

  function commitCustom(): void {
    debounce = 0;
    engine.setState({
      geo: {
        preset: "custom",
        lat: toNumber(lat.value),
        lng: toNumber(lng.value),
        timeZone: zone.value.trim(),
      },
    });
  }

  function queueCustom(): void {
    clearTimeout(debounce);
    debounce = window.setTimeout(commitCustom, CUSTOM_DEBOUNCE);
  }

  for (const input of [lat, lng, zone]) input.addEventListener("input", queueCustom);
  replayButton.addEventListener("click", () => engine.replay());
  resetButton.addEventListener("click", () => engine.reset());

  let dragging = false;
  let dragged = false;
  let startPointer = 0;
  let lastPointer = 0;
  let dragTop = 0;
  let dragPanelTop = 0;

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

  function onKeydown(event: KeyboardEvent): void {
    // A drag owns the handle until the pointer is up, hotkey and escape too.
    if (dragging) return;
    if (event.key === "Escape") {
      if (engine.getState().panel.open) toggle(false);
      return;
    }
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const target = event.composedPath?.()[0] ?? event.target;
    if (isEditable(target)) return;
    if (event.key.toLowerCase() === hotkey) toggle();
  }

  function onSchemeChange(): void {
    render();
  }

  const unsubscribe = engine.subscribe(render);
  window.addEventListener("keydown", onKeydown, true);
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
      clearTimeout(debounce);
      window.removeEventListener("keydown", onKeydown, true);
      window.removeEventListener("resize", clampY);
      darkQuery?.removeEventListener("change", onSchemeChange);
      document.removeEventListener("DOMContentLoaded", attach);
      host.remove();
    },
  };
}
