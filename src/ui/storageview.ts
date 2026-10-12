import { listCaches, readCache } from "../storage/cache";
import { clearSite, countSite, countsText, reportLines } from "../storage/clear";
import { readCookies } from "../storage/cookies";
import { sizeLabel } from "../storage/format";
import { type DatabaseName, deleteDatabase, listDatabases, readDatabase } from "../storage/idb";
import { canKeep, loadPresets } from "../storage/presets";
import type { Site } from "../storage/site";
import { filterItems, readWeb } from "../storage/web";
import { copyText } from "./copytext";
import { button, el } from "./dom";
import { icon, type IconName } from "./icons";
import {
  branch,
  type ControlOption,
  confirmLine,
  controls,
  emptyLine,
  filterField,
  group,
  noteButton,
  noteLine,
  rowBox,
  sectionFold,
  stack,
  toolbar,
} from "./kit";
import { openPane, type PaneAction, type PaneView } from "./pane";
import { STORAGE_VIEW } from "./storageaction";
import { cookieSection } from "./storagecookies";
import { blockedLine, cacheSection, recordSection } from "./storagedeep";
import { counted, rowKeys, type Section, type Shell, type StorageDeps } from "./storageparts";
import { FRESH_PRESETS, onLoadLine, presetSection, savePreset } from "./storagepresets";
import { webSection } from "./storageweb";

/**
 * The storage view: what page script can read of the page's storage, on two
 * levels, laid out as the browsers' own tools lay it out. The first is a
 * tree of the stores: a node a store with what it holds, and under IndexedDB
 * and cache storage a node a database, an object store and a cache. A node
 * that holds a table opens it on a page of its own, which slides in over the
 * tree and whose way back is the tree. It reads through the page's own apis
 * and patches none of them. The two web storages and the cookies are kept
 * live by a slow tick that runs only while they are in sight, as a page's
 * own writes in this tab say nothing. Nothing leaves the view but by a copy
 * control.
 */

export type StorageKind = "local" | "session" | "cookies" | "indexeddb" | "cache" | "presets";

/** The stores, in the order their nodes stand, each with its full name and its icon. */
export const STORAGE_KINDS: readonly { value: StorageKind; label: string; icon: IconName }[] = [
  { value: "local", label: "local storage", icon: "table-2" },
  { value: "session", label: "session storage", icon: "table-2" },
  { value: "cookies", label: "cookies", icon: "cookie" },
  { value: "indexeddb", label: "IndexedDB", icon: "database" },
  { value: "cache", label: "cache storage", icon: "hard-drive" },
  { value: "presets", label: "presets", icon: "bookmark" },
];

/** The icons of the nodes under a store: a database, an object store and a cache. */
export const NODE_ICONS = { database: "database", store: "table-2", cache: "file" } as const satisfies Record<string, IconName>;

/** A table the tree opens on a page of its own. */
export type StoragePage =
  | { kind: "local" | "session" | "cookies" | "presets" }
  | { kind: "indexeddb"; database: string; store: string }
  | { kind: "cache"; cache: string };

/** How often what is live reads again, in ms. */
export const POLL_MS = 1000;

/** What a node says where its store cannot be read. Why is in its tooltip. */
export const NOT_READ = "cannot read";

/** What the presets' node stands under in the tree: they are devknobs' own, and not the page's. */
export const OWN_GROUP = "devknobs";

/** The page the view last showed, which it opens on again, or null for the tree. */
let last: StoragePage | null = null;

/** The nodes of the tree that are folded out, kept while the page is: a store's kind, or a database by its name. */
const expanded = new Set<string>();

function labelOf(kind: StorageKind): string {
  return STORAGE_KINDS.find((entry) => entry.value === kind)?.label ?? kind;
}

function iconOf(kind: StorageKind): IconName {
  return STORAGE_KINDS.find((entry) => entry.value === kind)?.icon ?? "database";
}

/** The id a page has among the panel's views. */
export function pageId(page: StoragePage): string {
  if (page.kind === "indexeddb") return `${STORAGE_VIEW}:indexeddb:${page.database}/${page.store}`;
  if (page.kind === "cache") return `${STORAGE_VIEW}:cache:${page.cache}`;
  return `${STORAGE_VIEW}:${page.kind}`;
}

/** What the head says over a page: the store's full name, or the table's own. */
export function pageTitle(page: StoragePage): string {
  if (page.kind === "indexeddb") return `${page.database} / ${page.store}`;
  if (page.kind === "cache") return page.cache;
  return labelOf(page.kind);
}

