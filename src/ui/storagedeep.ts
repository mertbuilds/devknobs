import { CACHE_PAGE, listCaches, readCache } from "../storage/cache";
import { describe, preview, sizeLabel } from "../storage/format";
import {
  type DatabaseName,
  deleteDatabase,
  listDatabases,
  RECORD_PAGE,
  readDatabase,
  readRecords,
  type StoreInfo,
} from "../storage/idb";
import { el } from "./dom";
import {
  codeBlock,
  controls,
  emptyLine,
  type Fold,
  fieldList,
  noteLine,
  rowBox,
  sectionFold,
  stack,
} from "./kit";
import { askIn, counted, type Section, type Shell } from "./storageparts";

/**
 * IndexedDB and Cache Storage in the storage view. Both are read when their
 * segment shows and when refresh is pressed, never on a tick, and what is
 * read is read only: a whole database can be deleted, and nothing in one
 * changed. No database is held open, see idb.ts.
 */

/** What says a database the page holds open will go later. */
export function blockedLine(name: string): string {
  return `${name} is held open by the page: it goes once the page lets go, or on reload`;
}

/** The databases, each folding out to its stores, and a store to its records. */
export function databaseSection(shell: Shell): Section {
  const { site } = shell;
  const node = el("div", "st-list");
  let databases: DatabaseName[] = [];
  let error: string | null = null;
  let read = false;
  const open = new Set<string>();
  let asked = 0;

  function recordRow(key: unknown, value: unknown): HTMLElement {
    const title = describe(key, false, 200);
    const fold: Fold = sectionFold({
      label: title,
      open: false,
      ends: [el("span", "st-preview", preview(describe(value, false, 400)))],
      onToggle(out) {
        if (!out || fold.body.children.length > 0) return;
        const text = describe(value, true);
        fold.body.replaceChildren(
          stack([
            codeBlock(text),
            controls([{ label: "copy value", run: () => shell.copy(text, title) }]).node,
          ]),
        );
      },
    });
    fold.label.className = `${fold.label.className} st-key`;
    return fold.node;
  }

  function storeRow(database: string, store: StoreInfo): HTMLElement {
    const records = el("div", "st-list");
    const foot = el("div", "st-list");
    let loaded = 0;
    let started = false;

    async function more(): Promise<void> {
      const page = await readRecords(site, database, store.name, loaded);
      for (const record of page.records) records.append(recordRow(record.key, record.value));
      loaded += page.records.length;
      if (page.error !== null) {
        foot.replaceChildren(noteLine(page.error));
        return;
      }
      const total = store.count ?? (page.records.length < RECORD_PAGE ? loaded : loaded + 1);
      if (loaded === 0) foot.replaceChildren(emptyLine("no records"));
      else if (loaded >= total || page.records.length === 0) foot.replaceChildren();
      else {
        const left = store.count === null ? RECORD_PAGE : Math.min(RECORD_PAGE, total - loaded);
        foot.replaceChildren(
          stack([
            noteLine(store.count === null ? `${loaded} read` : `${loaded} of ${total}`),
            controls([{ label: `show ${left} more`, run: () => void more() }]).node,
          ]),
        );
      }
    }

    const size = store.count === null ? "" : counted(store.count, ["record", "records"]);
    const fold = sectionFold({
      label: store.name,
      open: false,
      ends: [el("span", "st-size", size)],
      onToggle(out) {
        if (!out || started) return;
        started = true;
        void more();
      },
    });
    fold.body.append(
      stack([
        fieldList([
          ["key path", store.keyPath === "" ? "none" : store.keyPath],
          ["auto increment", store.autoIncrement ? "yes" : "no"],
          ["indexes", store.indexes.length > 0 ? store.indexes.join(", ") : "none"],
        ]),
        records,
        foot,
      ]),
    );
    return fold.node;
  }

  function databaseRow(database: DatabaseName): HTMLElement {
    const { name } = database;

    async function fill(): Promise<void> {
      fold.body.replaceChildren(stack([noteLine("reading")]));
      const got = await readDatabase(site, name);
      const remove = controls([{ label: "delete database", run: drop }]).node;
      if (got.error !== null) {
        fold.body.replaceChildren(stack([noteLine(got.error), remove]));
        return;
      }
      const stores =
        got.stores.length > 0
          ? got.stores.map((store) => storeRow(name, store))
          : [emptyLine("no object stores")];
      fold.body.replaceChildren(stack([...stores, remove]));
    }

    function drop(): void {
      askIn(
        shell,
        fold.body,
        `delete the database ${name}? the page may need a reload after`,
        "delete",
        () => {
          void deleteDatabase(site, name).then((result) => {
            if (result === "blocked") shell.say(blockedLine(name));
            else if (result === "failed") shell.say(`cannot delete ${name}`);
            open.delete(name);
            shell.touched();
          });
        },
        () => void fill(),
      );
    }

    const fold = sectionFold({
      label: name,
      open: open.has(name),
      ends: [el("span", "st-size", `version ${database.version}`)],
      onToggle(out) {
        if (out) {
          open.add(name);
          void fill();
        } else open.delete(name);
      },
    });
    fold.label.className = `${fold.label.className} st-key`;
    if (open.has(name)) void fill();
    return fold.node;
  }

  function draw(): void {
    const text = shell.query().trim().toLowerCase();
    const matching = databases.filter((database) => database.name.toLowerCase().includes(text));
    if (error !== null) node.replaceChildren(stack([noteLine(error)]));
    else if (matching.length === 0) {
      node.replaceChildren(emptyLine(text === "" ? "no databases" : "nothing matches"));
    } else {
      node.replaceChildren(
        stack([noteLine("read only: a whole database can be deleted, its records cannot be changed")]),
        ...matching.map(databaseRow),
      );
    }
    shell.counted();
  }

  return {
    node,
    live: false,
    noun: ["database", "databases"],
    async refresh() {
      const mine = ++asked;
      const listed = await listDatabases(site);
      if (mine !== asked) return;
      read = true;
      databases = listed.databases;
      error = listed.error;
      draw();
    },
    filter() {
      if (read) draw();
    },
    count: () => (read && error === null ? databases.length : null),
    destroy() {
      asked++;
    },
  };
}

