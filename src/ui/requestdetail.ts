import { NativeDate } from "../engine/clock";
import type { BodyRecord, HeaderList, RequestEntry } from "../requests/types";
import { button, el, rowBox } from "./dom";
import { icon } from "./icons";
import {
  bodyNote,
  bodyText,
  clockTime,
  generalLines,
  hasText,
  LIGHT_WHY,
  LONG_BODY,
} from "./requestformat";

/**
 * One request in full, in place of the list: a way back, then what is known
 * of it in sections that fold as the panel's rows do. A section is filled
 * when it first opens, so a long body costs nothing until it is asked for,
 * and is drawn again only when what it shows has changed.
 */

/** How long the word a copy leaves stays, in ms. */
export const COPIED_SHOWS = 1800;

/** What the detail says once, the first time a request is copied. */
export const HIDES_NOTE =
  "the copied text has <hidden> in place of the values of authorization, cookie and other secret headers";

/** One part of the detail. */
interface Part {
  key: string;
  title: string;
  /** What the part shows. A new one means it is drawn again. */
  of(entry: RequestEntry): unknown;
  /** What its line says while it is folded, and open. */
  brief(entry: RequestEntry): string;
  /** Whether it starts open. */
  open(entry: RequestEntry): boolean;
  fill(entry: RequestEntry): HTMLElement[];
}

interface Section {
  part: Part;
  box: HTMLElement;
  head: HTMLButtonElement;
  brief: HTMLElement;
  fold: HTMLElement;
  inner: HTMLElement;
  /** What the inner shows now, or nothing yet. */
  shown: unknown;
  filled: boolean;
}

function pairs(lines: readonly (readonly [string, string])[], className: string): HTMLElement {
  const grid = el("div", `req-kv ${className}`);
  for (const [label, value] of lines) {
    grid.append(el("span", "req-k", label), el("span", "req-v", value));
  }
  return grid;
}

function headers(list: HeaderList): HTMLElement[] {
  return list.length === 0 ? [el("div", "note", "none")] : [pairs(list, "req-headers")];
}

function count(list: HeaderList): string {
  return list.length === 0 ? "none" : String(list.length);
}

function bodyBrief(record: BodyRecord | null): string {
  if (!record) return "none";
  return [record.type, bodyNote(record)].filter(Boolean).join(", ");
}

function body(record: BodyRecord | null, type: string): HTMLElement[] {
  if (!record) return [el("div", "note", "none")];
  const note = bodyNote(record);
  if (!hasText(record)) return [el("div", "note", note)];
  const text = el("pre", "req-pre", bodyText(record, type));
  return record.truncated ? [el("div", "note", note), text] : [text];
}

function short(record: BodyRecord | null): boolean {
  return !record || record.text.length <= LONG_BODY;
}

const GENERAL: Part = {
  key: "general",
  title: "general",
  of: (entry) => entry,
  brief: () => "",
  open: () => true,
  fill: (entry) => [
    pairs(generalLines(entry, clockTime(new NativeDate(entry.timing.start))), "req-general"),
  ],
};

const FULL: readonly Part[] = [
  GENERAL,
  {
    key: "request-headers",
    title: "request headers",
    of: (entry) => entry.requestHeaders,
    brief: (entry) => count(entry.requestHeaders),
    open: () => true,
    fill: (entry) => headers(entry.requestHeaders),
  },
  {
    key: "request-body",
    title: "request body",
    of: (entry) => entry.requestBody,
    brief: (entry) => bodyBrief(entry.requestBody),
    open: (entry) => short(entry.requestBody),
    fill: (entry) => body(entry.requestBody, ""),
  },
  {
    key: "response-headers",
    title: "response headers",
    of: (entry) => entry.responseHeaders,
    brief: (entry) => count(entry.responseHeaders),
    open: () => true,
    fill: (entry) => headers(entry.responseHeaders),
  },
  {
    key: "response-body",
    title: "response body",
    of: (entry) => entry.responseBody,
    brief: (entry) => bodyBrief(entry.responseBody),
    open: (entry) => short(entry.responseBody),
    fill: (entry) => body(entry.responseBody, entry.contentType),
  },
  {
    key: "initiator",
    title: "initiator",
    of: (entry) => entry.initiator,
    brief: (entry) => (entry.initiator ? "" : "none"),
    open: () => false,
    fill: (entry) => [
      entry.initiator ? el("pre", "req-pre", entry.initiator) : el("div", "note", "none"),
    ],
  },
];

export interface Detail {
  node: HTMLElement;
  /** The request changed: draw what is new of it. */
  update(entry: RequestEntry): void;
  /** Say how a copy went, for a moment, and with `note` what it left out. */
  say(text: string, hot: boolean, note: boolean): void;
  destroy(): void;
}

export function createDetail(entry: RequestEntry, back: () => void): Detail {
  const node = el("div", "req-detail");
  const backButton = button("main", "");
  backButton.setAttribute("aria-label", "back to requests");
  backButton.addEventListener("click", back);
  const copied = el("span", "row-value idle");
  const hides = el("div", "note", HIDES_NOTE);
  hides.hidden = true;
  node.append(rowBox(backButton, icon("chevron-left"), "requests", copied), hides);

  /** The sections the user opened or folded by hand, which then stay so. */
  const chosen = new Map<string, boolean>();
  let now = entry;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function isOpen(section: Section): boolean {
    return chosen.get(section.part.key) ?? section.part.open(now);
  }

  /** Show a section as it stands: its line, whether it is open, and its inside once it is. */
  function draw(section: Section): void {
    const open = isOpen(section);
    const what = section.part.of(now);
    if (what !== section.shown) {
      section.shown = what;
      section.filled = false;
      section.brief.textContent = section.part.brief(now);
    }
    section.box.classList.toggle("open", open);
    section.head.setAttribute("aria-expanded", open ? "true" : "false");
    section.fold.inert = !open;
    if (open && !section.filled) {
      section.inner.replaceChildren(...section.part.fill(now));
      section.filled = true;
    }
  }

  const sections: Section[] = (entry.detail === "light" ? [GENERAL] : FULL).map((part) => {
    const box = el("div", "row req-section");
    const head = button("main", "");
    const brief = el("span", "row-value idle");
    head.append(el("span", "row-label", part.title), brief);
    const fold = el("div", "fold");
    const inner = el("div", "req-inner");
    fold.append(inner);
    box.append(head, fold);
    // Not what the part shows, whatever that is, so the first draw fills it in.
    const section: Section = { part, box, head, brief, fold, inner, shown: box, filled: false };
    head.addEventListener("click", () => {
      chosen.set(part.key, !isOpen(section));
      draw(section);
    });
    draw(section);
    node.append(box);
    return section;
  });
  if (entry.detail === "light") {
    node.append(el("div", "note", `${LIGHT_WHY}: no headers and no bodies`));
  }

  return {
    node,
    update(next: RequestEntry): void {
      now = next;
      for (const section of sections) draw(section);
    },
    say(text: string, hot: boolean, note: boolean): void {
      clearTimeout(timer);
      copied.textContent = text;
      copied.classList.toggle("hot", hot);
      if (note) hides.hidden = false;
      timer = setTimeout(() => {
        copied.textContent = "";
      }, COPIED_SHOWS);
    },
    destroy(): void {
      clearTimeout(timer);
    },
  };
}
