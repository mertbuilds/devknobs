import { describe, expect, test } from "bun:test";
import { UNFRAMED } from "../src/engine/frame";
import {
  type Corners,
  coverAt,
  ease,
  FADE_CURVE,
  fitCorners,
  holeAt,
  holePath,
  lerpRect,
  MAT_CURVE,
  MORPH_TIME,
  moves,
  plan,
  poseAt,
  poseOf,
  posePoint,
  poseTransform,
  ROUND,
  readCorners,
  rounded,
  type Step,
  sameHole,
  sameRect,
  sequence,
  shapeOf,
  TURN_COVER,
  TURN_CURVE,
  turnedPose,
  turnOf,
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
      radius: [0, 0, 0, 0],
    });
  });

  test("rounds the window's corners in place before it closes in", () => {
    const whole = windowRect({ width: 1200, height: 800 });
    expect(rounded(whole)).toEqual({ ...whole, radius: [ROUND, ROUND, ROUND, ROUND] });
    expect(sameHole(rounded(whole), whole)).toBe(false);
    const near: Corners = [ROUND, ROUND + 0.2, ROUND, ROUND - 0.2];
    expect(sameHole(rounded(whole), { ...whole, radius: near })).toBe(true);
    expect(sameHole(rounded(whole), { ...whole, radius: [ROUND, ROUND, ROUND, 0] })).toBe(false);
  });

  test("moves from one opening to the next on the mat's curve, each corner too, and stays at the end", () => {
    const from = rounded(windowRect({ width: 1500, height: 800 }));
    // The iPhone Duo's cover screen, fitted: the hinge's corners far less round.
    const to = { x: 579, y: 69, width: 342, height: 744, radius: [6.8, 49.3, 49.3, 6.8] as Corners };
    expect(holeAt(from, to, 0, MORPH_TIME.mat)).toEqual(from);
    const early = holeAt(from, to, MORPH_TIME.mat / 4, MORPH_TIME.mat);
    const share = ease(MAT_CURVE, 0.25);
    const corner = (end: number) => ROUND + (end - ROUND) * share;
    expect(early).toMatchObject(lerpRect(from, to, share));
    [6.8, 49.3, 49.3, 6.8].forEach((end, at) => {
      expect(early.radius[at]).toBeCloseTo(corner(end), 9);
    });
    expect(early.x).toBeGreaterThan(from.x);
    expect(early.x).toBeLessThan(to.x);
    expect(early.radius[0]).toBeLessThan(ROUND);
    expect(early.radius[1]).toBeGreaterThan(ROUND);
    expect(sameHole(holeAt(from, to, MORPH_TIME.mat, MORPH_TIME.mat), to)).toBe(true);
    expect(sameHole(holeAt(from, to, MORPH_TIME.mat * 3, MORPH_TIME.mat), to)).toBe(true);
    expect(holeAt(from, to, 0, 0)).toEqual(to);
    // From one device's corners to the next: each corner goes its own way.
    const pixel = { ...to, radius: [46, 46, 46, 46] as Corners };
    const half = holeAt(to, pixel, MORPH_TIME.mat / 2, MORPH_TIME.mat).radius;
    expect(half[0]).toBeGreaterThan(6.8);
    expect(half[1]).toBeLessThan(49.3);
  });

  test("reads each corner of a css radius", () => {
    expect(readCorners("62px")).toEqual([62, 62, 62, 62]);
    expect(readCorners("8px 58px")).toEqual([8, 58, 8, 58]);
    expect(readCorners("8px 58px 40px")).toEqual([8, 58, 40, 58]);
    expect(readCorners("8px 58px 58px 8px")).toEqual([8, 58, 58, 8]);
    expect(readCorners("10px 20px / 5px")).toEqual([10, 20, 10, 20]);
    expect(readCorners("")).toEqual([0, 0, 0, 0]);
  });

  test("fits the corners as css does, none rounder than half the short side", () => {
    expect(fitCorners({ x: 0, y: 0, width: 342, height: 744 }, [8, 58, 58, 8])).toEqual([8, 58, 58, 8]);
    // Two corners on a side that would overlap shrink, all four by as much.
    expect(fitCorners({ x: 0, y: 0, width: 100, height: 400 }, [20, 80, 80, 20])).toEqual([20, 50, 50, 20]);
    expect(fitCorners({ x: 0, y: 0, width: 10, height: 4 }, [9, 9, 9, 9])).toEqual([2, 2, 2, 2]);
    expect(fitCorners({ x: 0, y: 0, width: 10, height: 4 }, [-3, 0, 0, 0])).toEqual([0, 0, 0, 0]);
  });

  test("cuts the opening out of a square past the whole box, each corner as round as asked", () => {
    expect(holePath({ x: 10.004, y: 20, width: 100, height: 50, radius: [8, 8, 8, 8] })).toBe(
      'path(evenodd, "M-100000 -100000H100000V100000H-100000Z' +
        'M18 20H102A8 8 0 0 1 110 28V62A8 8 0 0 1 102 70H18A8 8 0 0 1 10 62V28A8 8 0 0 1 18 20Z")',
    );
    expect(holePath({ x: 0, y: 0, width: 120, height: 200, radius: [8, 58, 40, 0] })).toContain(
      "M8 0H62A58 58 0 0 1 120 58V160A40 40 0 0 1 80 200H0A0 0 0 0 1 0 200V8A8 8 0 0 1 8 0Z",
    );
    // Square corners, and corners no rounder than half the opening's short side.
    const square: Corners = [0, 0, 0, 0];
    expect(holePath({ x: 0, y: 0, width: 10, height: 4, radius: square })).toContain(
      "M0 0H10A0 0 0 0 1 10 0",
    );
    const big: Corners = [9, 9, 9, 9];
    expect(holePath({ x: 0, y: 0, width: 10, height: 4, radius: big })).toContain("M2 0H8A2 2 0 0 1 10 2");
  });
});