/** The caches, each folding out to its requests and what their responses say. */
export function cacheSection(shell: Shell): Section {
  const { site } = shell;
  const node = el("div", "st-list");
  let names: string[] = [];
  let error: string | null = null;
  let read = false;
  const open = new Set<string>();
  let asked = 0;

  function cacheRow(name: string): HTMLElement {
    const entries = el("div", "st-list");
    const foot = el("div", "st-list");
    let loaded = 0;

    async function more(): Promise<void> {
      const page = await readCache(site, name, loaded);
      if (page.error !== null) {
        foot.replaceChildren(noteLine(page.error));
        return;
      }
      for (const entry of page.entries) {
        const said = [
          entry.status === null ? "gone" : String(entry.status),
          entry.type.split(";", 1)[0] ?? "",
          entry.size === null ? "" : sizeLabel(entry.size),
        ].filter((part) => part !== "");
        const address = entry.url.startsWith(site.location.origin)
          ? entry.url.slice(site.location.origin.length)
          : entry.url;
        const row = rowBox({
          main: el("div", "main"),
          title: `${entry.method} ${address}`,
          ends: [el("span", "st-size", said.join(" · "))],
        });
        row.label.className = `${row.label.className} st-key`;
        row.label.title = entry.url;
        entries.append(row.box);
      }
      loaded += page.entries.length;
      if (page.total === 0) foot.replaceChildren(emptyLine("no requests"));
      else if (loaded >= page.total || page.entries.length === 0) foot.replaceChildren();
      else {
        foot.replaceChildren(
          stack([
            noteLine(`${loaded} of ${page.total}`),
            controls([
              {
                label: `show ${Math.min(CACHE_PAGE, page.total - loaded)} more`,
                run: () => void more(),
              },
            ]).node,
          ]),
        );
      }
    }

    function start(): void {
      loaded = 0;
      entries.replaceChildren();
      void more();
    }

    const fold = sectionFold({
      label: name,
      open: open.has(name),
      onToggle(out) {
        if (out) {
          open.add(name);
          start();
        } else open.delete(name);
      },
    });
    fold.label.className = `${fold.label.className} st-key`;
    fold.body.append(stack([entries, foot]));
    if (open.has(name)) start();
    return fold.node;
  }

  function draw(): void {
    const text = shell.query().trim().toLowerCase();
    const matching = names.filter((name) => name.toLowerCase().includes(text));
    if (error !== null) node.replaceChildren(stack([noteLine(error)]));
    else if (matching.length === 0) {
      node.replaceChildren(emptyLine(text === "" ? "no caches" : "nothing matches"));
    } else {
      node.replaceChildren(stack([noteLine("read only")]), ...matching.map(cacheRow));
    }
    shell.counted();
  }

  return {
    node,
    live: false,
    noun: ["cache", "caches"],
    async refresh() {
      const mine = ++asked;
      const listed = await listCaches(site);
      if (mine !== asked) return;
      read = true;
      names = listed.names;
      error = listed.error;
      draw();
    },
    filter() {
      if (read) draw();
    },
    count: () => (read && error === null ? names.length : null),
    destroy() {
      asked++;
    },
  };
}
