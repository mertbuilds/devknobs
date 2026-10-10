import * as engine from "../engine";
import { dockRoom, dockWidth } from "../engine/dock";
import type { DevknobsStatePatch, PanelValue } from "../types";
import type { Action } from "./catalog";

/**
 * Pinning the panel to its side, as devtools dock: the control in the footer
 * and the action in the search both come here.
 */

/** The patch that pins a floating panel and lets a pinned one float. Nothing else of it changes. */
export function pinPatch(panel: Pick<PanelValue, "docked">): DevknobsStatePatch {
  return { panel: { docked: !panel.docked } };
}

/**
 * Pin the panel, or let it float again, and keep that for new tabs, as it is
 * a move the user made.
 */
export function togglePin(): void {
  engine.setState(pinPatch(engine.getState().panel));
  engine.keepPlace();
}

/** What the pin control does next, in a word or two: its name for assistive tech. */
export function pinWord(docked: boolean): string {
  return docked ? "unpin" : "pin to the side";
}

/**
 * What the pin control's tooltip says. In a window too narrow to leave the
 * page its least beside the panel, it says the panel lies over the page.
 */
export function pinTip(docked: boolean, view: number): string {
  const room = dockRoom(view, dockWidth());
  return room ? pinWord(docked) : `${pinWord(docked)} · over the page in a window this narrow`;
}

/** What the search calls an action now: the pin's says what it would do. */
export function actionLabel(action: Action, docked: boolean): string {
  return action.id === "pin" && docked ? "unpin panel" : action.label;
}
