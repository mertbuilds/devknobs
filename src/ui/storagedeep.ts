import { CACHE_PAGE, listCaches, readCache } from "../storage/cache";
import { describe, preview, sizeLabel } from "../storage/format";
import { RECORD_PAGE, readDatabase, readRecords, type StoreInfo } from "../storage/idb";
import { el } from "./dom";
import {
  codeBlock,
  controls,
  emptyLine,
  entryFold,
  entryHead,
  type Fold,
  noteLine,
  pairs,
  stack,
} from "./kit";
import type { Section, Shell } from "./storageparts";

/**
 * One object store of IndexedDB, and one cache of Cache Storage, in the
 * storage view: a table each, its lines numbered from 0, read a page at a
 * time. Both are read when their node folds out and when refresh is pressed,
 * never on a tick, and what is read is read only. No database is held open,
 * see idb.ts.
 */

/** What says a database the page holds open will go later. */
export function blockedLine(name: string): string {
  return `${name} is held open by the page: it goes once the page lets go, or on reload`;
}

/** What an object store's page says on top. */
export const RECORDS_NOTE = "read only: records cannot be changed";

/** What a cache's page says on top. */
export const CACHE_NOTE = "read only";

/** A line of a table as the filter sees it: its node, and the text it is found by. */
interface Line {
  node: HTMLElement;
  text: string;
}

/** Show the lines the filter keeps, and say how many those are. */
function keep(lines: readonly Line[], query: string): number {
  const text = query.trim().toLowerCase();
  let kept = 0;
  for (const line of lines) {
    const shows = text === "" || line.text.includes(text);
    line.node.hidden = !shows;
    if (shows) kept++;
  }
  return kept;
}

/** What follows a table read a page at a time: how much of it is read, and the control that reads on. */
function readOn(said: string, left: number, more: () => void): HTMLElement {
  return stack([noteLine(said), controls([{ label: `show ${left} more`, run: more }]).node]);
}

/** The records of one object store, a line each: its number, its key and its value. */
export function recordSection(shell: Shell, database: string, storeName: string): Section {
  const { site } = shell;
  const node = el("div", "st-list");
  const top = el("div", "st-list");
  const head = entryHead({ index: "#", name: "key", value: "value" });
  const list = el("div", "st-list");
  const foot = el("div", "st-list");
  node.append(top, head, list, foot);

  let info: StoreInfo | null = null;
  let lines: Line[] = [];
  let error: string | null = null;
  let read = false;
  /** Whether the last page came short, so the store has no more. */
  let ended = false;
  let asked = 0;

  function recordRow(at: number, key: unknown, value: unknown): Line {
    const title = describe(key, false, 200);
    const brief = preview(describe(value, false, 400));
    const fold: Fold = entryFold({
      index: String(at),
      name: title,
      value: brief,
      open: false,
      onToggle(out) {
        if (!out || fold.body.children.length > 0) return;
        const text = describe(value, true);
        fold.body.replaceChildren(
          stack([
            codeBlock({ text }).node,
            controls([{ label: "copy value", run: () => shell.copy(text, title) }]).node,
          ]),
        );
      },
    });
    return { node: fold.node, text: `${title}\n${brief}`.toLowerCase() };
  }

  function draw(): void {
    const kept = keep(lines, shell.query());
    head.hidden = kept === 0;
    if (error !== null) foot.replaceChildren(stack([noteLine(error)]));
    else if (lines.length === 0) foot.replaceChildren(emptyLine("no records"));
    else {
      const total = info?.count ?? null;
      const more = total === null ? !ended : lines.length < total;
      const left = total === null ? RECORD_PAGE : Math.min(RECORD_PAGE, total - lines.length);
      const said = total === null ? `${lines.length} read` : `${lines.length} of ${total}`;
      // The filter is over what is read, so the way to read on stays with it.
      foot.replaceChildren(
        ...(kept === 0 ? [emptyLine("nothing matches")] : []),
        ...(more && !ended ? [readOn(said, left, () => void next(asked))] : []),
      );
    }
    shell.counted();
  }

  /** Read the next page, for the read that asked: one that came back late adds nothing. */
  async function next(mine: number): Promise<void> {
    const page = await readRecords(site, database, storeName, lines.length);
    if (mine !== asked) return;
    const from = lines.length;
    const rows = page.records.map((record, at) => recordRow(from + at, record.key, record.value));
    list.append(...rows.map((row) => row.node));
    lines = [...lines, ...rows];
    error = page.error;
    ended = page.records.length < RECORD_PAGE;
    draw();
  }

  return {
    node,
    live: false,
    async refresh() {
      const mine = ++asked;
      const got = await readDatabase(site, database);
      if (mine !== asked) return;
      read = true;
      lines = [];
      ended = false;
      list.replaceChildren();
      info = got.stores.find((store) => store.name === storeName) ?? null;
      error = got.error ?? (info ? null : `${database} has no object store ${storeName}`);
      top.replaceChildren(
        stack([
          noteLine(RECORDS_NOTE),
          ...(info
            ? [
                pairs([
                  ["key path", info.keyPath === "" ? "none" : info.keyPath],
                  ["auto increment", info.autoIncrement ? "yes" : "no"],
                  ["indexes", info.indexes.length > 0 ? info.indexes.join(", ") : "none"],
                ]).node,
              ]
            : []),
        ]),
      );
      if (error !== null) draw();
      else await next(mine);
    },
    filter() {
      if (read) draw();
    },
    destroy() {
      asked++;
    },
  };
}

