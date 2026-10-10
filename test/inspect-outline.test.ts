import { describe, expect, test } from "bun:test";
import { createOutline } from "../src/grab/outline";
import type { Overlay } from "../src/grab/overlay";

/** Every layer made, whether it was asked to be quiet, and what it was told. */
function layers() {
  const made: { quiet: boolean; draws: [Element | null, Element[]][]; destroyed: boolean }[] = [];
  const make = (quiet: boolean): Overlay => {
    const layer = { quiet, draws: [] as [Element | null, Element[]][], destroyed: false };
    made.push(layer);
    return {
      draw: (current, _label, picked) => {
        layer.draws.push([current, picked]);
      },
      point: () => undefined,
      toast: () => undefined,
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
});
