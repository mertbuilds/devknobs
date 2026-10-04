import { describe, expect, test } from "bun:test";
import {
  composedParent,
  deepElementAt,
  grabTargetAt,
  isDevknobs,
  isGrabbable,
} from "../src/grab/hit";
import { as, node, shadow } from "./grab-tree";

function rootAt(hit: ReturnType<typeof node> | null) {
  return { elementFromPoint: () => as(hit) };
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
});
