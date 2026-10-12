/**
 * A feature's view inside the panel. It takes the place of the rows, as the
 * settings do, under a head with the way back, its title and its actions, and
 * the panel is wider and as tall as it gets while it shows. One view shows at
 * a time. To use it:
 *
 *   openPane({ id: "styles", title: "styles", mount, actions, escape, back });
 *   closePane(); paneView(); showPane(id); retitlePane(id, title); onPane((id) => {});
 *
 * `mount(body)` fills the view's scrolling body, which comes empty, and may
 * return a cleanup that runs once when the view closes or another replaces it.
 */

import { button, el, rowBox, rowButton } from "./dom";
import { icon, type IconName } from "./icons";
import type { Tips } from "./tooltip";

/** A small icon button in the view's head, such as copy or clear. */
export interface PaneAction {
  /** What it does, in a word or two: its tooltip, and its name for assistive tech. */
  label: string;
  icon: IconName;
  run(): void;
  /** What its tooltip says after the label, such as the key that runs it, read as the tooltip shows. */
  hint?(): string;
  /** Whether a toggle is on. An action that is no toggle has none. */
  pressed?(): boolean;
  /** Hear a toggle go on or off, however it did. Returns the way to stop. */
  watch?(listener: () => void): () => void;
}

/** What a feature shows in the panel. */
export interface PaneView {
  /** Names the view. Opening the one that is open does nothing. */
  id: string;
  /** What the head says, in lower case as the panel's labels are. */
  title: string;
  /**
   * Fill the view's body, which scrolls on its own under the head. What it
   * returns runs once, when the view closes or another takes its place.
   */
  mount(body: HTMLElement): void | (() => void);
  /** The buttons the head shows after the title, in this order. */
  actions?: PaneAction[];
  /**
   * Escape came while the view shows. Return true where the view took it, to
   * clear a filter of its own, say, and the view stays open.
   */
  escape?(): boolean;
  /**
   * Where the way back goes, in place of the rows: a view one step inside
   * another gives this, and opens that other from it. The head's way back and
   * Escape both go there.
   */
  back?(): void;
  /**
   * The pointer came onto the head's line, or left it. A view that shows
   * something of the page points at it there for as long.
   */
  point?(over: boolean): void;
}

/** Hears the id of the view that opened, or null when the view closed. */
export type PaneListener = (view: string | null) => void;

/** How wide the panel is while a view shows, until the user drags its edge, in px. */
export const PANE_WIDTH = 340;

/** What the view needs from the panel. */
export interface PaneContext {
  /** The panel's shadow root, which knows where the focus is in it. */
  root: Pick<ShadowRoot, "activeElement">;
  /** Where the focus goes back to when what opened the view is gone. */
  home: HTMLElement;
  tips: Tips;
  /** Open the panel, as a view shows only in an open one. */
  openPanel(): void;
  /** Leave the search and the settings, which show in a view's place, without drawing anything. */
  uncover(): void;
  /** Draw the whole panel again. */
  render(): void;
}

/** The view as the panel drives it. */
export interface Pane {
  /** The view's node, which goes in the panel's body with the rows and the settings. */
  node: HTMLElement;
  open(view: PaneView): void;
  /** Go back to the rows, and put the focus back where it was. */
  close(): void;
  /** Close the view for what the panel shows next, which draws itself and takes the focus. */
  drop(): void;
  retitle(id: string, title: string): void;
  /** Bring the open view `id` back in sight, from a closed panel, the search or the settings. */
  show(id: string): void;
  /** The id of the open view, also while a closed panel or the settings hide it. */
  view(): string | null;
  /** Give the focus to the view's head, and say whether there is a view to take it. */
  focus(): boolean;
  /** Escape came for the view: the view takes it, or the panel goes one step back. */
  escape(): void;
  /** The panel's slide landed: a view that closed is out of sight, and its nodes go. */
  landed(): void;
  /** Close the view and forget the panel. */
  destroy(): void;
}

const listeners = new Set<PaneListener>();

/** The view's place in the panel on this page, once there is one. */
let shell: Pane | null = null;

function emit(view: string | null): void {
  for (const listener of [...listeners]) listener(view);
}

/**
 * Show a view in the panel, in place of the one that is open, and move the
 * focus to its head. It opens the panel where that is closed, and leaves the
 * search and the settings. Nothing happens for the view that is open already,
 * or on a page with no panel.
 */
export function openPane(view: PaneView): void {
  shell?.open(view);
}

/** Go back to the rows, and put the focus back where it was when the view opened. */
export function closePane(): void {
  shell?.close();
}

/** The id of the open view, or null with none. */
export function paneView(): string | null {
  return shell?.view() ?? null;
}

/**
 * Bring the open view `id` back in sight: open the panel where it is closed,
 * and leave the search and the settings. Nothing happens for any other view.
 */
export function showPane(id: string): void {
  shell?.show(id);
}

/** Change what the head says for the open view `id`. Nothing happens for any other. */
export function retitlePane(id: string, title: string): void {
  shell?.retitle(id, title);
}

