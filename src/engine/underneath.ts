/** `showModal` as the page had it, while the page underneath gets plain dialogs. */
let showModal: HTMLDialogElement["showModal"] | null = null;
/** What a page node had before it was hidden here, so it gets exactly that back. */
interface Hidden {
  /** Made inert here. One the page made inert stays the page's. */
  inert: boolean;
  /** The inline `content-visibility` before, its priority, and whether there was a style at all. */
  value: string;
  priority: string;
  styled: boolean;
}

const hidden = new Map<HTMLElement | SVGElement, Hidden>();
/** Hides what the page adds to the body later, such as portals and toasts. */
let bodyObserver: MutationObserver | null = null;

/**
 * Take a page node out of input and out of rendering while the frame covers
 * it. It keeps running, but skips layout and paint.
 */
function hide(node: Node): void {
  if (!(node instanceof HTMLElement || node instanceof SVGElement)) return;
  if (node.hasAttribute("data-devknobs") || hidden.has(node)) return;
  const style = node.style;
  hidden.set(node, {
    inert: !node.hasAttribute("inert"),
    value: style.getPropertyValue("content-visibility"),
    priority: style.getPropertyPriority("content-visibility"),
    styled: node.hasAttribute("style"),
  });
  node.setAttribute("inert", "");
  style.setProperty("content-visibility", "hidden", "important");
}

function unhide(): void {
  for (const [node, was] of hidden) {
    if (was.inert) node.removeAttribute("inert");
    if (was.value) node.style.setProperty("content-visibility", was.value, was.priority);
    else node.style.removeProperty("content-visibility");
    if (!was.styled && node.getAttribute("style") === "") node.removeAttribute("style");
  }
  hidden.clear();
}

/**
 * A modal dialog makes everything else inert, the frame and the panel too, and
 * paints over them. The page underneath gets plain dialogs instead, the ones it
 * has open already too.
 */
function holdModals(): void {
  if (showModal || typeof HTMLDialogElement === "undefined") return;
  const native = HTMLDialogElement.prototype.showModal;
  showModal = native;
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement): void {
    if (this.closest("[data-devknobs]")) native.call(this);
    else this.show();
  };
  let modals: HTMLDialogElement[] = [];
  try {
    modals = Array.from(document.querySelectorAll<HTMLDialogElement>("dialog:modal"));
  } catch {
    // A browser without `:modal`.
  }
  for (const dialog of modals) {
    if (dialog.closest("[data-devknobs]")) continue;
    dialog.close();
    dialog.show();
  }
}

function releaseModals(): void {
  if (showModal) HTMLDialogElement.prototype.showModal = showModal;
  showModal = null;
}

/**
 * Hide the page under the frame, what it adds to the body later too, and give
 * it plain dialogs, until `uncover`.
 */
export function cover(body: HTMLElement): void {
  for (const child of Array.from(body.children)) hide(child);
  holdModals();
  bodyObserver ??= new MutationObserver((records) => {
    for (const record of records) record.addedNodes.forEach(hide);
  });
  bodyObserver.observe(body, { childList: true });
}

/** Give the page under the frame back exactly as it was. */
export function uncover(): void {
  bodyObserver?.disconnect();
  releaseModals();
  unhide();
}
