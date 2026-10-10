import * as engine from "../engine";
import { now, realNow } from "../engine/clock";
import { type KeyAction, needsFrame, readMessage } from "../engine/frame";
import { onCount, overflowCount } from "../engine/overflow";
import { isMac } from "../engine/ua";
import { coverBeside, frameWindow, zoomKey } from "../engine/width";
import type { GrabControl } from "../grab/control";
import type { DevknobsState } from "../types";
import { ACTIONS, type Live } from "./catalog";
import { BINDINGS, createKeys, type LiveKeys } from "./bindings";
import { button, el } from "./dom";
import { createDrag } from "./drag";
import { type Command, createFooter, overflowBadge } from "./footer";
import { icon } from "./icons";
import {
  comboSpoken,
  escapeStep,
  isSearchKey,
  KEYS_FIELD,
  keyAction,
  typeAhead,
  zoomAction,
} from "./keys";
import { isReset } from "./list";
import { createPalette } from "./palette";
import { createPane } from "./pane";
import { createPrefs } from "./prefs";
import { createRequests } from "./requests";
import { createRows } from "./rows";
import { createSettings } from "./settings";
import { createSlide } from "./slide";
import { CSS } from "./styles";
import { createTips } from "./tooltip";

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

/**
 * The host's own style. It is as wide and as tall as an open panel whatever
 * the panel is doing, so it never takes a pointer: the stylesheet hands that
 * back to the handle and to a panel that is out, and every other pixel of the
 * box belongs to the page underneath. The side it lives on anchors it to the
 * left or the right edge.
 */
