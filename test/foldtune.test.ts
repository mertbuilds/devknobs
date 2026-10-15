import { afterEach, describe, expect, test } from "bun:test";
import { blurReach, blurShare, freeBand, freeDepth, freeShades, paneLook, turnBlur } from "../src/engine/fold";
import { blurAt, screenLook } from "../src/engine/foldgl";
import {
  BY_WEBGL,
  drew,
  foldTune,
  installTune,
  JADON,
  jadonBlur,
  resetTune,
  TABLE_DEFAULTS,
  TUNE_DEFAULTS,
  TUNE_KEY,
  tune,
  tuneChanges,
  watchTune,
} from "../src/engine/foldtune";

afterEach(() => {
  resetTune();
});

describe("the fold's numbers", () => {
  test("start as they ship, and are handed out as a copy", () => {
    expect(foldTune.get()).toEqual(TABLE_DEFAULTS);
    expect(tune).toEqual(TUNE_DEFAULTS);
    foldTune.get().blurMost = 1;
    expect(tune.blurMost).toBe(TUNE_DEFAULTS.blurMost);
    // The hinge side sharp, but for its ends' blur, and the widest blur three eighths of the 128 css px it was.
    expect(TUNE_DEFAULTS.blurMost).toBe(48);
    expect([TUNE_DEFAULTS.blurHinge, TUNE_DEFAULTS.edgeHinge]).toEqual([0, 0.3]);
    expect(TUNE_DEFAULTS.blurRise).toBe(2);
    expect(TUNE_DEFAULTS.blurAngle).toBe(90);
    // No shade over the half that turns: each is a hand's to bring back.
    expect([TUNE_DEFAULTS.wipeShade, TUNE_DEFAULTS.darkMost, TUNE_DEFAULTS.farShade]).toEqual([0, 0, 0]);
  });

  test("lists every number once, as it ships and as it is, in a range that holds both", () => {
    const { spec } = foldTune;
    expect(spec.map((row): string => row.key).sort()).toEqual(Object.keys(TABLE_DEFAULTS).sort());
    for (const row of spec) {
      expect(row.default).toBe(TABLE_DEFAULTS[row.key]);
      expect(row.value).toBe(row.default);
      expect(row.min).toBeLessThan(row.max);
      expect(row.default).toBeGreaterThanOrEqual(row.min);
      expect(row.default).toBeLessThanOrEqual(row.max);
      expect(row.step).toBeGreaterThan(0);
      // A switch is one way or the other: every other number has ten steps or more.
      const switches: Record<string, [label: string, ships: number]> = {
        shadeOn: ["shades on", 1],
        blurOn: ["blur on", 1],
        blurEase: ["blur rise shape", 0],
        backTint: ["black as magenta", 0],
        frameOn: ["case pictures on", 1],
        stillOn: ["still half on", 1],
      };
      const switched = switches[row.key];
      expect(row.step).toBeLessThanOrEqual(switched ? 1 : (row.max - row.min) / 10);
      if (switched) expect([row.min, row.max, row.step, row.label, row.default]).toEqual([0, 1, 1, ...switched]);
      expect(row.label).toMatch(/^[a-z]+( [a-z]+){1,3}$/);
      expect(row.hint.length).toBeGreaterThan(10);
    }
    // From no blur to well past the 128 css px it was at its widest.
    const most = spec.find((row) => row.key === "blurMost");
    expect(most?.min).toBe(0);
    expect(most?.max).toBeGreaterThan(128);
    foldTune.set("blurMost", 100);
    expect(foldTune.spec.find((row) => row.key === "blurMost")?.value).toBe(100);
  });

  test("are held to their range, and tell who listens of each change, once", () => {
    let heard = 0;
    const stop = foldTune.subscribe(() => heard++);
    const before = tuneChanges();
    foldTune.set("blurMost", 1e6);
    expect(tune.blurMost).toBe(256);
    foldTune.set("blurHinge", 3);
    expect(tune.blurHinge).toBe(1);
    expect(heard).toBe(2);
    expect(tuneChanges()).toBe(before + 2);
    // What changes nothing tells no one: the same value, a key it does not have, what is not a number.
    foldTune.set("blurHinge", 1);
    foldTune.set("nothing", 3);
    foldTune.set("blurMost", Number.NaN);
    expect(heard).toBe(2);
    expect(foldTune.get()).not.toHaveProperty("nothing");
    foldTune.reset();
    expect(heard).toBe(3);
    expect(tune).toEqual(TUNE_DEFAULTS);
    foldTune.reset();
    expect(heard).toBe(3);
    stop();
    foldTune.set("blurMost", 10);
    expect(heard).toBe(3);
  });

  test("are what the blur is drawn by, by WebGL2 and by the layers", () => {
    foldTune.set("blurMost", 100);
    expect(turnBlur(0.5)).toBe(100);
    expect(blurAt(screenLook(0.5, 0), 1, 1e4)).toBe(100);
    // Seven pictures now, the last as wide as the blur gets, all in at the free edge.
    expect(paneLook("inner", 0.5).blurs).toHaveLength(6);
    expect(paneLook("inner", 0.5).blurs[5]?.stops.at(-1)).toEqual([1, 1]);
    foldTune.set("blurHinge", 0.5);
    expect(blurShare(0)).toBe(0.5);
    expect(blurAt(screenLook(0.5, 0), 0, 1e4)).toBe(50);
    // The hinge's blur is past the first pictures' widths: they are all in from the hinge on.
    expect(paneLook("inner", 0.5).blurs[0]?.stops).toEqual([[0, 1], [0, 1]]);
    foldTune.set("blurRise", 1);
    expect(blurShare(0.5)).toBe(0.75);
    expect(blurReach(0.75)).toBeCloseTo(0.5, 9);
    // Widest where the hinge is set to have it, and still none lying flat.
    foldTune.set("blurAngle", 120);
    expect(turnBlur(120 / 180)).toBe(100);
    expect(turnBlur(0.5)).toBeLessThan(100);
    expect(turnBlur(0)).toBe(0);
    expect(turnBlur(1)).toBe(0);
    foldTune.set("blurStand", 1);
    expect(turnBlur(5 / 6)).toBeCloseTo(50, 9);
    foldTune.set("blurMost", 0);
    expect(paneLook("inner", 0.5).blurs).toEqual([]);
    expect(blurAt(screenLook(0.5, 0), 1, 1e4)).toBe(0);
  });

  test("blur by angle as they ship with no hold: as far up either side of the peak, on both screens", () => {
    expect([TUNE_DEFAULTS.blurHold, TUNE_DEFAULTS.blurEase]).toEqual([0, 0]);
    for (const pane of ["inner", "cover"] as const) {
      expect(turnBlur(0.5, pane)).toBe(48);
      expect(turnBlur(0.75, pane)).toBeCloseTo(16.97056274847714, 9);
      expect(turnBlur(0.25, pane)).toBeCloseTo(16.97056274847714, 9);
      expect(turnBlur(0.9, pane)).toBeCloseTo(4.293250516799597, 9);
      expect(turnBlur(0.1, pane)).toBeCloseTo(4.293250516799597, 9);
      expect(turnBlur(0, pane)).toBe(0);
      expect(turnBlur(1, pane)).toBe(0);
    }
    // No pane said is as either.
    expect(turnBlur(0.3)).toBe(turnBlur(0.3, "cover"));
  });

  test("hold the blur at its peak past the peak's angle, each screen on the side away from where it lies flat in sight", () => {
    foldTune.set("blurHold", 1);
    // The open screen rests open: it rises as it shuts, and holds from the peak on to shut.
    expect(turnBlur(1, "inner")).toBe(0);
    expect(turnBlur(0.75, "inner")).toBeCloseTo(16.97056274847714, 9);
    for (const open of [0.5, 0.4, 0.25, 0.01, 0]) expect(turnBlur(open, "inner")).toBe(48);
    // The folded body's rests shut: it rises as it opens, and holds from the peak on to open.
    expect(turnBlur(0, "cover")).toBe(0);
    expect(turnBlur(0.25, "cover")).toBeCloseTo(16.97056274847714, 9);
    for (const open of [0.5, 0.6, 0.75, 0.99, 1]) expect(turnBlur(open, "cover")).toBe(48);
    // Wherever the peak is set.
    foldTune.set("blurAngle", 120);
    expect(turnBlur(0.6, "inner")).toBe(48);
    expect(turnBlur(0.6, "cover")).toBeLessThan(48);
    expect(turnBlur(0.7, "cover")).toBe(48);
    expect(turnBlur(0.7, "inner")).toBeLessThan(48);
    expect([turnBlur(1, "inner"), turnBlur(0, "cover")]).toEqual([0, 0]);
  });

  test("hold a share of it between: that much of the way from the fall to the peak, and the rise as it was", () => {
    foldTune.set("blurHold", 0.5);
    expect(turnBlur(0.25, "inner")).toBeCloseTo((16.97056274847714 + 48) / 2, 9);
    expect(turnBlur(0, "inner")).toBe(24);
    expect(turnBlur(0.75, "inner")).toBeCloseTo(16.97056274847714, 9);
    expect(turnBlur(0.75, "cover")).toBeCloseTo((16.97056274847714 + 48) / 2, 9);
    expect(turnBlur(1, "cover")).toBe(24);
    expect(turnBlur(1, "inner")).toBe(0);
    expect(turnBlur(0, "cover")).toBe(0);
  });

  test("ease the blur's rise at both ends where asked, still none lying flat where the fold starts", () => {
    foldTune.set("blurEase", 1);
    expect(turnBlur(0.75)).toBe(24);
    expect(turnBlur(0.875)).toBe(7.5);
    expect(turnBlur(0.625)).toBe(40.5);
    expect(turnBlur(0.5)).toBe(48);
    // The falloff's power is not asked: the fall is eased as the rise is.
    foldTune.set("blurStand", 4);
    expect(turnBlur(0.75)).toBe(24);
    expect(turnBlur(0.25)).toBe(24);
    expect([turnBlur(1, "inner"), turnBlur(0, "cover"), turnBlur(1), turnBlur(0)]).toEqual([0, 0, 0, 0]);
    foldTune.set("blurHold", 1);
    expect([turnBlur(1, "inner"), turnBlur(0, "cover")]).toEqual([0, 0]);
    expect([turnBlur(0.25, "inner"), turnBlur(0.75, "cover")]).toEqual([48, 48]);
  });

  test("hold the blur for the screen that is drawn, by WebGL2 and by the layers", () => {
    foldTune.set("blurHold", 1);
    expect(screenLook(0.25, 0, 1, null, "inner").peak).toBe(48);
    expect(screenLook(0.25, 0, 1, null, "cover").peak).toBeCloseTo(16.97056274847714, 9);
    // Shaded as a screen, it is blurred as that screen unless told.
    expect(screenLook(0.75, 0, 1, "cover").peak).toBe(48);
    expect(screenLook(0.75, 0, 1, "inner").peak).toBeCloseTo(16.97056274847714, 9);
    const last = (pane: "inner" | "cover") => paneLook(pane, 0.75).blurs.at(-1);
    expect(last("cover")?.stops.at(-1)).toEqual([1, 1]);
    expect(last("inner")).toBeNull();
  });

  test("have sets by name, each with every key inside its range, that nothing applies by itself", () => {
    const sets = foldTune.presets();
    expect(Object.keys(sets)).toEqual(["ours", "jadon", "jadon blur"]);
    const { spec } = foldTune;
    for (const set of Object.values(sets)) {
      expect(Object.keys(set).sort()).toEqual(spec.map((row): string => row.key).sort());
      for (const row of spec) {
        expect(set[row.key]).toBeGreaterThanOrEqual(row.min);
        expect(set[row.key]).toBeLessThanOrEqual(row.max);
      }
    }
    expect(sets.ours).toEqual(TABLE_DEFAULTS);
    // Data only: the table is as it was, and a set changed by who took it changes no other.
    expect(tune).toEqual(TUNE_DEFAULTS);
    if (sets.ours) sets.ours.blurMost = 1;
    expect(foldTune.presets().ours).toEqual(TABLE_DEFAULTS);
    expect(TUNE_DEFAULTS.blurMost).toBe(48);
    const { jadon, "jadon blur": blur } = sets;
    expect(blur).toMatchObject({ blurHinge: 0, blurRise: 1.35, blurAngle: 90, blurHold: 1, blurEase: 1, blurSpread: 1, blurMost: 43 });
    // The same with no shade at all, and with it: from a fifth of the way out to black at the free edge.
    expect(blur).toMatchObject({ darkMost: 0, wipeShade: 0, farShade: 0 });
    expect(jadon).toMatchObject({ darkMost: 1, darkFrom: 0.2, darkPower: 1, darkBroad: 1, wipeShade: 0, farShade: 0, shadeOn: 1 });
    const { darkFrom, darkPower, darkBroad } = TUNE_DEFAULTS;
    const plain: Record<string, number> = { ...jadon, darkMost: 0, darkFrom, darkPower, darkBroad };
    expect(plain).toEqual({ ...blur });
  });

  test("put jadon's 72 px of its pictures in the css px of each of the Duo's screens, and its taps as far apart", () => {
    expect(JADON).toEqual({ radius: 72, inner: 1600, cover: 774 });
    // The open screen 951 css px across the hinge, the folded body's 466.
    expect(jadonBlur("inner")).toBeCloseTo((72 * 951) / 1600, 12);
    expect(jadonBlur("inner")).toBeCloseTo(42.795, 9);
    expect(jadonBlur("cover")).toBeCloseTo((72 * 466) / 774, 12);
    expect(jadonBlur("cover")).toBeCloseTo(43.3488, 4);
    expect([Math.round(jadonBlur("inner")), Math.round(jadonBlur("cover"))]).toEqual([43, 43]);
    for (const [key, value] of Object.entries(foldTune.presets()["jadon blur"] ?? {})) foldTune.set(key, value);
    // A tap is `blurSpread` of the blur's width from the next: at its widest, his 72 px of either picture, to under a px of it.
    const gap = tune.blurSpread * turnBlur(0.5);
    expect(gap).toBe(43);
    expect(Math.abs((gap * 1600) / 951 - 72)).toBeLessThan(0.5);
    expect(Math.abs((gap * 774) / 466 - 72)).toBeLessThan(0.75);
    // None at the hinge, his rise toward the free edge, and held from a right angle on.
    expect(blurShare(0)).toBe(0);
    expect(blurShare(0.5)).toBeCloseTo(0.5 ** 1.35, 12);
    expect([turnBlur(0.2, "inner"), turnBlur(0.8, "cover"), turnBlur(0.75, "inner")]).toEqual([43, 43, 21.5]);
  });

  test("give the hinge's angle and the page's picture as whoever knows the frame tells them, and nothing with no one to ask", async () => {
    // A table of its own, so the frame the other tests fold in is not this one's.
    const path = "../src/engine/foldtune.ts?live";
    const own: typeof import("../src/engine/foldtune") = await import(path);
    const hook = own.foldTune;
    expect(hook.angle()).toBeNull();
    expect(hook.shotWhy()).toBe("no picture has been asked for yet");
    expect(await hook.shot()).toBeNull();
    expect(hook.shotWhy()).toBe("no frame is up to take a picture in");
    let open: number | null = null;
    let asked = 0;
    let found: HTMLCanvasElement[] | string = "no foldable is up";
    own.tuneLive({
      open: () => {
        asked++;
        return open;
      },
      pictures: async () => found,
    });
    // With no one listening the hinge is not asked where it is.
    own.hingeMoved();
    expect(asked).toBe(0);
    expect(hook.angle()).toBeNull();
    open = 1;
    expect(hook.angle()).toBe(180);
    let heard = 0;
    const stop = hook.subscribe(() => heard++);
    // Not of the angle it has as they start to listen, nor of one it keeps.
    own.hingeMoved();
    expect(heard).toBe(0);
    open = 0.25;
    own.hingeMoved();
    own.hingeMoved();
    expect(heard).toBe(1);
    expect(hook.angle()).toBe(45);
    open = null;
    own.hingeMoved();
    expect(heard).toBe(2);
    stop();
    open = 0;
    own.hingeMoved();
    expect(heard).toBe(2);
    expect(hook.angle()).toBe(0);

    /** A canvas that gives a PNG, or will not let its picture out. */
    const canvas = (width: number, height: number, tainted = false) =>
      ({
        width,
        height,
        toBlob(done: (blob: Blob | null) => void, type: string): void {
          if (tainted) throw new DOMException("The canvas has been tainted by cross-origin data.", "SecurityError");
          done(new Blob([`${width}x${height}`], { type }));
        },
      }) as unknown as HTMLCanvasElement;
    expect(await hook.shot()).toBeNull();
    expect(hook.shotWhy()).toBe("no foldable is up");
    found = [canvas(951, 669)];
    const png = await hook.shot();
    expect(png?.type).toBe("image/png");
    expect(await png?.text()).toBe("951x669");
    expect(hook.shotWhy()).toBe("the picture came out as a PNG, 951 by 669 px");
    // A picture the browser will not let out is none, and nothing is thrown.
    found = [canvas(951, 669, true)];
    expect(await hook.shot()).toBeNull();
    expect(hook.shotWhy()).toStartWith("the browser will not let the picture out: SecurityError, as a picture, video or canvas from another origin");
    // The next one there is comes out instead.
    found = [canvas(951, 669, true), canvas(238, 167)];
    expect(await (await hook.shot())?.text()).toBe("238x167");
    expect(hook.shotWhy()).toBe("the picture came out as a PNG, 238 by 167 px");
    // One the browser makes no PNG of, and a frame that throws as it is asked.
    found = [{ width: 0, height: 0, toBlob: (done: (blob: Blob | null) => void) => done(null) } as unknown as HTMLCanvasElement];
    expect(await hook.shot()).toBeNull();
    expect(hook.shotWhy()).toBe("the browser made no PNG of the picture");
    own.tuneLive({ open: () => null, pictures: () => Promise.reject(new TypeError("gone")) });
    expect(await hook.shot()).toBeNull();
    expect(hook.shotWhy()).toBe("the picture could not be taken: TypeError");
    // Each a new one: none is kept.
    own.tuneLive({ open: () => null, pictures: async () => [canvas(4, 4)] });
    expect(await hook.shot()).not.toBe(await hook.shot());
  });

  test("are what the ends' blur and the free edge's dark are drawn by", () => {
    foldTune.set("edgeHinge", 1);
    foldTune.set("edgeFree", 2);
    expect(screenLook(0.9, 10).edge).toEqual([10, 20]);
    foldTune.set("darkMost", 0.2);
    expect(freeDepth(0.5)).toBe(0.2);
    expect(screenLook(0.5, 0).dark).toBe(0.2);
    foldTune.set("darkFrom", 0.6);
    expect(freeBand(0.6)).toBe(0);
    expect(freeBand(0.7)).toBeGreaterThan(0);
    // Its stops stay in order along the half, however wide its strip.
    foldTune.set("darkBand", 0.5);
    const stops = freeShades(0.5, 1).map(([at]) => at);
    expect(stops).toEqual([...stops].sort((a, b) => a - b));
  });

  test("switch the shades and the blur off apart, for finding what draws a line, in WebGL2 and in the layers", () => {
    for (const [key, value] of [["wipeShade", 1.5], ["darkMost", 0.7], ["farShade", 1]] as const) foldTune.set(key, value);
    const lit = screenLook(0.75, 30, 0.9, "inner");
    expect(lit.dark).toBeGreaterThan(0);
    expect(lit.lit.every((part) => part > 0)).toBe(true);
    foldTune.set("shadeOn", 0);
    const plain = screenLook(0.75, 30, 0.9, "inner");
    expect(plain).toEqual({ ...lit, dark: 0, lit: [0, 0, 0] });
    expect(freeShades(0.6, 0.5)).toEqual([]);
    expect(paneLook("inner", 0.6, 0.5).flat).toEqual([[0, 0]]);
    foldTune.set("blurOn", 0);
    expect(screenLook(0.75, 30, 0.9, "inner")).toEqual({ ...plain, peak: 0, edge: [0, 0] });
    expect(paneLook("inner", 0.6).blurs.every((blur) => blur === null)).toBe(true);
    foldTune.set("shadeOn", 1);
    expect(screenLook(0.75, 30, 0.9, "inner")).toEqual({ ...lit, peak: 0, edge: [0, 0] });
    // On is whatever is nearer 1.
    foldTune.set("blurOn", 0.6);
    expect(screenLook(0.75, 30, 0.9, "inner")).toEqual(lit);
  });

  test("say that no fold has drawn till one has", async () => {
    // The table as a page first loads it, whatever the other tests have drawn.
    const path = "../src/engine/foldtune.ts?fresh";
    const fresh: typeof import("../src/engine/foldtune") = await import(path);
    expect(fresh.foldTune).not.toBe(foldTune);
    expect(fresh.foldTune.info()).toEqual({ drawnBy: "none", why: "no fold has drawn yet" });
    let heard = 0;
    const stop = foldTune.subscribe(() => heard++);
    drew("layers", "this browser has no WebGL2");
    drew("layers", "this browser has no WebGL2");
    expect(heard).toBe(1);
    expect(foldTune.info()).toEqual({ drawnBy: "layers", why: "this browser has no WebGL2" });
    // The folds' own watchers hear of numbers only: what draws the page is no number of theirs.
    let own = 0;
    const end = watchTune(() => own++);
    const before = tuneChanges();
    drew("webgl", BY_WEBGL);
    expect(heard).toBe(2);
    expect(own).toBe(0);
    expect(tuneChanges()).toBe(before);
    stop();
    end();
    drew("layers", "the WebGL2 context was lost");
    expect(heard).toBe(2);
  });

  test("go on the page's window, where it has one", () => {
    const own = Object.getOwnPropertyDescriptor(globalThis, "window");
    const page = {};
    try {
      Reflect.deleteProperty(globalThis, "window");
      expect(() => installTune()).not.toThrow();
      Object.defineProperty(globalThis, "window", { configurable: true, value: page });
      installTune();
      expect(Reflect.get(page, TUNE_KEY)).toBe(foldTune);
      expect(TUNE_KEY === Symbol.for("devknobs.foldtune")).toBe(true);
    } finally {
      if (own) Object.defineProperty(globalThis, "window", own);
      else Reflect.deleteProperty(globalThis, "window");
    }
  });
});
