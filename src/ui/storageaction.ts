import * as engine from "../engine";
import { closePane, onPane, openPane, type PaneView, paneView } from "./pane";

/**
 * The storage view as the panel's action drives it: shown and left, and
 * heard as it comes and goes. The view and the readers under it load on
 * first use, so a page that never opens it never pays for them.
 */

/** The id the storage view has among the panel's views: its list of stores. A store's page has it and the store. */
export const STORAGE_VIEW = "storage";

/** Whether a view is the storage view's, the list of stores or the page of one. */
export function isStorageView(id: string | null): boolean {
  return id === STORAGE_VIEW || (id?.startsWith(`${STORAGE_VIEW}:`) ?? false);
}

export interface StorageControl {
  /** Show the view, or leave it where it shows. */
  toggle(): void;
  /** Whether the view is the one that is open, on either of its levels. */
  isOn(): boolean;
  /** Leave the view where it shows. */
  close(): void;
  /** Hear the view come and go. Returns the way to stop. */
  subscribe(listener: () => void): () => void;
  destroy(): void;
}

/** Brings the view: what the panel shows, built for this page. */
export type LoadStorageView = () => Promise<PaneView>;

function load(): Promise<PaneView> {
  return import("./storageview").then((loaded) =>
    loaded.storageView({
      // A view the panel hides reads nothing: only one in sight is kept live.
      visible: () => engine.getState().panel.open && !document.hidden,
    }),
  );
}

export function createStorageControl(loadView: LoadStorageView = load): StorageControl {
  /** Counts the asks, so a view that loads after it was left, or asked for twice, never opens. */
  let asked = 0;
  const isOn = (): boolean => isStorageView(paneView());
  const close = (): void => {
    asked++;
    if (isOn()) closePane();
  };
  return {
    toggle(): void {
      if (isOn()) {
        close();
        return;
      }
      const mine = ++asked;
      void loadView().then(
        (view) => {
          if (mine === asked) openPane(view);
        },
        () => {
          // The chunk did not load: nothing opens, and the next press asks again.
        },
      );
    },
    isOn,
    close,
    subscribe: (listener) => onPane(() => listener()),
    destroy(): void {
      close();
    },
  };
}
