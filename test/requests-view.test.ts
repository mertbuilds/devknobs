import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { DEFAULT_STATE, merge } from "../src/engine/store";
import { createStore, type RequestStore } from "../src/requests/store";
import { type RequestEntry, RING_SIZE } from "../src/requests/types";
import type { DevknobsState, DevknobsStatePatch } from "../src/types";
import { actionKey, runAction, type Store, stopAction } from "../src/ui/actions";
import { BINDINGS, comboProblem, readKeys, resolveKeys } from "../src/ui/bindings";
import { ACTIONS, type Action, actionRow, availableActions, isActive } from "../src/ui/catalog";
import { isListed, listedOrder, removePatch, rowText } from "../src/ui/list";
import { stage } from "../src/ui/stage";
import { CSS } from "../src/ui/styles";
import { comboText, defaultKeys, keyAction, type KeyLike, parseCombo } from "../src/ui/keys";
import { GONE_NOTE, HIDES_NOTE } from "../src/ui/requestdetail";
import { BRANDS } from "../src/ui/icons";
import { clockTime, copyText, LIGHT_WHY, LONG_BODY } from "../src/ui/requestformat";
import {
  COPIED_SHOWS,
  createRequests,
  NO_MATCH,
  NO_REQUESTS,
  REQUEST_TITLE,
  REQUEST_VIEW,
  type Requests,
  REQUESTS_VIEW,
} from "../src/ui/requests";
import { searchActions } from "../src/ui/search";
import {
  fake,
  type FakeNode,
  fakeDocument,
  type FakePane,
  fakePane,
  focused,
  leaveDocument,
  ROW_PITCH,
} from "./requests-dom";
import { fetched, image } from "./requests-entries";
import { LOADED, manual } from "./requests-fakes";

interface Scene {
  store: RequestStore;
  timer: ReturnType<typeof manual>;
  pane: FakePane;
  requests: Requests;
  said: FakeNode;
  /** What was copied, in order. */
  copies: string[];
  /** Whether the next copy goes through. */
  copying: { works: boolean };
  /** Put a request in the log, started `at` ms into the page. */
  add(at: number, more?: Partial<RequestEntry>): RequestEntry;
  /** The rows' lines: what a press opens a request from, and what takes the focus. */
  rows(): FakeNode[];
  /** The rows themselves, which the filter hides. */
  boxes(): FakeNode[];
  /** What each row reads: method, name, query, status and time. */
  texts(): string[][];
}

function scene(log = true): Scene {
  const timer = manual();
  const store = createStore({ seed: "t", now: () => LOADED + 10_000, schedule: timer.schedule });
  const pane = fakePane();
  const said = document.createElement("div");
  const copies: string[] = [];
  const copying = { works: true };
  const requests = createRequests({
    said,
    log: () => (log ? store : null),
    pane,
    copy: (text) => {
      copies.push(text);
      return Promise.resolve(copying.works);
    },
  });
  const boxes = () => pane.body.find("req-row");
  const rows = () => boxes().map((box) => box.one("main"));
  return {
    store,
    timer,
    pane,
    requests,
    said: fake(said),
    copies,
    copying,
    add(at, more = {}) {
      const entry = fetched({
        id: store.nextId(),
        url: `http://app.test/api/item-${at}`,
        timing: { start: LOADED + at, at, response: 5, end: LOADED + at + 20, duration: 20 },
        ...more,
      });
      store.put(entry);
      return entry;
    },
    rows,
    boxes,
    texts: () =>
      rows().map((row) =>
        ["req-method", "req-path", "req-query", "req-status", "req-time"].map((part) => row.one(part).textContent),
      ),
  };
}

/** The names the rows show, in order, the hidden ones left out. */
function names(at: Scene): string[] {
  return at
    .boxes()
    .filter((row) => !row.hidden)
    .map((row) => row.one("req-path").textContent);
}

function type(at: Scene, text: string): void {
  const filter = at.pane.body.one("filter");
  filter.value = text;
  filter.fire("input");
}

function chip(at: Scene, label: string): FakeNode {
  const node = at.pane.body.find("seg-item").find((each) => each.textContent === label);
  if (!node) throw new Error(`no choice ${label}`);
  return node;
}

/** The detail's sections: title, whether open, and the text inside. */
function sections(at: Scene): { title: string; open: boolean; text: string }[] {
  return at.pane.body.one("req-detail").find("row").map((box) => ({
    title: box.one("row-label").textContent,
    open: box.one("main").getAttribute("aria-expanded") === "true",
    text: box.one("req-inner").textContent,
  }));
}

function section(at: Scene, title: string): FakeNode {
  const box = at.pane.body.one("req-detail").find("row").find((each) => each.one("row-label").textContent === title);
  if (!box) throw new Error(`no section ${title}`);
  return box;
}

/** The classes of a node's element children, in order. */
function parts(node: FakeNode | undefined): string[] {
  return (node?.nodes() ?? []).map((child) => child.className);
}

/** The requests' entry in the catalog. */
function requestsAction(): Action {
  const found = ACTIONS.find((action) => action.id === "requests");
  if (!found) throw new Error("no requests action");
  return found;
}

/** The knobs as the panel keeps them, as far as running an action goes. */
function fakeStore(): Store {
  let state: DevknobsState = DEFAULT_STATE;
  return {
    getState: () => state,
    setState(patch: DevknobsStatePatch) {
      state = merge(state, patch);
    },
  };
}

beforeEach(fakeDocument);
afterEach(() => {
  stage.requests = null;
  leaveDocument();
});

describe("the requests' row in the panel", () => {
  test("the entry says it all: its icon, its key, and no place on a page with no view", () => {
    const action = requestsAction();
    expect(action.icon).toBe("arrow-up-down");
    expect(action.binding).toBe("requests");
    expect(actionKey(action, defaultKeys(), false)).toBe("Shift N");
    expect(availableActions().map((each) => each.id)).not.toContain("requests");
    expect(action.state?.()).toBeNull();
    // With no view there is nothing to run or to close, and neither throws.
    action.run();
    action.off?.();
    stage.requests = scene().requests;
    expect(availableActions().map((each) => each.id)).toContain("requests");
  });

  test("run from the panel it shows the requests, and its row is listed from then on", () => {
    const at = scene();
    stage.requests = at.requests;
    const action = requestsAction();
    const row = actionRow(action);
    const store = fakeStore();
    expect(isListed(row, store.getState())).toBe(false);
    runAction(action, store);
    expect(at.pane.view()).toBe(REQUESTS_VIEW);
    expect(store.getState().panel.pinned).toEqual([...DEFAULT_STATE.panel.pinned, "requests"]);
    // Run again it goes back to the rows, and the row stays.
    runAction(action, store);
    expect(at.pane.view()).toBeNull();
    expect(listedOrder(store.getState()).map(String)).toEqual([...DEFAULT_STATE.panel.pinned, "requests"]);
    expect(rowText(row, store.getState(), { now: 0, real: 0, overflow: null })).toBe("off");
  });

  test("it is on while the list or a request shows, and off with the rows", () => {
    const at = scene();
    stage.requests = at.requests;
    const action = requestsAction();
    const row = actionRow(action);
    at.add(10);
    expect(action.state?.()).toBe("off");
    action.run();
    expect(action.state?.()).toBe("on");
    expect(isActive(row, DEFAULT_STATE)).toBe(true);
    at.rows()[0]?.click();
    expect(at.pane.view()).toBe(REQUEST_VIEW);
    expect(action.state?.()).toBe("on");
    at.pane.back();
    expect(action.state?.()).toBe("on");
    at.pane.back();
    expect(action.state?.()).toBe("off");
    expect(isActive(row, DEFAULT_STATE)).toBe(false);
  });

  test("its x takes the row off the list and closes the view, from a request too", () => {
    const at = scene();
    stage.requests = at.requests;
    const action = requestsAction();
    const row = actionRow(action);
    const store = fakeStore();
    at.add(10);
    runAction(action, store);
    at.rows()[0]?.click();
    // What the row's x does.
    stopAction(action);
    store.setState(removePatch(store.getState(), row));
    expect(at.pane.view()).toBeNull();
    expect(at.pane.cleanups).toBe(at.pane.mounts);
    expect(isListed(row, store.getState())).toBe(false);
    expect(store.getState().panel.pinned).toEqual([...DEFAULT_STATE.panel.pinned]);
    // With the view closed already the x only takes the row off, and opens nothing.
    runAction(action, store);
    runAction(action, store);
    stopAction(action);
    expect(at.pane.view()).toBeNull();
  });
});