/**
 * Hear a view open and close: the id of the view that opened, a new one in
 * place of another included, or null once it closed. A view that hides with
 * the panel, or under the settings, stays open. Returns the way to stop.
 */
export function onPane(listener: PaneListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The head of a view as built. */
export interface ViewHead {
  box: HTMLElement;
  /** The way back: the row's main, with the chevron and the title in it. */
  back: HTMLButtonElement;
  /** The node that holds the title. */
  title: HTMLElement;
  /** Where the view's actions go, after the main as a row's x is. */
  actions: HTMLElement;
}

/**
 * The head of a view, and of the settings: a row, built as every row is. Its
 * leading slot stays empty, as a row's with no grip does, so the way back's
 * chevron stands where a row's icon is and the title where a row's name is,
 * and the actions where a row's x is.
 */
export function viewHead(): ViewHead {
  const back = button("main", "");
  const actions = el("div", "view-actions");
  const { box, label } = rowBox({
    main: back,
    glyph: icon("chevron-left"),
    title: "",
    after: [actions],
  });
  box.className = `${box.className} view-head`;
  return { box, back, title: label, actions };
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

/**
 * Build the view's place in a panel: a pane of the panel's body, which the
 * panel slides in over the rows while there is a view, as it does the
 * settings. The stylesheet holds how it looks.
 */
export function createPane(context: PaneContext): Pane {
  const { root, tips } = context;

  const node = el("div", "view pane");
  node.setAttribute("role", "group");
  const { box: head, back, title, actions } = viewHead();
  back.addEventListener("click", leave);
  back.addEventListener("pointerenter", () => shown?.point?.(true));
  back.addEventListener("pointerleave", () => shown?.point?.(false));
  const body = el("div", "view-body");
  node.append(head, body);

  let shown: PaneView | null = null;
  let cleanup: (() => void) | null = null;
  /** The ways to stop hearing the open view's toggles. */
  let watches: (() => void)[] = [];
  /** What had the focus when the view opened. */
  let opener: Element | null = null;

  function holdsFocus(): boolean {
    const at = root.activeElement;
    return at !== null && node.contains(at);
  }

  function name(text: string): void {
    title.textContent = text;
    node.setAttribute("aria-label", text);
    back.setAttribute("aria-label", `back from ${text}`);
  }

  function actionButton(action: PaneAction): HTMLButtonElement {
    const control = rowButton("view-action", icon(action.icon), action.label);
    const { hint, pressed } = action;
    const told = hint ? () => [action.label, hint()].filter(Boolean).join(" · ") : action.label;
    tips.tooltip(control, told);
    control.addEventListener("click", () => action.run());
    if (pressed) {
      const mark = (): void => control.setAttribute("aria-pressed", pressed() ? "true" : "false");
      mark();
      if (action.watch) watches.push(action.watch(mark));
    }
    return control;
  }

  /** Run the open view's cleanup, once, and forget the view. */
  function unmount(): void {
    tips.hide();
    const done = cleanup;
    cleanup = null;
    shown = null;
    for (const stop of watches.splice(0)) stop();
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
    name(view.title);
    actions.replaceChildren(...(view.actions ?? []).map(actionButton));
    const made = view.mount(body);
    cleanup = typeof made === "function" ? made : null;
    context.uncover();
    context.openPanel();
    context.render();
    back.focus({ preventScroll: true });
    emit(view.id);
  }

  /**
   * Go back to the rows. The view's nodes stay while it slides away. The
   * focus goes back only from inside the view, to what opened it, or to the
   * panel where that is gone.
   */
  function close(): void {
    if (!shown) return;
    const inside = holdsFocus();
    unmount();
    context.render();
    // Under the settings or in a closed panel nothing slides, and it is gone at once.
    if (!node.classList.contains("leaving")) body.replaceChildren();
    if (inside) {
      const to = opener instanceof HTMLElement && showing(opener) ? opener : context.home;
      to.focus({ preventScroll: true });
    }
    opener = null;
    emit(null);
  }

  /** One step back: to where the view says, or to the rows. */
  function leave(): void {
    if (shown?.back) shown.back();
    else close();
  }

  const pane: Pane = {
    node,
    open,
    close,
    drop(): void {
      if (!shown) return;
      unmount();
      opener = null;
      emit(null);
    },
    retitle(id: string, text: string): void {
      if (shown?.id === id) name(text);
    },
    show(id: string): void {
      if (shown?.id !== id) return;
      context.uncover();
      context.openPanel();
      context.render();
    },
    view: () => shown?.id ?? null,
    focus(): boolean {
      if (shown) back.focus({ preventScroll: true });
      return shown !== null;
    },
    escape(): void {
      if (shown && shown.escape?.() !== true) leave();
    },
    landed(): void {
      if (!shown) body.replaceChildren();
    },
    destroy(): void {
      if (shown) {
        unmount();
        emit(null);
      }
      if (shell === pane) shell = null;
    },
  };
  shell = pane;
  return pane;
}
