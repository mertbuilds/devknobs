import { DEFAULT_PINNED } from "../engine/store";
import type { DevknobsState, DevknobsStatePatch } from "../types";
import {
  combine,
  isActive,
  type Knob,
  knobOf,
  knobsOf,
  type Live,
  nameOf,
  offDefault,
  ROWS,
  type Row,
  type RowId,
  rowHere,
  summary,
} from "./catalog";

/**
 * Which rows the panel lists, and what they say. A row is listed while a knob
 * of it is off its default, and once set or added from the panel it stays
 * listed, back at its default too, until its `×` or reset all takes it off. A fresh panel,
 * and reset all, lists the default rows.
 *
 * An action's row goes by the same rules, with nothing here that tells the
 * two apart: it is listed while its mode is on, as a knob set from outside
 * the panel is, and once run from the panel it stays listed until its `×`.
 * So a key alone lists a mode only while it is on, and pins nothing.
 */

/**
 * The order the rows stand in: the pinned ones in the order they were pinned
 * or dragged to, then the rest in the catalog's, so a row listed for being off
 * its default stands at the end.
 */
export function rowOrder(state: DevknobsState): RowId[] {
  const ids = ROWS.map((row) => row.id);
  const first = state.panel.pinned.flatMap((id) => ids.filter((entry) => entry === id));
  return [...first, ...ids.filter((id) => !first.includes(id))];
}

/** The rows listed, in the order they stand. */
export function listedOrder(state: DevknobsState): RowId[] {
  return rowOrder(state).filter((id) => ROWS.some((row) => row.id === id && isListed(row, state)));
}

/** A list with the item at `from` taken out and put back at `to`, both held inside it. */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const last = items.length - 1;
  const start = Math.min(Math.max(from, 0), last);
  const end = Math.min(Math.max(to, 0), last);
  const out = [...items];
  const [item] = out.splice(start, 1);
  if (item !== undefined) out.splice(end, 0, item);
  return out;
}

/**
 * The moves that stand `items` in the order `wanted` lists them, each an item
 * and the one it goes before, null for the end. Nothing already in place
 * moves, nor does an item of `keep`, the first ones first, while the kept
 * ones stand in the same order in both lists. So a row that holds the focus
 * is never taken off the page, and keeps it.
 */
export function arrange<T>(
  items: readonly T[],
  wanted: readonly T[],
  keep: readonly T[] = [],
): Array<[T, T | null]> {
  const held: T[] = [];
  for (const item of keep) {
    const from = items.indexOf(item);
    const to = wanted.indexOf(item);
    if (from < 0 || to < 0 || held.includes(item)) continue;
    const agree = held.every((other) => from < items.indexOf(other) === to < wanted.indexOf(other));
    if (agree) held.push(item);
  }
  const list = [...items];
  const moves: Array<[T, T | null]> = [];
  let at = 0;
  for (const item of wanted) {
    if (held.includes(item)) {
      // What stands before a kept item and belongs after it moves on its turn.
      at = list.indexOf(item) + 1;
      continue;
    }
    if (list[at] === item) {
      at += 1;
      continue;
    }
    const before = list[at] ?? null;
    const from = list.indexOf(item);
    if (from >= 0) list.splice(from, 1);
    list.splice(before === null ? list.length : list.indexOf(before), 0, item);
    moves.push([item, before]);
    at = list.indexOf(item) + 1;
  }
  return moves;
}

/**
 * The patch that moves the listed row at `from` to `to`. The list is pinned
 * as it then stands, so a row listed only for being off its default is
 * pinned where it was put.
 */
export function movePatch(state: DevknobsState, from: number, to: number): DevknobsStatePatch {
  return { panel: { pinned: moveItem(listedOrder(state), from, to) } };
}

/** The patch that sets knobs from the panel and pins their row. */
export function pinPatch(
  state: DevknobsState,
  id: RowId,
  patch: DevknobsStatePatch,
): DevknobsStatePatch {
  const { pinned } = state.panel;
  return { ...patch, panel: { pinned: pinned.includes(id) ? pinned : [...pinned, id] } };
}

/**
 * What a row's `×` puts a knob back to: what another knob brought, else its
 * default. A knob already there is left alone, so a reset that spans other
 * rows' values, as the device's does, takes nothing it did not bring.
 */
function undo(knob: Knob, state: DevknobsState): DevknobsStatePatch {
  if (!offDefault(knob, state)) return {};
  const base = knob.base?.(state);
  return base === undefined ? knob.reset : knob.write(base, state);
}

/**
 * The patch a row's `×` sends: its knobs back to their defaults, and the row
 * off the list. A value another knob brought stays, so the viewport's `×`
 * leaves a device its size.
 */
export function removePatch(state: DevknobsState, row: Row): DevknobsStatePatch {
  const pinned = state.panel.pinned.filter((id) => id !== row.id);
  return { ...combine(row.knobs.map((id) => undo(knobOf(id), state))), panel: { pinned } };
}

/**
 * Would reset all change nothing: every knob at its default, and the default
 * rows listed alone, in their order? An id no row has here, such as one an
 * older or a newer version kept, is not listed and counts for nothing.
 */
export function isReset(state: DevknobsState): boolean {
  const pinned = state.panel.pinned.filter((id) =>
    ROWS.some((row) => row.id === id && rowHere(row)),
  );
  return (
    ROWS.every((row) => !isActive(row, state)) &&
    pinned.length === DEFAULT_PINNED.length &&
    pinned.every((id, at) => id === DEFAULT_PINNED[at])
  );
}

export function isListed(row: Row, state: DevknobsState): boolean {
  return rowHere(row) && (isActive(row, state) || state.panel.pinned.includes(row.id));
}

/**
 * Whether a knob shows its label over its control. A knob named as its row is
 * already named by the row's title, so the label would only say it again.
 */
export function showsLabel(row: Row, knob: Knob): boolean {
  return knob.label !== row.label;
}

/**
 * What a listed row says: what it emulates, or the value its first knob is
 * back at. An action's says what it has to say, or whether its mode is on, and
 * nothing with no mode.
 */
export function rowText(row: Row, state: DevknobsState, live: Live): string {
  if (row.action) return row.action.value?.() || (row.action.state?.() ?? "");
  const text = summary(row, state, live);
  if (text) return text;
  const [knob] = knobsOf(row);
  return knob ? nameOf(knob, knob.read(state)) : "";
}
