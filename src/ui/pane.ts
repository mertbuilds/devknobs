/**
 * The side pane: one surface docked beside the panel, on the page's side of
 * it, that a feature shows a view in. One view shows at a time. To use it:
 *
 *   openPane({ id: "styles", title: "styles", mount, actions, escape });
 *   closePane(); paneView(); onPane((id) => {});
 *
 * `mount(body)` fills the pane's scrolling body, which comes empty, and may
 * return a cleanup that runs once when the view closes or another replaces it.
 * `actions` are icon buttons in the head, before the x. Nothing of the pane
 * is kept in web storage: a reload starts with it closed.
 */

import type { EdgeValue } from "../types";
import { button, el } from "./dom";
import { icon, type IconName } from "./icons";
import { between, GLIDE_MAX, PANEL_GAP, type Place } from "./place";
import type { Tips } from "./tooltip";

/** A small icon button in the pane's head, such as copy or clear. */
export interface PaneAction {
  /** What it does, in a word or two: its tooltip, and its name for assistive tech. */
  label: string;
  icon: IconName;
  run(): void;
}

/** What a feature shows in the pane. */
export interface PaneView {
  /** Names the view. Opening the one that is open does nothing. */
  id: string;
  /** What the head says, in lower case as the panel's labels are. */
  title: string;
  /**
   * Fill the pane's body, which scrolls on its own under the head. What it
   * returns runs once, when the view closes or another takes its place.
   */
  mount(body: HTMLElement): void | (() => void);
  /** The buttons the head shows before the x, in this order. */
  actions?: PaneAction[];
  /**
   * Escape came with the focus in the pane. Return true where the view took
   * it, to clear a filter of its own, say, and the pane stays open.
   */
  escape?(): boolean;
}

/** Hears the id of the view that opened, or null when the pane closed. */
export type PaneListener = (view: string | null) => void;

/** How wide the pane is where the window has the room, and at the least, in px. */
export const PANE_WIDTH = 340;
export const PANE_MIN = 240;

/** How tall the pane is where the window has the room, the panel's own tallest, in px. */
export const PANE_HEIGHT = 672;

/** The panel's width, and how far the handle stands out of what it sits on, in px. */
const PANEL_WIDTH = 240;
const HANDLE_REACH = 21;

/** The pixel the pane sits over the panel's border, as the handle sits over the pane's. */
const SEAM = 1;

/** How long past the longest glide a pane on its way out lands without its end, in ms. */
const PANE_LATE = 200;

/** Where the pane goes, in window px. */
export interface PaneBox {
  width: number;
  height: number;
  top: number;
  /** How far it sits over the panel, where the window has no room beside it. */
  over: number;
  /** How far past the panel it reaches, which is how far the handle rides out. */
  reach: number;
  /** The corner of the pane the handle covers, if any. */
  tab: EdgeValue;
}

/**
 * Lay the pane out beside a panel whose top is at `at.top` and whose handle
 * is at `at.y`, in a window of `view`, with a handle `handle` tall.
 *
 * It is as tall as the panel at its tallest whatever the panel holds, so it
 * stays still while rows open and close, and it starts at the panel's top
 * unless the window's bottom pushes it up. That always spans the panel, so
 * the two meet along the panel's whole side.
 *
 * Across, it is `PANE_WIDTH` where that leaves the page a gap, and narrower
 * down to `PANE_MIN` where it does not. In a window with no room for that
 * beside the panel it sits over the panel by what is missing, and in one
 * narrower than itself it takes what the handle leaves. The panel never moves
 * for it, and nothing of it leaves the window.
 */
export function paneBox(
  at: Pick<Place, "y" | "top">,
  view: { width: number; height: number },
  handle: number,
): PaneBox {
  const height = Math.max(0, Math.min(PANE_HEIGHT, view.height - 2 * PANEL_GAP));
  const top = between(at.top, PANEL_GAP, view.height - PANEL_GAP - height);
  const room = view.width - PANEL_WIDTH - HANDLE_REACH + SEAM;
  const width = Math.min(
    between(room - PANEL_GAP, PANE_MIN, PANE_WIDTH),
    Math.max(0, view.width - HANDLE_REACH),
  );
  const over = Math.max(0, width - room);
  const flush = (a: number, b: number) => Math.abs(a - b) < 0.5;
  const tab = flush(at.y, top) ? "top" : flush(at.y + handle, top + height) ? "bottom" : "none";
  return { width, height, top, over, reach: Math.max(0, width - SEAM - over), tab };
}

