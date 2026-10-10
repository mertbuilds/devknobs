import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { FRAME_ATTRIBUTE, FRAME_NAME } from "../src/engine/frame";
import { readCookies } from "../src/storage/cookies";
import {
  appliedOnLoad,
  applyOnLoad,
  PRESETS_KEY,
  PRESETS_VERSION,
  put,
  stopOnLoad,
  storedPresets,
} from "../src/storage/onload";
import {
  applyPreset,
  canKeep,
  capture,
  checkPreset,
  entryCount,
  filterPresets,
  freeName,
  loadPresets,
  PRESET_MAX_BYTES,
  PRESET_MAX_ENTRIES,
  type Preset,
  parsePreset,
  presetCounts,
  presetText,
  savePresets,
  templateText,
} from "../src/storage/presets";
import { readWeb } from "../src/storage/web";
import { appliedText } from "../src/ui/catalog";
import { FakeJar, type FakeSite, FakeStorage, fakeSite, named } from "./storage-fakes";

interface Page {
  search?: string;
  /** The frame element's attributes, for the copy in the width knob's frame. */
  frame?: string[];
  name?: string;
}

/** The origin's storage, which every document opened in a test shares. */
let local = new FakeStorage();
let session = new FakeStorage();
let jar = new FakeJar("app.example.com", "/");

/** A new document over the origin's storage, as a load of the page or of its frame is. */
function open(page: Page = {}): void {
  const frame = page.frame;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: local,
      sessionStorage: session,
      document: {
        get cookie() {
          return jar.read();
        },
        set cookie(text: string) {
          jar.write(text);
        },
      },
      location: { search: page.search ?? "" },
      name: page.name ?? "",
      frameElement: frame ? { hasAttribute: (name: string) => frame.includes(name) } : null,
    },
  });
}

afterEach(() => {
  local = new FakeStorage();
  session = new FakeStorage();
  jar = new FakeJar("app.example.com", "/");
  Reflect.deleteProperty(globalThis, "window");
});

const LOGGED_IN: Preset = {
  name: "logged in",
  local: [
    { name: "token", value: "abc" },
    { name: "user", value: '{"id":1}' },
  ],
  session: [{ name: "step", value: "2" }],
  cookies: [{ name: "sid", value: "s1", path: "/", maxAge: 3600, sameSite: "lax", secure: true }],
  onLoad: false,
  clearFirst: false,
};

/** Keep presets as devknobs does, without going through the gateway. */
function kept(...presets: Preset[]): void {
  local.map.set(PRESETS_KEY, JSON.stringify({ v: PRESETS_VERSION, presets }));
}

describe("a preset's json", () => {
  test("is its name and its entries, and nothing of when it applies", () => {
    expect(JSON.parse(presetText({ ...LOGGED_IN, onLoad: true, clearFirst: true }))).toEqual({
      name: "logged in",
      local: LOGGED_IN.local,
      session: LOGGED_IN.session,
      cookies: LOGGED_IN.cookies,
    });
  });

  test("reads back to the same preset", () => {
    expect(parsePreset(presetText(LOGGED_IN))).toEqual({ preset: LOGGED_IN, error: null });
    expect(entryCount(LOGGED_IN)).toBe(4);
    expect(presetCounts(LOGGED_IN)).toBe("2 local, 1 session, 1 cookie");
    expect(presetCounts({ ...LOGGED_IN, local: [], session: [], cookies: [] })).toBe("empty");
  });

  test("a kind left out is empty", () => {
    expect(parsePreset('{"name":" only local ","local":[{"name":"a","value":"1"}]}').preset).toEqual({
      name: "only local",
      local: [{ name: "a", value: "1" }],
      session: [],
      cookies: [],
      onLoad: false,
      clearFirst: false,
    });
  });

  test("what is wrong with it is said in one clear line", () => {
    const wrong: [string, string][] = [
      ["{", "not valid json"],
      ["[]", "a preset is a json object with a name"],
      ['{"local":[]}', "the preset needs a name"],
      ['{"name":"  "}', "the preset needs a name"],
      ['{"name":"a","local":{}}', '"local" must be a list of entries'],
      ['{"name":"a","local":["x"]}', "local entry 1 must be an object with a name and a value"],
      ['{"name":"a","session":[{"value":"1"}]}', "session entry 1 needs a name"],
      ['{"name":"a","local":[{"name":"n","value":1}]}', 'local entry "n" needs a value that is text'],
      ['{"name":"a","cookies":[{"name":"c","value":"1","path":"x"}]}', 'cookie "c": path must start with /'],
      ['{"name":"a","cookies":[{"name":"c","value":"1","maxAge":"1"}]}', 'cookie "c": maxAge must be a number of seconds'],
      ['{"name":"a","cookies":[{"name":"c","value":"1","sameSite":"odd"}]}', 'cookie "c": sameSite must be strict, lax or none'],
      ['{"name":"a","cookies":[{"name":"c","value":"1","secure":"yes"}]}', 'cookie "c": secure must be true or false'],
    ];
    for (const [text, line] of wrong) {
      const read = parsePreset(text);
      expect(read.preset).toBeNull();
      expect(read.error).toStartWith(line);
    }
  });

  test("a preset pasted in never applies on load by itself", () => {
    const pasted = { ...LOGGED_IN, onLoad: true, clearFirst: true };
    expect(parsePreset(JSON.stringify(pasted)).preset).toMatchObject({ onLoad: false, clearFirst: false });
    expect(checkPreset(pasted, true).preset).toMatchObject({ onLoad: true, clearFirst: true });
  });

  test("is capped by entries and by weight", () => {
    const entries = Array.from({ length: PRESET_MAX_ENTRIES + 1 }, (_, at) => ({ name: `k${at}`, value: "v" }));
    expect(checkPreset({ name: "many", local: entries }).error).toBe(
      "a preset holds at most 200 entries, this has 201",
    );
    expect(checkPreset({ name: "ok", local: entries.slice(1) }).error).toBeNull();
    const heavy = [{ name: "big", value: "x".repeat(PRESET_MAX_BYTES) }];
    expect(checkPreset({ name: "heavy", local: heavy }).error).toBe("a preset is at most 256 KB as json");
  });

  test("the template checks out, with an example of each kind", () => {
    const made = parsePreset(templateText()).preset;
    expect(made?.local).toHaveLength(1);
    expect(made?.session).toHaveLength(1);
    expect(made?.cookies).toEqual([
      { name: "example", value: "1", path: "/", maxAge: 86400, sameSite: "lax" },
    ]);
  });
});