describe("a device that turns", () => {
  test("turns for the same device held the other way, anticlockwise to be held across", () => {
    expect(turnOf("iphone-18-pro|portrait", "iphone-18-pro|landscape")).toBe(-90);
    expect(turnOf("iphone-18-pro|landscape", "iphone-18-pro|portrait")).toBe(90);
    expect(turnOf("iphone-18-pro|portrait", "pixel-10|landscape")).toBe(0);
    expect(turnOf("iphone-18-pro|portrait", "iphone-18-pro|portrait")).toBe(0);
    expect(turnOf("closed", "iphone-18-pro|portrait")).toBe(0);
    expect(turnOf("frame", "closed")).toBe(0);
  });

  // The Duo's cover screen fitted upright, and where it is drawn held across, a bit bigger.
  const upright = { x: 579, y: 69, width: 342, height: 498 };
  const across = { x: 476, y: 162, width: 548.4, height: 376.6 };
  const corners = (rect: typeof upright) => [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height },
  ];

  test("stands where it is at the start, and on the screen held across at the end", () => {
    const from = poseOf(upright);
    const to = turnedPose(upright, across, -90);
    expect(poseAt(from, to, 0, MORPH_TIME.turn)).toEqual(from);
    expect(poseAt(from, to, MORPH_TIME.turn * 2, MORPH_TIME.turn)).toEqual(to);
    for (const point of corners(upright)) {
      const at = posePoint(upright, from, point);
      expect(at.x).toBeCloseTo(point.x, 6);
      expect(at.y).toBeCloseTo(point.y, 6);
    }
    // Anticlockwise, the top right corner comes to the top left, and the top left to the bottom left.
    const [topLeft, topRight] = corners(upright).map((point) => posePoint(upright, to, point));
    expect(topRight?.x).toBeCloseTo(across.x, 0);
    expect(topRight?.y).toBeCloseTo(across.y, 0);
    expect(topLeft?.x).toBeCloseTo(across.x, 0);
    expect(topLeft?.y).toBeCloseTo(across.y + across.height, 0);
  });

  test("turns on its curve, its middle and size along with it", () => {
    const from = poseOf(upright);
    const to = turnedPose(upright, across, -90);
    const half = poseAt(from, to, MORPH_TIME.turn / 2, MORPH_TIME.turn);
    const share = ease(TURN_CURVE, 0.5);
    expect(half.angle).toBeCloseTo(-90 * share, 6);
    expect(half.scale).toBeCloseTo(1 + (to.scale - 1) * share, 6);
    expect(ease(TURN_CURVE, 0.1)).toBeLessThan(0.1);
    expect(ease(TURN_CURVE, 0.9)).toBeGreaterThan(0.9);
  });

  test("covers the page in the turn's last part only, and uncovers a turn back from the start", () => {
    const time = MORPH_TIME.turn;
    expect(coverAt(0, 1, 0, time)).toBe(0);
    expect(coverAt(0, 1, time * TURN_COVER, time)).toBe(0);
    const late = coverAt(0, 1, time * 0.8, time);
    expect(late).toBeGreaterThan(0);
    expect(late).toBeLessThan(1);
    expect(coverAt(0, 1, time, time)).toBe(1);
    // Half over as a turn back starts: it comes off at once, and is off at the end.
    expect(coverAt(0.5, 0, time * 0.1, time)).toBeLessThan(0.5);
    expect(coverAt(0.5, 0, time, time)).toBe(0);
    expect(coverAt(1, 0, MORPH_TIME.uncover, MORPH_TIME.uncover)).toBe(0);
  });

  test("moves the case and the screen as one: the transform puts the screen where the pose says", () => {
    // The wrapper's top left in the letterbox, drawn at 0.85, and the screen at its inset.
    const corner = { x: 560, y: 50 };
    const base = 0.85;
    const to = turnedPose(upright, across, -90);
    const pose = poseAt(poseOf(upright), to, MORPH_TIME.turn / 3, MORPH_TIME.turn);
    const transform = poseTransform(upright, pose, corner, base);
    const [, tx = 0, ty = 0, angle = 0, scale = 0] =
      /translate\((.+)px, (.+)px\) rotate\((.+)deg\) scale\((.+)\)/.exec(transform)?.map(Number) ?? [];
    // A point of the wrapper drawn at `local`, as the browser places it with that transform.
    const place = (local: { x: number; y: number }) => {
      const turn = (angle * Math.PI) / 180;
      const x = local.x * scale;
      const y = local.y * scale;
      return {
        x: corner.x + tx + x * Math.cos(turn) - y * Math.sin(turn),
        y: corner.y + ty + x * Math.sin(turn) + y * Math.cos(turn),
      };
    };
    for (const point of corners(upright)) {
      const local = { x: (point.x - corner.x) / base, y: (point.y - corner.y) / base };
      const drawn = place(local);
      const want = posePoint(upright, pose, point);
      expect(Math.abs(drawn.x - want.x)).toBeLessThan(0.02);
      expect(Math.abs(drawn.y - want.y)).toBeLessThan(0.02);
    }
    expect(poseTransform(upright, poseOf(upright), corner, base)).toBe(
      "translate(0px, 0px) rotate(0deg) scale(0.85)",
    );
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
  test("brings a device up: the page fades, the corners round, the mat closes in, the case and page fade in", () => {
    const steps = plan(CLOSED, "open");
    expect(steps).toEqual([
      { kind: "fade", veil: 1, time: MORPH_TIME.out },
      { kind: "cover" },
      { kind: "mat", to: "round", time: MORPH_TIME.round },
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

  test("takes a device away the way it came, the corners squaring off at the window", () => {
    expect(plan(OPEN, "closed")).toEqual([
      { kind: "fade", content: 0, time: MORPH_TIME.out },
      { kind: "mat", to: "round", time: MORPH_TIME.mat },
      { kind: "mat", to: "window", time: MORPH_TIME.round },
      { kind: "release" },
      { kind: "fade", veil: 0, time: MORPH_TIME.in },
      { kind: "end" },
    ]);
  });

  test("starts a change cut short from where it was", () => {
    // Away again while the page was still fading: it only comes back.
    expect(kinds(plan({ ...CLOSED, veil: 0.5 }, "closed"))).toEqual(["release", "fade", "end"]);
    // Away while the mat closed in: it goes back to the edges first, and squares off there.
    expect(kinds(plan({ veil: 1, content: 0, covered: true, open: false }, "closed"))).toEqual([
      "mat",
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
    expect(done).toEqual(["fade", "mat", "mat", "release", "fade", "end"]);
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