/** The requests of one cache, a line each: its number, its path and what its response's status is. */
export function cacheSection(shell: Shell, name: string): Section {
  const { site } = shell;
  const node = el("div", "st-list");
  const head = entryHead({ index: "#", name: "name", end: "status" });
  const list = el("div", "st-list");
  const foot = el("div", "st-list");
  node.append(stack([noteLine(CACHE_NOTE)]), head, list, foot);

  let lines: Line[] = [];
  let total = 0;
  let error: string | null = null;
  let read = false;
  let asked = 0;

  function draw(): void {
    const kept = keep(lines, shell.query());
    head.hidden = kept === 0;
    if (error !== null) foot.replaceChildren(stack([noteLine(error)]));
    else if (lines.length === 0) foot.replaceChildren(emptyLine("no requests"));
    else {
      const left = Math.min(CACHE_PAGE, total - lines.length);
      // The filter is over what is read, so the way to read on stays with it.
      foot.replaceChildren(
        ...(kept === 0 ? [emptyLine("nothing matches")] : []),
        ...(left > 0 ? [readOn(`${lines.length} of ${total}`, left, () => void next(asked))] : []),
      );
    }
    shell.counted();
  }

  async function next(mine: number): Promise<void> {
    const page = await readCache(site, name, lines.length);
    if (mine !== asked) return;
    read = true;
    error = page.error;
    if (page.error === null) {
      total = page.total;
      const from = lines.length;
      const rows = page.entries.map((entry, at): Line => {
        const origin = site.location.origin;
        const address = entry.url.startsWith(origin) ? entry.url.slice(origin.length) : entry.url;
        const status = entry.status === null ? "gone" : String(entry.status);
        const fold = entryFold({ index: String(from + at), name: address, end: status, open: false });
        // The whole address, where the line says the path alone.
        fold.label.title = entry.url;
        fold.body.append(
          stack([
            pairs([
              ["method", entry.method],
              ["url", entry.url],
              ["status", status],
              ["type", entry.type === "" ? "none" : entry.type],
              ["size", entry.size === null ? "not told" : sizeLabel(entry.size)],
            ]).node,
          ]),
        );
        return { node: fold.node, text: `${entry.method} ${entry.url} ${status}`.toLowerCase() };
      });
      list.append(...rows.map((row) => row.node));
      lines = [...lines, ...rows];
      // A page that came empty is the end, whatever the count said.
      if (page.entries.length === 0) total = lines.length;
    }
    draw();
  }

  return {
    node,
    live: false,
    async refresh() {
      const mine = ++asked;
      // Opening a cache makes one, so a cache that is gone is never opened.
      const listed = await listCaches(site);
      if (mine !== asked) return;
      lines = [];
      total = 0;
      list.replaceChildren();
      if (listed.error !== null || !listed.names.includes(name)) {
        read = true;
        error = listed.error ?? `there is no cache ${name}`;
        draw();
        return;
      }
      await next(mine);
    },
    filter() {
      if (read) draw();
    },
    destroy() {
      asked++;
    },
  };
}
