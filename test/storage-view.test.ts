import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { HTTP_ONLY_NOTE } from "../src/storage/cookies";
import { RENDER_LIMIT } from "../src/storage/format";
import { NO_LIST } from "../src/storage/idb";
import { PRESETS_KEY } from "../src/storage/onload";
import { loadPresets, type Preset, savePresets } from "../src/storage/presets";
import type { PaneView } from "../src/ui/pane";
import { isStorageView, STORAGE_VIEW } from "../src/ui/storageaction";
import { FRESH_PRESETS } from "../src/ui/storagepresets";
import { NOT_READ, POLL_MS, STORAGE_KINDS, storageView, storeViewId } from "../src/ui/storageview";
import { NOT_JSON } from "../src/ui/storageweb";
import { FakeNode, focused, leave, page } from "./kit-dom";
import { type FakeSite, fakeSite, named, type SiteOptions, settle } from "./storage-fakes";

/** A tick the view asked for. */
interface Tick {
  ms: number;
  run(): void;
  stopped: boolean;
}

/** The view, mounted over a fake page, with what it asked of the page. */
interface Shown {
  site: FakeSite;
  body: FakeNode;
  copied: string[];
  ticks: Tick[];
  /** Fire the storage event of another tab. */
  storage(): void;
  visible: boolean;
  escape(): boolean;
  /** Press one of the head's actions. */
  head(label: string): void;
  /** The level that shows: the list of the stores, or the page of one. */
  view(): PaneView;
  /** Take the head's way back, from a store's page to the list. */
  back(): void;
  close(): void;
}

function show(options: SiteOptions & { search?: string } = {}, site = fakeSite(options)): Shown {
  // devknobs keeps its presets in the page's own localStorage, through its gateway.
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      get localStorage() {
        return site.localStorage;
      },
      get sessionStorage() {
        return site.sessionStorage;
      },
      location: { search: options.search ?? "" },
      name: "",
      frameElement: null,
    },
  });
  const listeners = new Set<() => void>();
  const shown: Shown = {
    site,
    body: new FakeNode("div"),
    copied: [],
    ticks: [],
    storage: () => {
      for (const listener of [...listeners]) listener();
    },
    visible: true,
    escape: () => view.escape?.() ?? false,
    head(label) {
      const action = view.actions?.find((entry) => entry.label === label);
      if (!action) throw new Error(`no head action ${label}`);
      action.run();
    },
    view: () => view,
    back() {
      if (!view.back) throw new Error("no way back but to the rows");
      view.back();
    },
    close: () => {},
  };
  let cleanup: (() => void) | null = null;
  /** As the pane does it: the view that leaves is cleaned up, and the next one fills an empty body. */
  const open = (next: PaneView): void => {
    cleanup?.();
    shown.body.replaceChildren();
    view = next;
    const made = next.mount(shown.body as unknown as HTMLElement);
    cleanup = typeof made === "function" ? made : null;
  };
  let view = storageView({
    site,
    copy: async (text) => {
      shown.copied.push(text);
      return true;
    },
    every(ms, run) {
      const tick: Tick = { ms, run, stopped: false };
      shown.ticks.push(tick);
      return () => {
        tick.stopped = true;
      };
    },
    onStorage(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    visible: () => shown.visible,
    now: () => 1_000_000,
    open,
  });
  open(view);
  shown.close = () => {
    cleanup?.();
    cleanup = null;
  };
  return shown;
}

/** The rows of the list of stores, as their boxes. */
function stores(shown: Shown): FakeNode[] {
  return shown.body.find("row").filter((box) => box.find("turn").length === 0);
}

/** A store's row in the list of them, by its name. */
function store(shown: Shown, label: string): FakeNode {
  const found = stores(shown).find((box) => box.find("row-label")[0]?.textContent === label);
  if (!found) throw new Error(`no store ${label}`);
  return found;
}

/** What a store's row says the store holds. */
function holds(shown: Shown, label: string): string {
  return store(shown, label).find("row-value")[0]?.textContent ?? "";
}

/** Show a store, by its row in the list, going back to the list first from another store's page. */
async function pick(shown: Shown, label: string): Promise<void> {
  if (shown.view().id !== STORAGE_VIEW) shown.back();
  store(shown, label).find("main")[0]?.fire("click");
  await settle();
}

/** The bar of a store's page. */
function bar(shown: Shown): FakeNode {
  const [node] = shown.body.children;
  if (!node || node.className !== "toolbar") throw new Error("no bar");
  return node;
}

/** A control of the question asked in place, by what it says, not the bar's of the same name. */
function answer(shown: Shown, label: string): FakeNode {
  const [asked] = shown.body.find("ask");
  if (!asked) throw new Error("nothing asked");
  return chip(asked, label);
}

/** The line a list ends with while it has some of devknobs' own. */
function ownLine(shown: Shown): FakeNode | undefined {
  return shown.body.find("note-button")[0];
}

/** A small text control, by what it says. */
function chip(root: FakeNode, label: string): FakeNode {
  const found = root.find("chip").find((node) => node.textContent === label);
  if (!found) throw new Error(`no control ${label}: ${root.find("chip").map((node) => node.textContent).join(", ")}`);
  return found;
}

function chips(root: FakeNode): string[] {
  return root.find("chip").map((node) => node.textContent);
}

/** The rows of the list that shows, as their boxes. */
function rows(shown: Shown): FakeNode[] {
  return shown.body.find("row").filter((row) => row.find("turn").length > 0);
}

/** A row by its label. */
function row(shown: Shown, label: string): FakeNode {
  const found = shown.body.find("row").find((box) => box.find("row-label")[0]?.textContent === label);
  if (!found) throw new Error(`no row ${label}: ${labels(shown).join(", ")}`);
  return found;
}

function labels(shown: Shown): string[] {
  return rows(shown).map((box) => box.find("row-label")[0]?.textContent ?? "");
}

/** Fold a row out, or away. */
function toggle(box: FakeNode): void {
  box.find("main")[0]?.fire("click");
}

/** The control of the open text box, by what it says, not the one over the rows of the same name. */
function boxChip(shown: Shown, label: string): FakeNode {
  const box = shown.body.find("stack").find((node) => node.children.some((child) => child.classes().includes("field-area")));
  if (!box) throw new Error("no open text box");
  return chip(box, label);
}

/** What the section that shows says in its quiet lines, without the view's own line over it. */
function said(shown: Shown): string[] {
  return notes(shown.body.children[2] ?? shown.body);
}

/** The quiet lines under a node, without the ones that are controls. */
function notes(root: FakeNode): string[] {
  return root.find("note").filter((node) => node.tag !== "button").map((node) => node.textContent);
}

function filterOf(shown: Shown): FakeNode {
  const [filter] = shown.body.find("filter");
  if (!filter) throw new Error("no filter");
  return filter;
}

function type(shown: Shown, text: string): void {
  const filter = filterOf(shown);
  filter.value = text;
  filter.fire("input");
}

function area(root: FakeNode): FakeNode {
  const [box] = root.find("field-area");
  if (!box) throw new Error("no text box");
  return box;
}

beforeEach(page);
afterEach(() => {
  leave();
  Reflect.deleteProperty(globalThis, "window");
});

const ITEMS = { token: "abc", user: '{"id":1,"tags":["a"]}', devknobs: "{}", "devknobs:keys": "{}" };

/** A page with a database of two stores and two caches. */
function deep(options: SiteOptions = {}): FakeSite {
  const site = fakeSite(options);
  site.idb.add("shop", 3, {
    carts: { keyPath: "id", autoIncrement: true, indexes: ["byUser"], records: [[1, { id: 1, when: new Date(0) }]] },
    events: { records: Array.from({ length: 120 }, (_, at): [unknown, unknown] => [at, { at }]) },
  });
  site.cached.caches.set(
    "pages",
    Array.from({ length: 240 }, (_, at) => ({
      url: `https://app.example.com/p/${at}`,
      type: "text/html; charset=utf-8",
      length: "1024",
    })),
  );
  return site;
}

/** The view on its list of stores, whichever store it showed last. */
async function listed(options: SiteOptions & { search?: string } = {}, site?: FakeSite): Promise<Shown> {
  const shown = show(options, site);
  if (shown.view().id !== STORAGE_VIEW) shown.back();
  await settle();
  return shown;
}

