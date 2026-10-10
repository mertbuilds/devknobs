import { afterEach, describe, expect, test } from "bun:test";
import { DUO_FOLD } from "../src/engine/bezelurls";
import {
  blurShare,
  darkAt,
  freeDepth,
  type Pane,
  type Quad,
  shotPane,
  shotPicture,
  shotQuad,
  shotWindow,
  turnBlur,
} from "../src/engine/fold";
import {
  blurAt,
  canvasRect,
  contextOf,
  coverage,
  FRAGMENT,
  freeOf,
  hingeLine,
  reachOf,
  screenGl,
  screenLook,
  wedgeOf,
} from "../src/engine/foldgl";
import { TUNE_DEFAULTS } from "../src/engine/foldtune";

/** Deep in the picture, past any end's blur. */
const DEEP = 1e4;
/** Every hundredth of the way, from 0 to 1. */
const HUNDREDTHS = Array.from({ length: 101 }, (_, step) => step / 100);

describe("the screen's blur", () => {
  test("is none anywhere with the screen lying flat, open or shut, so the page hands back unchanged", () => {
    for (const look of [screenLook(1, 0), screenLook(0, 0)]) {
      for (const t of [0, 0.25, 0.5, 0.75, 1]) {
        for (const inside of [-40, 0, 3, DEEP]) expect(blurAt(look, t, inside)).toBe(0);
      }
    }
  });

  test("away from the ends is least at the hinge, under 2 css px at any angle, and never falls toward the free edge", () => {
    for (const open of HUNDREDTHS) {
      for (const free of [1, 0.5, 0.1]) {
        const look = screenLook(open, 0, free);
        const hinge = blurAt(look, 0, DEEP);
        expect(hinge).toBeLessThan(2);
        expect(hinge).toBeCloseTo(TUNE_DEFAULTS.blurHinge * turnBlur(open), 9);
        let last = hinge;
        for (const t of HUNDREDTHS) {
          expect(blurAt(look, t, DEEP)).toBeGreaterThanOrEqual(last);
          last = blurAt(look, t, DEEP);
        }
        // Its widest is at the free edge the turned screen is seen to, and past it no wider.
        expect(blurAt(look, free, DEEP)).toBeCloseTo(turnBlur(open), 9);
        expect(last).toBeCloseTo(turnBlur(open), 9);
        expect(blurAt(look, free / 2, DEEP)).toBeCloseTo(turnBlur(open) * blurShare(0.5), 9);
      }
    }
  });

  test("is never wider than 48 css px, and that wide only at the free edge at a right angle", () => {
    let most = 0;
    for (const open of HUNDREDTHS) {
      for (const t of HUNDREDTHS) most = Math.max(most, blurAt(screenLook(open, 0), t, DEEP));
    }
    expect(most).toBe(48);
    expect(blurAt(screenLook(0.5, 0), 1, DEEP)).toBe(48);
    // Half way out there, a little over a quarter of it.
    expect(blurAt(screenLook(0.5, 0), 0.5, DEEP)).toBeLessThan(14);
  });

  test("draws the same in the shader, from numbers handed to it at each draw", () => {
    expect(FRAGMENT).toContain("float across = free > 0.0 ? min(1.0, t / free) : 1.0;");
    expect(FRAGMENT).toContain("float wide = peak * (shape.x + (1.0 - shape.x) * pow(across, shape.y));");
    // None of the look's numbers is written into it.
    expect(FRAGMENT).not.toContain("${");
    for (const name of ["peak", "shape", "rimmed", "band", "edge", "dark"]) expect(FRAGMENT).toMatch(new RegExp(`uniform \\w+ ${name};`));
  });

  test("darkens the free edge as deep as freeDepth, and not at all lying flat", () => {
    expect(screenLook(0, 0).dark).toBe(0);
    expect(screenLook(1, 0).dark).toBe(0);
    expect(screenLook(0.6, 12, 0.4).dark).toBe(freeDepth(0.6));
  });

  test("blurs the page into the dark past its ends, as wide as that dark at the free edge, even at the hinge", () => {
    const wedge = 40;
    for (const open of [0.95, 0.05]) {
      // Barely turned, the screen's blur is all but none near the hinge: the ends' is what shows there.
      const look = screenLook(open, wedge);
      expect(look.edge).toEqual([TUNE_DEFAULTS.edgeHinge * wedge, TUNE_DEFAULTS.edgeFree * wedge]);
      expect(blurAt(look, 0, -5)).toBeCloseTo(TUNE_DEFAULTS.edgeHinge * wedge);
      expect(blurAt(look, 0, 0)).toBeCloseTo(TUNE_DEFAULTS.edgeHinge * wedge);
      expect(blurAt(look, 1, 0)).toBeCloseTo(TUNE_DEFAULTS.edgeFree * wedge);
      expect(blurAt(look, 0.5, -20)).toBeCloseTo(((TUNE_DEFAULTS.edgeHinge + TUNE_DEFAULTS.edgeFree) / 2) * wedge);
      // It eases off into the picture, and is gone as far in as it reaches.
      const rim = TUNE_DEFAULTS.edgeHinge * wedge;
      expect(blurAt(look, 0, rim)).toBeLessThan(rim);
      expect(blurAt(look, 0, rim)).toBeGreaterThan(0);
      expect(blurAt(look, 0, TUNE_DEFAULTS.edgeReach * rim)).toBe(blurAt(look, 0, DEEP));
    }
    // The further the screen reaches past the page, the wider.
    expect(blurAt(screenLook(0.3, 60), 0.2, 0)).toBeGreaterThan(blurAt(screenLook(0.3, 20), 0.2, 0));
  });

  test("keeps the screen's own where that is the wider at the ends", () => {
    const look = screenLook(0.4, 2);
    expect(blurAt(look, 1, 0)).toBe(blurAt(look, 1, DEEP));
  });
});

