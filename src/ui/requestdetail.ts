import { NativeDate } from "../engine/clock";
import type { BodyRecord, RequestEntry } from "../requests/types";
import { button, el } from "./dom";
import { glyph, icon } from "./icons";
import {
  codeBlock,
  emptyLine,
  filterField,
  group,
  noteLine,
  type Pairs,
  pairs,
  rowButton,
  segments,
  splitBar,
  toolbar,
} from "./kit";
import { clockTime, durationLabel, hasText, type Lead, LIGHT_WHY, middle, STATUS_TONES } from "./requestformat";
import {
  BODY_LINES,
  bodyShape,
  cutNote,
  type Frame,
  headerGroups,
  headersFilter,
  isSegment,
  LIGHT_BODIES,
  moreLines,
  noResponse,
  pathRoom,
  queryLines,
  type Segment,
  SEGMENTS,
  segmentsOf,
  stackFile,
  stackLines,
  startSegment,
  summary,
  timingLines,
  timingParts,
} from "./requestparts";

/**
 * One request in full, in place of the list. What is read most is on top: a
 * summary that stays, with the method and the path and then how it went, and
 * under it one of three segments at a time. `body` has the request's body
 * and the answer's, `headers` both sets of headers, and `more` the rest: the
 * address in full, what the request is, its timing and the call that made
 * it. The way back is the view's head.
 *
 * A part is built once and drawn again only when what it shows has changed,
 * so a request that changes while it shows keeps its segment, its scroll and
 * what the user opened.
 */

/** What the detail says once, the first time a request is copied. */
export const HIDES_NOTE =
  "header values and address parameters that look like secrets are copied as <hidden>. bodies are copied as they are: check before you paste";

/** What the detail says of a request the log let go while it showed. */
export const GONE_NOTE = "this request is no longer in the log, and shows as it last was";

/** What the headers say where the filter leaves none. */
export const NO_HEADER = "no header matches";

/** What the detail needs from the view it shows in. */
export interface DetailContext {
  /** Copy a text, and say how that went. */
  copy(text: string): void;
  /** The user picked another segment, which starts at its top. */
  picked?(): void;
  /** The file devknobs runs from, as a stack names it. Read from a stack of its own where left out. */
  own?: string;
}

export interface Detail {
  node: HTMLElement;
  /** The request changed: draw what is new of it. */
  update(entry: RequestEntry): void;
  /** The log let the request go: say that what shows will not change again. */
  gone(): void;
  /** Say what a copy leaves out. */
  hides(): void;
  /** Escape came: empty the headers' filter, and say whether there was anything in it. */
  escape(): boolean;
  /** The detail left the view. */
  destroy(): void;
}

/** One part of a segment: what it shows, and its node while that is the same. */
interface Block {
  /** What the block shows. A new one of any of them means it is built again. */
  of(entry: RequestEntry): readonly unknown[];
  /** The block, or null where it has nothing to show. */
  build(entry: RequestEntry): HTMLElement | null;
  shown: readonly unknown[] | null;
  node: HTMLElement | null;
}

function block(of: Block["of"], build: Block["build"]): Block {
  return { of, build, shown: null, node: null };
}

function same(one: readonly unknown[] | null, other: readonly unknown[]): boolean {
  return one !== null && one.length === other.length && one.every((each, at) => each === other[at]);
}

/** Set a node's text, unless it says so already. */
function put(node: HTMLElement, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}

