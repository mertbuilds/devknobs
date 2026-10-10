import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { HTTP_ONLY_NOTE } from "../src/storage/cookies";
import { RENDER_LIMIT } from "../src/storage/format";
import { NO_LIST } from "../src/storage/idb";
import { PRESETS_KEY } from "../src/storage/onload";
import { loadPresets, type Preset, savePresets } from "../src/storage/presets";
import { FRESH_PRESETS } from "../src/ui/storagepresets";
import { POLL_MS, STORAGE_KINDS, storageView } from "../src/ui/storageview";
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
    close: () => {},
  };
  const view = storageView({
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
  });
  const cleanup = view.mount(shown.body as unknown as HTMLElement);
  shown.close = () => {
    if (typeof cleanup === "function") cleanup();
  };
  return shown;
}

/** Show a kind, by its segment. */
async function pick(shown: Shown, label: string): Promise<void> {
  const item = shown.body.find("seg-item").find((node) => node.textContent === label);
  if (!item) throw new Error(`no segment ${label}`);
  item.fire("click");
  await settle();
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

function notes(root: FakeNode): string[] {
  return root.find("note").map((node) => node.textContent);
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

describe("the storage view", () => {
  test("has one segment a kind, and a filter, in the kit's bar", async () => {
    const shown = show({ local: ITEMS });
    await pick(shown, "local");
    expect(STORAGE_KINDS.map((kind) => kind.value)).toEqual([
      "local",
      "session",
      "cookies",
      "indexeddb",
      "cache",
      "presets",
    ]);
    const [bar] = shown.body.children;
    expect(bar?.className).toBe("toolbar");
    expect(bar?.children.map((child) => child.className)).toEqual(["seg", "field filter"]);
    expect(shown.body.find("seg-item").filter((item) => item.classes().includes("on")).map((item) => item.textContent)).toEqual(["local"]);
  });

  test("opens on the kind it last showed", async () => {
    const first = show();
    await pick(first, "cookies");
    first.close();
    const again = show();
    await settle();
    expect(again.body.find("seg-item").find((item) => item.classes().includes("on"))?.textContent).toBe("cookies");
    await pick(again, "local");
  });
});

describe("local and session storage", () => {
  test("a row a key: the key, a one-line preview and the size, devknobs' own hidden", async () => {
    const shown = show({ local: ITEMS, session: { step: "2" } });
    await pick(shown, "local");
    expect(labels(shown)).toEqual(["token", "user"]);
    const user = row(shown, "user");
    expect(user.find("row-label")[0]?.className).toBe("row-label st-key");
    expect(user.find("st-preview")[0]?.textContent).toBe('{"id":1,"tags":["a"]}');
    expect(user.find("st-size")[0]?.textContent).toBe("21 B");
    expect(filterOf(shown).placeholder).toBe("filter 2 items");
    await pick(shown, "session");
    expect(labels(shown)).toEqual(["step"]);
    expect(filterOf(shown).placeholder).toBe("filter 1 item");
  });

  test("devknobs' own show once asked for, told by their fainter key alone", async () => {
    const shown = show({ local: ITEMS });
    await pick(shown, "local");
    chip(shown.body, "show devknobs' own").fire("click");
    expect(labels(shown)).toEqual(["token", "user", "devknobs", "devknobs:keys"]);
    expect(row(shown, "devknobs").find("row-label")[0]?.className).toBe("row-label st-key own");
    expect(filterOf(shown).placeholder).toBe("filter 4 items");
    chip(shown.body, "hide devknobs' own").fire("click");
    expect(labels(shown)).toEqual(["token", "user"]);
  });

  test("a row folds out in place to the whole value, json laid out where that loses nothing", async () => {
    const shown = show({ local: { ...ITEMS, big: '{"id":12345678901234567890}' } });
    await pick(shown, "local");
    const user = row(shown, "user");
    expect(user.find("code")).toEqual([]);
    toggle(user);
    expect(user.className).toBe("row open");
    expect(user.find("code")[0]?.textContent).toBe('{\n  "id": 1,\n  "tags": [\n    "a"\n  ]\n}');
    expect(chips(user)).toEqual(["copy value", "edit", "duplicate", "delete"]);
    const big = row(shown, "big");
    toggle(big);
    expect(big.find("code")[0]?.textContent).toBe('{"id":12345678901234567890}');
  });

  test("nothing is copied by itself: the copy control and a click on the value are the ways out", async () => {
    const shown = show({ local: ITEMS });
    await pick(shown, "local");
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
    await pick(shown, "local");
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
    expect(row(shown, "token").find("st-preview")[0]?.textContent).toBe("xyz");
    expect(row(shown, "token").find("code")[0]?.textContent).toBe("xyz");
  });

  test("enter with meta or ctrl saves, and a bare enter is a new line", async () => {
    const shown = show({ local: ITEMS });
    await pick(shown, "local");
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
    await pick(shown, "local");
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
    expect(token.find("code")[0]?.textContent).toBe("abc");
    expect(shown.site.localStorage.getItem("token")).toBe("abc");
    // With nothing left to take back, escape is the panel's.
    expect(shown.escape()).toBe(false);
  });

  test("json that no longer parses is still saved, as text, and a quiet line says so", async () => {
    const shown = show({ local: ITEMS });
    await pick(shown, "local");
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
    await pick(shown, "local");
    const token = row(shown, "token");
    toggle(token);
    chip(token, "edit").fire("click");
    area(token).value = "plain";
    chip(token, "save").fire("click");
    expect(notes(shown.body)).not.toContain(NOT_JSON);
  });

  test("a full storage is a line under the box, which stays as typed", async () => {
    const shown = show({ local: ITEMS });
    await pick(shown, "local");
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
    await pick(shown, "local");
    const token = row(shown, "token");
    toggle(token);
    chip(token, "delete").fire("click");
    expect(shown.site.localStorage.getItem("token")).toBeNull();
    expect(labels(shown)).toEqual(["user"]);
  });

  test("one of devknobs' own asks once before it is edited or deleted", async () => {
    const shown = show({ local: ITEMS });
    await pick(shown, "local");
    chip(shown.body, "show devknobs' own").fire("click");
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
    await pick(shown, "local");
    const token = row(shown, "token");
    toggle(token);
    chip(token, "duplicate").fire("click");
    expect(shown.site.localStorage.all()).toEqual({ token: "abc", "token copy": "x", "token copy 2": "abc" });
    expect(labels(shown)).toEqual(["token", "token copy", "token copy 2"]);
  });

  test("add takes key=value lines, or a json object of several keys", async () => {
    const shown = show({ session: {} });
    await pick(shown, "session");
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

  test("clear asks once, in the view, with the count", async () => {
    const shown = show({ local: ITEMS });
    await pick(shown, "local");
    shown.head("clear what shows");
    expect(notes(shown.body)).toContain("clear 2 items?");
    expect(focused()?.textContent).toBe("clear");
    chip(shown.body, "cancel").fire("click");
    expect(notes(shown.body)).not.toContain("clear 2 items?");
    expect(shown.site.localStorage.map.size).toBe(4);
    shown.head("clear what shows");
    expect(shown.escape()).toBe(true);
    expect(shown.site.localStorage.map.size).toBe(4);
    shown.head("clear what shows");
    chip(shown.body, "clear").fire("click");
    // devknobs' own stay.
    expect(shown.site.localStorage.all()).toEqual({ devknobs: "{}", "devknobs:keys": "{}" });
    expect(labels(shown)).toEqual([]);
    expect(shown.body.find("empty")[0]?.textContent).toBe("nothing in localStorage");
    shown.head("clear what shows");
    expect(notes(shown.body)).toEqual(["nothing to clear in localStorage"]);
  });

  test("the filter matches the key or the value, over the data", async () => {
    const shown = show({ local: { Token: "abc", theme: "DARK", other: "x" } });
    await pick(shown, "local");
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
    await pick(shown, "local");
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
    await pick(shown, "local");
    const first = row(shown, "long");
    toggle(first);
    expect(first.find("code")[0]?.textContent.length).toBe(RENDER_LIMIT);
    expect(notes(first)).toEqual(["10 more characters"]);
    chip(first, "show all").fire("click");
    expect(first.find("code")[0]?.textContent.length).toBe(RENDER_LIMIT + 10);
    const second = row(shown, "huge");
    toggle(second);
    expect(second.find("code")[0]?.textContent.length).toBe(RENDER_LIMIT);
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
    await pick(shown, "local");
    await pick(shown, "session");
    expect(notes(shown.body)).toEqual(["cannot read sessionStorage: the browser blocks storage on this page"]);
    expect(rows(shown)).toEqual([]);
  });

  test("the keys: arrows move over the rows, and delete asks in place", async () => {
    const shown = show({ local: { a: "1", b: "2", c: "3" } });
    await pick(shown, "local");
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
  test("the tick runs once a second while a live segment shows, and stops with the segment and the view", async () => {
    const shown = show({ local: ITEMS });
    await pick(shown, "local");
    const live = shown.ticks.filter((tick) => !tick.stopped);
    expect(live).toHaveLength(1);
    expect(live[0]?.ms).toBe(POLL_MS);
    expect(POLL_MS).toBe(1000);
    await pick(shown, "idb");
    expect(shown.ticks.filter((tick) => !tick.stopped)).toEqual([]);
    await pick(shown, "cache");
    await pick(shown, "presets");
    expect(shown.ticks.filter((tick) => !tick.stopped)).toEqual([]);
    await pick(shown, "session");
    expect(shown.ticks.filter((tick) => !tick.stopped)).toHaveLength(1);
    shown.close();
    expect(shown.ticks.filter((tick) => !tick.stopped)).toEqual([]);
    await pick(shown, "local");
  });

  test("a write by the page shows on the next tick, and rows that did not change are left as they are", async () => {
    const shown = show({ local: { a: "1", b: "2" } });
    await pick(shown, "local");
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
    expect(row(shown, "b").find("st-preview")[0]?.textContent).toBe("changed");
  });

  test("a view out of sight reads nothing on its tick", async () => {
    const shown = show({ local: { a: "1" } });
    await pick(shown, "local");
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
    await pick(shown, "local");
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
    await pick(shown, "local");
    const a = row(shown, "a");
    toggle(a);
    chip(a, "edit").fire("click");
    area(a).value = "typing";
    shown.site.localStorage.setItem("a", "page wrote");
    shown.ticks.find((tick) => !tick.stopped)?.run();
    expect(area(row(shown, "a")).value).toBe("typing");
    chip(a, "cancel").fire("click");
    expect(row(shown, "a").find("st-preview")[0]?.textContent).toBe("page wrote");
  });

  test("the page's storage is never wrapped or patched", async () => {
    const site = fakeSite({ local: ITEMS });
    const methods = [site.localStorage.setItem, site.localStorage.getItem, site.localStorage.removeItem];
    const factory = site.indexedDB;
    const open = factory?.open;
    const shown = show({}, site);
    for (const kind of ["local", "session", "cookies", "idb", "cache", "presets", "local"]) await pick(shown, kind);
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
    expect(sid.find("st-preview")[0]?.textContent).toBe("abc");
    toggle(sid);
    const [list] = sid.find("defs");
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
    expect(theme.find("defs")[0]?.children.map((child) => child.textContent)).toEqual(["name", "theme"]);
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
    expect(row(shown, "sid").find("st-preview")[0]?.textContent).toBe("new");
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
    shown.head("clear what shows");
    expect(notes(shown.body)).toContain("clear 2 cookies?");
    chip(shown.body, "clear").fire("click");
    await settle();
    expect(labels(shown)).toEqual(["b"]);
    expect(notes(shown.body)).toContain("1 cookie could not be removed: set on another path or domain");
  });
});

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

describe("indexeddb", () => {
  test("lists the databases, a database's stores, and a store's first fifty records", async () => {
    const shown = show({}, deep());
    await pick(shown, "idb");
    expect(notes(shown.body)).toEqual([
      "read only: a whole database can be deleted, its records cannot be changed",
    ]);
    const shop = row(shown, "shop");
    expect(shop.find("st-size")[0]?.textContent).toBe("version 3");
    expect(filterOf(shown).placeholder).toBe("filter 1 database");
    toggle(shop);
    await settle();
    const carts = row(shown, "carts");
    expect(carts.find("st-size")[0]?.textContent).toBe("1 record");
    expect(carts.find("defs")[0]?.children.map((child) => child.textContent)).toEqual([
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
    expect(record.find("st-preview")[0]?.textContent).toBe('{"id":1, "when":Date 1970-01-01T00:00:00.000Z}');
    toggle(record);
    expect(record.find("code")[0]?.textContent).toBe('{\n  "id": 1,\n  "when": Date 1970-01-01T00:00:00.000Z\n}');
    const events = row(shown, "events");
    expect(events.find("st-size")[0]?.textContent).toBe("120 records");
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
    await pick(shown, "idb");
    toggle(row(shown, "shop"));
    await settle();
    toggle(row(shown, "carts"));
    await settle();
    toggle(row(shown, "1"));
    expect(chips(shown.body)).toEqual(["copy value", "delete database"]);
    shown.head("clear what shows");
    expect(notes(shown.body)).toContain("IndexedDB is cleared with clear site data");
  });

  test("never keeps a database open, whatever was looked at", async () => {
    const site = deep();
    const shown = show({}, site);
    await pick(shown, "idb");
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
    await pick(shown, "idb");
    expect(shown.ticks.filter((tick) => !tick.stopped)).toEqual([]);
    site.idb.add("later", 1, {});
    expect(labels(shown)).toEqual(["shop"]);
    shown.head("refresh");
    await settle();
    expect(labels(shown)).toEqual(["shop", "later"]);
  });

  test("says plainly where the browser cannot list databases", async () => {
    const shown = show({}, deep({ listable: false }));
    await pick(shown, "idb");
    expect(notes(shown.body)).toEqual([NO_LIST]);
    expect(rows(shown)).toEqual([]);
  });

  test("a database that cannot be read says so in its fold", async () => {
    const site = deep();
    site.idb.modes.set("shop", "fail");
    const shown = show({}, site);
    await pick(shown, "idb");
    toggle(row(shown, "shop"));
    await settle();
    expect(notes(row(shown, "shop"))).toEqual(["cannot open shop: UnknownError"]);
    expect(site.idb.openNow()).toEqual([]);
  });

  test("a whole database can be deleted, after one question in place", async () => {
    const site = deep();
    const shown = show({}, site);
    await pick(shown, "idb");
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
    await pick(shown, "cache");
    expect(notes(shown.body)).toEqual(["read only"]);
    const pages = row(shown, "pages");
    toggle(pages);
    await settle();
    const lines = pages.find("row").slice(1);
    expect(lines).toHaveLength(100);
    expect(lines[0]?.find("row-label")[0]?.textContent).toBe("GET /p/0");
    expect(lines[0]?.find("st-size")[0]?.textContent).toBe("200 · text/html · 1 KB");
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
    await pick(shown, "cache");
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
    await pick(shown, "local");
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
    await pick(shown, "local");
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
    await pick(shown, "local");
    chip(shown.body, "show devknobs' own").fire("click");
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
    await pick(shown, "idb");
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
    await pick(shown, "local");
    chip(shown.body, "show devknobs' own").fire("click");
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

  test("the segment lists them with their counts, and the filter matches their names", async () => {
    const shown = show({ local: ITEMS });
    savePresets([PRESET, { ...PRESET, name: "empty cart", cookies: [] }]);
    await pick(shown, "presets");
    expect(labels(shown)).toEqual(["logged in", "empty cart"]);
    expect(row(shown, "logged in").find("st-size")[0]?.textContent).toBe("1 local, 1 session, 1 cookie");
    expect(notes(shown.body)[0]).toBe("no preset applies on load");
    expect(filterOf(shown).placeholder).toBe("filter 2 presets");
    type(shown, "CART");
    expect(labels(shown)).toEqual(["empty cart"]);
    type(shown, "");
    toggle(row(shown, "logged in"));
    expect(chips(row(shown, "logged in"))).toEqual(["apply", "edit", "export", "delete"]);
    expect(chips(shown.body).slice(0, 3)).toEqual(["new preset", "import", "save as preset"]);
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
    expect(row(shown, "logged in").find("row-value")).toEqual([]);
    control?.fire("click");
    expect(loadPresets().map((preset) => preset.onLoad)).toEqual([true, false]);
    expect(said(shown)[0]).toBe("applies on every load of this page: logged in");
    expect(row(shown, "logged in").find("row-value")[0]?.textContent).toBe("on");
    expect(row(shown, "other").find("row-value")).toEqual([]);
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
    expect(chips(shown.body)).toEqual(["save as preset"]);
    chip(shown.body, "save as preset").fire("click");
    await settle();
    expect(shown.body.find("field-line")).toEqual([]);
    expect(site.localStorage.all()).toEqual({ a: "1" });
    await pick(shown, "local");
  });
});
