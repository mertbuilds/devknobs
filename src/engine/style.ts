/** Every node devknobs adds to the page carries `data-devknobs`. */
export function ensureStyle(name: string): HTMLStyleElement {
  const existing = document.querySelector<HTMLStyleElement>(`style[data-devknobs="${name}"]`);
  if (existing) return existing;
  const style = document.createElement("style");
  style.setAttribute("data-devknobs", name);
  (document.head ?? document.documentElement).appendChild(style);
  return style;
}

export function removeStyle(name: string): void {
  document.querySelector(`style[data-devknobs="${name}"]`)?.remove();
}
