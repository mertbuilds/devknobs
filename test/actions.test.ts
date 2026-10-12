import { afterEach, describe, expect, test } from "bun:test";
import { DEFAULT_PINNED, DEFAULT_STATE, merge, parse, resetState } from "../src/engine/store";
import type { GrabControl } from "../src/grab/control";
import type { DevknobsState, DevknobsStatePatch } from "../src/types";
import { actionKey, runAction, type Store, stopAction } from "../src/ui/actions";
import {
  ACTIONS,
  type Action,
  actionRow,
  availableActions,
  isActive,
  KNOB_ROWS,
  type Live,
  ROWS,
  type Row,
  type RowId,
} from "../src/ui/catalog";
import { defaultKeys } from "../src/ui/keys";
import {
  isListed,
  isReset,
  listedOrder,
  movePatch,
  pinPatch,
  removePatch,
  rowOrder,
  rowText,
} from "../src/ui/list";
import { stage } from "../src/ui/stage";

/** The rows a fresh panel lists, as the row ids they are. */
const DEFAULTS: RowId[] = ["device", "scheme", "text", "locale"];

const LIVE: Live = { now: 0, real: 0, overflow: null };

/** A grab that is on or off as it is set, and says so to who listens. */
function fakeGrab(): GrabControl {
  let on = false;
  const listeners = new Set<(on: boolean) => void>();
  return {
    isOn: () => on,
    set(next) {
      if (next === on) return;
      on = next;
      for (const listener of [...listeners]) listener(on);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    destroy() {},
  };
}

/**
 * Inspect's view, as far as its row drives it: its row ends the picking, or
 * opens the view, which picks where it holds no element. `held.name` is the
 * element the view holds.
 */
function fakeInspector(inspect: GrabControl, held: { name: string | null; opens: number }) {
  const listeners = new Set<() => void>();
  return {
    open(): void {
      if (inspect.isOn()) inspect.set(false);
      else if (held.name === null) inspect.set(true);
      else held.opens++;
    },
    picked: () => held.name,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    /** The view took an element, or lost the one it had, and the picking ended. */
    hold(name: string | null): void {
      held.name = name;
      inspect.set(false);
      for (const listener of [...listeners]) listener();
    },
  };
}

/** A page with an inspect and its view, with no element held yet. */
function inspecting() {
  const held = { name: null as string | null, opens: 0 };
  const inspect = fakeGrab();
  const inspector = fakeInspector(inspect, held);
  stage.inspect = inspect;
  stage.inspector = inspector;
  return { inspect, inspector, held };
}

/** The knobs as the panel keeps them, as far as running an action goes. */
function fakeStore(start: DevknobsState = DEFAULT_STATE): Store & { sets: number } {
  let state = start;
  const store = {
    sets: 0,
    getState: () => state,
    setState(patch: DevknobsStatePatch) {
      store.sets++;
      state = merge(state, patch);
    },
  };
  return store;
}

function row(id: RowId): Row {
  const found = ROWS.find((entry) => entry.id === id);
  if (!found) throw new Error(`no row ${id}`);
  return found;
}

function action(id: Action["id"]): Action {
  const found = ACTIONS.find((entry) => entry.id === id);
  if (!found) throw new Error(`no action ${id}`);
  return found;
}

function pinned(...ids: string[]): DevknobsState {
  return merge(DEFAULT_STATE, { panel: { pinned: [...DEFAULTS, ...ids] } });
}

afterEach(() => {
  stage.grab = null;
  stage.inspect = null;
  stage.inspector = null;
});

describe("an action's row", () => {
  test("every action has one, under its own id, after the rows of knobs", () => {
    const ids = ROWS.map((entry) => entry.id);
    expect(ids).toEqual([...KNOB_ROWS.map((entry) => entry.id), ...ACTIONS.map((entry) => entry.id)]);
    expect(new Set(ids).size).toBe(ids.length);
    for (const entry of ACTIONS) {
      expect(row(entry.id)).toEqual({ id: entry.id, label: entry.label, knobs: [], action: entry });
    }
  });

  test("is not listed on a fresh panel: the default rows are the knobs'", () => {
    stage.grab = fakeGrab();
    expect([...DEFAULT_PINNED]).toEqual(DEFAULTS);
    expect(listedOrder(DEFAULT_STATE)).toEqual(DEFAULTS);
    for (const id of DEFAULT_PINNED) expect(ACTIONS.some((entry) => entry.id === id)).toBe(false);
  });

  test("is listed once pinned, where it was pinned, and says its mode", () => {
    stage.grab = fakeGrab();
    const state = pinned("replay", "grab");
    expect(listedOrder(state)).toEqual([...DEFAULTS, "replay", "grab"]);
    expect(rowText(row("grab"), state, LIVE)).toBe("off");
    expect(rowText(row("replay"), state, LIVE)).toBe("");
    stage.grab.set(true);
    expect(rowText(row("grab"), state, LIVE)).toBe("on");
    expect(isActive(row("grab"), state)).toBe(true);
    expect(isActive(row("replay"), state)).toBe(false);
  });

  test("has no place where the page has nothing for it, pinned or not", () => {
    expect(availableActions().map((entry) => entry.id)).toEqual(["replay"]);
    const state = pinned("grab");
    expect(isListed(row("grab"), state)).toBe(false);
    expect(listedOrder(state)).toEqual([...DEFAULTS]);
    expect(isReset(state)).toBe(true);
    stage.grab = fakeGrab();
    expect(availableActions().map((entry) => entry.id)).toEqual(["grab", "replay"]);
    expect(isListed(row("grab"), state)).toBe(true);
    expect(isReset(state)).toBe(false);
  });
});

describe("running an action", () => {
  test("from the panel pins its row, once, and runs it", () => {
    stage.grab = fakeGrab();
    const store = fakeStore();
    runAction(action("grab"), store);
    expect(store.getState().panel.pinned).toEqual([...DEFAULTS, "grab"]);
    expect(stage.grab.isOn()).toBe(true);
    runAction(action("grab"), store);
    expect(store.getState().panel.pinned).toEqual([...DEFAULTS, "grab"]);
    expect(store.sets).toBe(1);
    // Its line runs it again, which turns a mode off, and the row stays.
    expect(stage.grab.isOn()).toBe(false);
    expect(listedOrder(store.getState())).toEqual([...DEFAULTS, "grab"]);
  });

  test("by its key alone pins nothing: a mode is listed while it is on, as a knob set from outside is", () => {
    stage.grab = fakeGrab();
    const heard: string[] = [];
    const stop = action("grab").watch?.(() => heard.push("changed"));
    action("grab").run();
    expect(heard).toEqual(["changed"]);
    expect(DEFAULT_STATE.panel.pinned).toEqual([...DEFAULTS]);
    expect(listedOrder(DEFAULT_STATE)).toEqual([...DEFAULTS, "grab"]);
    expect(isReset(DEFAULT_STATE)).toBe(false);
    action("grab").run();
    expect(listedOrder(DEFAULT_STATE)).toEqual([...DEFAULTS]);
    expect(isReset(DEFAULT_STATE)).toBe(true);
    stop?.();
    action("grab").run();
    expect(heard).toEqual(["changed", "changed"]);
  });

  test("its row's × takes it off the list and turns its mode off", () => {
    stage.grab = fakeGrab();
    const store = fakeStore();
    runAction(action("grab"), store);
    stopAction(action("grab"));
    store.setState(removePatch(store.getState(), row("grab")));
    expect(stage.grab.isOn()).toBe(false);
    expect(listedOrder(store.getState())).toEqual([...DEFAULTS]);
    expect(isReset(store.getState())).toBe(true);
    // The × changes no knob.
    expect(removePatch(pinned("replay"), row("replay"))).toEqual({
      panel: { pinned: [...DEFAULTS] },
    });
  });

  test("stopping leaves alone a mode that is off, an action with no mode, and a toggle with no off", () => {
    stage.grab = fakeGrab();
    const heard: string[] = [];
    stage.grab.subscribe((on) => heard.push(on ? "on" : "off"));
    stopAction(action("grab"));
    stopAction(action("replay"));
    expect(heard).toEqual([]);
    let toggled = true;
    const toggle = {
      ...action("replay"),
      state: () => (toggled ? "on" : "off") as "on" | "off",
      run: () => {
        toggled = !toggled;
      },
    };
    stopAction(toggle);
    expect(toggled).toBe(true);
    // A mode is turned off once, and only while it is on.
    let offs = 0;
    const mode = { ...toggle, off: () => void offs++ };
    toggled = false;
    stopAction(mode);
    expect(offs).toBe(0);
    toggled = true;
    stopAction(mode);
    expect(offs).toBe(1);
  });

  test("its row drags among the knobs' rows, and keeps its place", () => {
    stage.grab = fakeGrab();
    const state = pinned("grab", "replay");
    const moved = merge(state, movePatch(state, 4, 1));
    expect(listedOrder(moved)).toEqual(["device", "grab", "scheme", "text", "locale", "replay"]);
    expect(rowOrder(moved).slice(0, 6)).toEqual(listedOrder(moved));
    const back = merge(moved, movePatch(moved, 0, 5));
    expect(back.panel.pinned).toEqual(["grab", "scheme", "text", "locale", "replay", "device"]);
    // A mode on by its key is pinned where it is dragged to, as a knob off its default is.
    stage.grab.set(true);
    const dragged = merge(DEFAULT_STATE, movePatch(DEFAULT_STATE, 4, 0));
    expect(dragged.panel.pinned).toEqual(["grab", ...DEFAULTS]);
  });

  test("reset all lists the default rows alone again", () => {
    stage.grab = fakeGrab();
    const state = pinned("grab", "replay");
    expect(isReset(state)).toBe(false);
    const reset = resetState(state);
    expect(listedOrder(reset)).toEqual([...DEFAULTS]);
    expect(isReset(reset)).toBe(true);
  });

  test("an id no action has here, as a branch not merged or a newer version keeps, is ignored", () => {
    stage.grab = fakeGrab();
    const stored = parse(JSON.stringify({ panel: { pinned: ["text", "requests", "replay", 3] } }));
    expect(stored.panel.pinned).toEqual(["text", "requests", "replay"]);
    expect(listedOrder(stored)).toEqual(["text", "replay"]);
    const kept = merge(DEFAULT_STATE, { panel: { pinned: [...DEFAULTS, "console"] } });
    expect(isReset(kept)).toBe(true);
  });
});

describe("inspect's row", () => {
  test("has a place only where there is an inspect, apart from grab's", () => {
    expect(ACTIONS.map((entry) => entry.id)).toEqual(["grab", "inspect", "replay"]);
    expect(action("inspect").state?.()).toBeNull();
    expect(isListed(row("inspect"), pinned("inspect"))).toBe(false);
    stage.grab = fakeGrab();
    expect(availableActions().map((entry) => entry.id)).toEqual(["grab", "replay"]);
    stage.grab = null;
    stage.inspect = fakeGrab();
    expect(availableActions().map((entry) => entry.id)).toEqual(["inspect", "replay"]);
    expect(isListed(row("inspect"), pinned("inspect"))).toBe(true);
    // A fresh panel does not list it.
    expect(listedOrder(DEFAULT_STATE)).toEqual(DEFAULTS);
  });

  test("is listed once it is run from the panel, and says picking while the mode is on", () => {
    stage.grab = fakeGrab();
    const { inspect } = inspecting();
    const store = fakeStore();
    expect(rowText(row("inspect"), store.getState(), LIVE)).toBe("off");
    runAction(action("inspect"), store);
    expect(store.getState().panel.pinned).toEqual([...DEFAULTS, "inspect"]);
    expect(listedOrder(store.getState())).toEqual([...DEFAULTS, "inspect"]);
    expect(inspect.isOn()).toBe(true);
    expect(action("inspect").state?.()).toBe("on");
    expect(rowText(row("inspect"), store.getState(), LIVE)).toBe("picking");
    expect(isActive(row("inspect"), store.getState())).toBe(true);
    // Grab's row and its mode are no part of it.
    expect(stage.grab.isOn()).toBe(false);
    expect(rowText(row("grab"), store.getState(), LIVE)).toBe("off");
    expect(isListed(row("grab"), store.getState())).toBe(false);
  });

  test("stays listed, off, once the mode ends with nothing picked, as with escape", () => {
    const { inspect } = inspecting();
    const store = fakeStore();
    runAction(action("inspect"), store);
    inspect.set(false);
    expect(listedOrder(store.getState())).toEqual([...DEFAULTS, "inspect"]);
    expect(rowText(row("inspect"), store.getState(), LIVE)).toBe("off");
    expect(isActive(row("inspect"), store.getState())).toBe(false);
    // Its line picks again, with one pin, and run while picking it ends that.
    runAction(action("inspect"), store);
    expect(inspect.isOn()).toBe(true);
    expect(store.sets).toBe(1);
    runAction(action("inspect"), store);
    expect(inspect.isOn()).toBe(false);
  });

  test("says the element the view holds once the pick ended the mode, and off again once that is gone", () => {
    const { inspect, inspector } = inspecting();
    const store = fakeStore();
    runAction(action("inspect"), store);
    inspector.hold("button#save.primary");
    expect(inspect.isOn()).toBe(false);
    expect(action("inspect").state?.()).toBe("off");
    expect(rowText(row("inspect"), store.getState(), LIVE)).toBe("button#save.primary");
    inspector.hold(null);
    expect(rowText(row("inspect"), store.getState(), LIVE)).toBe("off");
  });

  test("with an element held, its line opens the view and picks nothing", () => {
    const { inspect, inspector, held } = inspecting();
    const store = fakeStore();
    inspector.hold("a.link");
    runAction(action("inspect"), store);
    expect(held.opens).toBe(1);
    expect(inspect.isOn()).toBe(false);
    expect(rowText(row("inspect"), store.getState(), LIVE)).toBe("a.link");
  });

  test("tells its row of the mode going on and off, and of the element the view holds", () => {
    const { inspect, inspector } = inspecting();
    let heard = 0;
    const stop = action("inspect").watch?.(() => heard++);
    inspect.set(true);
    expect(heard).toBe(1);
    // The pick ends the mode, and the view takes the element.
    inspector.hold("a.link");
    expect(heard).toBe(3);
    stop?.();
    inspector.hold(null);
    inspect.set(true);
    expect(heard).toBe(3);
  });

  test("its × unpins it and ends the mode", () => {
    const { inspect } = inspecting();
    const heard: boolean[] = [];
    inspect.subscribe((on) => heard.push(on));
    const store = fakeStore();
    runAction(action("inspect"), store);
    stopAction(action("inspect"));
    store.setState(removePatch(store.getState(), row("inspect")));
    expect(heard).toEqual([true, false]);
    expect(inspect.isOn()).toBe(false);
    expect(store.getState().panel.pinned).toEqual([...DEFAULTS]);
    expect(listedOrder(store.getState())).toEqual([...DEFAULTS]);
    expect(isReset(store.getState())).toBe(true);
    // With the mode off already, the × only unpins.
    runAction(action("inspect"), store);
    inspect.set(false);
    stopAction(action("inspect"));
    expect(heard).toEqual([true, false, true, false]);
  });

  test("on by its key alone, is listed while the mode is on and tells its row", () => {
    stage.inspect = fakeGrab();
    const heard: string[] = [];
    const stop = action("inspect").watch?.(() => heard.push("changed"));
    stage.inspect.set(true);
    expect(heard).toEqual(["changed"]);
    expect(listedOrder(DEFAULT_STATE)).toEqual([...DEFAULTS, "inspect"]);
    stage.inspect.set(false);
    expect(listedOrder(DEFAULT_STATE)).toEqual([...DEFAULTS]);
    stop?.();
    stage.inspect.set(true);
    expect(heard).toEqual(["changed", "changed"]);
  });

  test("shows the inspect key, as the user set it", () => {
    expect(action("inspect").binding).toBe("inspect");
    expect(actionKey(action("inspect"), defaultKeys(), false)).toBe("Shift C");
  });
});

describe("the open registry", () => {
  /** An action no code knows by name: all there is to it is its entry. */
  function fakeAction(): { entry: Action; ran: () => number; mode: { on: boolean } } {
    let ran = 0;
    const mode = { on: false };
    const entry: Action = {
      // The id is the one thing a new action adds to a type.
      id: "fake" as Action["id"],
      label: "fake thing",
      long: "does a fake thing",
      aliases: ["pretend"],
      icon: "eye",
      binding: "reset",
      run: () => {
        ran++;
        mode.on = !mode.on;
      },
      state: () => (mode.on ? "on" : "off"),
      off: () => {
        mode.on = false;
      },
    };
    return { entry, ran: () => ran, mode };
  }

  test("an entry is all a new action's row takes", () => {
    const { entry, ran, mode } = fakeAction();
    const line = actionRow(entry);
    expect(line).toEqual({ id: entry.id, label: "fake thing", knobs: [], action: entry });
    expect(isListed(line, DEFAULT_STATE)).toBe(false);
    const store = fakeStore();
    runAction(entry, store);
    expect(ran()).toBe(1);
    expect(isListed(line, store.getState())).toBe(true);
    expect(rowText(line, store.getState(), LIVE)).toBe("on");
    expect(isActive(line, store.getState())).toBe(true);
    stopAction(entry);
    expect(mode.on).toBe(false);
    expect(rowText(line, store.getState(), LIVE)).toBe("off");
    store.setState(removePatch(store.getState(), line));
    expect(isListed(line, store.getState())).toBe(false);
    expect(merge(DEFAULT_STATE, pinPatch(DEFAULT_STATE, entry.id, {})).panel.pinned).toEqual([
      ...DEFAULTS,
      "fake",
    ]);
  });

  test("its key is its binding's, as the user set it, and nothing with none", () => {
    const { entry } = fakeAction();
    expect(actionKey(entry, defaultKeys(), true)).toBe("⇧⌫");
    expect(actionKey(entry, defaultKeys(), false)).toBe("Shift Backspace");
    expect(actionKey(action("grab"), defaultKeys({ grabKey: "ctrl+c" }), false)).toBe("Ctrl C");
    expect(actionKey({ ...entry, binding: undefined }, defaultKeys(), true)).toBe("");
    // A binding the user left with no key.
    expect(actionKey(action("replay"), { panel: defaultKeys().panel }, true)).toBe("");
  });
});
