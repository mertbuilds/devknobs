// adapted from react-grab (MIT, Copyright (c) 2025 Aiden Bai)

export interface Selector {
  selector: string;
  /** Built from an attribute that means something, as a test id or a label. */
  semantic: boolean;
}

const VALUE_MAX = 120;

/** In order of preference. */
const PREFERRED = [
  "data-testid",
  "data-test-id",
  "data-test",
  "data-cy",
  "data-qa",
  "aria-label",
  "href",
  "src",
  "role",
  "name",
  "title",
  "alt",
];

const ACTIONABLE_ROLES = new Set([
  "button",
  "link",
  "checkbox",
  "radio",
  "switch",
  "tab",
  "menuitem",
  "option",
  "textbox",
  "combobox",
  "slider",
  "spinbutton",
]);

const IDENTIFIER_QUERY = [
  ...PREFERRED.filter((name) => name !== "role").map((name) => `[${name}]`),
  ...[...ACTIONABLE_ROLES].map((role) => `[role~="${role}"]`),
].join(",");

const GENERIC_QUERY = "button,input,select,textarea";

/** Ids React, a uuid or a component library made up, which change between renders or loads. */
const GENERATED_IDS = [
  /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i,
  /:r[a-z0-9]+:/i,
  /_r_[a-z0-9]+_(?:$|-)/i,
  /«r[a-z0-9]+»/i,
  /^(?:downshift-\d+(?:-|$)|headlessui-[a-z-]+-\d+(?:-|$)|mui-\d+(?:-|$)|radix-\d+(?:-|$)|react-aria-\d+(?:-|$)|react-select-\d+(?:-|$))/i,
  /^ember\d+$/i,
  /^\d+$/,
];

export function isStableId(id: string): boolean {
  return (
    id.length > 0 && id.length <= VALUE_MAX && !GENERATED_IDS.some((pattern) => pattern.test(id))
  );
}

function isShadowRoot(node: Node): node is ShadowRoot {
  return "host" in node;
}

function escape(element: Element, value: string): string {
  const css = element.ownerDocument.defaultView?.CSS ?? globalThis.CSS;
  return css.escape(value);
}

function isPreferred(name: string, value: string): boolean {
  if (value.length === 0 || value.length > VALUE_MAX) return false;
  return name !== "role" || value.split(/\s+/).some((role) => ACTIONABLE_ROLES.has(role));
}

function isUnique(element: Element, selector: string): boolean {
  try {
    const root = element.getRootNode();
    const matches = (isShadowRoot(root) ? root : element.ownerDocument).querySelectorAll(selector);
    return matches.length === 1 && matches[0] === element;
  } catch {
    return false;
  }
}

/** A unique id, test id, label or the like, with its tag when the attribute alone is not unique. */
function fastSelector(element: Element): Selector | null {
  const id = element.getAttribute("id");
  let fallback: string | null = null;
  if (id) {
    const selector = `#${escape(element, id)}`;
    if (isUnique(element, selector)) {
      if (isStableId(id)) return { selector, semantic: true };
      fallback = selector;
    }
  }
  for (const name of PREFERRED) {
    const value = element.getAttribute(name);
    if (!value || !isPreferred(name, value)) continue;
    const attribute = `[${name}=${JSON.stringify(value)}]`;
    if (isUnique(element, attribute)) return { selector: attribute, semantic: true };
    const tagged = `${element.tagName.toLowerCase()}${attribute}`;
    if (isUnique(element, tagged)) return { selector: tagged, semantic: true };
  }
  return fallback ? { selector: fallback, semantic: false } : null;
}

