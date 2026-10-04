import { ensureStyle, removeStyle } from "./style";

const NAME = "scrollbars";

/** How long a frame's first page gets to take the blank document's place, in ms. */
const COMMIT_WAIT = 1000;

/**
 * A touch screen's scrollbars lie over the page and take no room, where a
 * mouse's take a strip of the layout. So no scroller keeps one, the root
 * included, and the page is as wide as the device, as in the devtools device
 * toolbar. Scrolling goes on without them.
 */
export const CSS =
  "*{scrollbar-width:none!important}::-webkit-scrollbar{display:none!important}";

export function apply(value: boolean): void {
  if (!value) {
    reset();
    return;
  }
  ensureStyle(NAME).textContent = CSS;
}

/** Put the sheet in a document once it has a root, which is before its first script. */
function place(doc: Document): void {
  if (doc.documentElement) {
    ensureStyle(NAME, doc).textContent = CSS;
    return;
  }
  const observer = new MutationObserver(() => {
    if (!doc.documentElement) return;
    observer.disconnect();
    ensureStyle(NAME, doc).textContent = CSS;
  });
  observer.observe(doc, { childList: true });
}

/**
 * Hide another window on this origin's scrollbars, from the page above its
 * frame before the window's own scripts run, so its first layout is as wide
 * as the device. The blank document a frame starts with gives way to the
 * first page in the same window, and that page gets the sheet. A copy of
 * devknobs there keeps the sheet or takes it away.
 */
export function equip(view: Window): void {
  const blank = view.document;
  if (!blank) return;
  if (blank.URL !== "about:blank") {
    place(blank);
    return;
  }
  const until = performance.now() + COMMIT_WAIT;
  const channel = new MessageChannel();
  channel.port1.onmessage = () => {
    let doc: Document | null = null;
    try {
      doc = view.document;
    } catch {
      // Another origin: nothing there to style.
    }
    if (doc && doc !== blank) place(doc);
    else if (doc && performance.now() < until) {
      channel.port2.postMessage(null);
      return;
    }
    channel.port1.close();
  };
  channel.port2.postMessage(null);
}

export function reset(): void {
  removeStyle(NAME);
}
