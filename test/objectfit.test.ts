import { describe, expect, test } from "bun:test";
import { objectPlace, objectPosition, type Placed } from "../src/engine/objectfit";

/** The Duo's open screen held across, its folded one, and the pictures a full-bleed page shows on each, in px as made. */
const INNER_BOX = { x: 0, y: 0, width: 951, height: 669 };
const COVER_BOX = { x: 0, y: 0, width: 466, height: 678 };
const INNER = { width: 1600, height: 1125 };
const COVER = { width: 774, height: 1125 };

/** A box off the page's corner, so a place that forgets where the box is shows. */
const BOX = { x: 10, y: 20, width: 200, height: 100 };
const WIDE = { width: 800, height: 200 };
const TALL = { width: 100, height: 400 };
const SMALL = { width: 50, height: 20 };

function placed(fit: string, position: string, natural: { width: number; height: number }, box = BOX): Placed {
  const place = objectPlace(fit, position, natural, box);
  if (!place) throw new Error("nothing of the picture shows");
  return place;
}

/** How many of the box's px a px of the picture takes across, and down. */
function scales({ from, to }: Placed): [number, number] {
  return [to.width / from.width, to.height / from.height];
}

/** Each number to a thousandth, so a rect reads as written. */
function near(rect: { x: number; y: number; width: number; height: number }): number[] {
  return [rect.x, rect.y, rect.width, rect.height].map((value) => Math.round(value * 1e3) / 1e3);
}

