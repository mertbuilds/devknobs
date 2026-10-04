import type { DevknobsState, DevknobsStatePatch } from "../types";
import {
  isActive,
  knobsOf,
  type Live,
  nameOf,
  type Row,
  type RowId,
  resetPatch,
  summary,
} from "./catalog";

/**
 * Which rows the panel lists, and what they say. A row is listed while a knob
 * of it is off its default, and once set from the panel it stays listed, back
 * at its default too, until its `×` or reset all takes it off.
 */

/** The patch that sets knobs from the panel and pins their row. */
export function pinPatch(
  state: DevknobsState,
  id: RowId,
  patch: DevknobsStatePatch,
): DevknobsStatePatch {
  const { pinned } = state.panel;
  return { ...patch, panel: { pinned: pinned.includes(id) ? pinned : [...pinned, id] } };
}

/** The patch a row's `×` sends: its knobs back to their defaults, and the row off the list. */
export function removePatch(state: DevknobsState, row: Row): DevknobsStatePatch {
  const pinned = state.panel.pinned.filter((id) => id !== row.id);
  return { ...resetPatch(row), panel: { pinned } };
}

export function isListed(row: Row, state: DevknobsState): boolean {
  return isActive(row, state) || state.panel.pinned.includes(row.id);
}

/** What a listed row says: what it emulates, or the value its first knob is back at. */
export function rowText(row: Row, state: DevknobsState, live: Live): string {
  const text = summary(row, state, live);
  if (text) return text;
  const [knob] = knobsOf(row);
  return knob ? nameOf(knob, knob.read(state)) : "";
}
