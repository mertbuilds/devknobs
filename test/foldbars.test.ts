import { afterEach, describe, expect, test } from "bun:test";
import { type BarsKnobs, barsFor, glassOf } from "../src/engine/barshot";
import { blurWidths, screenDim } from "../src/engine/fold";
import { type Glued, gluedOf, light, litByGl, type Picture } from "../src/engine/foldpage";
import { foldTune, resetTune } from "../src/engine/foldtune";

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
  get lastElementChild(): FakeNode | null {
    return this.children.at(-1) ?? null;
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
  addEventListener(name: string, listener: () => void): void {
    heard[name] = listener;
  }
  getContext(kind: string): unknown {
    if (kind === "webgl2") return gl;
    return { fillRect: () => {}, drawImage: () => {}, fillStyle: "", imageSmoothingQuality: "" };
  }
}

/** WebGL2, faked: every call does nothing but what `paint` and `draw` count, and what `fail` has fail. */
class FakeGl {}
let gl: unknown = null;
const painted: unknown[] = [];
/** What the last canvas made listens for. */
let heard: Record<string, () => void> = {};
/** How the faked WebGL2 fails: it makes nothing, does not link, throws `upload` at a picture, or tells of `error` after one. */
let fail: { made?: boolean; link?: boolean; upload?: unknown; error?: number } = {};