/** A page with items and cookies to capture, devknobs' own among them. */
function page(): FakeSite {
  const site = fakeSite({
    local: { token: "abc", theme: "dark", devknobs: "{}", "devknobs:keys": "{}" },
    session: { step: "2" },
    cookieStore: true,
  });
  site.jar.put({ name: "sid", value: "s1", path: "/", expires: 1_000_000 + 3_600_000, secure: true, sameSite: "Strict" });
  site.jar.put({ name: "plain", value: "p", path: "/shop" });
  return site;
}

describe("capture", () => {
  test("keeps what the page holds, values exactly as read, without devknobs' own", async () => {
    const site = page();
    const made = capture(
      "now",
      readWeb(site, "local").items,
      readWeb(site, "session").items,
      (await readCookies(site)).cookies,
      1_000_000,
    );
    expect(made.preset).toEqual({
      name: "now",
      local: [
        { name: "token", value: "abc" },
        { name: "theme", value: "dark" },
      ],
      session: [{ name: "step", value: "2" }],
      cookies: [
        { name: "sid", value: "s1", path: "/", maxAge: 3600, sameSite: "strict", secure: true },
        { name: "plain", value: "p", path: "/shop", sameSite: "lax" },
      ],
      onLoad: false,
      clearFirst: false,
    });
  });

  test("needs a name, and holds to the caps", () => {
    const site = page();
    expect(capture("  ", readWeb(site, "local").items, [], []).error).toBe("the preset needs a name");
    const many = fakeSite({
      local: Object.fromEntries(Array.from({ length: 201 }, (_, at) => [`k${at}`, "v"])),
    });
    expect(capture("many", readWeb(many, "local").items, [], []).error).toContain("at most 200 entries");
  });
});

describe("applying", () => {
  test("add sets every entry over what is there", () => {
    const site = fakeSite({ local: { token: "old", other: "kept" }, session: { other: "kept" } });
    expect(applyPreset(site, LOGGED_IN, "add")).toEqual([]);
    expect(site.localStorage.all()).toEqual({ token: "abc", other: "kept", user: '{"id":1}' });
    expect(site.sessionStorage.all()).toEqual({ other: "kept", step: "2" });
    expect(site.jar.writes).toEqual(["sid=s1; path=/; max-age=3600; samesite=lax; secure"]);
  });

  test("replace clears the page's local and session items first, and keeps devknobs' own", () => {
    const site = fakeSite({
      local: { token: "old", other: "gone", devknobs: "{}", "devknobs:keys": "{}" },
      session: { other: "gone", "devknobs:locale-owner": "x" },
    });
    expect(applyPreset(site, LOGGED_IN, "replace")).toEqual([]);
    expect(site.localStorage.all()).toEqual({
      devknobs: "{}",
      "devknobs:keys": "{}",
      token: "abc",
      user: '{"id":1}',
    });
    expect(site.sessionStorage.all()).toEqual({ "devknobs:locale-owner": "x", step: "2" });
  });

  test("a write the browser refuses stops no other, and is named", () => {
    const site = fakeSite();
    site.localStorage.refuse = named("QuotaExceededError");
    expect(applyPreset(site, LOGGED_IN, "add")).toEqual(["token", "user"]);
    expect(site.sessionStorage.all()).toEqual({ step: "2" });
    expect(site.jar.cookies).toHaveLength(1);
  });

  test("a storage that cannot be reached is named, and the rest still applies", () => {
    const site = fakeSite();
    Object.defineProperty(site, "localStorage", {
      get() {
        throw named("SecurityError");
      },
    });
    expect(applyPreset(site, LOGGED_IN, "add")).toEqual(["localStorage"]);
    expect(site.sessionStorage.all()).toEqual({ step: "2" });
  });

  test("entries that are not text are passed over, never written as something else", () => {
    const site = fakeSite();
    put(site, { local: [{ name: "n", value: 1 }, "x", { name: "ok", value: "1" }], cookies: {} }, false);
    expect(site.localStorage.all()).toEqual({ ok: "1" });
    expect(site.jar.writes).toEqual([]);
  });
});

