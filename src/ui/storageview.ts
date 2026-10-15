import { listCaches, readCache } from "../storage/cache";
import { clearSite, countSite, countsText, reportLines } from "../storage/clear";
import { type Cookie, filterCookies, readCookies } from "../storage/cookies";
import { sizeLabel } from "../storage/format";
import { type DatabaseName, deleteDatabase, listDatabases, readDatabase } from "../storage/idb";
import { canKeep, filterPresets, loadPresets, type Preset } from "../storage/presets";
import type { Site } from "../storage/site";
import { filterItems, readWeb, type WebItem } from "../storage/web";
import { copyText } from "./copytext";
import { el } from "./dom";
import { icon, type IconName } from "./icons";
import {
  branch,
  type ControlOption,
  confirmLine,
  controls,
  emptyLine,
  type Fold,
  filterField,
  group,
  noteButton,
  noteLine,
  sectionFold,
  stack,
  toolbar,
} from "./kit";
import type { PaneView } from "./pane";
import { STORAGE_VIEW } from "./storageaction";
import { cookieSection } from "./storagecookies";
import { blockedLine, cacheSection, recordSection } from "./storagedeep";
import {
  counted,
  rowKeys,
  type Section,
  type Shell,
  type StorageDeps,
  type StorageMemory,
} from "./storageparts";
import { FRESH_PRESETS, onLoadLine, presetSection, savePreset } from "./storagepresets";
import { webSection } from "./storageweb";

/**
 * The storage view: what page script can read of the page's storage, as one
 * tree, laid out as the browsers' own tools lay it out. A node is a store
 * with what it holds, and it folds out in place to its table: its own
 * controls on the first line, then a line an item under a head that names
 * the columns. Under IndexedDB a node is a database and under that an object
 * store, and under cache storage a cache, each folding out to its table the
 * same way. Nothing here opens another page. One filter over the tree is
 * for every table at once. A node folded away builds none of its lines and
 * reads nothing but what its summary says. The view reads through the
 * page's own apis and patches none of them. The two web storages and the
 * cookies are kept live by a slow tick that runs only while the view is in
 * sight, as a page's own writes in this tab say nothing. Nothing leaves the
 * view but by a copy control.
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

/** How often what is live reads again, in ms. */
export const POLL_MS = 1000;

/** How long a node folded away keeps what it showed, in ms: until its fold has eased away. */
export const FOLD_MS = 200;

/** What a node says where its store cannot be read. Why is in its tooltip. */
export const NOT_READ = "cannot read";

/** What the presets' node stands under in the tree: they are devknobs' own, and not the page's. */
export const OWN_GROUP = "devknobs";

/** What the view keeps while the page is, where a test hands in none of its own. */
const kept: StorageMemory = { expanded: new Set(), seeded: false };

function labelOf(kind: StorageKind): string {
  return STORAGE_KINDS.find((entry) => entry.value === kind)?.label ?? kind;
}

function iconOf(kind: StorageKind): IconName {
  return STORAGE_KINDS.find((entry) => entry.value === kind)?.icon ?? "database";
}

/** The keys nodes under a store are remembered by. */
export function databaseKey(name: string): string {
  return `database:${name}`;
}
export function storeKey(database: string, store: string): string {
  return `store:${database}/${store}`;
}
export function cacheKey(name: string): string {
  return `cache:${name}`;
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
    memory: kept,
  };
}

