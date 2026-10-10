import { afterEach, describe, expect, spyOn, test } from "bun:test";
import * as engine from "../src/engine";
import { DOCK_WIDTH, setDockWidth } from "../src/engine/dock";
import { DEFAULT_STATE, merge, resetState } from "../src/engine/store";
import type { DevknobsState } from "../src/types";
import { runAction, stopAction } from "../src/ui/actions";
import { type Action, ACTIONS, isActive, type Live, ROWS, type Row, type RowId } from "../src/ui/catalog";
import { ICONS } from "../src/ui/icons";
import { isListed, isReset, listedOrder, removePatch, rowText } from "../src/ui/list";
import { actionLabel, pinPatch, pinTip, pinWord } from "../src/ui/pin";
import { searchActions } from "../src/ui/search";
import { stage } from "../src/ui/stage";

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
    expect(side.icon).toBe("panel-left");
    expect(ICONS["panel-left"]).toHaveLength(2);
    expect(ICONS["panel-right-close"]).toHaveLength(3);
  });

  test("has lucide's pin, and the control its pin-off", () => {
    expect(pin?.icon).toBe("pin");
    expect(ICONS.pin).toHaveLength(2);
    expect(ICONS["pin-off"]).toHaveLength(4);
  });
});

/** The rows a fresh panel lists, as the row ids they are. */
const DEFAULTS: RowId[] = ["device", "scheme", "text", "locale"];

const LIVE: Live = { now: 0, real: 0, overflow: null };

function action(id: Action["id"]): Action {
  const found = ACTIONS.find((entry) => entry.id === id);
  if (!found) throw new Error(`no action ${id}`);
  return found;
}

function row(id: Action["id"]): Row {
  const found = ROWS.find((entry) => entry.id === id);
  if (!found) throw new Error(`no row ${id}`);
  return found;
}

/**
 * The engine's knobs kept here, with no page behind them: what the pin reads
 * and sets, and what running an action from the panel pins its row in.
 */
function fakeEngine(start: DevknobsState = DEFAULT_STATE) {
  let state = start;
  const spies = [
    spyOn(engine, "getState").mockImplementation(() => state),
    spyOn(engine, "setState").mockImplementation((patch) => {
      state = merge(state, patch);
      return state;
    }),
    spyOn(engine, "keepPlace").mockImplementation(() => {}),
  ];
  return {
    getState: () => state,
    setState(patch: Parameters<typeof engine.setState>[0]) {
      state = merge(state, patch);
    },
    kept: () => spies[2]?.mock.calls.length ?? 0,
    restore() {
      for (const spy of spies) spy.mockRestore();
    },
  };
}

describe("the pin's row", () => {
  let store: ReturnType<typeof fakeEngine> | null = null;

  afterEach(() => {
    store?.restore();
    store = null;
  });

  test("is a row as any action's, named pin panel, that says on while the panel is pinned", () => {
    store = fakeEngine();
    expect(row("pin")).toEqual({ id: "pin", label: "pin panel", knobs: [], action: action("pin") });
    expect(isListed(row("pin"), store.getState())).toBe(false);
    runAction(action("pin"), store);
    expect(store.getState().panel.docked).toBe(true);
    expect(store.kept()).toBe(1);
    expect(listedOrder(store.getState())).toEqual([...DEFAULTS, "pin"]);
    expect(rowText(row("pin"), store.getState(), LIVE)).toBe("on");
    // Its line runs it again, which lets the panel float, and the row stays.
    runAction(action("pin"), store);
    expect(store.getState().panel.docked).toBe(false);
    expect(rowText(row("pin"), store.getState(), LIVE)).toBe("off");
    expect(listedOrder(store.getState())).toEqual([...DEFAULTS, "pin"]);
  });

  test("its × takes the row off the list and leaves the panel pinned", () => {
    store = fakeEngine();
    runAction(action("pin"), store);
    // What the row's × does: stop the action, then take the row off.
    stopAction(action("pin"));
    store.setState(removePatch(store.getState(), row("pin")));
    expect(store.getState().panel.docked).toBe(true);
    expect(isListed(row("pin"), store.getState())).toBe(false);
    expect(listedOrder(store.getState())).toEqual([...DEFAULTS]);
    expect(action("pin").off).toBeUndefined();
  });

  test("a panel pinned from the footer lists no row: the pin is place, not a mode", () => {
    store = fakeEngine(merge(DEFAULT_STATE, { panel: { docked: true } }));
    expect(action("pin").state?.()).toBe("on");
    expect(isActive(row("pin"), store.getState())).toBe(false);
    expect(listedOrder(store.getState())).toEqual([...DEFAULTS]);
    expect(isReset(store.getState())).toBe(true);
  });

  test("reset all leaves the panel pinned, and takes the row off with the rest", () => {
    store = fakeEngine();
    runAction(action("pin"), store);
    expect(isReset(store.getState())).toBe(false);
    for (const entry of ACTIONS) stopAction(entry);
    const reset = resetState(store.getState());
    store.setState(reset);
    expect(reset.panel.docked).toBe(true);
    expect(action("pin").state?.()).toBe("on");
    expect(listedOrder(reset)).toEqual([...DEFAULTS]);
    expect(isReset(reset)).toBe(true);
  });
});

describe("the row that takes the panel across", () => {
  let store: ReturnType<typeof fakeEngine> | null = null;

  afterEach(() => {
    store?.restore();
    store = null;
    stage.flip = null;
  });

  test("runs the flip the panel handed in, and is listed from then on, with nothing to say", () => {
    store = fakeEngine();
    let flips = 0;
    stage.flip = () => void flips++;
    runAction(action("side"), store);
    expect(flips).toBe(1);
    expect(listedOrder(store.getState())).toEqual([...DEFAULTS, "side"]);
    expect(rowText(row("side"), store.getState(), LIVE)).toBe("");
    action("side").run();
    expect(flips).toBe(2);
    // The flip changes no knob here: where the panel stands is the drag's to say.
    expect(store.getState().panel.side).toBe(DEFAULT_STATE.panel.side);
  });

  test("does nothing with no panel up", () => {
    expect(stage.flip).toBeNull();
    expect(() => action("side").run()).not.toThrow();
  });
});
