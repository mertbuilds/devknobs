import type { Actions, Look, Shapes } from "./browserkit";
import { el, glyphAt, place, svgNode } from "./browserkit";
import type { Bars, Fade, Glyph, Shape, StatusBar } from "./browserui";

/**
 * iOS 26 Safari: Liquid Glass capsules over the page's own color, the status
 * bar and the home indicator. The glyphs are drawn here from the common ideas
 * (a chevron, a box with an arrow, an open book), not from Apple's symbols.
 * Colors are sampled from the simulator.
 */

export const SAFARI_CSS = `
.safari { color: #000; }
.safari.dark { color: #f3f3f8; }
.safari .capsule, .safari .card, .safari .pill {
  background: rgba(255, 255, 255, 0.86);
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.1), 0 0 0 0.5px rgba(0, 0, 0, 0.04);
  -webkit-backdrop-filter: blur(20px) saturate(1.6);
  backdrop-filter: blur(20px) saturate(1.6);
}
.safari .card { background: rgba(251, 251, 251, 0.94); }
.safari .field { background: rgba(0, 0, 0, 0.05); }
.safari.dark .capsule, .safari.dark .pill {
  background: rgba(24, 24, 29, 0.92);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.13);
}
.safari.dark .card {
  background: rgba(38, 39, 38, 0.95);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.12);
}
.safari.dark .field { background: rgba(0, 0, 0, 0.14); }
.safari .glyph {
  fill: none;
  stroke: currentColor;
  stroke-width: 1.9;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.safari .glyph .solid { fill: currentColor; stroke: none; }
.safari .glyph.off { color: #babac7; }
.safari.dark .glyph.off { color: #58585b; }
.safari .domain {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: center;
  font-size: 17px;
  font-weight: 500;
  letter-spacing: -0.2px;
  transform: translate(-50%, -50%);
}
.safari .pill {
  display: flex;
  align-items: center;
  padding: 0 19px;
  border-radius: 16px;
  font-size: 13px;
  font-weight: 500;
  transform: translateX(-50%);
  white-space: nowrap;
}
.safari .time { font-weight: 600; letter-spacing: -0.3px; transform: translate(-50%, -50%); }
.safari .status { fill: currentColor; }
.safari .home { border-radius: 3px; background: rgba(0, 0, 0, 0.82); }
.safari.dark .home { background: rgba(255, 255, 255, 0.78); }
`;

function path(d: string, className?: string): SVGPathElement {
  return svgNode("path", className ? { d, class: className } : { d });
}

/** The glyphs in css px, centered on 0, 0, sized to the boxes measured in the simulator. */
const GLYPHS: Record<Glyph, () => Shapes> = {
  // 10.3 x 18
  back: () => [path("M4.2 -8L-4.2 0L4.2 8")],
  forward: () => [path("M-4.2 -8L4.2 0L-4.2 8")],
  // 19.3 x 24.3, a box open at the top with an arrow out of it
  share: () => [
    path("M-3.2 -2.6H-4.7A3 3 0 0 0 -7.7 0.4V8.3A3 3 0 0 0 -4.7 11.3H4.7A3 3 0 0 0 7.7 8.3V0.4A3 3 0 0 0 4.7 -2.6H3.2"),
    path("M0 4.4V-11.1M-4.1 -7L0 -11.1L4.1 -7"),
  ],
  // 24 x 20, an open book
  bookmarks: () => [
    path(
      "M0 -6.4C-2.6 -8.5 -6.6 -9.1 -11.1 -8.1V7.6C-6.6 6.7 -2.6 7.3 0 9.1C2.6 7.3 6.6 6.7 11.1 7.6V-8.1C6.6 -9.1 2.6 -8.5 0 -6.4ZM0 -6.4V9.1",
    ),
  ],
  // 23 x 22.7, a square over the corner of another
  tabs: () => [
    path("M-5.4 5.2H-7.4A3.2 3.2 0 0 1 -10.6 2V-7.2A3.2 3.2 0 0 1 -7.4 -10.4H2.2A3.2 3.2 0 0 1 5.4 -7.2V-5.2"),
    svgNode("rect", { x: -5.4, y: -5.2, width: 16, height: 15.6, rx: 3.2 }),
  ],
  // 15 x 18, a circle open at the top right, its arrow going round
  reload: () => [path("M0 -5.1A6.6 6.6 0 1 0 5.06 -2.74"), path("M-2.6 -8.1L0.4 -5.1L-2.6 -2.1")],
  // 15.5 x 18, a page over two lines
  page: () => [
    svgNode("rect", { x: -6.8, y: -8.1, width: 13.6, height: 8.6, rx: 2.4 }),
    path("M-6.8 4.2H6.8M-6.8 8.1H2.6"),
  ],
  // Three dots 4 across, 7.8 apart.
  more: () => [-7.8, 0, 7.8].map((x) => svgNode("circle", { cx: x, cy: 0, r: 2, class: "solid" })),
  plus: () => [path("M0 -8.5V8.5M-8.5 0H8.5")],
  home: () => [],
  tune: () => [],
  switcher: () => [],
  menu: () => [],
};