describe("objectPlace", () => {
  test("cover cuts the picture to the box and never squeezes it, larger or smaller than the box, either way round", () => {
    for (const natural of [WIDE, TALL, SMALL, INNER, COVER]) {
      const place = placed("cover", "50% 50%", natural);
      const [across, down] = scales(place);
      expect(across).toBeCloseTo(down, 9);
      // The whole box is filled.
      expect(near(place.to)).toEqual([10, 20, 200, 100]);
    }
    // Wider than the box: its sides are cut, from the middle.
    expect(near(placed("cover", "50% 50%", WIDE).from)).toEqual([200, 0, 400, 200]);
    // Taller: its top and bottom are.
    expect(near(placed("cover", "50% 50%", TALL).from)).toEqual([0, 175, 100, 50]);
    // Smaller than the box both ways: made larger, then cut the same way.
    expect(near(placed("cover", "50% 50%", SMALL).from)).toEqual([5, 0, 40, 20]);
  });

  test("the Duo's folded picture on its open screen is cut top and bottom, not drawn 2.07 times as wide as it is tall", () => {
    const place = placed("cover", "50% 50%", COVER, INNER_BOX);
    const [across, down] = scales(place);
    expect(across).toBeCloseTo(951 / 774, 9);
    expect(down).toBeCloseTo(across, 9);
    expect(near(place.from)).toEqual([0, 290.257, 774, 544.486]);
    // Drawn over the box whole, as a canvas does by itself, it is 1600 / 774 times as wide as the open screen's own picture, and as tall.
    const whole = placed("fill", "50% 50%", COVER, INNER_BOX);
    const own = placed("cover", "50% 50%", INNER, INNER_BOX);
    expect(scales(whole)[0] / scales(own)[0]).toBeCloseTo(1600 / 774, 2);
    expect(scales(whole)[1] / scales(own)[1]).toBeCloseTo(1, 2);
    // Each screen's own picture is as wide for its height as the screen, to a px, so it shows whole.
    expect(near(own.from).map(Math.round)).toEqual([0, 0, 1599, 1125]);
    expect(near(placed("cover", "50% 50%", COVER, COVER_BOX).from).map(Math.round)).toEqual([0, 0, 773, 1125]);
  });

  test("contain shows the whole picture, with room left across or down", () => {
    for (const natural of [WIDE, TALL, SMALL]) {
      const place = placed("contain", "50% 50%", natural);
      expect(scales(place)[0]).toBeCloseTo(scales(place)[1], 9);
      expect(near(place.from)).toEqual([0, 0, natural.width, natural.height]);
    }
    expect(near(placed("contain", "50% 50%", WIDE).to)).toEqual([10, 45, 200, 50]);
    expect(near(placed("contain", "50% 50%", TALL).to)).toEqual([97.5, 20, 25, 100]);
    expect(near(placed("contain", "50% 50%", SMALL).to)).toEqual([10, 30, 200, 80]);
  });

  test("fill stretches the whole picture over the box, with no room left for a share to put it in", () => {
    for (const position of ["50% 50%", "0% 100%", "left top"]) {
      const place = placed("fill", position, WIDE);
      expect(near(place.from)).toEqual([0, 0, 800, 200]);
      expect(near(place.to)).toEqual([10, 20, 200, 100]);
    }
    // A length still moves it, and what leaves the box is cut.
    const moved = placed("fill", "30px 10px", WIDE);
    expect(near(moved.from)).toEqual([0, 0, 680, 180]);
    expect(near(moved.to)).toEqual([40, 30, 170, 90]);
    // What is no fit at all is the browser's own, fill.
    expect(placed("", "50% 50%", WIDE)).toEqual(placed("fill", "50% 50%", WIDE));
  });

  test("none keeps the picture's own size: cut where it is larger, with room where it is smaller", () => {
    expect(near(placed("none", "50% 50%", WIDE).from)).toEqual([300, 50, 200, 100]);
    expect(near(placed("none", "50% 50%", WIDE).to)).toEqual([10, 20, 200, 100]);
    expect(near(placed("none", "50% 50%", TALL).from)).toEqual([0, 150, 100, 100]);
    expect(near(placed("none", "50% 50%", TALL).to)).toEqual([60, 20, 100, 100]);
    expect(near(placed("none", "50% 50%", SMALL).from)).toEqual([0, 0, 50, 20]);
    expect(near(placed("none", "50% 50%", SMALL).to)).toEqual([85, 60, 50, 20]);
    expect(scales(placed("none", "50% 50%", WIDE))).toEqual([1, 1]);
  });

  test("scale-down is contain for a picture larger than the box, and none for a smaller one", () => {
    expect(placed("scale-down", "50% 50%", WIDE)).toEqual(placed("contain", "50% 50%", WIDE));
    expect(placed("scale-down", "50% 50%", TALL)).toEqual(placed("contain", "50% 50%", TALL));
    expect(placed("scale-down", "50% 50%", SMALL)).toEqual(placed("none", "50% 50%", SMALL));
  });

  test("puts the picture by percentages: a share of the room left over, or of what is cut", () => {
    // Cut: the left of the picture, its right, a quarter of the way.
    expect(near(placed("cover", "0% 0%", WIDE).from)).toEqual([0, 0, 400, 200]);
    expect(near(placed("cover", "100% 100%", WIDE).from)).toEqual([400, 0, 400, 200]);
    expect(near(placed("cover", "25% 75%", WIDE).from)).toEqual([100, 0, 400, 200]);
    expect(near(placed("cover", "25% 75%", TALL).from)).toEqual([0, 262.5, 100, 50]);
    // Room left over: the top, the bottom, three quarters of the way down.
    expect(near(placed("contain", "0% 0%", WIDE).to)).toEqual([10, 20, 200, 50]);
    expect(near(placed("contain", "100% 100%", WIDE).to)).toEqual([10, 70, 200, 50]);
    expect(near(placed("contain", "25% 75%", WIDE).to)).toEqual([10, 57.5, 200, 50]);
    expect(near(placed("contain", "25% 75%", TALL).to)).toEqual([53.75, 20, 25, 100]);
  });

  test("puts it by lengths from the box's top left, and shows only what stays in the box", () => {
    expect(near(placed("none", "30px 10px", SMALL).to)).toEqual([40, 30, 50, 20]);
    // Pushed out past the left and the top: the part still in the box, from the picture's own px that land there.
    const out = placed("none", "-20px -5px", SMALL);
    expect(near(out.to)).toEqual([10, 20, 30, 15]);
    expect(near(out.from)).toEqual([20, 5, 30, 15]);
    // Past the right and the bottom.
    const far = placed("none", "170px 90px", SMALL);
    expect(near(far.to)).toEqual([180, 110, 30, 10]);
    expect(near(far.from)).toEqual([0, 0, 30, 10]);
    // And a length on a picture made smaller, in the box's px.
    expect(near(placed("contain", "50% 10px", WIDE).to)).toEqual([10, 30, 200, 50]);
  });

  test("puts it by the edges' names, with or without a way in from them, and by a sum of a share and a length", () => {
    expect(placed("contain", "left top", TALL)).toEqual(placed("contain", "0% 0%", TALL));
    expect(placed("contain", "right bottom", TALL)).toEqual(placed("contain", "100% 100%", TALL));
    expect(placed("contain", "center", TALL)).toEqual(placed("contain", "50% 50%", TALL));
    expect(placed("contain", "bottom", WIDE)).toEqual(placed("contain", "50% 100%", WIDE));
    expect(near(placed("none", "right 10px bottom 20px", SMALL).to)).toEqual([150, 80, 50, 20]);
    expect(placed("none", "calc(100% - 10px) calc(100% - 20px)", SMALL)).toEqual(placed("none", "right 10px bottom 20px", SMALL));
  });

  test("shows nothing where the picture has no size, the box has none, or the picture is put outside it", () => {
    expect(objectPlace("cover", "50% 50%", { width: 0, height: 20 }, BOX)).toBeNull();
    expect(objectPlace("cover", "50% 50%", SMALL, { ...BOX, height: 0 })).toBeNull();
    expect(objectPlace("none", "300px 0px", SMALL, BOX)).toBeNull();
    expect(objectPlace("none", "0px -40px", SMALL, BOX)).toBeNull();
  });
});

