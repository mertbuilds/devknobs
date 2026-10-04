import type { DevknobsState, DprValue } from "../types";
import { hasTouch } from "./devices";
import { coarse } from "./media";
import * as scrollbars from "./scrollbars";
import { equip } from "./touch";
import * as ua from "./ua";

/**
 * What a page reads once as it loads and keeps: the browser, the touch screen
 * and the pixel ratio. A script that sniffed the user agent or set a canvas up
 * for the ratio never looks again, so the frame reloads when any of it moves.
 */
export interface Identity {
  /** The ua preset, which brings its platform and touch points, a custom string, or empty for the browser's own. */
  agent: string;
  /** A touch screen in the frame: `ontouchstart`, touch points and a coarse pointer. */
  touch: boolean;
  dpr: DprValue;
}

type IdentityKnobs = Pick<DevknobsState, "ua" | "device" | "dpr">;

export function identityOf(state: IdentityKnobs): Identity {
  const agent = ua.uaPreset(state.ua.preset) ? state.ua.preset : ua.userAgentOf(state.ua);
  return { agent, touch: hasTouch(state.device), dpr: state.dpr };
}

/** Does a page loaded as `loaded` read wrong under `next`? Not while no page has loaded. */
export function stale(loaded: Identity | null, next: Identity): boolean {
  return (
    loaded !== null &&
    (loaded.agent !== next.agent || loaded.touch !== next.touch || loaded.dpr !== next.dpr)
  );
}

/** On a window patched from above: the identity it was patched as. */
const PATCHED = Symbol.for("devknobs.identity");

function isIdentity(value: unknown): value is Identity {
  return typeof value === "object" && value !== null && "agent" in value && "touch" in value;
}

/** The identity a window was patched as from the page above, if it was. */
export function patchedAs(view: object): Identity | undefined {
  const identity: unknown = Reflect.get(view, PATCHED);
  return isIdentity(identity) ? identity : undefined;
}

/**
 * Patch the frame's new window from the page above, as the frame's own copy
 * would on mount: the user agent, the touch screen, its pointer queries and
 * its scrollbars, before the window's first script. The copy there takes them
 * over. A window patched already keeps what it has, and says what that is.
 */
export function patchWindow(view: Window, state: IdentityKnobs): Identity {
  const had = patchedAs(view);
  if (had) return had;
  const identity = identityOf(state);
  Reflect.set(view, PATCHED, identity);
  ua.apply(state.ua, view);
  if (identity.touch) {
    equip(view, ua.uaPreset(state.ua.preset) === undefined);
    coarse(view);
    scrollbars.equip(view);
  }
  return identity;
}
