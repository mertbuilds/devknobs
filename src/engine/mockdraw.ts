import { svgNode } from "./browserkit";
import type { Mock, Radius, Rect } from "./mock";

/** The front glass of a mock, near black, and the band around it a little lighter. */
const BODY = "#111112";
const EDGE = "#48484a";
/** A home button's ring, a lens's rim and a receiver slot's grille, just off the glass. */
const RIM = "#2a2a2c";

/** How much of the band shows around the front glass, in css px of the screen. */
const BAND = 2.5;

/** A device's body over the frame, drawn by `drawMock`, in the letterbox's shadow root. */
export const MOCK_CSS = `
/* Clips the frame to the screen's corners in a mock, in the body's color so
   no blue shows at the seam. */
.glass.mocked {
  position: absolute;
  overflow: hidden;
  background: ${BODY};
}
/* Over the frame, and never in the way of a pointer. */
.mock {
  position: absolute;
  top: 0;
  left: 0;
  overflow: visible;
  pointer-events: none;
}
.mock .band { fill: ${EDGE}; fill-rule: evenodd; }
.mock .body { fill: ${BODY}; fill-rule: evenodd; }
.mock .button { fill: ${EDGE}; }
.mock .sensor { fill: #000; }
.mock .slot { fill: ${RIM}; }
.mock .lens { fill: #000; stroke: ${RIM}; stroke-width: 1; }
.mock .home { fill: ${RIM}; }
.mock .key { fill: ${BODY}; }`;

/** The radius of each corner, from the top left round by the right, `by` added to each. */
export function corners(radius: Radius, by = 0): [number, number, number, number] {
  const [a, b, c, d] = typeof radius === "number" ? [radius, radius, radius, radius] : radius;
  return [a + by, b + by, c + by, d + by];
}

/** A rounded rect as path data. */
function roundRect(rect: Rect, radius: Radius): string {
  const { x, y, width, height } = rect;
  const [a, b, c, d] = corners(radius).map((r) => Math.max(0, Math.min(r, width / 2, height / 2)));
  const arc = (r = 0) => `A${r} ${r} 0 0 1`;
  return [
    `M${x + a} ${y}H${x + width - b}${arc(b)} ${x + width} ${y + b}`,
    `V${y + height - c}${arc(c)} ${x + width - c} ${y + height}`,
    `H${x + d}${arc(d)} ${x} ${y + height - d}`,
    `V${y + a}${arc(a)} ${x + a} ${y}Z`,
  ].join("");
}

/**
 * The device's body, in css px of the frame: the buttons under it, the band,
 * the front glass inside it with the screen cut out, and the island, holes,
 * lens, slot and home button on top.
 */
export function drawMock(
  mock: Mock,
  screenSize: { width: number; height: number },
  href: string | null,
): SVGSVGElement {
  const svg = svgNode("svg", {
    class: "mock",
    viewBox: `0 0 ${mock.width} ${mock.height}`,
    "aria-hidden": "true",
  });
  // A picture is the whole body, island and buttons too.
  if (mock.image && href) {
    const { x, y, width, height, turn } = mock.image;
    const image = svgNode("image", { href, x, y, width, height });
    if (turn !== null) image.setAttribute("transform", `matrix(0 -1 1 0 0 ${turn})`);
    svg.append(image);
    return svg;
  }
  const part = (shape: Mock["parts"][number]) =>
    svgNode("rect", {
      class: shape.kind,
      x: shape.x,
      y: shape.y,
      width: shape.width,
      height: shape.height,
      rx: shape.radius,
    });
  const opening = { x: mock.inset.left, y: mock.inset.top, ...screenSize };
  const { x, y, width, height } = mock.body;
  const front = { x: x + BAND, y: y + BAND, width: width - 2 * BAND, height: height - 2 * BAND };
  const inside = roundRect(front, corners(mock.bodyRadius, -BAND));
  svg.append(
    ...mock.parts.filter((shape) => shape.kind === "button").map(part),
    svgNode("path", { class: "band", d: roundRect(mock.body, mock.bodyRadius) + inside }),
    svgNode("path", { class: "body", d: inside + roundRect(opening, mock.screenRadius) }),
    ...mock.parts.filter((shape) => shape.kind !== "button").map(part),
  );
  return svg;
}
