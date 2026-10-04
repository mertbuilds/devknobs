import type { VisionValue } from "../types";

/**
 * Full dichromacy from Machado, Oliveira and Fernandes, "A Physiologically-based
 * Model for Simulation of Color Vision Deficiency" (IEEE TVCG 2009), severity
 * 1.0, the matrices Chromium's devtools emulation uses too. Achromatopsia keeps
 * only Rec. 709 luminance. `feColorMatrix` works in linear rgb by default, which
 * is the space the model is defined in.
 */
const MATRICES: Record<Exclude<VisionValue, "none" | "blur">, number[][]> = {
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
  achromatopsia: [
    [0.2126, 0.7152, 0.0722],
    [0.2126, 0.7152, 0.0722],
    [0.2126, 0.7152, 0.0722],
  ],
};

/** Blurred vision, as devtools draws it. */
const BLUR = "blur(2px)";

/** The css `filter` that draws a vision deficiency, or "" for none. */
export function visionFilter(value: VisionValue): string {
  if (value === "none") return "";
  if (value === "blur") return BLUR;
  // Each rgb row gets a zero alpha column and offset, then alpha passes through.
  const rows = [...MATRICES[value].map((row) => [...row, 0, 0]), [0, 0, 0, 1, 0]];
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg"><filter id="f">' +
    `<feColorMatrix values="${rows.flat().join(" ")}"/></filter></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}#f")`;
}
