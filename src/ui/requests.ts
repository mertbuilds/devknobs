import { copyText as copyToClipboard } from "../grab/copy";
import { type RequestEntry, type RequestStore, requestLog } from "../requests";
import { button, el, field, mark } from "./dom";
import { closePane, openPane, type PaneView, paneView } from "./pane";
import { createDetail, type Detail } from "./requestdetail";
import {
  atBottom,
  type Chip,
  CHIPS,
  copyText,
  durationLabel,
  LIGHT_WHY,
  matches,
  methodLabel,
  middle,
  QUERY_MAX,
  statusHot,
  statusLabel,
  urlName,
} from "./requestformat";

/**
 * The requests view: the page's log in the side pane, a row a request, the
 * newest last, and one request in full in its place when a row is picked.
 *
 * A row is built once and then changed in place: the log hands over the rows
 * that are new or changed, and swaps a changed row for a new object, so one
 * that is the same object needs nothing. The view only shows the log. It
 * records nothing itself, and listens only while it is on the page.
 */

/** The pane view that lists the requests, and the one that shows one of them. */
export const REQUESTS_VIEW = "requests";
export const REQUEST_VIEW = "request";

/** What the list says while it has no rows, and while its filter leaves none. */
export const NO_REQUESTS = "no requests yet";
export const NO_MATCH = "no request matches";

/** The side pane, as far as the view drives it. */
export interface PaneHost {
  open(view: PaneView): void;
  close(): void;
  view(): string | null;
}

/** What the view is made of. The panel gives the live region, the tests the rest. */
export interface RequestsContext {
  /** The live region that hears how a copy went. */
  said?: HTMLElement;
  /** The page's log, or null while nothing records. */
  log?(): RequestStore | null;
  pane?: PaneHost;
  copy?(text: string): Promise<boolean>;
}

export interface Requests {
  /** Show the requests in the pane, or close the pane where they show. */
  toggle(): void;
}

/** A request's row, and the parts of it that change. */
interface Row {
  entry: RequestEntry;
  node: HTMLButtonElement;
  method: HTMLElement;
  path: HTMLElement;
  query: HTMLElement;
  status: HTMLElement;
  time: HTMLElement;
}

/** Set a node's text, unless it says so already. */
function put(node: HTMLElement, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}

