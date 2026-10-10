import { isJson, looksJson, preview, sizeLabel } from "../storage/format";
import type { WebKind } from "../storage/site";
import {
  clearWeb,
  copyName,
  filterItems,
  parseEntries,
  readWeb,
  removeWeb,
  sameItems,
  type WebItem,
  writeWeb,
} from "../storage/web";
import { el } from "./dom";
import { controls, emptyLine, type Fold, noteLine, sectionFold, stack } from "./kit";
import {
  askIn,
  counted,
  editBox,
  pager,
  ROW_CHUNK,
  rowKeys,
  type Section,
  type Shell,
  sync,
  valueBlock,
} from "./storageparts";

/**
 * `localStorage` or `sessionStorage` in the storage view: a row a key, which
 * folds out to the whole value and its controls. The list reads again on the
 * view's tick and draws only the rows that changed.
 */

/** What says a value went in as text though it was meant as json. */
export const NOT_JSON = "saved as text, not valid JSON";

/** A row as drawn: the item it shows, and its fold. */
interface RowView {
  item: WebItem;
  fold: Fold;
  remove(): void;
}

export function webSection(shell: Shell, kind: WebKind): Section {
  const { site } = shell;
  const node = el("div", "st-list");
  const adding = el("div", "st-list");
  const list = el("div", "st-list");
  const foot = el("div", "st-list");
  node.append(adding, list, foot);

  let items: WebItem[] = [];
  let error: string | null = null;
  /** Null until the storage was read once. */
  let read = false;
  let limit = ROW_CHUNK;
  /** The keys whose rows are folded out, kept while the list reads again. */
  const open = new Set<string>();
  let views = new Map<string, RowView>();
  /** How many boxes are open for typing. The list holds still while any is. */
  let editing = 0;

  function draw(): void {
    const matching = filterItems(items, shell.query(), shell.own());
    const next = new Map<string, RowView>();
    const nodes = matching.slice(0, limit).map((item) => {
      const kept = views.get(item.key);
      const view = kept && kept.item === item ? kept : build(item);
      next.set(item.key, view);
      return view.fold.node;
    });
    views = next;
    sync(list, nodes);
    if (error !== null) foot.replaceChildren(noteLine(error));
    else if (matching.length === 0) {
      const none = shell.query().trim() === "" ? `nothing in ${kind}Storage` : "nothing matches";
      foot.replaceChildren(emptyLine(none));
    } else {
      foot.replaceChildren(
        ...pager(nodes.length, matching.length, ROW_CHUNK, () => {
          limit += ROW_CHUNK;
          draw();
        }),
      );
    }
    shell.counted();
  }

  function refresh(): void {
    // A box being typed in is not drawn over. It reads again once it closes.
    if (editing > 0) return;
    const now = readWeb(site, kind, items);
    if (read && now.error === error && sameItems(now.items, items)) return;
    read = true;
    items = now.items;
    error = now.error;
    draw();
  }

  /** A box for typing closed: the list may draw again, and reads what changed meanwhile. */
  function closed(saved: boolean): void {
    editing--;
    if (saved) shell.touched();
    else refresh();
  }

  function build(item: WebItem): RowView {
    const { key } = item;
    const fold = sectionFold({
      label: key,
      open: open.has(key),
      ends: [el("span", "st-preview", preview(item.value)), el("span", "st-size", sizeLabel(item.size))],
      onToggle(out) {
        if (out) {
          open.add(key);
          fill();
        } else {
          open.delete(key);
          closeEdit?.();
        }
      },
    });
    fold.label.className = `${fold.label.className} st-key${item.own ? " own" : ""}`;

    /** Closes the row's text box, while it is open: a row folded away keeps none. */
    let closeEdit: (() => void) | null = null;

    function fill(): void {
      fold.body.replaceChildren(
        stack([
          valueBlock(shell, item.value, key),
          controls([
            { label: "copy value", run: () => shell.copy(item.value, key) },
            { label: "edit", run: () => guard("edit", edit) },
            { label: "duplicate", run: duplicate },
            { label: "delete", run: () => guard("delete", drop) },
          ]).node,
        ]),
      );
    }

    /** One of devknobs' own asks once before it is changed. */
    function guard(doing: string, run: () => void): void {
      if (!item.own) run();
      else askIn(shell, fold.body, `${key} is devknobs' own. ${doing} it anyway?`, doing, run, fill);
    }

    function edit(): void {
      editing++;
      const box = editBox(shell, {
        label: `value of ${key}`,
        value: item.value,
        save(text) {
          const failed = writeWeb(site, kind, key, text);
          if (failed !== null) return failed;
          const meant = looksJson(text) || (looksJson(item.value) && isJson(item.value));
          if (meant && !isJson(text)) shell.say(NOT_JSON);
          return null;
        },
        close(saved) {
          closeEdit = null;
          fill();
          closed(saved);
        },
      });
      closeEdit = box.cancel;
      fold.body.replaceChildren(box.node);
      box.area.focus({ preventScroll: true });
    }

    function duplicate(): void {
      const name = copyName(key, new Set(items.map((entry) => entry.key)));
      const failed = writeWeb(site, kind, name, item.value);
      if (failed !== null) shell.say(failed);
      else shell.touched();
    }

    function drop(): void {
      const failed = removeWeb(site, kind, key);
      if (failed !== null) {
        shell.say(failed);
        fill();
        return;
      }
      open.delete(key);
      shell.touched();
    }

    function remove(): void {
      open.add(key);
      fold.set(true);
      askIn(shell, fold.body, `delete ${key}?`, "delete", drop, fill);
    }

    if (open.has(key)) fill();
    return { item, fold, remove };
  }

  rowKeys(list, () => [...views.values()].map((view) => ({ main: view.fold.main, remove: view.remove })));

  /** The box to add in, while it is open. */
  let addBox: HTMLTextAreaElement | null = null;

  function add(): void {
    if (addBox) {
      addBox.focus({ preventScroll: true });
      return;
    }
    editing++;
    const box = editBox(shell, {
      label: `add to ${kind}Storage`,
      placeholder: "key=value, a line each, or a json object of keys",
      action: "add",
      save(text) {
        const entries = parseEntries(text);
        if (!entries) return "write key=value, a line each, or a json object of keys";
        for (const entry of entries) {
          const failed = writeWeb(site, kind, entry.name, entry.value);
          if (failed !== null) return failed;
        }
        return null;
      },
      close(saved) {
        addBox = null;
        adding.replaceChildren();
        closed(saved);
      },
    });
    addBox = box.area;
    adding.replaceChildren(box.node);
    box.area.focus({ preventScroll: true });
  }

  return {
    node,
    live: true,
    noun: ["item", "items"],
    refresh,
    filter() {
      limit = ROW_CHUNK;
      if (read) draw();
    },
    count: () => (read ? filterItems(items, "", shell.own()).length : null),
    controls: () => [{ label: "add", run: add }],
    clear() {
      const count = filterItems(items, "", shell.own()).length;
      if (count === 0) {
        shell.say(`nothing to clear in ${kind}Storage`);
        return;
      }
      shell.ask(`clear ${counted(count, ["item", "items"])}?`, "clear", () => {
        const cleared = clearWeb(site, kind, shell.own());
        if (cleared.error !== null) shell.say(cleared.error);
        shell.touched();
      });
    },
  };
}
