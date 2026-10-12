import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import * as engine from "../src/engine";
import { DEFAULT_STATE, merge } from "../src/engine/store";
import type { GrabControl } from "../src/grab/control";
import { createStore, type RequestStore } from "../src/requests/store";
import { applyOnLoad, PRESETS_KEY, PRESETS_VERSION } from "../src/storage/onload";
import { stopAction } from "../src/ui/actions";
import { ACTIONS, type Action, availableActions } from "../src/ui/catalog";
import { createRequests, REQUESTS_VIEW, type Requests } from "../src/ui/requests";
import { stage } from "../src/ui/stage";
import { createStorageControl, STORAGE_VIEW, type StorageControl } from "../src/ui/storageaction";
import { POLL_MS, storageView, storeViewId } from "../src/ui/storageview";
import { type FakePane, fakeDocument, fakePane, leaveDocument } from "./requests-dom";
import { LOADED, manual } from "./requests-fakes";
import { type FakeSite, fakeSite, settle } from "./storage-fakes";

/** A tick the storage view asked for. */
interface Tick {
  ms: number;
  stopped: boolean;
}

/** One panel's place for a view, with the requests and the storage view both driven through it. */
interface Scene {
  pane: FakePane;
  site: FakeSite;
  requests: Requests;
  storage: StorageControl;
  ticks: Tick[];
  /** How many listeners the requests log has now. */
  heard(): number;
}

function actionOf(id: Action["id"]): Action {
  const found = ACTIONS.find((action) => action.id === id);
  if (!found) throw new Error(`no ${id} action`);
  return found;
}

/** Reset all, as far as the actions go: the panel stops every one the page has. */
function stopAll(): void {
  for (const action of availableActions()) stopAction(action);
}

function scene(): Scene {
  const site = fakeSite();
  // devknobs keeps its presets in the page's own localStorage, through its gateway.
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: site.localStorage,
      sessionStorage: site.sessionStorage,
      document: site.document,
      location: { search: "" },
      name: "",
      frameElement: null,
    },
  });
  const store = createStore({ seed: "t", now: () => LOADED, schedule: manual().schedule });
  let heard = 0;
  const log: RequestStore = {
    ...store,
    subscribe(listener) {
      heard++;
      const stop = store.subscribe(listener);
      return () => {
        heard--;
        stop();
      };
    },
  };
  const pane = fakePane();
  const ticks: Tick[] = [];
  const requests = createRequests({ log: () => log, pane, copy: () => Promise.resolve(true) });
  const storage = createStorageControl(async () =>
    storageView({
      site,
      copy: async () => true,
      every(ms) {
        const tick: Tick = { ms, stopped: false };
        ticks.push(tick);
        return () => {
          tick.stopped = true;
        };
      },
      onStorage: () => () => {},
      visible: () => true,
      now: () => 1_000_000,
    }),
  );
  stage.requests = requests;
  stage.storage = storage;
  return { pane, site, requests, storage, ticks, heard: () => heard };
}

/** The storage view's ticks that still run. */
function live(at: Scene): number[] {
  return at.ticks.filter((tick) => !tick.stopped).map((tick) => tick.ms);
}

/** Show the storage view on its list of stores, whichever store it showed last. */
async function showStorage(at: Scene): Promise<void> {
  at.storage.toggle();
  await settle();
  // From a store's page, escape is the way back to the list.
  if (at.pane.view() !== STORAGE_VIEW) at.pane.escape();
  await settle();
}

let at: Scene;

beforeEach(() => {
  fakeDocument();
  at = scene();
});

afterEach(() => {
  at.storage.destroy();
  stage.requests = null;
  stage.storage = null;
  stage.inspect = null;
  Reflect.deleteProperty(globalThis, "window");
  leaveDocument();
});

describe("one view in another's place", () => {
  test("storage in the requests' place stops the requests hearing the log", async () => {
    at.requests.toggle();
    expect(at.pane.view()).toBe(REQUESTS_VIEW);
    expect(at.heard()).toBe(1);
    await showStorage(at);
    expect(at.pane.view()).toBe(STORAGE_VIEW);
    expect(at.heard()).toBe(0);
    expect(live(at)).toEqual([POLL_MS]);
    expect(actionOf("requests").state?.()).toBe("off");
    expect(actionOf("storage").state?.()).toBe("on");
  });

  test("the requests in storage's place stop storage reading again", async () => {
    await showStorage(at);
    expect(live(at)).toEqual([POLL_MS]);
    at.requests.toggle();
    expect(at.pane.view()).toBe(REQUESTS_VIEW);
    expect(live(at)).toEqual([]);
    expect(at.heard()).toBe(1);
    expect(actionOf("storage").state?.()).toBe("off");
    expect(actionOf("requests").state?.()).toBe("on");
    at.requests.close();
    expect(at.pane.view()).toBeNull();
    expect(at.heard()).toBe(0);
  });
});

