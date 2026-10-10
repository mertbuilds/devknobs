import type { KnobRowId, Row } from "./catalog";
import type { Binding } from "./keys";

/**
 * The panel's icons, drawn from lucide-static 1.52.0 (ISC, see
 * THIRD_PARTY_NOTICES.md), all but the one marked as devknobs' own and the
 * marks under them. Each is the
 * shapes of its 24 by 24 svg as they are in the package, so the package itself
 * is no dependency.
 */

const SVG = "http://www.w3.org/2000/svg";

type Shape = readonly [
  tag: "path" | "circle" | "rect" | "ellipse",
  attributes: Readonly<Record<string, string>>,
];

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
  braces: [
    p("M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h1"),
    p("M16 21h1a2 2 0 0 0 2-2v-5c0-1.1.9-2 2-2a2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1"),
  ],
  settings: [
    p(
      "M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915",
    ),
    c("12", "12", "3"),
  ],
  "panel-right": [
    ["rect", { width: "18", height: "18", x: "3", y: "3", rx: "2" }],
    p("M15 3v18"),
  ],
  "panel-left": [
    ["rect", { width: "18", height: "18", x: "3", y: "3", rx: "2" }],
    p("M9 3v18"),
  ],
  "panel-right-close": [
    ["rect", { width: "18", height: "18", x: "3", y: "3", rx: "2" }],
    p("M15 3v18"),
    p("m8 9 3 3-3 3"),
  ],
  "panel-right-open": [
    ["rect", { width: "18", height: "18", x: "3", y: "3", rx: "2" }],
    p("M15 3v18"),
    p("m10 15-3-3 3-3"),
  ],
  pin: [
    p("M12 17v5"),
    p(
      "M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z",
    ),
  ],
  "pin-off": [
    p("M12 17v5"),
    p("M15 9.34V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H7.89"),
    p("m2 2 20 20"),
    p("M9 9v1.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h11"),
  ],
  eraser: [
    p(
      "M21 21H8a2 2 0 0 1-1.42-.587l-3.994-3.999a2 2 0 0 1 0-2.828l10-10a2 2 0 0 1 2.829 0l5.999 6a2 2 0 0 1 0 2.828L12.834 21",
    ),
    p("m5.082 11.09 8.828 8.828"),
  ],
  "rotate-ccw": [p("M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"), p("M3 3v5h5")],
  "arrow-up-down": [p("m21 16-4 4-4-4"), p("M17 20V4"), p("m3 8 4-4 4 4"), p("M7 4v16")],
  ban: [c("12", "12", "10"), p("M4.929 4.929 19.07 19.071")],
  copy: [
    ["rect", { width: "14", height: "14", x: "8", y: "8", rx: "2", ry: "2" }],
    p("M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"),
  ],
  "refresh-cw": [
    p("M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"),
    p("M21 3v5h-5"),
    p("M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"),
    p("M8 16H3v5"),
  ],
  database: [
    ["ellipse", { cx: "12", cy: "5", rx: "9", ry: "3" }],
    p("M3 5V19A9 3 0 0 0 21 19V5"),
    p("M3 12A9 3 0 0 0 21 12"),
  ],
  "trash-2": [
    p("M10 11v6"),
    p("M14 11v6"),
    p("M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"),
    p("M3 6h18"),
    p("M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"),
  ],
  check: [p("M20 6 9 17l-5-5")],
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
  image: [
    ["rect", { width: "18", height: "18", x: "3", y: "3", rx: "2", ry: "2" }],
    c("9", "9", "2"),
    p("m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"),
  ],
  film: [
    ["rect", { width: "18", height: "18", x: "3", y: "3", rx: "2" }],
    p("M7 3v18"),
    p("M3 7.5h4"),
    p("M3 12h18"),
    p("M3 16.5h4"),
    p("M17 3v18"),
    p("M17 7.5h4"),
    p("M17 16.5h4"),
  ],
  file: [
    p(
      "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z",
    ),
    p("M14 2v5a1 1 0 0 0 1 1h5"),
  ],
} satisfies Record<string, readonly Shape[]>;

