import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { DEFAULT_STATE, merge } from "../src/engine/store";
import { readMessage } from "../src/engine/frame";
import { PRESETS_KEY, PRESETS_VERSION, applyOnLoad } from "../src/storage/onload";
import type { DevknobsState, DevknobsStatePatch } from "../src/types";
import { actionKey, runAction, type Store, stopAction } from "../src/ui/actions";
import { BINDING_WORDS, BINDINGS, comboProblem, readKeys, resolveKeys } from "../src/ui/bindings";
import { ACTIONS, type Action, availableActions, isActive, ROWS, type Row } from "../src/ui/catalog";
import { keyChips } from "../src/ui/footer";
import { comboText, defaultKeys, keyAction, type KeyLike, parseCombo } from "../src/ui/keys";
import { isListed, isReset, listedOrder, removePatch, rowText } from "../src/ui/list";
import { closePane, createPane, openPane, type Pane, type PaneView, paneView } from "../src/ui/pane";
import { searchActions } from "../src/ui/search";
import { stage } from "../src/ui/stage";
import { createStorageControl, STORAGE_VIEW, type StorageControl } from "../src/ui/storageaction";
import type { Tips } from "../src/ui/tooltip";
import { FakeNode, leave, page } from "./kit-dom";
import { FakeStorage, settle } from "./storage-fakes";

const LIVE = { now: 0, real: 0, overflow: null };

const TIPS: Tips = {
  show() {},
  hide: () => false,
  hideAfter() {},
  isFor: () => false,
  tooltip() {},
  destroy() {},
};

function action(): Action {
  const found = ACTIONS.find((entry) => entry.id === "storage");
  if (!found) throw new Error("no storage action");
  return found;
}

function row(): Row {
  const found = ROWS.find((entry) => entry.id === "storage");
  if (!found) throw new Error("no storage row");
  return found;
}

/** The knobs as the panel keeps them, as far as running an action goes. */
function fakeStore(): Store & { state(): DevknobsState } {
  let state = DEFAULT_STATE;
  return {
    state: () => state,
    getState: () => state,
    setState(patch: DevknobsStatePatch) {
      state = merge(state, patch);
    },
  };
}

/** How many times the view was built, and torn down. */
let mounts = 0;
let cleanups = 0;
let pane: Pane;
let control: StorageControl;
let local: FakeStorage;

function view(): PaneView {
  return {
    id: STORAGE_VIEW,
    title: "storage",
    mount() {
      mounts++;
      return () => {
        cleanups++;
      };
    },
  };
}

beforeEach(() => {
  page();
  mounts = 0;
  cleanups = 0;
  local = new FakeStorage();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: local,
      sessionStorage: new FakeStorage(),
      document: { cookie: "" },
      location: { search: "" },
      name: "",
      frameElement: null,
    },
  });
  pane = createPane({
    root: { activeElement: null },
    home: new FakeNode("button") as unknown as HTMLElement,
    tips: TIPS,
    openPanel() {},
    uncover() {},
    render() {},
  });
  control = createStorageControl(async () => view());
  stage.storage = control;
});

afterEach(() => {
  control.destroy();
  pane.destroy();
  stage.storage = null;
  leave();
  Reflect.deleteProperty(globalThis, "window");
});

