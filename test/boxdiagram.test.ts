import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { BoxModel, BoxRing } from "../src/grab/boxmodel";
import { BOX_HUES, boxTint } from "../src/grab/colors";
import {
  type BoxDiagram,
  type BoxReading,
  boxFacts,
  createBoxDiagram,
  diagramNeeds,
  readBox,
  ringValues,
} from "../src/ui/boxdiagram";
import { CSS } from "../src/ui/styles";
import { rules } from "./kit-dom";
import { FakeNode, fake } from "./styles-dom";

const NONE = { top: 0, right: 0, bottom: 0, left: 0 };

function model(over: Partial<BoxModel> = {}): BoxModel {
  return {
    margin: { top: 8, right: 16, bottom: 8, left: 16 },
    border: { top: 1, right: 1, bottom: 1, left: 1 },
    padding: { top: 6, right: 12.5, bottom: 6, left: 12.5 },
    offsets: null,
    boxSizing: "border-box",
    display: "inline-flex",
    position: "static",
    ...over,
  };
}

function reading(over: Partial<BoxModel> = {}, width = 120, height = 32): BoxReading {
  return { model: model(over), width, height };
}

/** The areas the page was told to draw alone, in order. */
let areas: (BoxRing | null)[];
let diagram: BoxDiagram;
let node: FakeNode;

function ring(name: string): FakeNode {
  const [found] = node.find(`bm-${name}`);
  if (!found) throw new Error(`no ${name}`);
  return found;
}

/** The lengths that stand in an area: top, right, bottom, left. */
function values(name: string): string[] {
  const area = ring(name);
  return ["top", "right", "bottom", "left"].map(
    (side) => area.children.find((child) => typeof child !== "string" && child.classList.contains(`bm-${side}`)),
  ).map((child) => (child && typeof child !== "string" ? child.textContent : "?"));
}

function line(): string {
  const [found] = node.find("bm-line");
  return found ? found.children.map((child) => (typeof child === "string" ? child : child.textContent)).join(" | ") : "";
}

beforeEach(() => {
  areas = [];
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { createElement: (tag: string) => new FakeNode(tag) },
  });
  diagram = createBoxDiagram((area) => areas.push(area));
  node = fake(diagram.node);
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, "document");
});

describe("the box diagram", () => {
  test("nests the content in the padding, the border, the margin and the offsets, in that order", () => {
    const nest: string[] = [];
    for (let at: FakeNode | undefined = node.children.find((child): child is FakeNode => typeof child !== "string"); at; ) {
      nest.push(at.className);
      at = at.children.find((child): child is FakeNode => typeof child !== "string" && child.classList.contains("bm-ring"));
    }
    expect(nest).toEqual([
      "bm-ring bm-position",
      "bm-ring bm-margin",
      "bm-ring bm-border",
      "bm-ring bm-padding",
      "bm-ring bm-content",
    ]);
  });

  test("each area has its name and the length of its four sides, a dash for 0", () => {
    diagram.show(reading({ border: { top: 1, right: 0, bottom: 2.005, left: 0 } }));
    expect(values("margin")).toEqual(["8", "16", "8", "16"]);
    expect(values("border")).toEqual(["1", "-", "2.01", "-"]);
    expect(values("padding")).toEqual(["6", "12.5", "6", "12.5"]);
    for (const name of ["margin", "border", "padding"]) {
      expect(ring(name).find("bm-name")[0]?.textContent).toBe(name);
    }
  });

  test("the content says its width by its height", () => {
    diagram.show(reading({}, 120.456, 32));
    expect(ring("content").textContent).toBe("120.46 × 32");
  });

  test("a negative margin is said as it is", () => {
    diagram.show(reading({ margin: { top: -12, right: 0, bottom: 0, left: -4.5 } }));
    expect(values("margin")).toEqual(["-12", "-", "-", "-4.5"]);
  });

  test("the offsets have their area only for a positioned element, a dash for a side left auto", () => {
    diagram.show(reading());
    expect(ring("position").classList.contains("off")).toBe(true);
    expect(ring("position").tabIndex).toBe(-1);
    expect(values("position")).toEqual(["", "", "", ""]);
    diagram.show(reading({ position: "absolute", offsets: { top: 10, right: null, bottom: null, left: -4 } }));
    expect(ring("position").classList.contains("off")).toBe(false);
    expect(ring("position").tabIndex).toBe(0);
    expect(values("position")).toEqual(["10", "-", "-", "-4"]);
    diagram.show(reading());
    expect(ring("position").classList.contains("off")).toBe(true);
  });

  test("is built once: another box changes the text in the same nodes", () => {
    diagram.show(reading());
    const before = node.all().filter((one) => !one.classList.contains("bm-fact"));
    diagram.show(reading({ margin: NONE, padding: { top: 1, right: 2, bottom: 3, left: 4 } }, 10, 20));
    const after = node.all().filter((one) => !one.classList.contains("bm-fact"));
    expect(after).toHaveLength(before.length);
    expect(after.every((one, index) => one === before[index])).toBe(true);
    expect(values("margin")).toEqual(["-", "-", "-", "-"]);
    expect(values("padding")).toEqual(["1", "2", "3", "4"]);
    expect(ring("content").textContent).toBe("10 × 20");
  });

  test("one quiet line under it says how the box is sized and laid out, and its position where it has one", () => {
    diagram.show(reading());
    expect(node.find("bm-fact").map((fact) => fact.textContent)).toEqual([
      "box-sizing: border-box",
      "display: inline-flex",
    ]);
    expect(boxFacts(model({ position: "sticky", boxSizing: "content-box", display: "block" }))).toEqual([
      "box-sizing: content-box",
      "display: block",
      "position: sticky",
    ]);
  });
});

