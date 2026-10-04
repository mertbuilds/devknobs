// adapted from react-grab (MIT, Copyright (c) 2025 Aiden Bai)

/** Node types, as numbers, so elements from another realm read the same. */
const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

const XHTML = "http://www.w3.org/1999/xhtml";

const TEXT_MAX = 100;
const VALUE_MAX = 15;
const IDENTIFYING_VALUE_MAX = 120;
const ATTRIBUTE_MAX = 8;
const SUFFIX = "...";

/** Shown first, in this order. `class` alone is cut short. */
const PRIORITY = ["id", "class", "aria-label", "data-testid", "role", "name", "title"];

/** Shown next, with long values, and bare when empty. */
const IDENTIFYING = new Set([
  "id",
  "data-testid",
  "aria-label",
  "href",
  "src",
  "alt",
  "type",
  "name",
  "placeholder",
  "role",
  "for",
  "action",
  "method",
  "title",
  "disabled",
  "checked",
  "readonly",
  "required",
  "selected",
  "open",
]);

/** Tags whose text is their descendants' text too, as a link or a button reads. */
const DESCENDANT_TEXT = new Set([
  "a",
  "button",
  "code",
  "label",
  "option",
  "pre",
  "summary",
  "text",
]);

const SKIPPED_TEXT = new Set(["script", "style", "template", "noscript"]);

export function escapeText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttribute(value: string): string {
  return escapeText(value)
    .replace(/"/g, "&quot;")
    .replace(/\r/g, "&#13;")
    .replace(/\n/g, "&#10;")
    .replace(/\t/g, "&#9;");
}

/** Cut escaped html to `max` characters, the suffix included, never inside an entity. */
export function truncateEscaped(html: string, max: number): string {
  if (html.length <= max) return html;
  const cut = html.slice(0, Math.max(0, max - SUFFIX.length));
  const entity = cut.lastIndexOf("&");
  const whole = entity > cut.lastIndexOf(";") ? cut.slice(0, entity) : cut;
  return `${whole}${SUFFIX}`.slice(0, max);
}

/** Attributes of devknobs and react-grab themselves. */
function isInternal(name: string): boolean {
  return name.startsWith("data-devknobs") || name.startsWith("data-react-grab-");
}

function formatAttribute(name: string, value: string, max: number): string {
  return `${name}="${truncateEscaped(escapeAttribute(value), max)}"`;
}

function priorityAttributes(element: Element): string[] {
  const parts: string[] = [];
  for (const name of PRIORITY) {
    if (parts.length >= ATTRIBUTE_MAX) break;
    const value = element.getAttribute(name);
    if (!value) continue;
    parts.push(formatAttribute(name, value, name === "class" ? VALUE_MAX : IDENTIFYING_VALUE_MAX));
  }
  return parts;
}

function attributes(element: Element): string {
  const identifying: string[] = [];
  const rest: string[] = [];
  for (const { name, value } of Array.from(element.attributes)) {
    if (isInternal(name) || PRIORITY.includes(name)) continue;
    if (name === "className" || name === "style") continue;
    if (IDENTIFYING.has(name)) {
      identifying.push(value ? formatAttribute(name, value, IDENTIFYING_VALUE_MAX) : name);
    } else if (value) {
      rest.push(formatAttribute(name, value, VALUE_MAX));
    }
  }
  return [...priorityAttributes(element), ...identifying, ...rest]
    .slice(0, ATTRIBUTE_MAX)
    .map((part) => ` ${part}`)
    .join("");
}

function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function skipsText(element: Element): boolean {
  if (element.getAttribute("aria-hidden") === "true" || element.hasAttribute("hidden")) return true;
  return SKIPPED_TEXT.has(element.tagName.toLowerCase());
}

function directText(element: Element): string {
  const parts: string[] = [];
  for (const node of Array.from(element.childNodes)) {
    if (node.nodeType !== TEXT_NODE) continue;
    const text = collapse(node.textContent ?? "");
    if (text) parts.push(text);
  }
  return parts.join(" ");
}

/** Collect text depth first until the budget is spent, and hand back what is left of it. */
function descendantText(node: Node, parts: string[], budget: number): number {
  if (node.nodeType === TEXT_NODE) {
    const text = collapse(node.textContent ?? "");
    if (!text) return budget;
    parts.push(text);
    return budget - text.length;
  }
  if (node.nodeType !== ELEMENT_NODE || skipsText(node as Element)) return budget;
  let left = budget;
  for (const child of Array.from(node.childNodes)) {
    left = descendantText(child, parts, left);
    if (left <= 0) break;
  }
  return left;
}

function previewText(element: Element, tag: string): string {
  if (skipsText(element)) return "";
  const direct = directText(element);
  if (!DESCENDANT_TEXT.has(tag)) return direct;
  if (direct && element.children.length === 0) return direct;
  const parts: string[] = [];
  descendantText(element, parts, TEXT_MAX);
  return parts.join(" ");
}

/**
 * One line of html for the element: its tag, up to 8 attributes, the identifying
 * ones first, and its own text, or a link's or a button's whole text. Outside
 * html, as in svg, only the priority attributes show.
 */
export function htmlPreview(element: Element): string {
  const tag = (element.tagName || "").toLowerCase();
  const attrs =
    element.namespaceURI === XHTML
      ? attributes(element)
      : priorityAttributes(element)
          .map((part) => ` ${part}`)
          .join("");
  const text = truncateEscaped(escapeText(previewText(element, tag)), TEXT_MAX);
  return text ? `<${tag}${attrs}>${text}</${tag}>` : `<${tag}${attrs} />`;
}