describe("the list of stores", () => {
  test("has a row a store, by its full name, with its icon, on the knob rows' columns", async () => {
    const shown = await listed();
    expect(shown.view()).toMatchObject({ id: STORAGE_VIEW, title: "storage", layout: "rows" });
    expect(shown.view().back).toBeUndefined();
    expect(STORAGE_KINDS.map((kind) => kind.value)).toEqual([
      "local",
      "session",
      "cookies",
      "indexeddb",
      "cache",
      "presets",
    ]);
    expect(stores(shown).map((box) => box.find("row-label")[0]?.textContent)).toEqual([
      "local storage",
      "session storage",
      "cookies",
      "IndexedDB",
      "cache storage",
      "presets",
    ]);
    for (const box of stores(shown)) {
      const [main] = box.find("main");
      expect(main?.tag).toBe("button");
      expect(main?.children.map((child) => child.className)).toEqual(["glyph", "row-label", "row-value idle"]);
    }
    // No bar, no segments and no filter: the list is rows alone.
    expect(shown.body.find("toolbar")).toEqual([]);
    expect(shown.body.find("seg")).toEqual([]);
    expect(shown.body.find("filter")).toEqual([]);
  });

  test("a row says what its store holds: how many and how much, without devknobs' own", async () => {
    const site = deep({ local: ITEMS, session: { step: "2" } });
    site.jar.put({ name: "theme", value: "dark" });
    site.jar.put({ name: "sid", value: "1" });
    const shown = await listed({}, site);
    savePresets([PRESET]);
    shown.head("refresh");
    await settle();
    expect(holds(shown, "local storage")).toBe("2 items · 24 B");
    expect(holds(shown, "session storage")).toBe("1 item · 1 B");
    expect(holds(shown, "cookies")).toBe("2 cookies · 13 B");
    expect(holds(shown, "IndexedDB")).toBe("1 database");
    expect(holds(shown, "cache storage")).toBe("1 cache");
    expect(holds(shown, "presets")).toBe("1 preset");
    for (const box of stores(shown)) expect(box.find("row-value")[0]?.className).toBe("row-value");
  });

  test("a store with nothing says so quietly, as a row's value at its default is", async () => {
    const shown = await listed({ local: { devknobs: "{}" } });
    expect(stores(shown).map((box) => box.find("row-value")[0]?.textContent)).toEqual([
      "no items",
      "no items",
      "no cookies",
      "no databases",
      "no caches",
      "no presets",
    ]);
    for (const box of stores(shown)) expect(box.find("row-value")[0]?.className).toBe("row-value idle");
  });

  test("a store that cannot be read says so, with why in its tooltip", async () => {
    const shown = await listed({}, { ...deep({ listable: false }), isSecureContext: false } as FakeSite);
    expect(holds(shown, "IndexedDB")).toBe(NOT_READ);
    expect(store(shown, "IndexedDB").find("row-value")[0]?.title).toBe(NO_LIST);
    expect(holds(shown, "cache storage")).toBe(NOT_READ);
    expect(store(shown, "cache storage").find("row-value")[0]?.title).toBe(
      "Cache Storage needs a secure page (https or localhost)",
    );
    expect(store(shown, "IndexedDB").find("row-value")[0]?.className).toBe("row-value idle");
  });

  test("under the rows a quiet line says which presets apply on load", async () => {
    const site = fakeSite();
    const shown = await listed({}, site);
    expect(notes(shown.body)).toEqual(["no preset applies on load"]);
    expect(shown.body.children[2]?.find("note")).toHaveLength(1);
    savePresets([{ ...PRESET, onLoad: true }]);
    shown.head("refresh");
    await settle();
    expect(notes(shown.body)).toEqual(["applies on every load of this page: logged in"]);
    const fresh = await listed({ search: "?devknobs=fresh" });
    expect(notes(fresh.body)).toEqual([FRESH_PRESETS]);
    expect(holds(fresh, "presets")).toBe(NOT_READ);
  });

  test("stays live: the web storages and the cookies on a tick, the databases and caches on refresh", async () => {
    const site = deep({ local: { a: "1" } });
    const shown = await listed({}, site);
    const live = shown.ticks.filter((tick) => !tick.stopped);
    expect(live.map((tick) => tick.ms)).toEqual([POLL_MS]);
    site.localStorage.setItem("b", "22");
    site.jar.put({ name: "late", value: "1" });
    site.idb.add("later", 1, {});
    live[0]?.run();
    await settle();
    expect(holds(shown, "local storage")).toBe("2 items · 3 B");
    expect(holds(shown, "cookies")).toBe("1 cookie · 5 B");
    expect(holds(shown, "IndexedDB")).toBe("1 database");
    shown.head("refresh");
    await settle();
    expect(holds(shown, "IndexedDB")).toBe("2 databases");
    // Out of sight it reads nothing, and another tab's write is heard.
    shown.visible = false;
    site.localStorage.calls = 0;
    live[0]?.run();
    expect(site.localStorage.calls).toBe(0);
    site.sessionStorage.map.set("from-another-tab", "1");
    shown.storage();
    await settle();
    expect(holds(shown, "session storage")).toBe("1 item · 1 B");
    shown.close();
    expect(shown.ticks.filter((tick) => !tick.stopped)).toEqual([]);
  });

  test("the keys: arrows move over the rows, and enter opens one as its line is a button", async () => {
    const shown = await listed();
    const [list] = shown.body.find("st-list");
    const mains = stores(shown).map((box) => box.find("main")[0]);
    expect(mains[0]?.fire("keydown", { key: "ArrowDown" }, list).prevented).toBe(true);
    expect(focused()).toBe(mains[1] ?? null);
    // No row of the list can be deleted.
    expect(mains[1]?.fire("keydown", { key: "Delete" }, list).prevented).toBe(false);
  });

  test("clear site data asks in the list, keeps devknobs' own, and the rows say what is left", async () => {
    const site = deep({ local: ITEMS });
    const shown = await listed({}, site);
    shown.head("clear site data");
    await settle();
    expect(notes(shown.body)[0]).toBe(
      "clear site data? 2 local, 1 database, 1 cache. devknobs' own items are kept",
    );
    expect(focused()?.textContent).toBe("clear site data");
    expect(shown.escape()).toBe(true);
    expect(site.localStorage.map.size).toBe(4);
    // With nothing left to take back, escape is the panel's.
    expect(shown.escape()).toBe(false);
    shown.head("clear site data");
    await settle();
    answer(shown, "clear site data").fire("click");
    await settle(20);
    expect(site.localStorage.all()).toEqual({ devknobs: "{}", "devknobs:keys": "{}" });
    expect(notes(shown.body)[0]).toBe("cleared 2 local, 1 database, 1 cache");
    expect(holds(shown, "local storage")).toBe("no items");
    expect(holds(shown, "IndexedDB")).toBe("no databases");
    expect(chips(shown.body)).toEqual(["reload the page"]);
  });
});

