import { describe, expect, test } from "bun:test";
import {
  dialogOpened,
  flings,
  inertiaStep,
  panOf,
  passedSlop,
  pickScroller,
  raises,
  type ScrollNode,
  SLOP,
  topLayerOf,
  velocityOf,
} from "../src/engine/touchpointer";

/** An element with room to scroll its content the ways named. */
function node(room: string, touchAction = "auto"): ScrollNode {
  return {
    touchAction,
    left: room.includes("l"),
    right: room.includes("r"),
    up: room.includes("u"),
    down: room.includes("d"),
  };
}

describe("touch pointer", () => {
  test("a press stays a tap until it moves past the slop", () => {
    expect(SLOP).toBe(10);
    expect(passedSlop(0, 0)).toBe(false);
    expect(passedSlop(6, 8)).toBe(false);
    expect(passedSlop(7, 8)).toBe(true);
    expect(passedSlop(0, -11)).toBe(true);
  });

  test("reads the ways a touch-action lets a finger pan", () => {
    expect(panOf("auto")).toEqual({ x: true, y: true });
    expect(panOf("")).toEqual({ x: true, y: true });
    expect(panOf("manipulation")).toEqual({ x: true, y: true });
    expect(panOf("none")).toEqual({ x: false, y: false });
    expect(panOf("pan-x")).toEqual({ x: true, y: false });
    expect(panOf("pan-y pinch-zoom")).toEqual({ x: false, y: true });
    expect(panOf("pan-left pan-down")).toEqual({ x: true, y: true });
    expect(panOf("pinch-zoom")).toEqual({ x: false, y: false });
  });

  test("scrolls the nearest element with room the way the content goes", () => {
    const chain = [node(""), node("lr"), node("ud")];
    // The finger goes up, so the content goes down: the page scrolls, not the carousel.
    expect(pickScroller(chain, { x: 0, y: 40 })).toEqual({ index: 2, x: false, y: true });
    expect(pickScroller(chain, { x: 30, y: 2 })).toEqual({ index: 1, x: true, y: false });
  });

  test("passes over a scroller at its end that way", () => {
    const chain = [node("d"), node("ud")];
    expect(pickScroller(chain, { x: 0, y: -20 })).toEqual({ index: 1, x: false, y: true });
    expect(pickScroller(chain, { x: 0, y: 20 })).toEqual({ index: 0, x: false, y: true });
  });

  test("scrolls both axes where the scroller has both and the move goes both ways", () => {
    expect(pickScroller([node("lrud")], { x: 20, y: 20 })).toEqual({ index: 0, x: true, y: true });
  });

  test("keeps to the touch-action of every element on the way up", () => {
    expect(pickScroller([node("", "none"), node("ud")], { x: 0, y: 20 })).toBeNull();
    expect(pickScroller([node("", "pan-x"), node("ud")], { x: 0, y: 20 })).toBeNull();
    expect(pickScroller([node("", "pan-y"), node("lrud")], { x: 0, y: 20 })).toEqual({
      index: 1,
      x: false,
      y: true,
    });
    expect(pickScroller([node("ud")], { x: 0, y: 0 })).toBeNull();
    expect(pickScroller([node("lr")], { x: 0, y: 20 })).toBeNull();
  });

  test("measures the release over the last 100 ms", () => {
    const samples = [
      { t: 0, x: 0, y: 0 },
      { t: 100, x: 0, y: 0 },
      { t: 150, x: 0, y: 50 },
      { t: 200, x: 0, y: 100 },
    ];
    expect(velocityOf(samples, 200)).toEqual({ x: 0, y: 1 });
    // A finger that rested before it let go flings nothing.
    expect(velocityOf(samples, 400)).toEqual({ x: 0, y: 0 });
    expect(velocityOf([], 0)).toEqual({ x: 0, y: 0 });
    expect(velocityOf([{ t: 5, x: 1, y: 1 }], 5)).toEqual({ x: 0, y: 0 });
  });

  test("a fling slows down and stops", () => {
    expect(flings({ x: 0, y: 0.05 })).toBe(false);
    expect(flings({ x: 0, y: 1 })).toBe(true);
    let velocity = { x: 0, y: 2 };
    let travelled = 0;
    let frames = 0;
    for (; frames < 1000; frames++) {
      const step = inertiaStep(velocity, 16);
      expect(Math.abs(step.velocity.y)).toBeLessThan(Math.abs(velocity.y));
      travelled += step.move.y;
      velocity = step.velocity;
      if (step.done) break;
    }
    expect(frames).toBeLessThan(200);
    // The whole fling goes about the speed times the decay.
    expect(travelled).toBeGreaterThan(600);
    expect(travelled).toBeLessThan(650);
  });

  test("a fling step over no time goes nowhere", () => {
    const step = inertiaStep({ x: 1, y: -1 }, 0);
    expect(Math.hypot(step.move.x, step.move.y)).toBe(0);
    expect(step.velocity).toEqual({ x: 1, y: -1 });
  });

  test("goes over a popover or a dialog that opens, not over its own host or a details", () => {
    expect(raises({ newState: "open", tag: "DIV", own: false })).toBe(true);
    expect(raises({ newState: "open", tag: "DIALOG", own: false })).toBe(true);
    expect(raises({ newState: "closed", tag: "DIV", own: false })).toBe(false);
    expect(raises({ newState: "open", tag: "DIV", own: true })).toBe(false);
    expect(raises({ newState: "open", tag: "DETAILS", own: false })).toBe(false);
    // A toggle event from before it told its new state.
    expect(raises({ newState: undefined, tag: "DIV", own: false })).toBe(false);
  });

  test("reads a dialog that opens from its open attribute", () => {
    expect(dialogOpened({ tag: "DIALOG", was: null, open: true })).toBe(true);
    expect(dialogOpened({ tag: "dialog", was: null, open: true })).toBe(true);
    expect(dialogOpened({ tag: "DIALOG", was: "", open: true })).toBe(false);
    expect(dialogOpened({ tag: "DIALOG", was: "", open: false })).toBe(false);
    expect(dialogOpened({ tag: "DETAILS", was: null, open: true })).toBe(false);
  });

  test("picks the first thing on a path that is in the top layer", () => {
    const isUpper = (node: unknown): node is string =>
      typeof node === "string" && node === node.toUpperCase();
    expect(topLayerOf(["a", "B", "c", "D"], isUpper)).toBe("B");
    expect(topLayerOf(["a", 1, null], isUpper)).toBeNull();
    expect(topLayerOf([], isUpper)).toBeNull();
  });
});
