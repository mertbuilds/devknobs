/**
 * The box of the element the styles view shows, as the browsers draw one:
 * its margin, border, padding and content one inside the other, each with
 * its name and the length of its four sides, and around them its offsets
 * where the element is positioned. It is content of the view, a picture of
 * the element, so its areas are filled, in the hues the page's own tints
 * have. To use it:
 *
 *   const diagram = createBoxDiagram((ring) => inspect.area(ring));
 *   fold.body.append(diagram.node); diagram.show(readBox(element)); diagram.fit(width);
 *
 * It is built once, and a new box only changes its text. Where it is too
 * narrow for the lengths to stand in their areas, they leave them, and the
 * four of the area the pointer or the focus is on stand in a line under it.
 */

import {
  type BoxModel,
  type BoxRing,
  boxModel,
  contentSize,
  SIDES,
  type Side,
} from "../grab/boxmodel";
import { boxValue, sizeText } from "../grab/boxtext";
import { el } from "./dom";

/** An element's box as the diagram shows it: what its style says, and the size of its content. */
export interface BoxReading {
  model: BoxModel;
  width: number;
  height: number;
}

/** Read an element's box, the device frame's page's too. Null for one that left its window. */
export function readBox(element: Element): BoxReading | null {
  const view = element.ownerDocument.defaultView;
  if (!view || !element.isConnected) return null;
  const style = view.getComputedStyle(element);
  const model = boxModel(style);
  return { model, ...contentSize(model, style, element.getBoundingClientRect()) };
}

/** The areas of the diagram, from the outside in: the offsets, then the box's own. */
export const DIAGRAM_RINGS = ["position", "margin", "border", "padding"] as const;

export type DiagramRing = (typeof DIAGRAM_RINGS)[number];

/** The least a column of side lengths is wide, and the width of one character in it, in px. */
const COLUMN = 22;
const CHAR = 6.5;
/** The room a length keeps around it in its column, in px. */
const ROOM = 8;
/** The least the content is wide for an area's name and its top length to clear each other, in px. */
const CONTENT = 120;

function lengths(reading: BoxReading, ring: DiagramRing): Record<Side, number | null> | null {
  return ring === "position" ? reading.model.offsets : reading.model[ring];
}

/** The lengths of an area by side, as text. Null for the offsets of an element that has none. */
export function ringValues(reading: BoxReading, ring: DiagramRing): Record<Side, string> | null {
  const found = lengths(reading, ring);
  if (!found) return null;
  return {
    top: boxValue(found.top),
    right: boxValue(found.right),
    bottom: boxValue(found.bottom),
    left: boxValue(found.left),
  };
}

/**
 * The width the diagram needs for every length to stand in its area with no
 * two of them meeting, in px: a column at each side of each area as wide as
 * its text, and the content between them.
 */
export function diagramNeeds(reading: BoxReading): number {
  const column = (text: string) => Math.max(COLUMN, text.length * CHAR + ROOM);
  let needs = Math.max(CONTENT, sizeText(reading.width, reading.height).length * CHAR + ROOM);
  for (const ring of DIAGRAM_RINGS) {
    const values = ringValues(reading, ring);
    if (values) needs += column(values.left) + column(values.right);
  }
  return needs;
}

/** What is said of the box under the diagram: how it is sized and laid out, and placed where it is. */
export function boxFacts(model: BoxModel): string[] {
  const facts = [`box-sizing: ${model.boxSizing}`, `display: ${model.display}`];
  if (model.position !== "static") facts.push(`position: ${model.position}`);
  return facts;
}

export interface BoxDiagram {
  node: HTMLElement;
  /** Show a box, or with null nothing. */
  show(reading: BoxReading | null): void;
  /** Say how wide the diagram is, in px, so it knows whether its lengths fit. */
  fit(width: number): void;
}

interface RingNodes {
  node: HTMLElement;
  values: Record<Side, HTMLElement>;
}

function say(node: HTMLElement, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}

/**
 * Build the diagram. `onArea` hears the area the pointer or the focus is on,
 * to draw that one alone on the page, and null once it is on none. The
 * offsets are no area of the box, so on them it hears null.
 */