describe("a store's page", () => {
  test("is a view of its own, under the store's full name, whose way back is the list", async () => {
    const shown = await listed({ local: ITEMS });
    for (const kind of STORAGE_KINDS) {
      await pick(shown, kind.label);
      expect(shown.view()).toMatchObject({ id: storeViewId(kind.value), title: kind.label, layout: "flush" });
      expect(isStorageView(shown.view().id)).toBe(true);
      expect(shown.view().actions?.map((action) => action.label)).toEqual(["refresh", "clear site data"]);
    }
    expect(isStorageView(STORAGE_VIEW)).toBe(true);
    expect(isStorageView("storages")).toBe(false);
    expect(isStorageView(null)).toBe(false);
    await pick(shown, "cookies");
    // Escape takes nothing back here, so the panel takes the way back: to the list, on the row it left.
    expect(shown.escape()).toBe(false);
    shown.back();
    expect(shown.view().id).toBe(STORAGE_VIEW);
    expect(focused()).toBe(store(shown, "cookies").find("main")[0] ?? null);
    expect(stores(shown)).toHaveLength(6);
  });

  test("has the filter on a line of its own, then the store's own controls, in the kit's bar", async () => {
    const shown = await listed({ local: ITEMS });
    const lines: Record<string, string[]> = {
      "local storage": ["add", "clear", "save as preset"],
      "session storage": ["add", "clear", "save as preset"],
      cookies: ["add", "clear", "save as preset"],
      IndexedDB: [],
      "cache storage": [],
      presets: ["save current as preset", "new preset", "import"],
    };
    for (const [label, controls] of Object.entries(lines)) {
      await pick(shown, label);
      const classes = bar(shown).children.map((child) => child.className);
      expect([label, classes]).toEqual([label, controls.length > 0 ? ["field filter", "chips"] : ["field filter"]]);
      expect([label, chips(bar(shown))]).toEqual([label, controls]);
      expect(filterOf(shown).attributes.get("aria-label")).toBe(`filter ${label}`);
      // No segments switch the store, and no control of the bar is for the list.
      expect(bar(shown).find("seg")).toEqual([]);
    }
    await pick(shown, "local storage");
  });

  test("the view opens again on the store it last showed, with the list one step back", async () => {
    const first = await listed();
    await pick(first, "cookies");
    first.close();
    const again = show();
    await settle();
    expect(again.view().id).toBe(storeViewId("cookies"));
    again.back();
    expect(again.view().id).toBe(STORAGE_VIEW);
    again.close();
    // Left on the list, it opens on the list.
    expect(show().view().id).toBe(STORAGE_VIEW);
  });

  test("a key and its value stand on the same two columns in every row, the key whole in its tooltip", async () => {
    const long = "a-very-long-key-that-will-not-fit-the-column-it-stands-on";
    const shown = await listed({ local: { [long]: "1", b: "2" } });
    await pick(shown, "local storage");
    for (const box of rows(shown)) {
      const [main] = box.find("main");
      expect(main?.children.map((child) => child.className)).toEqual([
        "turn",
        "row-label cell-name columned",
        "cell-value",
        "cell-end",
      ]);
    }
    expect(row(shown, long).find("row-label")[0]?.title).toBe(long);
  });
});