/** What the pane needs from the panel. */
export interface PaneContext {
  wrap: HTMLElement;
  /** The panel's shadow root, which knows where the focus is in it. */
  root: Pick<ShadowRoot, "activeElement">;
  handle: HTMLElement;
  /** Where the focus goes back to when what opened the pane is gone. */
  home: HTMLElement;
  tips: Tips;
  /** Open the panel, as the pane shows only beside an open one. */
  openPanel(): void;
  /** Say how much more of the window's edge the panel covers with the pane, in px. */
  cover(px: number): void;
}

/** The pane as the panel drives it. */
export interface Pane {
  /** The pane's node, which goes in the wrapper between the handle and the panel. */
  node: HTMLElement;
  open(view: PaneView): void;
  close(): void;
  /** The id of the open view, also while the pane hides with a closed panel. */
  view(): string | null;
  /** The panel is open or closed: a closed one hides the pane and keeps its view. */
  render(open: boolean): void;
  /** The panel was put at a place: the pane goes beside it. */
  place(at: Pick<Place, "y" | "top">): void;
  /** Escape came. Says whether the pane took it, which it does with the focus in it. */
  escape(): boolean;
  /** Close the view and stop listening. */
  destroy(): void;
}

const listeners = new Set<PaneListener>();

/** The pane of the panel on this page, once there is one. */
let shell: Pane | null = null;

function emit(view: string | null): void {
  for (const listener of [...listeners]) listener(view);
}

/**
 * Show a view in the pane, in place of the one that is open, and move the
 * focus into it. It opens the panel where that is closed. Nothing happens for
 * the view that is open already, or on a page with no panel.
 */
export function openPane(view: PaneView): void {
  shell?.open(view);
}

/** Close the pane, and put the focus back where it was when it opened. */
export function closePane(): void {
  shell?.close();
}

/** The id of the open view, or null with the pane closed. */
export function paneView(): string | null {
  return shell?.view() ?? null;
}

/**
 * Hear the pane open and close: the id of the view that opened, a new one in
 * place of another included, or null once it closed. A pane that hides with
 * the panel stays open. Returns the way to stop.
 */
