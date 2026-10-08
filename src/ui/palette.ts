import * as engine from "../engine";
import { frameForced } from "../engine/frame";
import type { GrabControl } from "../grab/control";
import type { DevknobsState } from "../types";
import { type Action, browse, type Knob, nameOf, rowOf } from "./catalog";
import { el, reveal } from "./dom";
import { commit, set } from "./editors";
import { ACTION_ICONS, icon, ROW_ICONS } from "./icons";
import { highlightAt, paletteMove } from "./keys";
import type { Rows } from "./rows";
import { type Result, resultText, search, searchActions } from "./search";
import type { Slide } from "./slide";

/**
 * The search that opens from the add knob button: its field, the results of
 * what is typed and, with nothing typed, the browse list of every knob and
 * action. Picking an entry sets a value or adds and opens a knob's row.
 */

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
  grab: GrabControl | null;
  /** The actions search finds. */
  actionsHere: readonly Action[];
  /** Draw the whole panel again. */
  render(): void;
  /** Whether the settings show in place of the rows. */
  editingKeys(): boolean;
  /** Stop recording a key and leave the settings, without drawing anything. */
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
  runAction(id: Action["id"]): void;
  onGrab(on: boolean): void;
  onPointerDown(): void;
  onPointerUp(): void;
}

export function createPalette(context: PaletteContext): Palette {
  const { root, wrap, slide, searchInput, closeSearch, add, results, rows, grab, actionsHere } =
    context;
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
    const mode = context.editingKeys() ? "keys" : query ? "results" : browsing ? "browse" : "rows";
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
    runAction,
    onGrab,
    onPointerDown,
    onPointerUp,
  };
}