describe("local and session storage", () => {
  test("a row a key: the key, a one-line preview and the size, devknobs' own hidden", async () => {
    const shown = show({ local: ITEMS, session: { step: "2" } });
    await pick(shown, "local storage");
    expect(labels(shown)).toEqual(["token", "user"]);
    const user = row(shown, "user");
    expect(user.find("row-label")[0]?.className).toBe("row-label cell-name columned");
    expect(user.find("cell-value")[0]?.textContent).toBe('{"id":1,"tags":["a"]}');
    expect(user.find("cell-end")[0]?.textContent).toBe("21 B");
    expect(filterOf(shown).placeholder).toBe("filter 2 items");
    await pick(shown, "session storage");
    expect(labels(shown)).toEqual(["step"]);
    expect(filterOf(shown).placeholder).toBe("filter 1 item");
  });

  test("devknobs' own show once asked for, told by their fainter key alone", async () => {
    const shown = show({ local: ITEMS });
    await pick(shown, "local storage");
    // The line is the last of the page, a quiet button, and no control of the bar.
    const line = ownLine(shown);
    expect(line?.tag).toBe("button");
    expect(line?.className).toBe("note note-button");
    expect(line?.textContent).toBe("2 hidden (devknobs' own)");
    expect(shown.body.children[shown.body.children.length - 1]?.children).toEqual([line as FakeNode]);
    expect(chips(bar(shown))).toEqual(["add", "clear", "save as preset"]);
    line?.fire("click");
    expect(ownLine(shown)).toBe(line as FakeNode);
    expect(labels(shown)).toEqual(["token", "user", "devknobs", "devknobs:keys"]);
    expect(row(shown, "devknobs").find("row-label")[0]?.className).toBe("row-label cell-name columned quiet");
    expect(filterOf(shown).placeholder).toBe("filter 4 items");
    expect(ownLine(shown)?.textContent).toBe("hide devknobs' own");
    ownLine(shown)?.fire("click");
    expect(labels(shown)).toEqual(["token", "user"]);
    expect(ownLine(shown)?.textContent).toBe("2 hidden (devknobs' own)");
  });

  test("a row folds out in place to the whole value, json laid out where that loses nothing", async () => {
    const shown = show({ local: { ...ITEMS, big: '{"id":12345678901234567890}' } });
    await pick(shown, "local storage");
    const user = row(shown, "user");
    expect(user.find("code")).toEqual([]);
    toggle(user);
    expect(user.className).toBe("row open");
    expect(user.find("code-text")[0]?.textContent).toBe('{\n  "id": 1,\n  "tags": [\n    "a"\n  ]\n}');
    expect(chips(user)).toEqual(["copy value", "edit", "duplicate", "delete"]);
    const big = row(shown, "big");
    toggle(big);
    expect(big.find("code-text")[0]?.textContent).toBe('{"id":12345678901234567890}');
  });

  test("nothing is copied by itself: the copy control and a click on the value are the ways out", async () => {
    const shown = show({ local: ITEMS });
    await pick(shown, "local storage");
    const user = row(shown, "user");
    toggle(user);
    expect(shown.copied).toEqual([]);
    chip(user, "copy value").fire("click");
    user.find("code")[0]?.fire("click");
    await settle();
    // The value as it is kept, not as it is laid out.
    expect(shown.copied).toEqual([ITEMS.user, ITEMS.user]);
    expect(notes(shown.body)).toContain("copied user");
  });

  test("edit turns the value into a text box, and save writes it", async () => {
    const shown = show({ local: ITEMS });
    await pick(shown, "local storage");
    const token = row(shown, "token");
    toggle(token);
    chip(token, "edit").fire("click");
    const box = area(token);
    expect(box.tag).toBe("textarea");
    expect(box.value).toBe("abc");
    expect(focused()).toBe(box);
    expect(chips(token)).toEqual(["save", "cancel"]);
    box.value = "xyz";
    chip(token, "save").fire("click");
    expect(shown.site.localStorage.getItem("token")).toBe("xyz");
    expect(row(shown, "token").find("cell-value")[0]?.textContent).toBe("xyz");
    expect(row(shown, "token").find("code-text")[0]?.textContent).toBe("xyz");
  });

  test("enter with meta or ctrl saves, and a bare enter is a new line", async () => {
    const shown = show({ local: ITEMS });
    await pick(shown, "local storage");
    const token = row(shown, "token");
    toggle(token);
    chip(token, "edit").fire("click");
    const box = area(token);
    box.value = "one";
    expect(box.fire("keydown", { key: "Enter" }).prevented).toBe(false);
    expect(shown.site.localStorage.getItem("token")).toBe("abc");
    expect(box.fire("keydown", { key: "Enter", metaKey: true }).prevented).toBe(true);
    expect(shown.site.localStorage.getItem("token")).toBe("one");
  });

  test("cancel, and escape, leave the value as it was, and escape does not close the view", async () => {
    const shown = show({ local: ITEMS });
    await pick(shown, "local storage");
    const token = row(shown, "token");
    toggle(token);
    chip(token, "edit").fire("click");
    area(token).value = "changed";
    chip(token, "cancel").fire("click");
    expect(shown.site.localStorage.getItem("token")).toBe("abc");
    expect(token.find("field-area")).toEqual([]);
    chip(token, "edit").fire("click");
    area(token).value = "changed";
    expect(shown.escape()).toBe(true);
    expect(token.find("field-area")).toEqual([]);
    expect(token.find("code-text")[0]?.textContent).toBe("abc");
    expect(shown.site.localStorage.getItem("token")).toBe("abc");
    // With nothing left to take back, escape is the panel's.
    expect(shown.escape()).toBe(false);
  });

  test("json that no longer parses is still saved, as text, and a quiet line says so", async () => {
    const shown = show({ local: ITEMS });
    await pick(shown, "local storage");
    const user = row(shown, "user");
    toggle(user);
    chip(user, "edit").fire("click");
    area(user).value = '{"id":1,';
    chip(user, "save").fire("click");
    expect(shown.site.localStorage.getItem("user")).toBe('{"id":1,');
    expect(NOT_JSON).toBe("saved as text, not valid JSON");
    expect(notes(shown.body)).toContain(NOT_JSON);
  });

  test("plain text saved over plain text says nothing", async () => {
    const shown = show({ local: ITEMS });
    await pick(shown, "local storage");
    const token = row(shown, "token");
    toggle(token);
    chip(token, "edit").fire("click");
    area(token).value = "plain";
    chip(token, "save").fire("click");
    expect(notes(shown.body)).not.toContain(NOT_JSON);
  });

  test("a full storage is a line under the box, which stays as typed", async () => {
    const shown = show({ local: ITEMS });
    await pick(shown, "local storage");
    const token = row(shown, "token");
    toggle(token);
    chip(token, "edit").fire("click");
    area(token).value = "too much";
    shown.site.localStorage.refuse = named("QuotaExceededError");
    chip(token, "save").fire("click");
    expect(notes(token)).toEqual(["cannot save token: the storage is full"]);
    expect(area(token).value).toBe("too much");
  });

  test("delete removes the key at once", async () => {
    const shown = show({ local: ITEMS });
    await pick(shown, "local storage");
    const token = row(shown, "token");
    toggle(token);
    chip(token, "delete").fire("click");
    expect(shown.site.localStorage.getItem("token")).toBeNull();
    expect(labels(shown)).toEqual(["user"]);
  });

  test("one of devknobs' own asks once before it is edited or deleted", async () => {
    const shown = show({ local: ITEMS });
    await pick(shown, "local storage");
    ownLine(shown)?.fire("click");
    const own = row(shown, "devknobs");
    toggle(own);
    chip(own, "delete").fire("click");
    expect(notes(own)).toEqual(["devknobs is devknobs' own. delete it anyway?"]);
    expect(shown.site.localStorage.getItem("devknobs")).toBe("{}");
    chip(own, "cancel").fire("click");
    expect(chips(own)).toEqual(["copy value", "edit", "duplicate", "delete"]);
    chip(own, "edit").fire("click");
    expect(own.find("field-area")).toEqual([]);
    chip(own, "edit").fire("click");
    expect(area(own).value).toBe("{}");
    expect(shown.escape()).toBe(true);
    chip(own, "delete").fire("click");
    chip(own, "delete").fire("click");
    expect(shown.site.localStorage.getItem("devknobs")).toBeNull();
  });

  test("duplicate adds the key again as a copy", async () => {
    const shown = show({ local: { token: "abc", "token copy": "x" } });
    await pick(shown, "local storage");
    const token = row(shown, "token");
    toggle(token);
    chip(token, "duplicate").fire("click");
    expect(shown.site.localStorage.all()).toEqual({ token: "abc", "token copy": "x", "token copy 2": "abc" });
    expect(labels(shown)).toEqual(["token", "token copy", "token copy 2"]);
  });

  test("add takes key=value lines, or a json object of several keys", async () => {
    const shown = show({ session: {} });
    await pick(shown, "session storage");
    chip(shown.body, "add").fire("click");
    const box = area(shown.body);
    box.value = "nope";
    // Pressing add again opens no second box: the one that is open keeps what is typed.
    chip(shown.body, "add").fire("click");
    expect(shown.body.find("field-area")).toHaveLength(1);
    expect(area(shown.body).value).toBe("nope");
    boxChip(shown, "add").fire("click");
    expect(notes(shown.body)).toContain("write key=value, a line each, or a json object of keys");
    box.value = "a=1\nb=two";
    box.fire("keydown", { key: "Enter", ctrlKey: true });
    expect(shown.site.sessionStorage.all()).toEqual({ a: "1", b: "two" });
    expect(labels(shown)).toEqual(["a", "b"]);
    chip(shown.body, "add").fire("click");
    area(shown.body).value = '{"c":"3","d":{"e":1}}';
    boxChip(shown, "add").fire("click");
    expect(shown.site.sessionStorage.all()).toEqual({ a: "1", b: "two", c: "3", d: '{"e":1}' });
  });

  test("clear is the bar's, and asks once, in the view, with the count", async () => {
    const shown = show({ local: ITEMS });
    await pick(shown, "local storage");
    chip(bar(shown), "clear").fire("click");
    expect(notes(shown.body)).toContain("clear 2 items?");
    expect(focused()).toBe(answer(shown, "clear"));
    answer(shown, "cancel").fire("click");
    expect(notes(shown.body)).not.toContain("clear 2 items?");
    expect(shown.site.localStorage.map.size).toBe(4);
    chip(bar(shown), "clear").fire("click");
    expect(shown.escape()).toBe(true);
    expect(shown.site.localStorage.map.size).toBe(4);
    chip(bar(shown), "clear").fire("click");
    answer(shown, "clear").fire("click");
    // devknobs' own stay.
    expect(shown.site.localStorage.all()).toEqual({ devknobs: "{}", "devknobs:keys": "{}" });
    expect(labels(shown)).toEqual([]);
    expect(shown.body.find("empty")[0]?.textContent).toBe("nothing in localStorage");
    expect(ownLine(shown)?.textContent).toBe("2 hidden (devknobs' own)");
    chip(bar(shown), "clear").fire("click");
    expect(notes(shown.body)).toEqual(["nothing to clear in localStorage"]);
  });

  test("the filter matches the key or the value, over the data", async () => {
    const shown = show({ local: { Token: "abc", theme: "DARK", other: "x" } });
    await pick(shown, "local storage");
    type(shown, "dark");
    expect(labels(shown)).toEqual(["theme"]);
    type(shown, "TOK");
    expect(labels(shown)).toEqual(["Token"]);
    type(shown, "zzz");
    expect(shown.body.find("empty")[0]?.textContent).toBe("nothing matches");
    // Escape clears the filter before it leaves the view.
    expect(shown.escape()).toBe(true);
    expect(labels(shown)).toEqual(["Token", "theme", "other"]);
    expect(shown.escape()).toBe(false);
  });

  test("a long list is built two hundred rows at a time", async () => {
    const many = Object.fromEntries(Array.from({ length: 450 }, (_, at) => [`key-${at}`, `v${at}`]));
    const shown = show({ local: many });
    await pick(shown, "local storage");
    expect(rows(shown)).toHaveLength(200);
    expect(notes(shown.body)).toContain("200 of 450");
    chip(shown.body, "show 200 more").fire("click");
    expect(rows(shown)).toHaveLength(400);
    chip(shown.body, "show 50 more").fire("click");
    expect(rows(shown)).toHaveLength(450);
    expect(chips(shown.body)).not.toContain("show 50 more");
    // The filter runs over all of it, not over what is built.
    type(shown, "key-449");
    expect(labels(shown)).toEqual(["key-449"]);
  });

  test("a huge value is cut, shown whole on demand, and past a megabyte only copied", async () => {
    const long = "x".repeat(RENDER_LIMIT + 10);
    const huge = "y".repeat(1_000_001);
    const shown = show({ local: { long, huge } });
    await pick(shown, "local storage");
    const first = row(shown, "long");
    toggle(first);
    expect(first.find("code-text")[0]?.textContent.length).toBe(RENDER_LIMIT);
    expect(notes(first)).toEqual(["10 more characters"]);
    chip(first, "show all").fire("click");
    expect(first.find("code-text")[0]?.textContent.length).toBe(RENDER_LIMIT + 10);
    const second = row(shown, "huge");
    toggle(second);
    expect(second.find("code-text")[0]?.textContent.length).toBe(RENDER_LIMIT);
    expect(chips(second)).not.toContain("show all");
    expect(notes(second)[0]).toContain("too long to show: copy it to read the rest");
    chip(second, "copy value").fire("click");
    await settle();
    expect(shown.copied[0]?.length).toBe(1_000_001);
  });

  test("a storage the browser blocks is one calm line", async () => {
    const site = fakeSite();
    Object.defineProperty(site, "sessionStorage", {
      get() {
        throw named("SecurityError");
      },
    });
    const shown = show({}, site);
    await pick(shown, "local storage");
    await pick(shown, "session storage");
    expect(notes(shown.body)).toEqual(["cannot read sessionStorage: the browser blocks storage on this page"]);
    expect(rows(shown)).toEqual([]);
  });

  test("the keys: arrows move over the rows, and delete asks in place", async () => {
    const shown = show({ local: { a: "1", b: "2", c: "3" } });
    await pick(shown, "local storage");
    const [list] = shown.body.find("st-list").filter((node) => node.children.some((child) => child.className === "row"));
    const mains = rows(shown).map((box) => box.find("main")[0]);
    expect(mains[0]?.fire("keydown", { key: "ArrowDown" }, list).prevented).toBe(true);
    expect(focused()).toBe(mains[1] ?? null);
    mains[1]?.fire("keydown", { key: "ArrowUp" }, list);
    expect(focused()).toBe(mains[0] ?? null);
    mains[1]?.fire("keydown", { key: "Delete" }, list);
    const b = row(shown, "b");
    expect(b.className).toBe("row open");
    expect(notes(b)).toEqual(["delete b?"]);
    expect(shown.site.localStorage.getItem("b")).toBe("2");
    chip(b, "delete").fire("click");
    expect(shown.site.localStorage.all()).toEqual({ a: "1", c: "3" });
    rows(shown)[0]?.find("main")[0]?.fire("keydown", { key: "Backspace" }, list);
    expect(notes(row(shown, "a"))).toEqual(["delete a?"]);
    expect(shown.escape()).toBe(true);
    expect(shown.site.localStorage.getItem("a")).toBe("1");
  });
});