describe("coverage", () => {
  test("is the picture inside it, none past its ends, and half on them, softened either way", () => {
    expect(coverage(50, 100, 2)).toBe(1);
    expect(coverage(-3, 100, 2)).toBe(0);
    expect(coverage(103, 100, 2)).toBe(0);
    expect(coverage(0, 100, 2)).toBeCloseTo(0.5);
    expect(coverage(100, 100, 2)).toBeCloseTo(0.5);
    expect(coverage(1, 100, 2)).toBeGreaterThan(0.5);
  });
});

describe("the turned screen's free edge", () => {
  const picture = { x: 100, y: 50, width: 400, height: 600 };
  const box = (left: number, right: number): Quad => [
    [left, 50],
    [right, 50],
    [right, 650],
    [left, 650],
  ];

  test("is the picture's own lying flat, so the page hands back unchanged", () => {
    expect(freeOf(box(100, 500), "cover", picture)).toBe(1);
    expect(freeOf(box(100, 500), "inner", picture)).toBe(1);
  });

  test("cuts the page lying flat where it is seen, from the hinge, the cover's on its right and the open screen's on its left", () => {
    expect(freeOf(box(100, 300), "cover", picture)).toBe(0.5);
    expect(freeOf(box(400, 500), "inner", picture)).toBe(0.25);
  });

  test("never reaches past the picture's own, nor back past the hinge", () => {
    expect(freeOf(box(100, 560), "cover", picture)).toBe(1);
    expect(freeOf(box(40, 500), "inner", picture)).toBe(1);
    expect(freeOf(box(100, 80), "cover", picture)).toBe(0);
  });

  test("leaves the look's free edge at the picture's own where none is given", () => {
    expect(screenLook(0.4, 10).free).toBe(1);
    expect(screenLook(0.4, 10, 0.6).free).toBe(0.6);
  });
});

describe("the dark past the page's ends", () => {
  test("is the turned screen's reach past the picture at its free edge, in the picture's css px", () => {
    const picture = { x: 0, y: 0, width: 100, height: 200 };
    const window: Quad = [[0, -10], [100, 0], [100, 200], [0, 216]];
    expect(wedgeOf(window, "inner", picture, 400)).toBe(32);
    expect(wedgeOf(window, "inner", { ...picture, height: 0 }, 400)).toBe(0);
  });

  test("reaches at most as far as any frame of the fold has it, and the canvas that far past the ends", () => {
    if (!DUO_FOLD) return;
    const shots = DUO_FOLD;
    for (const pane of ["inner", "cover"] as const) {
      const reach = reachOf(shots, pane);
      expect(reach).toBeGreaterThan(0.05);
      expect(reach).toBeLessThan(0.2);
      for (const shot of shots.frames.filter((frame) => shotPane(shots, frame) === pane)) {
        const quad = shotQuad(shot, pane);
        const picture = shotPicture(shots, pane, quad);
        const { top, bottom } = darkAt(shotWindow(quad, pane, picture), pane, picture);
        expect(Math.max(top, bottom) / picture.height).toBeLessThanOrEqual(reach + 1e-9);
      }
    }
  });
});

