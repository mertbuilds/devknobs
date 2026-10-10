/**
 * Inspect, as the panel runs it: the mode going on opens the styles view in
 * the side pane, each pick shows there, and the pane closing or another view
 * taking its place ends the mode and takes the box off the element. The view
 * and the engine under it load the first time inspect turns on.
 */

import * as engine from "../engine";
import { needsFrame, readMessage } from "../engine/frame";
import { frameWindow } from "../engine/width";
import type { InspectControl } from "../grab/inspect";
import { onPane, openPane, paneView, retitlePane } from "./pane";
import type { createStylesView, StylesView } from "./stylesview";
import type { Tips } from "./tooltip";

/** The id of the styles view in the pane, and what its head says before a pick. */
export const STYLES_VIEW = "styles";

/** Loads the styles view, the first time inspect turns on. */
export type LoadStyles = () => Promise<{ createStylesView: typeof createStylesView }>;

export interface Inspector {
  destroy(): void;
}

/** What the inspector asks of the side pane, so a test can stand in for it. */
export interface PaneDoor {
  openPane: typeof openPane;
  paneView: typeof paneView;
  onPane: typeof onPane;
  retitlePane: typeof retitlePane;
}

const PANE: PaneDoor = { openPane, paneView, onPane, retitlePane };

export function createInspector(
  context: { inspect: InspectControl; tips: Tips },
  load: LoadStyles = () => import("./stylesview"),
  pane: PaneDoor = PANE,
): Inspector {
  const { inspect, tips } = context;
  let view: StylesView | null = null;
  /** An element picked before the view was there to show it. */
  let pending: Element | null = null;
  let framed = needsFrame(engine.getState());

  function open(make: typeof createStylesView): void {
    if (!inspect.isOn() || pane.paneView() === STYLES_VIEW) return;
    pane.openPane({
      id: STYLES_VIEW,
      title: STYLES_VIEW,
      mount(body) {
        const made = make({
          tips,
          title: (text) => pane.retitlePane(STYLES_VIEW, text),
          outline: inspect.outline,
        });
        view = made;
        body.append(made.node);
        if (pending) made.show(pending);
        pending = null;
        return () => {
          made.destroy();
          if (view === made) view = null;
        };
      },
      // The filter's text goes first, and the pane with the next.
      escape: () => view?.escape() ?? false,
    });
    // The pane took the focus. With the frame up the picking is the frame's, and its keys with it.
    frameWindow()?.focus();
  }

  const stopMode = inspect.subscribe((on) => {
    if (on) void load().then(({ createStylesView: make }) => open(make));
  });

  const stopPicks = inspect.onPick((element) => {
    if (view) view.show(element);
    else pending = element;
  });

  /** The pane closed, or shows something else: nothing is inspected any more. */
  const stopPane = pane.onPane((id) => {
    if (id === STYLES_VIEW) return;
    pending = null;
    inspect.set(false);
    inspect.outline(null);
  });

  /** The frame came up or went down, and the page the element was on is not the one shown. */
  const stopKnobs = engine.subscribe((state) => {
    const now = needsFrame(state);
    if (now === framed) return;
    framed = now;
    view?.show(null);
  });

  /** The frame loaded another page, and the element went with the old one. */
  function onMessage(event: MessageEvent): void {
    const message = readMessage(event, frameWindow(), window.location.origin);
    if (message?.type === "ready") view?.refresh();
  }

  window.addEventListener("message", onMessage);

  return {
    destroy(): void {
      stopMode();
      stopPicks();
      stopPane();
      stopKnobs();
      window.removeEventListener("message", onMessage);
    },
  };
}