describe("staying live", () => {
  test("the tick runs once a second while a live store shows, and stops with its page and the view", async () => {
    const shown = show({ local: ITEMS });
    await pick(shown, "local storage");
    const live = shown.ticks.filter((tick) => !tick.stopped);
    expect(live).toHaveLength(1);
    expect(live[0]?.ms).toBe(POLL_MS);
    expect(POLL_MS).toBe(1000);
    for (const label of ["IndexedDB", "cache storage", "presets"]) {
      await pick(shown, label);
      expect([label, shown.ticks.filter((tick) => !tick.stopped)]).toEqual([label, []]);
    }
    await pick(shown, "session storage");
    expect(shown.ticks.filter((tick) => !tick.stopped)).toHaveLength(1);
    shown.close();
    expect(shown.ticks.filter((tick) => !tick.stopped)).toEqual([]);
    await pick(show(), "local storage");
  });

  test("a write by the page shows on the next tick, and rows that did not change are left as they are", async () => {
    const shown = show({ local: { a: "1", b: "2" } });
    await pick(shown, "local storage");
    const before = rows(shown);
    const [tick] = shown.ticks.filter((entry) => !entry.stopped);
    tick?.run();
    expect(rows(shown)[0]).toBe(before[0] as FakeNode);
    expect(rows(shown)[1]).toBe(before[1] as FakeNode);
    // The page writes, in this tab, where no event says so.
    shown.site.localStorage.setItem("b", "changed");
    shown.site.localStorage.setItem("c", "3");
    tick?.run();
    expect(labels(shown)).toEqual(["a", "b", "c"]);
    expect(rows(shown)[0]).toBe(before[0] as FakeNode);
    expect(rows(shown)[1]).not.toBe(before[1]);
    expect(row(shown, "b").find("cell-value")[0]?.textContent).toBe("changed");
  });

  test("a view out of sight reads nothing on its tick", async () => {
    const shown = show({ local: { a: "1" } });
    await pick(shown, "local storage");
    const [tick] = shown.ticks.filter((entry) => !entry.stopped);
    shown.visible = false;
    shown.site.localStorage.calls = 0;
    tick?.run();
    expect(shown.site.localStorage.calls).toBe(0);
    shown.visible = true;
    tick?.run();
    expect(shown.site.localStorage.calls).toBeGreaterThan(0);
  });

  test("another tab's write is heard through the storage event", async () => {
    const shown = show({ local: { a: "1" } });
    await pick(shown, "local storage");
    shown.site.localStorage.map.set("from-another-tab", "1");
    shown.storage();
    expect(labels(shown)).toEqual(["a", "from-another-tab"]);
    shown.close();
    shown.site.localStorage.map.set("later", "1");
    shown.storage();
    expect(labels(shown)).toEqual(["a", "from-another-tab"]);
  });

  test("a box being typed in is not drawn over by a tick", async () => {
    const shown = show({ local: { a: "1" } });
    await pick(shown, "local storage");
    const a = row(shown, "a");
    toggle(a);
    chip(a, "edit").fire("click");
    area(a).value = "typing";
    shown.site.localStorage.setItem("a", "page wrote");
    shown.ticks.find((tick) => !tick.stopped)?.run();
    expect(area(row(shown, "a")).value).toBe("typing");
    chip(a, "cancel").fire("click");
    expect(row(shown, "a").find("cell-value")[0]?.textContent).toBe("page wrote");
  });

  test("the page's storage is never wrapped or patched", async () => {
    const site = fakeSite({ local: ITEMS });
    const methods = [site.localStorage.setItem, site.localStorage.getItem, site.localStorage.removeItem];
    const factory = site.indexedDB;
    const open = factory?.open;
    const shown = show({}, site);
    for (const kind of STORAGE_KINDS) await pick(shown, kind.label);
    await pick(shown, "local storage");
    shown.close();
    expect([site.localStorage.setItem, site.localStorage.getItem, site.localStorage.removeItem]).toEqual(methods);
    expect(Object.keys(site.localStorage)).toEqual(["map", "refuse", "calls"]);
    expect(site.indexedDB).toBe(factory);
    expect(site.indexedDB?.open).toBe(open as NonNullable<typeof open>);
  });
});