function fakeGl(): unknown {
  return new Proxy(new FakeGl(), {
    get: (_target, name) => {
      if (name === "NO_ERROR") return 0;
      if (name === "getParameter") return () => 4096;
      if (name === "createShader") return () => (fail.made ? null : {});
      if (name === "isContextLost") return () => false;
      if (name === "getProgramParameter") return () => !fail.link;
      if (name === "getShaderInfoLog") return () => "ERROR: 0:1: bad";
      if (name === "getError") return () => fail.error ?? 0;
      if (name === "getExtension") return () => null;
      if (name === "texImage2D") {
        return (...args: unknown[]) => {
          if (fail.upload) throw fail.upload;
          painted.push(args[5]);
        };
      }
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
  heard = {};
  fail = {};
  resetTune();
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

/** The fake node an element of a glued screen is. */
function node(element: HTMLElement): FakeNode {
  return element as unknown as FakeNode;
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

describe("the light on the screen that turns", () => {
  test("leaves the free edge alone where WebGL2 darkens it", () => {
    fakeDocument(false);
    const { glued } = glue(false);
    light(glued, 0.55, null, 0.4);
    expect(glued.edge.style.background).toBe("");
  });

  test("darkens the free edge where WebGL2 is not and a hand turns that dark on, out to as much of the screen as is seen", () => {
    fakeDocument(false);
    const { glued } = glue(false);
    foldTune.set("darkMost", 0.7);
    light(glued, 0.55, 0.4, 0.4);
    const edge = glued.edge.style.background;
    expect(edge).toStartWith("linear-gradient(");
    expect(edge).toEndWith(" 40%)");
    expect(glued.edge.style.display).toBe("");
  });

  test("as it ships, draws no shade over the screen, and keeps no box for one", () => {
    fakeDocument(false);
    const { glued } = glue(false);
    for (const open of [0.05, 0.2, 0.35, 0.45]) {
      light(glued, open, 0.4, 0.4);
      for (const shade of [glued.shade, glued.flat, glued.edge]) {
        expect(shade.style.background).toBe("");
        expect(shade.style.display).toBe("none");
      }
    }
  });

  test("shades the screen through many stops where a hand turns the wipe on, and through none where WebGL2 lights it itself", () => {
    fakeDocument(false);
    const { glued } = glue(false);
    foldTune.set("wipeShade", 1.5);
    light(glued, 0.4, 0.4, 0.4);
    const shade = glued.shade.style.background;
    expect(shade).toStartWith("linear-gradient(to right, rgba(0, 0, 0, 0) 0%, ");
    expect(shade).toEndWith(" 100%)");
    expect(shade.split("rgba(").length - 1).toBeGreaterThanOrEqual(17);
    expect(shade.length).toBeLessThan(2200);
    expect(glued.shade.style.display).toBe("");
    light(glued, 0.4, null, 0.4, true);
    for (const one of [glued.shade, glued.flat, glued.edge]) expect([one.style.background, one.style.display]).toEqual(["", "none"]);
    // The open screen's own light stays one dark over the canvas, the same as over the half that stays.
    const inner: Glued = { ...glued, pane: "inner" };
    light(inner, 0.7, null, 0.7, true);
    expect(glued.shade.style.background).toBe(`rgba(0, 0, 0, ${screenDim("inner", 0.7)})`);
    expect(glued.shade.style.display).toBe("");
    expect(glued.flat.style.display).toBe("none");
    // With the shades off, none either way.
    foldTune.set("shadeOn", 0);
    light(glued, 0.4, 0.4, 0.4);
    expect(glued.shade.style.display).toBe("none");
  });

  test("is WebGL2's own once the bars' copy is off its canvas, and the gradients' till then", async () => {
    fakeDocument(true);
    const { glued, done } = glue(true);
    expect(litByGl(glued)).toBe(false);
    await done();
    expect(litByGl(glued)).toBe(true);
    fakeDocument(false);
    expect(litByGl(glue(false).glued)).toBe(false);
  });

  test("shows none of a blurrier picture at the hinge near a right angle, and all of it further out", async () => {
    fakeDocument(false);
    const { glued, done } = glue(true);
    await done();
    light(glued, 0.53, 1, 1);
    const masks = glued.pictures.slice(1).map((picture) => stopsOf(picture.style.maskImage));
    expect(masks).toHaveLength(5);
    const [first] = masks;
    expect(first?.[0]?.[0]).toBe(0);
    expect(first?.[0]?.[1]).toBeGreaterThan(0);
    expect(first?.at(-1)?.[0]).toBe(1);
    expect(first?.at(-1)?.[1]).toBeLessThan(50);
    masks.forEach((stops, index) => {
      // More than its two ends, so the fade bends as the blur rises, in order from the hinge out and never falling.
      expect(stops.length).toBeGreaterThan(4);
      for (let at = 1; at < stops.length; at++) {
        expect(stops[at]?.[1] ?? 0).toBeGreaterThan(stops[at - 1]?.[1] ?? 0);
        expect(stops[at]?.[0] ?? 0).toBeGreaterThan(stops[at - 1]?.[0] ?? 0);
      }
      // Each begins on the screen exactly where the one under it is all in.
      const under = masks[index - 1];
      if (under) expect(stops[0]).toEqual([0, under.at(-1)?.[1] ?? -1]);
      if (under) expect(under.at(-1)?.[0]).toBe(1);
    });
  });

  test("makes the blurrier pictures again once a hand sets how wide the blur gets, and only then", async () => {
    fakeDocument(false);
    const { glued, shot, done } = glue(true);
    await done();
    light(glued, 0.5, 1, 1);
    const before = glued.pictures;
    expect(before).toHaveLength(6);
    expect(glued.widths).toEqual([2, 4, 8, 16, 32, 48]);
    // A number that is not the widest blur leaves them be, and so does a frame.
    foldTune.set("blurRise", 3);
    light(glued, 0.4, 1, 1);
    expect(glued.pictures).toBe(before);
    foldTune.set("blurMost", 16);
    light(glued, 0.5, 1, 1);
    expect(glued.widths).toEqual([2, 4, 8, 16]);
    expect(glued.pictures).toHaveLength(4);
    expect(glued.pictures[0]).toBe(element(shot));
    // The old ones are off the screen, the new ones on it under the bars, and each is faded as the new widths have it.
    expect(before.slice(1).every((picture) => node(picture).parent === null)).toBe(true);
    expect(glued.pictures.every((picture) => node(picture).parent !== null)).toBe(true);
    expect(stopsOf(glued.pictures[3]?.style.maskImage ?? "").at(-1)).toEqual([1, 100]);
    foldTune.set("blurMost", 256);
    light(glued, 0.5, 1, 1);
    expect(glued.pictures).toHaveLength(blurWidths(256).length);
    expect(glued.pictures).toHaveLength(8);
  });
});

/** The stops of a mask's gradient: how much shows at each, and where on the screen, in percent. */
function stopsOf(mask: string): [share: number, at: number][] {
  expect(mask).toStartWith("linear-gradient(to right, ");
  return Array.from(mask.matchAll(/rgba\(0, 0, 0, ([\d.]+)\) ([\d.]+)%/g), (stop) => [Number(stop[1]), Number(stop[2])]);
}

describe("what drew the page on the screen that turns", () => {
  /** Light the screen as a frame does: its free edge left to WebGL2 where that draws. */
  function draw(glued: Glued): void {
    light(glued, 0.5, glued.gl ? null : 1, 1);
  }

  test("is WebGL2 where the picture went up as a texture, and who listens hears it change", async () => {
    fakeDocument(false);
    const without = glue(true);
    await without.done();
    draw(without.glued);
    let heard = 0;
    const stop = foldTune.subscribe(() => heard++);
    fakeDocument(true);
    const { glued, done } = glue(true);
    await done();
    draw(glued);
    expect(foldTune.info()).toEqual({ drawnBy: "webgl", why: "the picture went up as a texture" });
    expect(heard).toBe(1);
    // A frame more, drawn the same way, tells no one.
    draw(glued);
    expect(heard).toBe(1);
    // What it gives is a copy: changing it changes nothing.
    foldTune.info().drawnBy = "none";
    expect(foldTune.info().drawnBy).toBe("webgl");
    draw(without.glued);
    expect(foldTune.info()).toEqual({ drawnBy: "layers", why: "this browser has no WebGL2" });
    expect(heard).toBe(2);
    // Still heard of the table's changes, and of neither once stopped.
    foldTune.set("blurMost", 20);
    expect(heard).toBe(3);
    stop();
    draw(glued);
    foldTune.set("blurMost", 30);
    expect(heard).toBe(3);
    expect(foldTune.info().drawnBy).toBe("webgl");
  });

  test("is the layers wherever WebGL2 refuses, with the reason it gave", async () => {
    const security = new Error("tainted");
    security.name = "SecurityError";
    const cases: [typeof fail, RegExp][] = [
      [{ made: true }, /^WebGL2 made no shader, program, buffer or texture$/],
      [{ link: true }, /^the shader did not compile or link: ERROR: 0:1: bad$/],
      [{ upload: security }, /^the picture could not be uploaded: SecurityError, the browser holds the picture as another origin's/],
      [{ error: 0x505 }, /^the picture could not be uploaded: WebGL2 error 0x505$/],
    ];
    for (const [how, why] of cases) {
      fakeDocument(true);
      fail = how;
      const { glued, shot, done } = glue(true);
      await done();
      expect(glued.gl).toBeNull();
      // The picture is on the screen all the same, as layers.
      expect(glued.pictures[0]).toBe(element(shot));
      expect(glued.pictures).toHaveLength(6);
      draw(glued);
      expect(foldTune.info().drawnBy).toBe("layers");
      expect(foldTune.info().why).toMatch(why);
      fail = {};
    }
    // A picture too large for a texture.
    fakeDocument(true);
    const large = glue(true);
    large.shot.width = 5000;
    await large.done();
    draw(large.glued);
    expect(foldTune.info()).toEqual({ drawnBy: "layers", why: "the picture, 5000 by 678 px, is larger than MAX_TEXTURE_SIZE, 4096" });
    // A context lost after it drew: the layers take the picture it held.
    fakeDocument(true);
    const { glued, shot, done } = glue(true);
    await done();
    draw(glued);
    expect(foldTune.info().drawnBy).toBe("webgl");
    heard.webglcontextlost?.();
    expect(glued.gl).toBeNull();
    expect(glued.pictures[0]).toBe(element(shot));
    draw(glued);
    expect(foldTune.info()).toEqual({ drawnBy: "layers", why: "the WebGL2 context was lost" });
  });
});
