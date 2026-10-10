/**
 * What the touch cursor's two places share. The touch pointer runs in the
 * frame's copy of the page, but the device's screen is more than that page:
 * the browser's bars and the status bar are drawn over and around the frame
 * by the page above. So the copy hands its cursor up as a mark, and the page
 * above draws it over the whole screen. Where no page above takes the mark,
 * the copy draws the cursor itself.
 */

/** Half the touch cursor, in css px. */
export const RADIUS = 11;

/** The cursor's look, the same wherever it is drawn. Its place and layer are the drawer's. */
export const DOT_LOOK = `
.dot {
  left: 0;
  top: 0;
  width: ${RADIUS * 2}px;
  height: ${RADIUS * 2}px;
  margin: -${RADIUS}px 0 0 -${RADIUS}px;
  pointer-events: none;
  will-change: transform;
}
.dot[hidden] { display: none; }
.dot::after {
  content: "";
  position: absolute;
  inset: 0;
  box-sizing: border-box;
  border-radius: 50%;
  background: rgb(0 0 0 / 0.28);
  border: 1.5px solid rgb(255 255 255 / 0.85);
  box-shadow: 0 0 0 1px rgb(0 0 0 / 0.25);
  transition: transform 80ms ease-out, background-color 80ms ease-out;
}
.dot.pressed::after {
  transform: scale(0.82);
  background: rgb(0 0 0 / 0.45);
}
@media (prefers-reduced-motion: reduce) {
  .dot::after { transition: none; }
}
`;

/** The event the frame's copy sends on its own frame element, which the page above hears at once. */
export const MARK_EVENT = "devknobs-touch-mark";

/** The cursor as the frame's copy has it. */
export interface Mark {
  /** Where it is, in css px of the frame's page, or null while the pointer is not on that page. */
  at: { x: number; y: number } | null;
  pressed: boolean;
  /** The touch pointer is off or paused there, so the mouse is a mouse on the whole screen. */
  held: boolean;
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Read a mark that came from another window. Anything in another shape is null. */
export function readMark(detail: unknown): Mark | null {
  if (typeof detail !== "object" || detail === null) return null;
  const at: unknown = Reflect.get(detail, "at");
  const pressed: unknown = Reflect.get(detail, "pressed");
  const held: unknown = Reflect.get(detail, "held");
  if (typeof pressed !== "boolean" || typeof held !== "boolean") return null;
  if (at === null) return { at: null, pressed, held };
  if (typeof at !== "object") return null;
  const x: unknown = Reflect.get(at, "x");
  const y: unknown = Reflect.get(at, "y");
  return finite(x) && finite(y) ? { at: { x, y }, pressed, held } : null;
}