describe("the storage action", () => {
  test("is called storage, with the database icon, and is found by what else it is called", () => {
    expect(action()).toMatchObject({ label: "storage", icon: "database", binding: "storage" });
    for (const query of [
      "storage",
      "data",
      "browser data",
      "application",
      "cookies",
      "localstorage",
      "local storage",
      "session storage",
      "indexeddb",
      "indexed db",
      "cache",
    ]) {
      expect(searchActions(query).map((entry) => entry.id)).toContain("storage");
    }
  });

  test("is there only where there is a panel to show it in", () => {
    expect(availableActions().map((entry) => entry.id)).toContain("storage");
    stage.storage = null;
    expect(availableActions().map((entry) => entry.id)).not.toContain("storage");
    expect(action().state?.()).toBeNull();
    expect(() => action().run()).not.toThrow();
  });

  test("its row is listed once it is run from the panel, and says on while the view shows", async () => {
    const store = fakeStore();
    expect(isListed(row(), store.state())).toBe(false);
    expect(action().state?.()).toBe("off");
    runAction(action(), store);
    await settle();
    expect(paneView()).toBe(STORAGE_VIEW);
    expect(mounts).toBe(1);
    expect(listedOrder(store.state())).toContain("storage");
    expect(action().state?.()).toBe("on");
    expect(isActive(row(), store.state())).toBe(true);
    expect(rowText(row(), store.state(), LIVE)).toBe("on");
  });

  test("run again leaves the view, and the row stays listed, off", async () => {
    const store = fakeStore();
    runAction(action(), store);
    await settle();
    runAction(action(), store);
    expect(paneView()).toBeNull();
    expect(cleanups).toBe(1);
    expect(rowText(row(), store.state(), LIVE)).toBe("off");
    expect(isListed(row(), store.state())).toBe(true);
  });

  test("the row's x closes the view and takes the row off the list", async () => {
    const store = fakeStore();
    runAction(action(), store);
    await settle();
    stopAction(action());
    store.setState(removePatch(store.state(), row()));
    expect(paneView()).toBeNull();
    expect(cleanups).toBe(1);
    expect(isListed(row(), store.state())).toBe(false);
  });

  test("its row hears the view come and go, however it did", async () => {
    let heard = 0;
    const stop = action().watch?.(() => heard++);
    action().run();
    await settle();
    expect(heard).toBe(1);
    // The view's own way back.
    closePane();
    expect(heard).toBe(2);
    expect(action().state?.()).toBe("off");
    // Another view takes its place.
    action().run();
    await settle();
    openPane({ id: "other", title: "other", mount() {} });
    expect(action().state?.()).toBe("off");
    stop?.();
    closePane();
    expect(heard).toBe(4);
  });

  test("a press while the view loads, or two, opens it once, and one taken back opens nothing", async () => {
    action().run();
    action().run();
    await settle();
    expect(mounts).toBe(1);
    control.close();
    action().run();
    control.close();
    await settle();
    expect(paneView()).toBeNull();
    expect(mounts).toBe(1);
  });

  test("a view that fails to load opens nothing, and the next press asks again", async () => {
    let fail = true;
    control = createStorageControl(() => (fail ? Promise.reject(new Error("offline")) : Promise.resolve(view())));
    stage.storage = control;
    action().run();
    await settle();
    expect(paneView()).toBeNull();
    fail = false;
    action().run();
    await settle();
    expect(paneView()).toBe(STORAGE_VIEW);
  });

  test("has no chip in the footer", () => {
    expect(keyChips(defaultKeys(), true, true).map((chip) => chip.command)).toEqual([
      "panel",
      "search",
      "grab",
      "replay",
      "reset",
    ]);
  });
});

function key(more: Partial<KeyLike>): KeyLike {
  return {
    key: "",
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    target: null,
    composedPath: () => [],
    ...more,
  };
}