export const HOST_STYLE = "position:fixed;top:0;z-index:2147483646;pointer-events:none";

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

  // The rows view, which the settings slide in over.
  const home = el("div", "home pane");
  home.append(rows, empty, add, head, results);

  const footer = createFooter(keys, grab, mac);
  const { foot, badge, hints, keysToggle } = footer;
  // The tooltip the icon-only controls share. Their aria-label already says
  // the same, so assistive tech is not told twice.
  const tip = el("div", "tip");
  tip.setAttribute("aria-hidden", "true");
  const tips = createTips(tip, wrap);

  const settings = createSettings({
    keys,
    prefs,
    grab,
    mac,
    bindingsHere,
    keysToggle,
    said,
    tips,
    render,
    renderKeys,
    searching: () => palette.searching(),
    leaveSearch: () => palette.leaveSearch(),
  });
  body.append(home, settings.view, said);
  const slide = createSlide(body, { home, keys: settings.view });

  // The side pane, between the handle and the panel as the tab key goes.
  const side = createPane({
    wrap,
    root,
    handle,
    home: add,
    tips,
    openPanel: () => {
      if (!engine.getState().panel.open) toggle(true);
    },
    cover: coverBeside,
  });
  const requests = createRequests({ said });

  panel.append(body, foot, tip);
  wrap.append(handle, side.node, panel);
  root.append(style, wrap);

  const knobRows = createRows({ root, rows, said, render, dragging: () => drag.dragging() });
  const palette = createPalette({
    root,
    wrap,
    slide,
    searchInput,
    closeSearch,
    add,
    results,
    rows: knobRows,
    grab,
    actionsHere,
    render,
    editingKeys: () => settings.editing(),
    dropKeys: () => {
      settings.stopRecording();
      settings.setEditing(false);
    },
    toggleRequests: requests.toggle,
  });
  const drag = createDrag({ host, wrap, handle, panel, render, toggle, placed: side.place });
  const { layout } = drag;

  /** What the copy inside the width knob's frame last counted, null until it says. */
  let frameCount: number | null = null;

  function liveOf(state: DevknobsState): Live {
    const framed = needsFrame(state);
    if (!framed) frameCount = null;
    return { now: now(), real: realNow(), overflow: framed ? frameCount : overflowCount() };
  }

  function render(): void {
    const state = engine.getState();
    const open = state.panel.open;
    wrap.dataset.open = open ? "true" : "false";
    const handleShown = prefs.get().handle;
    wrap.dataset.handle = handleShown ? "shown" : "hidden";
    settings.drawHandle(handleShown);
    panel.toggleAttribute("inert", !open);
    side.render(open);
    handle.setAttribute("aria-expanded", open ? "true" : "false");
    const live = liveOf(state);
    const anyShown = knobRows.renderRows(state, live);
    const hot = state.overflow && live.overflow !== null && live.overflow > 0;
    knobRows.viewOf("debug")?.value.classList.toggle("hot", hot);
    empty.hidden = anyShown;
    rows.hidden = !anyShown;
    const resetHint = hints.get("reset");
    if (resetHint) resetHint.disabled = isReset(state);
    badge.textContent = overflowBadge(state.overflow, live.overflow);
    badge.hidden = badge.textContent === "";
    badge.classList.toggle("hot", hot);
    palette.renderBody(state);
    renderKeys();
    layout();
  }

  /** Show the keys in force: on the handle, the footer and the shortcuts. */
  function renderKeys(): void {
    const now = keys.get();
    handle.setAttribute("aria-label", `devknobs, press ${comboSpoken(now.panel)}`);
    footer.drawKeys(now);
    settings.drawKeys(now);
  }

  /** The clock runs between knob changes, and its readouts with it. */
  function tick(): void {
    const state = engine.getState();
    if (!state.panel.open) return;
    const live = liveOf(state);
    knobRows.tick(state, live);
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
      palette.clear();
      settings.setEditing(false);
      settings.stopRecording();
      tips.hide();
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

  /** Every knob back to its default, the default rows listed and the search left. */
  function resetAll(): void {
    knobRows.clearOpen();
    searchInput.value = "";
    engine.reset();
  }

  function runCommand(command: Command): void {
    if (command === "panel") toggle(false);
    else if (command === "search") palette.startBrowsing();
    else if (command === "grab") palette.runAction("grab");
    else if (command === "replay") engine.replay();
    else resetAll();
  }

  for (const [command, node] of hints) node.addEventListener("click", () => runCommand(command));

  function onBlur(): void {
    settings.stopRecording();
    knobRows.endReorder(false);
    drag.cancel();
  }

  const { onPointerDown, onPointerUp } = palette;

  /** Run a key's action. */
  function onAction(action: KeyAction): void {
    if (action === "zoom-in" || action === "zoom-out" || action === "zoom-fit") {
      zoomKey(action);
      return;
    }
    // A drag owns the handle until the pointer is up, hotkey and escape too.
    if (drag.dragging()) return;
    if (action === "toggle") {
      toggle();
      return;
    }
    if (!engine.getState().panel.open) return;
    if (action === "replay") runCommand("replay");
    else if (action === "requests") requests.toggle();
    else if (action === "reset") runCommand("reset");
    else if (action === "search") palette.startBrowsing();
    else toggle(false);
  }

  /**
   * Escape takes one step back at a time, as `escapeStep` says. With the focus
   * out on the page, it closes the panel straight away. A row being dragged
   * goes back where it was first, and with the focus in the side pane it is
   * the pane's, whatever the panel shows.
   */
  function escape(): void {
    if (drag.dragging() || !engine.getState().panel.open) return;
    if (knobRows.reordering()) {
      knobRows.endReorder(false);
      return;
    }
    if (side.escape()) return;
    const focused = root.activeElement;
    const filter =
      focused instanceof HTMLInputElement && focused.classList.contains("filter") ? focused : null;
    const openRow = knobRows.openRow();
    const view = openRow ? knobRows.viewOf(openRow) : undefined;
    const step = escapeStep({
      search: palette.searching(),
      filter: filter !== null && filter.value !== "",
      keys: settings.editing(),
      editor: focused !== null && view !== undefined,
    });
    if (step === "search") {
      // Back to the button the search opened from, while the focus was in it.
      const inSearch = focused === searchInput;
      palette.leaveSearch();
      if (inSearch) add.focus({ preventScroll: true });
    } else if (step === "filter" && filter) {
      filter.value = "";
      filter.dispatchEvent(new Event("input"));
    } else if (step === "keys") {
      settings.leaveKeys();
    } else if (step === "editor" && view) {
      knobRows.openEditor(null);
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
    if (settings.recordingKey(event)) return;
    // Escape takes a tooltip away first, and nothing else with it.
    if (event.key === "Escape" && tips.hide()) {
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
    // the toggle unless a drag holds it, replay, requests and reset while the
    // panel is open. In the search no key the panel took is typed.
    const acts =
      action !== null &&
      action !== "close" &&
      !drag.dragging() &&
      (action === "toggle" || engine.getState().panel.open);
    const inSearch = event.composedPath()[0] === searchInput;
    if (acts || (action && action !== "close" && inSearch)) event.preventDefault();
    if (action === "close") escape();
    else if (action) onAction(action);
    if (action || drag.dragging() || knobRows.reordering() || !engine.getState().panel.open) return;
    const text = event.composedPath().includes(panel) ? typeAhead(event) : null;
    if (text === null && !isSearchKey(event)) return;
    event.preventDefault();
    event.stopPropagation();
    palette.startBrowsing(text ?? "");
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

  /** The window changed size: the panel keeps to the edge it is flush with. */
  function onResize(): void {
    layout("edge");
  }

  const ticker = window.setInterval(tick, 1000);
  const unsubscribe = engine.subscribe(render);
  const stopKeys = keys.subscribe(renderKeys);
  const stopPrefs = prefs.subscribe(render);
  const stopGrab = grab?.subscribe(palette.onGrab);
  const stopCount = onCount(render);
  window.addEventListener("keydown", onKeydown, true);
  window.addEventListener("pointerdown", onPointerDown, true);
  window.addEventListener("pointerup", onPointerUp, true);
  window.addEventListener("pointercancel", onPointerUp, true);
  window.addEventListener("message", onMessage);
  window.addEventListener("resize", onResize);
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
  layout("edge");

  return {
    destroy(): void {
      settings.stopRecording();
      unsubscribe();
      stopKeys();
      if (!options.keys) keys.destroy();
      stopPrefs();
      prefs.destroy();
      stopGrab?.();
      stopCount();
      clearInterval(ticker);
      tips.destroy();
      settings.destroy();
      side.destroy();
      slide.destroy();
      knobRows.destroy();
      window.removeEventListener("keydown", onKeydown, true);
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("pointerup", onPointerUp, true);
      window.removeEventListener("pointercancel", onPointerUp, true);
      window.removeEventListener("message", onMessage);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("blur", onBlur);
      resizes.disconnect();
      document.removeEventListener("DOMContentLoaded", attach);
      host.remove();
    },
  };
}