describe("cookies", () => {
  test("the line about HttpOnly is always on top", async () => {
    const empty = show();
    await pick(empty, "cookies");
    expect(notes(empty.body)[0]).toBe(HTTP_ONLY_NOTE);
    expect(empty.body.find("empty")[0]?.textContent).toBe("no cookies a page can read");
    const site = fakeSite();
    site.jar.put({ name: "session", value: "secret", httpOnly: true });
    site.jar.put({ name: "theme", value: "dark" });
    const shown = show({}, site);
    await pick(shown, "cookies");
    expect(notes(shown.body)[0]).toBe(HTTP_ONLY_NOTE);
    expect(labels(shown)).toEqual(["theme"]);
    type(shown, "nothing like it");
    expect(notes(shown.body)[0]).toBe(HTTP_ONLY_NOTE);
  });

  test("with a cookie store, a row folds out to its fields in two columns", async () => {
    const site = fakeSite({ cookieStore: true });
    site.jar.put({
      name: "sid",
      value: "abc",
      path: "/shop",
      domain: "example.com",
      expires: 1_000_000 + 3 * 86_400_000 + 5000,
      secure: true,
      sameSite: "strict",
    });
    const shown = show({}, site);
    await pick(shown, "cookies");
    const sid = row(shown, "sid");
    expect(sid.find("cell-value")[0]?.textContent).toBe("abc");
    toggle(sid);
    const [list] = sid.find("pairs");
    expect(list?.tag).toBe("dl");
    const texts = list?.children.map((child) => child.textContent) ?? [];
    expect(texts).toEqual([
      "name",
      "sid",
      "domain",
      "example.com",
      "path",
      "/shop",
      "expires",
      "1970-01-04T00:16:45.000Z, in 3 days",
      "secure",
      "yes",
      "sameSite",
      "strict",
    ]);
    expect(chips(sid)).toEqual(["copy value", "edit", "delete"]);
    expect(filterOf(shown).placeholder).toBe("filter 1 cookie");
  });

  test("without one, a row says only what is known, and says so", async () => {
    const site = fakeSite();
    site.jar.put({ name: "theme", value: "dark", path: "/shop" });
    const shown = show({}, site);
    await pick(shown, "cookies");
    const theme = row(shown, "theme");
    toggle(theme);
    expect(theme.find("pairs")[0]?.children.map((child) => child.textContent)).toEqual(["name", "theme"]);
    expect(notes(theme)).toEqual(["this browser does not tell a cookie's path, domain or expiry"]);
  });

  test("edit and delete write document.cookie at the cookie's own path and domain", async () => {
    const site = fakeSite({ cookieStore: true });
    site.jar.put({ name: "sid", value: "old", path: "/shop", domain: "example.com" });
    const shown = show({}, site);
    await pick(shown, "cookies");
    const sid = row(shown, "sid");
    toggle(sid);
    chip(sid, "edit").fire("click");
    area(sid).value = "new";
    chip(sid, "save").fire("click");
    await settle();
    expect(site.jar.writes).toEqual(["sid=new; path=/shop; domain=example.com; samesite=lax"]);
    expect(row(shown, "sid").find("cell-value")[0]?.textContent).toBe("new");
    toggle(row(shown, "sid"));
    toggle(row(shown, "sid"));
    chip(row(shown, "sid"), "delete").fire("click");
    await settle();
    expect(site.jar.cookies).toEqual([]);
    expect(labels(shown)).toEqual([]);
  });

  test("with the place unknown, the paths are tried, and the cookie still changes and goes", async () => {
    const site = fakeSite();
    site.jar.put({ name: "theme", value: "light", path: "/shop" });
    const shown = show({}, site);
    await pick(shown, "cookies");
    const theme = row(shown, "theme");
    toggle(theme);
    chip(theme, "edit").fire("click");
    area(theme).value = "dark";
    chip(theme, "save").fire("click");
    await settle();
    expect(site.jar.cookies.map((cookie) => [cookie.path, cookie.value])).toEqual([["/shop", "dark"]]);
    chip(row(shown, "theme"), "delete").fire("click");
    await settle();
    expect(site.jar.cookies).toEqual([]);
  });

  test("says plainly when a cookie could not be changed or deleted", async () => {
    const site = fakeSite();
    site.jar.put({ name: "kept", value: "1" });
    const shown = show({}, site);
    await pick(shown, "cookies");
    site.jar.write = () => {};
    const kept = row(shown, "kept");
    toggle(kept);
    chip(kept, "delete").fire("click");
    expect(notes(shown.body)).toContain("kept could not be deleted: it may sit on another path or domain");
    expect(labels(shown)).toEqual(["kept"]);
    chip(kept, "edit").fire("click");
    area(kept).value = "2";
    chip(kept, "save").fire("click");
    expect(notes(kept)).toEqual([
      "kept could not be changed: it may sit on another path or domain, or be HttpOnly now",
    ]);
  });

  test("where the browser says when cookies change it is heard, and no tick runs", async () => {
    const site = fakeSite({ cookieStore: true });
    const shown = show({}, site);
    await pick(shown, "cookies");
    expect(shown.ticks.filter((tick) => !tick.stopped)).toEqual([]);
    const store = site.jar.store();
    expect(store.listeners.size).toBe(0);
    site.jar.put({ name: "late", value: "1" });
    const heard = site.cookieStore as ReturnType<typeof site.jar.store>;
    expect(heard.listeners.size).toBe(1);
    for (const listener of heard.listeners) listener();
    await settle();
    expect(labels(shown)).toEqual(["late"]);
    shown.close();
    expect(heard.listeners.size).toBe(0);
  });

  test("elsewhere the same tick keeps them live", async () => {
    const site = fakeSite();
    const shown = show({}, site);
    await pick(shown, "cookies");
    const [tick] = shown.ticks.filter((entry) => !entry.stopped);
    expect(tick?.ms).toBe(POLL_MS);
    site.jar.put({ name: "late", value: "1" });
    tick?.run();
    await settle();
    expect(labels(shown)).toEqual(["late"]);
  });

  test("clear asks once and says what it could not remove", async () => {
    const site = fakeSite();
    site.jar.put({ name: "a", value: "1" });
    site.jar.put({ name: "b", value: "2" });
    const shown = show({}, site);
    await pick(shown, "cookies");
    const write = site.jar.write.bind(site.jar);
    site.jar.write = (text) => {
      if (!text.startsWith("b=")) write(text);
    };
    chip(bar(shown), "clear").fire("click");
    expect(notes(shown.body)).toContain("clear 2 cookies?");
    answer(shown, "clear").fire("click");
    await settle();
    expect(labels(shown)).toEqual(["b"]);
    expect(notes(shown.body)).toContain("1 cookie could not be removed: set on another path or domain");
  });
});

describe("indexeddb", () => {
  test("lists the databases, a database's stores, and a store's first fifty records", async () => {
    const shown = show({}, deep());
    await pick(shown, "IndexedDB");
    expect(notes(shown.body)).toEqual([
      "read only: a whole database can be deleted, its records cannot be changed",
    ]);
    const shop = row(shown, "shop");
    expect(shop.find("cell-end")[0]?.textContent).toBe("version 3");
    expect(filterOf(shown).placeholder).toBe("filter 1 database");
    toggle(shop);
    await settle();
    const carts = row(shown, "carts");
    expect(carts.find("cell-end")[0]?.textContent).toBe("1 record");
    expect(carts.find("pairs")[0]?.children.map((child) => child.textContent)).toEqual([
      "key path",
      "id",
      "auto increment",
      "yes",
      "indexes",
      "byUser",
    ]);
    toggle(carts);
    await settle();
    const record = row(shown, "1");
    expect(record.find("cell-value")[0]?.textContent).toBe('{"id":1, "when":Date 1970-01-01T00:00:00.000Z}');
    toggle(record);
    expect(record.find("code-text")[0]?.textContent).toBe('{\n  "id": 1,\n  "when": Date 1970-01-01T00:00:00.000Z\n}');
    const events = row(shown, "events");
    expect(events.find("cell-end")[0]?.textContent).toBe("120 records");
    toggle(events);
    await settle();
    expect(events.find("row")).toHaveLength(51);
    expect(notes(events)).toEqual(["50 of 120"]);
    chip(events, "show 50 more").fire("click");
    await settle();
    expect(events.find("row")).toHaveLength(101);
    chip(events, "show 20 more").fire("click");
    await settle();
    expect(events.find("row")).toHaveLength(121);
    expect(chips(events)).toEqual([]);
  });

  test("is read only: no control edits or clears a record", async () => {
    const shown = show({}, deep());
    await pick(shown, "IndexedDB");
    toggle(row(shown, "shop"));
    await settle();
    toggle(row(shown, "carts"));
    await settle();
    toggle(row(shown, "1"));
    expect(chips(shown.body)).toEqual(["copy value", "delete database"]);
    // The store has no clear of its own: it goes with clear site data, in the head.
    expect(chips(bar(shown))).toEqual([]);
  });

  test("never keeps a database open, whatever was looked at", async () => {
    const site = deep();
    const shown = show({}, site);
    await pick(shown, "IndexedDB");
    toggle(row(shown, "shop"));
    await settle();
    toggle(row(shown, "events"));
    await settle();
    chip(row(shown, "events"), "show 50 more").fire("click");
    await settle();
    shown.head("refresh");
    await settle();
    expect(site.idb.connections.length).toBeGreaterThanOrEqual(3);
    expect(site.idb.openNow()).toEqual([]);
    expect(site.idb.opens.every((args) => args.length === 1)).toBe(true);
    expect(site.idb.connections.flatMap((connection) => connection.modes).every((mode) => mode === "readonly")).toBe(true);
  });

  test("is not read on a tick: only when its segment shows, and on refresh", async () => {
    const site = deep();
    const shown = show({}, site);
    await pick(shown, "IndexedDB");
    expect(shown.ticks.filter((tick) => !tick.stopped)).toEqual([]);
    site.idb.add("later", 1, {});
    expect(labels(shown)).toEqual(["shop"]);
    shown.head("refresh");
    await settle();
    expect(labels(shown)).toEqual(["shop", "later"]);
  });

  test("says plainly where the browser cannot list databases", async () => {
    const shown = show({}, deep({ listable: false }));
    await pick(shown, "IndexedDB");
    expect(notes(shown.body)).toEqual([NO_LIST]);
    expect(rows(shown)).toEqual([]);
  });

  test("a database that cannot be read says so in its fold", async () => {
    const site = deep();
    site.idb.modes.set("shop", "fail");
    const shown = show({}, site);
    await pick(shown, "IndexedDB");
    toggle(row(shown, "shop"));
    await settle();
    expect(notes(row(shown, "shop"))).toEqual(["cannot open shop: UnknownError"]);
    expect(site.idb.openNow()).toEqual([]);
  });

  test("a whole database can be deleted, after one question in place", async () => {
    const site = deep();
    const shown = show({}, site);
    await pick(shown, "IndexedDB");
    toggle(row(shown, "shop"));
    await settle();
    chip(row(shown, "shop"), "delete database").fire("click");
    expect(notes(row(shown, "shop"))).toEqual(["delete the database shop? the page may need a reload after"]);
    expect(site.idb.data.has("shop")).toBe(true);
    chip(row(shown, "shop"), "delete").fire("click");
    await settle();
    expect(site.idb.data.has("shop")).toBe(false);
    expect(shown.body.find("empty")[0]?.textContent).toBe("no databases");
  });
});