describe("where presets are kept", () => {
  test("in devknobs' own storage, under one versioned key", () => {
    open();
    expect(canKeep()).toBe(true);
    expect(savePresets([LOGGED_IN])).toBeNull();
    expect(Array.from(local.map.keys())).toEqual(["devknobs:storage-presets"]);
    expect(JSON.parse(local.map.get(PRESETS_KEY) ?? "")).toEqual({ v: 1, presets: [LOGGED_IN] });
    expect(loadPresets()).toEqual([LOGGED_IN]);
  });

  test("with none left, the key goes", () => {
    open();
    savePresets([LOGGED_IN]);
    savePresets([]);
    expect(local.map.size).toBe(0);
    expect(loadPresets()).toEqual([]);
  });

  test("what a newer devknobs kept reads as nothing kept, and a broken one too", () => {
    open();
    local.map.set(PRESETS_KEY, JSON.stringify({ v: PRESETS_VERSION + 1, presets: [LOGGED_IN] }));
    expect(loadPresets()).toEqual([]);
    local.map.set(PRESETS_KEY, "{broken");
    expect(loadPresets()).toEqual([]);
    local.map.set(PRESETS_KEY, JSON.stringify({ v: 1, presets: [LOGGED_IN, { name: 3 }, "x"] }));
    expect(loadPresets()).toEqual([LOGGED_IN]);
  });

  test("in fresh mode presets are neither read nor written", () => {
    kept({ ...LOGGED_IN, onLoad: true });
    const before = local.map.get(PRESETS_KEY);
    open({ search: "?devknobs=fresh" });
    local.calls = 0;
    expect(canKeep()).toBe(false);
    expect(loadPresets()).toEqual([]);
    expect(storedPresets()).toEqual([]);
    expect(savePresets([{ ...LOGGED_IN, name: "new" }])).toBe("presets are not kept here");
    stopOnLoad();
    expect(local.map.get(PRESETS_KEY)).toBe(before);
    expect(local.calls).toBe(0);
  });

  test("a full storage is a line", () => {
    open();
    local.refuse = named("QuotaExceededError");
    expect(savePresets([LOGGED_IN])).toBe("cannot keep the preset: the storage is full");
  });

  test("names are kept apart, and the filter finds them", () => {
    const presets = [LOGGED_IN, { ...LOGGED_IN, name: "logged in 2" }, { ...LOGGED_IN, name: "Empty Cart" }];
    expect(freeName("new", presets)).toBe("new");
    expect(freeName("logged in", presets)).toBe("logged in 3");
    expect(freeName("logged in", presets, presets[0])).toBe("logged in");
    expect(filterPresets(presets, "CART").map((preset) => preset.name)).toEqual(["Empty Cart"]);
    expect(filterPresets(presets, "")).toHaveLength(3);
  });
});