describe("storage's two levels in the panel", () => {
  /** Press a store's row in the list of them. */
  async function openStore(label: string): Promise<void> {
    const row = at.pane.body.find("row").find((box) => box.find("row-label")[0]?.textContent === label);
    row?.find("main")[0]?.click();
    await settle();
  }

  test("a store's page takes the list's place under the store's name, and escape and the way back go up one level, not out", async () => {
    await showStorage(at);
    expect(at.pane.title()).toBe("storage");
    expect(at.pane.node.getAttribute("data-layout")).toBe("rows");
    await openStore("IndexedDB");
    expect(at.pane.view()).toBe(storeViewId("indexeddb"));
    expect(at.pane.title()).toBe("IndexedDB");
    expect(at.pane.node.getAttribute("data-layout")).toBe("flush");
    expect(actionOf("storage").state?.()).toBe("on");
    at.pane.escape();
    expect(at.pane.view()).toBe(STORAGE_VIEW);
    expect(actionOf("storage").state?.()).toBe("on");
    await openStore("cookies");
    expect(at.pane.title()).toBe("cookies");
    at.pane.back();
    expect(at.pane.view()).toBe(STORAGE_VIEW);
    at.pane.escape();
    expect(at.pane.view()).toBeNull();
    expect(actionOf("storage").state?.()).toBe("off");
  });

  test("left on a store's page, the action closes the view, and brings it back on that page", async () => {
    await showStorage(at);
    await openStore("session storage");
    at.storage.toggle();
    expect(at.pane.view()).toBeNull();
    expect(live(at)).toEqual([]);
    at.storage.toggle();
    await settle();
    expect(at.pane.view()).toBe(storeViewId("session"));
    at.pane.escape();
    expect(at.pane.view()).toBe(STORAGE_VIEW);
  });
});

describe("reset all, with every action on the page", () => {
  /** An inspect that is on, as far as its action drives it. */
  function inspecting(): GrabControl & { on: boolean } {
    const control = {
      on: true,
      isOn: () => control.on,
      set(next: boolean) {
        control.on = next;
      },
      subscribe: () => () => {},
    };
    return control as unknown as GrabControl & { on: boolean };
  }

  test("stops inspect and closes the requests, and leaves the pin", () => {
    const docked = merge(DEFAULT_STATE, { panel: { docked: true } });
    const state = spyOn(engine, "getState").mockReturnValue(docked);
    const set = spyOn(engine, "setState");
    try {
      const inspect = inspecting();
      stage.inspect = inspect;
      at.requests.toggle();
      expect(actionOf("pin").state?.()).toBe("on");
      stopAll();
      expect(inspect.on).toBe(false);
      expect(at.pane.view()).toBeNull();
      expect(at.heard()).toBe(0);
      expect(actionOf("pin").state?.()).toBe("on");
      expect(set).not.toHaveBeenCalled();
    } finally {
      state.mockRestore();
      set.mockRestore();
    }
  });

  test("closes the storage view and turns apply on load off", async () => {
    const preset = {
      name: "logged in",
      local: [{ name: "token", value: "abc" }],
      session: [],
      cookies: [],
      onLoad: true,
      clearFirst: false,
    };
    at.site.localStorage.setItem(PRESETS_KEY, JSON.stringify({ v: PRESETS_VERSION, presets: [preset] }));
    applyOnLoad();
    expect(actionOf("storage").value?.()).toBe("1 preset");
    await showStorage(at);
    stopAll();
    expect(at.pane.view()).toBeNull();
    expect(live(at)).toEqual([]);
    expect(actionOf("storage").value?.()).toBe("");
    expect(JSON.parse(at.site.localStorage.getItem(PRESETS_KEY) ?? "")).toEqual({
      v: PRESETS_VERSION,
      presets: [{ ...preset, onLoad: false }],
    });
  });
});
