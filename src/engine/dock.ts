import type { PanelValue, SideValue } from "../types";

/**
 * A panel pinned to its side: how much of the window its column takes from
 * the page. The frame and the panel both ask here, so they agree.
 */

/** How wide the panel is until it says otherwise, in px. */
export const DOCK_WIDTH = 240;

/** The narrowest page the column leaves. In a window with less to spare it lies over the page. */
export const PAGE_MIN = 320;

/** The panel as the frame makes room for it. */
export type Docked = Pick<PanelValue, "open" | "side" | "docked">;

let width = DOCK_WIDTH;
const listeners = new Set<() => void>();

/**
 * How wide the panel is now, in px, and so how wide its column is while it is
 * pinned. The one place that says: the stage, the plain frame and the pin's
 * words all read it here.
 */
export function dockWidth(): number {
  return width;
}

/**
 * The panel is `px` wide now, or glides there, as it says each time it takes
 * a width: the rows' or a view's, as its edge sets them. The frame hears, and
 * gives a pinned panel's column that much room. A width that is no size is
 * left out.
 */
export function setDockWidth(px: number): void {
  if (!(px > 0) || px === width) return;
  width = px;
  for (const listener of [...listeners]) listener();
}

/** Hear the panel's width change. Returns the way to stop. */
export function onDockWidth(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** A pinned panel's column as it shows now, its slide and its glide included. */
export interface ColumnEdge {
  /** The px of the window the column covers, from the edge of its side to its edge on the page's side. */
  cover: number;
  /** It is still on its way: sliding out or away, gliding across, or to a new width. */
  moving: boolean;
}

let column: ((side: SideValue, time: number) => ColumnEdge | null) | null = null;

/**
 * The panel says how to read its column where it shows. The frame asks each
 * animation frame the column moves in, with that frame's time, so the panel
 * draws the column for the frame before it is read and the page's edge is the
 * column's. Returns the way to stop.
 */
export function watchColumn(
  read: (side: SideValue, time: number) => ColumnEdge | null,
): () => void {
  column = read;
  return () => {
    if (column === read) column = null;
  };
}

/** The column on `side` as it shows in the frame of `time`, or null with no panel to read. */
export function columnEdge(side: SideValue, time: number): ColumnEdge | null {
  return column?.(side, time) ?? null;
}

/** Does a window `view` px wide leave the page its least beside a pinned panel `column` px wide? */
export function dockRoom(view: number, column: number): boolean {
  return view - column >= PAGE_MIN;
}

/**
 * How much of the window's edge the page gives up, in px: the `column` of an
 * open, pinned panel. In a window too narrow to leave the page `PAGE_MIN`
 * beside it, the panel lies over the page and takes nothing. A closed panel
 * takes nothing either: the page has the whole window back.
 */
export function dockInset(panel: Docked, view: number, column: number): number {
  return panel.docked && panel.open && dockRoom(view, column) ? column : 0;
}

/** The same as the px the frame keeps clear of each side of the window. */
export function dockEdges(panel: Docked, view: number, column: number): Record<SideValue, number> {
  const inset = dockInset(panel, view, column);
  return { left: panel.side === "left" ? inset : 0, right: panel.side === "right" ? inset : 0 };
}