describe("apply on load", () => {
  test("sets the marked presets, add mode, and says how many", () => {
    kept({ ...LOGGED_IN, onLoad: true }, { ...LOGGED_IN, name: "off", local: [{ name: "no", value: "1" }] });
    local.map.set("other", "kept");
    open();
    expect(appliedOnLoad()).toBe(0);
    expect(applyOnLoad()).toBe(1);
    expect(local.map.get("token")).toBe("abc");
    expect(local.map.get("other")).toBe("kept");
    expect(local.map.has("no")).toBe(false);
    expect(session.all()).toEqual({ step: "2" });
    expect(jar.cookies.map((cookie) => cookie.name)).toEqual(["sid"]);
    expect(appliedOnLoad()).toBe(1);
    expect(appliedText(appliedOnLoad())).toBe("1 preset");
  });

  test("applies once per document: at mount it does nothing after the early script did", async () => {
    kept({ ...LOGGED_IN, onLoad: true });
    open();
    // The early script is its own copy of the module, as it is its own bundle.
    const copy = "../src/storage/onload.ts?early";
    const early: typeof import("../src/storage/onload") = await import(copy);
    expect(early.applyOnLoad).not.toBe(applyOnLoad);
    expect(early.applyOnLoad()).toBe(1);
    // The page's own startup code changes a value the preset set.
    local.map.set("token", "refreshed by the page");
    expect(applyOnLoad()).toBe(1);
    expect(local.map.get("token")).toBe("refreshed by the page");
    expect(appliedOnLoad()).toBe(1);
  });

  test("the early script applies before it reads or patches anything", () => {
    const source = readFileSync(new URL("../src/early.ts", import.meta.url), "utf8");
    const body = source.slice(source.lastIndexOf("*/"));
    const first = body.split("\n").find((line) => line.trim() !== "" && line.trim() !== "*/");
    expect(first).toBe("applyOnLoad();");
    const mount = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
    expect(mount.indexOf("applyOnLoad();")).toBeLessThan(mount.indexOf("engine.start(options)"));
    expect(mount.indexOf("applyOnLoad();")).toBeGreaterThan(mount.indexOf("export function mount"));
  });

  test("never applies in the width knob's frame: the page above did, on the same storage", () => {
    kept({ ...LOGGED_IN, onLoad: true, clearFirst: true });
    local.map.set("written-by-the-page", "1");
    for (const frame of [{ frame: [FRAME_ATTRIBUTE] }, { name: FRAME_NAME }]) {
      open(frame);
      expect(applyOnLoad()).toBe(0);
      expect(local.map.has("token")).toBe(false);
      expect(local.map.get("written-by-the-page")).toBe("1");
      expect(session.all()).toEqual({});
      expect(jar.writes).toEqual([]);
      expect(appliedOnLoad()).toBe(0);
    }
  });

  test("applies nothing in fresh mode, and reads nothing of localStorage", () => {
    kept({ ...LOGGED_IN, onLoad: true, clearFirst: true });
    local.map.set("page", "1");
    open({ search: "?devknobs=fresh" });
    local.calls = 0;
    expect(applyOnLoad()).toBe(0);
    expect(local.calls).toBe(0);
    expect(local.map.get("page")).toBe("1");
    expect(local.map.has("token")).toBe(false);
    expect(session.map.has("step")).toBe(false);
    expect(jar.writes).toEqual([]);
  });

  test("clear first empties the page's local and session items, and never devknobs' own", () => {
    kept({ ...LOGGED_IN, onLoad: true, clearFirst: true });
    local.map.set("stale", "1");
    local.map.set("devknobs", "{}");
    session.map.set("stale", "1");
    open();
    expect(applyOnLoad()).toBe(1);
    expect(Object.keys(local.all()).sort()).toEqual(["devknobs", PRESETS_KEY, "token", "user"].sort());
    expect(session.all()).toEqual({ step: "2" });
  });

  test("without clear first, what is there stays", () => {
    kept({ ...LOGGED_IN, onLoad: true });
    session.map.set("stale", "1");
    open();
    applyOnLoad();
    expect(session.all()).toEqual({ stale: "1", step: "2" });
  });

  test("a write the browser refuses throws nothing, and the load goes on", () => {
    kept({ ...LOGGED_IN, onLoad: true });
    open();
    session.refuse = named("QuotaExceededError");
    expect(() => applyOnLoad()).not.toThrow();
    expect(local.map.get("token")).toBe("abc");
    Reflect.deleteProperty(globalThis, "window");
    expect(applyOnLoad()).toBe(0);
  });

  test("reset all turns it off for every preset, and deletes none", () => {
    kept({ ...LOGGED_IN, onLoad: true, clearFirst: true }, { ...LOGGED_IN, name: "other", onLoad: true });
    open();
    expect(applyOnLoad()).toBe(2);
    expect(appliedText(appliedOnLoad())).toBe("2 presets");
    stopOnLoad();
    expect(loadPresets()).toEqual([
      { ...LOGGED_IN, onLoad: false, clearFirst: true },
      { ...LOGGED_IN, name: "other", onLoad: false },
    ]);
    expect(appliedOnLoad()).toBe(0);
    expect(appliedText(appliedOnLoad())).toBe("");
    // The next load applies nothing.
    open();
    expect(applyOnLoad()).toBe(0);
  });

  test("with none marked, reset all writes nothing", () => {
    kept(LOGGED_IN);
    open();
    local.calls = 0;
    stopOnLoad();
    expect(local.calls).toBe(1);
  });
});
