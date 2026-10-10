import type { GrabControl } from "../grab/control";

/**
 * What the actions act on, on this page. The catalog says what an action does,
 * as data, and the panel hands in the live things it does it to as it mounts,
 * and takes them back as it goes. A feature adds here what its action needs.
 */
export interface Stage {
  /** Grab, where there is one. */
  grab: GrabControl | null;
  /** Takes the panel to the other side of the window, while there is a panel. */
  flip: (() => void) | null;
}

export const stage: Stage = { grab: null, flip: null };
