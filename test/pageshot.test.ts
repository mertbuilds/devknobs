import { afterEach, describe, expect, test } from "bun:test";
import { copyPage, forgetShots, shootPage } from "../src/engine/pageshot";

/** An element as far as a copy of the page reads one, which counts what it sets off. */
class FakeNode {
  children: FakeNode[] = [];
  removed = false;
  constructor(
    readonly tag: string,
    readonly owner: FakeDocument,
  ) {}
  querySelectorAll(): FakeNode[] {
    return [];
  }
  querySelector(selector: string): FakeNode | null {
    return this.children.find((child) => child.tag === selector) ?? null;
  }
  append(...nodes: FakeNode[]): void {
    this.children.push(...nodes);
  }
  remove(): void {
    this.removed = true;
  }
  set textContent(_text: string) {}
}

/** A document: the frame's, whose copies would load, or one of its own that loads nothing. */
class FakeDocument {
  /** What copies made in it would have set off: a picture loaded again, a handler or a constructor run. */
  static setOff = 0;
  readonly documentElement: FakeNode;
  readonly styleSheets: { cssRules: { cssText: string }[] }[] = [{ cssRules: [{ cssText: "p { color: red }" }] }];
  readonly implementation = { createHTMLDocument: () => new FakeDocument(false) };
  constructor(readonly live: boolean) {
    this.documentElement = new FakeNode("html", this);
    this.documentElement.append(new FakeNode("head", this), new FakeNode("body", this));
    // The live page's root clones into the live page, where its pictures load and its elements construct.
    Reflect.set(this.documentElement, "cloneNode", () => {
      if (this.live) FakeDocument.setOff += 3;
      return this.copyOf(this.documentElement);
    });
  }
  copyOf(node: FakeNode): FakeNode {
    const copy = new FakeNode(node.tag, this);
    copy.append(...node.children.map((child) => this.copyOf(child)));
    return copy;
  }
  importNode(node: FakeNode): FakeNode {
    if (this.live) FakeDocument.setOff += 3;
    return this.copyOf(node);
  }
  createElement(tag: string): FakeNode {
    return new FakeNode(tag, this);
  }
}

function frameOf(doc: FakeDocument | null): HTMLIFrameElement {
  return { contentDocument: doc } as unknown as HTMLIFrameElement;
}

afterEach(() => {
  FakeDocument.setOff = 0;
  forgetShots();
});

describe("copyPage", () => {
  test("copies the page in a document of its own, so its pictures and handlers do not run again", () => {
    const page = new FakeDocument(true);
    const copy = copyPage(frameOf(page)) as unknown as FakeNode | null;
    expect(copy?.owner).not.toBe(page);
    expect(copy?.owner.live).toBe(false);
    expect(FakeDocument.setOff).toBe(0);
    // Its styles come along inline, made in the copy's own document too.
    const style = copy?.querySelector("head")?.children.find((child) => child.tag === "style");
    expect(style?.owner).toBe(copy?.owner);
  });

  test("has nothing to copy without a page", () => {
    expect(copyPage(frameOf(null))).toBeNull();
  });
});

describe("forgetShots", () => {
  test("stops watching the page it last took a picture of", () => {
    let watching = 0;
    const observers: { disconnect: () => void }[] = [];
    class Observer {
      constructor() {
        observers.push(this);
      }
      observe(): void {
        watching++;
      }
      disconnect(): void {
        watching--;
      }
    }
    const rect = { left: 0, top: 0, width: 100, height: 200, right: 100, bottom: 200 };
    const body = { children: [] };
    const doc = { body, images: [], querySelectorAll: () => [], createRange: () => ({}), defaultView: {} };
    Reflect.set(doc.defaultView, "MutationObserver", Observer);
    const view = { innerWidth: 100, innerHeight: 200, scrollX: 0, scrollY: 0 };
    const frame = { contentDocument: doc, contentWindow: view, getBoundingClientRect: () => rect };
    const glass = { getBoundingClientRect: () => rect };
    const pen = { fillRect() {}, setTransform() {}, beginPath() {}, rect() {}, clip() {} };
    const canvas = { width: 0, height: 0, getContext: () => pen };
    const before = Reflect.get(globalThis, "document");
    Reflect.set(globalThis, "document", { createElement: () => canvas });
    try {
      shootPage(
        frame as unknown as HTMLIFrameElement,
        glass as unknown as HTMLElement,
        { width: 100, height: 200 },
        "#fff",
      );
    } finally {
      Reflect.set(globalThis, "document", before);
    }
    expect(observers.length).toBe(1);
    expect(watching).toBe(1);
    forgetShots();
    expect(watching).toBe(0);
  });
});