describe("what the view is built from", () => {
  test("the bar is the kit's: its filter, one set of segments, then the count as plain text", () => {
    const at = scene();
    at.add(10);
    at.requests.toggle();
    const bar = at.pane.body.one("toolbar");
    expect(bar.className).toBe("toolbar");
    expect(parts(bar)).toEqual(["field filter", "seg", "req-count"]);
    const [filter, kinds, count] = bar.nodes();
    expect(filter?.tag).toBe("input");
    expect(filter?.getAttribute("aria-label")).toBe("filter requests");
    expect(kinds?.getAttribute("role")).toBe("radiogroup");
    expect(kinds?.getAttribute("aria-label")).toBe("requests shown");
    expect(kinds?.nodes().map((item) => [item.getAttribute("role"), item.textContent])).toEqual([
      ["radio", "all"],
      ["radio", "fetch/xhr"],
      ["radio", "other"],
    ]);
    expect(kinds?.nodes().map((item) => item.tabIndex)).toEqual([0, -1, -1]);
    expect(count?.tag).toBe("span");
    expect(count?.nodes()).toEqual([]);
    expect(at.pane.body.nodes().map((node) => node.className)).toEqual(["toolbar", "req-list", "empty"]);
    // Nothing of the old bar is left to style.
    for (const old of ["req-bar", "req-filter", "req-chips", "chip"]) expect(at.pane.body.find(old)).toEqual([]);
  });

  test("the segments are one choice: the arrows move it and the list follows", () => {
    const at = scene();
    at.add(10);
    at.store.put(image({ id: at.store.nextId() }));
    at.requests.toggle();
    const [all, fetch, other] = at.pane.body.one("seg").nodes();
    expect(names(at)).toEqual(["logo.png", "item-10"]);
    all?.focus();
    expect(all?.fire("keydown", { key: "ArrowRight" }).prevented).toBe(true);
    expect(focused()).toBe(fetch ?? null);
    expect(names(at)).toEqual(["item-10"]);
    expect([all, fetch, other].map((item) => item?.getAttribute("aria-checked"))).toEqual(["false", "true", "false"]);
    expect([all, fetch, other].map((item) => item?.tabIndex)).toEqual([-1, 0, -1]);
    fetch?.fire("keydown", { key: "ArrowRight" });
    expect(names(at)).toEqual(["logo.png"]);
    expect(at.pane.body.one("req-count").textContent).toBe("1 of 2");
  });

  test("a row is built by the row builder: its line, its main, and the leading slot kept by the main's own padding", () => {
    const at = scene();
    at.add(10, { url: "http://app.test/api/users?page=2" });
    at.requests.toggle();
    const [box] = at.boxes();
    expect(box?.className).toBe("row req-row");
    expect(parts(box)).toEqual(["line"]);
    expect(parts(box?.nodes()[0])).toEqual(["main"]);
    const main = box?.one("main");
    expect(main?.tag).toBe("button");
    // The method stands where a row's icon does, the name is the row's label, and the rest is what it ends with.
    expect(parts(main)).toEqual(["req-method req-post", "row-label req-name", "req-status ok", "req-time"]);
    expect(parts(main?.one("req-name"))).toEqual(["req-path", "req-query"]);
    // No slot node and no padding of its own: the column is the one every row's main keeps.
    expect(box?.find("lead")).toEqual([]);
    const own = [...CSS.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .map((match) => ({ selector: (match[1] ?? "").trim(), body: match[2] ?? "" }))
      .filter((rule) => /\.req-(row|list|name|method)\b/.test(rule.selector));
    expect(own.length).toBeGreaterThan(3);
    for (const rule of own) {
      expect(rule.selector).not.toMatch(/\.main\b/);
      expect(`${rule.selector} {${rule.body}}`).not.toMatch(/(^|[\s;])(padding|margin|border|outline|box-shadow)(-[a-z-]+)?\s*:/);
    }
  });

  test("a section of the detail is the kit's fold: its chevron in the leading slot, its label, then what it says", () => {
    const at = scene();
    at.add(10);
    at.requests.toggle();
    at.rows()[0]?.click();
    const box = section(at, "initiator");
    expect(box.className).toBe("row");
    expect(parts(box)).toEqual(["line", "fold"]);
    expect(parts(box.one("main"))).toEqual(["lead", "row-label", "row-value idle"]);
    expect(parts(box.one("lead"))).toEqual(["turn"]);
    expect(parts(box.one("fold"))).toEqual(["fold-body"]);
    expect(parts(box.one("fold-body"))).toEqual(["req-inner"]);
    expect(section(at, "general").className).toBe("row open");
    expect(at.pane.body.find("req-section")).toEqual([]);
  });
});

describe("the action and its key", () => {
  test("requests is an action the search finds, by its name and as the network", () => {
    expect(ACTIONS.map((action) => action.id)).toContain("requests");
    for (const query of ["requests", "req", "network", "fetch", "xhr"]) {
      expect(searchActions(query).map((action) => action.id)).toEqual(["requests"]);
    }
  });

  test("its key is shift n, which no other default has", () => {
    const keys = defaultKeys();
    expect(comboText(keys.requests)).toBe("shift+n");
    expect(BINDINGS).toContain("requests");
    for (const binding of BINDINGS) expect(comboProblem(keys[binding], binding, keys)).toBeNull();
    const taken = parseCombo("shift+n");
    expect(taken && comboProblem(taken, "grab", keys)).toBe("used by requests");
  });

  test("the key can be set, and is kept as the others are", () => {
    expect(readKeys(JSON.stringify({ requests: "Alt+N" }))).toEqual({ requests: "alt+n" });
    const keys = resolveKeys(defaultKeys(), { requests: "alt+n" });
    expect(keys.requests && comboText(keys.requests)).toBe("alt+n");
    const press = (more: Partial<KeyLike>): KeyLike => ({
      key: "n",
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      target: null,
      composedPath: () => [],
      ...more,
    });
    expect(keyAction(press({ key: "N", shiftKey: true }), defaultKeys())).toBe("requests");
    expect(keyAction(press({ key: "N", shiftKey: true }), keys)).toBeNull();
    expect(keyAction(press({ altKey: true, code: "KeyN" }), keys)).toBe("requests");
  });

  test("the action shows the requests, and goes back to the rows where they show", () => {
    const at = scene();
    at.requests.toggle();
    expect(at.pane.view()).toBe(REQUESTS_VIEW);
    expect(at.pane.shown()?.title).toBe("requests");
    at.requests.toggle();
    expect(at.pane.view()).toBeNull();
  });

  test("it goes back to the rows from a request's detail too, in one step", () => {
    const at = scene();
    at.add(10);
    at.requests.toggle();
    at.rows()[0]?.click();
    expect(at.pane.view()).toBe(REQUEST_VIEW);
    at.requests.toggle();
    expect(at.pane.view()).toBeNull();
  });

  test("with no log it still opens, on the empty line", () => {
    const at = scene(false);
    at.requests.toggle();
    expect(at.pane.view()).toBe(REQUESTS_VIEW);
    const empty = at.pane.body.one("empty");
    expect(empty.textContent).toBe(NO_REQUESTS);
    expect(empty.hidden).toBe(false);
    expect(at.rows()).toEqual([]);
    // Clear has no log to empty, and says nothing of it.
    at.pane.act("clear");
  });
});

describe("the list", () => {
  test("has a row a request, the newest on top, each reading its method, name, status and time", () => {
    const at = scene();
    at.add(10, { url: "http://app.test/api/users?page=2&sort=name&dir=asc" });
    at.add(20, { method: "DELETE", url: "http://app.test/", state: "failed", status: 500 });
    at.add(30, {
      state: "pending",
      status: null,
      timing: { start: LOADED + 30, at: 30, response: null, end: null, duration: null },
    });
    at.requests.toggle();
    expect(at.texts()).toEqual([
      ["POST", "item-30", "", "pending", ""],
      ["DEL", "app.test", "", "500", "20ms"],
      ["POST", "users", "?page=2&…dir=asc", "201", "20ms"],
    ]);
    // The log keeps its own order, oldest first: only the view turns it over.
    expect(at.store.entries().map((entry) => entry.timing.at)).toEqual([10, 20, 30]);
    expect(at.rows().map((row) => row.one("req-status").className)).toEqual([
      "req-status idle",
      "req-status hot",
      "req-status ok",
    ]);
    // The method stays text, in its own tone, with nothing drawn in its place.
    expect(at.rows().map((row) => row.one("req-method").className)).toEqual([
      "req-method req-post",
      "req-method req-delete",
      "req-method req-post",
    ]);
    expect(at.rows().flatMap((row) => row.one("req-method").nodes())).toEqual([]);
    expect(at.rows().map((row) => row.tag)).toEqual(["button", "button", "button"]);
    expect(at.pane.body.one("req-count").textContent).toBe("3");
    expect(at.pane.body.one("empty").hidden).toBe(true);
  });

  test("a light row shows its kind, looks quieter, and says why in its tooltip", () => {
    const at = scene();
    at.store.put(image());
    at.add(100);
    at.requests.toggle();
    const [full, light] = at.rows();
    const kind = light?.one("req-method");
    // The kind is an icon, and its word is still there as its name and its tooltip.
    expect(kind?.textContent).toBe("");
    expect(kind?.className).toBe("req-method mark req-image");
    expect(kind?.getAttribute("role")).toBe("img");
    expect(kind?.getAttribute("aria-label")).toBe("img");
    expect(kind?.title).toBe("img");
    expect(kind?.nodes().map((node) => [node.tag, node.getAttribute("aria-hidden")])).toEqual([["svg", "true"]]);
    expect(full?.one("req-method").textContent).toBe("POST");
    expect(full?.one("req-method").getAttribute("aria-label")).toBeNull();
    expect(at.boxes().map((box) => box.classList.contains("light"))).toEqual([false, true]);
    expect(light?.title).toBe(`http://cdn.test/img/logo.png\n${LIGHT_WHY}`);
    expect(full?.classList.contains("light")).toBe(false);
    expect(full?.title).toBe("http://app.test/api/item-100");
  });

  test("a kind with a mark of its own shows it in its color, the letters of a lettered one behind it", () => {
    const at = scene();
    at.store.put(image({ id: at.store.nextId(), url: "http://app.test/app.js", initiatorType: "script" }));
    at.store.put(image({ id: at.store.nextId(), url: "http://app.test/data.json", initiatorType: "fetch" }));
    at.requests.toggle();
    const [json, js] = at.rows().map((row) => row.one("req-method"));
    expect(js?.className).toBe("req-method mark");
    expect(js?.getAttribute("aria-label")).toBe("js");
    const fills = (node: FakeNode | undefined) =>
      node?.one("glyph").nodes().map((shape) => [shape.tag, shape.getAttribute("fill"), shape.getAttribute("d")]);
    // Dark letters on the yellow square, whatever the panel's scheme.
    expect(fills(js)).toEqual([
      ["path", "#000", "M1 1h22v22H1z"],
      ["path", "#F7DF1E", BRANDS.javascript[1]],
    ]);
    expect(json?.getAttribute("aria-label")).toBe("json");
    expect(fills(json)).toEqual([["path", "currentColor", BRANDS.json[1]]]);
  });

  test("a row's status changes its color with its state, one tone at a time, and its columns stay put", () => {
    const at = scene();
    const entry = at.add(10, { method: "GET", state: "pending", status: null });
    at.requests.toggle();
    const [row] = at.rows();
    const method = row?.one("req-method");
    const drawn = method?.children;
    expect(row?.one("req-status").className).toBe("req-status idle");
    for (const [status, state, className] of [
      [200, "ok", "req-status ok"],
      [304, "ok", "req-status moved"],
      [404, "failed", "req-status hot"],
      [101, "ok", "req-status"],
    ] as const) {
      at.store.update(entry.id, { state, status });
      at.timer.run();
      expect(row?.one("req-status").className).toBe(className);
    }
    // The method was written once: a row that finishes moves nothing in its first column.
    expect(method?.children).toBe(drawn);
    expect(method?.className).toBe("req-method req-get");
  });

  test("a row of the device frame looks like any other row", () => {
    const at = scene();
    at.add(10, { source: "frame" });
    at.add(20);
    at.requests.toggle();
    const [own, framed] = at.boxes();
    expect(framed?.className).toBe("row req-row");
    expect(framed?.className).toBe(own?.className ?? "");
    expect(at.pane.body.one("req-list").className).toBe("req-list");
  });

  test("a row the log let go is forgotten: a request by its id shows again as a new row", () => {
    const at = scene();
    const first = at.add(10);
    at.requests.toggle();
    const [old] = at.rows();
    at.store.clear();
    at.timer.run();
    expect(at.rows()).toEqual([]);
    // A row kept by its id past its going would be taken for this one, and never shown.
    at.store.put({ ...first, timing: { ...first.timing, start: LOADED + 20_000 } });
    at.timer.run();
    expect(at.texts().map((row) => row[1])).toEqual(["item-10"]);
    expect(at.rows()[0]).not.toBe(old);
    expect(at.pane.body.one("req-count").textContent).toBe("1");
  });

  test("a changed row is changed in place, and no other row is touched", () => {
    const at = scene();
    const first = at.add(10, { state: "pending", status: null });
    at.add(20);
    at.requests.toggle();
    const before = at.rows();
    const list = at.pane.body.one("req-list");
    const children = [...list.children];
    // Any write to the row that did not change would show here.
    const other = before[0];
    const untouched = other ? [...other.nodes()].map((node) => node.children) : [];
    at.store.update(first.id, { state: "failed", status: 503 });
    at.timer.run();
    expect(at.rows()).toEqual(before);
    expect(list.children).toEqual(children);
    expect(at.rows()[1]).toBe(before[1]);
    expect(before[1]?.one("req-status").textContent).toBe("503");
    expect(before[1]?.one("req-status").classList.contains("hot")).toBe(true);
    expect(other ? [...other.nodes()].map((node) => node.children) : []).toEqual(untouched);
    untouched.forEach((parts, index) => expect(other?.nodes()[index]?.children).toBe(parts));
  });

  test("a new row goes in at the top, over the rows that were there", () => {
    const at = scene();
    at.add(10);
    at.add(20);
    at.requests.toggle();
    const before = at.rows();
    at.add(30);
    at.timer.run();
    expect(names(at)).toEqual(["item-30", "item-20", "item-10"]);
    expect(at.rows().slice(1)).toEqual(before);
  });

  test("a late row, one that started earlier, goes in at its place by time and not at the top", () => {
    const at = scene();
    at.add(10);
    at.add(30);
    at.requests.toggle();
    const before = at.rows();
    at.add(20);
    // A light row that Resource Timing tells of late, older than all of them.
    at.store.put(
      image({
        id: at.store.nextId(),
        timing: { start: LOADED + 5, at: 5, response: 1, end: LOADED + 9, duration: 4 },
      }),
    );
    at.timer.run();
    expect(names(at)).toEqual(["item-30", "item-20", "item-10", "logo.png"]);
    expect(at.rows()[0]).toBe(before[0]);
    expect(at.rows()[2]).toBe(before[1]);
  });

  test("a cleared log leaves no row, and the empty line", () => {
    const at = scene();
    at.add(10);
    at.add(20);
    at.requests.toggle();
    at.store.clear();
    at.timer.run();
    expect(at.rows()).toEqual([]);
    expect(at.pane.body.one("empty").hidden).toBe(false);
    expect(at.pane.body.one("empty").textContent).toBe(NO_REQUESTS);
    expect(at.pane.body.one("req-count").textContent).toBe("0");
  });

  test("clear in the view's head empties the log, and the list at once", () => {
    const at = scene();
    at.add(10);
    at.requests.toggle();
    at.pane.act("clear");
    expect(at.store.entries()).toEqual([]);
    expect(at.rows()).toEqual([]);
  });

  test("rows that come in the same batch as a clear are the only ones left", () => {
    const at = scene();
    at.add(10);
    at.requests.toggle();
    at.store.clear();
    at.add(20_000);
    at.timer.run();
    expect(names(at)).toEqual(["item-20000"]);
  });

  test("rows the log let go leave the list, in a burst too", () => {
    const at = scene();
    at.requests.toggle();
    for (let index = 0; index < RING_SIZE + 5; index++) at.add(index);
    at.timer.run();
    expect(at.rows().length).toBe(RING_SIZE);
    expect(names(at)[0]).toBe(`item-${RING_SIZE + 4}`);
    expect(names(at).at(-1)).toBe("item-5");
  });

  test("comes back as it was, rows and all, after the view closed", () => {
    const at = scene();
    at.add(10);
    at.requests.toggle();
    const [row] = at.rows();
    at.requests.toggle();
    at.add(20);
    at.requests.toggle();
    expect(at.rows()[1]).toBe(row);
    expect(names(at)).toEqual(["item-20", "item-10"]);
  });
});

describe("the filter and the chips", () => {
  function mixed(): Scene {
    const at = scene();
    at.add(10, { url: "http://app.test/api/users" });
    at.add(20, { method: "GET", url: "http://app.test/api/orders", state: "failed", status: 404 });
    at.store.put(
      image({
        id: at.store.nextId(),
        timing: { start: LOADED + 30, at: 30, response: 30, end: LOADED + 75, duration: 45 },
      }),
    );
    at.requests.toggle();
    return at;
  }

  test("the filter keeps the rows it finds, and says how many of how many", () => {
    const at = mixed();
    type(at, "404");
    expect(names(at)).toEqual(["orders"]);
    expect(at.pane.body.one("req-count").textContent).toBe("1 of 3");
    type(at, "post");
    expect(names(at)).toEqual(["users"]);
    type(at, "");
    expect(names(at)).toEqual(["logo.png", "orders", "users"]);
    expect(at.pane.body.one("req-count").textContent).toBe("3");
  });

  test("a filter that finds nothing says so, with the rows still in the log", () => {
    const at = mixed();
    type(at, "nothing");
    expect(names(at)).toEqual([]);
    expect(at.pane.body.one("empty").textContent).toBe(NO_MATCH);
    expect(at.pane.body.one("empty").hidden).toBe(false);
    expect(at.rows().length).toBe(3);
  });

  test("the chips pick whose requests show, and say which one is on", () => {
    const at = mixed();
    const pressed = () => at.pane.body.find("seg-item").map((node) => node.getAttribute("aria-checked"));
    expect(at.pane.body.find("seg-item").map((node) => node.textContent)).toEqual(["all", "fetch/xhr", "other"]);
    expect(pressed()).toEqual(["true", "false", "false"]);
    chip(at, "fetch/xhr").click();
    expect(names(at)).toEqual(["orders", "users"]);
    expect(pressed()).toEqual(["false", "true", "false"]);
    chip(at, "other").click();
    expect(names(at)).toEqual(["logo.png"]);
    expect(pressed()).toEqual(["false", "false", "true"]);
    chip(at, "all").click();
    expect(names(at)).toEqual(["logo.png", "orders", "users"]);
  });

  test("a row that comes in or changes is held to the filter too", () => {
    const at = mixed();
    type(at, "404");
    const late = at.add(40, { url: "http://app.test/api/late", state: "pending", status: null });
    at.timer.run();
    expect(names(at)).toEqual(["orders"]);
    at.store.update(late.id, { state: "failed", status: 404 });
    at.timer.run();
    expect(names(at)).toEqual(["late", "orders"]);
  });
});

describe("the top of the list", () => {
  /** A list of `count` rows in a box they overflow, scrolled to `top`. */
  function scrolled(count: number, top: number): Scene {
    const at = scene();
    for (let index = 0; index < count; index++) at.add(index);
    at.pane.body.scrollHeight = count * ROW_PITCH;
    at.requests.toggle();
    at.pane.body.scrollTop = top;
    at.pane.body.fire("scroll");
    return at;
  }

  /** Put `count` more requests in the log, newer than the rest, and let the box grow for them. */
  function arrive(at: Scene, count: number): void {
    for (let index = 0; index < count; index++) at.add(1000 + at.store.entries().length);
    at.pane.body.scrollHeight += count * ROW_PITCH;
    at.timer.run();
  }

  test("the list opens at its top, where the newest row is, and stays there as rows come", () => {
    const at = scrolled(20, 0);
    expect(at.pane.body.scrollTop).toBe(0);
    arrive(at, 3);
    expect(at.pane.body.scrollTop).toBe(0);
    expect(names(at)[0]).toBe("item-1022");
  });

  test("within the slack of its top it is at its top, and is brought there as rows come", () => {
    const at = scrolled(20, 3);
    arrive(at, 1);
    expect(at.pane.body.scrollTop).toBe(0);
  });

  test("scrolled down, rows that come in above move the scroll by just their height, so nothing in view moves", () => {
    const at = scrolled(20, 120);
    const inView = at.boxes()[5];
    const place = () => (inView?.getBoundingClientRect().top ?? 0) - at.pane.body.scrollTop;
    const before = place();
    arrive(at, 1);
    expect(at.pane.body.scrollTop).toBe(120 + ROW_PITCH);
    expect(place()).toBe(before);
    arrive(at, 7);
    expect(at.pane.body.scrollTop).toBe(120 + 8 * ROW_PITCH);
    expect(place()).toBe(before);
  });

  test("scrolled down, a late row that goes in under the view moves nothing", () => {
    const at = scrolled(20, 120);
    // Older than every row there, so it is the last one.
    at.add(-5);
    at.pane.body.scrollHeight += ROW_PITCH;
    at.timer.run();
    expect(names(at).at(-1)).toBe("item--5");
    expect(at.pane.body.scrollTop).toBe(120);
  });

  test("scrolled down, a late row that goes in above the view, though not at the top, is made room for too", () => {
    const at = scrolled(20, 120);
    at.add(17.5);
    at.pane.body.scrollHeight += ROW_PITCH;
    at.timer.run();
    expect(names(at).slice(0, 4)).toEqual(["item-19", "item-18", "item-17.5", "item-17"]);
    expect(at.pane.body.scrollTop).toBe(120 + ROW_PITCH);
  });

  test("scrolled down, a row the filter hides as it comes in takes no room, and moves nothing", () => {
    const at = scrolled(20, 120);
    type(at, "item");
    at.add(2000, { url: "http://app.test/other" });
    at.timer.run();
    expect(at.pane.body.scrollTop).toBe(120);
  });

  test("a row that only changes moves nothing", () => {
    const at = scrolled(20, 120);
    const [entry] = at.store.entries();
    if (entry) at.store.update(entry.id, { state: "failed", status: 500 });
    at.timer.run();
    expect(at.pane.body.scrollTop).toBe(120);
  });

  test("scrolled back to its top, it keeps to it again", () => {
    const at = scrolled(20, 120);
    at.pane.body.scrollTop = 2;
    at.pane.body.fire("scroll");
    arrive(at, 2);
    expect(at.pane.body.scrollTop).toBe(0);
  });

  test("a batch scrolls the box once at most, and not at all at its top", () => {
    const at = scrolled(20, 120);
    const before = at.pane.body.scrolls;
    arrive(at, 50);
    expect(at.pane.body.scrolls - before).toBe(1);
    expect(at.pane.body.scrollTop).toBe(120 + 50 * ROW_PITCH);
    const top = scrolled(20, 0);
    const still = top.pane.body.scrolls;
    arrive(top, 50);
    expect(top.pane.body.scrolls - still).toBe(0);
  });
});

describe("the keys in the list", () => {
  function three(): Scene {
    const at = scene();
    at.add(10);
    at.add(20, { url: "http://app.test/other" });
    at.add(30);
    at.requests.toggle();
    return at;
  }

  test("the tab key stops at one row, the newest at first", () => {
    const at = three();
    expect(at.rows().map((row) => row.tabIndex)).toEqual([0, -1, -1]);
    expect(at.rows()[0]?.one("req-path").textContent).toBe("item-30");
  });

  test("the arrows, Home and End move the focus through the rows, and the tab stop with it", () => {
    const at = three();
    const [newest, middle, oldest] = at.rows();
    expect(names(at)).toEqual(["item-30", "other", "item-10"]);
    newest?.focus();
    // Down is the row below, an older one.
    expect(newest?.fire("keydown", { key: "ArrowDown" }).prevented).toBe(true);
    expect(focused()).toBe(middle ?? null);
    expect(at.rows().map((row) => row.tabIndex)).toEqual([-1, 0, -1]);
    middle?.fire("keydown", { key: "End" });
    expect(focused()).toBe(oldest ?? null);
    oldest?.fire("keydown", { key: "ArrowDown" });
    expect(focused()).toBe(oldest ?? null);
    oldest?.fire("keydown", { key: "ArrowUp" });
    expect(focused()).toBe(middle ?? null);
    middle?.fire("keydown", { key: "Home" });
    expect(focused()).toBe(newest ?? null);
    newest?.fire("keydown", { key: "ArrowUp" });
    expect(focused()).toBe(newest ?? null);
  });

  test("the focus and the tab stop stay on their row as rows go in above it", () => {
    const at = three();
    const [, middle] = at.rows();
    middle?.focus();
    at.add(40);
    at.add(50);
    at.timer.run();
    expect(focused()).toBe(middle ?? null);
    expect(at.rows().map((row) => row.tabIndex)).toEqual([-1, -1, -1, 0, -1]);
    // The row above it is now the oldest of the new ones.
    middle?.fire("keydown", { key: "ArrowUp" });
    expect(focused()?.one("req-path").textContent).toBe("item-30");
    focused()?.fire("keydown", { key: "ArrowUp" });
    expect(focused()?.one("req-path").textContent).toBe("item-40");
    focused()?.fire("keydown", { key: "Home" });
    expect(focused()?.one("req-path").textContent).toBe("item-50");
  });

  test("the arrows pass over the rows the filter hides, and other keys are left alone", () => {
    const at = three();
    type(at, "item");
    const [first, , third] = at.rows();
    third?.focus();
    third?.fire("keydown", { key: "ArrowUp" });
    expect(focused()).toBe(first ?? null);
    expect(first?.fire("keydown", { key: "a" }).prevented).toBe(false);
  });

  test("escape empties the filter first, and only then goes back to the rows", () => {
    const at = three();
    type(at, "other");
    const filter = at.pane.body.one("filter");
    filter.focus();
    at.pane.escape();
    expect(at.pane.view()).toBe(REQUESTS_VIEW);
    expect(filter.value).toBe("");
    expect(names(at).length).toBe(3);
    // The filter keeps the focus, to be typed in again.
    expect(focused()).toBe(filter);
    at.pane.escape();
    expect(at.pane.view()).toBeNull();
  });

  test("it empties the filter wherever the focus is, as the panel asks the view whenever it shows", () => {
    const at = three();
    type(at, "item-10");
    expect(names(at)).toEqual(["item-10"]);
    at.rows()[2]?.focus();
    at.pane.escape();
    expect(at.pane.view()).toBe(REQUESTS_VIEW);
    expect(names(at).length).toBe(3);
    type(at, "item");
    // The focus is the page's.
    at.rows()[2]?.fire("blur");
    at.pane.escape();
    expect(at.pane.view()).toBe(REQUESTS_VIEW);
    expect(at.pane.body.one("filter").value).toBe("");
    at.pane.escape();
    expect(at.pane.view()).toBeNull();
  });

  test("with no filter set, escape goes back at once, from the filter's field too", () => {
    const at = three();
    at.pane.body.one("filter").focus();
    at.pane.escape();
    expect(at.pane.view()).toBeNull();
  });

  test("the head's way back leaves a filter as it is, for the next time the list shows", () => {
    const at = three();
    type(at, "item-10");
    at.pane.back();
    expect(at.pane.view()).toBeNull();
    at.requests.toggle();
    expect(at.pane.body.one("filter").value).toBe("item-10");
    expect(names(at)).toEqual(["item-10"]);
  });
});

describe("the detail", () => {
  test("a click on a row shows its request in the same pane, in sections", () => {
    const at = scene();
    const entry = at.add(10);
    at.requests.toggle();
    at.rows()[0]?.click();
    expect(at.pane.view()).toBe(REQUEST_VIEW);
    expect(at.pane.body.find("req-row")).toEqual([]);
    expect(sections(at).map((each) => [each.title, each.open])).toEqual([
      ["general", true],
      ["request headers", true],
      ["request body", true],
      ["response headers", true],
      ["response body", true],
      ["initiator", false],
    ]);
    const general = section(at, "general").find("req-v").map((node) => node.textContent);
    expect(general).toContain("http://app.test/api/item-10");
    expect(general).toContain("201 Created");
    expect(general).toContain(clockTime(new Date(entry.timing.start)));
    expect(section(at, "request headers").one("req-inner").textContent).toBe(
      "content-typeapplication/jsonAuthorizationBearer abcX-Api-Keyk1",
    );
  });

  test("the general part is colored as the row is: the status, and the method or the kind's mark", () => {
    const at = scene();
    at.store.put(image());
    at.add(100, { method: "PATCH", state: "failed", status: 500, statusText: "" });
    at.requests.toggle();
    /** The general lines by their label, as the nodes that show their values. */
    const general = () => {
      const [grid] = section(at, "general").find("req-general");
      const cells = grid?.nodes() ?? [];
      return new Map(cells.flatMap((cell, at) => (at % 2 === 0 ? [[cell.textContent, cells[at + 1]] as const] : [])));
    };
    for (const [index, light] of [false, true].entries()) {
      const row = at.rows()[index];
      const tone = row?.one("req-status").className.replace("req-status ", "") ?? "";
      const lead = row?.one("req-method");
      row?.click();
      const lines = general();
      // The same tone on the status, in the list and here.
      expect(lines.get("status")?.className).toBe(`req-v ${tone}`);
      if (light) {
        expect(tone).toBe("ok");
        expect(lines.has("method")).toBe(false);
        const mark = lines.get("kind")?.one("req-mark");
        expect(mark?.className).toBe("req-mark req-image");
        const shapes = (node: FakeNode | undefined) =>
          node?.one("glyph").nodes().map((shape) => [shape.tag, [...shape.attributes]]);
        expect(shapes(mark)).toEqual(shapes(lead) ?? []);
        expect(shapes(mark)?.length).toBe(3);
        expect(lines.get("kind")?.textContent).toBe("img, loaded by img");
      } else {
        expect(tone).toBe("hot");
        expect(lines.get("method")?.className).toBe("req-v req-patch");
        expect(lines.get("method")?.textContent).toBe("PATCH");
        expect(lead?.className).toBe("req-method req-patch");
        expect(lines.get("kind")?.find("req-mark")).toEqual([]);
      }
      at.pane.escape();
    }
  });

  test("a section folded away is not filled until it opens", () => {
    const at = scene();
    at.add(10);
    at.requests.toggle();
    at.rows()[0]?.click();
    const initiator = section(at, "initiator");
    expect(initiator.one("req-inner").children).toEqual([]);
    expect(initiator.one("fold").inert).toBe(true);
    initiator.one("main").click();
    expect(initiator.one("main").getAttribute("aria-expanded")).toBe("true");
    expect(initiator.one("fold").inert).toBe(false);
    expect(initiator.one("req-pre").textContent).toBe(
      "at save (http://app.test/app.js:10:5)\nat onClick (http://app.test/app.js:22:3)",
    );
    initiator.one("main").click();
    expect(initiator.classList.contains("open")).toBe(false);
  });

  test("json that is all there is laid out, and json that was cut is shown as kept", () => {
    const at = scene();
    at.add(10);
    at.add(20, {
      responseBody: { kind: "text", text: '{"id":7,"na', size: null, truncated: true, type: "application/json" },
    });
    at.requests.toggle();
    at.rows()[1]?.click();
    expect(section(at, "response body").one("req-pre").textContent).toBe('{\n  "id": 7,\n  "name": "Ada"\n}');
    expect(section(at, "response body").one("row-value").textContent).toBe("application/json, 21 bytes");
    at.pane.escape();
    at.rows()[0]?.click();
    const cut = section(at, "response body");
    expect(cut.one("req-pre").textContent).toBe('{"id":7,"na');
    expect(cut.one("note").textContent).toBe("truncated at 64 KB");
  });

  test("a long body starts folded, and bodies with no text say what they are", () => {
    const at = scene();
    const long = "x".repeat(LONG_BODY + 1);
    at.add(10, {
      requestBody: { kind: "stream", text: "", size: null, truncated: false, type: "" },
      responseBody: { kind: "text", text: long, size: long.length, truncated: false, type: "text/plain" },
    });
    at.add(20, {
      requestBody: null,
      responseBody: { kind: "binary", text: "", size: 2048, truncated: false, type: "image/png" },
    });
    at.requests.toggle();
    at.rows()[1]?.click();
    expect(sections(at).find((each) => each.title === "response body")?.open).toBe(false);
    expect(section(at, "response body").one("req-inner").children).toEqual([]);
    expect(section(at, "request body").one("req-inner").textContent).toBe("stream, not read");
    at.pane.escape();
    at.rows()[0]?.click();
    expect(section(at, "request body").one("req-inner").textContent).toBe("none");
    expect(section(at, "response body").one("req-inner").textContent).toBe("binary, 2 KB");
  });

  test("a light row says what the browser does not give, with no empty sections", () => {
    const at = scene();
    at.store.put(image());
    at.requests.toggle();
    at.rows()[0]?.click();
    expect(sections(at).map((each) => each.title)).toEqual(["general"]);
    const notes = at.pane.body.find("note").filter((node) => !node.hidden);
    expect(notes.map((node) => node.textContent)).toEqual([`${LIGHT_WHY}: no headers and no bodies`]);
    expect(section(at, "general").one("req-inner").textContent).toContain("hidden by the server");
  });

  test("escape goes back to the list first, to the row it came from, and then closes", () => {
    const at = scene();
    at.add(10);
    at.add(20);
    at.requests.toggle();
    const [first] = at.rows();
    first?.click();
    at.pane.escape();
    expect(at.pane.view()).toBe(REQUESTS_VIEW);
    expect(at.rows()[0]).toBe(first);
    expect(focused()).toBe(first ?? null);
    at.pane.escape();
    expect(at.pane.view()).toBeNull();
  });

  test("the head's way back goes back too, and the list is where it was", () => {
    const at = scene();
    for (let index = 0; index < 10; index++) at.add(index);
    at.pane.body.scrollHeight = 500;
    at.requests.toggle();
    at.pane.body.scrollTop = 120;
    at.pane.body.fire("scroll");
    at.rows()[3]?.click();
    at.pane.back();
    expect(at.pane.view()).toBe(REQUESTS_VIEW);
    expect(at.pane.body.scrollTop).toBe(120);
  });

  test("back finds its row still in view, with the rows that came in the meantime above it", () => {
    const at = scene();
    for (let index = 0; index < 10; index++) at.add(index);
    at.pane.body.scrollHeight = 500;
    at.requests.toggle();
    at.pane.body.scrollTop = 120;
    at.pane.body.fire("scroll");
    const row = at.rows()[5];
    row?.click();
    at.add(100);
    at.add(110);
    at.pane.body.scrollHeight = 500 + 2 * ROW_PITCH;
    at.pane.back();
    expect(at.rows()[7]).toBe(row);
    expect(focused()).toBe(row ?? null);
    // The row is as far from the top of the box as it was.
    expect(at.pane.body.scrollTop).toBe(120 + 2 * ROW_PITCH);
  });

  test("follows its request as it changes, and keeps what the user opened", () => {
    const at = scene();
    const entry = at.add(10, {
      state: "pending",
      status: null,
      statusText: "",
      responseHeaders: [],
      responseBody: null,
    });
    at.requests.toggle();
    at.rows()[0]?.click();
    const requestHeaders = section(at, "request headers").one("req-inner").children;
    section(at, "initiator").one("main").click();
    section(at, "request body").one("main").click();
    expect(section(at, "general").one("req-inner").textContent).toContain("pending");
    expect(section(at, "response headers").one("row-value").textContent).toBe("none");
    at.store.update(entry.id, {
      state: "ok",
      status: 200,
      statusText: "OK",
      responseHeaders: [["content-type", "application/json"]],
      responseBody: { kind: "text", text: "[1]", size: 3, truncated: false, type: "application/json" },
    });
    at.timer.run();
    expect(section(at, "general").one("req-inner").textContent).toContain("200 OK");
    expect(section(at, "response headers").one("row-value").textContent).toBe("1");
    expect(section(at, "response body").one("req-pre").textContent).toBe("[\n  1\n]");
    // What did not change is not drawn again.
    expect(section(at, "request headers").one("req-inner").children).toBe(requestHeaders);
    expect(sections(at).find((each) => each.title === "initiator")?.open).toBe(true);
    expect(sections(at).find((each) => each.title === "request body")?.open).toBe(false);
  });
});

describe("a request the log lets go while it shows", () => {
  const note = (at: Scene) => at.pane.body.find("note").find((node) => node.textContent === GONE_NOTE);

  test("says so quietly, and keeps what it showed", () => {
    const at = scene();
    at.add(10);
    at.requests.toggle();
    at.rows()[0]?.click();
    expect(note(at)?.hidden).toBe(true);
    at.add(20);
    at.timer.run();
    expect(note(at)?.hidden).toBe(true);
    at.store.clear();
    at.timer.run();
    expect(note(at)?.hidden).toBe(false);
    expect(section(at, "general").one("req-inner").textContent).toContain("item-10");
    at.pane.close();
  });

  test("pushed out by newer ones, too", () => {
    const at = scene();
    at.add(10);
    at.requests.toggle();
    at.rows()[0]?.click();
    for (let index = 1; index <= RING_SIZE; index++) at.add(10 + index);
    at.timer.run();
    expect(note(at)?.hidden).toBe(false);
    at.pane.close();
  });
});

describe("copy", () => {
  test("copies the request as text, says so, and the first time says what it left out", async () => {
    const at = scene();
    const entry = at.add(10);
    at.requests.toggle();
    at.rows()[0]?.click();
    const note = () => at.pane.body.find("note").find((node) => node.textContent === HIDES_NOTE);
    expect(note()?.hidden).toBe(true);
    at.pane.act("copy as text for AI");
    await Promise.resolve();
    expect(at.copies).toEqual([copyText(entry)]);
    expect(at.copies[0]).toContain("Authorization: <hidden>");
    expect(at.copies[0]).not.toContain("Bearer abc");
    expect(at.pane.title()).toBe("copied");
    expect(at.said.textContent).toBe("copied");
    expect(note()?.hidden).toBe(false);
    // The view shows the headers as the page set them.
    expect(section(at, "request headers").one("req-inner").textContent).toContain("Bearer abc");
    at.pane.escape();
    at.rows()[0]?.click();
    at.pane.act("copy as text for AI");
    await Promise.resolve();
    expect(note()?.hidden).toBe(true);
    at.pane.close();
  });

  test("a copy that did not go through says so, and keeps the note for one that does", async () => {
    const at = scene();
    at.add(10);
    at.requests.toggle();
    at.rows()[0]?.click();
    const note = () => at.pane.body.find("note").find((node) => node.textContent === HIDES_NOTE);
    at.copying.works = false;
    at.pane.act("copy as text for AI");
    await Promise.resolve();
    expect(at.pane.title()).toBe("copy failed");
    expect(at.said.textContent).toBe("copy failed");
    expect(note()?.hidden).toBe(true);
    at.copying.works = true;
    at.pane.act("copy as text for AI");
    await Promise.resolve();
    expect(at.pane.title()).toBe("copied");
    expect(note()?.hidden).toBe(false);
    at.pane.close();
  });

  /** Run with the clock's timers held: what waits, by its delay, and the way to let one run. */
  async function held(run: (waits: () => number[], fire: () => void) => Promise<void>): Promise<void> {
    const real = { set: globalThis.setTimeout, clear: globalThis.clearTimeout };
    let pending: { id: number; ms: number; run: () => void }[] = [];
    let last = 0;
    Reflect.set(globalThis, "setTimeout", (callback: () => void, ms: number) => {
      pending.push({ id: ++last, ms, run: callback });
      return last;
    });
    Reflect.set(globalThis, "clearTimeout", (id: number) => {
      pending = pending.filter((each) => each.id !== id);
    });
    try {
      await run(
        () => pending.map((each) => each.ms),
        () => pending.shift()?.run(),
      );
    } finally {
      Reflect.set(globalThis, "setTimeout", real.set);
      Reflect.set(globalThis, "clearTimeout", real.clear);
    }
  }

  test("the head says how it went for a moment, in its title's place, and then its title again", async () => {
    await held(async (waits, fire) => {
      const at = scene();
      at.add(10);
      at.requests.toggle();
      at.rows()[0]?.click();
      expect(at.pane.title()).toBe(REQUEST_TITLE);
      at.pane.act("copy as text for AI");
      await Promise.resolve();
      expect(at.pane.title()).toBe("copied");
      // A second copy starts the moment again: one timer waits, not two.
      at.pane.act("copy as text for AI");
      await Promise.resolve();
      expect(waits()).toEqual([COPIED_SHOWS]);
      fire();
      expect(at.pane.title()).toBe(REQUEST_TITLE);
      expect(at.pane.view()).toBe(REQUEST_VIEW);
    });
  });

  test("the word does not outlive its request: back takes the timer, and the list keeps its title", async () => {
    await held(async (waits) => {
      const at = scene();
      at.add(10);
      at.requests.toggle();
      at.rows()[0]?.click();
      at.pane.act("copy as text for AI");
      await Promise.resolve();
      expect(waits().length).toBe(1);
      at.pane.back();
      expect(waits()).toEqual([]);
      expect(at.pane.title()).toBe("requests");
    });
  });

  test("a copy that lands after its request left says nothing in the head", async () => {
    await held(async (waits) => {
      const at = scene();
      at.add(10);
      at.add(20);
      at.requests.toggle();
      at.rows()[0]?.click();
      at.pane.act("copy as text for AI");
      at.pane.back();
      at.rows()[1]?.click();
      await Promise.resolve();
      expect(at.pane.title()).toBe(REQUEST_TITLE);
      expect(waits()).toEqual([]);
      expect(at.said.textContent).toBe("copied");
      at.pane.close();
    });
  });

  test("copies the request as it is now, not as it was when it opened", async () => {
    const at = scene();
    const entry = at.add(10, { state: "pending", status: null, statusText: "" });
    at.requests.toggle();
    at.rows()[0]?.click();
    at.store.update(entry.id, { state: "failed", status: 500, statusText: "Server Error" });
    at.timer.run();
    at.pane.act("copy as text for AI");
    await Promise.resolve();
    expect(at.copies[0]).toContain("status: 500 Server Error");
    at.pane.close();
  });
});

describe("the way back", () => {
  /** Two requests in the list, which a control of the panel opened. */
  function opened(): { at: Scene; trigger: FakeNode } {
    const at = scene();
    at.add(10);
    at.add(20);
    const trigger = fake(document.createElement("button"));
    trigger.focus();
    at.requests.toggle();
    return { at, trigger };
  }

  test("is one control at a time, in the head: over the list, and over a request", () => {
    const { at } = opened();
    expect(at.pane.ways().map((way) => way.getAttribute("aria-label"))).toEqual(["back from requests"]);
    expect(at.pane.title()).toBe("requests");
    at.rows()[0]?.click();
    expect(at.pane.ways().map((way) => way.getAttribute("aria-label"))).toEqual(["back from request"]);
    expect(at.pane.title()).toBe(REQUEST_TITLE);
    // The detail has no way back of its own: every button in it folds a section.
    const inBody = at.pane.body.find("main");
    expect(inBody.length).toBe(6);
    for (const each of inBody) expect(each.getAttribute("aria-expanded")).not.toBeNull();
    at.pane.back();
    expect(at.pane.ways().map((way) => way.getAttribute("aria-label"))).toEqual(["back from requests"]);
  });

  test("from a request it is the list, and from the list the panel's rows", () => {
    const { at, trigger } = opened();
    const [first] = at.rows();
    first?.click();
    expect(focused()).toBe(at.pane.ways()[0] ?? null);
    at.pane.back();
    expect(at.pane.view()).toBe(REQUESTS_VIEW);
    expect(at.rows()[0]).toBe(first);
    expect(focused()).toBe(first ?? null);
    at.pane.back();
    expect(at.pane.view()).toBeNull();
    // The focus is back on what opened the list, not on what opened the request.
    expect(focused()).toBe(trigger);
  });

  test("escape takes the same steps: the request, the list's filter, the list", () => {
    const { at, trigger } = opened();
    type(at, "item");
    at.rows()[1]?.click();
    const steps: [string | null, string][] = [];
    for (let step = 0; step < 3; step++) {
      at.pane.escape();
      steps.push([at.pane.view(), at.pane.body.find("filter")[0]?.value ?? ""]);
    }
    expect(steps).toEqual([
      [REQUESTS_VIEW, "item"],
      [REQUESTS_VIEW, ""],
      [null, ""],
    ]);
    expect(focused()).toBe(trigger);
    // With no view, escape is not the view's any more.
    at.pane.escape();
    expect(at.pane.view()).toBeNull();
  });

  test("back from a request the log let go leaves the focus on the head, as its row is gone", () => {
    const { at } = opened();
    at.rows()[1]?.click();
    at.store.clear();
    at.timer.run();
    at.pane.back();
    expect(at.pane.view()).toBe(REQUESTS_VIEW);
    expect(at.rows()).toEqual([]);
    expect(focused()).toBe(at.pane.ways()[0] ?? null);
  });

  test("each step cleans up the view it leaves, once, and the body is empty after the last", () => {
    const { at } = opened();
    expect([at.pane.mounts, at.pane.cleanups]).toEqual([1, 0]);
    at.rows()[0]?.click();
    expect([at.pane.mounts, at.pane.cleanups]).toEqual([2, 1]);
    expect(at.pane.body.find("toolbar")).toEqual([]);
    at.pane.back();
    expect([at.pane.mounts, at.pane.cleanups]).toEqual([3, 2]);
    expect(at.pane.body.find("req-detail")).toEqual([]);
    at.pane.back();
    expect([at.pane.mounts, at.pane.cleanups]).toEqual([3, 3]);
    expect(at.pane.body.children).toEqual([]);
    // Nothing listens to the log any more.
    at.add(30);
    expect(at.timer.waiting()).toBe(0);
  });

  test("the view opened again starts at the list, never at the request it last showed", () => {
    const { at } = opened();
    at.rows()[0]?.click();
    at.requests.toggle();
    expect(at.pane.view()).toBeNull();
    expect(at.pane.body.children).toEqual([]);
    at.requests.toggle();
    expect(at.pane.view()).toBe(REQUESTS_VIEW);
    expect(at.rows().length).toBe(2);
  });

  test("the head's actions are the view's own, with their tooltips: clear over the list, copy over a request", () => {
    const { at } = opened();
    const labels = () => at.pane.node.find("view-action").map((each) => each.getAttribute("aria-label"));
    expect(labels()).toEqual(["clear"]);
    at.rows()[0]?.click();
    expect(labels()).toEqual(["copy as text for AI"]);
    at.pane.back();
    expect(labels()).toEqual(["clear"]);
    expect(at.pane.tipped).toEqual(["clear", "copy as text for AI", "clear"]);
  });
});

describe("listening", () => {
  test("the list listens while it shows, and stops when the view closes", () => {
    const at = scene();
    at.add(10);
    expect(at.timer.waiting()).toBe(0);
    at.requests.toggle();
    at.add(20);
    expect(at.timer.waiting()).toBe(1);
    at.timer.run();
    at.requests.toggle();
    expect(at.pane.cleanups).toBe(1);
    at.add(30);
    // With no one to tell, the log gathers nothing.
    expect(at.timer.waiting()).toBe(0);
  });

  test("the detail listens in the list's place, and stops too", () => {
    const at = scene();
    at.add(10);
    at.requests.toggle();
    at.rows()[0]?.click();
    expect(at.pane.cleanups).toBe(1);
    at.add(20);
    expect(at.timer.waiting()).toBe(1);
    at.timer.run();
    at.pane.close();
    expect(at.pane.cleanups).toBe(2);
    at.add(30);
    expect(at.timer.waiting()).toBe(0);
  });
});
