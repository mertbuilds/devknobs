import type { GrabControl } from "../grab/control";
import type { Requests } from "./requests";

/**
 * What the actions act on, on this page. The catalog says what an action does,
 * as data, and the panel hands in the live things it does it to as it mounts,
 * and takes them back as it goes. A feature adds here what its action needs.
 */
export interface Stage {
  /** Grab, where there is one. */
  grab: GrabControl | null;
  /** Inspect's switch, where there is one. */
  inspect: GrabControl | null;
  /** The requests view, where a panel shows one. */
  requests: Requests | null;
}

export const stage: Stage = { grab: null, inspect: null, requests: null };
