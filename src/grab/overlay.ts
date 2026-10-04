/** Over everything, the panel too. It never takes a pointer. */
const Z_INDEX = 2147483647;

/** How long the toast stays, in ms. */
export const TOAST_TIME = 1200;

/** Space between a box and its label or toast, and the window's edge, in px. */
const GAP = 4;

/**
 * The colors are the panel's, light or dark by the real system scheme: the
 * knobs rewrite the page's stylesheets, never this one. Inside the frame,
 * where the scheme can be handed down natively, the page above says which.
 */
const CSS = `
.layer {
  all: initial;
  position: fixed;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  direction: ltr;
  --bg: #fbfbf9;
  --fg: #1b1b19;
  --faint: #73736d;
  --line: #e6e6e0;
  --accent: #2f6fed;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  font-size: 11px;
  font-weight: 400;
  line-height: 16px;
  -webkit-font-smoothing: antialiased;
}
@media (prefers-color-scheme: dark) {
  .layer:not([data-scheme="light"]) {
    --bg: #151513;
    --fg: #e9e9e3;
    --faint: #8c8c85;
    --line: #2b2b28;
    --accent: #6d9bff;
  }
}
.layer[data-scheme="dark"] {
  --bg: #151513;
  --fg: #e9e9e3;
  --faint: #8c8c85;
  --line: #2b2b28;
  --accent: #6d9bff;
}
.box {
  position: absolute;
  top: 0;
  left: 0;
  box-sizing: border-box;
  border: 1px solid var(--accent);
  border-radius: 2px;
  background: color-mix(in srgb, var(--accent) 10%, transparent);
}
.box.pick {
  border-color: color-mix(in srgb, var(--accent) 55%, transparent);
  background: color-mix(in srgb, var(--accent) 5%, transparent);
}
.pill {
  position: absolute;
  top: 0;
  left: 0;
  display: flex;
  gap: 6px;
  max-width: calc(100% - ${2 * GAP}px);
  box-sizing: border-box;
  padding: 2px 6px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: var(--fg);
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 6px;
}
.tag { color: var(--faint); }
.toast { transition: opacity 150ms ease-out; }
.toast.out { opacity: 0; }
.layer [hidden] { display: none; }
@media (prefers-reduced-motion: reduce) {
  .toast { transition: none; }
}
`;

/** Where a pill goes by a box: above it, below it, or inside its top, kept in the window. */
export function pillPlace(
  box: { top: number; bottom: number; left: number },
  pill: { width: number; height: number },
  view: { width: number; height: number },
): { x: number; y: number } {
  let y = box.top - pill.height - GAP;
  if (y < GAP) y = box.bottom + GAP;
  if (y + pill.height > view.height - GAP) y = Math.max(GAP, box.top + GAP);
  const x = Math.min(Math.max(box.left, GAP), Math.max(GAP, view.width - pill.width - GAP));
  return { x, y };
}

/** Where the toast goes by a box: below it, above it where there is no room, kept in the window. */
export function toastPlace(
  box: { top: number; bottom: number; left: number },
  pill: { width: number; height: number },
  view: { width: number; height: number },
): { x: number; y: number } {
  let y = box.bottom + GAP;
  if (y + pill.height > view.height - GAP) y = box.top - pill.height - GAP;
  y = Math.min(Math.max(y, GAP), Math.max(GAP, view.height - pill.height - GAP));
  const x = Math.min(Math.max(box.left, GAP), Math.max(GAP, view.width - pill.width - GAP));
  return { x, y };
}

export interface Overlay {
  /** Box the current element, with its label, and every gathered one lighter. */
  draw(
    current: Element | null,
    label: { tag: string; name: string | null },
    picked: Element[],
  ): void;
  /** Say something by an element for a moment. */
  toast(text: string, near: Element | null): void;
  /** Take the boxes away now, and the layer once a toast is over. */
  destroy(): void;
}

function place(node: HTMLElement, rect: DOMRect): void {
  node.style.transform = `translate(${rect.left}px, ${rect.top}px)`;
  node.style.width = `${rect.width}px`;
  node.style.height = `${rect.height}px`;
}

/** The layer grab draws on, in a shadow root of its own on this document. */
export function createOverlay(scheme?: "light" | "dark"): Overlay {
  const host = document.createElement("div");
  host.setAttribute("data-devknobs", "grab");
  host.style.cssText = `position:fixed;inset:0;pointer-events:none;z-index:${Z_INDEX}`;
  const root = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = CSS;
  const layer = document.createElement("div");
  layer.className = "layer";
  if (scheme) layer.dataset.scheme = scheme;
  const box = document.createElement("div");
  box.className = "box";
  box.hidden = true;
  const label = document.createElement("div");
  label.className = "pill";
  label.hidden = true;
  const tag = document.createElement("span");
  tag.className = "tag";
  const name = document.createElement("span");
  label.append(tag, name);
  const toastNode = document.createElement("div");
  toastNode.className = "pill toast";
  toastNode.hidden = true;
  const picks: HTMLElement[] = [];
  layer.append(box, label, toastNode);
  root.append(style, layer);
  (document.body ?? document.documentElement).append(host);

  let toastTimer = 0;
  let fadeTimer = 0;
  let closing = false;

  function view(): { width: number; height: number } {
    return { width: window.innerWidth, height: window.innerHeight };
  }

  function drawPicks(picked: Element[]): void {
    while (picks.length < picked.length) {
      const node = document.createElement("div");
      node.className = "box pick";
      layer.insertBefore(node, box);
      picks.push(node);
    }
    picks.forEach((node, index) => {
      const element = picked[index];
      node.hidden = !element;
      if (element) place(node, element.getBoundingClientRect());
    });
  }

  function remove(): void {
    clearTimeout(toastTimer);
    clearTimeout(fadeTimer);
    host.remove();
  }

  return {
    draw(current, text, picked) {
      drawPicks(picked);
      box.hidden = current === null;
      label.hidden = current === null;
      if (!current) return;
      const rect = current.getBoundingClientRect();
      place(box, rect);
      tag.textContent = text.tag;
      name.textContent = text.name ?? "";
      name.hidden = !text.name;
      const at = pillPlace(rect, { width: label.offsetWidth, height: label.offsetHeight }, view());
      label.style.transform = `translate(${at.x}px, ${at.y}px)`;
    },
    toast(text, near) {
      clearTimeout(toastTimer);
      clearTimeout(fadeTimer);
      toastNode.textContent = text;
      toastNode.hidden = false;
      toastNode.classList.remove("out");
      const rect = near?.isConnected ? near.getBoundingClientRect() : null;
      const size = { width: toastNode.offsetWidth, height: toastNode.offsetHeight };
      const at = rect
        ? toastPlace(rect, size, view())
        : { x: (view().width - size.width) / 2, y: GAP * 4 };
      toastNode.style.transform = `translate(${at.x}px, ${at.y}px)`;
      toastTimer = window.setTimeout(() => {
        toastNode.classList.add("out");
        fadeTimer = window.setTimeout(() => {
          toastNode.hidden = true;
          if (closing) remove();
        }, 150);
      }, TOAST_TIME);
    },
    destroy() {
      closing = true;
      box.hidden = true;
      label.hidden = true;
      drawPicks([]);
      if (toastNode.hidden) remove();
    },
  };
}
