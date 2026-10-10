import { describe, expect, test } from "bun:test";
import {
  alignQuads,
  type BoxStyle,
  boxModel,
  contentSize,
  hasBox,
  isPlain,
  oneQuad,
  pxOf,
  type Quad,
  rectQuad,
  ringPath,
  ringPaths,
  ringQuads,
  ringRects,
} from "../src/grab/boxmodel";
import { boxValue, shorthand, short, sizeText, tidy } from "../src/grab/boxtext";

/** A computed style with no margin, border, padding or position, and what a test sets over that. */
function style(over: Partial<BoxStyle> = {}): BoxStyle {
  return {
    marginTop: "0px",
    marginRight: "0px",
    marginBottom: "0px",
    marginLeft: "0px",
    borderTopWidth: "0px",
    borderRightWidth: "0px",
    borderBottomWidth: "0px",
    borderLeftWidth: "0px",
    paddingTop: "0px",
    paddingRight: "0px",
    paddingBottom: "0px",
    paddingLeft: "0px",
    top: "auto",
    right: "auto",
    bottom: "auto",
    left: "auto",
    boxSizing: "content-box",
    display: "block",
    position: "static",
    ...over,
  };
}

const button = style({
  marginTop: "8px",
  marginRight: "16px",
  marginBottom: "4px",
  marginLeft: "2px",
  borderTopWidth: "1px",
  borderRightWidth: "2px",
  borderBottomWidth: "3px",
  borderLeftWidth: "4px",
  paddingTop: "10px",
  paddingRight: "20px",
  paddingBottom: "30px",
  paddingLeft: "40px",
});

const border = { x: 100, y: 50, width: 200, height: 100 };

describe("a computed length", () => {
  test("is its px, and nothing for what is no length", () => {
    expect(pxOf("12px")).toBe(12);
    expect(pxOf("-4.5px")).toBe(-4.5);
    expect(pxOf(".5px")).toBe(0.5);
    expect(pxOf("auto")).toBeNull();
    expect(pxOf("50%")).toBeNull();
    expect(pxOf("normal")).toBeNull();
  });
});

describe("the box a style says", () => {
  test("has each side of the margin, the border and the padding as its own", () => {
    const model = boxModel(button);
    expect(model.margin).toEqual({ top: 8, right: 16, bottom: 4, left: 2 });
    expect(model.border).toEqual({ top: 1, right: 2, bottom: 3, left: 4 });
    expect(model.padding).toEqual({ top: 10, right: 20, bottom: 30, left: 40 });
    expect(model.boxSizing).toBe("content-box");
    expect(model.display).toBe("block");
  });

  test("keeps a negative margin as it is, and reads one that is no length as 0", () => {
    const model = boxModel(style({ marginTop: "-12px", marginLeft: "auto" }));
    expect(model.margin).toEqual({ top: -12, right: 0, bottom: 0, left: 0 });
  });

  test("has offsets only for a positioned element with one that is not auto", () => {
    expect(boxModel(style({ top: "10px" })).offsets).toBeNull();
    expect(boxModel(style({ position: "relative" })).offsets).toBeNull();
    expect(boxModel(style({ position: "absolute", top: "10px", left: "-4px" })).offsets).toEqual({
      top: 10,
      right: null,
      bottom: null,
      left: -4,
    });
    expect(boxModel(style({ position: "sticky", top: "0px" })).offsets?.top).toBe(0);
  });
});

describe("the size of the content", () => {
  const laid = { width: 266, height: 144 };

  test("with content-box is the computed width and height", () => {
    const model = boxModel(button);
    expect(contentSize(model, { width: "200px", height: "100px" }, laid)).toEqual({
      width: 200,
      height: 100,
    });
  });

  test("with border-box is those less the border and the padding", () => {
    const model = boxModel({ ...button, boxSizing: "border-box" });
    expect(contentSize(model, { width: "266px", height: "144px" }, laid)).toEqual({
      width: 200,
      height: 100,
    });
    // A box smaller than its own border and padding has no content, not less than none.
    expect(contentSize(model, { width: "20px", height: "10px" }, laid)).toEqual({ width: 0, height: 0 });
  });

  test("of an inline element, whose width is auto, is the laid out box less the border and the padding", () => {
    const model = boxModel(button);
    expect(contentSize(model, { width: "auto", height: "auto" }, laid)).toEqual({
      width: 200,
      height: 100,
    });
  });
});

describe("the areas on the page", () => {
  test("are the margin outside the border box, the padding inside the border, the content inside that", () => {
    expect(ringRects(border, boxModel(button))).toEqual({
      margin: { x: 98, y: 42, width: 218, height: 112 },
      border,
      padding: { x: 104, y: 51, width: 194, height: 96 },
      content: { x: 144, y: 61, width: 134, height: 56 },
    });
  });

  test("a negative margin makes no area on its side, and the others keep theirs", () => {
    const model = boxModel(style({ marginTop: "-20px", marginLeft: "-8px", marginRight: "10px" }));
    expect(ringRects(border, model).margin).toEqual({ x: 100, y: 50, width: 210, height: 100 });
  });

  test("never turn inside out where the border and the padding are more than the box", () => {
    const model = boxModel(style({ paddingLeft: "150px", paddingRight: "150px", borderTopWidth: "80px", borderBottomWidth: "80px" }));
    const rects = ringRects(border, model);
    expect(rects.padding).toEqual({ x: 100, y: 130, width: 200, height: 0 });
    expect(rects.content).toEqual({ x: 250, y: 130, width: 0, height: 0 });
  });

  test("are not drawn for display contents or none, or an element of no size", () => {
    expect(hasBox("contents", { width: 0, height: 0 })).toBe(false);
    expect(hasBox("contents", { width: 10, height: 10 })).toBe(false);
    expect(hasBox("none", { width: 0, height: 0 })).toBe(false);
    expect(hasBox("block", { width: 0, height: 0 })).toBe(false);
    expect(hasBox("block", { width: 120, height: 0 })).toBe(true);
    expect(hasBox("inline", { width: 40, height: 18 })).toBe(true);
  });

  test("as corners go round from the top left", () => {
    expect(rectQuad({ x: 1, y: 2, width: 10, height: 20 })).toEqual([
      { x: 1, y: 2 },
      { x: 11, y: 2 },
      { x: 11, y: 22 },
      { x: 1, y: 22 },
    ]);
    expect(ringQuads(border, boxModel(button)).content[0]).toEqual({ x: 144, y: 61 });
  });
});

