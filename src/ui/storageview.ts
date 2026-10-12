import { listCaches } from "../storage/cache";
import { clearSite, countSite, countsText, reportLines } from "../storage/clear";
import { readCookies } from "../storage/cookies";
import { sizeLabel } from "../storage/format";
import { listDatabases } from "../storage/idb";
import { canKeep, loadPresets } from "../storage/presets";
import type { Site } from "../storage/site";
import { filterItems, readWeb } from "../storage/web";
import { copyText } from "./copytext";
import { button, el } from "./dom";
import { icon, type IconName } from "./icons";
import {
  type ControlOption,
  confirmLine,
  controls,
  filterField,
  noteButton,
  noteLine,
  rowBox,
  stack,
  toolbar,
} from "./kit";
import { openPane, type PaneAction, type PaneView } from "./pane";
import { STORAGE_VIEW } from "./storageaction";
import { cookieSection } from "./storagecookies";
import { cacheSection, databaseSection } from "./storagedeep";
import { counted, rowKeys, type Section, type Shell, type StorageDeps } from "./storageparts";
import { FRESH_PRESETS, onLoadLine, presetSection, savePreset } from "./storagepresets";
import { webSection } from "./storageweb";

/**
 * The storage view: what page script can read of the page's storage, on two
 * levels. The first lists the stores, a row each with what it holds, and a
 * row opens its store on a page of its own, whose way back is the list. It
 * reads through the page's own apis and patches none of them. The two web
 * storages and the cookies are kept live by a slow tick that runs only while
 * they are in sight, as a page's own writes in this tab say nothing. Nothing
 * leaves the view but by a copy control.
 */

export type StorageKind = "local" | "session" | "cookies" | "indexeddb" | "cache" | "presets";

/** The stores, in the order their rows stand, each with its full name and its icon. */
export const STORAGE_KINDS: readonly { value: StorageKind; label: string; icon: IconName }[] = [
  { value: "local", label: "local storage", icon: "database" },
  { value: "session", label: "session storage", icon: "clock" },
  { value: "cookies", label: "cookies", icon: "file" },
  { value: "indexeddb", label: "IndexedDB", icon: "braces" },
  { value: "cache", label: "cache storage", icon: "copy" },
  { value: "presets", label: "presets", icon: "pin" },
];

/** How often what is live reads again, in ms. */
export const POLL_MS = 1000;

/** What a store's row says where the store cannot be read. Why is in its tooltip. */
export const NOT_READ = "cannot read";

/** The store the view last showed, which it opens on again, or null for the list of them. */
let last: StorageKind | null = null;

/** The id a store's page has among the panel's views. */
export function storeViewId(kind: StorageKind): string {
  return `${STORAGE_VIEW}:${kind}`;
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
  /** Give the focus to a store's row, on the level that has them. */
  focus?(kind: StorageKind): void;
}

/** What a store's row says of it. */
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
 * The storage view, as the panel shows it: the list of the stores, or the
 * page of the store it last showed, whose way back is the list. `options`
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
    // A row a store, an icon and a name as a knob row has: on the knob rows' columns.
    layout: "rows",
    actions,
    mount(body: HTMLElement): () => void {
      last = null;
      const said = talk();
      const list = el("div", "st-list");
      const foot = el("div", "st-list");
      const rows = new Map<StorageKind, { main: HTMLButtonElement; value: HTMLElement }>();
      for (const kind of STORAGE_KINDS) {
        const main = button("main", "");
        const value = el("span", "row-value idle", "");
        main.addEventListener("click", () => deps.open(storeView(kind.value)));
        list.append(rowBox({ main, glyph: icon(kind.icon), title: kind.label, ends: [value] }).box);
        rows.set(kind.value, { main, value });
      }
      rowKeys(list, () => [...rows.values()]);
      body.append(said.node, list, foot);

      let gone = false;
      /** Count the reads, so one that comes back late says nothing over a newer one. */
      let live = 0;
      let deep = 0;

      function tell(kind: StorageKind, summary: Summary): void {
        const value = rows.get(kind)?.value;
        if (!value) return;
        value.textContent = summary.text;
        value.title = summary.why ?? "";
        value.classList.toggle("idle", summary.idle);
      }

      /** The stores a tick keeps live: the two web storages, the presets and the cookies. */
      async function readLive(): Promise<void> {
        const mine = ++live;
        for (const kind of ["local", "session"] as const) {
          const read = readWeb(site, kind);
          const items = filterItems(read.items, "", false);
          tell(kind, read.error === null ? holds(items.length, ["item", "items"], weight(items)) : unread(read.error));
        }
        const presets = canKeep() ? loadPresets() : null;
        tell(
          "presets",
          presets === null ? unread(FRESH_PRESETS) : holds(presets.length, ["preset", "presets"]),
        );
        const line = presets === null ? FRESH_PRESETS : onLoadLine(presets);
        if (foot.children[0]?.textContent !== line) foot.replaceChildren(noteLine(line));
        const cookies = await readCookies(site);
        if (gone || mine !== live) return;
        tell(
          "cookies",
          cookies.error === null
            ? holds(cookies.cookies.length, ["cookie", "cookies"], weight(cookies.cookies))
            : unread(cookies.error),
        );
      }

      /** The stores read only as the list opens and on refresh: the databases and the caches. */
      async function readDeep(): Promise<void> {
        const mine = ++deep;
        const [databases, caches] = await Promise.all([listDatabases(site), listCaches(site)]);
        if (gone || mine !== deep) return;
        tell(
          "indexeddb",
          databases.error === null
            ? holds(databases.databases.length, ["database", "databases"])
            : unread(databases.error),
        );
        tell(
          "cache",
          caches.error === null ? holds(caches.names.length, ["cache", "caches"]) : unread(caches.error),
        );
      }

      function refresh(): void {
        void readLive();
        void readDeep();
      }

      const shell: Shell = {
        ...said.shell,
        // The list shows none of devknobs' own, so a clear from it keeps them.
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
        focus: (kind) => rows.get(kind)?.main.focus({ preventScroll: true }),
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

  function sectionOf(kind: StorageKind, shell: Shell): Section {
    if (kind === "local" || kind === "session") return webSection(shell, kind);
    if (kind === "cookies") return cookieSection(shell);
    if (kind === "indexeddb") return databaseSection(shell);
    if (kind === "cache") return cacheSection(shell);
    return presetSection(shell);
  }

  /** The page of one store: its filter, its own controls, and its rows. */
  function storeView(kind: StorageKind): PaneView {
    const title = STORAGE_KINDS.find((entry) => entry.value === kind)?.label ?? kind;

    function mount(body: HTMLElement): () => void {
      last = kind;
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
      const section = sectionOf(kind, shell);

      /** The store's own controls, under the filter: what adds to it, what empties it, what keeps it. */
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
        // Escape takes back what is open, then empties the filter, and then goes back to the stores.
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
      id: storeViewId(kind),
      title,
      layout: "flush",
      actions,
      mount,
      escape: () => mounted?.escape() ?? false,
      // The head's way back and Escape go to the stores, and to the row the page was opened from.
      back(): void {
        deps.open(home);
        mounted?.focus?.(kind);
      },
    };
  }

  return last === null ? home : storeView(last);
}
