import { clearSite, countSite, countsText, reportLines } from "../storage/clear";
import type { Site } from "../storage/site";
import { el } from "./dom";
import { type ControlOption, confirmLine, controls, filterField, noteLine, segments, stack, toolbar } from "./kit";
import type { PaneView } from "./pane";
import { copyText } from "./copytext";
import { STORAGE_VIEW } from "./storageaction";
import { cookieSection } from "./storagecookies";
import { cacheSection, databaseSection } from "./storagedeep";
import { counted, type Section, type Shell, type StorageDeps } from "./storageparts";
import { presetSection, savePreset } from "./storagepresets";
import { webSection } from "./storageweb";

/**
 * The storage view: what page script can read of the page's storage, one
 * kind at a time. It reads through the page's own apis and patches none of
 * them. The two web storages and the cookies are kept live by a slow tick
 * that runs only while their segment is in sight, as a page's own writes in
 * this tab say nothing. Nothing leaves the view but by a copy control.
 */

export type StorageKind = "local" | "session" | "cookies" | "indexeddb" | "cache" | "presets";

/** The kinds, in the order the segments stand, each with what its segment says. */
export const STORAGE_KINDS: readonly { value: StorageKind; label: string }[] = [
  { value: "local", label: "local" },
  { value: "session", label: "session" },
  { value: "cookies", label: "cookies" },
  { value: "indexeddb", label: "idb" },
  { value: "cache", label: "cache" },
  { value: "presets", label: "presets" },
];

/** How often a live segment reads again, in ms. */
export const POLL_MS = 1000;

/** The kind the view last showed, which it opens on again. */
let last: StorageKind = "local";

function kindOf(value: string): StorageKind {
  return STORAGE_KINDS.find((kind) => kind.value === value)?.value ?? "local";
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
  };
}

/** The view while it is mounted, as its head's actions reach it. */
interface Mounted {
  refresh(): void;
  clearKind(): void;
  clearAll(): void;
  escape(): boolean;
}

