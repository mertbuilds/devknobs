import { afterEach, describe, expect, test } from "bun:test";
import {
  blurMargin,
  blurPictures,
  copyPage,
  forgetShots,
  marginPlace,
  paintPage,
  shootPage,
  svgUrl,
} from "../src/engine/pageshot";
import * as outlines from "../src/engine/outlines";
import * as spacing from "../src/engine/spacing";

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
  /** What was written into it: a style's rules. */
  text = "";
  set textContent(text: string) {
    this.text = text;
  }
}

/** A document: the frame's, whose copies would load, or one of its own that loads nothing. */
class FakeDocument {
  /** What copies made in it would have set off: a picture loaded again, a handler or a constructor run. */
  static setOff = 0;
  readonly documentElement: FakeNode;
  styleSheets: { cssRules: { cssText: string }[] }[] = [{ cssRules: [{ cssText: "p { color: red }" }] }];
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

  test("takes the rules the knobs wrote into the page along: text spacing's and outlines', as the knobs write them", () => {
    /** What each knob writes into the style it adds to the page, by the style's name. */
    const written = new Map<string, string>();
    const before = Reflect.get(globalThis, "document");
    Reflect.set(globalThis, "document", {
      head: { appendChild() {} },
      querySelector: () => null,
      createElement: () => {
        let name = "";
        return {
          setAttribute: (_attribute: string, value: string) => {
            name = value;
          },
          set textContent(text: string) {
            written.set(name, text);
          },
        };
      },
    });
    try {
      spacing.apply(true);
      outlines.apply(true);
    } finally {
      Reflect.set(globalThis, "document", before);
    }
    const knobs = [written.get("spacing") ?? "", written.get("outlines") ?? ""];
    expect(knobs[0]).toContain("letter-spacing:.12em");
    expect(knobs[1]).toContain("outline:");
    const page = new FakeDocument(true);
    // Each knob's style is a sheet of the page like any other, and a media query a knob rewrote is the rule's own text.
    const rewritten = "@media (min-width: 800px) { p { color: blue } }";
    page.styleSheets = [
      { cssRules: [{ cssText: "p { color: red }" }, { cssText: rewritten }] },
      ...knobs.map((cssText) => ({ cssRules: [{ cssText }] })),
    ];
    const copy = copyPage(frameOf(page)) as unknown as FakeNode | null;
    const style = copy?.querySelector("head")?.children.find((child) => child.tag === "style");
    expect(style?.text.split("\n")).toEqual(["p { color: red }", rewritten, ...knobs]);
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
    expect(blurMargin(1)).toBe(2);
    expect(blurMargin(32)).toBe(64);
    // In whole px, never short.
    expect(blurMargin(1.3)).toBe(3);
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
      // A rough picture of a screen 400 css px wide: a quarter of its px, so a blur 8, 32 and 128 css px wide is 2, 8 and 32 of them.
      const down = blurPictures(shot, 400, true, [8, 32, 128]);
      // Each as long as the picture and its black, in the picture's px, however few px it keeps.
      expect(down.map((picture) => picture.long)).toEqual([200 + 2 * 4, 200 + 2 * 16, 200 + 2 * 64]);
      // Kept whole till 8 px cross the blur, then a quarter of the px each way.
      expect(down.map((picture) => [picture.canvas.width, picture.canvas.height])).toEqual([
        [100, 200 + 2 * 4],
        [100, 200 + 2 * 16],
        [25, (200 + 2 * 64) / 4],
      ]);
      const first = made[0];
      expect(first?.fills).toEqual(["#000"]);
      expect(first?.drawn[0]?.slice(0, 2)).toEqual([0, 4]);
      // Every canvas that was a step on the way is let go of at once: only the three shown keep their px.
      const kept = made.filter((canvas) => canvas.width > 0);
      expect(kept).toHaveLength(3);
      expect(down.every((picture) => kept.some((canvas) => Object.is(canvas, picture.canvas)))).toBe(true);
      expect(made.length).toBeGreaterThan(9);
      made.length = 0;
      const side = blurPictures(shot, 400, false, [8, 32, 128]);
      expect(side.map((picture) => picture.long)).toEqual([100 + 2 * 4, 100 + 2 * 16, 100 + 2 * 64]);
      expect(side.map((picture) => [picture.canvas.width, picture.canvas.height])).toEqual([
        [100 + 2 * 4, 200],
        [100 + 2 * 16, 200],
        [(100 + 2 * 64) / 4, 50],
      ]);
      expect(made[0]?.drawn[0]?.slice(0, 2)).toEqual([4, 0]);
    } finally {
      Reflect.set(globalThis, "document", before);
    }
  });

  test("makes a picture for each blur past the sharp one, the wide ones small, so six take fewer px than four did", () => {
    const made: { width: number; height: number }[] = [];
    const before = Reflect.get(globalThis, "document");
    Reflect.set(globalThis, "document", {
      createElement: () => {
        const canvas = { width: 0, height: 0, getContext: () => ({ fillStyle: "", imageSmoothingQuality: "", fillRect: () => {}, drawImage: () => {} }) };
        made.push(canvas);
        return canvas;
      },
    });
    try {
      // The picture as the browser draws it: a px a css px.
      const shot = document.createElement("canvas");
      shot.width = 951;
      shot.height = 669;
      const blurred = blurPictures(shot, 951, true);
      // 4, 8, 16, 32 and 48 css px wide: whole, whole, a half, a quarter and a sixth of the px each way.
      expect(blurred.map((picture) => picture.canvas.width)).toEqual([951, 951, 476, 238, 159]);
      expect(blurred.map((picture) => picture.long)).toEqual([669 + 16, 669 + 32, 669 + 64, 669 + 128, 669 + 192]);
      const px = (pictures: { canvas: { width: number; height: number } }[]) =>
        pictures.reduce((sum, { canvas }) => sum + canvas.width * canvas.height, 0);
      // The three there were, 8, 32 and 128 css px wide, each whole with its black: 669 + 16, + 64 and + 256 css px long.
      const were = 951 * (3 * 669 + 4 * (8 + 32 + 128));
      expect(px(blurred)).toBeLessThan(0.75 * were);
      // A blur a hand sets as wide as it goes makes two pictures more, and few px more.
      const widest = blurPictures(shot, 951, true, [4, 8, 16, 32, 64, 128, 256]);
      expect(px(widest)).toBeLessThan(1.05 * px(blurred));
      // A step that would not be drawn is no step: a rough picture's px is as wide as the first blur.
      const rough = document.createElement("canvas");
      rough.width = 238;
      rough.height = 167;
      made.length = 0;
      const [same] = blurPictures(rough, 952, true, [4]);
      expect([same?.canvas.width, same?.canvas.height]).toEqual([238, 167 + 4]);
      expect(made).toHaveLength(1);
    } finally {
      Reflect.set(globalThis, "document", before);
    }
  });
});

