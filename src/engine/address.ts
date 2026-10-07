import { navigationOf } from "./reload";

/**
 * The window's address bar and tab follow the page in the frame, so a reload
 * lands where the frame was, and get the window's own back as the frame goes.
 * What it needs of the frame comes in a `Followed`.
 */

/** What the address follows. */
export interface Followed {
  /** The page in the frame, or null once it is on another origin, or an error page. */
  page(): Document | null;
  /** Where the frame is now. */
  locate(): string;
  /** Show the address the window has now on the drawn browser. */
  refresh(): void;
}

let followed: Followed | null = null;
/** The window's own address when the frame came up, and its title once the frame's took over. */
let pageUrl = "";
let pageTitle: string | null = null;
/** The address last put in the window for the frame. Another one there means the window moved. */
let written = "";
/** Follows the frame's title, which a router sets after the url changes. */
let titleObserver: MutationObserver | null = null;

/** Follow the frame that just came up over the window's own page. */
export function follow(frame: Followed): void {
  followed = frame;
  pageUrl = window.location.href;
  written = pageUrl;
  pageTitle = null;
}

/** Swap the window's url without a router in the page underneath hearing of it. */
function replaceUrl(href: string): void {
  if (href !== window.location.href) {
    History.prototype.replaceState.call(window.history, window.history.state, "", href);
  }
}

/** Put where the frame is in the window's address bar and tab, so a reload lands there. */
export function mirror(): void {
  const doc = followed?.page();
  if (!followed || !doc) return;
  replaceUrl(followed.locate());
  written = window.location.href;
  followed.refresh();
  if (doc.title === document.title) return;
  pageTitle ??= document.title;
  document.title = doc.title;
}

/**
 * Mirror the frame's same-document navigations too. The navigation api's
 * `currententrychange` comes after every url change, `pushState` included,
 * where `navigate` comes before and skips it. Without it, wrap the frame's
 * history. Both go with the frame's window on its next load.
 */
export function watch(view: Window, doc: Document): void {
  const navigation = navigationOf(view);
  if (navigation) {
    navigation.addEventListener("currententrychange", mirror);
  } else {
    const history = view.history;
    const push = history.pushState;
    const replace = history.replaceState;
    history.pushState = (...args: Parameters<History["pushState"]>) => {
      push.apply(history, args);
      mirror();
    };
    history.replaceState = (...args: Parameters<History["replaceState"]>) => {
      replace.apply(history, args);
      mirror();
    };
    view.addEventListener("popstate", mirror);
    view.addEventListener("hashchange", mirror);
  }
  titleObserver ??= new MutationObserver(mirror);
  titleObserver.disconnect();
  titleObserver.observe(doc.head ?? doc.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
  });
}

/** Did the window go back to another entry since the frame's address was put there? */
export function moved(): boolean {
  return window.location.href !== written;
}

/** Stop following the frame's title. */
export function unwatch(): void {
  titleObserver?.disconnect();
}

/** The window shows its own page again, so its own address, unless it moved, and title too. */
export function giveBack(stayed: boolean): void {
  if (stayed) replaceUrl(pageUrl);
  if (pageTitle !== null) document.title = pageTitle;
  pageTitle = null;
}
