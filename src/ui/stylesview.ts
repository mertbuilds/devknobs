/**
 * The styles view of the panel: the rules that reach one element, as the
 * engine in `../styles` ranks them, read only. A line of crumbs and a filter
 * stay on top, and under them a block for each rule, the element's own first,
 * then its pseudo-elements', then what each ancestor hands down. To use it:
 *
 *   const view = createStylesView({ tips, title, outline });
 *   body.append(view.node); view.show(element); view.destroy();
 *
 * The view is built once for each inspection, and the filter only hides what
 * is built, and all of it wraps or is cut short at whatever width the panel
 * is dragged to. It reads the styles again when what they depend on changes: the
 * element or an ancestor of it, the stylesheets in the head, the window's
 * size and the knobs. The element may be one of the device frame's page.
 */

import * as engine from "../engine";
import { inspect, invalidate } from "../styles";
import { flatParent, label } from "../styles/tree";
import type {
  Inspection,
  OwnBlock,
  StyleBlock,
  StyleDeclaration,
  VariableValue,
} from "../styles/types";
import type { DevknobsState } from "../types";
import { button, el, field } from "./dom";
import {
  crumbText,
  hiddenLine,
  matchesFilter,
  middle,
  sourceOf,
  swatchOf,
  TITLE_MAX,
  valueParts,
  variableTip,
} from "./stylesformat";
import type { Tips } from "./tooltip";

/** How long the page is left to settle after a change before its styles are read again, in ms. */
export const SETTLE = 120;

/** How long the block that sets a custom property stays lit after a click on its name, in ms. */
const FLASH = 900;

/** What the view says before an element is picked, when one left, and when nothing is to show. */
export const EMPTY = "pick an element to see its styles";
export const GONE = "the element left the page";
export const NO_RULES = "no rule reaches this element";
export const NO_MATCH = "no declaration matches";

/** What the view needs from the panel. */
export interface StylesContext {
  tips: Tips;
  /** Say what is shown in the view's head. */
  title(text: string): void;
  /** Keep a quiet box on the element shown, or with null on none. */
  outline(element: Element | null): void;
}

/** What the view reads the page through, so a test can stand in for each. */
export interface StylesPage {
  inspect: typeof inspect;
  invalidate: typeof invalidate;
  getState(): DevknobsState;
  subscribe(listener: (state: DevknobsState) => void): () => void;
  /** The browser's word on whether a text is a color. */
  isColor(text: string): boolean;
}

function isColor(text: string): boolean {
  try {
    return typeof CSS !== "undefined" && CSS.supports("color", text);
  } catch {
    return false;
  }
}

const PAGE: StylesPage = {
  inspect,
  invalidate,
  getState: engine.getState,
  subscribe: engine.subscribe,
  isColor,
};

export interface StylesView {
  /** The view's node, which goes in the body of the panel's view. */
  node: HTMLElement;
  /** Show an element's styles, or those of one of its pseudo-elements. Null shows the empty state. */
  show(element: Element | null, pseudo?: string): void;
  /** Read the styles again now, as after the frame loaded another page. */
  refresh(): void;
  /** Escape clears the filter where it has text, and says whether it did. */
  escape(): boolean;
  /** Take the focus, on no control, so the keys of the picking stay its own. */
  focus(): void;
  destroy(): void;
}

/** A declaration's line, and what the filter reads of it. */
interface Line {
  node: HTMLElement;
  declaration: StyleDeclaration;
}

/** A block as built, with the heading of the group it is in, if any. */
interface Built {
  node: HTMLElement;
  lines: Line[];
  group: HTMLElement | null;
}

function isElement(node: Node): node is Element {
  return node.nodeType === 1;
}

/** Only devknobs' own nodes came or went: a box it draws, a style element it brings. */
function isOwn(record: MutationRecord): boolean {
  if (record.type !== "childList") return false;
  const nodes = [...Array.from(record.addedNodes), ...Array.from(record.removedNodes)];
  return (
    nodes.length > 0 && nodes.every((node) => isElement(node) && node.hasAttribute("data-devknobs"))
  );
}

/** The knobs as one text, the panel's own state aside: it moves nothing on the page. */
function knobsOf(state: DevknobsState): string {
  return JSON.stringify({ ...state, panel: null });
}