/** The view while it is mounted, as its head's actions reach it. */
interface Mounted {
  refresh(): void;
  clearAll(): void;
  escape(): boolean;
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

/** A table folded out under its node: what it is built from, and how the view drives it. */
interface Panel {
  kind: StorageKind;
  node: HTMLElement;
  section: Section;
  /** Whether devknobs' own items show in it, and so go with a clear. */
  own(): boolean;
  destroy(): void;
}

/** A node of the tree, as the view drives it. */
interface TreeNode {
  fold: Fold;
  /** Say what the node holds, at the end of its line. */
  tell(summary: Summary): void;
  /** Say it quietly whatever it holds: a filter found nothing in it. */
  hush(on: boolean): void;
  isOpen(): boolean;
  /** Fold it out or away, and build or drop what is under it. */
  show(open: boolean): void;
}

/** The storage view, as the panel shows it. `options` stand in for the page in a test. */
export function storageView(options: Partial<StorageDeps> = {}): PaneView {
  const deps: StorageDeps = { ...defaults(), ...options };
  const site: Site = deps.site;
  const { memory } = deps;
  const { expanded } = memory;
  let mounted: Mounted | null = null;

  function mount(body: HTMLElement): () => void {
    let gone = false;
    /** What escape takes back, the last opened first, in whichever node it is. */
    const held: (() => void)[] = [];
    /** The tables that are folded out. */
    const panels = new Set<Panel>();

    /**
     * What a node says and asks in, next to what it is about, and the half
     * of the shell that fills it. The place takes no room while nothing is
     * said.
     */
    function talk() {
      const node = el("div", "ask");
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
        /** Close what is asked here, as the node it is in folds away. */
        close: () => closeAsked?.(),
      };
    }

    const filter = filterField({
      placeholder: "filter storage",
      onInput: () => applyFilter(),
    });
    /** What the filter says, as it is matched: trimmed, in lower case. */
    const typed = (): string => filter.node.value.trim().toLowerCase();
    /** What the filter says for a node with these names: nothing where one of them is what it matches. */
    function queryFor(names: readonly string[]): string {
      const text = typed();
      if (text === "") return "";
      return names.some((name) => name.toLowerCase().includes(text)) ? "" : filter.node.value;
    }

    /** Empty a fold that went away, once it has eased away: at once where nothing eases. */
    function drop(fold: Fold, isOpen: () => boolean): void {
      const empty = (): void => {
        if (!gone && !isOpen()) fold.body.replaceChildren();
      };
      if (typeof getComputedStyle !== "function") empty();
      else setTimeout(empty, FOLD_MS);
    }

    /**
     * A node, folded out or away as it was left. `filled` builds what is
     * under it as it folds out and returns the way to take it down again.
     * Folded away, it holds nothing.
     */
    function treeNode(
      key: string,
      glyph: IconName,
      title: string,
      filled: (fold: Fold) => () => void,
    ): TreeNode {
      const value = el("span", "row-value idle", "");
      let summary: Summary = { text: "", idle: true };
      let hushed = false;
      let open = false;
      let down: (() => void) | null = null;

      function paint(): void {
        value.textContent = summary.text;
        value.title = summary.why ?? "";
        value.classList.toggle("idle", summary.idle || hushed);
      }

      function build(next: boolean): void {
        if (next === open) return;
        open = next;
        if (next) down = filled(fold);
        else {
          down?.();
          down = null;
          drop(fold, () => open);
        }
      }

      const fold = sectionFold({
        label: title,
        glyph: icon(glyph),
        ends: [value],
        open: false,
        onToggle(out) {
          // A press is the user's own word on the node, a filter on or not.
          if (out) expanded.add(key);
          else expanded.delete(key);
          build(out);
        },
      });
      const node: TreeNode = {
        fold,
        tell(next) {
          summary = next;
          paint();
        },
        hush(on) {
          hushed = on;
          paint();
        },
        isOpen: () => open,
        show(next) {
          if (next === open) return;
          fold.set(next);
          build(next);
        },
      };
      return node;
    }

    /**
     * A table under its node: the store's own controls on its first line,
     * what the node says and asks, the table's lines, and the line that ends
     * a list with some of devknobs' own in it.
     */
    function panel(kind: StorageKind, names: readonly string[], make: (shell: Shell) => Section): Panel {
      let own = false;
      const said = talk();
      const ownLine = el("div", "st-list");
      const ownToggle = noteButton("", () => {
        own = !own;
        section.filter();
        drawOwn();
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
        query: () => queryFor(names),
        counted() {
          drawOwn();
          // What the table shows is what its node says it holds.
          summaries();
        },
        touched,
      };
      const section = make(shell);

      const items: ControlOption[] = [...(section.controls?.() ?? [])];
      if (section.clear) items.push({ label: "clear", run: () => section.clear?.() });
      if (kind === "presets") {
        // The filter is no word on what a preset keeps here: all the page holds is kept.
        items.unshift({ label: "save current as preset", run: () => void savePreset(shell, "") });
      } else if (kind !== "indexeddb" && kind !== "cache") {
        items.push({ label: "save as preset", run: () => void savePreset(shell, shell.query()) });
      }
      const node = branch([
        ...(items.length > 0 ? [stack([controls(items).node])] : []),
        said.node,
        section.node,
        ownLine,
      ]);
      const built: Panel = {
        kind,
        node,
        section,
        own: () => own,
        destroy() {
          panels.delete(built);
          said.close();
          section.destroy?.();
        },
      };
      panels.add(built);
      section.filter();
      void section.refresh();
      return built;
    }

    /** A node that folds out to a table. */
    function tableNode(
      key: string,
      glyph: IconName,
      title: string,
      kind: StorageKind,
      names: readonly string[],
      make: (shell: Shell) => Section,
    ): TreeNode {
      return treeNode(key, glyph, title, (fold) => {
        const built = panel(kind, names, make);
        fold.body.replaceChildren(built.node);
        return built.destroy;
      });
    }

    /** What the tick last read of the stores that are cheap to read, for their summaries and for the filter. */
    const data: {
      local: WebItem[];
      session: WebItem[];
      cookies: Cookie[];
      presets: Preset[];
      databases: DatabaseName[];
      caches: string[];
    } = { local: [], session: [], cookies: [], presets: [], databases: [], caches: [] };

    const cheap = {
      local: tableNode("local", iconOf("local"), labelOf("local"), "local", [labelOf("local")], (shell) =>
        webSection(shell, "local"),
      ),
      session: tableNode("session", iconOf("session"), labelOf("session"), "session", [labelOf("session")], (shell) =>
        webSection(shell, "session"),
      ),
      cookies: tableNode("cookies", iconOf("cookies"), labelOf("cookies"), "cookies", [labelOf("cookies")], cookieSection),
      presets: tableNode("presets", iconOf("presets"), labelOf("presets"), "presets", [labelOf("presets")], presetSection),
    };
    const CHEAP = ["local", "session", "cookies", "presets"] as const;

    /** How many lines of a store that is cheap to read the filter leaves. */
    function matching(kind: (typeof CHEAP)[number], query: string): number {
      if (kind === "cookies") return filterCookies(data.cookies, query).length;
      if (kind === "presets") return filterPresets(data.presets, query).length;
      return filterItems(data[kind], query, false).length;
    }

    /**
     * The filter changed. A store that is cheap to read folds out where it
     * has lines the filter keeps and away, quiet, where it has none, and
     * goes back to how the user left it once the filter is empty, or where
     * its own name is what matches. The tables that are out show what the
     * filter keeps of what they read.
     */
    function applyFilter(): void {
      const on = typed() !== "";
      for (const kind of CHEAP) {
        const node = cheap[kind];
        // With no filter, or with the store's own name what it matches, the node is as the user left it.
        const free = !on || queryFor([labelOf(kind)]) === "";
        const found = free ? 0 : matching(kind, filter.node.value);
        node.hush(!free && found === 0);
        node.show(free ? expanded.has(kind) : found > 0);
      }
      for (const built of panels) built.section.filter();
    }

    /** The object stores of a database, as nodes, with what each last said it holds. */
    interface DatabaseNode {
      name: string;
      node: TreeNode;
      stores: { name: string; node: TreeNode }[];
      /** Read its stores again where it is folded out. */
      refresh(): void;
    }
    let databaseNodes: DatabaseNode[] = [];
    let cacheNodes: { name: string; node: TreeNode }[] = [];
    /** Counts the reads of the databases and caches, so one that comes back late draws nothing. */
    let deep = 0;

    /** A database's node: its object stores under it, each folding out to its table, and the way to delete it. */
    function databaseNode(database: DatabaseName): DatabaseNode {
      const { name } = database;
      const said = talk();
      const list = el("div", "st-list");
      /** The names of the stores as drawn, to tell whether a new read changed them. */
      let drawn: string | null = null;
      let asked = 0;

      function remove(): void {
        said.shell.ask(`delete the database ${name}? the page may need a reload after`, "delete", () => {
          void deleteDatabase(site, name).then((result) => {
            if (result === "blocked") top.shell.say(blockedLine(name));
            else if (result === "failed") top.shell.say(`cannot delete ${name}`);
            expanded.delete(databaseKey(name));
            void readDeep();
          });
        });
      }

      async function fill(): Promise<void> {
        const mine = ++asked;
        if (drawn === null) list.replaceChildren(noteLine("reading"));
        const got = await readDatabase(site, name);
        if (gone || mine !== asked || !built.node.isOpen()) return;
        const names = got.error ?? got.stores.map((store) => store.name).join("\n");
        if (names !== drawn) {
          drawn = names;
          for (const store of built.stores) store.node.show(false);
          built.stores = got.stores.map((store) => ({
            name: store.name,
            node: tableNode(
              storeKey(name, store.name),
              NODE_ICONS.store,
              store.name,
              "indexeddb",
              [store.name, name],
              (shell) => recordSection(shell, name, store.name),
            ),
          }));
          list.replaceChildren(
            ...(got.error !== null
              ? [noteLine(got.error)]
              : built.stores.length > 0
                ? built.stores.map((store) => store.node.fold.node)
                : [emptyLine("no object stores")]),
          );
          for (const store of built.stores) store.node.show(expanded.has(storeKey(name, store.name)));
        }
        for (const store of got.stores) {
          const made = built.stores.find((each) => each.name === store.name);
          if (store.count !== null) made?.node.tell(holds(store.count, ["record", "records"]));
        }
      }

      const node = treeNode(databaseKey(name), NODE_ICONS.database, name, (fold) => {
        drawn = null;
        fold.body.replaceChildren(
          branch([said.node, list, stack([controls([{ label: "delete database", run: remove }]).node])]),
        );
        void fill();
        return () => {
          asked++;
          said.close();
          for (const store of built.stores) store.node.show(false);
          built.stores = [];
        };
      });
      node.tell({ text: `version ${database.version}`, idle: false });
      const built: DatabaseNode = {
        name,
        node,
        stores: [],
        refresh() {
          if (node.isOpen()) void fill();
        },
      };
      return built;
    }

    /** Draw the databases under IndexedDB, where it is folded out: the nodes there are kept while the list is the same. */
    let databasesDrawn: string | null = null;
    let databasesError: string | null = null;
    function drawDatabases(fold: Fold): void {
      const said = databasesError ?? data.databases.map((each) => `${each.name}\n${each.version}`).join("\n\n");
      if (said === databasesDrawn) {
        for (const database of databaseNodes) database.refresh();
        return;
      }
      databasesDrawn = said;
      for (const database of databaseNodes) database.node.show(false);
      databaseNodes = databasesError === null ? data.databases.map(databaseNode) : [];
      fold.body.replaceChildren(
        branch(
          databasesError !== null
            ? [noteLine(databasesError)]
            : databaseNodes.length > 0
              ? databaseNodes.map((database) => database.node.fold.node)
              : [emptyLine("no databases")],
        ),
      );
      for (const database of databaseNodes) database.node.show(expanded.has(databaseKey(database.name)));
    }

    const databases = treeNode("indexeddb", iconOf("indexeddb"), labelOf("indexeddb"), (fold) => {
      databasesDrawn = null;
      drawDatabases(fold);
      return () => {
        for (const database of databaseNodes) database.node.show(false);
        databaseNodes = [];
      };
    });

    /** Say how many requests each cache holds: the keys of a cache are cheap to count, and none of it is read. */
    async function countCaches(): Promise<void> {
      const mine = deep;
      for (const cache of [...cacheNodes]) {
        const read = await readCache(site, cache.name, 0, 0);
        if (gone || mine !== deep) return;
        cache.node.tell(read.error === null ? holds(read.total, ["request", "requests"]) : unread(read.error));
      }
    }

    let cachesDrawn: string | null = null;
    let cachesError: string | null = null;
    function drawCaches(fold: Fold): void {
      const said = cachesError ?? data.caches.join("\n");
      if (said !== cachesDrawn) {
        cachesDrawn = said;
        for (const cache of cacheNodes) cache.node.show(false);
        cacheNodes =
          cachesError === null
            ? data.caches.map((name) => ({
                name,
                node: tableNode(cacheKey(name), NODE_ICONS.cache, name, "cache", [name], (shell) =>
                  cacheSection(shell, name),
                ),
              }))
            : [];
        fold.body.replaceChildren(
          branch(
            cachesError !== null
              ? [noteLine(cachesError)]
              : cacheNodes.length > 0
                ? cacheNodes.map((cache) => cache.node.fold.node)
                : [emptyLine("no caches")],
          ),
        );
        for (const cache of cacheNodes) cache.node.show(expanded.has(cacheKey(cache.name)));
      }
      void countCaches();
    }

    const caches = treeNode("cache", iconOf("cache"), labelOf("cache"), (fold) => {
      cachesDrawn = null;
      drawCaches(fold);
      return () => {
        for (const cache of cacheNodes) cache.node.show(false);
        cacheNodes = [];
      };
    });

    const top = talk();
    const tree = el("div", "st-list");
    const onLoad = el("div", "st-list");
    const own = group({ label: OWN_GROUP });
    own.append(cheap.presets.fold.node, onLoad);
    tree.append(
      cheap.local.fold.node,
      cheap.session.fold.node,
      cheap.cookies.fold.node,
      databases.fold.node,
      caches.fold.node,
      own,
    );
    body.append(toolbar([filter.node]), top.node, tree);

    /** Every node that shows, from the top down, for the arrow keys: a table's own lines have keys of their own. */
    function mains(): { main: HTMLElement }[] {
      const shown: HTMLElement[] = [cheap.local.fold.main, cheap.session.fold.main, cheap.cookies.fold.main];
      shown.push(databases.fold.main);
      for (const database of databaseNodes) {
        shown.push(database.node.fold.main, ...database.stores.map((store) => store.node.fold.main));
      }
      shown.push(caches.fold.main, ...cacheNodes.map((cache) => cache.node.fold.main), cheap.presets.fold.main);
      return shown.map((main) => ({ main }));
    }
    rowKeys(tree, mains);

    /** What the web storages and the presets hold, read at once: their nodes' summaries, and the line on what applies on load. */
    function summaries(): void {
      for (const kind of ["local", "session"] as const) {
        const read = readWeb(site, kind, data[kind]);
        data[kind] = read.items;
        const items = filterItems(read.items, "", false);
        cheap[kind].tell(
          read.error === null ? holds(items.length, ["item", "items"], weight(items)) : unread(read.error),
        );
      }
      const presets = canKeep() ? loadPresets() : null;
      data.presets = presets ?? [];
      cheap.presets.tell(
        presets === null ? unread(FRESH_PRESETS) : holds(presets.length, ["preset", "presets"]),
      );
      const line = presets === null ? FRESH_PRESETS : onLoadLine(presets);
      if (onLoad.children[0]?.textContent !== line) onLoad.replaceChildren(noteLine(line));
    }

    /** Counts the reads of the cookies, so one that comes back late says nothing over a newer one. */
    let live = 0;

    /** The stores a tick keeps live: the two web storages, the presets and the cookies. */
    async function readLive(): Promise<void> {
      const mine = ++live;
      summaries();
      const read = await readCookies(site);
      if (gone || mine !== live) return;
      data.cookies = read.cookies;
      cheap.cookies.tell(
        read.error === null
          ? holds(read.cookies.length, ["cookie", "cookies"], weight(read.cookies))
          : unread(read.error),
      );
    }

    /** The stores read only as the view opens and on refresh: the databases and the caches, by their names alone. */
    async function readDeep(): Promise<void> {
      const mine = ++deep;
      const [listed, named] = await Promise.all([listDatabases(site), listCaches(site)]);
      if (gone || mine !== deep) return;
      data.databases = listed.databases;
      databasesError = listed.error;
      databases.tell(
        listed.error === null ? holds(listed.databases.length, ["database", "databases"]) : unread(listed.error),
      );
      if (databases.isOpen()) drawDatabases(databases.fold);
      data.caches = named.names;
      cachesError = named.error;
      caches.tell(named.error === null ? holds(named.names.length, ["cache", "caches"]) : unread(named.error));
      if (caches.isOpen()) drawCaches(caches.fold);
    }

    /** Read the tables that are out again, those of `kinds`, or all of them. */
    function reread(kinds?: readonly StorageKind[]): void {
      for (const built of panels) {
        if (!kinds || kinds.includes(built.kind)) void built.section.refresh();
      }
    }

    /** The view wrote to the page's storage: what is cheap to read is read again, and a table of records is left as it is. */
    function touched(): void {
      void readLive();
      reread(CHEAP);
    }

    function refresh(): Promise<unknown> {
      reread();
      return Promise.all([readLive(), readDeep()]);
    }

    const shell: Shell = {
      ...top.shell,
      // devknobs' own go with a clear only where a table shows them.
      own: () => [...panels].some((built) => built.own()),
      query: () => "",
      counted() {},
      touched: () => void refresh(),
    };

    /** Ask to clear everything of the page's, and say what went. */
    function clearAll(): void {
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

    /** The tick reads only while the view is in sight: the summaries, and the tables that are out and live. */
    const stopPoll = deps.every(POLL_MS, () => {
      if (!deps.visible()) return;
      void readLive();
      for (const built of panels) if (built.section.live) void built.section.refresh();
    });
    const stopStorage = deps.onStorage(() => {
      void readLive();
      reread(["local", "session", "presets"]);
    });

    mounted = {
      refresh: () => void refresh(),
      clearAll,
      // Escape takes back what is open, then empties the filter, and then leaves the view.
      escape() {
        const cancel = held.pop();
        if (cancel) {
          cancel();
          return true;
        }
        return filter.clear();
      },
    };

    // The nodes come back as they were left. The first time, the first store with something in it is out.
    for (const kind of CHEAP) cheap[kind].show(expanded.has(kind));
    databases.show(expanded.has("indexeddb"));
    caches.show(expanded.has("cache"));
    void refresh().then(() => {
      if (gone || memory.seeded) return;
      memory.seeded = true;
      const has: [boolean, TreeNode, string][] = [
        [filterItems(data.local, "", false).length > 0, cheap.local, "local"],
        [filterItems(data.session, "", false).length > 0, cheap.session, "session"],
        [data.cookies.length > 0, cheap.cookies, "cookies"],
        [data.databases.length > 0, databases, "indexeddb"],
        [data.caches.length > 0, caches, "cache"],
        [data.presets.length > 0, cheap.presets, "presets"],
      ];
      const first = has.find(([holds]) => holds);
      if (!first || expanded.size > 0) return;
      expanded.add(first[2]);
      first[1].show(true);
    });

    return () => {
      gone = true;
      mounted = null;
      stopPoll();
      stopStorage();
      for (const built of [...panels]) built.destroy();
    };
  }

  return {
    id: STORAGE_VIEW,
    title: "storage",
    layout: "flush",
    mount,
    actions: [
      { label: "refresh", icon: "refresh-cw", run: () => mounted?.refresh() },
      { label: "clear site data", icon: "trash-2", run: () => mounted?.clearAll() },
    ],
    escape: () => mounted?.escape() ?? false,
  };
}
