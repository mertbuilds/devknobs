import { afterEach, describe, expect, test } from "bun:test";
import { type BarsKnobs, barsFor, glassOf } from "../src/engine/barshot";
import { type Glued, gluedOf, type Picture } from "../src/engine/foldpage";

const DUO: Omit<BarsKnobs, "posture" | "orientation" | "browser"> = { device: "iphone-duo", edgeToEdge: false };
const HOST = "knobs.localhost";

/** The glass the bars blur the page under on the Duo, held as `orientation`, `posture`, the browser as `browser`. */
function glass(posture: BarsKnobs["posture"], orientation: BarsKnobs["orientation"], browser: BarsKnobs["browser"], minimized: boolean) {
  const bars = barsFor({ ...DUO, posture, orientation, browser }, minimized);
  return bars && glassOf(bars, HOST);
}

describe("the bars drawn into the picture of a screen", () => {
  test("are none with the browser off, on either screen, held either way", () => {
    for (const posture of ["closed", "open"] as const) {
      for (const orientation of ["portrait", "landscape"] as const) {
        expect(barsFor({ ...DUO, posture, orientation, browser: "off" }, false)).toBeNull();
      }
    }
  });

  test("are laid out for the cover screen and the inner one each, as each shows them", () => {
    const cover = barsFor({ ...DUO, posture: "closed", orientation: "portrait", browser: "compact" }, false);
    const inner = barsFor({ ...DUO, posture: "open", orientation: "portrait", browser: "compact" }, false);
    expect(cover?.screen.id).toBe("iphone-duo-closed");
    expect(inner?.screen.id).toBe("iphone-duo-open");
    expect(glass("closed", "portrait", "compact", false)).toEqual([
      { rect: { x: 34, y: 596, width: 48, height: 48 }, radius: 24 },
      { rect: { x: 90, y: 596, width: 286, height: 48 }, radius: 24 },
      { rect: { x: 384, y: 596, width: 48, height: 48 }, radius: 24 },
    ]);
    expect(glass("open", "portrait", "compact", false)).toEqual([
      { rect: { x: 34, y: 869, width: 48, height: 48 }, radius: 24 },
      { rect: { x: 90, y: 869, width: 489, height: 48 }, radius: 24 },
      { rect: { x: 587, y: 869, width: 48, height: 48 }, radius: 24 },
    ]);
  });

  test("blur under Bottom's card but not under the field inside it", () => {
    expect(glass("closed", "portrait", "bottom", false)).toEqual([{ rect: { x: 14, y: 536, width: 438, height: 128 }, radius: 40 }]);
    expect(glass("open", "portrait", "bottom", false)).toEqual([{ rect: { x: 14, y: 809, width: 641, height: 128 }, radius: 40 }]);
  });

  test("blur under Top's address bar and its toolbar", () => {
    expect(glass("closed", "portrait", "top", false)?.map((pane) => pane.rect.y)).toEqual([82, 602]);
    expect(glass("open", "portrait", "top", false)?.map((pane) => pane.rect.y)).toEqual([40, 875]);
  });

  test("minimized, blur only under the pill as wide as the host sets in it, its capsules faded out", () => {
    for (const browser of ["compact", "bottom"] as const) {
      const [pill, ...rest] = glass("closed", "portrait", browser, true) ?? [];
      expect(rest).toEqual([]);
      expect(pill?.radius).toBe(16);
      expect(pill?.rect.y).toBe(632);
      // Centered on the screen.
      expect((pill?.rect.x ?? 0) + (pill?.rect.width ?? 0) / 2).toBe(466 / 2);
    }
    expect(glass("open", "portrait", "compact", true)?.[0]?.rect.y).toBe(905);
  });

  test("held across, are one row at the top, gone once minimized", () => {
    expect(glass("open", "landscape", "compact", false)?.map((pane) => pane.rect.y)).toEqual([10, 10, 10, 10]);
    expect(glass("closed", "landscape", "bottom", true)).toEqual([]);
  });

  test("are not glass in Chrome, whose bars hide the page", () => {
    const bars = barsFor({ device: "pixel-9", posture: "closed", orientation: "portrait", browser: "auto", edgeToEdge: false }, false);
    expect(bars?.platform).toBe("chrome");
    expect(bars && glassOf(bars, HOST)).toEqual([]);
  });
});

