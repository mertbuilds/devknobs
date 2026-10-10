import * as engine from "../engine";
import type { DevknobsState } from "../types";
import {
  isActive,
  type Knob,
  type Live,
  type Option,
  ROWS,
  type Row,
  type RowId,
  rowOf,
} from "./catalog";
import { actionKey, runAction, stopAction } from "./actions";
import { button, center, el, firstControl, reveal, rowBox, rowButton } from "./dom";
import { createEditors, set, type Update } from "./editors";
import { icon, rowIcon } from "./icons";
import type { Keys } from "./keys";
import { arrange, isListed, listedOrder, movePatch, removePatch, rowOrder, rowText } from "./list";
import { between, DRAG_SLOP } from "./place";

/**
 * The rows: one per row of the catalog, each a line that opens into its
 * editor, folded in place under it. An action's row is the same line, and
 * runs the action where a knob row opens. Listed rows stand in the order the
 * state keeps, and their grips reorder them, by drag or by the arrow keys.
 */

/** A row's line: what every row has, a knob row's and an action's alike. */
export interface RowLine {
  box: HTMLElement;
  grip: HTMLButtonElement;
  main: HTMLButtonElement;
  value: HTMLElement;
  /** The key that runs the row's action, where it has one. */
  key: HTMLElement | null;
  clear: HTMLButtonElement;
}

/**
 * Build a row's line from its catalog entry: the grip in the leading slot,
 * its icon and name, what it says, then its x. An action's ends with its key
 * as the footer shows a key, and its x takes it off the list where a knob
 * row's puts its knobs back too.
 */
export function rowLine(row: Row): RowLine {
  const grip = button("grip", "");
  grip.append(icon("grip-vertical"));
  grip.setAttribute("aria-label", `move ${row.label}`);
  grip.title = "drag, or press up or down, to reorder";
  const main = button("main", "");
  const value = el("span", "row-value");
  const key = row.action?.binding ? el("kbd", "hint-key row-key") : null;
  const clear = rowButton("clear", icon("x"), `${row.action ? "remove" : "reset"} ${row.label}`);
  const { box } = rowBox({
    main,
    grip,
    glyph: icon(rowIcon(row)),
    title: row.label,
    ends: key ? [value, key] : [value],
    after: [clear],
  });
  box.dataset.row = row.id;
  return { box, grip, main, value, key, clear };
}

export interface RowView extends RowLine {
  row: Row;
  /** Folds the editor away under the row's line, and out to its height. */
  fold: HTMLElement;
  editor: HTMLElement;
  updates: Update[];
}

/** How long a row's editor takes to fold out, in ms, as the stylesheet sets it. */
const FOLD = 180;

/** The space between two rows, in px, as the stylesheet sets it. */
const ROW_GAP = 1;

/** How near the rows' top or bottom a dragged row scrolls them, and how far a move, in px. */
const ROW_EDGE = 16;
const ROW_SCROLL = 8;

/** What the rows need from the panel. */
export interface RowsContext {
  /** The panel's shadow root, which knows the focus. */
  root: ShadowRoot;
  /** The box the rows stand in. */
  rows: HTMLElement;
  /** The live region that says where a row moved to. */
  said: HTMLElement;
  /** Draw the whole panel again. */
  render(): void;
  /** Whether the handle is being dragged, which leaves the grips alone. */
  dragging(): boolean;
  /** Whether the keys show as a Mac's. */
  mac: boolean;
}

export interface Rows {
  viewOf(id: RowId): RowView | undefined;
  /** The row whose editor is open, if any. */
  openRow(): RowId | null;
  /** Forget the open row, without drawing anything. */
  clearOpen(): void;
  openEditor(id: RowId | null): void;
  focusCustom(knob: Knob): void;
  showRow(id: RowId, knob: Knob): void;
  /** Draw the rows for a state, and say whether any shows. */
  renderRows(state: DevknobsState, live: Live): boolean;
  /** Draw the readouts that run with the clock. */
  tick(state: DevknobsState, live: Live): void;
  /** Show the keys in force on the actions' rows. */
  drawKeys(now: Keys): void;
  /** Whether a row is being dragged by its grip. */
  reordering(): boolean;
  endReorder(keep: boolean): void;
  destroy(): void;
}

export function createRows(context: RowsContext): Rows {
  const { root, rows, said } = context;
  const editors = createEditors({ root, pickOption });

  /** The row whose editor is open. */
  let openRow: RowId | null = null;

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

  const views: RowView[] = ROWS.map((row) => {
    const line = rowLine(row);
    const { box, grip, main, clear } = line;
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
    const { action } = row;
    // An action has nothing to open: its line runs it, and its x turns its mode off.
    main.addEventListener("click", () => {
      if (action) runAction(action);
      else openEditor(openRow === row.id ? null : row.id);
    });
    clear.addEventListener("click", () => {
      if (openRow === row.id) openRow = null;
      if (action) stopAction(action);
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
    const updates = editors.buildEditor(row, editor);
    return { ...line, row, fold, editor, updates };
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
    if (event.button !== 0 || reorder || context.dragging()) return;
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
    context.render();
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

  rows.addEventListener("scroll", placeReorder);

  return {
    viewOf,
    openRow: () => openRow,
    clearOpen(): void {
      openRow = null;
    },
    openEditor,
    focusCustom,
    showRow,
    renderRows(state: DevknobsState, live: Live): boolean {
      let anyShown = false;
      orderRows(state);
      for (const view of views) {
        const listed = isListed(view.row, state);
        const expanded = openRow === view.row.id;
        anyShown ||= listed || expanded;
        const shown = !view.box.hidden;
        view.box.hidden = !listed && !expanded;
        foldRow(view, expanded, shown);
        // A mode says whether it is on, as a row says whether it is open.
        const mode = view.row.action?.state?.() ?? null;
        if (mode) view.main.setAttribute("aria-pressed", mode === "on" ? "true" : "false");
        else if (!view.row.action) {
          view.main.setAttribute("aria-expanded", expanded ? "true" : "false");
        }
        view.value.textContent = rowText(view.row, state, live);
        // A toggle that is on says so as a mode does, though it keeps no row listed.
        view.value.classList.toggle("idle", mode ? mode !== "on" : !isActive(view.row, state));
        view.clear.hidden = !listed;
        view.grip.hidden = !listed;
        if (expanded) for (const update of view.updates) update(state);
      }
      return anyShown;
    },
    tick(state: DevknobsState, live: Live): void {
      for (const view of views) {
        if (!view.box.hidden) view.value.textContent = rowText(view.row, state, live);
      }
      if (openRow === "clock") for (const update of viewOf("clock")?.updates ?? []) update(state);
    },
    drawKeys(now: Keys): void {
      for (const view of views) {
        if (!view.key || !view.row.action) continue;
        view.key.textContent = actionKey(view.row.action, now, context.mac);
        view.key.hidden = view.key.textContent === "";
      }
    },
    reordering: () => reorder !== null,
    endReorder,
    destroy(): void {
      cancelAnimationFrame(following);
      editors.destroy();
    },
  };
}