/** A ring sector `from` to `to` px out of the corner, `angle` degrees each side of up. */
function fan(from: number, to: number, angle: number): string {
  const rad = (angle * Math.PI) / 180;
  const at = (r: number, side: number) =>
    `${(side * r * Math.sin(rad)).toFixed(2)} ${(-r * Math.cos(rad)).toFixed(2)}`;
  const inner = from > 0 ? `L${at(from, 1)}A${from} ${from} 0 0 0 ${at(from, -1)}Z` : "L0 0Z";
  return `M${at(to, -1)}A${to} ${to} 0 0 1 ${at(to, 1)}${inner}`;
}

/** Wifi, 17 x 12.3: a dot and two bands fanning out of the bottom corner. */
function wifi(x: number, y: number): SVGSVGElement {
  const svg = svgNode("svg", { class: "status", viewBox: "-8.5 -12.3 17 12.3" });
  place(svg, x, y - 6.15, 17, 12.3);
  svg.append(
    ...[fan(0, 3.6, 46), fan(5.5, 8.2, 46), fan(9.9, 12.3, 46)].map((d) => {
      const round = { "stroke-linejoin": "round", stroke: "currentColor", "stroke-width": 0.6 };
      return svgNode("path", { d, ...round });
    }),
  );
  return svg;
}

/** Cellular, 18 x 12: four bars rising left to right. An estimate, the simulator shows dots. */
function signal(x: number, y: number): SVGSVGElement {
  const svg = svgNode("svg", { class: "status", viewBox: "0 0 18 12" });
  place(svg, x, y - 6, 18, 12);
  svg.append(
    ...[4.4, 6.8, 9.2, 12].map((height, at) =>
      svgNode("rect", { x: at * 4.93, y: 12 - height, width: 3.2, height, rx: 1 }),
    ),
  );
  return svg;
}

/** Battery, 27.3 x 13: a full cell in a faint outline, and its nub. */
function battery(x: number, y: number): SVGSVGElement {
  const svg = svgNode("svg", { class: "status", viewBox: "0 0 27.3 13" });
  place(svg, x, y - 6.5, 27.3, 13);
  svg.append(
    svgNode("rect", {
      x: 0.5,
      y: 0.5,
      width: 24.6,
      height: 12,
      rx: 4,
      fill: "none",
      stroke: "currentColor",
      "stroke-opacity": 0.4,
    }),
    svgNode("rect", { x: 2.5, y: 2.5, width: 20.6, height: 8, rx: 2.3 }),
    svgNode("path", {
      d: "M26.1 4.6a1.2 1.2 0 0 1 1.2 1.2v1.4a1.2 1.2 0 0 1-1.2 1.2Z",
      "fill-opacity": 0.4,
    }),
  );
  return svg;
}