export function onPane(listener: PaneListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** What has the focus, inside a shadow root too. */
function focused(): Element | null {
  let at = document.activeElement;
  while (at?.shadowRoot?.activeElement) at = at.shadowRoot.activeElement;
  return at;
}

/** Whether a node is on the page and takes room there, so it can take the focus. */
function showing(node: HTMLElement): boolean {
  return node.isConnected && node.getClientRects().length > 0;
}

function isZero(duration: string): boolean {
  return parseFloat(duration) === 0;
}

/**
 * Build the pane for a panel. The stylesheet holds how it looks and moves:
 * `data-pane` on the wrapper says `open` while it is out and `leaving` until
 * it has slid away, and the `--pane-*` properties say where it goes.
 */
export function createPane(context: PaneContext): Pane {
  const { wrap, root, handle, tips } = context;

  // Clips the pane at the panel's edge, so it slides out of the edge itself.
  const node = el("div", "side-clip");
  const box = el("div", "side");
  box.tabIndex = -1;
  box.setAttribute("role", "region");
  const head = el("div", "side-head");
  const title = el("span", "side-title");
  const actions = el("div", "side-actions");
  const closer = button("side-action", "");
  closer.append(icon("x"));
  closer.setAttribute("aria-label", "close");
  tips.tooltip(closer, "close");
  closer.addEventListener("click", close);
  head.append(title, actions, closer);
  const body = el("div", "side-body");
  box.append(head, body);
  node.append(box);
  node.inert = true;

  let shown: PaneView | null = null;
  let cleanup: (() => void) | null = null;
  let panelOpen = false;
  /** What had the focus when the pane opened. */
  let opener: Element | null = null;
  let laid: PaneBox | null = null;
  /** The handle's height, which the stylesheet sets once and for all, read once it is on the page. */
  let handleHeight = 0;
  /** Runs while the pane slides away. */
  let timer = 0;

  function holdsFocus(): boolean {
    const at = root.activeElement;
    return at !== null && box.contains(at);
  }

  /** The pane is out of sight: the panel has its corners back, and a closed view is gone. */
  function land(): void {
    clearTimeout(timer);
    timer = 0;
    if (wrap.dataset.pane === "leaving") delete wrap.dataset.pane;
    if (!shown) body.replaceChildren();
  }

  /** Slide away, and land at once where nothing animates, as under reduced motion. */
  function leave(): void {
    wrap.dataset.pane = "leaving";
    clearTimeout(timer);
    timer = 0;
    if (getComputedStyle(box).transitionDuration.split(",").every(isZero)) land();
    else timer = window.setTimeout(land, GLIDE_MAX + PANE_LATE);
  }

  function onEnd(event: TransitionEvent): void {
    if (timer && event.target === box && event.propertyName === "transform") land();
  }

  box.addEventListener("transitionend", onEnd);

  /** Show the pane beside an open panel while it has a view, and hide it otherwise. */
  function draw(): void {
    const out = shown !== null && panelOpen;
    node.inert = !out;
    if (out) {
      clearTimeout(timer);
      timer = 0;
      wrap.dataset.pane = "open";
    } else if (wrap.dataset.pane === "open") leave();
    // The device frame counts the pane while the panel is closed too, so one
    // that comes back with the panel moves the frame once.
    context.cover(shown && laid ? laid.reach : 0);
  }

  function actionButton(action: PaneAction): HTMLButtonElement {
    const control = button("side-action", "");
    control.append(icon(action.icon));
    control.setAttribute("aria-label", action.label);
    tips.tooltip(control, action.label);
    control.addEventListener("click", () => action.run());
    return control;
  }

  /** Run the open view's cleanup, once, and forget the view. */
  function unmount(): void {
    tips.hide();
    const done = cleanup;
    cleanup = null;
    shown = null;
    done?.();
  }

  function open(view: PaneView): void {
    if (shown?.id === view.id) return;
    // A view that takes another's place keeps what opened the first.
    if (shown) unmount();
    else opener = focused();
    body.replaceChildren();
    body.scrollTop = 0;
    shown = view;
    title.textContent = view.title;
    box.setAttribute("aria-label", view.title);
    actions.replaceChildren(...(view.actions ?? []).map(actionButton));
    const made = view.mount(body);
    cleanup = typeof made === "function" ? made : null;
    context.openPanel();
    draw();
    // The pane itself, so no control of the view shows a ring or a tooltip unasked.
    box.focus({ preventScroll: true });
    emit(view.id);
  }

  /**
   * Close the view. Its nodes stay while the pane slides away. The focus goes
   * back only from inside the pane, to what opened it, or to the panel where
   * that is gone.
   */
  function close(): void {
    if (!shown) return;
    const inside = holdsFocus();
    unmount();
    draw();
    if (!timer) land();
    if (inside) {
      const back = opener instanceof HTMLElement && showing(opener) ? opener : context.home;
      back.focus({ preventScroll: true });
    }
    opener = null;
    emit(null);
  }

  const pane: Pane = {
    node,
    open,
    close,
    view: () => shown?.id ?? null,
    render(isOpen: boolean): void {
      panelOpen = isOpen;
      draw();
    },
    place(at): void {
      const view = {
        width: document.documentElement.clientWidth || window.innerWidth,
        height: window.innerHeight,
      };
      if (handleHeight === 0) handleHeight = handle.getBoundingClientRect().height;
      laid = paneBox(at, view, handleHeight);
      // The wrapper's box starts at the handle's top, which is where the host is.
      wrap.style.setProperty("--pane-top", `${laid.top - at.y}px`);
      wrap.style.setProperty("--pane-right", `${PANEL_WIDTH - SEAM - laid.over}px`);
      wrap.style.setProperty("--pane-width", `${laid.width}px`);
      wrap.style.setProperty("--pane-height", `${laid.height}px`);
      wrap.style.setProperty("--pane-reach", `${laid.reach}px`);
      wrap.dataset.paneTab = laid.tab;
      if (shown) context.cover(laid.reach);
    },
    escape(): boolean {
      if (!shown || !holdsFocus()) return false;
      if (shown.escape?.() !== true) close();
      return true;
    },
    destroy(): void {
      clearTimeout(timer);
      timer = 0;
      box.removeEventListener("transitionend", onEnd);
      if (shown) {
        unmount();
        emit(null);
      }
      context.cover(0);
      if (shell === pane) shell = null;
    },
  };
  shell = pane;
  return pane;
}