/** `tag:nth-child(n)` steps up to an id or the root. */
function nthChildSelector(element: Element): string {
  const steps: string[] = [];
  const rootNode = element.getRootNode();
  const root = isShadowRoot(rootNode)
    ? rootNode
    : (element.ownerDocument.body ?? element.ownerDocument.documentElement);
  let current: Element | null = element;
  while (current) {
    const id = current.getAttribute("id");
    if (id) {
      steps.unshift(`#${escape(current, id)}`);
      break;
    }
    const parent: ParentNode | null = current.parentNode;
    const tag = current.tagName.toLowerCase();
    if (!parent) {
      steps.unshift(tag);
      break;
    }
    steps.unshift(`${tag}:nth-child(${Array.from(parent.children).indexOf(current) + 1})`);
    if (parent === root) {
      if ("tagName" in root) steps.unshift(root.tagName.toLowerCase());
      break;
    }
    current = "tagName" in parent ? (parent as Element) : null;
  }
  return steps.join(" > ");
}

/** The frame around the element's document. devknobs' own frame stands for the page: none. */
function frameOf(element: Element): Element | null {
  try {
    const frame = element.ownerDocument.defaultView?.frameElement ?? null;
    // `FRAME_ATTRIBUTE` spelled out, as an import from the engine would split off a chunk.
    return frame?.hasAttribute("data-devknobs-frame") ? null : frame;
  } catch {
    return null;
  }
}

/** A selector for the element, through shadow roots (`>>>`) and frames (`>>iframe>>`). */
export function elementSelector(element: Element): Selector {
  const local = fastSelector(element) ?? { selector: nthChildSelector(element), semantic: false };
  const root = element.getRootNode();
  const outer = isShadowRoot(root) ? root.host : frameOf(element);
  if (!outer) return local;
  const host = elementSelector(outer);
  const join = isShadowRoot(root) ? ">>>" : ">>iframe>>";
  return {
    selector: `${host.selector} ${join} ${local.selector}`,
    semantic: host.semantic && local.semantic,
  };
}

/** A selector for the element only when every step of it is semantic. */
function semanticSelector(element: Element): Selector | null {
  const local = fastSelector(element);
  if (!local?.semantic) return null;
  const root = element.getRootNode();
  const outer = isShadowRoot(root) ? root.host : frameOf(element);
  if (!outer) return local;
  const host = semanticSelector(outer);
  if (!host) return null;
  const join = isShadowRoot(root) ? ">>>" : ">>iframe>>";
  return { selector: `${host.selector} ${join} ${local.selector}`, semantic: true };
}

function hasIdentifier(element: Element): boolean {
  const id = element.getAttribute("id");
  return Boolean((id && isStableId(id)) || element.matches(IDENTIFIER_QUERY));
}

function isTarget(element: Element): boolean {
  return hasIdentifier(element) || element.matches(GENERIC_QUERY);
}

/** Half the page or more sits inside it, so it says little about the element. */
function isBroad(element: Element): boolean {
  const { body, documentElement } = element.ownerDocument;
  if (element === body || element === documentElement) return true;
  if (!body) return false;
  const total = body.getElementsByTagName("*").length;
  return total > 0 && element.getElementsByTagName("*").length / total >= 0.5;
}

function composedParent(element: Element): Element | null {
  if (element.assignedSlot) return element.assignedSlot;
  if (element.parentElement) return element.parentElement;
  const root = element.getRootNode();
  return isShadowRoot(root) ? root.host : frameOf(element);
}

/**
 * The element a selector should name: the element, or its nearest ancestor in
 * the same root with an identifier or a control's tag, short of a broad one.
 */
export function selectorTarget(
  element: Element,
  accept?: (candidate: Element) => boolean,
): Element {
  const root = element.getRootNode();
  let current: Element | null = element;
  while (current) {
    if (isTarget(current)) {
      const broad = isBroad(current);
      if (broad && current !== element) return element;
      if (!accept || accept(current)) return current;
      if (broad) return current;
      if (!hasIdentifier(current) && current === element) return current;
    }
    const parent = composedParent(current);
    current = parent?.getRootNode() === root ? parent : null;
  }
  return element;
}

/** The nearest semantic selector, up from the element, or null. */
export function nearestSemanticSelector(element: Element): Selector | null {
  let found: Selector | null = null;
  selectorTarget(element, (candidate) => {
    found = semanticSelector(candidate);
    return found !== null;
  });
  return found;
}
