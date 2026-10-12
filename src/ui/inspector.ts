/**
 * Inspect, as the panel runs it. Picking is a mode, as in a browser's own
 * tools: it goes on from the select button in the view's head, from inspect's
 * key, or with the view opened on no element, and a pick or escape ends it,
 * with nothing left drawn on the page. The element picked stays in the styles
 * view, and is kept while the view is closed, so the view opens on it again.
 * Going back from the view or another view taking its place ends the picking.
 * The view only points at the page: an element is boxed there while the
 * pointer is on what stands for it, and never under the picking's own box.
 * The view and the engine under it load the first time they are asked for.
 */

import * as engine from "../engine";
import { needsFrame, readMessage } from "../engine/frame";
import { frameWindow } from "../engine/width";
import type { InspectControl } from "../grab/inspect";
import { label } from "../styles/tree";
import { onPane, openPane, paneView, retitlePane, showPane } from "./pane";
import type { LivePrefs } from "./prefs";
import type { createStylesView, StylesView } from "./stylesview";
import type { Tips } from "./tooltip";

/** The id of the styles view in the panel, and what its head says before a pick. */
export const STYLES_VIEW = "styles";

/** What the button that starts the picking is called. */
export const SELECT = "select an element";

/** Loads the styles view, the first time inspect turns on. */
export type LoadStyles = () => Promise<{ createStylesView: typeof createStylesView }>;

export interface Inspector {
  /**
   * What inspect's row does. It ends the picking where that is on. Else it
   * opens the view on the element it holds, and with none it starts picking.
   */
  open(): void;
  /** The name of the element the view holds, as devtools names one, or null with none. */
  picked(): string | null;
  /**
   * End the picking and let go of the element, as inspect's row's `×` and
   * reset all do: a row that says an element is listed, and this is its way off.
   */
  forget(): void;
  /** Hear the element the view holds change. Returns the way to stop. */
  subscribe(listener: () => void): () => void;
  destroy(): void;
}

/** What the inspector asks of the panel's view, so a test can stand in for it. */
export interface PaneDoor {
  openPane: typeof openPane;
  paneView: typeof paneView;
  onPane: typeof onPane;
  retitlePane: typeof retitlePane;
  showPane: typeof showPane;
}

const PANE: PaneDoor = { openPane, paneView, onPane, retitlePane, showPane };

/** Whether an element is still on a page that shows. */
function here(element: Element): boolean {
  return element.isConnected && element.ownerDocument.defaultView !== null;
}

