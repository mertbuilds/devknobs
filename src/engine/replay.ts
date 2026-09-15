/** Restart every CSS animation on the page, skipping the devknobs panel. */
export function replay(): void {
  const elements = document.querySelectorAll<HTMLElement>("body *");
  for (const element of Array.from(elements)) {
    if (element.closest("[data-devknobs]")) continue;
    if (typeof element.getAnimations === "function") {
      for (const animation of element.getAnimations({ subtree: false })) {
        animation.cancel();
        animation.play();
      }
    }
    if (getComputedStyle(element).animationName === "none") continue;
    const inline = element.style.animation;
    element.style.animation = "none";
    void element.offsetHeight;
    element.style.animation = inline;
  }
}
