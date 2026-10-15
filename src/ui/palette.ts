import * as engine from "../engine";
import { frameForced } from "../engine/frame";
import type { DevknobsState } from "../types";
import { runAction } from "./actions";
import { type Action, browse, type Knob, nameOf, rowOf } from "./catalog";
import { el, reveal } from "./dom";
import { commit, set } from "./editors";
import { icon, ROW_ICONS } from "./icons";
import { highlightAt, paletteMove } from "./keys";
import { actionLabel } from "./pin";
import type { Rows } from "./rows";
import { type Result, resultText, search, searchActions } from "./search";
import type { Slide } from "./slide";

/**
 * The search that opens from the add knob button: its field, the results of
 * what is typed and, with nothing typed, the browse list of every knob and
 * action. Picking an entry sets a value, adds and opens a knob's row, or runs
 * an action, which adds its row.
 */

/** What the panel's body shows, as the wrapper's `data-mode` says it. */
export type Mode = "rows" | "results" | "browse" | "view" | "keys";

/**
 * What the body shows: the settings over everything, then a feature's view
 * over the rows, then the search with a query or without one, and the rows
 * with none of them.
 */
export function modeOf(scene: {
  keys: boolean;
  view: boolean;
  query: boolean;
  browsing: boolean;
}): Mode {
  if (scene.keys) return "keys";
  if (scene.view) return "view";
  return scene.query ? "results" : scene.browsing ? "browse" : "rows";
}

/** A line of the results or the browse list, and what picking it does. */
interface Entry {
  node: HTMLElement;
  pick(): void;
}

/** What the search needs from the panel. */
export interface PaletteContext {
  /** The panel's shadow root, which knows the focus. */
  root: ShadowRoot;
  /** The wrapper, which carries the view shown as `data-mode`. */
  wrap: HTMLElement;
  slide: Slide;
  searchInput: HTMLInputElement;
  closeSearch: HTMLButtonElement;
  add: HTMLButtonElement;
  results: HTMLElement;
  rows: Rows;
  /** The actions search finds. */
  actionsHere: readonly Action[];
  /** Draw the whole panel again. */
  render(): void;
  /** Whether the settings show in place of the rows. */
  editingKeys(): boolean;
  /** Whether a feature's view shows in place of the rows. */
  viewing(): boolean;
  /** Stop recording a key, and leave the settings and a feature's view, without drawing anything. */
  dropKeys(): void;
}

export interface Palette {
  /** Whether the search is open, browsing or with a query typed. */
  searching(): boolean;
  /** Stop browsing and drop the query, without drawing anything. */
  clear(): void;
  renderBody(state: DevknobsState): void;
  leaveSearch(): void;
  startBrowsing(text?: string): void;
  onGrab(on: boolean): void;
  onPointerDown(): void;
  onPointerUp(): void;
}

export function createPalette(context: PaletteContext): Palette {
  const { root, wrap, slide, searchInput, closeSearch, add, results, rows, actionsHere } = context;
  const { render } = context;

  /** The search has focus and lists every knob, as nothing is typed. */
  let browsing = false;
  /** The query the results last showed, so a new one puts the highlight back on top. */
  let shownQuery = "";
  /** A pointer is down, so a blur it caused waits for its click to land. */
  let pressing = false;
  /** What the results or the browse list show, and which one Enter picks. */
  let entries: Entry[] = [];
  let cursor = 0;

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

  function actionEntry(id: number, action: Action, state: DevknobsState): Entry {
    return entry(
      id,
      () => runAction(action),
      icon(action.icon),
      el("span", "entry-knob", actionLabel(action, state.panel.docked)),
      el("span", "entry-value", action.long),
    );
  }

  function resultEntries(query: string, state: DevknobsState): Entry[] {
    const actions = searchActions(query, actionsHere);
    const found = search(query).map((result, index) => {
      const text = resultText(result);
      const current = result.option !== null && result.knob.read(state) === result.option.value;
      // The value that is on ends its entry with a check, on the rows' right edge.
      const check = icon("check", 12);
      check.classList.add("entry-check");
      return entry(
        actions.length + index,
        () => pick(result),
        icon(ROW_ICONS[rowOf(result.knob.id).id]),
        el("span", "entry-knob", text.knob),
        el("span", "entry-value", text.value),
        ...(current ? [check] : []),
      );
    });
    return [...actions.map((action, index) => actionEntry(index, action, state)), ...found];
  }

  function browseEntries(state: DevknobsState): { nodes: HTMLElement[]; list: Entry[] } {
    const nodes: HTMLElement[] = [];
    const list: Entry[] = [];
    nodes.push(el("div", "group-label", "actions"));
    for (const action of actionsHere) {
      const item = actionEntry(list.length, action, state);
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

  /** Show what `modeOf` says: the rows, the search, a feature's view or the settings. */
  function renderBody(state: DevknobsState): void {
    const query = searchInput.value.trim();
    const mode = modeOf({
      keys: context.editingKeys(),
      view: context.viewing(),
      query: query !== "",
      browsing,
    });
    slide.show(mode === "keys" || mode === "view" ? mode : "home", state.panel.open, () => {
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
   * Grab, however it went on, takes the focus out of the panel, to the page,
   * so the arrows, Enter, `c` and escape are grab's at once. Off, it leaves
   * the focus where it is. Inspect going on does the same.
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
    if (option.opens) rows.openEditor(id);
    rows.showRow(id, knob);
    if (option.opens) rows.focusCustom(knob);
  }

  /** A knob picked by name adds its row as it is, listed until its `×` takes it off. */
  function openKnob(knob: Knob): void {
    const id = rowOf(knob.id).id;
    leaveSearch();
    commit(id, {});
    rows.openEditor(id);
    rows.showRow(id, knob);
  }

  /**
   * Open the search where the add knob button was, list the knobs and focus
   * it, with `text` typed in where there is some. The field shows only once
   * it is open, so it is opened before it takes the focus.
   */
  function startBrowsing(text = ""): void {
    context.dropKeys();
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

  return {
    searching: () => browsing || searchInput.value !== "",
    clear(): void {
      browsing = false;
      searchInput.value = "";
    },
    renderBody,
    leaveSearch,
    startBrowsing,
    onGrab,
    onPointerDown,
    onPointerUp,
  };
}