describe("the canvas", () => {
  const stage = { width: 951, height: 669 };
  const half = { x: 0, y: 0, width: 475.5, height: 669 };

  test("lies over the part that turns, and past the screen's ends along the hinge", () => {
    const place = { pane: "inner" as const, across: true, stage, part: half, margin: 80, density: 2 };
    expect(canvasRect(place)).toEqual({ x: 0, y: -80, width: 475.5, height: 829 });
    const upright = { width: 669, height: 951 };
    const lower = { x: 0, y: 475.5, width: 669, height: 475.5 };
    expect(canvasRect({ ...place, across: false, stage: upright, part: lower })).toEqual({
      x: -80,
      y: 475.5,
      width: 829,
      height: 475.5,
    });
  });

  test("runs from the hinge to the free edge the way each screen's shade does", () => {
    const at = (pane: Pane, across: boolean, part: typeof half, x: number, y: number) => {
      const [a, b, c] = hingeLine(pane, across, part);
      return a * x + b * y + c;
    };
    // Held across, the open screen's hinge is its middle, its free edge its left; the folded one's hinge is its left.
    expect(at("inner", true, half, 475.5, 300)).toBeCloseTo(0);
    expect(at("inner", true, half, 0, 300)).toBeCloseTo(1);
    const cover = { x: 0, y: 0, width: 466, height: 678 };
    expect(at("cover", true, cover, 0, 300)).toBeCloseTo(0);
    expect(at("cover", true, cover, 466, 300)).toBeCloseTo(1);
    // Held upright, the open screen's lower half turns from the middle down; the folded one from its bottom up.
    const lower = { x: 0, y: 475.5, width: 669, height: 475.5 };
    expect(at("inner", false, lower, 300, 475.5)).toBeCloseTo(0);
    expect(at("inner", false, lower, 300, 951)).toBeCloseTo(1);
    const upright = { x: 0, y: 0, width: 678, height: 466 };
    expect(at("cover", false, upright, 300, 466)).toBeCloseTo(0);
    expect(at("cover", false, upright, 300, 0)).toBeCloseTo(1);
  });
});