/** The storage view, as the panel shows it. `options` stand in for the page in a test. */
export function storageView(options: Partial<StorageDeps> = {}): PaneView {
  const deps: StorageDeps = { ...defaults(), ...options };
  const site: Site = deps.site;
  let mounted: Mounted | null = null;

  function mount(body: HTMLElement): () => void {
    let kind = last;
    /** Whether devknobs' own items show, and go with a clear. */
    let own = false;
    const sections = new Map<StorageKind, Section>();
    /** What escape takes back, the last opened first. */
    const holds: (() => void)[] = [];
    let stopPoll: (() => void) | null = null;
    /** Closes what is in the place a question is asked in, while something is. */
    let closeAsked: (() => void) | null = null;

    const kinds = segments({
      options: STORAGE_KINDS,
      label: "kind of storage",
      value: kind,
      onChange: (value) => show(kindOf(value)),
    });
    const filter = filterField({
      placeholder: "filter",
      label: "filter storage",
      onInput: () => current().filter(),
    });
    const line = el("div", "ask");
    const asking = el("div", "ask");
    const status = el("div", "ask");
    const place = el("div", "st-list");
    body.append(toolbar([kinds.node, filter.node]), stack([line, asking, status]), place);

    const shell: Shell = {
      site,
      now: deps.now,
      copy(text, what) {
        void deps.copy(text).then(
          (went) => shell.say(went ? `copied ${what}` : `could not copy ${what}`),
          () => shell.say(`could not copy ${what}`),
        );
      },
      own: () => own,
      say(lines, control) {
        const said = typeof lines === "string" ? [lines] : lines;
        status.replaceChildren(
          ...said.map(noteLine),
          ...(control ? [controls([control]).node] : []),
        );
      },
      ask(text, confirm, run) {
        shell.put((close) => {
          const asked = confirmLine({
            text,
            confirm,
            onConfirm() {
              close();
              run();
            },
            onCancel: close,
          });
          return { node: asked.node, focus: asked.buttons[0] };
        });
      },
      put(build) {
        closeAsked?.();
        const close = (): void => {
          release();
          asking.replaceChildren();
          if (closeAsked === close) closeAsked = null;
        };
        const release = shell.hold(close);
        closeAsked = close;
        const built = build(close);
        asking.replaceChildren(built.node);
        built.focus?.focus({ preventScroll: true });
      },
      hold(cancel) {
        holds.push(cancel);
        return () => {
          const at = holds.indexOf(cancel);
          if (at >= 0) holds.splice(at, 1);
        };
      },
      query: () => filter.node.value,
      counted() {
        const section = current();
        const count = section.count();
        filter.node.placeholder =
          count === null ? `filter ${section.noun[1]}` : `filter ${counted(count, section.noun)}`;
      },
      touched() {
        for (const section of sections.values()) void section.refresh();
      },
    };

    function current(): Section {
      const made = sections.get(kind);
      if (made) return made;
      const section =
        kind === "local" || kind === "session"
          ? webSection(shell, kind)
          : kind === "cookies"
            ? cookieSection(shell)
            : kind === "indexeddb"
              ? databaseSection(shell)
              : kind === "cache"
                ? cacheSection(shell)
                : presetSection(shell);
      sections.set(kind, section);
      return section;
    }

    /** The controls over the rows: the section's own, then the view's for this kind. */
    function drawLine(): void {
      const items: ControlOption[] = [...(current().controls?.() ?? [])];
      const web = kind === "local" || kind === "session";
      if (web || kind === "cookies" || kind === "presets") {
        items.push({
          label: "save as preset",
          // In the presets' own segment the filter is over their names, so all is kept.
          run: () => void savePreset(shell, kind === "presets" ? "" : shell.query()),
        });
      }
      if (web) {
        items.push({
          label: own ? "hide devknobs' own" : "show devknobs' own",
          run() {
            own = !own;
            drawLine();
            current().filter();
          },
        });
      }
      line.replaceChildren(...(items.length > 0 ? [controls(items).node] : []));
    }

    /** The tick runs only while a live segment shows, and reads only while the view is in sight. */
    function poll(): void {
      stopPoll?.();
      stopPoll = current().live
        ? deps.every(POLL_MS, () => {
            if (deps.visible()) void current().refresh();
          })
        : null;
    }

    function show(next: StorageKind): void {
      for (const cancel of [...holds].reverse()) cancel();
      kind = next;
      last = next;
      kinds.set(next);
      status.replaceChildren();
      const section = current();
      place.replaceChildren(section.node);
      drawLine();
      section.filter();
      shell.counted();
      void section.refresh();
      poll();
    }

    const stopStorage = deps.onStorage(() => {
      if (kind === "local" || kind === "session" || kind === "presets") void current().refresh();
    });

    mounted = {
      refresh: () => void current().refresh(),
      clearKind() {
        const section = current();
        if (section.clear) section.clear();
        else if (kind === "presets") shell.say("presets are deleted one at a time, from their rows");
        else shell.say(`${kind === "cache" ? "Cache Storage" : "IndexedDB"} is cleared with clear site data`);
      },
      clearAll() {
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
      },
      escape() {
        const cancel = holds.pop();
        if (cancel) {
          cancel();
          return true;
        }
        return filter.clear();
      },
    };

    show(kind);

    return () => {
      mounted = null;
      stopPoll?.();
      stopStorage();
      for (const section of sections.values()) section.destroy?.();
    };
  }

  return {
    id: STORAGE_VIEW,
    title: "storage",
    layout: "flush",
    mount,
    actions: [
      { label: "refresh", icon: "refresh-cw", run: () => mounted?.refresh() },
      { label: "clear what shows", icon: "eraser", run: () => mounted?.clearKind() },
      { label: "clear site data", icon: "trash-2", run: () => mounted?.clearAll() },
    ],
    escape: () => mounted?.escape() ?? false,
  };
}
