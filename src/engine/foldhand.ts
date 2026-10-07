import type { DevknobsState } from "../types";
import { foldRest, holdingHinge, releaseFold, scrubFold, watchFold, watchHinge } from "./foldrun";
import { running, still } from "./morphrun";
import { merge } from "./store";
import { turning } from "./turnrun";
import { foldDevice } from "./width";

/**
 * A hand on a foldable's hinge, for the panel's fold slider, which is
 * experimental. The hinge follows the hand through its spring, and the knobs
 * change posture only once it is let go at an end, which the slider says.
 */

export { foldRest, holdingHinge, watchFold, watchHinge };

/**
 * Take the hinge of the foldable `state` shows: of the fold on its way, else
 * of one toward its other posture, which stays shut or open till the hand
 * moves. False where it cannot, as while a device turns or changes.
 */
export function takeHinge(state: DevknobsState): boolean {
  if (running() || turning()) return false;
  return foldDevice(merge(state, { posture: state.posture === "open" ? "closed" : "open" }), true);
}

/** Move the hinge the hand holds toward `target`, 0 shut to 1 open. False where no hand holds one. */
export function moveHinge(target: number): boolean {
  return scrubFold(target);
}

/**
 * Let go of the hinge toward `stop`, springing there, or at once where the
 * user prefers less motion. False where there is no fold to let go of.
 */
export function letGo(stop: number): boolean {
  return releaseFold(stop, still());
}