describe("WebGL2", () => {
  const saved = ["WebGL2RenderingContext", "document"].map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);

  afterEach(() => {
    for (const [name, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  });

  class FakeGl {}

  test("is the canvas's context only where the browser has it, so the pictures are laid over each other otherwise", () => {
    Reflect.deleteProperty(globalThis, "WebGL2RenderingContext");
    expect(contextOf({ getContext: () => new FakeGl() })).toBeNull();
    Object.defineProperty(globalThis, "WebGL2RenderingContext", { configurable: true, value: FakeGl });
    const gl = new FakeGl();
    expect(Object.is(contextOf({ getContext: () => gl }), gl)).toBe(true);
    expect(contextOf({ getContext: () => null })).toBeNull();
    expect(contextOf({ getContext: () => ({}) })).toBeNull();
  });

  const place = { pane: "inner" as const, across: true, stage: { width: 951, height: 669 }, part: { x: 0, y: 0, width: 475.5, height: 669 }, margin: 80, density: 2 };

  /** How a faked WebGL2 fails: it makes nothing, is lost, does not link, saying `log`, throws `upload` at a picture, or tells of `error` after one. */
  interface Fail {
    made?: boolean;
    lost?: boolean;
    link?: boolean;
    log?: string;
    upload?: unknown;
    error?: number;
  }

  /** A canvas whose WebGL2 fails as `fail` has it, what was told of each refusal, and the way to lose its context. */
  function fake(fail: Fail | null) {
    const calls: string[] = [];
    const gl = new Proxy(new FakeGl(), {
      get: (_target, name) => {
        if (name === "NO_ERROR") return 0;
        return (...args: unknown[]) => {
          calls.push(String(name));
          if (name === "getParameter") return 4096;
          if (name === "createShader") return fail?.made ? null : {};
          if (name === "isContextLost") return fail?.lost === true;
          if (name === "getProgramParameter") return !fail?.link;
          if (name === "getShaderInfoLog") return args[0] && fail?.log ? fail.log : "";
          if (name === "getProgramInfoLog") return "";
          if (name === "getError") return fail?.error ?? 0;
          if (name === "getExtension") return null;
          if (name === "texImage2D" && fail?.upload) throw fail.upload;
          return {};
        };
      },
    });
    const heard: Record<string, () => void> = {};
    let removed = 0;
    const canvas = {
      width: 0,
      height: 0,
      style: {},
      getContext: () => (fail ? gl : null),
      remove: () => removed++,
      addEventListener: (name: string, listener: () => void) => {
        heard[name] = listener;
      },
    };
    Object.defineProperty(globalThis, "WebGL2RenderingContext", { configurable: true, value: FakeGl });
    Object.defineProperty(globalThis, "document", { configurable: true, value: { createElement: () => canvas } });
    const refused: [string, unknown][] = [];
    const screen = screenGl(place, (why, shot) => refused.push([why, shot]));
    return { screen, refused, calls, lose: () => heard.webglcontextlost?.(), removed: () => removed };
  }

  /** A picture as far as WebGL2 takes one up. */
  function shotOf(width: number, height: number): HTMLCanvasElement {
    return { width, height } as unknown as HTMLCanvasElement;
  }

  /** An error as a browser throws one, by name. */
  function thrown(name: string): Error {
    const error = new Error("no");
    error.name = name;
    return error;
  }

  test("draws nothing where there is none, and says which it has not: the browser or the canvas", () => {
    const { screen, refused } = fake(null);
    expect(screen).toBeNull();
    expect(refused).toEqual([["the canvas gave no WebGL2 context", null]]);
    Reflect.deleteProperty(globalThis, "WebGL2RenderingContext");
    const none: string[] = [];
    expect(screenGl(place, (why) => none.push(why))).toBeNull();
    expect(none).toEqual(["this browser has no WebGL2"]);
  });

  test("is not made where WebGL2 makes nothing, lost or not, or where the shader fails, and says what the shader's log does", () => {
    const nothing = fake({ made: true });
    expect(nothing.screen).toBeNull();
    expect(nothing.refused).toEqual([["WebGL2 made no shader, program, buffer or texture", null]]);
    expect(nothing.removed()).toBe(1);
    const lost = fake({ made: true, lost: true });
    expect(lost.refused).toEqual([["the WebGL2 context was lost as it was made", null]]);
    const shader = fake({ link: true, log: "\nERROR: 0:17: 'free' : undeclared identifier\nERROR: 0:18: more\n" });
    expect(shader.screen).toBeNull();
    expect(shader.refused).toEqual([["the shader did not compile or link: ERROR: 0:17: 'free' : undeclared identifier", null]]);
    expect(shader.removed()).toBe(1);
    expect(fake({ link: true }).refused).toEqual([["the shader did not compile or link: no reason given", null]]);
    expect(fake({ link: true, lost: true }).refused).toEqual([["the WebGL2 context was lost as it was made", null]]);
  });

  test("takes up a picture and draws it, telling of no refusal", () => {
    const { screen, refused, calls } = fake({});
    const shot = shotOf(951, 669);
    screen?.draw(screenLook(0.5, 10));
    expect(calls).not.toContain("drawArrays");
    screen?.paint(shot);
    expect(refused).toEqual([]);
    expect(calls).toContain("generateMipmap");
    expect(calls.filter((call) => call === "drawArrays")).toHaveLength(1);
  });

  test("hands a picture it cannot take up to the layers, lets go of itself, and says why", () => {
    const shot = shotOf(951, 669);
    const cases: [Fail, HTMLCanvasElement, RegExp][] = [
      [{ upload: thrown("SecurityError") }, shot, /^the picture could not be uploaded: SecurityError, the browser holds the picture as another origin's/],
      [{ upload: thrown("TypeError") }, shot, /^the picture could not be uploaded: TypeError$/],
      [{ upload: "broken" }, shot, /^the picture could not be uploaded: broken$/],
      [{ error: 0x501 }, shot, /^the picture could not be uploaded: WebGL2 error 0x501$/],
      [{}, shotOf(8000, 669), /^the picture, 8000 by 669 px, is larger than MAX_TEXTURE_SIZE, 4096$/],
      [{}, shotOf(951, 4097), /^the picture, 951 by 4097 px, is larger than MAX_TEXTURE_SIZE, 4096$/],
    ];
    for (const [fail, picture, why] of cases) {
      const { screen, refused, calls, removed } = fake(fail);
      screen?.paint(picture);
      expect(refused).toHaveLength(1);
      expect(refused[0]?.[0]).toMatch(why);
      expect(Object.is(refused[0]?.[1], picture)).toBe(true);
      // Nothing of it is left, and nothing is drawn from a picture that did not go up.
      expect(removed()).toBe(1);
      expect(calls).toContain("deleteTexture");
      expect(calls).not.toContain("generateMipmap");
      expect(calls).not.toContain("drawArrays");
      // Whatever comes after goes to the layers too, and it is let go of once only.
      screen?.paint(picture);
      expect(refused[1]).toEqual(["the WebGL2 context is gone", picture]);
      screen?.release();
      expect(calls.filter((call) => call === "deleteTexture")).toHaveLength(1);
    }
  });

  test("hands the picture it holds to the layers once its context is lost, and no more than once", () => {
    const { screen, refused, lose, removed } = fake({});
    const shot = shotOf(951, 669);
    screen?.paint(shot);
    lose();
    lose();
    expect(refused).toEqual([["the WebGL2 context was lost", shot]]);
    expect(removed()).toBe(1);
    // Let go of by the fold itself, it tells of nothing.
    const over = fake({});
    over.screen?.release();
    over.lose();
    expect(over.refused).toEqual([]);
  });
});