describe("the shape of an area", () => {
  const outer = rectQuad({ x: 0, y: 0, width: 100, height: 50 });
  const inner = rectQuad({ x: 10, y: 5, width: 80, height: 40.126 });

  test("is what is inside its outer edge and outside the next area, filled by the even-odd rule", () => {
    expect(ringPath(outer, inner)).toBe(
      "polygon(evenodd, 0px 0px, 100px 0px, 100px 50px, 0px 50px, 0px 0px, " +
        "10px 5px, 90px 5px, 90px 45.13px, 10px 45.13px, 10px 5px)",
    );
  });

  test("of the content is all of it", () => {
    expect(ringPath(outer, null)).toBe("polygon(0px 0px, 100px 0px, 100px 50px, 0px 50px)");
  });

  test("each area ends where the next one in starts", () => {
    const quads = ringQuads(border, boxModel(button));
    const paths = ringPaths(quads);
    expect(paths.margin).toBe(ringPath(quads.margin, quads.border));
    expect(paths.border).toBe(ringPath(quads.border, quads.padding));
    expect(paths.padding).toBe(ringPath(quads.padding, quads.content));
    expect(paths.content).toBe(ringPath(quads.content, null));
  });
});

describe("an element's own corners", () => {
  const point = (x: number, y: number) => ({ x, y });
  const turned = { p1: point(50, 0), p2: point(100, 50), p3: point(50, 100), p4: point(0, 50) };

  test("are read from one quad, and from nothing else", () => {
    expect(oneQuad([turned])).toEqual([point(50, 0), point(100, 50), point(50, 100), point(0, 50)]);
    expect(oneQuad([])).toBeNull();
    expect(oneQuad(null)).toBeNull();
    expect(oneQuad("quad")).toBeNull();
    expect(oneQuad([{ p1: point(0, 0), p2: point(1, 0), p3: point(1, 1) }])).toBeNull();
    expect(oneQuad([{ ...turned, p4: { x: "0", y: 0 } }])).toBeNull();
    expect(oneQuad([{ ...turned, p2: point(Number.NaN, 0) }])).toBeNull();
  });

  test("an inline element in several pieces has none, and is drawn by its bounding box", () => {
    expect(oneQuad([turned, turned])).toBeNull();
  });

  test("a box no transform changes is plain: straight, and the size it is laid out at", () => {
    const quad = rectQuad({ x: 10, y: 20, width: 200, height: 100 });
    expect(isPlain(quad, { width: 200, height: 100 })).toBe(true);
    expect(isPlain(quad, null)).toBe(true);
    // Scaled by a half, the quad is still straight and no longer the laid out size.
    expect(isPlain(quad, { width: 400, height: 200 })).toBe(false);
    const diamond: Quad = [point(50, 0), point(100, 50), point(50, 100), point(0, 50)];
    expect(isPlain(diamond, { width: 70, height: 70 })).toBe(false);
    expect(isPlain(diamond, null)).toBe(false);
  });

  test("are moved as one to where the bounding box is", () => {
    const quads = ringQuads(border, boxModel(button));
    const moved = alignQuads(quads, { x: 0, y: 10 });
    expect(moved.border[0]).toEqual({ x: 0, y: 10 });
    expect(moved.margin[0]).toEqual({ x: -2, y: 2 });
    expect(moved.content[2]).toEqual({ x: 178, y: 77 });
  });
});

describe("what is said of a box", () => {
  test("a length has two decimals at most, and a dash stands for 0 and for none", () => {
    expect(boxValue(16)).toBe("16");
    expect(boxValue(12.3456)).toBe("12.35");
    expect(boxValue(0.5)).toBe("0.5");
    expect(boxValue(-8)).toBe("-8");
    expect(boxValue(0)).toBe("-");
    expect(boxValue(0.001)).toBe("-");
    expect(boxValue(-0.001)).toBe("-");
    expect(boxValue(null)).toBe("-");
    expect(short(-0.001)).toBe("0");
  });

  test("a size is its width by its height", () => {
    expect(sizeText(120, 32)).toBe("120 × 32");
    expect(sizeText(120.456, 32.5)).toBe("120.46 × 32.5");
  });

  test("the four sides read top, right, bottom, left, and say nothing where all are 0", () => {
    expect(shorthand({ top: 8, right: 16, bottom: 8, left: 16 })).toBe("8px 16px 8px 16px");
    expect(shorthand({ top: 0, right: 12.345, bottom: 0, left: -4 })).toBe("0 12.35px 0 -4px");
    expect(shorthand({ top: 0, right: 0, bottom: 0, left: 0 })).toBeNull();
  });

  test("a computed length is cut to two decimals, and what is no length stays", () => {
    expect(tidy("13.3333px")).toBe("13.33px");
    expect(tidy("16px")).toBe("16px");
    expect(tidy("normal")).toBe("normal");
  });
});