describe("svgUrl", () => {
  test("makes half an emoji U+FFFD, which encoding would throw on", () => {
    const half = "\u{1F680}".slice(0, 1);
    expect(svgUrl(`<p>${half}</p>`)).toBe(`data:image/svg+xml;charset=utf-8,${encodeURIComponent("<p>\uFFFD</p>")}`);
    expect(svgUrl("<p>\u{1F680}</p>")).toBe(`data:image/svg+xml;charset=utf-8,${encodeURIComponent("<p>\u{1F680}</p>")}`);
  });

  test("does so without toWellFormed too", () => {
    const own = Object.getOwnPropertyDescriptor(String.prototype, "toWellFormed");
    Reflect.deleteProperty(String.prototype, "toWellFormed");
    try {
      const url = svgUrl("a\uD83D b\uDE80 \u{1F680}");
      expect(decodeURIComponent(url.slice(url.indexOf(",") + 1))).toBe("a\uFFFD b\uFFFD \u{1F680}");
    } finally {
      if (own) Object.defineProperty(String.prototype, "toWellFormed", own);
    }
  });
});

describe("paintPage", () => {
  test("paints a page with half an emoji in it, and does not reject", async () => {
    const rect = { left: 0, top: 0, width: 100, height: 200, right: 100, bottom: 200 };
    const doc = { querySelectorAll: () => [], documentElement: {} };
    const view = { innerWidth: 100, innerHeight: 200, scrollX: 0, scrollY: 0, getComputedStyle: () => ({ fontSize: "16px" }) };
    const frame = { contentDocument: doc, contentWindow: view, getBoundingClientRect: () => rect };
    const glass = { getBoundingClientRect: () => rect };
    const root = { getAttribute: () => null, setAttribute() {} };
    const copy = { cloneNode: () => root };
    const pen = { fillStyle: "", fillRect() {}, setTransform() {}, drawImage() {} };
    const canvas = { width: 0, height: 0, getContext: () => pen };
    const sources: string[] = [];
    class FakeImage {
      set src(url: string) {
        sources.push(url);
      }
      decode(): Promise<void> {
        return Promise.resolve();
      }
    }
    const before = ["document", "Image", "XMLSerializer"].map((name) => Reflect.get(globalThis, name));
    Reflect.set(globalThis, "document", { createElement: () => canvas });
    Reflect.set(globalThis, "Image", FakeImage);
    Reflect.set(globalThis, "XMLSerializer", class {
      serializeToString(): string {
        return `<p>${"\u{1F680}".slice(0, 1)}</p>`;
      }
    });
    try {
      const painted = await paintPage(
        frame as unknown as HTMLIFrameElement,
        glass as unknown as HTMLElement,
        { width: 100, height: 200 },
        "#fff",
        copy as unknown as Element,
      );
      expect(painted).toBe(canvas as unknown as HTMLCanvasElement);
      expect(sources[0]).toContain(encodeURIComponent("\uFFFD"));
    } finally {
      for (const [index, name] of ["document", "Image", "XMLSerializer"].entries()) Reflect.set(globalThis, name, before[index]);
    }
  });

  /** Paint a page whose root computes `fontSize`, its copy's root styled `inline`: the drawing's markup, and the style its root got. */
  async function drawn(fontSize: string, inline: string | null): Promise<{ svg: string; style: string }> {
    const rect = { left: 0, top: 0, width: 100, height: 200, right: 100, bottom: 200 };
    const html = {};
    const doc = { querySelectorAll: () => [], documentElement: html };
    const asked: unknown[] = [];
    const view = {
      innerWidth: 100,
      innerHeight: 200,
      scrollX: 0,
      scrollY: 30,
      getComputedStyle: (node: unknown) => {
        asked.push(node);
        return { fontSize };
      },
    };
    const frame = { contentDocument: doc, contentWindow: view, getBoundingClientRect: () => rect };
    const glass = { getBoundingClientRect: () => rect };
    let style = inline;
    const root = {
      getAttribute: () => style,
      setAttribute: (_name: string, value: string) => {
        style = value;
      },
    };
    const pen = { fillStyle: "", fillRect() {}, setTransform() {}, drawImage() {} };
    const sources: string[] = [];
    class FakeImage {
      set src(url: string) {
        sources.push(url);
      }
      decode(): Promise<void> {
        return Promise.resolve();
      }
    }
    const names = ["document", "Image", "XMLSerializer"];
    const before = names.map((name) => Reflect.get(globalThis, name));
    Reflect.set(globalThis, "document", { createElement: () => ({ width: 0, height: 0, getContext: () => pen }) });
    Reflect.set(globalThis, "Image", FakeImage);
    Reflect.set(globalThis, "XMLSerializer", class {
      serializeToString(): string {
        return `<html style="${style ?? ""}"></html>`;
      }
    });
    try {
      await paintPage(
        frame as unknown as HTMLIFrameElement,
        glass as unknown as HTMLElement,
        { width: 100, height: 200 },
        "#fff",
        { cloneNode: () => root } as unknown as Element,
      );
    } finally {
      for (const [index, name] of names.entries()) Reflect.set(globalThis, name, before[index]);
    }
    // The size is the live page's root's, as it computes.
    expect(asked).toEqual([html]);
    const url = sources[0] ?? "";
    return { svg: decodeURIComponent(url.slice(url.indexOf(",") + 1)), style: style ?? "" };
  }

  test("sizes the drawing's root as the text size knob has the page's, so every rem in it is the page's", async () => {
    // The knob writes the root's size inline, as it is here: 20px for a setting of 20.
    const { svg, style } = await drawn("20px", "font-size: 20px !important;");
    expect(svg).toStartWith('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="200" style="font-size:20px !important">');
    // The copy's own root keeps the knob's size, and is scrolled as the frame is after it.
    expect(style).toBe("font-size: 20px !important;;font-size:20px !important;position:relative;left:0px;top:-30px");
    expect(svg).toContain(`<foreignObject width="100%" height="100%"><html style="${style}">`);
  });

  test("sizes both roots in px where the page sizes its own in a rule, a share of what is above it", async () => {
    // `html { font-size: 62.5% }` computes 10px on the page: taken against the drawing's root again, it would be 6.25px.
    const { svg, style } = await drawn("10px", null);
    expect(svg).toContain('height="200" style="font-size:10px !important">');
    expect(style).toBe(";font-size:10px !important;position:relative;left:0px;top:-30px");
  });
});