describe("cache storage", () => {
  test("lists the caches, and a cache's first hundred requests with what the response says", async () => {
    const site = deep();
    const shown = show({}, site);
    await pick(shown, "cache storage");
    expect(notes(shown.body)).toEqual(["read only"]);
    const pages = row(shown, "pages");
    toggle(pages);
    await settle();
    const lines = pages.find("row").slice(1);
    expect(lines).toHaveLength(100);
    expect(lines[0]?.find("row-label")[0]?.textContent).toBe("GET /p/0");
    expect(lines[0]?.find("cell-end")[0]?.textContent).toBe("200 · text/html · 1 KB");
    expect(notes(pages)).toEqual(["100 of 240"]);
    chip(pages, "show 100 more").fire("click");
    await settle();
    expect(pages.find("row").slice(1)).toHaveLength(200);
    chip(pages, "show 40 more").fire("click");
    await settle();
    expect(pages.find("row").slice(1)).toHaveLength(240);
    expect(chips(pages)).toEqual([]);
    expect(site.cached.matches).toBe(240);
  });

  test("says where there is none to read", async () => {
    const shown = show({}, { ...fakeSite(), isSecureContext: false } as FakeSite);
    await pick(shown, "cache storage");
    expect(notes(shown.body)).toEqual(["Cache Storage needs a secure page (https or localhost)"]);
  });
});

/** A page with something of every kind. */
function full(): FakeSite {
  const site = deep({ local: ITEMS, session: { step: "2", "devknobs:locale-owner": "x" } });
  site.jar.put({ name: "theme", value: "dark" });
  site.jar.put({ name: "sid", value: "1", path: "/shop" });
  site.idb.add("logs", 1, {});
  return site;
}

describe("clear site data", () => {
  test("asks once, with what will go and how many, and that devknobs' own are kept", async () => {
    const site = full();
    const shown = show({}, site);
    await pick(shown, "local storage");
    shown.head("clear site data");
    await settle();
    expect(notes(shown.body)).toContain(
      "clear site data? 2 local, 1 session, 2 cookies, 2 databases, 1 cache. devknobs' own items are kept",
    );
    expect(chips(shown.body).slice(-2)).toEqual(["clear site data", "cancel"]);
    chip(shown.body, "cancel").fire("click");
    expect(site.localStorage.map.size).toBe(4);
    expect(site.idb.deletes).toEqual([]);
  });

  test("clears every kind in one go, keeps devknobs' own, and offers a reload it does not do itself", async () => {
    const site = full();
    const shown = show({}, site);
    await pick(shown, "local storage");
    shown.head("clear site data");
    await settle();
    chip(shown.body, "clear site data").fire("click");
    await settle(20);
    expect(site.localStorage.all()).toEqual({ devknobs: "{}", "devknobs:keys": "{}" });
    expect(site.sessionStorage.all()).toEqual({ "devknobs:locale-owner": "x" });
    expect(site.jar.cookies).toEqual([]);
    expect(site.idb.data.size).toBe(0);
    expect(site.cached.caches.size).toBe(0);
    expect(notes(shown.body)).toContain("cleared 2 local, 1 session, 2 cookies, 2 databases, 1 cache");
    expect(site.reloads).toBe(0);
    chip(shown.body, "reload the page").fire("click");
    expect(site.reloads).toBe(1);
    expect(labels(shown)).toEqual([]);
  });

  test("with devknobs' own showing, the question says they go too, and they do", async () => {
    const site = full();
    const shown = show({}, site);
    await pick(shown, "local storage");
    ownLine(shown)?.fire("click");
    shown.head("clear site data");
    await settle();
    expect(notes(shown.body)).toContain(
      "clear site data? 4 local, 2 session, 2 cookies, 2 databases, 1 cache, devknobs' own items too",
    );
    chip(shown.body, "clear site data").fire("click");
    await settle(20);
    expect(site.localStorage.all()).toEqual({});
    expect(site.sessionStorage.all()).toEqual({});
  });

  test("a database the page holds open is said plainly, after a short wait", async () => {
    const site = full();
    site.idb.held.add("shop");
    const shown = show({}, site);
    await pick(shown, "IndexedDB");
    toggle(row(shown, "shop"));
    await settle();
    chip(row(shown, "shop"), "delete database").fire("click");
    chip(row(shown, "shop"), "delete").fire("click");
    await settle(1100);
    expect(notes(shown.body)).toContain(
      "shop is held open by the page: it goes once the page lets go, or on reload",
    );
  });
});

const PRESET: Preset = {
  name: "logged in",
  local: [{ name: "token", value: "preset" }],
  session: [{ name: "step", value: "9" }],
  cookies: [{ name: "sid", value: "p", path: "/" }],
  onLoad: false,
  clearFirst: false,
};

