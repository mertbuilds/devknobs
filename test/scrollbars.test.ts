import { afterEach, describe, expect, test } from "bun:test";
import { apply, CSS, equip, reset } from "../src/engine/scrollbars";

interface FakeStyle {
  name: string;
  textContent: string;
  remove(): void;
}

/** A document that keeps the devknobs style elements put in it, with a root or not yet. */
function fakeDocument(url: string, rooted = true) {
  const styles: FakeStyle[] = [];
  const root = {
    appendChild(style: FakeStyle) {
      styles.push(style);
      style.remove = () => {
        styles.splice(styles.indexOf(style), 1);
      };
    },
  };
  const doc = {
    URL: url,
    styles,
    head: null,
    documentElement: rooted ? root : null,
    root,
    querySelector(selector: string) {
      return styles.find((style) => selector === `style[data-devknobs="${style.name}"]`) ?? null;
    },
    createElement() {
      const style: FakeStyle = { name: "", textContent: "", remove() {} };
      return Object.assign(style, {
        setAttribute(_: string, value: string) {
          style.name = value;
        },
      });
    },
  };
  return doc;
}

type FakeDocument = ReturnType<typeof fakeDocument>;

function fakeWindow(doc: FakeDocument) {
  return { document: doc };
}

function equipped(view: { document: FakeDocument }): void {
  equip(view as unknown as Window);
}

/** Let the task the wait for the next document looks in go by. */
function task(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 20));
}

const realObserver = globalThis.MutationObserver;

afterEach(() => {
  Reflect.deleteProperty(globalThis, "document");
  if (realObserver) globalThis.MutationObserver = realObserver;
  else Reflect.deleteProperty(globalThis, "MutationObserver");
});

describe("scrollbars", () => {
  test("hides every scroller's scrollbar, the root's too, in both ways browsers take", () => {
    expect(CSS).toContain("*{scrollbar-width:none!important}");
    expect(CSS).toContain("::-webkit-scrollbar{display:none!important}");
  });

  test("puts one sheet in the page while on and takes it away when off", () => {
    const doc = fakeDocument("https://app.test/");
    Object.defineProperty(globalThis, "document", { configurable: true, value: doc });
    apply(true);
    apply(true);
    expect(doc.styles.map((style) => [style.name, style.textContent])).toEqual([
      ["scrollbars", CSS],
    ]);
    apply(false);
    expect(doc.styles).toEqual([]);
    apply(true);
    reset();
    expect(doc.styles).toEqual([]);
  });
});

describe("equip", () => {
  test("puts the sheet in another window's page, and one only when its copy mounts", () => {
    const doc = fakeDocument("https://app.test/");
    equipped(fakeWindow(doc));
    expect(doc.styles.map((style) => style.textContent)).toEqual([CSS]);
    Object.defineProperty(globalThis, "document", { configurable: true, value: doc });
    apply(true);
    expect(doc.styles).toHaveLength(1);
  });

  test("waits for a page that has no root yet", () => {
    let grown: (() => void) | undefined;
    let disconnected = false;
    globalThis.MutationObserver = class {
      constructor(callback: () => void) {
        grown = callback;
      }
      observe() {}
      disconnect() {
        disconnected = true;
      }
    } as unknown as typeof MutationObserver;
    const doc = fakeDocument("https://app.test/", false);
    equipped(fakeWindow(doc));
    expect(doc.styles).toEqual([]);
    grown?.();
    expect(doc.styles).toEqual([]);
    expect(disconnected).toBe(false);
    doc.documentElement = doc.root;
    grown?.();
    expect(doc.styles.map((style) => style.textContent)).toEqual([CSS]);
    expect(disconnected).toBe(true);
  });

  test("skips the blank document a frame starts with for the page that takes its place", async () => {
    const blank = fakeDocument("about:blank");
    const view = fakeWindow(blank);
    equipped(view);
    const page = fakeDocument("https://app.test/");
    view.document = page;
    await task();
    expect(page.styles.map((style) => style.textContent)).toEqual([CSS]);
    expect(blank.styles).toEqual([]);
  });

  test("leaves a window without a document alone", () => {
    expect(() => equip({} as Window)).not.toThrow();
  });
});
