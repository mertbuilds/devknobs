import { describe, expect, test } from "bun:test";
import { UNFRAMED } from "../src/engine/frame";
import {
  ease,
  FADE_CURVE,
  holePath,
  lerpRect,
  MAT_CURVE,
  MORPH_TIME,
  moves,
  plan,
  type Step,
  sameRect,
  sequence,
  shapeOf,
  windowRect,
} from "../src/engine/morph";

const NONE = { ...UNFRAMED, device: "none", orientation: "portrait" } as const;
const PHONE = { ...NONE, device: "iphone-18-pro", width: 402, height: 874 } as const;

/** What shows with no frame, and with a frame as it stays. */
const CLOSED = { veil: 0, content: 0, covered: false, open: true };
const OPEN = { veil: 1, content: 1, covered: true, open: false };

describe("ease", () => {
  test("starts at 0 and ends at 1, and a straight curve is the time itself", () => {
    expect(ease(MAT_CURVE, 0)).toBe(0);
    expect(ease(MAT_CURVE, 1)).toBe(1);
    expect(ease([0, 0, 1, 1], 0.3)).toBeCloseTo(0.3, 4);
  });

  test("goes the mat's way quickly and settles slowly, and never back", () => {
    expect(ease(MAT_CURVE, 0.25)).toBeGreaterThan(0.6);
    let last = 0;
    for (let time = 0.05; time <= 1; time += 0.05) {
      const now = ease(FADE_CURVE, time);
      expect(now).toBeGreaterThanOrEqual(last);
      last = now;
    }
  });

  test("holds a time out of range at its end", () => {
    expect(ease(FADE_CURVE, -1)).toBe(0);
    expect(ease(FADE_CURVE, 2)).toBe(1);
  });
});

describe("the mat's opening", () => {
  test("goes from one rect to the next by its share", () => {
    const from = { x: 0, y: 0, width: 1000, height: 800 };
    const to = { x: 300, y: 100, width: 400, height: 600 };
    expect(lerpRect(from, to, 0.5)).toEqual({ x: 150, y: 50, width: 700, height: 700 });
    expect(sameRect(lerpRect(from, to, 1), to)).toBe(true);
  });

  test("is the whole window a px past each edge", () => {
    expect(windowRect({ width: 1200, height: 800 })).toEqual({
      x: -1,
      y: -1,
      width: 1202,
      height: 802,
    });
  });

  test("cuts the opening out of the whole box, with as many points every time", () => {
    const path = holePath({ x: 10.004, y: 20, width: 100, height: 50 });
    expect(path).toBe(
      "polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, 10px 20px, 110px 20px, 110px 70px, 10px 70px, 10px 20px)",
    );
    const points = (text: string) => text.split(",").length;
    expect(points(holePath(windowRect({ width: 1, height: 1 })))).toBe(points(path));
  });
});

describe("what moves", () => {
  test("names the frame by its device and the way it is held", () => {
    expect(shapeOf(NONE)).toBe("closed");
    expect(shapeOf({ ...NONE, width: 390 })).toBe("frame");
    expect(shapeOf(PHONE)).toBe("iphone-18-pro|portrait");
    expect(shapeOf({ ...PHONE, orientation: "landscape" })).toBe("iphone-18-pro|landscape");
  });

  test("moves for a device that comes, goes, changes or turns", () => {
    expect(moves("closed", "iphone-18-pro|portrait")).toBe(true);
    expect(moves("iphone-18-pro|portrait", "pixel-10|portrait")).toBe(true);
    expect(moves("iphone-18-pro|portrait", "iphone-18-pro|landscape")).toBe(true);
    expect(moves("iphone-18-pro|portrait", "closed")).toBe(true);
    expect(moves("frame", "iphone-18-pro|portrait")).toBe(true);
  });

  test("changes a width, a height or a frame with no device in place", () => {
    expect(moves("frame", "frame")).toBe(false);
    expect(moves("closed", "frame")).toBe(false);
    expect(moves("frame", "closed")).toBe(false);
    expect(moves("iphone-18-pro|portrait", "iphone-18-pro|portrait")).toBe(false);
  });
});

const kinds = (steps: Step[]) => steps.map((step) => step.kind);

describe("plan", () => {
  test("brings a device up: the page fades, the mat closes in, the case and page fade in", () => {
    const steps = plan(CLOSED, "open");
    expect(steps).toEqual([
      { kind: "fade", veil: 1, time: MORPH_TIME.out },
      { kind: "cover" },
      { kind: "layout" },
      { kind: "mat", to: "screen", time: MORPH_TIME.mat },
      { kind: "wait" },
      { kind: "fade", content: 1, time: MORPH_TIME.in },
      { kind: "end" },
    ]);
  });

  test("goes from one device to the next through the mat, the page drawn once it is hidden", () => {
    expect(plan(OPEN, "open")).toEqual([
      { kind: "fade", content: 0, time: MORPH_TIME.out },
      { kind: "layout" },
      { kind: "mat", to: "screen", time: MORPH_TIME.mat },
      { kind: "wait" },
      { kind: "fade", content: 1, time: MORPH_TIME.in },
      { kind: "end" },
    ]);
  });

  test("takes a device away the way it came", () => {
    expect(plan(OPEN, "closed")).toEqual([
      { kind: "fade", content: 0, time: MORPH_TIME.out },
      { kind: "mat", to: "window", time: MORPH_TIME.mat },
      { kind: "release" },
      { kind: "fade", veil: 0, time: MORPH_TIME.in },
      { kind: "end" },
    ]);
  });

  test("starts a change cut short from where it was", () => {
    // Away again while the page was still fading: it only comes back.
    expect(kinds(plan({ ...CLOSED, veil: 0.5 }, "closed"))).toEqual(["release", "fade", "end"]);
    // Away while the mat closed in: it goes back to the edges first.
    expect(kinds(plan({ veil: 1, content: 0, covered: true, open: false }, "closed"))).toEqual([
      "mat",
      "release",
      "fade",
      "end",
    ]);
    // Another device while the case faded in: out from there, and on to the new one.
    expect(plan({ ...OPEN, content: 0.4 }, "open")[0]).toEqual({
      kind: "fade",
      content: 0,
      time: MORPH_TIME.out,
    });
  });
});

describe("sequence", () => {
  test("runs each step once the last is done", async () => {
    const done: string[] = [];
    const run = sequence(plan(OPEN, "closed"), "closed");
    await run.run(async (step) => {
      await Bun.sleep(0);
      done.push(step.kind);
    });
    expect(done).toEqual(["fade", "mat", "release", "fade", "end"]);
    expect(run.live()).toBe(false);
  });

  test("starts no step after a cancel, and knows the ones left", async () => {
    const done: string[] = [];
    const run = sequence(plan(OPEN, "open"), "open");
    const going = run.run(async (step) => {
      done.push(step.kind);
      if (step.kind === "mat") run.cancel();
      await Bun.sleep(0);
    });
    await going;
    expect(done).toEqual(["fade", "layout", "mat"]);
    expect(kinds(run.rest())).toEqual(["mat", "wait", "fade", "end"]);
    expect(run.live()).toBe(false);
  });
});
