import { afterEach, describe, expect, test } from "bun:test";
import {
  blankUrl,
  blurPictures,
  copyPage,
  drawMedia,
  forgetShots,
  paintPage,
  picturesKey,
  type ShotAt,
  shootPage,
  shotKey,
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
      takeRecords(): unknown[] {
        return [];
      }
    }
    const rect = { left: 0, top: 0, width: 100, height: 200, right: 100, bottom: 200 };
    const body = { children: [] };
    const doc = { body, documentElement: {}, querySelectorAll: () => [], createRange: () => ({}), defaultView: {} };
    Reflect.set(doc.defaultView, "MutationObserver", Observer);
    const view = { innerWidth: 100, innerHeight: 200, scrollX: 0, scrollY: 0, getComputedStyle: () => ({ fontSize: "16px" }) };
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
  test("blurs the picture alone, with no black under it, so no blur darkens its ends and each ends where the sharp one does", () => {
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
      const down = blurPictures(shot, 400, [8, 32, 128]);
      // Kept whole till 8 px cross the blur, then a quarter of the px each way: the picture's own shape, nothing past its ends.
      expect(down.map((picture) => [picture.width, picture.height])).toEqual([
        [100, 200],
        [100, 200],
        [25, 50],
      ]);
      // Nothing is filled in under the picture, and each step draws all of the last over all of its own.
      expect(made.flatMap((canvas) => canvas.fills)).toEqual([]);
      expect(made.every((canvas) => canvas.drawn.length === 1 && canvas.drawn[0]?.[0] === 0 && canvas.drawn[0]?.[1] === 0)).toBe(true);
      // Every canvas that was a step on the way is let go of at once: only the three shown keep their px.
      const kept = made.filter((canvas) => canvas.width > 0);
      expect(kept).toHaveLength(3);
      expect(down.every((picture) => kept.some((canvas) => Object.is(canvas, picture)))).toBe(true);
      expect(made.length).toBeGreaterThan(9);
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
      const blurred = blurPictures(shot, 951);
      // 4, 8, 16, 32 and 48 css px wide: whole, whole, a half, a quarter and a sixth of the px each way.
      expect(blurred.map((picture) => picture.width)).toEqual([951, 951, 476, 238, 159]);
      const px = (pictures: { width: number; height: number }[]) => pictures.reduce((sum, { width, height }) => sum + width * height, 0);
      // The three there were, 8, 32 and 128 css px wide, each whole with its black: 669 + 16, + 64 and + 256 css px long.
      const were = 951 * (3 * 669 + 4 * (8 + 32 + 128));
      expect(px(blurred)).toBeLessThan(0.75 * were);
      // A blur a hand sets as wide as it goes makes two pictures more, and few px more.
      const widest = blurPictures(shot, 951, [4, 8, 16, 32, 64, 128, 256]);
      expect(px(widest)).toBeLessThan(1.05 * px(blurred));
      // A step that would not be drawn is no step: a rough picture's px is as wide as the first blur.
      const rough = document.createElement("canvas");
      rough.width = 238;
      rough.height = 167;
      made.length = 0;
      const [same] = blurPictures(rough, 952, [4]);
      expect([same?.width, same?.height]).toEqual([238, 167]);
      // The picture again, but on a canvas of its own: it is shown and faded apart from the sharp one.
      expect(made).toHaveLength(1);
      expect(Object.is(same, rough)).toBe(false);
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

/** What a canvas was asked to draw, each call by its name and what it was given. */
class RecordingPen {
  calls: unknown[][] = [];
  fillStyle = "";
  globalAlpha = 1;
  imageSmoothingEnabled = true;
  /** Was smoothing on as each picture was drawn? */
  smooth: boolean[] = [];
  #note(name: string, args: unknown[]): void {
    this.calls.push([name, ...args]);
  }
  fillRect(...args: unknown[]): void {
    this.#note("fillRect", args);
  }
  setTransform(...args: unknown[]): void {
    this.#note("setTransform", args);
  }
  beginPath(): void {}
  rect(): void {}
  fill(): void {}
  clip(): void {
    this.#note("clip", []);
  }
  roundRect(...args: unknown[]): void {
    this.#note("roundRect", args);
  }
  save(): void {
    this.#note("save", []);
  }
  restore(): void {
    this.imageSmoothingEnabled = true;
    this.#note("restore", []);
  }
  /** A picture is noted by what it shows as it is drawn, as a canvas takes it as it is then. */
  drawImage(source: { currentSrc?: string }, ...args: number[]): void {
    this.smooth.push(this.imageSmoothingEnabled);
    this.#note("drawImage", [source.currentSrc ?? source, ...args.map((value) => Math.round(value * 1e3) / 1e3)]);
  }
  named(name: string): unknown[][] {
    return this.calls.filter(([call]) => call === name).map(([, ...args]) => args);
  }
}

/** A canvas of its own each time one is made, so one picture is told from another. */
interface FakeCanvas {
  width: number;
  height: number;
  pen: RecordingPen;
  getContext(): RecordingPen;
}

/** Every canvas made while `run` runs, till what it gives settles, in the order they were made. */
function withCanvases<Result>(run: (made: FakeCanvas[]) => Result): Result {
  const made: FakeCanvas[] = [];
  const before = Reflect.get(globalThis, "document");
  Reflect.set(globalThis, "document", {
    createElement: () => {
      const pen = new RecordingPen();
      const canvas: FakeCanvas = { width: 0, height: 0, pen, getContext: () => pen };
      made.push(canvas);
      return canvas;
    },
  });
  const restore = () => {
    Reflect.set(globalThis, "document", before);
  };
  let result: Result;
  try {
    result = run(made);
  } catch (error) {
    restore();
    throw error;
  }
  if (result instanceof Promise) return result.finally(restore) as Result;
  restore();
  return result;
}

/** How a full-bleed picture is styled, as it computes: it covers its box from the middle. */
const BLEED = {
  display: "block",
  position: "static",
  opacity: "1",
  visibility: "visible",
  backgroundColor: "rgba(0, 0, 0, 0)",
  color: "rgb(0, 0, 0)",
  objectFit: "cover",
  objectPosition: "50% 50%",
  imageRendering: "auto",
  borderLeftWidth: "0px",
  borderRightWidth: "0px",
  borderTopWidth: "0px",
  borderBottomWidth: "0px",
  paddingLeft: "0px",
  paddingRight: "0px",
  paddingTop: "0px",
  paddingBottom: "0px",
  borderTopLeftRadius: "0px",
  borderTopRightRadius: "0px",
  borderBottomRightRadius: "0px",
  borderBottomLeftRadius: "0px",
};

/** The Duo's two screens, and the picture a full-bleed page shows on each. */
const COVER = { width: 466, height: 678, src: "cover.jpg", natural: [774, 1125] as const };
const INNER = { width: 951, height: 669, src: "inner.jpg", natural: [1600, 1125] as const };

/**
 * A page whose whole content is one picture that covers its viewport, in a
 * frame that fills its screen, as the Duo shows one with no browser bars: as
 * far as a picture of it reads it. What the test changes about it shows the
 * next time it is read.
 */
function fullBleed() {
  const page = { ...COVER, scrollY: 0, dpr: 3, text: "16px", style: { ...BLEED }, other: [] as unknown[], drawn: 1 };
  /** What watches the page for changes, and those it has not been told of yet. */
  const watchers: { pending: unknown[] }[] = [];
  class Watcher {
    pending: unknown[] = [];
    constructor() {
      watchers.push(this);
    }
    observe(): void {}
    disconnect(): void {}
    takeRecords(): unknown[] {
      return this.pending.splice(0);
    }
  }
  const box = () => ({ left: 0, top: 0, width: page.width, height: page.height, right: page.width, bottom: page.height });
  const asked: unknown[] = [];
  const picture = {
    complete: true,
    get naturalWidth() {
      return page.natural[0];
    },
    get naturalHeight() {
      return page.natural[1];
    },
    get currentSrc() {
      return page.src;
    },
    hasAttribute: () => false,
    closest: () => null,
    getBoundingClientRect: box,
    childNodes: [],
    children: [],
  };
  /** A box devknobs put on the page, red, which a picture of the page leaves out. */
  const ours = {
    hasAttribute: (name: string) => name === "data-devknobs",
    getBoundingClientRect: box,
    childNodes: [],
    children: [],
  };
  const html = {};
  const doc = {
    body: { children: [picture, ours] },
    documentElement: html,
    querySelectorAll: () => [picture, ...page.other],
    createRange: () => ({}),
    defaultView: { MutationObserver: Watcher },
  };
  const view = {
    get innerWidth() {
      return page.width;
    },
    get innerHeight() {
      return page.height;
    },
    scrollX: 0,
    get scrollY() {
      return page.scrollY;
    },
    get devicePixelRatio() {
      return page.dpr;
    },
    getComputedStyle: (node: unknown) => {
      asked.push(node);
      if (node === html) return { fontSize: page.text };
      return node === ours ? { ...BLEED, backgroundColor: "rgb(255, 0, 0)" } : page.style;
    },
  };
  /** The screen in the window, the device drawn `page.drawn` times its size, a little off the window's corner. */
  const screen = () => {
    const [left, top, width, height] = [40, 30, page.width, page.height].map((value) => value * page.drawn);
    return { left, top, width, height, right: (left ?? 0) + (width ?? 0), bottom: (top ?? 0) + (height ?? 0) };
  };
  const frame = { contentDocument: doc, contentWindow: view, getBoundingClientRect: screen };
  const glass = { getBoundingClientRect: screen };
  /** A rough picture of it on the screen it fills now. */
  const shoot = (layout = "") =>
    shootPage(frame as unknown as HTMLIFrameElement, glass as unknown as HTMLElement, { width: page.width, height: page.height }, "#000", layout);
  return { page, picture, ours, asked, watchers, frame, glass, shoot };
}

describe("shotKey", () => {
  const at: ShotAt = {
    size: { width: 466, height: 678 },
    color: "#000",
    layout: "iphone-duo closed portrait off true",
    frame: { x: 0, y: 0, width: 466 },
    view: { width: 466, height: 678 },
    scroll: { x: 0, y: 0 },
    dpr: 3,
    text: "16px",
    pictures: "cover.jpg@774x1125",
  };

  test("is the same for the same screen, page and pictures", () => {
    expect(shotKey({ ...at, size: { ...at.size }, view: { ...at.view } })).toBe(shotKey(at));
  });

  test("tells the folded screen's picture from the open screen's, by every part that differs", () => {
    const open: ShotAt = {
      ...at,
      size: { width: 951, height: 669 },
      layout: "iphone-duo open landscape off true",
      frame: { x: 0, y: 0, width: 951 },
      view: { width: 951, height: 669 },
    };
    expect(shotKey(open)).not.toBe(shotKey(at));
    // Any one of them alone is enough.
    for (const part of ["size", "layout", "frame", "view"] as const) expect(shotKey({ ...at, [part]: open[part] })).not.toBe(shotKey(at));
  });

  test("changes with the device pixel ratio, the text size, the scroll, the color, and what the pictures show", () => {
    const others: Partial<ShotAt>[] = [
      { dpr: 2 },
      { text: "20px" },
      { scroll: { x: 0, y: 40 } },
      { scroll: { x: 40, y: 0 } },
      { color: "#fff" },
      { pictures: "inner.jpg@1600x1125" },
      { pictures: "cover.jpg@0x0" },
    ];
    const keys = new Set([shotKey(at), ...others.map((other) => shotKey({ ...at, ...other }))]);
    expect(keys.size).toBe(others.length + 1);
  });
});

describe("picturesKey", () => {
  const image = (currentSrc: string, naturalWidth: number, naturalHeight: number) => ({ currentSrc, naturalWidth, naturalHeight });
  const pageOf = (nodes: unknown[]) => ({ querySelectorAll: () => nodes }) as unknown as Document;

  test("names each picture by its address and its size as made, so another source or one loaded since shows", () => {
    expect(picturesKey(pageOf([image("cover.jpg", 774, 1125)]))).toBe("9:cover.jpg@774x1125");
    // A picture as data is told by its length and its end, not carried whole.
    const data = (fill: string) => `data:image/png;base64,${fill.repeat(5000)}`;
    expect(picturesKey(pageOf([image(data("A"), 8, 8)]))?.length).toBeLessThan(100);
    expect(picturesKey(pageOf([image(data("A"), 8, 8)]))).not.toBe(picturesKey(pageOf([image(data("B"), 8, 8)])));
    expect(picturesKey(pageOf([image(data("A"), 8, 8)]))).not.toBe(picturesKey(pageOf([image(`${data("A")}A`, 8, 8)])));
    expect(picturesKey(pageOf([image("cover.jpg", 0, 0)]))).not.toBe(picturesKey(pageOf([image("cover.jpg", 774, 1125)])));
    expect(picturesKey(pageOf([image("inner.jpg", 1600, 1125)]))).not.toBe(picturesKey(pageOf([image("cover.jpg", 774, 1125)])));
    expect(picturesKey(pageOf([]))).toBe("");
  });

  test("has none for a page with a video or a drawing, which may show something else any frame", () => {
    expect(picturesKey(pageOf([image("a.jpg", 1, 1), { videoWidth: 10, readyState: 4 }]))).toBeNull();
    expect(picturesKey(pageOf([{ width: 300, height: 150 }]))).toBeNull();
  });
});

describe("a rough picture kept", () => {
  /** Lay the page out for one of the Duo's screens, with the picture it shows there. */
  const lay = (page: ReturnType<typeof fullBleed>["page"], screen: typeof COVER | typeof INNER) => Object.assign(page, screen);

  test("is given again while the page, its screen and its pictures stay as they are", () => {
    withCanvases(() => {
      const { shoot } = fullBleed();
      const first = shoot();
      expect(first).not.toBeNull();
      expect(shoot()).toBe(first);
    });
  });

  test("of the folded screen is never given for the open one, nor the open one's for the folded", () => {
    withCanvases(() => {
      const { page, shoot } = fullBleed();
      const folded = shoot("closed");
      lay(page, INNER);
      const open = shoot("open");
      expect(open).not.toBe(folded);
      expect([open?.width, open?.height]).toEqual([Math.round(951 / 4), Math.round(669 / 4)]);
      lay(page, COVER);
      expect(shoot("closed")).toBe(folded);
      lay(page, INNER);
      expect(shoot("open")).toBe(open);
    });
  });

  test("is not given for the open screen while the page still shows the folded screen's picture there, as it does till its scripts hear", () => {
    withCanvases(() => {
      const { page, shoot } = fullBleed();
      // The frame is laid out open a moment, the page's picture not yet picked for it.
      Object.assign(page, { width: INNER.width, height: INNER.height });
      const ahead = shoot("open");
      // Then the page picks the open screen's, with no change to the page a watcher is told of.
      lay(page, INNER);
      expect(shoot("open")).not.toBe(ahead);
    });
  });

  test("is taken again once the device pixel ratio, the text size, the scroll or the knobs it is laid out by change", () => {
    withCanvases(() => {
      const { page, shoot } = fullBleed();
      const first = shoot("closed");
      // One at a time: each alone is enough.
      for (const change of [{ dpr: 2 }, { dpr: 3, text: "20px" }, { text: "16px", scrollY: 40 }]) {
        Object.assign(page, change);
        expect(shoot("closed")).not.toBe(first);
      }
      Object.assign(page, { scrollY: 0 });
      expect(shoot("closed")).toBe(first);
      expect(shoot("closed minimized")).not.toBe(first);
    });
  });

  test("is given again however large the device is drawn, as a fold draws it smaller or larger on its way", () => {
    withCanvases((made) => {
      const { page, shoot } = fullBleed();
      const first = shoot();
      // A third of its size, where no px of the window comes out even.
      page.drawn = 1 / 3;
      expect(shoot()).toBe(first);
      page.drawn = 0.77;
      expect(shoot()).toBe(first);
      // And one taken there is the same picture: the page's css px on the screen's, whatever the window's.
      forgetShots();
      shoot();
      expect(made[1]?.pen.named("setTransform")).toEqual(made[0]?.pen.named("setTransform"));
    });
  });

  test("is dropped once the page has changed, also where the watcher has not been told of it yet", () => {
    withCanvases(() => {
      const { watchers, shoot } = fullBleed();
      const first = shoot();
      expect(watchers.length).toBe(1);
      // A change in this same task: the watcher holds it, and is told only later.
      watchers[0]?.pending.push({});
      const second = shoot();
      expect(second).not.toBe(first);
      expect(shoot()).toBe(second);
    });
  });

  test("is never kept of a page with a video or a drawing on it", () => {
    withCanvases(() => {
      const { page, shoot } = fullBleed();
      page.other = [{ width: 300, height: 150, hasAttribute: () => false }];
      expect(shoot()).not.toBe(shoot());
    });
  });
});

describe("the page's own pictures, drawn by hand", () => {
  const rect = (left: number, top: number, width: number, height: number) =>
    ({ left, top, width, height, right: left + width, bottom: top + height }) as DOMRect;
  const style = (over: Partial<typeof BLEED>) => ({ ...BLEED, ...over }) as unknown as CSSStyleDeclaration;
  const pen = () => new RecordingPen();
  const draw = (to: RecordingPen, natural: readonly [number, number], box: DOMRect, over: Partial<typeof BLEED> = {}) =>
    drawMedia(to as unknown as CanvasRenderingContext2D, { source: { currentSrc: "a.jpg" } as unknown as CanvasImageSource, width: natural[0], height: natural[1] }, box, style(over));

  test("a picture that covers its box is cut to it, not squeezed into it", () => {
    const to = pen();
    // The folded screen's picture in the open screen's box: 951 / 774 times as large both ways, its top and bottom cut.
    draw(to, COVER.natural, rect(0, 0, 951, 669));
    expect(to.named("drawImage")).toEqual([["a.jpg", 0, 290.257, 774, 544.486, 0, 0, 951, 669]]);
    expect(to.named("clip")).toEqual([]);
  });

  test("one that is contained, kept its own size or put off the middle goes where the page shows it", () => {
    const to = pen();
    draw(to, [800, 200], rect(10, 20, 200, 100), { objectFit: "contain" });
    draw(to, [50, 20], rect(10, 20, 200, 100), { objectFit: "none", objectPosition: "100% 0%" });
    draw(to, [800, 200], rect(10, 20, 200, 100), { objectFit: "fill" });
    expect(to.named("drawImage")).toEqual([
      ["a.jpg", 0, 0, 800, 200, 10, 45, 200, 50],
      ["a.jpg", 0, 0, 50, 20, 160, 20, 50, 20],
      ["a.jpg", 0, 0, 800, 200, 10, 20, 200, 100],
    ]);
  });

  test("lies inside the element's border and padding, within its round corners less those", () => {
    const to = pen();
    draw(to, [100, 100], rect(0, 0, 120, 140), {
      objectFit: "fill",
      borderLeftWidth: "2px",
      borderRightWidth: "2px",
      borderTopWidth: "2px",
      borderBottomWidth: "2px",
      paddingLeft: "8px",
      paddingRight: "8px",
      paddingTop: "18px",
      paddingBottom: "18px",
      borderTopLeftRadius: "30px",
      borderTopRightRadius: "50%",
      borderBottomRightRadius: "30px 40px",
      borderBottomLeftRadius: "4px",
    });
    expect(to.named("drawImage")).toEqual([["a.jpg", 0, 0, 100, 100, 10, 20, 100, 100]]);
    expect(to.named("roundRect")).toEqual([
      [10, 20, 100, 100, [{ x: 20, y: 10 }, { x: 50, y: 50 }, { x: 20, y: 20 }, { x: 0, y: 0 }]],
    ]);
    // Cut to them for this picture only.
    expect(to.calls.map(([name]) => name)).toEqual(["save", "roundRect", "clip", "drawImage", "restore"]);
  });

  test("is drawn px for px where the page asks for that, and smooth again after", () => {
    const to = pen();
    draw(to, [10, 10], rect(0, 0, 100, 100), { imageRendering: "pixelated" });
    draw(to, [10, 10], rect(0, 0, 100, 100));
    expect(to.smooth).toEqual([false, true]);
  });

  test("a rough picture draws them so too, and leaves out what devknobs put on the page", () => {
    withCanvases((made) => {
      const { page, ours, asked, shoot } = fullBleed();
      // The open screen, the page still showing the folded screen's picture on it.
      Object.assign(page, { width: INNER.width, height: INNER.height });
      shoot();
      const drawn = made[0]?.pen;
      expect(drawn?.named("drawImage")).toEqual([["cover.jpg", 0, 290.257, 774, 544.486, 0, 0, 951, 669]]);
      // Its box is never looked at, so none of it is painted: only the screen's own color is filled.
      expect(asked).not.toContain(ours);
      expect(drawn?.named("fillRect").length).toBe(1);
    });
  });
});

describe("paintPage, with a picture on the page", () => {
  test("draws the page's pictures as they are when it is asked, not as they are once the drawing of the page is in", async () => {
    const { page, frame, glass } = fullBleed();
    Object.assign(page, INNER);
    let decoded: () => void = () => {};
    const decode = new Promise<void>((resolve) => {
      decoded = resolve;
    });
    class FakeImage {
      currentSrc = "the drawing of the page";
      src = "";
      decode(): Promise<void> {
        return decode;
      }
    }
    const names = ["Image", "XMLSerializer"];
    const before = names.map((name) => Reflect.get(globalThis, name));
    Reflect.set(globalThis, "Image", FakeImage);
    Reflect.set(globalThis, "XMLSerializer", class {
      serializeToString(): string {
        return "<html></html>";
      }
    });
    const root = { getAttribute: () => null, setAttribute() {} };
    try {
      await withCanvases(async (made) => {
        const painted = paintPage(
          frame as unknown as HTMLIFrameElement,
          glass as unknown as HTMLElement,
          { width: 951, height: 669 },
          "#000",
          { cloneNode: () => root } as unknown as Element,
        );
        // Drawn already, on a canvas of their own: the open screen's picture, whole in its box.
        expect(made.length).toBe(1);
        expect(made[0]?.pen.named("drawImage")).toEqual([["inner.jpg", 0.392, 0, 1599.215, 1125, 0, 0, 951, 669]]);
        // A fold lays the frame out for the folded screen meanwhile, and the page shows that screen's picture.
        Object.assign(page, COVER);
        decoded();
        const canvas = (await painted) as unknown as FakeCanvas | null;
        expect(canvas).toBe(made[1] ?? null);
        // The drawing of the page, then the pictures as they were taken: nothing of the page as it is by now.
        const over = made[0];
        expect(canvas?.pen.named("drawImage")).toEqual([
          ["the drawing of the page", 0, 0, 951, 669],
          [over, 0, 0],
        ]);
        expect(made[0]?.pen.named("drawImage").length).toBe(1);
      });
    } finally {
      for (const [index, name] of names.entries()) Reflect.set(globalThis, name, before[index]);
    }
  });
});

/** An element of a page as far as a copy of it reads one: its name, what is set on it, and what it holds. */
class Tag {
  children: Tag[] = [];
  parentElement: Tag | null = null;
  readonly attributes = new Map<string, string>();
  /** A picture's state, where it is one of the live page's. */
  complete = false;
  naturalWidth = 0;
  naturalHeight = 0;
  text = "";
  constructor(
    readonly localName: string,
    attributes: Record<string, string> = {},
    children: Tag[] = [],
  ) {
    for (const [name, value] of Object.entries(attributes)) this.attributes.set(name, value);
    this.append(...children);
  }
  set textContent(text: string) {
    this.text = text;
  }
  append(...nodes: Tag[]): void {
    for (const node of nodes) {
      node.parentElement = this;
      this.children.push(node);
    }
  }
  remove(): void {
    const holder = this.parentElement;
    if (holder) holder.children = holder.children.filter((node) => node !== this);
    this.parentElement = null;
  }
  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }
  all(): Tag[] {
    return this.children.flatMap((child) => [child, ...child.all()]);
  }
  /** By names and by attributes that are set, any of a list. */
  querySelectorAll(selector: string): Tag[] {
    const parts = selector.split(",").map((part) => part.trim());
    return this.all().filter((node) => parts.some((part) => (part.startsWith("[") ? node.attributes.has(part.slice(1, -1)) : node.localName === part)));
  }
  querySelector(selector: string): Tag | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }
  clone(): Tag {
    return new Tag(this.localName, Object.fromEntries(this.attributes), this.children.map((child) => child.clone()));
  }
  /** A picture that has loaded, `width` by `height` px as made. */
  loaded(width: number, height: number): Tag {
    this.complete = true;
    this.naturalWidth = width;
    this.naturalHeight = height;
    return this;
  }
}

