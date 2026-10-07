import { afterEach, describe, expect, test } from "bun:test";
import { blurMargin, blurPictures, copyPage, forgetShots, marginPlace, shootPage } from "../src/engine/pageshot";

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

describe("blurPictures", () => {
  test("reaches the black under each blur twice its width past the picture's ends", () => {
    expect(blurMargin(0)).toBe(2);
    expect(blurMargin(5)).toBe(64);
  });

  test("lays a blur's picture on the sharp one, its black reaching as far past either end", () => {
    const { start, size } = marginPlace(200, 328);
    expect(start).toBe(-32);
    expect(size).toBe(164);
    // Its picture runs from 0 to 100 percent of the screen.
    expect(start + (size * 64) / 328).toBeCloseTo(0, 6);
    expect(start + (size * (64 + 200)) / 328).toBeCloseTo(100, 6);
    expect(marginPlace(200, 200)).toEqual({ start: 0, size: 100 });
  });

  test("puts the picture on black past its ends along the hinge only, and blurs them together", () => {
    /** Each canvas made, and what was drawn on it, at where. */
    const made: { width: number; height: number; drawn: [number, number, number, number][]; fills: string[] }[] = [];
    const before = Reflect.get(globalThis, "document");
    Reflect.set(globalThis, "document", {
      createElement: () => {
        const canvas = { width: 0, height: 0, drawn: [] as [number, number, number, number][], fills: [] as string[] };
        made.push(canvas);
        const pen = {
          fillStyle: "",
          imageSmoothingQuality: "",
          fillRect: () => canvas.fills.push(pen.fillStyle),
          drawImage: (_from: unknown, x: number, y: number, width = Number.NaN, height = Number.NaN) =>
            canvas.drawn.push([x, y, width, height]),
        };
        return Object.assign(canvas, { getContext: () => pen });
      },
    });
    try {
      const shot = document.createElement("canvas");
      shot.width = 100;
      shot.height = 200;
      made.length = 0;
      // A rough picture of a screen 400 css px wide: a quarter of its px, so each blur's width in css px is halved log2(width / 4) times.
      const down = blurPictures(shot, 400, true);
      expect(down.map((picture) => [picture.width, picture.height])).toEqual([
        [100, 200 + 2 * 4],
        [100, 200 + 2 * 16],
        [100, 200 + 2 * 64],
      ]);
      const first = made[0];
      expect(first?.fills).toEqual(["#000"]);
      expect(first?.drawn[0]?.slice(0, 2)).toEqual([0, 4]);
      made.length = 0;
      const side = blurPictures(shot, 400, false);
      expect(side.map((picture) => [picture.width, picture.height])).toEqual([
        [100 + 2 * 4, 200],
        [100 + 2 * 16, 200],
        [100 + 2 * 64, 200],
      ]);
      expect(made[0]?.drawn[0]?.slice(0, 2)).toEqual([4, 0]);
    } finally {
      Reflect.set(globalThis, "document", before);
    }
  });
});
