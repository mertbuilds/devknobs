import { describe, expect, test } from "bun:test";
import {
  composedParent,
  deepElementAt,
  grabTargetAt,
  isDevknobs,
  isGrabbable,
} from "../src/grab/hit";
import { as, type FakeElement, node, place, shadow } from "./grab-tree";

function rootAt(hit: FakeElement | null, stack: FakeElement[] = []) {
  return { elementFromPoint: () => as(hit), elementsFromPoint: () => stack.map(as) };
}

/** A card of 200 by 100 with an icon and a title in it that take no pointer events. */
function card() {
  const icon = place(node("svg"), 10, 10, 20, 20);
  const word = place(node("b"), 40, 12, 30, 16);
  word.textContent = "Take";
  const title = place(node("h3", [word]), 40, 10, 150, 20);
  const item = place(node("li", [icon, title]), 0, 0, 200, 100);
  const body = node("body", [node("ul", [item])]);
  return { icon, word, title, item, body };
}

describe("hit testing", () => {
  test("reaches into open shadow roots", () => {
    const inner = node("button");
    const host = node("my-card");
    shadow(host, [inner], inner);
    node("body", [host]);
    expect(deepElementAt(rootAt(host), 1, 1)).toBe(as(inner));
    expect(composedParent(as(inner))).toBe(as(host));
  });

  test("passes over devknobs' own nodes, in their shadow roots too", () => {
    const row = node("button");
    const panel = node("div", [], { "data-devknobs": "panel" });
    shadow(panel, [row], row);
    node("body", [panel]);
    expect(isDevknobs(as(row))).toBe(true);
    expect(grabTargetAt(rootAt(panel), 1, 1)).toBeNull();
  });

  test("never takes the page's root, and takes what is on it", () => {
    const button = node("button");
    const body = node("body", [button]);
    const html = node("html", [body]);
    expect(isGrabbable(as(body))).toBe(false);
    expect(isGrabbable(as(html))).toBe(false);
    expect(isGrabbable(null)).toBe(false);
    expect(grabTargetAt(rootAt(body), 1, 1)).toBeNull();
    expect(grabTargetAt(rootAt(button), 1, 1)).toBe(as(button));
  });

  test("goes down to the children a hit test passes over, the smallest that holds the point", () => {
    const { icon, word, title, item } = card();
    expect(grabTargetAt(rootAt(item), 15, 15)).toBe(as(icon));
    expect(grabTargetAt(rootAt(item), 45, 15)).toBe(as(word));
    expect(grabTargetAt(rootAt(item), 120, 15)).toBe(as(title));
    expect(grabTargetAt(rootAt(item), 120, 80)).toBe(as(item));
  });

  test("the walk down skips what is hidden, not drawn, or devknobs' own", () => {
    const { icon, title, item } = card();
    icon.style.visibility = "hidden";
    expect(grabTargetAt(rootAt(item), 15, 15)).toBe(as(item));
    place(title, 0, 0, 0, 0);
    expect(grabTargetAt(rootAt(item), 120, 15)).toBe(as(item));
    const mark = place(node("div", [], { "data-devknobs": "overlay" }), 0, 0, 200, 100);
    const page = place(node("main", [mark]), 0, 0, 200, 100);
    node("body", [page]);
    expect(grabTargetAt(rootAt(page), 15, 15)).toBe(as(page));
  });

  test("the walk down goes into an open shadow root", () => {
    const inner = place(node("span"), 0, 0, 50, 20);
    inner.textContent = "Save";
    const host = place(node("my-card"), 0, 0, 200, 100);
    shadow(host, [inner], null);
    node("body", [host]);
    expect(grabTargetAt(rootAt(host), 5, 5)).toBe(as(inner));
  });

  test("looks through a clear layer laid over a card", () => {
    const { word, item } = card();
    const layer = place(node("a"), 0, 0, 200, 100);
    const wrap = place(node("div", [item.children[1] as FakeElement, layer]), 0, 0, 200, 100);
    node("body", [wrap]);
    expect(grabTargetAt(rootAt(layer, [layer, wrap]), 45, 15)).toBe(as(word));
    expect(grabTargetAt(rootAt(layer, [layer, wrap]), 120, 80)).toBe(as(wrap));
  });

  test("a layer that paints, or holds text, is taken as it is", () => {
    const below = place(node("p"), 0, 0, 200, 100);
    const shade = place(node("div"), 0, 0, 200, 100);
    shade.style.backgroundColor = "rgba(0, 0, 0, 0.5)";
    node("body", [below, shade]);
    expect(grabTargetAt(rootAt(shade, [shade, below]), 5, 5)).toBe(as(shade));
    const label = place(node("span"), 0, 0, 200, 100);
    label.textContent = "Save";
    node("body", [below, label]);
    expect(grabTargetAt(rootAt(label, [label, below]), 5, 5)).toBe(as(label));
    const image = place(node("img"), 0, 0, 200, 100);
    node("body", [below, image]);
    expect(grabTargetAt(rootAt(image, [image, below]), 5, 5)).toBe(as(image));
  });

  test("a hit from a pseudo element stretched over a card gives what is under it", () => {
    const link = place(node("a"), 10, 10, 60, 20);
    link.textContent = "Take photos";
    const text = place(node("p"), 10, 40, 180, 40);
    text.textContent = "With the phone you have";
    const item = place(node("li", [node("h3", [link]), text]), 0, 0, 200, 100);
    node("body", [item]);
    expect(grabTargetAt(rootAt(link, [link, text, item]), 50, 50)).toBe(as(text));
    expect(grabTargetAt(rootAt(link, [link, item]), 150, 90)).toBe(as(item));
    expect(grabTargetAt(rootAt(link, [link, item]), 20, 20)).toBe(as(link));
  });
});
