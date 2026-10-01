import { describe, expect, test } from "bun:test";
import { fit, label } from "../src/engine/width";

const ROOM = { width: 1200, height: 800 };

describe("fit", () => {
  test("keeps a frame that fits at its own size, centered", () => {
    expect(fit(390, ROOM)).toEqual({ width: 390, height: 800, scale: 1, left: 405 });
  });

  test("fills the room at full width", () => {
    expect(fit("full", ROOM)).toEqual({ width: 1200, height: 800, scale: 1, left: 0 });
  });

  test("scales a wider frame down and makes it taller by as much", () => {
    const place = fit(1600, ROOM);
    expect(place.scale).toBe(0.75);
    expect(place.width).toBe(1600);
    expect(place.height * place.scale).toBe(800);
    expect(place.left).toBe(0);
  });

  test("leaves the scale alone when there is no room to measure", () => {
    expect(fit("full", { width: 0, height: 0 }).scale).toBe(1);
  });
});

describe("label", () => {
  test("names the width, and the scale when the frame is drawn smaller", () => {
    expect(label(fit(390, ROOM))).toBe("390");
    expect(label(fit(1920, ROOM))).toBe("1920 at 63%");
  });
});
