import * as engine from "../engine";
import type { DevknobsState, DevknobsStatePatch } from "../types";
import type { Action } from "./catalog";
import { comboLabel, type Keys } from "./keys";
import { pinPatch } from "./list";

/**
 * Running the actions from the panel. The catalog says what each one does,
 * and here is what the panel adds to it: its row stays listed once it is run
 * from the panel, as a knob's does once it is set there.
 */

/** Where the knobs are kept, as far as running an action goes. */
export interface Store {
  getState(): DevknobsState;
  setState(patch: DevknobsStatePatch): unknown;
}

/**
 * Run an action from the panel: from its row, the search, the browse list or
 * a control of the footer. Its row is pinned first, so it is listed from here
 * on. A key runs the action alone, and pins nothing.
 */
export function runAction(action: Action, store: Store = engine): void {
  const state = store.getState();
  if (!state.panel.pinned.includes(action.id)) store.setState(pinPatch(state, action.id, {}));
  action.run();
}

/** Turn a mode off where it is on, as its row's `×` and reset all do. */
export function stopAction(action: Action): void {
  if (action.state?.() === "on") action.off?.();
}

/** The key that runs an action, as its row shows it. Nothing with no key. */
export function actionKey(action: Action, keys: Partial<Keys>, mac: boolean): string {
  const combo = action.binding ? keys[action.binding] : undefined;
  return combo ? comboLabel(combo, mac) : "";
}
