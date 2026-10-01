/**
 * Pseudo-localization, after the approach of tryggvigy/pseudo-localization
 * (MIT): every letter accented, every string about a third longer and
 * bracketed, so hardcoded, clipped or concatenated strings stand out before a
 * real translation exists. "Settings" reads "[Ŝéţţîñĝš ···]".
 */

const PLAIN = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const ACCENTED = "áƀçðéƒĝĥîĵķļɱñöþǫŕšţûṽŵẋýžÅƁÇÐÉƑĜĤÎĴĶĻṀÑÖÞǪŔŜŢÛṼŴẊÝŽ";

const accented = Array.from(ACCENTED);
const ACCENTS = new Map(Array.from(PLAIN, (char, i) => [char, accented[i] ?? char]));

/** How much longer a pseudo string runs, about what German adds to English. */
const GROWTH = 0.35;

/** Attributes that carry text a user reads. */
const ATTRIBUTES = ["placeholder", "title", "aria-label", "alt"];

/**
 * Raw text, user input and devknobs' own nodes stay as they are, and so does an
 * option without a value, whose text is the value its form sends.
 */
const SKIPPED = "script,style,noscript,textarea,option:not([value]),[data-devknobs]";

const LETTER = /\p{L}/u;

/**
 * The pseudo form of a string. Whitespace around it stays outside the
 * brackets, and a string without letters has nothing to translate.
 */
export function pseudoText(text: string): string {
  const core = text.trim();
  if (!LETTER.test(core)) return text;
  const start = text.indexOf(core);
  let accented = "";
  for (const char of core) accented += ACCENTS.get(char) ?? char;
  const padding = "·".repeat(Math.ceil(core.length * GROWTH));
  return `${text.slice(0, start)}[${accented} ${padding}]${text.slice(start + core.length)}`;
}

interface Swap {
  original: string;
  pseudo: string;
}

const texts = new WeakMap<Text, Swap>();
const attributes = new WeakMap<Element, Map<string, Swap>>();
/** Each bracketed pseudo string written while on, to the text it stands for. */
const originals = new Map<string, string>();

let on = false;
let observer: MutationObserver | null = null;
let cancelStart: (() => void) | null = null;

/** Is this element, or one it sits in, left alone? */
function skipped(element: Element | null): boolean {
  if (!element) return true;
  return (element as HTMLElement).isContentEditable || element.closest(SKIPPED) !== null;
}

/**
 * A page that reads pseudo text back and writes it again, `textContent +=`
 * say, gets the originals in its place, so the text never wraps twice.
 */
function unwrap(text: string): string {
  let next = text;
  // Every pseudo string ends in its padding and bracket.
  if (!next.includes("·]")) return next;
  for (const [pseudo, original] of originals) {
    if (next.includes(pseudo)) next = next.split(pseudo).join(original);
  }
  return next;
}

/** The pseudo form of `original`, remembered so it can be unwrapped. */
function wrap(original: string): string {
  const pseudo = pseudoText(original);
  if (pseudo !== original) originals.set(pseudo.trim(), original.trim());
  return pseudo;
}

function swapText(node: Text): void {
  const known = texts.get(node);
  // Devknobs' own write, coming back as a mutation.
  if (known && node.data === known.pseudo) return;
  const original = unwrap(node.data);
  const pseudo = wrap(original);
  if (pseudo === original) return;
  texts.set(node, { original, pseudo });
  node.data = pseudo;
}

function swapAttribute(element: Element, name: string): void {
  const read = element.getAttribute(name);
  if (read === null) return;
  let swaps = attributes.get(element);
  const known = swaps?.get(name);
  if (known && read === known.pseudo) return;
  const value = unwrap(read);
  const pseudo = wrap(value);
  if (pseudo === value) return;
  if (!swaps) {
    swaps = new Map();
    attributes.set(element, swaps);
  }
  swaps.set(name, { original: value, pseudo });
  element.setAttribute(name, pseudo);
}

/** Every element and text node under `root`, itself included, minus the skipped subtrees. */
function walk(root: Element, visit: (node: Node) => void): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      node.nodeType === Node.ELEMENT_NODE &&
      ((node as HTMLElement).isContentEditable || (node as Element).matches(SKIPPED))
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
  });
  visit(root);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) visit(node);
}

function swapNode(node: Node): void {
  if (node.nodeType === Node.TEXT_NODE) swapText(node as Text);
  else for (const name of ATTRIBUTES) swapAttribute(node as Element, name);
}

function swapTree(root: Node): void {
  if (root.nodeType === Node.TEXT_NODE) {
    if (!skipped(root.parentElement)) swapText(root as Text);
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE || skipped(root as Element)) return;
  walk(root as Element, swapNode);
}

/** Give back every original still showing its pseudo form. */
function restoreNode(node: Node): void {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node as Text;
    const known = texts.get(text);
    if (known && text.data === known.pseudo) text.data = known.original;
    texts.delete(text);
    return;
  }
  const element = node as Element;
  const swaps = attributes.get(element);
  if (!swaps) return;
  for (const [name, swap] of swaps) {
    if (element.getAttribute(name) === swap.pseudo) element.setAttribute(name, swap.original);
  }
  attributes.delete(element);
}

function onMutations(records: MutationRecord[]): void {
  for (const record of records) {
    if (record.type === "childList") {
      for (const node of Array.from(record.addedNodes)) swapTree(node);
    } else if (record.type === "characterData") {
      const node = record.target as Text;
      if (!skipped(node.parentElement)) swapText(node);
    } else if (record.attributeName) {
      const element = record.target as Element;
      if (!skipped(element)) swapAttribute(element, record.attributeName);
    }
  }
  // What is left came from the writes above.
  observer?.takeRecords();
}

function start(): void {
  cancelStart = null;
  const body = document.body;
  if (!body) return;
  on = true;
  swapTree(body);
  observer = new MutationObserver(onMutations);
  observer.observe(body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ATTRIBUTES,
  });
}

/**
 * Run once the page is loaded and idle. A framework that hydrates server
 * markup compares it with its own render first, and must not find it changed.
 */
function whenIdle(run: () => void): () => void {
  let idle = 0;
  let timer = 0;
  const schedule = () => {
    if (typeof requestIdleCallback === "function") idle = requestIdleCallback(run, { timeout: 1000 });
    else timer = window.setTimeout(run, 200);
  };
  if (document.readyState === "complete") schedule();
  else window.addEventListener("load", schedule, { once: true });
  return () => {
    window.removeEventListener("load", schedule);
    if (idle) cancelIdleCallback(idle);
    clearTimeout(timer);
  };
}

export function apply(value: boolean): void {
  if (!value) {
    reset();
    return;
  }
  if (on || cancelStart) return;
  cancelStart = whenIdle(start);
}

export function reset(): void {
  cancelStart?.();
  cancelStart = null;
  if (!on) return;
  on = false;
  observer?.disconnect();
  observer = null;
  if (document.body) walk(document.body, restoreNode);
  originals.clear();
}
