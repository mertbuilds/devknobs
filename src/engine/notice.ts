/**
 * Over the frame when the page is out of reach: `X-Frame-Options` or a
 * `frame-ancestors` policy left an error page there, or a link led away to
 * another origin. Either way none of the knobs can follow it. Its button
 * calls `close`.
 */
export function createNotice(close: () => void): HTMLElement {
  const box = document.createElement("div");
  box.className = "blocked";
  box.hidden = true;
  const text = document.createElement("div");
  text.textContent = "this page refuses to load in a frame";
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "close the frame";
  button.addEventListener("click", close);
  box.append(text, button);
  return box;
}