describe("an area of the diagram under the pointer or the focus", () => {
  beforeEach(() => diagram.show(reading()));

  test("is drawn alone on the page, and all four again once the pointer leaves", () => {
    ring("margin").fire("pointerenter");
    expect(areas).toEqual(["margin"]);
    ring("margin").fire("pointerleave");
    expect(areas).toEqual(["margin", null]);
  });

  test("going in from one area to the next is on the inner one, and back out on the outer", () => {
    ring("margin").fire("pointerenter");
    ring("border").fire("pointerenter");
    ring("padding").fire("pointerenter");
    ring("content").fire("pointerenter");
    expect(areas).toEqual(["margin", "border", "padding", "content"]);
    ring("content").fire("pointerleave");
    ring("padding").fire("pointerleave");
    expect(areas.slice(4)).toEqual(["padding", "border"]);
    ring("border").fire("pointerleave");
    ring("margin").fire("pointerleave");
    ring("position").fire("pointerleave");
    expect(areas[areas.length - 1]).toBeNull();
  });

  test("the offsets are no area of the box: all four stay drawn", () => {
    ring("position").fire("pointerenter");
    expect(areas).toEqual([null]);
  });

  test("the focus draws an area as the pointer does, and goes in the order margin, border, padding, content", () => {
    const stops = node.all().filter((one) => one.classList.contains("bm-ring") && one.tabIndex === 0);
    expect(stops.map((one) => one.className)).toEqual([
      "bm-ring bm-margin",
      "bm-ring bm-border",
      "bm-ring bm-padding",
      "bm-ring bm-content",
    ]);
    ring("padding").fire("focus");
    expect(areas).toEqual(["padding"]);
    ring("padding").fire("blur");
    expect(areas).toEqual(["padding", null]);
  });

  test("the focus has the say over the pointer, which has it back when the focus goes", () => {
    ring("margin").fire("pointerenter");
    ring("content").fire("focus");
    ring("content").fire("blur");
    expect(areas).toEqual(["margin", "content", "margin"]);
  });

  test("each area is named for assistive tech, with its sides", () => {
    expect(ring("margin").getAttribute("aria-label")).toBe("margin: top 8, right 16, bottom 8, left 16");
    expect(ring("content").getAttribute("aria-label")).toBe("content: 120 × 32");
    expect(ring("margin").getAttribute("role")).toBe("group");
  });
});

