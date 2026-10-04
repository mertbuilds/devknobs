import type { Look, Painted, Shapes } from "./browserkit";
import { CHARGE, el, glyphAt, MORPH, place, svgNode } from "./browserkit";
import type { Bars, Glyph, StatusBar } from "./browserui";
import { turn } from "./devices";
import type { Rect } from "./mock";

/**
 * Chrome on Android: the Material 3 toolbar with its url pill, the status bar
 * and the chin over the gesture area. No gesture handle: here no app is
 * switched. Colors are Chromium's
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
.chrome .clip { overflow: hidden; }
.chrome .clip > *, .chrome .slide > *, .chrome .ink > * {
  position: absolute;
  box-sizing: border-box;
}
/* The same timing and curve as Safari's morph: a slide, not a morph. */
.chrome { --main: ${MORPH.minimize}ms; }
.chrome[data-state="max"] { --main: ${MORPH.expand}ms; }
.chrome .slide, .chrome .tint, .chrome .ink {
  transition:
    transform var(--main) ${MORPH.ease},
    opacity var(--main) ${MORPH.ease},
    color var(--main) ${MORPH.ease};
}
.chrome[data-state="min"] .slide { transform: translateY(var(--away)); }
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
function statusIcons(status: StatusBar): Element[] {
  const { x, y } = status.icons;
  const icon = (left: number, width: number, height: number, ...parts: SVGElement[]) => {
    const svg = svgNode("svg", { class: "status", viewBox: `0 0 ${width} ${height}` });
    place(svg, left, y - height / 2, width, height);
    svg.append(...parts);
    return svg;
  };
  // Estimates from AOSP SystemUI: a 20.6 x 12 battery, 15 high icons, 6 apart.
  // Charged to its level, the rest dimmer.
  const edge = ((19.2 * CHARGE) / 100).toFixed(2);
  const battery = icon(
    x - 21,
    21,
    12,
    svgNode("rect", { x: 0, y: 0, width: 19.2, height: 12, rx: 3.5, "fill-opacity": 0.3 }),
    path(`M3.5 0H${edge}V12H3.5A3.5 3.5 0 0 1 0 8.5V3.5A3.5 3.5 0 0 1 3.5 0Z`),
    svgNode("rect", { x: 19.7, y: 3.5, width: 1.3, height: 5, rx: 0.6 }),
  );
  const signal = icon(x - 21 - 6 - 13, 13, 13, path("M13 0V13H0Z"));
  const wifi = icon(x - 21 - 6 - 13 - 5 - 16, 16, 12, path("M0 3.6A11.5 11.5 0 0 1 16 3.6L8 12Z"));
  return [wifi, signal, battery];
}

/**
 * Chrome's bars, drawn once for both states. The toolbar slides away under
 * the status bar, or down off the screen with the chin when it is at the
 * bottom, and back, on the same timing and curve as Safari's morph. The
 * status bar loses the toolbar's color as it goes.
 */
export function buildChrome(full: Bars, mini: Bars, look: Look): Painted {
  const root = el("div", "chrome");
  root.style.inset = "0";
  const toolbar = full.shapes.find((shape) => shape.kind === "toolbar");
  const status = full.status;
  const top = status?.height ?? 0;
  const tinted = toolbar !== undefined && toolbar.y === top;
  const { width: W, height: H } = turn(full.screen, full.orientation);
  // Under the status bar, so the toolbar slides away beneath it.
  const clip = el("div", "clip");
  place(clip, 0, top, W, H - top);
  const below = (rect: Rect): Rect => ({ ...rect, y: rect.y - top });
  const bar = el("div", "slide");
  bar.style.inset = "0";
  const chin = el("div", "slide");
  chin.style.inset = "0";
  if (full.chin) {
    // At the bottom the chin goes with the toolbar, at the top on its own.
    (tinted ? chin : bar).append(box("surface", below(full.chin)));
  }
  for (const shape of full.shapes) {
    const surface = box(shape.kind === "toolbar" ? "surface" : "url-pill", below(shape));
    surface.style.borderRadius = `${shape.radius}px`;
    bar.append(surface);
    for (const mark of shape.marks) {
      bar.append(glyphAt({ ...mark, y: mark.y - top }, GLYPHS, 28, ""));
    }
    if (shape.text) {
      const url = el("div", "url");
      url.style.left = `${shape.text.x}px`;
      url.style.top = `${shape.text.y - top}px`;
      url.style.maxWidth = `${shape.x + shape.width - shape.text.x - 8}px`;
      bar.append(url);
    }
  }
  if (full.hairline) bar.append(box("hairline", below(full.hairline)));
  // How far each goes: up by the toolbar under the status bar, down off the screen.
  const away = toolbar ? (tinted ? -(toolbar.height + 1) : H - toolbar.y) : 0;
  bar.style.setProperty("--away", `${away}px`);
  chin.style.setProperty("--away", `${full.chin?.height ?? 0}px`);
  clip.append(chin, bar);
  const tint = box("surface tint", { x: 0, y: 0, width: W, height: top });
  const ink = el("div", "ink");
  ink.style.inset = "0";
  if (status) {
    const clock = el("div", "clock", "04:47");
    clock.style.left = `${status.time.x}px`;
    clock.style.top = `${status.time.y}px`;
    ink.append(clock, ...statusIcons(status));
  }
  root.append(clip, tint, ink);
  return {
    root,
    apply(minimized, sight) {
      root.dataset.state = minimized ? "min" : "max";
      root.className = `chrome ${sight.scheme}`;
      const shaded = tinted && !minimized;
      tint.style.opacity = shaded ? "1" : "0";
      // Over the toolbar's color the status bar follows the scheme, else the page.
      const dark = shaded ? sight.scheme === "dark" : sight.dark;
      ink.className = dark ? "ink ink-light" : "ink ink-dark";
      for (const url of Array.from(root.querySelectorAll<HTMLElement>(".url"))) {
        url.textContent = sight.host;
      }
    },
  };
}