describe("objectPosition", () => {
  const at = (share: number, px = 0) => ({ share, px });

  test("reads it as it computes: two percentages, lengths, or a sum of both", () => {
    expect(objectPosition("50% 50%")).toEqual([at(0.5), at(0.5)]);
    expect(objectPosition("0% 100%")).toEqual([at(0), at(1)]);
    expect(objectPosition("12px 25%")).toEqual([at(0, 12), at(0.25)]);
    expect(objectPosition("-4.5px 0px")).toEqual([at(0, -4.5), at(0, 0)]);
    expect(objectPosition("calc(100% - 10px) calc(25% + 2px)")).toEqual([at(1, -10), at(0.25, 2)]);
  });

  test("reads it as it is written: edges by name in either order, one word, and ways in from an edge", () => {
    expect(objectPosition("center")).toEqual([at(0.5), at(0.5)]);
    expect(objectPosition("left")).toEqual([at(0), at(0.5)]);
    expect(objectPosition("top")).toEqual([at(0.5), at(0)]);
    expect(objectPosition("30%")).toEqual([at(0.3), at(0.5)]);
    expect(objectPosition("top right")).toEqual([at(1), at(0)]);
    expect(objectPosition("center bottom")).toEqual([at(0.5), at(1)]);
    expect(objectPosition("20% bottom")).toEqual([at(0.2), at(1)]);
    // Two words are one for each axis: the second is no way in from the first.
    expect(objectPosition("left 20%")).toEqual([at(0), at(0.2)]);
    expect(objectPosition("right 10px bottom 20%")).toEqual([at(1, -10), at(0.8)]);
    expect(objectPosition("left 10px center")).toEqual([at(0, 10), at(0.5)]);
  });

  test("is the middle where it cannot be read, as the browser starts", () => {
    expect(objectPosition("")).toEqual([at(0.5), at(0.5)]);
    expect(objectPosition("nonsense words")).toEqual([at(0.5), at(0.5)]);
  });
});
