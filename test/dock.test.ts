import { afterEach, describe, expect, test } from "bun:test";
import {
  columnEdge,
  DOCK_WIDTH,
  dockEdges,
  dockInset,
  dockRoom,
  dockWidth,
  onDockWidth,
  PAGE_MIN,
  setDockWidth,
  watchColumn,
} from "../src/engine/dock";

const OPEN = { open: true, side: "right", docked: true } as const;

afterEach(() => {
  setDockWidth(DOCK_WIDTH);
});

describe("dockWidth", () => {
  test("is the panel's 240 until the panel says otherwise", () => {
    expect(DOCK_WIDTH).toBe(240);
    expect(dockWidth()).toBe(240);
  });

  test("is what the panel last said, and tells who listens, once for each change", () => {
    let heard = 0;
    const stop = onDockWidth(() => heard++);
    setDockWidth(340);
    expect(dockWidth()).toBe(340);
    expect(heard).toBe(1);
    setDockWidth(340);
    expect(heard).toBe(1);
    setDockWidth(280.5);
    expect(dockWidth()).toBe(280.5);
    expect(heard).toBe(2);
    stop();
    setDockWidth(240);
    expect(heard).toBe(2);
  });

  test("keeps the last width for one that is no size, as before the panel is on the page", () => {
    let heard = 0;
    const stop = onDockWidth(() => heard++);
    for (const px of [0, -4, Number.NaN]) setDockWidth(px);
    expect(dockWidth()).toBe(240);
    expect(heard).toBe(0);
    stop();
  });
});

describe("columnEdge", () => {
  test("is what the panel reads of its column on the side asked for, and nothing with no panel", () => {
    expect(columnEdge("right")).toBeNull();
    const asked: string[] = [];
    const stop = watchColumn((side) => {
      asked.push(side);
      return { cover: side === "left" ? 120 : 96, moving: true };
    });
    expect(columnEdge("right")).toEqual({ cover: 96, moving: true });
    expect(columnEdge("left")).toEqual({ cover: 120, moving: true });
    expect(asked).toEqual(["right", "left"]);
    stop();
    expect(columnEdge("right")).toBeNull();
  });

  test("keeps a later panel's way to read when an earlier one stops", () => {
    const stopFirst = watchColumn(() => ({ cover: 1, moving: false }));
    const stopSecond = watchColumn(() => ({ cover: 2, moving: false }));
    stopFirst();
    expect(columnEdge("left")?.cover).toBe(2);
    stopSecond();
    expect(columnEdge("left")).toBeNull();
  });
});

describe("dockRoom", () => {
  test("is there while the page keeps its least beside the column", () => {
    expect(PAGE_MIN).toBe(320);
    expect(dockRoom(1440, 240)).toBe(true);
    expect(dockRoom(560, 240)).toBe(true);
    expect(dockRoom(559, 240)).toBe(false);
    expect(dockRoom(660, 340)).toBe(true);
    expect(dockRoom(659, 340)).toBe(false);
    expect(dockRoom(0, 240)).toBe(false);
    expect(dockRoom(Number.NaN, 240)).toBe(false);
  });
});

describe("dockInset", () => {
  test("is the panel's column, as wide as the panel is, while it is pinned and open", () => {
    expect(dockInset(OPEN, 1440, 240)).toBe(240);
    expect(dockInset({ ...OPEN, side: "left" }, 1440, 240)).toBe(240);
    expect(dockInset(OPEN, 1440, 340)).toBe(340);
    expect(dockInset(OPEN, 1440, 412.5)).toBe(412.5);
  });

  test("is nothing for a floating panel, which lies over the page", () => {
    expect(dockInset({ ...OPEN, docked: false }, 1440, 240)).toBe(0);
  });

  test("is nothing while the pinned panel is closed: the page has the window back", () => {
    expect(dockInset({ ...OPEN, open: false }, 1440, 240)).toBe(0);
  });

  test("leaves the panel over the page in a window too narrow for both", () => {
    expect(dockInset(OPEN, 560, 240)).toBe(240);
    expect(dockInset(OPEN, 559, 240)).toBe(0);
    expect(dockInset(OPEN, 600, 340)).toBe(0);
    expect(dockInset(OPEN, 0, 240)).toBe(0);
  });

  test("never leaves the page less than its least, at any width of either", () => {
    for (let view = 0; view <= 1600; view += 7) {
      for (const column of [240, 340, 520]) {
        const inset = dockInset(OPEN, view, column);
        expect([0, column]).toContain(inset);
        if (inset > 0) expect(view - inset).toBeGreaterThanOrEqual(PAGE_MIN);
      }
    }
  });
});

describe("dockEdges", () => {
  test("is the inset on the panel's side, and nothing on the other", () => {
    expect(dockEdges(OPEN, 1440, 240)).toEqual({ left: 0, right: 240 });
    expect(dockEdges({ ...OPEN, side: "left" }, 1440, 340)).toEqual({ left: 340, right: 0 });
    expect(dockEdges({ ...OPEN, open: false }, 1440, 240)).toEqual({ left: 0, right: 0 });
    expect(dockEdges(OPEN, 500, 240)).toEqual({ left: 0, right: 0 });
  });
});