/** A node as far as a glued screen builds and paints one. */
class FakeNode {
  className = "";
  width = 0;
  height = 0;
  children: FakeNode[] = [];
  parent: FakeNode | null = null;
  readonly style = {
    setProperty(name: string, value: string): void {
      Reflect.set(this, name, value);
    },
  };
  get isConnected(): boolean {
    return true;
  }
  append(...nodes: FakeNode[]): void {
    for (const node of nodes) {
      node.remove();
      node.parent = this;
      this.children.push(node);
    }
  }
  prepend(...nodes: FakeNode[]): void {
    for (const node of nodes) node.remove();
    for (const node of nodes) node.parent = this;
    this.children.unshift(...nodes);
  }
  remove(): void {
    if (!this.parent) return;
    this.parent.children = this.parent.children.filter((node) => node !== this);
    this.parent = null;
  }
  addEventListener(): void {}
  getContext(kind: string): unknown {
    if (kind === "webgl2") return gl;
    return { fillRect: () => {}, drawImage: () => {}, fillStyle: "", imageSmoothingQuality: "" };
  }
}

/** WebGL2, faked: every call does nothing but what `paint` and `draw` count. */
class FakeGl {}
let gl: unknown = null;
const painted: unknown[] = [];

function fakeGl(): unknown {
  return new Proxy(new FakeGl(), {
    get: (_target, name) => {
      if (name === "getParameter") return () => 4096;
      if (name === "texImage2D") return (...args: unknown[]) => painted.push(args[5]);
      return () => ({});
    },
  });
}

const saved = ["WebGL2RenderingContext", "document"].map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);

afterEach(() => {
  for (const [name, descriptor] of saved) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
  gl = null;
  painted.length = 0;
});

function fakeDocument(webgl: boolean): void {
  gl = webgl ? fakeGl() : null;
  if (webgl) Object.defineProperty(globalThis, "WebGL2RenderingContext", { configurable: true, value: FakeGl });
  else Reflect.deleteProperty(globalThis, "WebGL2RenderingContext");
  Object.defineProperty(globalThis, "document", { configurable: true, value: { createElement: () => new FakeNode() } });
}

/** A fake node where a glued screen takes an element. */
function element(node: FakeNode): HTMLElement {
  return node as unknown as HTMLElement;
}

function canvas(node: FakeNode): HTMLCanvasElement {
  return node as unknown as HTMLCanvasElement;
}

/** The cover screen glued on, from a picture whose painted one, `bars` drawn in or not, comes once `done` is called. */
function glue(bars: boolean): { glued: Glued; copy: FakeNode; shot: FakeNode; done: () => Promise<void> } {
  const copy = new FakeNode();
  copy.className = "browser";
  const shot = new FakeNode();
  shot.width = 466;
  shot.height = 678;
  let release = () => {};
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  const picture: Picture = {
    shot: null,
    painted: ready.then(() => ({ shot: canvas(shot), bars })),
    bars: element(copy),
  };
  const side = { body: null, href: null, size: { width: 466, height: 678 }, screen: { x: 0, y: 0, width: 466, height: 678 } };
  const turning = {
    pane: "cover" as const,
    rect: { x: 0, y: 0, width: 466, height: 678 },
    radii: [0, 0, 0, 0] as [number, number, number, number],
    toward: "to right",
    span: [0, 100] as [number, number],
    pivot: { x: 0, y: 0 },
  };
  const glued = gluedOf(side, picture, turning, true, { x: 0, y: 0, width: 600, height: 800 }, 40, 2);
  return {
    glued,
    copy,
    shot,
    done: async () => {
      release();
      await ready;
      await Promise.resolve();
      await Promise.resolve();
    },
  };
}

describe("the bars on the screen that turns", () => {
  test("drawn by WebGL2, go with the page into its picture, and their sharp copy comes off the screen", async () => {
    fakeDocument(true);
    const { glued, copy, shot, done } = glue(true);
    expect(glued.gl).not.toBeNull();
    // Till the picture with the bars in it is painted, the copy keeps them on the screen.
    expect(copy.parent).not.toBeNull();
    await done();
    expect(painted).toContain(shot);
    expect(copy.parent).toBeNull();
  });

  test("keep their copy where the bars would not draw into the picture", async () => {
    fakeDocument(true);
    const { copy, shot, done } = glue(false);
    await done();
    expect(painted).toContain(shot);
    expect(copy.parent).not.toBeNull();
  });

  test("laid over each other where WebGL2 is not, go into the pictures, and their copy comes off too", async () => {
    fakeDocument(false);
    const { glued, copy, shot, done } = glue(true);
    expect(glued.gl).toBeNull();
    await done();
    expect(glued.pictures[0]).toBe(element(shot));
    // The sharp picture and a blurrier one for each blur past it, all with the bars in.
    expect(glued.pictures.length).toBeGreaterThan(1);
    expect(copy.parent).toBeNull();
  });
});