describe("a diagram too narrow for its lengths", () => {
  test("needs a column at each side of each area, and room for the content between them", () => {
    // Three areas of the least column, and the content.
    expect(diagramNeeds(reading({ margin: NONE, padding: NONE }))).toBe(6 * 22 + 120);
    // The offsets take a column each side more.
    const placed = reading({ margin: NONE, padding: NONE, position: "relative", offsets: { top: 1, right: null, bottom: null, left: null } });
    expect(diagramNeeds(placed)).toBe(8 * 22 + 120);
    // A long length makes its column wider.
    const long = reading({ margin: { top: 0, right: 1234.56, bottom: 0, left: 0 }, padding: NONE });
    expect(diagramNeeds(long)).toBe(5 * 22 + (7 * 6.5 + 8) + 120);
    expect(diagramNeeds(reading({}, 12345.67, 12345.67))).toBeGreaterThan(diagramNeeds(reading()));
  });

  test("keeps its lengths in the areas where they fit, as at the width a view starts with", () => {
    diagram.show(reading());
    diagram.fit(330);
    expect(node.classList.contains("narrow")).toBe(false);
  });

  test("drops them where they do not, as in a panel 240 wide, and says the margin's in a line under it", () => {
    diagram.show(reading());
    diagram.fit(222);
    expect(node.classList.contains("narrow")).toBe(true);
    expect(line()).toBe("margin | 8  16  8  16");
  });

  test("the line says the lengths of the area the pointer or the focus is on, and keeps the last one it was on", () => {
    diagram.show(reading());
    diagram.fit(222);
    ring("padding").fire("pointerenter");
    expect(line()).toBe("padding | 6  12.5  6  12.5");
    ring("border").fire("focus");
    expect(line()).toBe("border | 1  1  1  1");
    ring("border").fire("blur");
    expect(line()).toBe("padding | 6  12.5  6  12.5");
    // On the way out the pointer crosses the areas around it, and the last of them stays.
    ring("padding").fire("pointerleave");
    ring("border").fire("pointerleave");
    ring("margin").fire("pointerleave");
    ring("position").fire("pointerleave");
    expect(line()).toBe("margin | 8  16  8  16");
  });

  test("is told by the box shown as well as by the width: wide values make the same width too narrow", () => {
    diagram.fit(280);
    diagram.show(reading());
    expect(node.classList.contains("narrow")).toBe(false);
    diagram.show(reading({ margin: { top: 0, right: 1234.56, bottom: 0, left: 1234.56 } }));
    expect(node.classList.contains("narrow")).toBe(true);
    diagram.fit(720);
    expect(node.classList.contains("narrow")).toBe(false);
  });

  test("the stylesheet takes the lengths out of a narrow one and shows the line only there", () => {
    const all = rules(CSS);
    const body = (selector: string) => all.find((rule) => rule.selector === selector)?.body ?? "";
    expect(body(".box-model.narrow .bm-v")).toContain("display: none");
    expect(body(".bm-line")).toContain("display: none");
    expect(body(".box-model.narrow .bm-line")).toContain("display: flex");
  });
});

describe("the diagram's look", () => {
  const all = rules(CSS);
  const mine = all.filter((rule) => /\.bm-|\.box-model/.test(rule.selector));

  test("fills each area with the hue the page tints it with, mixed into the panel's ground", () => {
    for (const name of ["margin", "border", "padding", "content"] as const) {
      const body = mine.find((rule) => rule.selector === `.bm-${name}`)?.body ?? "";
      expect(body).toContain(`background: ${boxTint(name, 30, "var(--bg)")}`);
      expect(body).toContain(BOX_HUES[name]);
    }
  });

  test("has no border, stripe or shadow, nothing bold, and radii down the panel's scale", () => {
    for (const rule of mine) {
      expect(`${rule.selector} {${rule.body}}`).not.toMatch(/(^|[\s;{])(border(-(?!radius)[a-z-]+)?|box-shadow|font-weight)\s*:/);
    }
    const radius = (name: string) => /border-radius: (\d+)px/.exec(mine.find((rule) => rule.selector === `.bm-${name}`)?.body ?? "")?.[1];
    expect([radius("margin"), radius("border"), radius("padding")]).toEqual(["8", "4", "2"]);
  });

  test("its lengths are in mono with tabular figures", () => {
    const body = mine.find((rule) => rule.selector.startsWith(".bm-v, .bm-content"))?.body ?? "";
    expect(body).toContain("ui-monospace");
    expect(body).toContain("tabular-nums");
  });
});

describe("reading an element's box", () => {
  const style = {
    marginTop: "8px", marginRight: "0px", marginBottom: "8px", marginLeft: "0px",
    borderTopWidth: "1px", borderRightWidth: "1px", borderBottomWidth: "1px", borderLeftWidth: "1px",
    paddingTop: "4px", paddingRight: "10px", paddingBottom: "4px", paddingLeft: "10px",
    top: "auto", right: "auto", bottom: "auto", left: "auto",
    boxSizing: "border-box", display: "block", position: "static",
    width: "200px", height: "40px",
  };

  function element(connected: boolean, view: object | null) {
    return {
      isConnected: connected,
      ownerDocument: { defaultView: view },
      getBoundingClientRect: () => ({ width: 200, height: 40 }),
    } as unknown as Element;
  }

  test("goes through the window the element is in, the device frame's too", () => {
    const asked: Element[] = [];
    const view = {
      getComputedStyle: (target: Element) => {
        asked.push(target);
        return style;
      },
    };
    const target = element(true, view);
    const found = readBox(target);
    expect(asked).toEqual([target]);
    expect(found?.model.margin).toEqual({ top: 8, right: 0, bottom: 8, left: 0 });
    expect([found?.width, found?.height]).toEqual([178, 30]);
    expect(ringValues(found ?? reading(), "position")).toBeNull();
  });

  test("is nothing for an element that left its page or its window", () => {
    expect(readBox(element(false, { getComputedStyle: () => style }))).toBeNull();
    expect(readBox(element(true, null))).toBeNull();
  });
});