describe("presets", () => {
  test("save as preset keeps what the filter shows in all three kinds, without devknobs' own", async () => {
    const site = fakeSite({ local: ITEMS, session: { token2: "s", other: "x" } });
    site.jar.put({ name: "token3", value: "c" });
    site.jar.put({ name: "theme", value: "dark" });
    const shown = show({}, site);
    await pick(shown, "local storage");
    ownLine(shown)?.fire("click");
    type(shown, "token");
    chip(shown.body, "save as preset").fire("click");
    await settle();
    expect(notes(shown.body)).toContain(
      "keeps 1 local, 1 session, 1 cookie, as the filter shows them, without devknobs' own",
    );
    const [name] = shown.body.find("field-line");
    expect(focused()).toBe(name ?? null);
    chip(shown.body, "save preset").fire("click");
    expect(notes(shown.body)).toContain("the preset needs a name");
    if (name) name.value = "tokens";
    name?.fire("keydown", { key: "Enter" });
    expect(loadPresets()).toEqual([
      {
        name: "tokens",
        local: [{ name: "token", value: "abc" }],
        session: [{ name: "token2", value: "s" }],
        cookies: [{ name: "token3", value: "c" }],
        onLoad: false,
        clearFirst: false,
      },
    ]);
    expect(Object.keys(site.localStorage.all())).toContain(PRESETS_KEY);
    expect(notes(shown.body)).toContain("kept the preset tokens: 1 local, 1 session, 1 cookie");
  });

  test("their page lists them with what each holds, and the filter matches their names", async () => {
    const shown = show({ local: ITEMS });
    savePresets([PRESET, { ...PRESET, name: "empty cart", cookies: [] }]);
    await pick(shown, "presets");
    expect(labels(shown)).toEqual(["logged in", "empty cart"]);
    expect(row(shown, "logged in").find("cell-value")[0]?.textContent).toBe("1 local, 1 session, 1 cookie");
    expect(notes(shown.body)[0]).toBe("no preset applies on load");
    expect(filterOf(shown).placeholder).toBe("filter 2 presets");
    type(shown, "CART");
    expect(labels(shown)).toEqual(["empty cart"]);
    type(shown, "");
    toggle(row(shown, "logged in"));
    expect(chips(row(shown, "logged in"))).toEqual(["apply", "rename", "edit", "export", "delete"]);
    expect(chips(bar(shown))).toEqual(["save current as preset", "new preset", "import"]);
  });

  test("apply adds to what is there by default", async () => {
    const shown = show({ local: { token: "old", other: "kept" } });
    savePresets([PRESET]);
    await pick(shown, "presets");
    const preset = row(shown, "logged in");
    toggle(preset);
    expect(preset.find("seg-item").map((item) => [item.textContent, item.classes().includes("on")])).toEqual([
      ["add to what is there", true],
      ["replace", false],
    ]);
    chip(preset, "apply").fire("click");
    expect(shown.site.localStorage.getItem("token")).toBe("preset");
    expect(shown.site.localStorage.getItem("other")).toBe("kept");
    expect(shown.site.sessionStorage.all()).toEqual({ step: "9" });
    expect(shown.site.jar.cookies.map((cookie) => cookie.name)).toEqual(["sid"]);
    expect(notes(shown.body)).toContain("applied logged in: 3 values set");
  });

  test("replace clears the page's local and session first, and keeps devknobs' own", async () => {
    const shown = show({ local: { token: "old", other: "gone", devknobs: "{}" }, session: { stale: "1" } });
    savePresets([PRESET]);
    await pick(shown, "presets");
    const preset = row(shown, "logged in");
    toggle(preset);
    preset.find("seg-item")[1]?.fire("click");
    chip(preset, "apply").fire("click");
    expect(Object.keys(shown.site.localStorage.all()).sort()).toEqual(["devknobs", PRESETS_KEY, "token"].sort());
    expect(shown.site.sessionStorage.all()).toEqual({ step: "9" });
    expect(notes(shown.body)).toContain("replaced with logged in: 3 values set");
  });

  test("edit is the preset's json, checked on save with one clear line", async () => {
    const shown = show();
    savePresets([{ ...PRESET, onLoad: true }]);
    await pick(shown, "presets");
    const preset = row(shown, "logged in");
    toggle(preset);
    chip(preset, "edit").fire("click");
    const box = area(preset);
    expect(JSON.parse(box.value)).toEqual({
      name: "logged in",
      local: PRESET.local,
      session: PRESET.session,
      cookies: PRESET.cookies,
    });
    box.value = '{"name":"x","local":[{"name":"a"}]}';
    chip(preset, "save").fire("click");
    expect(notes(preset)).toEqual(['local entry "a" needs a value that is text']);
    expect(loadPresets()[0]?.name).toBe("logged in");
    box.value = "{";
    chip(preset, "save").fire("click");
    expect(notes(preset)[0]).toStartWith("not valid json");
    box.value = '{"name":"renamed","local":[{"name":"a","value":"1"}]}';
    chip(preset, "save").fire("click");
    // The rename keeps when it applies.
    expect(loadPresets()).toEqual([
      { name: "renamed", local: [{ name: "a", value: "1" }], session: [], cookies: [], onLoad: true, clearFirst: false },
    ]);
    expect(labels(shown)).toEqual(["renamed"]);
  });

  test("export copies the json, and import and new preset add one from json", async () => {
    const shown = show();
    savePresets([PRESET]);
    await pick(shown, "presets");
    toggle(row(shown, "logged in"));
    chip(row(shown, "logged in"), "export").fire("click");
    await settle();
    expect(JSON.parse(shown.copied[0] ?? "")).toMatchObject({ name: "logged in", local: PRESET.local });
    chip(shown.body, "import").fire("click");
    const box = area(shown.body);
    expect(box.placeholder).toBe("paste a preset's json");
    box.value = "nope";
    boxChip(shown, "import").fire("click");
    expect(notes(shown.body).some((line) => line.startsWith("not valid json"))).toBe(true);
    // A teammate's export, with a name that is taken, and marked to apply on load.
    box.value = JSON.stringify({ ...PRESET, onLoad: true });
    box.fire("keydown", { key: "Enter", metaKey: true });
    expect(loadPresets().map((preset) => [preset.name, preset.onLoad])).toEqual([
      ["logged in", false],
      ["logged in 2", false],
    ]);
    chip(shown.body, "new preset").fire("click");
    const fresh = area(shown.body);
    expect(JSON.parse(fresh.value).name).toBe("new preset");
    fresh.fire("keydown", { key: "Enter", metaKey: true });
    expect(labels(shown)).toEqual(["logged in", "logged in 2", "new preset"]);
  });

  test("rename is a field in the row, which keeps what the preset holds and when it applies", async () => {
    const shown = show();
    savePresets([{ ...PRESET, onLoad: true }, { ...PRESET, name: "other" }]);
    await pick(shown, "presets");
    toggle(row(shown, "logged in"));
    chip(row(shown, "logged in"), "rename").fire("click");
    const [name] = row(shown, "logged in").find("field-line");
    expect(focused()).toBe(name ?? null);
    expect(name?.value).toBe("logged in");
    expect(chips(row(shown, "logged in"))).toEqual(["rename", "cancel"]);
    if (name) name.value = "  ";
    chip(row(shown, "logged in"), "rename").fire("click");
    expect(notes(row(shown, "logged in"))).toEqual(["the preset needs a name"]);
    // Escape takes the field back, and the row is as it was.
    expect(shown.escape()).toBe(true);
    expect(chips(row(shown, "logged in"))).toEqual(["apply", "rename", "edit", "export", "delete"]);
    chip(row(shown, "logged in"), "rename").fire("click");
    const [again] = row(shown, "logged in").find("field-line");
    // A name another preset has gets a number.
    if (again) again.value = "other";
    again?.fire("keydown", { key: "Enter" });
    expect(loadPresets()).toEqual([
      { ...PRESET, name: "other 2", onLoad: true },
      { ...PRESET, name: "other" },
    ]);
    expect(labels(shown)).toEqual(["other 2", "other"]);
    expect(row(shown, "other 2").className).toBe("row open");
  });

  test("delete asks once in place", async () => {
    const shown = show();
    savePresets([PRESET]);
    await pick(shown, "presets");
    toggle(row(shown, "logged in"));
    chip(row(shown, "logged in"), "delete").fire("click");
    expect(notes(row(shown, "logged in"))).toEqual(["delete the preset logged in?"]);
    expect(loadPresets()).toHaveLength(1);
    chip(row(shown, "logged in"), "delete").fire("click");
    expect(loadPresets()).toEqual([]);
    expect(shown.body.find("empty")[0]?.textContent).toBe("no presets yet");
  });

  test("apply on load is a switch on the row, shown as on, and named on the section's first line", async () => {
    const shown = show();
    savePresets([PRESET, { ...PRESET, name: "other" }]);
    await pick(shown, "presets");
    toggle(row(shown, "logged in"));
    const [control] = row(shown, "logged in").find("switch");
    expect(control?.attributes.get("role")).toBe("switch");
    expect(control?.attributes.get("aria-label")).toBe("apply on load");
    expect(control?.attributes.get("aria-checked")).toBe("false");
    expect(row(shown, "logged in").find("cell-end")).toEqual([]);
    control?.fire("click");
    expect(loadPresets().map((preset) => preset.onLoad)).toEqual([true, false]);
    expect(said(shown)[0]).toBe("applies on every load of this page: logged in");
    expect(row(shown, "logged in").find("cell-end")[0]?.textContent).toBe("on load");
    expect(row(shown, "other").find("cell-end")).toEqual([]);
    expect(notes(shown.body)).toContain("logged in is set on every load of this page, until it is turned off");
    // Clear first is offered once it applies on load, and is off.
    const switches = row(shown, "logged in").find("switch");
    expect(switches.map((node) => node.attributes.get("aria-label"))).toEqual([
      "apply on load",
      "clear local and session first",
    ]);
    expect(switches[1]?.attributes.get("aria-checked")).toBe("false");
    switches[1]?.fire("click");
    expect(loadPresets()[0]).toMatchObject({ onLoad: true, clearFirst: true });
    row(shown, "logged in").find("switch")[0]?.fire("click");
    expect(loadPresets()[0]?.onLoad).toBe(false);
    expect(said(shown)[0]).toBe("no preset applies on load");
  });

  test("in fresh mode the section says presets are not kept, and nothing is written", async () => {
    const site = fakeSite({ local: { a: "1" } });
    const shown = show({ search: "?devknobs=fresh" }, site);
    await pick(shown, "presets");
    expect(notes(shown.body)).toEqual([FRESH_PRESETS]);
    expect(FRESH_PRESETS).toBe("fresh mode: presets are not read or kept");
    expect(chips(shown.body)).toEqual(["save current as preset"]);
    chip(shown.body, "save current as preset").fire("click");
    await settle();
    expect(shown.body.find("field-line")).toEqual([]);
    expect(site.localStorage.all()).toEqual({ a: "1" });
    await pick(shown, "local storage");
  });
});