/** The time at its center, the icons beside the island, or the SE's either side of the time. */
function statusBar(status: StatusBar): Element[] {
  const time = el("div", "time", "9:41");
  time.style.left = `${status.time.x}px`;
  time.style.top = `${status.time.y}px`;
  time.style.fontSize = `${status.time.size}px`;
  const { icons } = status;
  if (icons.align === "start") {
    // The SE's icons are a size smaller. An estimate from its 2x screenshots.
    const end = status.battery ?? { x: icons.x, y: icons.y };
    const nodes = [
      signal(icons.x, icons.y),
      wifi(icons.x + 23, icons.y),
      battery(end.x - 27.3, end.y),
    ];
    for (const node of nodes) node.style.transform = "scale(0.85)";
    return [time, ...nodes];
  }
  const cell = icons.x - 27.3;
  const air = cell - 7.3 - 17;
  return [time, signal(air - 6 - 18, icons.y), wifi(air, icons.y), battery(cell, icons.y)];
}

/** A glass shape and the glyphs and domain in it. */
function shapeNodes(shape: Shape, look: Look, actions: Actions): Element[] {
  if (shape.kind === "pill") {
    const pill = el("div", "pill", look.host);
    pill.style.left = `${shape.x}px`;
    pill.style.top = `${shape.y}px`;
    pill.style.height = `${shape.height}px`;
    return [pill];
  }
  // Not `glass`: the viewport's own clipping wrapper has that class.
  const box = el("div", shape.kind === "glass" ? "capsule" : shape.kind);
  place(box, shape.x, shape.y, shape.width, shape.height);
  box.style.borderRadius = `${shape.radius}px`;
  const nodes: Element[] = [box];
  for (const mark of shape.marks) {
    const press =
      mark.glyph === "back"
        ? actions.back
        : mark.glyph === "forward"
          ? actions.forward
          : mark.glyph === "reload"
            ? actions.reload
            : undefined;
    const off =
      (mark.glyph === "back" && !look.canBack) || (mark.glyph === "forward" && !look.canForward);
    nodes.push(glyphAt(mark, GLYPHS, 30, off ? "off" : "", off ? undefined : press));
  }
  if (shape.text) {
    const domain = el("div", "domain", look.host);
    domain.style.left = `${shape.text.x}px`;
    domain.style.top = `${shape.text.y}px`;
    // Clear of the page menu and reload at its ends.
    domain.style.maxWidth = `${shape.width - 96}px`;
    nodes.push(domain);
  }
  return nodes;
}

/**
 * The scroll edge: the page's own color, from clear just over the end of the
 * frame to nearly opaque at the bottom, so the page reads as running under
 * the glass. It never takes a pointer, so the page under it still does.
 */
function fadeNode(fade: Fade, look: Look): HTMLElement {
  const node = el("div", "fade");
  node.style.cssText = `left: 0; right: 0; top: ${fade.y}px; height: ${fade.height}px`;
  // The page's color, `rgb(r, g, b)`, at each stop's opacity.
  const color = (alpha: number) => look.background.replace(/^rgb\((.*)\)$/, `rgba($1, ${alpha})`);
  const stops = fade.stops.map(({ at, alpha }) => `${color(alpha)} ${at}px`);
  node.style.background = `linear-gradient(to bottom, ${stops.join(", ")})`;
  return node;
}

export function paintSafari(bars: Bars, look: Look, actions: Actions): Element[] {
  const root = el("div", look.dark ? "safari dark" : "safari light");
  root.style.inset = "0";
  const nodes: Element[] = [];
  if (bars.fade) nodes.push(fadeNode(bars.fade, look));
  if (bars.status) nodes.push(...statusBar(bars.status));
  for (const shape of bars.shapes) nodes.push(...shapeNodes(shape, look, actions));
  if (bars.handle) {
    const home = el("div", "home");
    place(home, bars.handle.x, bars.handle.y, bars.handle.width, bars.handle.height);
    nodes.push(home);
  }
  root.append(...nodes);
  return [root];
}