export type IconName = keyof typeof ICONS;

/** A mark: its color, its path, and what is drawn behind it where it has letters. */
type Brand = readonly [fill: string, d: string, behind?: readonly [fill: string, d: string]];

export type BrandName = "javascript" | "css" | "html5" | "webassembly" | "json";

/**
 * The marks of what a page loads, from Simple Icons 16.6.0 (CC0, see
 * THIRD_PARTY_NOTICES.md): each the one path of its 24 by 24 svg as it is in
 * the package, in the color the package lists for it. The path leaves a
 * mark's letters open, so a plain box behind them gives them the color their
 * owner draws them in, the same in a light panel and a dark one. JSON's black
 * is the text's color instead, which shows in both.
 */
export const BRANDS: Record<BrandName, Brand> = {
  javascript: [
    "#F7DF1E",
    "M0 0h24v24H0V0zm22.034 18.276c-.175-1.095-.888-2.015-3.003-2.873-.736-.345-1.554-.585-1.797-1.14-.091-.33-.105-.51-.046-.705.15-.646.915-.84 1.515-.66.39.12.75.42.976.9 1.034-.676 1.034-.676 1.755-1.125-.27-.42-.404-.601-.586-.78-.63-.705-1.469-1.065-2.834-1.034l-.705.089c-.676.165-1.32.525-1.71 1.005-1.14 1.291-.811 3.541.569 4.471 1.365 1.02 3.361 1.244 3.616 2.205.24 1.17-.87 1.545-1.966 1.41-.811-.18-1.26-.586-1.755-1.336l-1.83 1.051c.21.48.45.689.81 1.109 1.74 1.756 6.09 1.666 6.871-1.004.029-.09.24-.705.074-1.65l.046.067zm-8.983-7.245h-2.248c0 1.938-.009 3.864-.009 5.805 0 1.232.063 2.363-.138 2.711-.33.689-1.18.601-1.566.48-.396-.196-.597-.466-.83-.855-.063-.105-.11-.196-.127-.196l-1.825 1.125c.305.63.75 1.172 1.324 1.517.855.51 2.004.675 3.207.405.783-.226 1.458-.691 1.811-1.411.51-.93.402-2.07.397-3.346.012-2.054 0-4.109 0-6.179l.004-.056z",
    ["#000", "M1 1h22v22H1z"],
  ],
  css: [
    "#663399",
    "M0 0v20.16A3.84 3.84 0 0 0 3.84 24h16.32A3.84 3.84 0 0 0 24 20.16V3.84A3.84 3.84 0 0 0 20.16 0Zm14.256 13.08c1.56 0 2.28 1.08 2.304 2.64h-1.608c.024-.288-.048-.6-.144-.84-.096-.192-.288-.264-.552-.264-.456 0-.696.264-.696.84-.024.576.288.888.768 1.08.72.288 1.608.744 1.92 1.296q.432.648.432 1.656c0 1.608-.912 2.592-2.496 2.592-1.656 0-2.4-1.032-2.424-2.688h1.68c0 .792.264 1.176.792 1.176.264 0 .456-.072.552-.24.192-.312.24-1.176-.048-1.512-.312-.408-.912-.6-1.32-.816q-.828-.396-1.224-.936c-.24-.36-.36-.888-.36-1.536 0-1.44.936-2.472 2.424-2.448m5.4 0c1.584 0 2.304 1.08 2.328 2.64h-1.608c0-.288-.048-.6-.168-.84-.096-.192-.264-.264-.528-.264-.48 0-.72.264-.72.84s.288.888.792 1.08c.696.288 1.608.744 1.92 1.296.264.432.408.984.408 1.656.024 1.608-.888 2.592-2.472 2.592-1.68 0-2.424-1.056-2.448-2.688h1.68c0 .744.264 1.176.792 1.176.264 0 .456-.072.552-.24.216-.312.264-1.176-.048-1.512-.288-.408-.888-.6-1.32-.816-.552-.264-.96-.576-1.2-.936s-.36-.888-.36-1.536c-.024-1.44.912-2.472 2.4-2.448m-11.031.018c.711-.006 1.419.198 1.839.63.432.432.672 1.128.648 1.992H9.336c.024-.456-.096-.792-.432-.96-.312-.144-.768-.048-.888.24-.12.264-.192.576-.168.864v3.504c0 .744.264 1.128.768 1.128a.65.65 0 0 0 .552-.264c.168-.24.192-.552.168-.84h1.776c.096 1.632-.984 2.712-2.568 2.688-1.536 0-2.496-.864-2.472-2.472v-4.032c0-.816.24-1.44.696-1.848.432-.408 1.146-.624 1.857-.63",
    ["#fff", "M4 12h18v11.3H4z"],
  ],
  html5: [
    "#E34F26",
    "M1.5 0h21l-1.91 21.563L11.977 24l-8.564-2.438L1.5 0zm7.031 9.75l-.232-2.718 10.059.003.23-2.622L5.412 4.41l.698 8.01h9.126l-.326 3.426-2.91.804-2.955-.81-.188-2.11H6.248l.33 4.171L12 19.351l5.379-1.443.744-8.157H8.531z",
    ["#fff", "M5 4h14v16H5z"],
  ],
  webassembly: [
    "#654FF0",
    "M14.745,0c0,0.042,0,0.085,0,0.129c0,1.52-1.232,2.752-2.752,2.752c-1.52,0-2.752-1.232-2.752-2.752 c0-0.045,0-0.087,0-0.129H0v24h24V0H14.745z M11.454,21.431l-1.169-5.783h-0.02l-1.264,5.783H7.39l-1.824-8.497h1.59l1.088,5.783 h0.02l1.311-5.783h1.487l1.177,5.854h0.02l1.242-5.854h1.561l-2.027,8.497H11.454z M20.209,21.431l-0.542-1.891h-2.861l-0.417,1.891 h-1.59l2.056-8.497h2.509l2.5,8.497H20.209z M17.812,15.028l-0.694,3.118h2.159l-0.796-3.118H17.812z",
    ["#fff", "M4 12h19v10H4z"],
  ],
  json: [
    "currentColor",
    "M12.043 23.968c.479-.004.953-.029 1.426-.094a11.805 11.805 0 003.146-.863 12.404 12.404 0 003.793-2.542 11.977 11.977 0 002.44-3.427 11.794 11.794 0 001.02-3.476c.149-1.16.135-2.346-.045-3.499a11.96 11.96 0 00-.793-2.788 11.197 11.197 0 00-.854-1.617c-1.168-1.837-2.861-3.314-4.81-4.3a12.835 12.835 0 00-2.172-.87h-.005c.119.063.24.132.345.201.12.074.239.146.351.225a8.93 8.93 0 011.559 1.33c1.063 1.145 1.797 2.548 2.218 4.041.284.982.434 1.998.495 3.017.044.743.044 1.491-.047 2.229-.149 1.27-.554 2.51-1.228 3.596a7.475 7.475 0 01-1.903 2.084c-1.244.928-2.877 1.482-4.436 1.114a3.916 3.916 0 01-.748-.258 4.692 4.692 0 01-.779-.45 6.08 6.08 0 01-1.244-1.105 6.507 6.507 0 01-1.049-1.747 7.366 7.366 0 01-.494-2.54c-.03-1.273.225-2.553.854-3.67a6.43 6.43 0 011.663-1.918c.225-.178.464-.333.704-.479l.016-.007a5.121 5.121 0 00-1.441-.12 4.963 4.963 0 00-1.228.24c-.359.12-.704.27-1.019.45a6.146 6.146 0 00-.733.494c-.211.18-.42.36-.615.555-1.123 1.153-1.768 2.682-2.022 4.256-.15.973-.15 1.96-.091 2.95.105 1.395.391 2.787.945 4.062a8.518 8.518 0 001.348 2.173 8.14 8.14 0 003.132 2.23 7.934 7.934 0 002.113.54c.074.015.149.015.209.015zm-2.934-.398a4.102 4.102 0 01-.45-.228 8.5 8.5 0 01-2.038-1.534c-1.094-1.137-1.827-2.566-2.247-4.08a15.184 15.184 0 01-.495-3.172 12.14 12.14 0 01.046-2.082c.135-1.257.495-2.501 1.124-3.58a6.889 6.889 0 011.783-2.053 6.23 6.23 0 011.633-.9 5.363 5.363 0 013.522-.045c.029 0 .029 0 .045.03.015.015.045.015.06.03.045.016.104.045.165.074.239.12.479.271.704.42a6.294 6.294 0 012.097 2.502c.42.914.615 1.934.631 2.938.014 1.079-.18 2.157-.645 3.146a6.42 6.42 0 01-2.638 2.832c.09.03.18.045.271.075.225.044.449.074.688.074 1.468.045 2.892-.66 3.94-1.647.195-.18.375-.375.54-.585.225-.27.435-.54.614-.823.239-.375.435-.75.614-1.154a8.112 8.112 0 00.509-1.664c.196-1.004.211-2.022.149-3.026-.135-2.022-.673-4.045-1.842-5.724a9.054 9.054 0 00-.555-.719 9.868 9.868 0 00-1.063-1.034 8.477 8.477 0 00-1.363-.915 9.927 9.927 0 00-1.692-.598l-.3-.06c-.209-.03-.42-.044-.634-.06a8.453 8.453 0 00-1.015.016c-.704.045-1.412.16-2.112.337C5.799 1.227 2.863 3.566 1.3 6.67A11.834 11.834 0 00.238 9.801a11.81 11.81 0 00-.104 3.775c.12 1.02.374 2.023.778 2.977.227.57.511 1.124.825 1.648 1.094 1.783 2.683 3.236 4.51 4.24.688.39 1.408.69 2.157.944.226.074.45.15.689.21z",
  ],
};

