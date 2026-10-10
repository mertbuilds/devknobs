import type { GrabControl } from "../grab/control";
import type { StorageControl } from "./storageaction";

/**
 * What the actions act on, on this page. The catalog says what an action does,
 * as data, and the panel hands in the live things it does it to as it mounts,
 * and takes them back as it goes. A feature adds here what its action needs.
 */
export interface Stage {
  /** Grab, where there is one. */
  grab: GrabControl | null;
  /** The storage view, where there is a panel to show it in. */
  storage: StorageControl | null;
}

export const stage: Stage = { grab: null, storage: null };