export function createBoxDiagram(onArea: (ring: BoxRing | null) => void): BoxDiagram {
  const node = el("div", "box-model");
  const size = el("div", "bm-ring bm-content");
  const line = el("div", "bm-line");
  const lineName = el("span", "bm-name");
  const lineValues = el("span", "bm-values");
  line.append(lineName, lineValues);
  const facts = el("div", "bm-facts");
  const rings = new Map<DiagramRing, RingNodes>();
  let reading: BoxReading | null = null;
  let width = Number.POSITIVE_INFINITY;
  /** The area the pointer is on and the one the focus is on. The focus has the say. */
  let hovered: DiagramRing | "content" | null = null;
  let focused: DiagramRing | "content" | null = null;
  /** The area whose lengths the line under a narrow diagram shows: the last one that was on. */
  let told: DiagramRing = "margin";

  function active(): DiagramRing | "content" | null {
    return focused ?? hovered;
  }

  function drawLine(): void {
    const values = reading ? ringValues(reading, told) : null;
    const shown = values ?? (reading ? ringValues(reading, "margin") : null);
    say(lineName, values ? told : "margin");
    say(lineValues, shown ? SIDES.map((side) => shown[side]).join("  ") : "");
  }

  function changed(): void {
    const now = active();
    if (now && now !== "content") told = now;
    onArea(now === null || now === "position" ? null : now);
    drawLine();
  }

  /** An area hears the pointer and the focus. Leaving one for the area around it is on that one. */
  function listen(area: HTMLElement, name: DiagramRing | "content", around: DiagramRing | null) {
    area.tabIndex = 0;
    area.setAttribute("role", "group");
    area.addEventListener("pointerenter", () => {
      hovered = name;
      changed();
    });
    area.addEventListener("pointerleave", () => {
      hovered = around;
      changed();
    });
    area.addEventListener("focus", () => {
      focused = name;
      changed();
    });
    area.addEventListener("blur", () => {
      focused = null;
      changed();
    });
  }

  // Built from the inside out, each area around the one before.
  let inner = size;
  listen(size, "content", "padding");
  for (const ring of [...DIAGRAM_RINGS].reverse()) {
    const area = el("div", `bm-ring bm-${ring}`);
    const values = {
      top: el("span", "bm-v bm-top"),
      right: el("span", "bm-v bm-right"),
      bottom: el("span", "bm-v bm-bottom"),
      left: el("span", "bm-v bm-left"),
    };
    const name = el("span", "bm-name", ring);
    name.setAttribute("aria-hidden", "true");
    area.append(name, values.top, values.left, inner, values.right, values.bottom);
    const around = DIAGRAM_RINGS[DIAGRAM_RINGS.indexOf(ring) - 1] ?? null;
    listen(area, ring, around);
    rings.set(ring, { node: area, values });
    inner = area;
  }
  node.append(inner, line, facts);
  node.setAttribute("role", "group");
  node.setAttribute("aria-label", "box model");

  function narrow(): void {
    node.classList.toggle("narrow", reading !== null && diagramNeeds(reading) > width);
  }

  function show(next: BoxReading | null): void {
    reading = next;
    if (!next) return;
    for (const ring of DIAGRAM_RINGS) {
      const parts = rings.get(ring);
      if (!parts) continue;
      const values = ringValues(next, ring);
      // The offsets stay around the box with nothing in them, and off the tab key's way.
      parts.node.classList.toggle("off", values === null);
      parts.node.tabIndex = values === null ? -1 : 0;
      for (const side of SIDES) say(parts.values[side], values ? values[side] : "");
      const sides = values ? SIDES.map((side) => `${side} ${values[side]}`).join(", ") : "";
      parts.node.setAttribute("aria-label", values ? `${ring}: ${sides}` : ring);
    }
    const sized = sizeText(next.width, next.height);
    say(size, sized);
    size.setAttribute("aria-label", `content: ${sized}`);
    facts.replaceChildren(...boxFacts(next.model).map((fact) => el("span", "bm-fact", fact)));
    if (told === "position" && !next.model.offsets) told = "margin";
    drawLine();
    narrow();
  }

  return {
    node,
    show,
    fit(next) {
      width = next;
      narrow();
    },
  };
}
