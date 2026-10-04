/** Every node devknobs adds to the page carries `data-devknobs`. */
export function ensureStyle(name: string, doc: Document = document): HTMLStyleElement {
  const existing = doc.querySelector<HTMLStyleElement>(`style[data-devknobs="${name}"]`);
  if (existing) return existing;
  const style = doc.createElement("style");
  style.setAttribute("data-devknobs", name);
  (doc.head ?? doc.documentElement).appendChild(style);
  return style;
}

export function removeStyle(name: string): void {
  document.querySelector(`style[data-devknobs="${name}"]`)?.remove();
}
