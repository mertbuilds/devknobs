import type { Action, RowId } from "./catalog";

/**
 * The panel's icons, drawn from lucide-static 1.52.0 (ISC, see
 * THIRD_PARTY_NOTICES.md), all but the one marked as devknobs' own. Each is the
 * shapes of its 24 by 24 svg as they are in the package, so the package itself
 * is no dependency.
 */

const SVG = "http://www.w3.org/2000/svg";

type Shape = readonly [tag: "path" | "circle" | "rect", attributes: Readonly<Record<string, string>>];

const p = (d: string): Shape => ["path", { d }];
const c = (cx: string, cy: string, r: string): Shape => ["circle", { cx, cy, r }];

export const ICONS = {
  /**
   * devknobs' own drawing, not lucide's, in its style: half a sun on the left
   * and a crescent moon on the right, centred in the box.
   */
  "half-sun-moon": [
    p("M12 7a5 5 0 0 0 0 10"),
    p("M12 3a9 9 0 0 1 0 18 12 12 0 0 0 0-18z"),
    p("M3 12h2"),
    p("m5.64 5.64 1.41 1.41"),
    p("m5.64 18.36 1.41-1.41"),
  ],
  contrast: [c("12", "12", "10"), p("M12 18a6 6 0 0 0 0-12v12z")],
  blend: [c("15", "9", "7"), c("9", "15", "7")],
  eye: [
    p(
      "M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0",
    ),
    c("12", "12", "3"),
  ],
  type: [p("M12 4v16"), p("M4 7V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2"), p("M9 20h6")],
  wind: [
    p("M12.8 19.6A2 2 0 1 0 14 16H2"),
    p("M17.5 8a2.5 2.5 0 1 1 2 4H2"),
    p("M9.8 4.4A2 2 0 1 1 11 8H2"),
  ],
  languages: [
    p("m5 8 6 6"),
    p("m4 14 6-6 2-3"),
    p("M2 5h12"),
    p("M7 2h1"),
    p("m22 22-5-10-5 10"),
    p("M14 18h6"),
  ],
  "map-pin": [
    p(
      "M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0",
    ),
    c("12", "10", "3"),
  ],
  clock: [c("12", "12", "10"), p("M12 6v6l4 2")],
  wifi: [
    p("M12 20h.01"),
    p("M2 8.82a15 15 0 0 1 20 0"),
    p("M5 12.859a10 10 0 0 1 14 0"),
    p("M8.5 16.429a5 5 0 0 1 7 0"),
  ],
  smartphone: [
    ["rect", { width: "14", height: "20", x: "5", y: "2", rx: "2", ry: "2" }],
    p("M12 18h.01"),
  ],
  ruler: [
    p(
      "M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z",
    ),
    p("m14.5 12.5 2-2"),
    p("m11.5 9.5 2-2"),
    p("m8.5 6.5 2-2"),
    p("m17.5 15.5 2-2"),
  ],
  bug: [
    p("M12 20v-9"),
    p("M14 7a4 4 0 0 1 4 4v3a6 6 0 0 1-12 0v-3a4 4 0 0 1 4-4z"),
    p("M14.12 3.88 16 2"),
    p("M21 21a4 4 0 0 0-3.81-4"),
    p("M21 5a4 4 0 0 1-3.55 3.97"),
    p("M22 13h-4"),
    p("M3 21a4 4 0 0 1 3.81-4"),
    p("M3 5a4 4 0 0 0 3.55 3.97"),
    p("M6 13H2"),
    p("m8 2 1.88 1.88"),
    p("M9 7.13V6a3 3 0 1 1 6 0v1.13"),
  ],
  "square-dashed-mouse-pointer": [
    p(
      "M12.034 12.681a.498.498 0 0 1 .647-.647l9 3.5a.5.5 0 0 1-.033.943l-3.444 1.068a1 1 0 0 0-.66.66l-1.067 3.443a.5.5 0 0 1-.943.033z",
    ),
    p("M5 3a2 2 0 0 0-2 2"),
    p("M19 3a2 2 0 0 1 2 2"),
    p("M5 21a2 2 0 0 1-2-2"),
    p("M9 3h1"),
    p("M9 21h2"),
    p("M14 3h1"),
    p("M3 9v1"),
    p("M21 9v2"),
    p("M3 14v1"),
  ],
  settings: [
    p(
      "M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915",
    ),
    c("12", "12", "3"),
  ],
  "rotate-ccw": [p("M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"), p("M3 3v5h5")],
  "chevron-left": [p("m15 18-6-6 6-6")],
  "chevrons-left-right": [p("m9 7-5 5 5 5"), p("m15 7 5 5-5 5")],
  plus: [p("M5 12h14"), p("M12 5v14")],
  x: [p("M18 6 6 18"), p("m6 6 12 12")],
  "grip-vertical": [
    c("9", "12", "1"),
    c("9", "5", "1"),
    c("9", "19", "1"),
    c("15", "12", "1"),
    c("15", "5", "1"),
    c("15", "19", "1"),
  ],
} satisfies Record<string, readonly Shape[]>;

export type IconName = keyof typeof ICONS;

/** The icon each row shows by its label, and its knobs in the search. */
export const ROW_ICONS: Record<RowId, IconName> = {
  scheme: "half-sun-moon",
  contrast: "contrast",
  transparency: "blend",
  vision: "eye",
  text: "type",
  motion: "wind",
  locale: "languages",
  location: "map-pin",
  clock: "clock",
  network: "wifi",
  device: "smartphone",
  viewport: "ruler",
  debug: "bug",
};

export const ACTION_ICONS: Record<Action["id"], IconName> = {
  grab: "square-dashed-mouse-pointer",
  replay: "rotate-ccw",
};

/** An icon `size` px square, stroked in the text's color and hidden from assistive tech. */
export function icon(name: IconName, size = 14): SVGElement {
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("class", "glyph");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.5");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  for (const [tag, attributes] of ICONS[name]) {
    const shape = document.createElementNS(SVG, tag);
    for (const [key, value] of Object.entries(attributes)) shape.setAttribute(key, value);
    svg.append(shape);
  }
  return svg;
}
