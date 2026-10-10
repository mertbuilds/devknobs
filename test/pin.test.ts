import { afterEach, describe, expect, test } from "bun:test";
import { DOCK_WIDTH, setDockWidth } from "../src/engine/dock";
import { DEFAULT_STATE, merge } from "../src/engine/store";
import { ACTIONS } from "../src/ui/catalog";
import { ACTION_ICONS, ICONS } from "../src/ui/icons";
import { actionLabel, pinPatch, pinTip, pinWord } from "../src/ui/pin";
import { searchActions } from "../src/ui/search";

describe("pinPatch", () => {
  test("pins a floating panel and lets a pinned one float, and touches nothing else", () => {
    expect(pinPatch({ docked: false })).toEqual({ panel: { docked: true } });
    expect(pinPatch({ docked: true })).toEqual({ panel: { docked: false } });
    const open = merge(DEFAULT_STATE, { scheme: "dark", panel: { open: true, side: "left", y: 90 } });
    const pinned = merge(open, pinPatch(open.panel));
    expect(pinned).toEqual({ ...open, panel: { ...open.panel, docked: true } });
    expect(merge(pinned, pinPatch(pinned.panel))).toEqual(open);
  });
});

describe("the pin control's words", () => {
  afterEach(() => {
    setDockWidth(DOCK_WIDTH);
  });

  test("say what it does next", () => {
    expect(pinWord(false)).toBe("pin to the side");
    expect(pinWord(true)).toBe("unpin");
    expect(pinTip(false, 1440)).toBe("pin to the side");
    expect(pinTip(true, 1440)).toBe("unpin");
  });

  test("say the panel lies over the page in a window too narrow to make room", () => {
    expect(pinTip(false, 559)).toBe("pin to the side · over the page in a window this narrow");
    expect(pinTip(true, 390)).toBe("unpin · over the page in a window this narrow");
    expect(pinTip(false, 560)).toBe("pin to the side");
  });

  test("go by the width the panel is now", () => {
    setDockWidth(340);
    expect(pinTip(false, 659)).toBe("pin to the side · over the page in a window this narrow");
    expect(pinTip(false, 660)).toBe("pin to the side");
  });
});

describe("the pin action", () => {
  const pin = ACTIONS.find((action) => action.id === "pin");

  test("is in the search, by what it does", () => {
    for (const query of ["pin", "pin panel", "unpin", "dock", "sidebar", "devtools"]) {
      expect(searchActions(query).map((action) => action.id)).toEqual(["pin"]);
    }
  });

  test("is named for what it would do", () => {
    if (!pin) throw new Error("no pin action");
    expect(actionLabel(pin, false)).toBe("pin panel");
    expect(actionLabel(pin, true)).toBe("unpin panel");
    const replay = ACTIONS.find((action) => action.id === "replay");
    if (!replay) throw new Error("no replay action");
    expect(actionLabel(replay, true)).toBe("replay animations");
  });

  test("leaves the action that takes the panel across to its own words", () => {
    for (const query of ["move panel", "other side", "left", "right", "flip", "across"]) {
      expect(searchActions(query).map((action) => action.id)).toEqual(["side"]);
    }
    expect(searchActions("panel").map((action) => action.id)).toEqual(["pin", "side"]);
    const side = ACTIONS.find((action) => action.id === "side");
    if (!side) throw new Error("no side action");
    // It is named the same whether the panel is pinned or not.
    expect(actionLabel(side, true)).toBe("move panel across");
    expect(actionLabel(side, false)).toBe("move panel across");
    expect(ACTION_ICONS.side).toBe("panel-left");
    expect(ICONS["panel-left"]).toHaveLength(2);
    expect(ICONS["panel-right-close"]).toHaveLength(3);
  });

  test("has lucide's pin, and the control its pin-off", () => {
    expect(ACTION_ICONS.pin).toBe("pin");
    expect(ICONS.pin).toHaveLength(2);
    expect(ICONS["pin-off"]).toHaveLength(4);
  });
});
