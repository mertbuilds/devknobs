import { describe, expect, test } from "bun:test";
import { createNavigator, stepOf } from "../src/grab/navigate";
import { as, node, shadow } from "./grab-tree";

function tree() {
  const first = node("li");
  const second = node("li");
  const third = node("li");
  const list = node("ul", [first, second, third]);
  const panel = node("div", [], { "data-devknobs": "panel" });
  const main = node("main", [list]);
  const body = node("body", [main, panel]);
  node("html", [body]);
  return { first, second, third, list, main, panel };
}

describe("stepOf", () => {
  test("arrows step, tab goes right and shift tab left", () => {
    expect(stepOf({ key: "ArrowUp", shiftKey: false })).toBe("up");
    expect(stepOf({ key: "ArrowDown", shiftKey: false })).toBe("down");
    expect(stepOf({ key: "ArrowLeft", shiftKey: false })).toBe("left");
    expect(stepOf({ key: "ArrowRight", shiftKey: false })).toBe("right");
    expect(stepOf({ key: "Tab", shiftKey: false })).toBe("right");
    expect(stepOf({ key: "Tab", shiftKey: true })).toBe("left");
    expect(stepOf({ key: "a", shiftKey: false })).toBeNull();
  });
});

describe("createNavigator", () => {
  test("up goes to the parent and stops under the body", () => {
    const { second, list, main } = tree();
    const nav = createNavigator();
    expect(nav.next("up", as(second))).toBe(as(list));
    expect(nav.next("up", as(list))).toBe(as(main));
    expect(nav.next("up", as(main))).toBeNull();
  });

  test("down retraces the way up, then goes to the first child", () => {
    const { first, second, list, main } = tree();
    const nav = createNavigator();
    nav.next("up", as(second));
    nav.next("up", as(list));
    expect(nav.next("down", as(main))).toBe(as(list));
    expect(nav.next("down", as(list))).toBe(as(second));
    expect(nav.next("down", as(list))).toBe(as(first));
  });

  test("down skips a way back that left the page", () => {
    const { first, second, list } = tree();
    const nav = createNavigator();
    nav.next("up", as(second));
    second.isConnected = false;
    expect(nav.next("down", as(list))).toBe(as(first));
  });

  test("left and right go along the siblings and forget the way down", () => {
    const { first, second, third } = tree();
    const nav = createNavigator();
    expect(nav.next("right", as(first))).toBe(as(second));
    expect(nav.next("right", as(third))).toBeNull();
    expect(nav.next("left", as(second))).toBe(as(first));
    const old = node("span");
    const fresh = node("span");
    const from = node("li", [old]);
    const to = node("li", [fresh]);
    node("ul", [from, to]);
    nav.next("up", as(old));
    expect(nav.next("right", as(from))).toBe(as(to));
    expect(nav.next("down", as(to))).toBe(as(fresh));
  });

  test("passes over devknobs' nodes among the siblings", () => {
    const { main, panel } = tree();
    const nav = createNavigator();
    expect(nav.next("right", as(main))).toBeNull();
    expect(nav.next("left", as(panel))).toBe(as(main));
  });

  test("climbs out of a shadow root to its host, and down into it", () => {
    const inner = node("button");
    const host = node("my-card");
    shadow(host, [inner], inner);
    node("body", [node("main", [host])]);
    const nav = createNavigator();
    expect(nav.next("up", as(inner))).toBe(as(host));
    nav.clear();
    expect(nav.next("down", as(host))).toBe(as(inner));
  });
});