/** Any drawing the panel has, an icon or a mark. */
export type GlyphName = IconName | BrandName;

/** The icon each row of knobs shows by its label, and its knobs in the search. */
export const ROW_ICONS: Record<KnobRowId, IconName> = {
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

/** The icon a row shows by its label: its action's, which the catalog names, else its knobs'. */
export function rowIcon(row: Row): IconName {
  return row.action ? row.action.icon : ROW_ICONS[row.id];
}

/** The icon each shortcut shows in the settings, an action's own where it runs one. */
export const BINDING_ICONS: Record<Binding, IconName> = {
  panel: "panel-right-open",
  grab: "square-dashed-mouse-pointer",
  inspect: "braces",
  replay: "rotate-ccw",
  requests: "arrow-up-down",
  storage: "database",
  reset: "eraser",
};

/** An empty drawing `size` px square, hidden from assistive tech. */
function frame(size: number): SVGElement {
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("class", "glyph");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("aria-hidden", "true");
  return svg;
}

/** An icon `size` px square, stroked in the text's color and hidden from assistive tech. */
export function icon(name: IconName, size = 14): SVGElement {
  const svg = frame(size);
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.5");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  for (const [tag, attributes] of ICONS[name]) {
    const shape = document.createElementNS(SVG, tag);
    for (const [key, value] of Object.entries(attributes)) shape.setAttribute(key, value);
    svg.append(shape);
  }
  return svg;
}

/** A mark `size` px square, filled in its own color and hidden from assistive tech. */
export function brand(name: BrandName, size = 14): SVGElement {
  const svg = frame(size);
  const [fill, d, behind] = BRANDS[name];
  for (const [color, path] of behind ? [behind, [fill, d]] : [[fill, d]]) {
    const shape = document.createElementNS(SVG, "path");
    shape.setAttribute("fill", color);
    shape.setAttribute("d", path);
    svg.append(shape);
  }
  return svg;
}

function isBrand(name: GlyphName): name is BrandName {
  return name in BRANDS;
}

/** An icon or a mark, whichever `name` is. */
export function glyph(name: GlyphName, size = 14): SVGElement {
  return isBrand(name) ? brand(name, size) : icon(name, size);
}
