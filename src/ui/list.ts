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
  ROWS,
  type Row,
  type RowId,
  summary,
} from "./catalog";

/**
 * Which rows the panel lists, and what they say. A row is listed while a knob
 * of it is off its default, and once set from the panel it stays listed, back
 * at its default too, until its `×` or reset all takes it off. A fresh panel,
 * and reset all, lists the default rows.
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

/** What a row's `×` puts a knob back to: what another knob brought, else its default. */
function undo(knob: Knob, state: DevknobsState): DevknobsStatePatch {
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
 * rows listed alone, in their order? An id no row has, such as one an older
 * version kept, is not listed and counts for nothing.
 */
export function isReset(state: DevknobsState): boolean {
  const pinned = state.panel.pinned.filter((id) => ROWS.some((row) => row.id === id));
  return (
    ROWS.every((row) => !isActive(row, state)) &&
    pinned.length === DEFAULT_PINNED.length &&
    pinned.every((id, at) => id === DEFAULT_PINNED[at])
  );
}

export function isListed(row: Row, state: DevknobsState): boolean {
  return isActive(row, state) || state.panel.pinned.includes(row.id);
}

/**
 * Whether a knob shows its label over its control. A knob named as its row is
 * already named by the row's title, so the label would only say it again.
 */
export function showsLabel(row: Row, knob: Knob): boolean {
  return knob.label !== row.label;
}

/** What a listed row says: what it emulates, or the value its first knob is back at. */
export function rowText(row: Row, state: DevknobsState, live: Live): string {
  const text = summary(row, state, live);
  if (text) return text;
  const [knob] = knobsOf(row);
  return knob ? nameOf(knob, knob.read(state)) : "";
}