function defaults(): StorageDeps {
  return {
    site: window,
    copy: copyText,
    every(ms, run) {
      const timer = window.setInterval(run, ms);
      return () => window.clearInterval(timer);
    },
    onStorage(listener) {
      window.addEventListener("storage", listener);
      return () => window.removeEventListener("storage", listener);
    },
    visible: () => !document.hidden,
    now: () => Date.now(),
    open: openPane,
  };
}

/** A level of the view while it is mounted, as its head's actions reach it. */
interface Mounted {
  refresh(): void;
  clearAll(): void;
  escape(): boolean;
  /** Give the focus to the node of a page, on the level that has them. */
  focus?(page: StoragePage): void;
}

/** What names a database among the nodes that are folded out. */
function databaseKey(name: string): string {
  return `database:${name}`;
}

/** What a node says of what it holds. */
interface Summary {
  text: string;
  /** Whether it holds nothing, or cannot be read: said quietly, as a row's value at its default is. */
  idle: boolean;
  /** Why it cannot be read. */
  why?: string;
}

function holds(count: number, noun: readonly [string, string], bytes?: number): Summary {
  if (count === 0) return { text: `no ${noun[1]}`, idle: true };
  const size = bytes === undefined ? "" : ` · ${sizeLabel(bytes)}`;
  return { text: `${counted(count, noun)}${size}`, idle: false };
}

function unread(why: string): Summary {
  return { text: NOT_READ, idle: true, why };
}

function weight(items: readonly { size: number }[]): number {
  return items.reduce((sum, item) => sum + item.size, 0);
}

/**
 * The storage view, as the panel shows it: the tree of the stores, or the
 * page of the table it last showed, whose way back is the tree. `options`
 * stand in for the page in a test.
 */