export function createInspector(
  context: {
    inspect: InspectControl;
    tips: Tips;
    /** Where the view's mode is kept. Without it the view is the advanced one. */
    prefs?: Pick<LivePrefs, "get" | "setStylesMode" | "setStylesBox">;
    /** Inspect's key as it is now, for the select button to say. */
    key?: () => string;
  },
  load: LoadStyles = () => import("./stylesview"),
  pane: PaneDoor = PANE,
): Inspector {
  const { inspect, tips, prefs } = context;
  const listeners = new Set<() => void>();
  let view: StylesView | null = null;
  /** The element the view holds, kept while the view is closed. */
  let held: Element | null = null;
  /** Whether the picking that is on, or the last one, picked an element. */
  let took = false;
  /** Bumped by each ask for the view and each one taken back, so a view that loads late knows it is stale. */
  let asked = 0;
  let framed = needsFrame(engine.getState());

  function hold(element: Element | null): void {
    if (element === held) return;
    held = element;
    for (const listener of Array.from(listeners)) listener();
  }

  /** The element held, where its page still shows it. */
  function current(): Element | null {
    return held && here(held) ? held : null;
  }

  /** Box an element the view points at, or with null take the box off. The picking's own box is left alone. */
  function point(element: Element | null): void {
    if (element && inspect.isOn()) return;
    inspect.outline(element);
  }

  function toggle(): void {
    inspect.set(!inspect.isOn());
    // The press left the focus on the button, where the arrows and Enter are its own.
    if (inspect.isOn()) view?.focus();
  }

  function open(make: typeof createStylesView): void {
    if (pane.paneView() === STYLES_VIEW) {
      // Open already, and out of sight where the panel closed over it.
      pane.showPane(STYLES_VIEW);
      return;
    }
    pane.openPane({
      id: STYLES_VIEW,
      title: STYLES_VIEW,
      layout: "flush",
      actions: [
        {
          label: SELECT,
          icon: "square-dashed-mouse-pointer",
          run: toggle,
          hint: context.key,
          pressed: () => inspect.isOn(),
          watch: (listener) => inspect.subscribe(() => listener()),
        },
      ],
      mount(body) {
        const made = make({
          tips,
          title: (text) => pane.retitlePane(STYLES_VIEW, text),
          outline: point,
          held: hold,
          area: inspect.area,
          ...(prefs && {
            mode: { get: () => prefs.get().stylesMode, set: prefs.setStylesMode },
            box: { get: () => prefs.get().stylesBox, set: prefs.setStylesBox },
          }),
        });
        view = made;
        body.append(made.node);
        const element = current();
        if (element) made.show(element);
        else hold(null);
        return () => {
          made.destroy();
          if (view === made) view = null;
        };
      },
      // Escape ends the picking first, then the filter's text goes, and the
      // view with the next. The mode takes its own escape before the panel
      // hears it, and this holds the order where it does not.
      escape: () => {
        if (!inspect.isOn()) return view?.escape() ?? false;
        inspect.set(false);
        return true;
      },
      // The head says the element's name, and stands for it.
      point: (over) => point(over ? current() : null),
    });
    if (!inspect.isOn()) return;
    // The head's way back took the focus, and on a button the arrows and Enter
    // are the button's. The view takes it, so they stay the picking's, and
    // with the frame up the frame does, where the picking is.
    view?.focus();
    frameWindow()?.focus();
  }

  /** Open the view once it has loaded, unless what asked for it was taken back by then. */
  function reveal(): void {
    const at = ++asked;
    void load().then(({ createStylesView: make }) => {
      if (at === asked) open(make);
    });
  }

  const stopMode = inspect.subscribe((on) => {
    if (on) {
      took = false;
      // The picking draws its own box, and nothing else is boxed under it.
      inspect.outline(null);
      reveal();
    } else if (!view && !took) {
      // It went off with no pick while the view loaded, and there is nothing to open it for.
      asked++;
    }
  });

  const stopPicks = inspect.onPick((element) => {
    took = true;
    if (view) view.show(element);
    else hold(element);
  });

  /** The view went back to the rows, or another took its place: the picking ends, the element is kept. */
  const stopPane = pane.onPane((id) => {
    if (id === STYLES_VIEW) return;
    asked++;
    inspect.set(false);
    inspect.outline(null);
  });

  /** The frame came up or went down, and the page the element was on is not the one shown. */
  const stopKnobs = engine.subscribe((state) => {
    const now = needsFrame(state);
    if (now === framed) return;
    framed = now;
    if (view) view.show(null);
    else hold(null);
  });

  /** The frame loaded another page, and the element went with the old one. */
  function onMessage(event: MessageEvent): void {
    const message = readMessage(event, frameWindow(), window.location.origin);
    if (message?.type === "ready") view?.refresh();
  }

  window.addEventListener("message", onMessage);

  return {
    open(): void {
      if (inspect.isOn()) inspect.set(false);
      else if (current()) reveal();
      else inspect.set(true);
    },
    picked(): string | null {
      const element = current();
      return element ? label(element) : null;
    },
    forget(): void {
      inspect.set(false);
      if (view) view.show(null);
      else hold(null);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    destroy(): void {
      stopMode();
      stopPicks();
      stopPane();
      stopKnobs();
      window.removeEventListener("message", onMessage);
      listeners.clear();
    },
  };
}
