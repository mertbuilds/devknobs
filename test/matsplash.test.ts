import { describe, expect, test } from "bun:test";
import type { Point } from "../src/engine/mat";
import { pathOf, planOf, rimsAt, seeded, segments, splashOf } from "../src/engine/matsplash";

const SIZE = { width: 1200, height: 860 };
const SCREEN = { x: 420, y: 60, width: 360, height: 760 };

/** A point `t` of the way along a cubic segment. */
function on([a, b, c, d]: readonly [Point, Point, Point, Point], t: number): Point {
  const u = 1 - t;
  const x = u ** 3 * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t ** 3 * d.x;
  const y = u ** 3 * a.y + 3 * u * u * t * b.y + 3 * u * t * t * c.y + t ** 3 * d.y;
  return { x, y };
}

describe("seeded", () => {
  test("gives the same numbers for the same seed, all from 0 to 1", () => {
    const a = seeded(7);
    const b = seeded(7);
    const numbers = Array.from({ length: 50 }, () => a());
    expect(Array.from({ length: 50 }, () => b())).toEqual(numbers);
    expect(numbers.every((n) => n >= 0 && n < 1)).toBe(true);
    expect(seeded(8)()).not.toBe(numbers[0]);
  });
});

describe("splashOf", () => {
  test("is the same for the same seed, and another for another", () => {
    expect(splashOf(42)).toEqual(splashOf(42));
    const plan = planOf(splashOf(42), SCREEN, SIZE);
    const path = (seed: number) => pathOf(rimsAt(splashOf(seed), plan, 0.4));
    expect(path(42)).toBe(path(42));
    expect(path(43)).not.toBe(path(42));
  });

  test("has a few waves from 2 to 7 times round, and two to four drops", () => {
    for (let seed = 0; seed < 50; seed++) {
      const splash = splashOf(seed);
      expect(splash.waves).toHaveLength(4);
      expect(splash.waves.every((wave) => wave.k >= 2 && wave.k <= 7)).toBe(true);
      expect(new Set(splash.waves.map((wave) => wave.k)).size).toBe(4);
      expect(splash.drops.length).toBeGreaterThanOrEqual(2);
      expect(splash.drops.length).toBeLessThanOrEqual(4);
    }
  });
});

describe("planOf", () => {
  test("starts at the middle of the screen and ends past the farthest corner", () => {
    const splash = splashOf(1);
    const plan = planOf(splash, SCREEN, SIZE);
    expect(plan.x).toBe(600);
    expect(plan.y).toBe(440);
    expect(plan.radius).toBeGreaterThan(Math.hypot(600, 440));
  });

  test("reaches the far corner from a screen off to one side", () => {
    const plan = planOf(splashOf(1), { x: 0, y: 0, width: 100, height: 100 }, SIZE);
    expect(plan.radius).toBeGreaterThan(Math.hypot(1150, 810));
  });
});

describe("rimsAt", () => {
  test("is nothing at the start", () => {
    const splash = splashOf(3);
    const plan = planOf(splash, SCREEN, SIZE);
    for (const rim of rimsAt(splash, plan, 0)) {
      expect(rim.every((point) => point.x === plan.x && point.y === plan.y)).toBe(true);
    }
  });

  test("covers the whole letterbox at the end, curves and all, whatever the seed", () => {
    for (let seed = 0; seed < 200; seed++) {
      const splash = splashOf(seed);
      const plan = planOf(splash, SCREEN, SIZE);
      const [main = []] = rimsAt(splash, plan, 1);
      const far = Math.max(
        ...[0, SIZE.width].flatMap((x) => [0, SIZE.height].map((y) => Math.hypot(x - plan.x, y - plan.y))),
      );
      let nearest = Infinity;
      for (const segment of segments(main)) {
        for (let t = 0; t <= 1; t += 0.05) {
          const point = on(segment, t);
          nearest = Math.min(nearest, Math.hypot(point.x - plan.x, point.y - plan.y));
        }
      }
      expect(nearest).toBeGreaterThan(far);
    }
  });

  test("grows outward all the way", () => {
    const splash = splashOf(9);
    const plan = planOf(splash, SCREEN, SIZE);
    let last = 0;
    for (let time = 0.05; time <= 1; time += 0.05) {
      const [main = []] = rimsAt(splash, plan, time);
      const mean = main.reduce((sum, p) => sum + Math.hypot(p.x - plan.x, p.y - plan.y), 0) / main.length;
      expect(mean).toBeGreaterThan(last);
      last = mean;
    }
  });
});

describe("segments", () => {
  test("make a closed curve with no corners", () => {
    const splash = splashOf(5);
    const [main = []] = rimsAt(splash, planOf(splash, SCREEN, SIZE), 0.5);
    const curve = segments(main);
    expect(curve).toHaveLength(main.length);
    curve.forEach((segment, i) => {
      const next = curve[(i + 1) % curve.length];
      if (!next) throw new Error("no next segment");
      // Each segment starts where the last ended, and leaves it the way the last came in.
      expect(next[0]).toEqual(segment[3]);
      expect(next[1].x - next[0].x).toBeCloseTo(segment[3].x - segment[2].x);
      expect(next[1].y - next[0].y).toBeCloseTo(segment[3].y - segment[2].y);
    });
  });
});

describe("pathOf", () => {
  test("draws each rim as one closed curve of cubic segments", () => {
    const splash = splashOf(11);
    const rims = rimsAt(splash, planOf(splash, SCREEN, SIZE), 0.3);
    const path = pathOf(rims);
    expect(path.match(/M/g)).toHaveLength(rims.length);
    expect(path.match(/Z/g)).toHaveLength(rims.length);
    expect(path).not.toMatch(/[LQA]/);
    expect(path.match(/C/g)).toHaveLength(rims.reduce((sum, rim) => sum + rim.length, 0));
  });
});