export function createDetail(entry: RequestEntry, context: DetailContext): Detail {
  const own = context.own ?? stackFile(new Error().stack);
  let now = entry;
  /** The segment the user picked for this request. Until then it opens on what it has. */
  let picked: Segment | null = null;

  const verb = el("span", "req-verb");
  let verbShown: Lead | null = null;
  const path = button("req-url", "");
  path.addEventListener("click", () => context.copy(now.url));
  const first = el("div", "req-first");
  first.append(verb, path);
  const status = el("span", "req-stat");
  const took = el("span", "req-took");
  const host = el("span", "req-host");
  const second = el("div", "req-second");
  second.append(status, took, host);
  const top = el("div", "req-sum");
  top.append(first, second);

  const choice = segments({
    options: SEGMENTS.map((each) => ({ value: each, label: each })),
    label: "what of the request shows",
    onChange(value: string): void {
      if (!isSegment(value) || value === shown()) return;
      picked = value;
      draw();
      context.picked?.();
    },
  });
  /** The headers' lists, which the filter goes through. */
  let lists: { box: HTMLElement; list: Pairs }[] = [];
  const unmatched = emptyLine(NO_HEADER);
  const filter = filterField({ placeholder: "filter", label: "filter headers", onInput: refilter });

  const hides = noteLine(HIDES_NOTE);
  hides.hidden = true;
  const left = noteLine(GONE_NOTE);
  left.hidden = true;
  const region = el("div", "req-body");
  region.setAttribute("role", "region");
  const node = el("div", "req-detail");
  node.append(toolbar([top, choice.node, filter.node]), hides, left, region);

  function shown(): Segment {
    return picked !== null && segmentsOf(now).includes(picked) ? picked : startSegment(now);
  }

  function refilter(): void {
    const words = filter.node.value.toLowerCase().split(/\s+/).filter((word) => word !== "");
    let kept = 0;
    for (const { box, list } of lists) {
      const here = list.keep((name, value) => {
        const text = `${name} ${value}`.toLowerCase();
        return words.every((word) => text.includes(word));
      });
      box.hidden = here === 0;
      kept += here;
    }
    unmatched.hidden = kept > 0;
  }

  /** The summary, changed in place. */
  function drawTop(): void {
    const said = summary(now);
    const was = verbShown;
    const next = said.verb;
    if (!was || was.text !== next.text || was.icon !== next.icon || was.tone !== next.tone) {
      verbShown = next;
      verb.className = ["req-verb", next.icon ? "mark" : "", next.tone].filter(Boolean).join(" ");
      if (next.icon) {
        verb.replaceChildren(glyph(next.icon));
        verb.setAttribute("role", "img");
        verb.setAttribute("aria-label", next.text);
        verb.title = next.text;
      } else {
        verb.textContent = next.text;
        verb.removeAttribute("role");
        verb.removeAttribute("aria-label");
        verb.title = "";
      }
    }
    put(path, middle(said.path, pathRoom(path.clientWidth)));
    if (path.title !== now.url) path.title = now.url;
    path.setAttribute("aria-label", `copy the address ${now.url}`);
    put(status, said.status);
    for (const each of STATUS_TONES) status.classList.toggle(each, each === said.tone);
    put(took, said.time);
    put(host, said.host);
  }

  /** A body: what is missing of it, then its text, its fields, or the line that says why it has none. */
  function body(record: BodyRecord, type: string, name: string, lines?: number): { ends: HTMLElement[]; nodes: HTMLElement[] } {
    const ends: HTMLElement[] = [];
    const nodes: HTMLElement[] = [];
    const cut = cutNote(record);
    if (cut) nodes.push(noteLine(cut));
    const shape = bodyShape(record, type);
    if (shape.kind === "line") nodes.push(noteLine(shape.text));
    else if (shape.kind === "fields") nodes.push(pairs(shape.lines).node);
    else {
      const code = codeBlock({ text: shape.text, lines });
      if (code.wrap) ends.push(code.wrap);
      nodes.push(code.node);
    }
    if (hasText(record) && record.text !== "") {
      const copy = rowButton("req-copy", icon("copy"), `copy the ${name} body`);
      copy.addEventListener("click", () => context.copy(record.text));
      ends.push(copy);
    }
    return { ends, nodes };
  }

  function stack(text: string): HTMLElement {
    const box = el("div", "req-stack");
    const frameLine = (frame: Frame): HTMLElement => {
      const row = el("div", "req-frame");
      row.append(el("span", "req-fn", frame.name));
      if (frame.where !== "") {
        const where = button("req-where", frame.short);
        where.title = frame.where;
        where.setAttribute("aria-label", `copy ${frame.where}`);
        where.addEventListener("click", () => context.copy(frame.where));
        row.append(where);
      }
      return row;
    };
    for (const each of stackLines(text, own)) {
      if (each.kind === "frame") box.append(frameLine(each.frame));
      else {
        // The frames that are not the page's own show once they are asked for.
        const more = button("chip req-skipped", `${each.frames.length} more`);
        const row = el("div", "req-frame");
        row.append(more);
        more.addEventListener("click", () => {
          for (const frame of each.frames) box.insertBefore(frameLine(frame), row);
          row.remove();
        });
        box.append(row);
      }
    }
    return box;
  }

  const blocks: Record<Segment, Block[]> = {
    body: [
      block(
        (at) => [at.detail],
        (at) => (at.detail === "light" ? noteLine(LIGHT_BODIES) : null),
      ),
      block(
        (at) => [at.detail, at.url, at.requestBody],
        (at) => {
          const query = queryLines(at.url);
          if (at.detail === "light" || (at.requestBody === null && query.length === 0)) return null;
          const sent = at.requestBody ? body(at.requestBody, "", "request", BODY_LINES) : { ends: [], nodes: [] };
          const box = group({ label: "request", ends: sent.ends });
          if (query.length > 0) box.append(pairs(query).node);
          box.append(...sent.nodes);
          return box;
        },
      ),
      block(
        (at) => [at.detail, at.responseBody, at.contentType, at.state === "pending"],
        (at) => {
          if (at.detail === "light") return null;
          const got = at.responseBody
            ? body(at.responseBody, at.contentType, "response")
            : { ends: [], nodes: [noteLine(noResponse(at))] };
          const box = group({ label: "response", ends: got.ends });
          box.append(...got.nodes);
          return box;
        },
      ),
    ],
    headers: [
      block(
        (at) => [at.responseHeaders, at.requestHeaders],
        (at) => {
          const box = el("div", "req-headers");
          lists = headerGroups(at).map((each) => {
            const part = group({ label: each.label });
            const list = pairs(each.lines);
            part.append(list.node);
            box.append(part);
            return { box: part, list };
          });
          box.append(unmatched);
          refilter();
          return box;
        },
      ),
    ],
    more: [
      block(
        (at) => [at.detail],
        (at) => (at.detail === "light" ? noteLine(LIGHT_WHY) : null),
      ),
      block(
        (at) => [at],
        (at) => {
          const box = group({ label: "request" });
          box.append(pairs(moreLines(at)).node);
          return box;
        },
      ),
      block(
        (at) => [at.timing],
        (at) => {
          const box = group({ label: "timing" });
          const parts = timingParts(at.timing);
          if (parts.shares) {
            const label = `waiting ${durationLabel(parts.waiting)}, download ${durationLabel(parts.download)}`;
            box.append(splitBar(parts.shares, label));
          }
          box.append(pairs(timingLines(at.timing, clockTime(new NativeDate(at.timing.start)))).node);
          return box;
        },
      ),
      block(
        (at) => [at.initiator],
        (at) => {
          if (at.initiator === "") return null;
          const box = group({ label: "initiator" });
          box.append(stack(at.initiator));
          return box;
        },
      ),
    ],
  };

  /** Which blocks the region holds now. */
  let held: readonly HTMLElement[] = [];

  /** Show the request as it stands: the summary, the segments it has, and the one that shows. */
  function draw(): void {
    drawTop();
    const has = segmentsOf(now);
    for (const item of choice.items) item.node.hidden = !isSegment(item.value) || !has.includes(item.value);
    const segment = shown();
    choice.set(segment);
    region.setAttribute("aria-label", segment);
    filter.node.hidden = segment !== "headers" || !headersFilter(now);
    const nodes: HTMLElement[] = [];
    for (const each of blocks[segment]) {
      const what = each.of(now);
      if (!same(each.shown, what)) {
        each.shown = what;
        each.node = each.build(now);
      }
      if (each.node) nodes.push(each.node);
    }
    // What is the same stays where it is, so nothing the user scrolled to or opened moves.
    if (nodes.length !== held.length || nodes.some((each, at) => each !== held[at])) {
      region.replaceChildren(...nodes);
      held = nodes;
    }
  }

  draw();

  // The path is cut to the two lines it has, which are as wide as the panel is dragged.
  const sized = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(drawTop);
  sized?.observe(path);

  return {
    node,
    update(next: RequestEntry): void {
      now = next;
      draw();
    },
    gone(): void {
      left.hidden = false;
    },
    hides(): void {
      hides.hidden = false;
    },
    escape(): boolean {
      return !filter.node.hidden && filter.clear();
    },
    destroy(): void {
      sized?.disconnect();
    },
  };
}