describe("copyPage, of a page with pictures and with what devknobs put on it", () => {
  /** The page, and its copy. */
  function copied(body: Tag[]): { live: Tag; copy: Tag } {
    const live = new Tag("html", {}, [new Tag("head", {}, [new Tag("style", { "data-devknobs": "outlines" })]), new Tag("body", {}, body)]);
    const inert = { importNode: (node: Tag) => node.clone(), createElement: (name: string) => new Tag(name) };
    const doc = { documentElement: live, styleSheets: [], implementation: { createHTMLDocument: () => inert } };
    const copy = copyPage({ contentDocument: doc } as unknown as HTMLIFrameElement) as unknown as Tag | null;
    if (!copy) throw new Error("the page was not copied");
    return { live, copy };
  }

  test("holds nothing devknobs put on the page: its hosts go, as its styles do, whose rules are in the copy's own", () => {
    const { live, copy } = copied([
      new Tag("main", {}, [new Tag("p")]),
      new Tag("div", { "data-devknobs": "touch-pointer" }, [new Tag("span")]),
      new Tag("div", { "data-devknobs": "overflow" }),
      new Tag("script"),
    ]);
    expect(copy.querySelectorAll("[data-devknobs]")).toEqual([]);
    expect(copy.all().map((node) => node.localName)).toEqual(["head", "style", "body", "main", "p"]);
    // The one style left is the copy's own, with the page's rules.
    expect(copy.querySelector("style")?.attributes.has("data-devknobs")).toBe(false);
    // The page itself keeps all of it.
    expect(live.querySelectorAll("[data-devknobs]").length).toBe(3);
  });

  test("gives each picture that has loaded a picture of nothing as large in its place, so the browser draws no box for a missing one", () => {
    const { live, copy } = copied([
      new Tag("picture", {}, [
        new Tag("source", { media: "(orientation: landscape), (width > 600px)", srcset: "inner.jpg" }),
        new Tag("img", { src: "cover.jpg", srcset: "cover@2x.jpg 2x", sizes: "100vw", loading: "lazy", alt: "lock screen" }).loaded(1600, 1125),
      ]),
      new Tag("img", { src: "late.jpg" }),
    ]);
    const [first, late] = copy.querySelectorAll("img");
    expect(first?.attributes.get("src")).toBe(blankUrl(1600, 1125));
    expect(decodeURIComponent(blankUrl(1600, 1125))).toBe('data:image/svg+xml;charset=utf-8,<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1125"/>');
    // Nothing is left to pick another source by.
    expect([...(first?.attributes.keys() ?? [])].sort()).toEqual(["alt", "src"]);
    expect(copy.querySelectorAll("source")).toEqual([]);
    // One that has not loaded is as the page shows it: missing.
    expect(late?.attributes.get("src")).toBe("late.jpg");
    // And the page's own are untouched.
    expect(live.querySelector("img")?.attributes.get("src")).toBe("cover.jpg");
    expect(live.querySelectorAll("source").length).toBe(1);
  });
});