describe("the storage key", () => {
  test("is shift s, shown on the row, and clashes with no other default", () => {
    const keys = defaultKeys();
    expect(comboText(keys.storage)).toBe("shift+s");
    expect(actionKey(action(), keys, true)).toBe("⇧S");
    expect(actionKey(action(), keys, false)).toBe("Shift S");
    const texts = BINDINGS.map((binding) => comboText(keys[binding]));
    expect(new Set(texts).size).toBe(texts.length);
    expect(BINDINGS).toContain("storage");
    expect(BINDING_WORDS.storage).toBe("storage");
  });

  test("runs the action from the page and the frame, and never in a field", () => {
    const keys = defaultKeys();
    expect(keyAction(key({ key: "S", shiftKey: true }), keys)).toBe("storage");
    expect(keyAction(key({ key: "s", shiftKey: true }), keys)).toBe("storage");
    expect(keyAction(key({ key: "s" }), keys)).toBeNull();
    const field = { tagName: "INPUT", hasAttribute: () => false };
    expect(keyAction(key({ key: "S", shiftKey: true, composedPath: () => [field as unknown as EventTarget] }), keys)).toBeNull();
    const message = readMessage(
      { data: { source: "devknobs", type: "key", action: "storage" }, origin: "http://app.test", source: globalThis },
      globalThis as unknown as Window,
      "http://app.test",
    );
    expect(message).toEqual({ source: "devknobs", type: "key", action: "storage" });
  });

  test("gives way to the other keys where a mount option puts one on it", () => {
    const keys = defaultKeys({ hotkey: "s" });
    expect(keyAction(key({ key: "S", shiftKey: true }), keys)).toBe("toggle");
  });

  test("can be set to another key, by the rules every stored key goes by", () => {
    const stored = readKeys(JSON.stringify({ storage: "Alt+Shift+D" }));
    expect(stored).toEqual({ storage: "alt+shift+d" });
    const keys = resolveKeys(defaultKeys(), stored);
    expect(keyAction(key({ key: "D", code: "KeyD", shiftKey: true, altKey: true }), keys)).toBe("storage");
    expect(keyAction(key({ key: "S", shiftKey: true }), keys)).toBeNull();
    // One that is another binding's default wins, and leaves that binding with no key. A bare letter is never kept.
    const won = resolveKeys(defaultKeys(), { storage: "shift+r" });
    expect(won.storage && comboText(won.storage)).toBe("shift+r");
    expect(won.replay).toBeNull();
    expect(readKeys(JSON.stringify({ storage: "s" }))).toEqual({});
    const taken = parseCombo("shift+s");
    expect(taken && comboProblem(taken, "replay", defaultKeys())).toBe("used by storage");
  });
});

describe("presets that applied on load", () => {
  const PRESET = {
    name: "logged in",
    local: [{ name: "token", value: "abc" }],
    session: [],
    cookies: [],
    onLoad: true,
    clearFirst: false,
  };

  test("show on the storage row as a knob off its default does, so the automation is never out of sight", () => {
    local.map.set(PRESETS_KEY, JSON.stringify({ v: PRESETS_VERSION, presets: [PRESET] }));
    expect(rowText(row(), DEFAULT_STATE, LIVE)).toBe("off");
    expect(isListed(row(), DEFAULT_STATE)).toBe(false);
    expect(applyOnLoad()).toBe(1);
    expect(rowText(row(), DEFAULT_STATE, LIVE)).toBe("1 preset");
    // Listed without being pinned, and the panel is not at its defaults.
    expect(isListed(row(), DEFAULT_STATE)).toBe(true);
    expect(isReset(DEFAULT_STATE)).toBe(false);
  });

  test("reset all turns apply on load off for every preset, and keeps the presets", () => {
    local.map.set(PRESETS_KEY, JSON.stringify({ v: PRESETS_VERSION, presets: [PRESET] }));
    applyOnLoad();
    // Reset all stops every action, as the row's x does.
    stopAction(action());
    expect(JSON.parse(local.map.get(PRESETS_KEY) ?? "")).toEqual({
      v: PRESETS_VERSION,
      presets: [{ ...PRESET, onLoad: false }],
    });
    expect(rowText(row(), DEFAULT_STATE, LIVE)).toBe("off");
    expect(isListed(row(), DEFAULT_STATE)).toBe(false);
    expect(isReset(DEFAULT_STATE)).toBe(true);
  });

  test("an action with nothing to put back is stopped as before", () => {
    const replay = ACTIONS.find((entry) => entry.id === "replay");
    expect(() => replay && stopAction(replay)).not.toThrow();
  });
});