export function createRequests(context: RequestsContext = {}): Requests {
  const log = context.log ?? requestLog;
  const pane = context.pane ?? { open: openPane, close: closePane, view: paneView };
  const copy = context.copy ?? copyToClipboard;

  // The list is kept between showings, so a way back from a request finds it as it was.
  const bar = el("div", "req-bar");
  const filter = field("req-filter", "filter", "filter requests");
  const chips = el("div", "req-chips");
  chips.setAttribute("role", "group");
  chips.setAttribute("aria-label", "requests shown");
  const total = el("span", "req-count");
  const list = el("div", "req-list");
  list.setAttribute("role", "group");
  list.setAttribute("aria-label", "requests");
  const empty = el("div", "empty", NO_REQUESTS);
  bar.append(filter, chips, total);

  const rows = new Map<string, Row>();
  const rowOf = new WeakMap<EventTarget, Row>();
  /** The rows as the list holds them, oldest first, as the log has them. */
  let order: Row[] = [];
  let chip: Chip = "all";
  /** The list follows its end while it is scrolled there. */
  let stuck = true;
  let scrollTop = 0;
  let filtering = false;
  /** The one row the tab key stops at. */
  let tabbed: Row | null = null;
  /** The pane's body while the list is in it, and the log it listens to. */
  let scroller: HTMLElement | null = null;
  let store: RequestStore | null = null;
  /** The row a request was opened from, which gets the focus back. */
  let opened: string | null = null;
  /** The first copy says what it leaves out. */
  let told = false;

  const chipNodes = CHIPS.map((each) => {
    const node = button("chip", each.label);
    node.addEventListener("click", () => {
      chip = each.id;
      drawChips();
      refilter();
    });
    chips.append(node);
    return node;
  });

  function drawChips(): void {
    CHIPS.forEach((each, index) => {
      const node = chipNodes[index];
      if (node) mark(node, each.id === chip);
    });
  }

  function shows(row: Row): boolean {
    return !row.node.hidden;
  }

  function setTab(row: Row | null): void {
    if (tabbed === row) return;
    if (tabbed) tabbed.node.tabIndex = -1;
    tabbed = row;
    if (row) row.node.tabIndex = 0;
  }

  /** Show what a row's request reads now. */
  function draw(row: Row, entry: RequestEntry): void {
    row.entry = entry;
    const { name, query } = urlName(entry.url);
    const light = entry.detail === "light";
    put(row.method, methodLabel(entry));
    put(row.path, name);
    put(row.query, middle(query, QUERY_MAX));
    put(row.status, statusLabel(entry));
    row.status.classList.toggle("hot", statusHot(entry));
    put(row.time, durationLabel(entry.timing.duration));
    row.node.classList.toggle("light", light);
    row.node.classList.toggle("framed", entry.source === "frame");
    const title = light ? `${entry.url}\n${LIGHT_WHY}` : entry.url;
    if (row.node.title !== title) row.node.title = title;
    row.node.hidden = !matches(entry, filter.value, chip);
  }

  function build(entry: RequestEntry): Row {
    const node = button("req-row", "");
    node.tabIndex = -1;
    const method = el("span", "req-method");
    const name = el("span", "req-name");
    const path = el("span", "req-path");
    const query = el("span", "req-query");
    name.append(path, query);
    const status = el("span", "req-status");
    const time = el("span", "req-time");
    node.append(method, name, status, time);
    const row: Row = { entry, node, method, path, query, status, time };
    rowOf.set(node, row);
    node.addEventListener("click", () => openRequest(row));
    node.addEventListener("focus", () => setTab(row));
    draw(row, entry);
    return row;
  }

  /** What the bar and the empty line say, and which row the tab key stops at. */
  function tally(): void {
    const shown = order.filter(shows);
    put(total, shown.length === order.length ? String(order.length) : `${shown.length} of ${order.length}`);
    put(empty, order.length === 0 ? NO_REQUESTS : NO_MATCH);
    empty.hidden = shown.length > 0;
    list.hidden = shown.length === 0;
    if (!tabbed || !rows.has(tabbed.entry.id) || !shows(tabbed)) setTab(shown[shown.length - 1] ?? null);
  }

  /**
   * Bring the list in line with the log: rows the log let go leave, and new
   * ones go in where the log has them. A row already there never moves, as
   * the log keeps its rows in the order they started.
   */
  function reconcile(entries: readonly RequestEntry[]): void {
    const live = new Set<string>();
    for (const entry of entries) live.add(entry.id);
    const kept = order.filter((row) => {
      if (live.has(row.entry.id)) return true;
      rows.delete(row.entry.id);
      row.node.remove();
      return false;
    });
    let at = 0;
    let frames = 0;
    order = entries.map((entry) => {
      let row = rows.get(entry.id);
      if (row && kept[at] === row) at++;
      else if (!row) {
        row = build(entry);
        rows.set(entry.id, row);
        list.insertBefore(row.node, kept[at]?.node ?? null);
      }
      if (row.entry !== entry) draw(row, entry);
      if (entry.source === "frame") frames++;
      return row;
    });
    // The frame's rows are told apart only next to the page's own.
    list.classList.toggle("mixed", frames > 0 && frames < order.length);
  }

  /** Keep to the end of the list, where it was there before the rows changed. */
  function follow(): void {
    if (stuck && scroller) scroller.scrollTop = scroller.scrollHeight;
  }

  /**
   * The log's news: the rows that are new or changed, none of them after a
   * clear. A row that is known is changed in place, and only a new row, or
   * none at all, has the list gone through against the log.
   */
  function onChange(changed: readonly RequestEntry[]): void {
    let fresh = changed.length === 0;
    for (const entry of changed) {
      const row = rows.get(entry.id);
      if (!row) fresh = true;
      else if (row.entry !== entry) draw(row, entry);
    }
    if (fresh) reconcile(store?.entries() ?? []);
    tally();
    follow();
  }

  function refilter(): void {
    for (const row of order) row.node.hidden = !matches(row.entry, filter.value, chip);
    tally();
    follow();
  }

  function onScroll(): void {
    if (!scroller) return;
    stuck = atBottom(scroller.scrollTop, scroller.clientHeight, scroller.scrollHeight);
  }

  /** The arrows, Home and End move the focus through the rows that show. */
  function onKeydown(event: KeyboardEvent): void {
    const from = event.target ? rowOf.get(event.target) : undefined;
    if (!from) return;
    const shown = order.filter(shows);
    const at = shown.indexOf(from);
    let to = -1;
    if (event.key === "ArrowDown") to = Math.min(at + 1, shown.length - 1);
    else if (event.key === "ArrowUp") to = Math.max(at - 1, 0);
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = shown.length - 1;
    else return;
    event.preventDefault();
    shown[to]?.node.focus();
  }

  filter.addEventListener("input", refilter);
  filter.addEventListener("focus", () => {
    filtering = true;
  });
  filter.addEventListener("blur", () => {
    filtering = false;
  });
  list.addEventListener("keydown", onKeydown);
  drawChips();

  const listView: PaneView = {
    id: REQUESTS_VIEW,
    title: "requests",
    actions: [
      {
        label: "clear",
        icon: "ban",
        run(): void {
          store?.clear();
          store?.flush();
        },
      },
    ],
    mount(body: HTMLElement): () => void {
      scroller = body;
      store = log();
      body.append(bar, list, empty);
      reconcile(store?.entries() ?? []);
      tally();
      body.scrollTop = stuck ? body.scrollHeight : scrollTop;
      body.addEventListener("scroll", onScroll);
      const stop = store?.subscribe(onChange);
      return () => {
        stop?.();
        body.removeEventListener("scroll", onScroll);
        scrollTop = body.scrollTop;
        filtering = false;
        scroller = null;
        store = null;
      };
    },
    // Escape empties a filter that has the focus first, and then closes the pane.
    escape(): boolean {
      if (!filtering || filter.value === "") return false;
      filter.value = "";
      refilter();
      return true;
    },
  };

  /** Back from a request to the list, and to the row it was opened from. */
  function back(): void {
    pane.open(listView);
    const row = opened === null ? undefined : rows.get(opened);
    opened = null;
    if (row && shows(row)) row.node.focus({ preventScroll: true });
  }

  function openRequest(row: Row): void {
    const id = row.entry.id;
    let entry = row.entry;
    let detail: Detail | null = null;
    opened = id;
    pane.open({
      id: REQUEST_VIEW,
      title: "request",
      actions: [
        {
          label: "copy as text for AI",
          icon: "copy",
          run(): void {
            void copy(copyText(entry)).then((copied) => {
              const word = copied ? "copied" : "copy failed";
              detail?.say(word, !copied, copied && !told);
              if (copied) told = true;
              if (context.said) context.said.textContent = word;
            });
          },
        },
      ],
      mount(body: HTMLElement): () => void {
        const view = createDetail(entry, back);
        detail = view;
        body.append(view.node);
        const from = log();
        const stop = from?.subscribe((changed) => {
          const next = changed.find((each) => each.id === id);
          if (!next || next === entry) return;
          entry = next;
          view.update(next);
        });
        return () => {
          stop?.();
          view.destroy();
          detail = null;
        };
      },
      escape(): boolean {
        back();
        return true;
      },
    });
  }

  return {
    toggle(): void {
      const shown = pane.view();
      if (shown === REQUESTS_VIEW || shown === REQUEST_VIEW) pane.close();
      else pane.open(listView);
    },
  };
}
