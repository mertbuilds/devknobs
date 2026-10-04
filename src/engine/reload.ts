import type { DevknobsState } from "../types";
import { type Identity, identityOf, patchedAs, patchWindow, stale } from "./identity";

/** How long a frame's next page gets to take over once the last one hid, in ms. */
const COMMIT_WAIT = 1000;

/**
 * How long a page the frame's page left for holds off a reload, in ms. One
 * that never comes, such as a download or a 204, lets it go after that.
 */
const LEAVE_WAIT = 30000;

/** What the reloads need of the width knob's frame. */
export interface Frame {
  /** The window inside the frame, while there is one. */
  view(): Window | null;
  /** The page in the frame, or null once it is on another origin, or an error page. */
  page(): Document | null;
  /** The frame's page has loaded, so what it reports can be trusted. */
  loaded(): boolean;
}

let frame: Frame | null = null;
let latest: DevknobsState | null = null;
/** What the frame's page loaded as, or null while a new one is on the way. */
let identity: Identity | null = null;
/** The reload a new identity asked for, once the knobs settle. */
let reloading = 0;
/** When the frame's page set off for another document, which a reload would cancel, or 0. */
let leaving = 0;
/** The frame's page loaded unpatched, and was reloaded once to patch it. */
let repatched = false;

/** Follow the pages of `next`, the frame that just came up. */
export function track(next: Frame): void {
  frame = next;
}

/** The frame goes: stop listening to its page, and forget what it loaded as. */
export function untrack(): void {
  const view = frame?.view();
  if (view) unlisten(view);
  clearTimeout(reloading);
  reloading = 0;
  leaving = 0;
  repatched = false;
  identity = null;
  frame = null;
}

/**
 * The frame's window has a new page, which has run nothing yet: patch what it
 * reads at load, and watch for the one after.
 */
export function arrive(view: Window): void {
  if (!latest) return;
  identity = patchWindow(view, latest);
  repatched = false;
  listen(view);
}

/** The frame's page on this origin loaded: a page the watch missed is listened to now. */
export function land(view: Window): void {
  listen(view);
  if (latest && !identity) identity = unpatched(view, latest);
}

function isTarget(value: unknown): value is EventTarget {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof Reflect.get(value, "addEventListener") === "function"
  );
}

/** The frame's navigation api, where the browser has one. */
export function navigationOf(view: Window): EventTarget | null {
  const navigation: unknown = Reflect.get(view, "navigation");
  return isTarget(navigation) ? navigation : null;
}

/**
 * Hear the frame's page leave: for another document, which a reload would
 * cancel, and as it hides for the next one. Each page has its own window, so
 * each gets these again.
 */
function listen(view: Window): void {
  view.addEventListener("pagehide", onHide);
  const navigation = navigationOf(view);
  if (navigation) {
    navigation.addEventListener("navigate", onNavigate);
    navigation.addEventListener("navigatesuccess", settle);
    navigation.addEventListener("navigateerror", settle);
  } else view.addEventListener("beforeunload", onLeave);
}

function unlisten(view: Window): void {
  try {
    view.removeEventListener("pagehide", onHide);
    view.removeEventListener("beforeunload", onLeave);
    const navigation = navigationOf(view);
    navigation?.removeEventListener("navigate", onNavigate);
    navigation?.removeEventListener("navigatesuccess", settle);
    navigation?.removeEventListener("navigateerror", settle);
  } catch {
    // Another origin, which was never listened to.
  }
}

/**
 * The frame's page sets off for another document. A page in its own document
 * or a download stays.
 */
function onNavigate(event: Event): void {
  const destination: unknown = Reflect.get(event, "destination");
  const same =
    typeof destination === "object" &&
    destination !== null &&
    Reflect.get(destination, "sameDocument") === true;
  // A `download` link's request is its file name, empty where it has none.
  if (same || typeof Reflect.get(event, "downloadRequest") === "string") return;
  onLeave();
}

/** Without the navigation api, `beforeunload` says the page is on its way out. */
function onLeave(): void {
  leaving = performance.now();
}

/**
 * The frame's page is no longer on its way out: it took the navigation over
 * in its own document, cancelled it, or the next page is in. A reload held
 * off for it goes now, if it is still due.
 */
export function settle(): void {
  leaving = 0;
  clearTimeout(reloading);
  reloading = 0;
  follow();
}

/**
 * The frame's page hid because the next one is taking its place, which runs
 * its first script a task or more later. Look every task until it is there.
 * The window is the same, its page is not.
 */
function onHide(event: Event): void {
  const view = frame?.view() ?? null;
  const gone = frame?.page() ?? null;
  // The whole tab going into the back/forward cache, with the frame as it is.
  if (!view || !gone || (event as PageTransitionEvent).persisted) return;
  identity = null;
  settle();
  const until = performance.now() + COMMIT_WAIT;
  const channel = new MessageChannel();
  channel.port1.onmessage = () => {
    let doc: Document | null = null;
    try {
      doc = frame?.view() === view ? view.document : null;
    } catch {
      // Another origin: nothing there to patch.
    }
    if (doc && doc !== gone) arrive(view);
    else if (doc && performance.now() < until) {
      channel.port2.postMessage(null);
      return;
    }
    channel.port1.close();
  };
  channel.port2.postMessage(null);
}

/** Keep the knobs, and reload the frame if its page loaded as another device. */
export function knobs(state: DevknobsState): void {
  latest = state;
  follow();
}

/**
 * Reload the frame once the knobs settle when its page loaded as another
 * device, so scripts that read the browser at load read the new one. One pick
 * that moves several knobs reloads once. A page still on its first load is
 * left to finish, and so is a page on its way to the next one, which comes
 * patched as the knobs are by then.
 */
function follow(): void {
  if (reloading || !frame?.loaded() || !latest || !stale(identity, identityOf(latest))) return;
  reloading = window.setTimeout(reload, 0);
}

function reload(): void {
  reloading = 0;
  if (!frame?.loaded() || !latest || !stale(identity, identityOf(latest))) return;
  const wait = leaving ? leaving + LEAVE_WAIT - performance.now() : 0;
  if (wait > 0) {
    reloading = window.setTimeout(reload, wait);
    return;
  }
  leaving = 0;
  identity = null;
  try {
    frame.view()?.location.reload();
  } catch {
    // Another origin, which the knobs never reached.
  }
}

/**
 * What a page loaded without the watch reads. One that came in after another
 * origin, where nothing could listen for it, ran unpatched, so it reads the
 * browser's own agent and no touch screen, and a reload patches it. One still
 * unpatched after that reload is left as it is.
 */
function unpatched(view: Window, state: DevknobsState): Identity {
  const had = patchedAs(view);
  if (had || repatched) {
    repatched = false;
    return had ?? identityOf(state);
  }
  const real = { agent: "", touch: false, dpr: state.dpr };
  repatched = stale(real, identityOf(state));
  return real;
}
