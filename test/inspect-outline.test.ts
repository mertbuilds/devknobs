import { describe, expect, test } from "bun:test";
import { createOutline } from "../src/grab/outline";
import type { BoxOverlay } from "../src/grab/overlay";

interface Layer {
  quiet: boolean;
  model: boolean;
  draws: [Element | null, Element[]][];
  areas: (string | null)[];
  destroyed: boolean;
}

/** Every layer made, whether it was asked to be quiet and to draw the box, and what it was told. */
function layers() {
  const made: Layer[] = [];
  const make = (quiet: boolean, model: boolean): BoxOverlay => {
    const layer: Layer = { quiet, model, draws: [], areas: [], destroyed: false };
    made.push(layer);
    return {
      draw: (current, _label, picked) => {
        layer.draws.push([current, picked]);
      },
      point: () => undefined,
      toast: () => undefined,
      area: (ring) => {
        layer.areas.push(ring);
      },
      destroy: () => {
        layer.destroyed = true;
      },
    };
  };
  return { made, make };
}

const button = { tagName: "BUTTON" } as unknown as Element;
const link = { tagName: "A" } as unknown as Element;

describe("the outline", () => {
  test("is grab's gathered box on a quiet layer: no hover box, no label, no glow", () => {
    const { made, make } = layers();
    createOutline(make).show(button);
    expect(made).toHaveLength(1);
    expect(made[0]?.quiet).toBe(true);
    expect(made[0]?.draws).toEqual([[null, [button]]]);
  });

  test("moves to another element on the same layer", () => {
    const { made, make } = layers();
    const outline = createOutline(make);
    outline.show(button);
    outline.show(link);
    expect(made).toHaveLength(1);
    expect(made[0]?.draws[1]).toEqual([null, [link]]);
  });

  test("taken off, takes its layer with it, and makes none for nothing", () => {
    const { made, make } = layers();
    const outline = createOutline(make);
    outline.show(null);
    expect(made).toHaveLength(0);
    outline.show(button);
    outline.show(null);
    expect(made[0]?.destroyed).toBe(true);
    outline.show(link);
    expect(made).toHaveLength(2);
    outline.destroy();
    expect(made[1]?.destroyed).toBe(true);
  });

  test("its layer draws the element's box, one area alone when told, and all four again", () => {
    const { made, make } = layers();
    const outline = createOutline(make);
    // With no element boxed there is no layer to tell.
    outline.area("margin");
    outline.show(button);
    expect(made[0]?.model).toBe(true);
    outline.area("padding");
    outline.area(null);
    expect(made[0]?.areas).toEqual(["padding", null]);
  });
});
