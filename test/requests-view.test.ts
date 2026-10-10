import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createStore, type RequestStore } from "../src/requests/store";
import { type RequestEntry, RING_SIZE } from "../src/requests/types";
import { BINDINGS, comboProblem, readKeys, resolveKeys } from "../src/ui/bindings";
import { ACTIONS } from "../src/ui/catalog";
import { comboText, defaultKeys, keyAction, type KeyLike, parseCombo } from "../src/ui/keys";
import { HIDES_NOTE } from "../src/ui/requestdetail";
import { clockTime, copyText, LIGHT_WHY, LONG_BODY } from "../src/ui/requestformat";
import {
  createRequests,
  NO_MATCH,
  NO_REQUESTS,
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
  rows(): FakeNode[];
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
  const rows = () => pane.body.find("req-row");
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
    texts: () =>
      rows().map((row) =>
        ["req-method", "req-path", "req-query", "req-status", "req-time"].map((part) => row.one(part).textContent),
      ),
  };
}

/** The names the rows show, in order, the hidden ones left out. */
function names(at: Scene): string[] {
  return at
    .rows()
    .filter((row) => !row.hidden)
    .map((row) => row.one("req-path").textContent);
}

function type(at: Scene, text: string): void {
  const filter = at.pane.body.one("req-filter");
  filter.value = text;
  filter.fire("input");
}

function chip(at: Scene, label: string): FakeNode {
  const node = at.pane.body.find("chip").find((each) => each.textContent === label);
  if (!node) throw new Error(`no chip ${label}`);
  return node;
}

/** The detail's sections: title, whether open, and the text inside. */
function sections(at: Scene): { title: string; open: boolean; text: string }[] {
  return at.pane.body.find("req-section").map((box) => ({
    title: box.one("row-label").textContent,
    open: box.one("main").getAttribute("aria-expanded") === "true",
    text: box.one("req-inner").textContent,
  }));
}

function section(at: Scene, title: string): FakeNode {
  const box = at.pane.body.find("req-section").find((each) => each.one("row-label").textContent === title);
  if (!box) throw new Error(`no section ${title}`);
  return box;
}

beforeEach(fakeDocument);
afterEach(leaveDocument);

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
    expect(comboText(keys.requests)).toBe("alt+n");
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

  test("the action shows the requests, and closes the pane where they show", () => {
    const at = scene();
    at.requests.toggle();
    expect(at.pane.view()).toBe(REQUESTS_VIEW);
    expect(at.pane.shown()?.title).toBe("requests");
    at.requests.toggle();
    expect(at.pane.view()).toBeNull();
  });

  test("it closes the pane from a request's detail too", () => {
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
    expect(at.rows().map((row) => row.one("req-status").classList.contains("hot"))).toEqual([false, true, false]);
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
    expect(light?.one("req-method").textContent).toBe("img");
    expect(light?.classList.contains("light")).toBe(true);
    expect(light?.title).toBe(`http://cdn.test/img/logo.png\n${LIGHT_WHY}`);
    expect(full?.classList.contains("light")).toBe(false);
    expect(full?.title).toBe("http://app.test/api/item-100");
  });

  test("the frame's rows are told apart only while the page's own are listed too", () => {
    const at = scene();
    at.add(10, { source: "frame" });
    at.requests.toggle();
    const list = at.pane.body.one("req-list");
    expect(list.classList.contains("mixed")).toBe(false);
    at.add(20);
    at.timer.run();
    expect(list.classList.contains("mixed")).toBe(true);
    expect(at.rows().map((row) => row.classList.contains("framed"))).toEqual([false, true]);
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

  test("clear in the pane's head empties the log, and the list at once", () => {
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

  test("comes back as it was, rows and all, after the pane closed", () => {
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
    const pressed = () => at.pane.body.find("chip").map((node) => node.getAttribute("aria-pressed"));
    expect(at.pane.body.find("chip").map((node) => node.textContent)).toEqual(["all", "fetch/xhr", "other"]);
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
    const inView = at.rows()[5];
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

  test("escape empties a filter that has the focus, and only then closes the pane", () => {
    const at = three();
    type(at, "other");
    at.pane.body.one("req-filter").focus();
    at.pane.escape();
    expect(at.pane.view()).toBe(REQUESTS_VIEW);
    expect(at.pane.body.one("req-filter").value).toBe("");
    expect(names(at).length).toBe(3);
    at.pane.escape();
    expect(at.pane.view()).toBeNull();
  });

  test("escape from a row closes the pane, filter or not", () => {
    const at = three();
    type(at, "item");
    at.rows()[0]?.focus();
    at.pane.escape();
    expect(at.pane.view()).toBeNull();
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

  test("the back control goes back too, and the list is where it was", () => {
    const at = scene();
    for (let index = 0; index < 10; index++) at.add(index);
    at.pane.body.scrollHeight = 500;
    at.requests.toggle();
    at.pane.body.scrollTop = 120;
    at.pane.body.fire("scroll");
    at.rows()[3]?.click();
    const back = at.pane.body.one("req-detail").one("main");
    expect(back.getAttribute("aria-label")).toBe("back to requests");
    back.click();
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
    at.pane.body.one("req-detail").one("main").click();
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
    expect(at.pane.body.one("req-detail").one("row-value").textContent).toBe("copied");
    expect(at.said.textContent).toBe("copied");
    expect(note()?.hidden).toBe(false);
    // The pane shows the headers as the page set them.
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
    const word = () => at.pane.body.one("req-detail").one("row-value");
    const note = () => at.pane.body.find("note").find((node) => node.textContent === HIDES_NOTE);
    at.copying.works = false;
    at.pane.act("copy as text for AI");
    await Promise.resolve();
    expect(word().textContent).toBe("copy failed");
    expect(word().classList.contains("hot")).toBe(true);
    expect(note()?.hidden).toBe(true);
    at.copying.works = true;
    at.pane.act("copy as text for AI");
    await Promise.resolve();
    expect(word().textContent).toBe("copied");
    expect(word().classList.contains("hot")).toBe(false);
    expect(note()?.hidden).toBe(false);
    at.pane.close();
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

describe("listening", () => {
  test("the list listens while it shows, and stops when the pane closes", () => {
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
