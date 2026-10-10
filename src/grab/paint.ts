import type { Color } from "../engine/color";
import { parseCss } from "./colorvalue";

/**
 * Reads a css color as channels, each text once: by the parser, or for a
 * color it does not know, such as `oklch()`, painted on a pixel of a canvas
 * and read back.
 */
export function createColorReader(): (value: string) => Color | null {
  const colors = new Map<string, Color | null>();
  let context: CanvasRenderingContext2D | null | undefined;

  function paint(value: string): Color | null {
    if (!CSS.supports("color", value)) return null;
    if (context === undefined) {
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      context = canvas.getContext("2d", { willReadFrequently: true });
    }
    if (!context) return null;
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = value;
    context.fillRect(0, 0, 1, 1);
    const [red = 0, green = 0, blue = 0, alpha = 0] = context.getImageData(0, 0, 1, 1).data;
    return { red, green, blue, alpha: alpha / 255 };
  }

  return (value) => {
    let color = colors.get(value);
    if (color === undefined) {
      color = parseCss(value) ?? paint(value);
      colors.set(value, color);
    }
    return color;
  };
}
