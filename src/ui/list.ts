import { DEFAULT_PINNED } from "../engine/store";
import type { DevknobsState, DevknobsStatePatch } from "../types";
import {
  isActive,
  knobsOf,
  type Live,
  nameOf,
  ROWS,
  type Row,
  type RowId,
  resetPatch,
  summary,
} from "./catalog";

/**
 * Which rows the panel lists, and what they say. A row is listed while a knob
 * of it is off its default, and once set from the panel it stays listed, back
 * at its default too, until its `×` or reset all takes it off. A fresh panel,
 * and reset all, lists the default rows.
 */

/** Grab's row, a switch for grab rather than a knob, listed while grab is on or pinned. */
export const GRAB_ROW = "grab";

/** What can be pinned to the list: a knob's row, or grab's. */
export type ListId = RowId | typeof GRAB_ROW;

/**
 * The order the rows stand in: the default rows first, in their order, then
 * the rest in the catalog's.
 */
export function rowOrder(): ListId[] {
  const ids: ListId[] = [GRAB_ROW, ...ROWS.map((row) => row.id)];
  const first = DEFAULT_PINNED.flatMap((id) => ids.filter((entry) => entry === id));
  return [...first, ...ids.filter((id) => !first.includes(id))];
}

/** The patch that sets knobs from the panel and pins their row. */
export function pinPatch(
  state: DevknobsState,
  id: ListId,
  patch: DevknobsStatePatch,
): DevknobsStatePatch {
  const { pinned } = state.panel;
  return { ...patch, panel: { pinned: pinned.includes(id) ? pinned : [...pinned, id] } };
}

/** The patch that takes a row off the list. */
export function unpinPatch(state: DevknobsState, id: ListId): DevknobsStatePatch {
  return { panel: { pinned: state.panel.pinned.filter((entry) => entry !== id) } };
}

/** The patch a row's `×` sends: its knobs back to their defaults, and the row off the list. */
export function removePatch(state: DevknobsState, row: Row): DevknobsStatePatch {
  return { ...resetPatch(row), ...unpinPatch(state, row.id) };
}

/** Would reset all change nothing: every knob at its default, and the default rows listed alone? */
export function isReset(state: DevknobsState): boolean {
  const { pinned } = state.panel;
  return (
    !ROWS.some((row) => isActive(row, state)) &&
    pinned.length === DEFAULT_PINNED.length &&
    DEFAULT_PINNED.every((id) => pinned.includes(id))
  );
}

export function isListed(row: Row, state: DevknobsState): boolean {
  return isActive(row, state) || state.panel.pinned.includes(row.id);
}

/** Is grab's row listed: only where the panel has a grab, while it is on or pinned. */
export function isGrabListed(state: DevknobsState, hasGrab: boolean, on: boolean): boolean {
  return hasGrab && (on || state.panel.pinned.includes(GRAB_ROW));
}

/** What a listed row says: what it emulates, or the value its first knob is back at. */
export function rowText(row: Row, state: DevknobsState, live: Live): string {
  const text = summary(row, state, live);
  if (text) return text;
  const [knob] = knobsOf(row);
  return knob ? nameOf(knob, knob.read(state)) : "";
}