export function createStylesView(context: StylesContext, page: StylesPage = PAGE): StylesView {
  const { tips } = context;
  const node = el("div", "styles");
  // Takes the focus from script only, and the tab key goes on to its controls.
  node.tabIndex = -1;
  // Stays on top while the blocks scroll under it.
  const bar = el("div", "styles-bar");
  const crumbs = el("div", "crumbs");
  crumbs.setAttribute("role", "group");
  crumbs.setAttribute("aria-label", "the element and its ancestors");
  const filter = field("filter styles-filter", "filter", "filter the declarations");
  bar.append(crumbs, filter);
  const blocks = el("div", "css-blocks");
  const note = el("div", "empty", EMPTY);
  node.append(bar, blocks, note);

  let target: Element | null = null;
  let pseudo: string | null = null;
  /** The pseudo-elements the element was last seen to have rules for. */
  let pseudos: string[] = [];
  let built: Built[] = [];
  /** The blocks by their id in the inspection shown. */
  let byId = new Map<number, HTMLElement>();
  /** The nodes of the blocks that have a tooltip, which goes when they do. */
  let tipped: HTMLElement[] = [];
  let observer: MutationObserver | null = null;
  /** The window whose size the styles shown depend on. */
  let watched: Window | null = null;
  /** A stylesheet may have changed since the last read. */
  let stale = false;
  let knobs = knobsOf(page.getState());
  let timer = 0;
  let flashTimer = 0;
  let lit: HTMLElement | null = null;

  function later(): void {
    clearTimeout(timer);
    timer = window.setTimeout(refresh, SETTLE);
  }

  function onMutations(records: MutationRecord[]): void {
    const theirs = records.filter((record) => !isOwn(record));
    if (theirs.length === 0) return;
    const head = target?.ownerDocument.head;
    if (head && theirs.some((record) => head.contains(record.target))) stale = true;
    later();
  }

  function unwatch(): void {
    observer?.disconnect();
    observer = null;
    watched?.removeEventListener("resize", later);
    watched = null;
  }

  /**
   * One observer for all the element's styles can change with on the page: its
   * own attributes, each ancestor's and what comes and goes under it, which
   * also tells when the element itself is taken out, and the head's stylesheets.
   */
  function watch(element: Element): void {
    unwatch();
    observer = new MutationObserver(onMutations);
    observer.observe(element, { attributes: true });
    for (let up = flatParent(element); up; up = flatParent(up)) {
      observer.observe(up, { attributes: true, childList: true });
    }
    const head = element.ownerDocument.head;
    if (head) {
      observer.observe(head, {
        attributes: true,
        characterData: true,
        childList: true,
        subtree: true,
      });
    }
    watched = element.ownerDocument.defaultView;
    watched?.addEventListener("resize", later);
  }

  function say(text: string | null): void {
    note.hidden = text === null;
    if (text !== null) note.textContent = text;
  }

  /** Give a node of the blocks a tooltip. */
  function tip(control: HTMLElement, text: string): void {
    tips.tooltip(control, text);
    tipped.push(control);
  }

  /** The blocks are about to go: so does a tooltip one of their nodes shows. */
  function dropTips(): void {
    if (tipped.some((control) => tips.isFor(control))) tips.hide();
    tipped = [];
  }

  function clear(text: string): void {
    dropTips();
    built = [];
    byId = new Map();
    blocks.replaceChildren();
    crumbs.replaceChildren();
    bar.hidden = true;
    say(text);
  }

  /** A crumb or a heading that shows something else when pressed. */
  function link(className: string, text: string, go: () => void): HTMLButtonElement {
    const control = button(className, text);
    control.addEventListener("click", go);
    return control;
  }

  /** The arrows walk the crumbs, which are one stop for the tab key. */
  function onCrumbKey(event: KeyboardEvent): void {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    const all = Array.from(crumbs.querySelectorAll<HTMLElement>("button"));
    const at = all.findIndex((crumb) => crumb.tabIndex === 0);
    const next = all[at + (event.key === "ArrowRight" ? 1 : -1)];
    const current = all[at];
    if (!next || !current) return;
    event.preventDefault();
    event.stopPropagation();
    current.tabIndex = -1;
    next.tabIndex = 0;
    next.focus({ preventScroll: true });
    next.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  crumbs.addEventListener("keydown", onCrumbKey);

  /** The ancestors from the outermost in, the element, then its pseudo-elements. */
  function drawCrumbs(element: Element): void {
    const chain: Element[] = [];
    for (let up: Element | null = element; up; up = flatParent(up)) chain.unshift(up);
    const nodes: HTMLElement[] = [];
    const add = (text: string, current: boolean, go: () => void) => {
      if (nodes.length > 0) {
        const mark = el("span", "crumb-sep", "›");
        mark.setAttribute("aria-hidden", "true");
        nodes.push(mark);
      }
      const crumb = link("crumb", text, go);
      crumb.tabIndex = current ? 0 : -1;
      if (current) crumb.setAttribute("aria-current", "true");
      nodes.push(crumb);
    };
    for (const one of chain) {
      add(crumbText(label(one)), one === element && pseudo === null, () => show(one));
    }
    for (const name of pseudos) add(name, name === pseudo, () => show(element, name));
    crumbs.replaceChildren(...nodes);
    // The element is the end of the line, so that is the end that shows.
    crumbs.scrollLeft = crumbs.scrollWidth;
  }

  /** Bring a block into sight and light it for a moment. */
  function flash(id: number): void {
    const block = byId.get(id);
    if (!block || block.hidden) return;
    clearTimeout(flashTimer);
    lit?.classList.remove("flash");
    block.scrollIntoView({ block: "nearest" });
    // Read the layout, so a second flash of the same block starts over.
    void block.offsetWidth;
    block.classList.add("flash");
    lit = block;
    flashTimer = window.setTimeout(() => block.classList.remove("flash"), FLASH);
  }

  /** A custom property's name in a value: what it resolves to on rest, and its block on a press. */
  function variable(name: string, value: VariableValue): HTMLElement {
    const control = button("css-var", name);
    tip(control, variableTip(name, value));
    const { definedIn } = value;
    if (definedIn !== null) control.addEventListener("click", () => flash(definedIn));
    return control;
  }

  function line(declaration: StyleDeclaration, variables: Inspection["variables"]): Line {
    // Struck through, as a declaration another one overrides is no longer in force.
    const row = el(declaration.overridden ? "s" : "div", "css-decl");
    row.append(el("span", "css-name", declaration.name), ": ");
    const color = swatchOf(declaration, variables, page.isColor);
    if (color) {
      const swatch = el("span", "css-swatch");
      swatch.setAttribute("aria-hidden", "true");
      swatch.style.backgroundColor = color;
      row.append(swatch);
    }
    const value = el("span", "css-value");
    for (const part of valueParts(declaration.value)) {
      const known = part.kind === "var" ? variables[part.text] : undefined;
      value.append(known ? variable(part.text, known) : part.text);
    }
    row.append(value, declaration.important ? " !important;" : ";");
    return { node: row, declaration };
  }

  function blockNode(block: OwnBlock, found: Inspection, group: HTMLElement | null): Built {
    const section = el("section", "css-block");
    section.setAttribute("role", "region");
    const head = el("div", "css-head");
    const selector = el("span", "css-selector");
    if (block.kind === "inline") {
      section.setAttribute("aria-label", "element.style");
      selector.textContent = "element.style";
      head.append(selector);
    } else {
      section.setAttribute("aria-label", block.selectorText);
      for (const context of block.context) section.append(el("div", "css-context", context));
      block.selector.forEach((part, index) => {
        if (index > 0) selector.append(", ");
        selector.append(el("span", part.matches ? "css-part" : "css-part off", part.text));
      });
      // The mark and the file keep together, as one end of the line.
      const from = el("span", "css-from");
      if (block.conditional && !block.conditional.confirmed) {
        const { kind } = block.conditional;
        const mark = el("span", "css-mark", kind);
        tip(mark, `could not tell whether its @${kind} holds for the element`);
        from.append(mark);
      }
      const source = sourceOf(block.origin);
      const file = el("span", "css-source", source.text);
      tip(file, source.tip);
      from.append(file);
      head.append(selector, from);
    }
    section.append(head);
    const lines = block.declarations.map((declaration) => line(declaration, found.variables));
    section.append(...lines.map((one) => one.node));
    byId.set(block.id, section);
    return { node: section, lines, group };
  }

  /** The blocks in the engine's order, a heading before each group of them. */
  function drawBlocks(found: Inspection, element: Element): void {
    dropTips();
    built = [];
    byId = new Map();
    const nodes: HTMLElement[] = [];
    const add = (block: OwnBlock, group: HTMLElement | null) => {
      const made = blockNode(block, found, group);
      built.push(made);
      nodes.push(made.node);
    };
    const each = (block: StyleBlock) => {
      if (block.kind === "inherited") {
        const from = block.element;
        const head = link("css-group", `inherited from ${crumbText(block.from)}`, () => show(from));
        nodes.push(head);
        for (const own of block.blocks) add(own, head);
      } else if (block.kind === "pseudo") {
        const name = block.pseudo;
        const head = link("css-group", name, () => show(element, name));
        nodes.push(head);
        for (const own of block.blocks) add(own, head);
      } else add(block, null);
    };
    found.blocks.forEach(each);
    for (const hidden of found.hidden) nodes.push(el("div", "css-hidden", hiddenLine(hidden)));
    blocks.replaceChildren(...nodes);
  }

  /** Hide the declarations the filter leaves out, and the blocks and headings left with none. */
  function applyFilter(): void {
    const text = filter.value;
    const filtering = text.trim() !== "";
    const groups = new Map<HTMLElement, boolean>();
    let any = false;
    for (const block of built) {
      let kept = !filtering;
      for (const one of block.lines) {
        const matches = matchesFilter(one.declaration, text);
        one.node.hidden = !matches;
        if (matches) kept = true;
      }
      block.node.hidden = !kept;
      if (kept) any = true;
      if (block.group) groups.set(block.group, (groups.get(block.group) ?? false) || kept);
    }
    for (const [head, kept] of groups) head.hidden = !kept;
    say(any ? null : built.length === 0 ? NO_RULES : NO_MATCH);
  }

  /** Read the element's styles and build the view from them, once. */
  function refresh(): void {
    clearTimeout(timer);
    timer = 0;
    const element = target;
    if (!element) return;
    if (stale) {
      stale = false;
      page.invalidate();
    }
    if (!element.isConnected || !element.ownerDocument.defaultView) {
      target = null;
      unwatch();
      context.outline(null);
      clear(GONE);
      return;
    }
    const found = page.inspect(element, pseudo ?? undefined);
    if (pseudo === null) {
      pseudos = found.blocks.flatMap((block) => (block.kind === "pseudo" ? [block.pseudo] : []));
    }
    bar.hidden = false;
    context.title(middle(`${found.target.label}${found.target.pseudo ?? ""}`, TITLE_MAX));
    drawCrumbs(element);
    drawBlocks(found, element);
    applyFilter();
  }

  function show(element: Element | null, name?: string): void {
    if (element !== target) pseudos = [];
    target = element;
    pseudo = name ?? null;
    if (pseudo !== null && !pseudos.includes(pseudo)) pseudos = [...pseudos, pseudo];
    context.outline(element);
    if (!element) {
      unwatch();
      context.title("styles");
      clear(EMPTY);
      return;
    }
    watch(element);
    // The view's body scrolls, and a new element starts from its top.
    if (node.parentElement) node.parentElement.scrollTop = 0;
    refresh();
  }

  /** A knob the page's styles can depend on moved: the scheme rewrites its stylesheets. */
  const unsubscribe = page.subscribe((state) => {
    const next = knobsOf(state);
    if (next === knobs) return;
    knobs = next;
    stale = true;
    if (target) later();
  });

  filter.addEventListener("input", applyFilter);
  clear(EMPTY);

  return {
    node,
    show,
    refresh,
    escape(): boolean {
      if (filter.value === "") return false;
      filter.value = "";
      applyFilter();
      return true;
    },
    focus: () => node.focus({ preventScroll: true }),
    destroy(): void {
      clearTimeout(timer);
      clearTimeout(flashTimer);
      unwatch();
      unsubscribe();
      crumbs.removeEventListener("keydown", onCrumbKey);
      filter.removeEventListener("input", applyFilter);
      dropTips();
      target = null;
    },
  };
}
