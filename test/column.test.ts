import { describe, expect, test } from "bun:test";
import { readColumn } from "../src/ui/column";

/** A transition on its way, as far as it is told from any other animation. */
const transition = (property: string) => ({ transitionProperty: property });

/** The wrapper or the panel, with what is on its way on it, and for the panel where it shows. */
function node(animations: object[], box = { left: 0, right: 0 }) {
  const order: string[] = [];
  return {
    order,
    getAnimations: () => {
      order.push("animations");
      return animations;
    },
    getBoundingClientRect: () => {
      order.push("box");
      return box;
    },
  };
}

describe("readColumn", () => {
  test("covers the window from the column's page edge to the edge of its side", () => {
    const wrap = node([]);
    expect(readColumn(wrap, node([], { left: 1360, right: 1600 }), "right", 1600).cover).toBe(240);
    expect(readColumn(wrap, node([], { left: 0, right: 340 }), "left", 1600).cover).toBe(340);
    // Halfway out, and halfway across to the left.
    expect(readColumn(wrap, node([], { left: 1480.5, right: 1720.5 }), "right", 1600).cover).toBe(119.5);
    expect(readColumn(wrap, node([], { left: 680, right: 920 }), "left", 1600).cover).toBe(920);
    // Off its edge it covers nothing, or less.
    expect(readColumn(wrap, node([], { left: 1621, right: 1861 }), "right", 1600).cover).toBe(-21);
  });

  test("is on its way while the wrapper slides or glides, or the panel changes its width", () => {
    const still = node([], { left: 1360, right: 1600 });
    expect(readColumn(node([]), still, "right", 1600).moving).toBe(false);
    expect(readColumn(node([transition("transform")]), still, "right", 1600).moving).toBe(true);
    expect(readColumn(node([transition("translate")]), still, "right", 1600).moving).toBe(true);
    const growing = node([transition("width")], { left: 1300, right: 1600 });
    expect(readColumn(node([]), growing, "right", 1600).moving).toBe(true);
  });

  test("is at rest whatever else eases on it: a border, a hidden handle, the grow into a column", () => {
    const wrap = node([transition("visibility")]);
    const panel = node(
      [transition("visibility"), transition("border-right-color"), { effect: {} }],
      { left: 1360, right: 1600 },
    );
    expect(readColumn(wrap, panel, "right", 1600).moving).toBe(false);
    // The wrapper's width is not the column's, and the panel does not slide.
    expect(readColumn(node([transition("width")]), node([transition("transform")]), "left", 1600).moving).toBe(false);
  });

  test("reads the box before the transitions, so one only asked for has started", () => {
    const panel = node([transition("width")]);
    readColumn(node([]), panel, "right", 1600);
    expect(panel.order).toEqual(["box", "animations"]);
  });
});
