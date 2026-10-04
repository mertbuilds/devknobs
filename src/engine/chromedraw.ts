import type { Bars, Glyph, StatusBar } from "./browserui";
import type { Look, Shapes } from "./browserkit";
import { assemble, el, glyphAt, place, svgNode } from "./browserkit";
import type { Rect } from "./mock";

/**
 * Chrome on Android: the Material 3 toolbar with its url pill, the status bar,
 * the chin over the gesture area and the gesture handle. Colors are Chromium's
 * baseline, before dynamic color, light or dark with the page's scheme. The
 * glyphs are drawn here, not taken from an icon set.
 */

export const CHROME_CSS = `
.chrome {
  --surface: #ffffff;
  --pill: #e9eef6;
  --on: #1f1f1f;
  --line: #e1e3e1;
  color: var(--on);
}
.chrome.dark { --surface: #131314; --pill: #282a2c; --on: #e3e3e3; --line: #444746; }
.chrome .surface { background: var(--surface); }
.chrome .hairline { background: var(--line); }
.chrome .url-pill { background: var(--pill); }
.chrome .glyph {
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.chrome .glyph .solid { fill: currentColor; stroke: none; }
.chrome .glyph .count { fill: currentColor; stroke: none; font-size: 11px; font-weight: 500; }
.chrome .glyph .knob { fill: var(--pill); }
.chrome .url {
  font-size: 16px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transform: translateY(-50%);
}
.chrome .clock { font-size: 14px; font-weight: 500; transform: translateY(-50%); }
.chrome .ink-light { color: #fff; }
.chrome .ink-dark { color: #1f1f1f; }
.chrome .status { fill: currentColor; }
.chrome .handle { border-radius: 2px; background: currentColor; opacity: 0.6; }
`;

function path(d: string, className?: string): SVGPathElement {
  return svgNode("path", className ? { d, class: className } : { d });
}

/** The toolbar's glyphs, 24 px icons centered on 0, 0. */
const GLYPHS: Record<Glyph, () => Shapes> = {
  home: () => [path("M-7.5 -1L0 -7.5L7.5 -1V7.5H2.5V2H-2.5V7.5H-7.5Z")],
  // Two sliders: the site settings icon at the start of the pill.
  tune: () => [
    path("M-7 -3.5H7M-7 3.5H7"),
    svgNode("circle", { cx: 3, cy: -3.5, r: 2.3, class: "knob" }),
    svgNode("circle", { cx: -3, cy: 3.5, r: 2.3, class: "knob" }),
  ],
  plus: () => [path("M0 -7V7M-7 0H7")],
  switcher: () => {
    const count = svgNode("text", {
      class: "count",
      x: 0,
      y: 0.5,
      "text-anchor": "middle",
      "dominant-baseline": "middle",
    });
    count.textContent = "1";
    return [svgNode("rect", { x: -8, y: -8, width: 16, height: 16, rx: 2.5 }), count];
  },
  menu: () => [-6, 0, 6].map((y) => svgNode("circle", { cx: 0, cy: y, r: 2, class: "solid" })),
  back: () => [],
  forward: () => [],
  share: () => [],
  bookmarks: () => [],
  tabs: () => [],
  reload: () => [],
  page: () => [],
  more: () => [],
};

function box(className: string, rect: Rect): HTMLElement {
  const node = el("div", className);
  place(node, rect.x, rect.y, rect.width, rect.height);
  return node;
}

/** Wifi as a filled fan, signal as a filled triangle, battery as a filled pill. */
function statusIcons(status: StatusBar, ink: string): Element[] {
  const { x, y } = status.icons;
  const icon = (left: number, width: number, height: number, ...parts: SVGElement[]) => {
    const svg = svgNode("svg", { class: `status ${ink}`, viewBox: `0 0 ${width} ${height}` });
    place(svg, left, y - height / 2, width, height);
    svg.append(...parts);
    return svg;
  };
  // Estimates from AOSP SystemUI: a 20.6 x 12 battery, 15 high icons, 6 apart.
  const battery = icon(
    x - 21,
    21,
    12,
    svgNode("rect", { x: 0, y: 0, width: 19.2, height: 12, rx: 3.5 }),
    svgNode("rect", { x: 19.7, y: 3.5, width: 1.3, height: 5, rx: 0.6 }),
  );
  const signal = icon(x - 21 - 6 - 13, 13, 13, path("M13 0V13H0Z"));
  const wifi = icon(x - 21 - 6 - 13 - 5 - 16, 16, 12, path("M0 3.6A11.5 11.5 0 0 1 16 3.6L8 12Z"));
  return [wifi, signal, battery];
}

export function paintChrome(bars: Bars, look: Look): Element[] {
  const root = el("div", `chrome ${look.scheme}`);
  root.style.inset = "0";
  const toolbar = bars.shapes.find((shape) => shape.kind === "toolbar");
  const status = bars.status;
  const nodes: Element[] = [];
  // The status bar takes the toolbar's color while the toolbar sits under it.
  const tinted = toolbar !== undefined && status !== null && toolbar.y === status.height;
  const pageInk = look.dark ? "ink-light" : "ink-dark";
  const barInk = look.scheme === "dark" ? "ink-light" : "ink-dark";
  if (status) {
    const ink = tinted ? barInk : pageInk;
    if (tinted) {
      nodes.push(box("surface", { x: 0, y: 0, width: toolbar.width, height: status.height }));
    }
    const clock = el("div", `clock ${ink}`, "9:41");
    clock.style.left = `${status.time.x}px`;
    clock.style.top = `${status.time.y}px`;
    const still = [clock, ...statusIcons(status, ink)];
    for (const node of still) node.setAttribute("data-still", "");
    nodes.push(...still);
  }
  if (bars.chin) nodes.push(box("surface", bars.chin));
  for (const shape of bars.shapes) {
    const surface = box(shape.kind === "toolbar" ? "surface" : "url-pill", shape);
    surface.style.borderRadius = `${shape.radius}px`;
    nodes.push(surface);
    for (const mark of shape.marks) nodes.push(glyphAt(mark, GLYPHS, 28, ""));
    if (shape.text) {
      const url = el("div", "url", look.host);
      url.style.left = `${shape.text.x}px`;
      url.style.top = `${shape.text.y}px`;
      url.style.maxWidth = `${shape.x + shape.width - shape.text.x - 8}px`;
      nodes.push(url);
    }
  }
  if (bars.hairline) nodes.push(box("hairline", bars.hairline));
  if (bars.handle) {
    const ink = bars.chin ? barInk : pageInk;
    const handle = box(`handle ${ink}`, bars.handle);
    handle.dataset.still = "";
    nodes.push(handle);
  }
  assemble(root, nodes);
  return [root];
}