export function storageView(options: Partial<StorageDeps> = {}): PaneView {
  const deps: StorageDeps = { ...defaults(), ...options };
  const site: Site = deps.site;
  let mounted: Mounted | null = null;

  const actions: PaneAction[] = [
    { label: "refresh", icon: "refresh-cw", run: () => mounted?.refresh() },
    { label: "clear site data", icon: "trash-2", run: () => mounted?.clearAll() },
  ];

  /**
   * What a level says and asks in, over its rows, and the half of the shell
   * that fills it. The place takes no room while nothing is said.
   */
  function talk() {
    const node = el("div", "ask");
    /** What escape takes back, the last opened first. */
    const held: (() => void)[] = [];
    let asked: HTMLElement | null = null;
    let told: HTMLElement[] = [];
    /** Closes what is in the place a question is asked in, while something is. */
    let closeAsked: (() => void) | null = null;

    function draw(): void {
      const parts = [...(asked ? [asked] : []), ...told];
      node.replaceChildren(...(parts.length > 0 ? [stack(parts)] : []));
    }

    const say: Shell["say"] = (lines, control) => {
      const said = typeof lines === "string" ? [lines] : lines;
      told = [...said.map(noteLine), ...(control ? [controls([control]).node] : [])];
      draw();
    };
    const hold: Shell["hold"] = (cancel) => {
      held.push(cancel);
      return () => {
        const at = held.indexOf(cancel);
        if (at >= 0) held.splice(at, 1);
      };
    };
    const put: Shell["put"] = (build) => {
      closeAsked?.();
      const close = (): void => {
        release();
        asked = null;
        draw();
        if (closeAsked === close) closeAsked = null;
      };
      const release = hold(close);
      closeAsked = close;
      const built = build(close);
      asked = built.node;
      draw();
      built.focus?.focus({ preventScroll: true });
    };
    const ask: Shell["ask"] = (text, confirm, run) => {
      put((close) => {
        const question = confirmLine({
          text,
          confirm,
          onConfirm() {
            close();
            run();
          },
          onCancel: close,
        });
        return { node: question.node, focus: question.buttons[0] };
      });
    };
    const copy: Shell["copy"] = (text, what) => {
      void deps.copy(text).then(
        (went) => say(went ? `copied ${what}` : `could not copy ${what}`),
        () => say(`could not copy ${what}`),
      );
    };
    return {
      node,
      shell: { site, now: deps.now, say, hold, put, ask, copy },
      /** Take back the last thing escape takes back, and say whether there was one. */
      escape(): boolean {
        const cancel = held.pop();
        cancel?.();
        return cancel !== undefined;
      },
    };
  }

  /** Ask to clear everything of the page's, and say what went. */
  function clearAll(shell: Shell): void {
    const own = shell.own();
    void countSite(site, own).then((counts) => {
      const kept = own ? ", devknobs' own items too" : ". devknobs' own items are kept";
      shell.ask(`clear site data? ${countsText(counts)}${kept}`, "clear site data", () => {
        void clearSite(site, own).then((report) => {
          shell.say(reportLines(report), {
            label: "reload the page",
            run: () => site.location.reload(),
          });
          shell.touched();
        });
      });
    });
  }

  /** The tick, which reads only while the view is in sight. Returns the way to stop. */
  function tick(run: () => void): () => void {
    return deps.every(POLL_MS, () => {
      if (deps.visible()) run();
    });
  }

  const home: PaneView = {
    id: STORAGE_VIEW,
    title: "storage",
    layout: "flush",
    actions,
    mount(body: HTMLElement): () => void {
      last = null;
      const said = talk();
      const tree = el("div", "st-list");
      /** The node of each table, by its page's id, for the way back to find. */
      const leaves = new Map<string, HTMLButtonElement>();
      /** The page whose node takes the focus once it is in the tree. */
      let wanted: string | null = null;

      /** A node that holds a table, and opens it. */
      function leaf(glyph: IconName, title: string, page: StoragePage) {
        const main = button("main", "");
        const value = el("span", "row-value idle", "");
        main.addEventListener("click", () => deps.open(pageView(page)));
        const { box } = rowBox({ main, glyph: icon(glyph), title, ends: [value] });
        leaves.set(pageId(page), main);
        return { box, main, value };
      }

      /** Give the focus to the node the way back asked for, once it is in the tree. */
      function claim(): void {
        const main = wanted === null ? undefined : leaves.get(wanted);
        if (!main) return;
        wanted = null;
        main.focus({ preventScroll: true });
      }

      /** A node that holds nodes, folded out or away as it was left. */
      function node(key: string, glyph: IconName, title: string, opened: () => void) {
        const value = el("span", "row-value idle", "");
        const fold = sectionFold({
          label: title,
          glyph: icon(glyph),
          ends: [value],
          open: expanded.has(key),
          onToggle(out) {
            if (out) {
              expanded.add(key);
              opened();
            } else expanded.delete(key);
          },
        });
        return { fold, value };
      }

      function tell(value: HTMLElement, summary: Summary): void {
        value.textContent = summary.text;
        value.title = summary.why ?? "";
        value.classList.toggle("idle", summary.idle);
      }

      const web = {
        local: leaf(iconOf("local"), labelOf("local"), { kind: "local" }),
        session: leaf(iconOf("session"), labelOf("session"), { kind: "session" }),
      };
      const cookies = leaf(iconOf("cookies"), labelOf("cookies"), { kind: "cookies" });
      const presets = leaf(iconOf("presets"), labelOf("presets"), { kind: "presets" });
      const databases = node("indexeddb", iconOf("indexeddb"), labelOf("indexeddb"), () => {});
      const caches = node("cache", iconOf("cache"), labelOf("cache"), () => void countCaches());
      const onLoad = el("div", "st-list");
      const own = group({ label: OWN_GROUP });
      own.append(presets.box, onLoad);
      tree.append(web.local.box, web.session.box, cookies.box, databases.fold.node, caches.fold.node, own);
      body.append(said.node, tree);

      let gone = false;
      /** Count the reads, so one that comes back late says nothing over a newer one. */
      let live = 0;
      let deep = 0;

      /** The databases' nodes as built, each with the nodes of its object stores while it is folded out. */
      let databaseNodes: { main: HTMLElement; name: string; stores: HTMLElement[] }[] = [];
      /** The caches' nodes as built, each with where it says how many requests it holds. */
      let cacheNodes: { main: HTMLElement; name: string; value: HTMLElement }[] = [];

      /** Every node that shows, from the top down, for the arrow keys. */
      function mains(): { main: HTMLElement }[] {
        const shown: HTMLElement[] = [web.local.main, web.session.main, cookies.main, databases.fold.main];
        if (expanded.has("indexeddb")) {
          for (const database of databaseNodes) {
            shown.push(database.main);
            if (expanded.has(databaseKey(database.name))) shown.push(...database.stores);
          }
        }
        shown.push(caches.fold.main);
        if (expanded.has("cache")) shown.push(...cacheNodes.map((cache) => cache.main));
        shown.push(presets.main);
        return shown.map((main) => ({ main }));
      }
      rowKeys(tree, mains);

      /** The stores a tick keeps live: the two web storages, the presets and the cookies. */
      async function readLive(): Promise<void> {
        const mine = ++live;
        for (const kind of ["local", "session"] as const) {
          const read = readWeb(site, kind);
          const items = filterItems(read.items, "", false);
          tell(
            web[kind].value,
            read.error === null ? holds(items.length, ["item", "items"], weight(items)) : unread(read.error),
          );
        }
        const kept = canKeep() ? loadPresets() : null;
        tell(presets.value, kept === null ? unread(FRESH_PRESETS) : holds(kept.length, ["preset", "presets"]));
        const line = kept === null ? FRESH_PRESETS : onLoadLine(kept);
        if (onLoad.children[0]?.textContent !== line) onLoad.replaceChildren(noteLine(line));
        const read = await readCookies(site);
        if (gone || mine !== live) return;
        tell(
          cookies.value,
          read.error === null
            ? holds(read.cookies.length, ["cookie", "cookies"], weight(read.cookies))
            : unread(read.error),
        );
      }

      /** Ask to delete a whole database, and read the tree again once it went. */
      function dropDatabase(name: string): void {
        shell.ask(`delete the database ${name}? the page may need a reload after`, "delete", () => {
          void deleteDatabase(site, name).then((result) => {
            if (result === "blocked") shell.say(blockedLine(name));
            else if (result === "failed") shell.say(`cannot delete ${name}`);
            expanded.delete(databaseKey(name));
            void readDeep();
          });
        });
      }

      /** A database's node: its object stores under it, each opening its table, and the way to delete it. */
      function databaseNode(database: DatabaseName, mine: number) {
        const { name } = database;
        const built: (typeof databaseNodes)[number] = { main: el("span", ""), name, stores: [] };

        async function fill(): Promise<void> {
          fold.body.replaceChildren(branch([noteLine("reading")]));
          const got = await readDatabase(site, name);
          if (gone || mine !== deep) return;
          const remove = stack([controls([{ label: "delete database", run: () => dropDatabase(name) }]).node]);
          if (got.error !== null) {
            built.stores = [];
            fold.body.replaceChildren(branch([noteLine(got.error), remove]));
            return;
          }
          const stores = got.stores.map((store) => {
            const made = leaf(NODE_ICONS.store, store.name, { kind: "indexeddb", database: name, store: store.name });
            if (store.count !== null) tell(made.value, holds(store.count, ["record", "records"]));
            return made;
          });
          built.stores = stores.map((store) => store.main);
          fold.body.replaceChildren(
            branch([
              ...(stores.length > 0 ? stores.map((store) => store.box) : [emptyLine("no object stores")]),
              remove,
            ]),
          );
          claim();
        }

        const { fold, value } = node(databaseKey(name), NODE_ICONS.database, name, () => void fill());
        tell(value, { text: `version ${database.version}`, idle: false });
        built.main = fold.main;
        if (expanded.has(databaseKey(name))) void fill();
        return { built, box: fold.node };
      }

      /** Say how many requests each cache holds, once its node shows: the keys of a cache are cheap to count. */
      async function countCaches(): Promise<void> {
        const mine = deep;
        for (const cache of cacheNodes) {
          const read = await readCache(site, cache.name, 0, 0);
          if (gone || mine !== deep) return;
          tell(cache.value, read.error === null ? holds(read.total, ["request", "requests"]) : unread(read.error));
        }
      }

      /** The stores read only as the tree opens and on refresh: the databases and the caches. */
      async function readDeep(): Promise<void> {
        const mine = ++deep;
        const [listed, named] = await Promise.all([listDatabases(site), listCaches(site)]);
        if (gone || mine !== deep) return;
        tell(
          databases.value,
          listed.error === null
            ? holds(listed.databases.length, ["database", "databases"])
            : unread(listed.error),
        );
        const made = listed.databases.map((database) => databaseNode(database, mine));
        databaseNodes = made.map((each) => each.built);
        databases.fold.body.replaceChildren(
          branch(
            listed.error !== null
              ? [noteLine(listed.error)]
              : made.length > 0
                ? made.map((each) => each.box)
                : [emptyLine("no databases")],
          ),
        );
        tell(caches.value, named.error === null ? holds(named.names.length, ["cache", "caches"]) : unread(named.error));
        const files = named.names.map((name) => ({ name, ...leaf(NODE_ICONS.cache, name, { kind: "cache", cache: name }) }));
        cacheNodes = files;
        caches.fold.body.replaceChildren(
          branch(
            named.error !== null
              ? [noteLine(named.error)]
              : files.length > 0
                ? files.map((file) => file.box)
                : [emptyLine("no caches")],
          ),
        );
        claim();
        if (expanded.has("cache")) void countCaches();
      }

      function refresh(): void {
        void readLive();
        void readDeep();
      }

      const shell: Shell = {
        ...said.shell,
        // The tree shows none of devknobs' own, so a clear from it keeps them.
        own: () => false,
        query: () => "",
        counted() {},
        touched: refresh,
      };
      const stopPoll = tick(() => void readLive());
      const stopStorage = deps.onStorage(() => void readLive());

      mounted = {
        refresh,
        clearAll: () => clearAll(shell),
        escape: said.escape,
        focus(page) {
          const id = pageId(page);
          const main = leaves.get(id);
          if (main) main.focus({ preventScroll: true });
          // A node under a database or a cache is in the tree once that is read again.
          else wanted = id;
        },
      };
      refresh();

      return () => {
        gone = true;
        mounted = null;
        stopPoll();
        stopStorage();
      };
    },
    escape: () => mounted?.escape() ?? false,
  };

  function sectionOf(page: StoragePage, shell: Shell): Section {
    if (page.kind === "local" || page.kind === "session") return webSection(shell, page.kind);
    if (page.kind === "cookies") return cookieSection(shell);
    if (page.kind === "indexeddb") return recordSection(shell, page.database, page.store);
    if (page.kind === "cache") return cacheSection(shell, page.cache);
    return presetSection(shell);
  }

  /** The page of one table: its filter, its own controls, and its lines under their head. */
  function pageView(page: StoragePage): PaneView {
    const { kind } = page;
    const title = pageTitle(page);

    function mount(body: HTMLElement): () => void {
      last = page;
      /** Whether devknobs' own items show, and go with a clear. */
      let own = false;
      const said = talk();
      const filter = filterField({
        placeholder: "filter",
        label: `filter ${title}`,
        onInput: () => section.filter(),
      });

      /** The line the list ends with while it has some of devknobs' own, which shows and hides them. */
      const ownLine = el("div", "st-list");
      const ownToggle = noteButton("", () => {
        own = !own;
        section.filter();
        shell.counted();
      });
      function drawOwn(): void {
        const hidden = section.hidden?.() ?? 0;
        if (hidden === 0) {
          ownLine.replaceChildren();
          return;
        }
        ownToggle.textContent = own ? "hide devknobs' own" : `${hidden} hidden (devknobs' own)`;
        // The line stays on the page while it is there, so it keeps the focus as the list reads again.
        if (ownLine.children.length === 0) ownLine.replaceChildren(ownToggle);
      }

      const shell: Shell = {
        ...said.shell,
        own: () => own,
        query: () => filter.node.value,
        counted() {
          const count = section.count();
          filter.node.placeholder =
            count === null ? `filter ${section.noun[1]}` : `filter ${counted(count, section.noun)}`;
          drawOwn();
        },
        touched: () => void section.refresh(),
      };
      const section = sectionOf(page, shell);

      /** The table's own controls, under the filter: what adds to it, what empties it, what keeps it. */
      const items: ControlOption[] = [...(section.controls?.() ?? [])];
      if (section.clear) items.push({ label: "clear", run: () => section.clear?.() });
      if (kind === "presets") {
        // The filter here is over the presets' names, so all the page holds is kept.
        items.unshift({ label: "save current as preset", run: () => void savePreset(shell, "") });
      } else if (kind !== "indexeddb" && kind !== "cache") {
        items.push({ label: "save as preset", run: () => void savePreset(shell, shell.query()) });
      }
      const bar = toolbar([filter.node, ...(items.length > 0 ? [controls(items).node] : [])]);
      body.append(bar, said.node, section.node, ownLine);

      const stopPoll = section.live ? tick(() => void section.refresh()) : null;
      const stopStorage = deps.onStorage(() => {
        if (kind === "local" || kind === "session" || kind === "presets") void section.refresh();
      });

      mounted = {
        refresh: () => void section.refresh(),
        clearAll: () => clearAll(shell),
        // Escape takes back what is open, then empties the filter, and then goes back to the tree.
        escape: () => said.escape() || filter.clear(),
      };

      section.filter();
      shell.counted();
      void section.refresh();

      return () => {
        mounted = null;
        stopPoll?.();
        stopStorage();
        section.destroy?.();
      };
    }

    return {
      id: pageId(page),
      title,
      layout: "flush",
      // A step inside the tree: it slides in over it, and the tree slides back.
      under: STORAGE_VIEW,
      actions,
      mount,
      escape: () => mounted?.escape() ?? false,
      // The head's way back and Escape go to the tree, and to the node the page was opened from.
      back(): void {
        deps.open(home);
        mounted?.focus?.(page);
      },
    };
  }

  return last === null ? home : pageView(last);
}
