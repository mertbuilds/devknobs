import { describe, expect, test } from "bun:test";
import type { SideValue } from "../src/types";
import { readColumn } from "../src/ui/column";
import {
  type Aim,
  createDockSlide,
  createSequence,
  DOCK_SLIDE,
  restOf,
  type SlideAim,
} from "../src/ui/dockslide";
import { CSS } from "../src/ui/styles";

const OUT: Aim = { open: true, handle: true };
const AWAY: Aim = { open: false, handle: true };
const BARE: Aim = { open: false, handle: false };

describe("restOf", () => {
  test("is the column out with no handle, or away with the handle in where one shows", () => {
    expect(restOf(OUT)).toEqual({ column: 1, handle: 0 });
    expect(restOf(AWAY)).toEqual({ column: 0, handle: 1 });
    expect(restOf(BARE)).toEqual({ column: 0, handle: 0 });
    expect(restOf({ open: true, handle: false })).toEqual({ column: 1, handle: 0 });
  });
});

describe("the sequence", () => {
  /** What shows every 10 ms from `from` to `to`. */
  function sample(sequence: ReturnType<typeof createSequence>, from: number, to: number) {
    const seen = [];
    for (let time = from; time <= to; time += 10) seen.push({ time, ...sequence.at(time) });
    return seen;
  }

  test("closing, the column goes all the way off first, and only then the handle comes in", () => {
    const sequence = createSequence(OUT);
    sequence.go(AWAY, 1000, false);
    const seen = sample(sequence, 1000, 1000 + 2 * DOCK_SLIDE);
    // The handle shows nothing for as long as any of the column does.
    for (const at of seen) if (at.column > 0) expect(at.handle).toBe(0);
    // Each only goes its one way.
    for (let i = 1; i < seen.length; i++) {
      expect(seen[i]?.column).toBeLessThanOrEqual(seen[i - 1]?.column ?? 1);
      expect(seen[i]?.handle).toBeGreaterThanOrEqual(seen[i - 1]?.handle ?? 0);
    }
    expect(seen.find((at) => at.column === 0)?.time).toBe(1000 + DOCK_SLIDE);
    expect(seen.find((at) => at.handle === 1)?.time).toBe(1000 + 2 * DOCK_SLIDE);
    expect(seen.some((at) => at.handle > 0 && at.handle < 1)).toBe(true);
    expect(sequence.resting()).toBe(true);
  });

  test("the column is on its way until it is off, and the handle's turn is not the column's", () => {
    const sequence = createSequence(OUT);
    sequence.go(AWAY, 0, false);
    sequence.at(DOCK_SLIDE - 1);
    expect([sequence.moving(), sequence.resting(), sequence.coming()]).toEqual([true, false, true]);
    sequence.at(DOCK_SLIDE);
    expect([sequence.moving(), sequence.resting()]).toEqual([false, false]);
    sequence.at(2 * DOCK_SLIDE);
    expect([sequence.moving(), sequence.resting()]).toEqual([false, true]);
  });

  test("opening, the column comes out at once and the handle goes off as it does", () => {
    const sequence = createSequence(AWAY);
    sequence.go(OUT, 0, false);
    const half = sequence.at(DOCK_SLIDE / 2);
    expect(half.column).toBeGreaterThan(0);
    expect(half.column).toBeLessThan(1);
    expect(half.handle).toBeCloseTo(1 - half.column, 10);
    expect(sequence.coming()).toBe(false);
    expect(sequence.at(DOCK_SLIDE)).toEqual({ column: 1, handle: 0 });
    expect(sequence.resting()).toBe(true);
  });

  test("eases out, as the stylesheet's slides do", () => {
    const sequence = createSequence(OUT);
    sequence.go(BARE, 0, false);
    // More than half the way in half the time.
    expect(sequence.at(DOCK_SLIDE / 2).column).toBeLessThan(0.5);
  });

  test("with no handle shown, nothing comes in after the column", () => {
    const sequence = createSequence({ open: true, handle: false });
    sequence.go(BARE, 0, false);
    expect(sequence.coming()).toBe(false);
    for (const at of sample(sequence, 0, 3 * DOCK_SLIDE)) expect(at.handle).toBe(0);
    expect(sequence.at(DOCK_SLIDE)).toEqual({ column: 0, handle: 0 });
    expect(sequence.resting()).toBe(true);
  });

  test("with less motion it lands at once, both ways", () => {
    const sequence = createSequence(OUT);
    sequence.go(AWAY, 0, true);
    expect(sequence.at(0)).toEqual({ column: 0, handle: 1 });
    expect(sequence.resting()).toBe(true);
    sequence.go(OUT, 5, true);
    expect(sequence.at(5)).toEqual({ column: 1, handle: 0 });
    expect(sequence.resting()).toBe(true);
  });

  test("opened again while it closes, the column turns round where it is and no handle ever shows", () => {
    const sequence = createSequence(OUT);
    sequence.go(AWAY, 0, false);
    const turned = sequence.at(60).column;
    sequence.go(OUT, 60, false);
    expect(sequence.at(60).column).toBe(turned);
    const seen = sample(sequence, 60, 60 + DOCK_SLIDE);
    for (const at of seen) {
      expect(at.column).toBeGreaterThanOrEqual(turned);
      expect(at.handle).toBe(0);
    }
    // The way back is as long as what is left of it, no longer.
    const back = seen.find((at) => at.column === 1)?.time ?? 0;
    expect(back).toBeGreaterThan(60);
    expect(back - 60).toBeLessThan(DOCK_SLIDE * (1 - turned) + 10);
    expect(sequence.resting()).toBe(true);
  });

  test("closed again while it opens, the handle stays where it got to until the column is off", () => {
    const sequence = createSequence(AWAY);
    sequence.go(OUT, 0, false);
    const turned = sequence.at(60);
    sequence.go(AWAY, 60, false);
    let landed = 0;
    for (const at of sample(sequence, 60, 60 + DOCK_SLIDE)) {
      if (at.column > 0) expect(at.handle).toBe(turned.handle);
      else landed ||= at.time;
    }
    expect(landed).toBeGreaterThan(60);
    expect(sequence.at(landed + DOCK_SLIDE)).toEqual({ column: 0, handle: 1 });
    expect(sequence.resting()).toBe(true);
  });

  test("opened while the handle comes in, the handle goes back off from where it is", () => {
    const sequence = createSequence(OUT);
    sequence.go(AWAY, 0, false);
    // The handle sets off in the frame the column lands in.
    expect(sequence.at(DOCK_SLIDE)).toEqual({ column: 0, handle: 0 });
    const turned = sequence.at(DOCK_SLIDE + 60);
    expect(turned.column).toBe(0);
    expect(turned.handle).toBeGreaterThan(0);
    sequence.go(OUT, DOCK_SLIDE + 60, false);
    const next = sequence.at(DOCK_SLIDE + 70);
    expect(next.handle).toBeLessThan(turned.handle);
    expect(next.column).toBeGreaterThan(0);
    expect(sequence.at(2 * DOCK_SLIDE + 60)).toEqual({ column: 1, handle: 0 });
    expect(sequence.resting()).toBe(true);
  });

  test("a handle shown or hidden beside a closed column comes and goes alone", () => {
    const sequence = createSequence(BARE);
    sequence.go(AWAY, 0, false);
    expect(sequence.moving()).toBe(false);
    expect(sequence.at(DOCK_SLIDE)).toEqual({ column: 0, handle: 1 });
    sequence.go(BARE, 200, false);
    expect(sequence.moving()).toBe(false);
    expect(sequence.at(200 + DOCK_SLIDE)).toEqual({ column: 0, handle: 0 });
    expect(sequence.resting()).toBe(true);
  });

  test("the same aim again changes nothing on the way", () => {
    const sequence = createSequence(OUT);
    sequence.go(AWAY, 0, false);
    const before = sequence.at(40);
    sequence.go(AWAY, 40, false);
    sequence.go(AWAY, 40, true);
    expect(sequence.at(40)).toEqual(before);
    expect(sequence.at(DOCK_SLIDE).column).toBe(0);
  });
});

const VIEW = 1600;

/** A wrapper and a panel as the stylesheet draws them, and the frames the sequence asks for. */
function stage(width = 240) {
  const variables = new Map<string, string>();
  const wrap = {
    dataset: {} as Record<string, string | undefined>,
    style: {
      setProperty: (name: string, value: string) => void variables.set(name, value),
      removeProperty: (name: string) => variables.delete(name),
    },
    getAnimations: () => [],
  };
  let side: SideValue = "right";
  /** How far the stylesheet moves the column off its edge, in px. */
  const off = (): number => {
    if (wrap.dataset.column === "away") return panel.offsetWidth;
    if (wrap.dataset.column !== "sliding") return 0;
    return Math.abs(parseFloat(variables.get("--column-away") ?? "0"));
  };
  const panel = {
    offsetWidth: width,
    getAnimations: () => [],
    getBoundingClientRect() {
      const left = side === "left" ? -off() : VIEW - panel.offsetWidth + off();
      return { left, right: left + panel.offsetWidth };
    },
  };
  let now = 0;
  let still = false;
  let next = 1;
  const asked = new Map<number, (time: number) => void>();
  const slide = createDockSlide({
    wrap,
    panel,
    clock: () => now,
    still: () => still,
    frame(run) {
      asked.set(next, run);
      return next++;
    },
    drop: (id) => void asked.delete(id),
  });
  /** The px of its side the column covers, as it is drawn now. */
  const drawn = () => panel.offsetWidth - off();
  /** The page's frame, which asks for the column in the frame it is drawn in. */
  const follow = () => {
    const moving = slide.draw(now);
    return { cover: readColumn(wrap, panel, side, VIEW).cover, moving };
  };
  return {
    wrap,
    panel,
    variables,
    slide,
    asked,
    drawn,
    follow,
    aim(to: Partial<SlideAim>) {
      const all = { docked: true, side, open: true, handle: true, ...to };
      side = all.side;
      slide.aim(all);
    },
    /** `ms` pass with no frame. */
    wait(ms: number) {
      now += ms;
    },
    /** The next frame comes, `gap` ms on: every callback asked for runs with its time. */
    paint(gap = 16) {
      now += gap;
      const due = [...asked.values()];
      asked.clear();
      for (const run of due) run(now);
    },
    setStill(on: boolean) {
      still = on;
    },
    /** What the wrapper says, as `column handle`. */
    says: () => `${wrap.dataset.column} ${wrap.dataset.handleAt ?? "none"}`,
  };
}

/** Paint until nothing waits, and say what the wrapper said at each frame. */
function run(at: ReturnType<typeof stage>, each?: () => void): string[] {
  const said = [];
  for (let i = 0; at.asked.size > 0; i++) {
    if (i > 100) throw new Error("the sequence never rests");
    at.paint();
    each?.();
    said.push(at.says());
  }
  return said;
}

/** A list with its repeats in a row left out. */
function steps(said: string[]): string[] {
  return said.filter((entry, i) => entry !== said[i - 1]);
}

describe("the pinned panel's slide", () => {
  test("a panel built pinned is at rest where it is, and asks for no frame", () => {
    const out = stage();
    out.aim({ open: true });
    expect(out.says()).toBe("out none");
    expect(out.asked.size).toBe(0);
    const away = stage();
    away.aim({ open: false });
    expect(away.says()).toBe("away edge");
    expect(away.asked.size).toBe(0);
    const bare = stage();
    bare.aim({ open: false, handle: false });
    expect(bare.says()).toBe("away none");
  });

  test("closes the column first, then brings the handle in from the edge", () => {
    const at = stage();
    at.aim({ open: true });
    at.aim({ open: false });
    // Nothing has moved in the frame the close was asked in.
    expect(at.says()).toBe("out sliding");
    expect(at.variables.get("--handle-away")).toBe("1");
    const aways: number[] = [];
    const said = run(at, () => {
      if (at.wrap.dataset.column === "sliding") {
        // The handle waits off the edge, all of it, while the column slides.
        expect(at.variables.get("--handle-away")).toBe("1");
      } else if (at.wrap.dataset.handleAt === "sliding") {
        aways.push(Number(at.variables.get("--handle-away")));
      }
    });
    expect(steps(said)).toEqual(["sliding sliding", "away sliding", "away edge"]);
    // It comes in from all the way off, and only ever closer.
    expect(aways[0]).toBe(1);
    expect(aways.length).toBeGreaterThan(3);
    expect(aways).toEqual([...aways].sort((a, b) => b - a));
    expect(at.variables.size).toBe(0);
    expect(at.asked.size).toBe(0);
  });

  test("opens the column at once, and the handle goes off the edge as it comes", () => {
    const at = stage();
    at.aim({ open: false });
    at.aim({ open: true });
    expect(at.says()).toBe("away edge");
    const said = run(at);
    expect(steps(said)).toEqual(["sliding sliding", "out none"]);
    // No frame is spent before the column moves.
    expect(said[0]).toBe("sliding sliding");
    expect(at.variables.size).toBe(0);
    expect(at.asked.size).toBe(0);
  });

  test("on the left it slides off to the left, and the handle with the same sign", () => {
    const at = stage();
    at.aim({ open: true, side: "left" });
    at.aim({ open: false, side: "left" });
    at.paint();
    expect(at.variables.get("--column-away")).toMatch(/^-\d+px$/);
    expect(at.variables.get("--handle-away")).toBe("-1");
    run(at);
    expect(at.says()).toBe("away edge");
  });

  test("never has more than one frame waiting, however often it is asked", () => {
    const at = stage();
    at.aim({ open: true });
    at.aim({ open: false });
    for (let i = 0; i < 40 && at.asked.size > 0; i++) {
      expect(at.asked.size).toBe(1);
      // The panel renders, and the page's frame asks, more than once a frame.
      at.aim({ open: false });
      at.follow();
      at.follow();
      expect(at.asked.size).toBeLessThanOrEqual(1);
      at.paint();
    }
    expect(at.says()).toBe("away edge");
    expect(at.asked.size).toBe(0);
  });

  test("with the handle hidden, nothing comes in after the close", () => {
    const at = stage();
    at.aim({ open: true, handle: false });
    at.aim({ open: false, handle: false });
    expect(at.says()).toBe("out none");
    expect(steps(run(at))).toEqual(["sliding none", "away none"]);
    expect(at.asked.size).toBe(0);
    // It opens from there by its key, with no handle to go.
    at.aim({ open: true, handle: false });
    expect(steps(run(at))).toEqual(["sliding none", "out none"]);
  });

  test("with less motion it jumps, and asks for no frame", () => {
    const at = stage();
    at.setStill(true);
    at.aim({ open: true });
    at.aim({ open: false });
    expect(at.says()).toBe("away edge");
    expect(at.asked.size).toBe(0);
    at.aim({ open: true });
    expect(at.says()).toBe("out none");
    expect(at.asked.size).toBe(0);
    expect(at.variables.size).toBe(0);
  });

  test("leaves a floating panel to the stylesheet", () => {
    const at = stage();
    at.aim({ docked: false, open: true });
    at.aim({ docked: false, open: false });
    expect(at.wrap.dataset).toEqual({});
    expect(at.asked.size).toBe(0);
    expect(at.follow().moving).toBe(false);
  });
});

/**
 * The invariant: in every frame, the edge the page's frame reads is the edge
 * the column is drawn at once the frame is over, in whole px, whichever of
 * the two the browser runs first. And the column says it is on its way until
 * it is where it goes, so the frame never stops short of it.
 */
describe("no strip shows between the page and the column", () => {
  for (const side of ["right", "left"] as const) {
    for (const first of ["page", "panel"] as const) {
      for (const way of ["close", "open"] as const) {
        test(`${way} on the ${side}, the ${first} first in each frame`, () => {
          const at = stage(340);
          at.aim({ side, open: way === "close" });
          at.wait(7);
          at.aim({ side, open: way === "open" });
          const end = way === "close" ? 0 : 340;
          const covers: number[] = [];
          /** The frame the column stopped in, counted from the first. */
          let landed = 0;
          for (let i = 0; i < 100 && at.asked.size > 0; i++) {
            let read = { cover: Number.NaN, moving: false };
            if (first === "page") {
              at.wait(16);
              read = at.follow();
              at.paint(0);
            } else {
              at.paint();
              read = at.follow();
            }
            // What the frame read is what shows, and it is whole px.
            expect(read.cover).toBe(at.drawn());
            expect(Number.isInteger(read.cover)).toBe(true);
            expect(read.moving).toBe(at.wrap.dataset.column === "sliding");
            if (!read.moving) expect(read.cover).toBe(end);
            // The handle is no part of the column: it shows only beside one that is away.
            if (way === "close" && read.cover > 0) {
              expect(at.variables.get("--handle-away")).toBe(side === "left" ? "-1" : "1");
            }
            covers.push(read.cover);
            if (read.moving) landed = covers.length;
          }
          expect(covers.at(-1)).toBe(end);
          expect(covers.length).toBeGreaterThan(8);
          const sorted = [...covers].sort((a, b) => (way === "close" ? b - a : a - b));
          expect(covers).toEqual(sorted);
          // The column lands in the frame its slide's time is up, no later.
          expect(landed).toBe(Math.ceil(DOCK_SLIDE / 16) - 1);
        });
      }
    }
  }

  test("a frame that comes late draws the column where the time has it, and the page reads that", () => {
    const at = stage();
    at.aim({ open: true });
    at.aim({ open: false });
    at.paint(16);
    at.paint(90);
    const read = at.follow();
    expect(read.cover).toBe(at.drawn());
    expect(read.moving).toBe(true);
    at.paint(90);
    expect(at.follow()).toEqual({ cover: 0, moving: false });
  });
});

describe("a change on the way", () => {
  /** The frame's read is the drawn edge, at every frame from here until all rests. */
  function settle(at: ReturnType<typeof stage>): string[] {
    return run(at, () => expect(at.follow().cover).toBe(at.drawn()));
  }

  test("closing then opening again: the column comes back from where it is, and no handle shows", () => {
    const at = stage();
    at.aim({ open: true });
    at.aim({ open: false });
    at.paint();
    at.paint();
    const turned = at.drawn();
    at.aim({ open: true });
    expect(at.drawn()).toBe(turned);
    const said = settle(at);
    expect(steps(said)).toEqual(["sliding none", "out none"]);
    expect(at.asked.size).toBe(0);
    expect(at.variables.size).toBe(0);
  });

  test("opening then closing: the column goes back off, then the handle comes all the way in", () => {
    const at = stage();
    at.aim({ open: false });
    at.aim({ open: true });
    at.paint();
    at.paint();
    at.aim({ open: false });
    const said = settle(at);
    expect(steps(said)).toEqual(["sliding sliding", "away sliding", "away edge"]);
    expect(at.asked.size).toBe(0);
  });

  test("opening while the handle comes in: one handle, which goes off again", () => {
    const at = stage();
    at.aim({ open: true });
    at.aim({ open: false });
    while (at.says() !== "away sliding") at.paint();
    at.paint();
    at.aim({ open: true });
    const said = settle(at);
    // It had less far to go than the column, so it is off first.
    expect(steps(said)).toEqual(["sliding sliding", "sliding none", "out none"]);
    expect(at.asked.size).toBe(0);
  });

  test("unpinned on its way, it leaves the wrapper as a floating panel's and nothing waits", () => {
    for (const open of [true, false]) {
      const at = stage();
      at.aim({ open: !open });
      at.aim({ open });
      at.paint();
      at.paint();
      at.aim({ docked: false, open });
      expect(at.wrap.dataset).toEqual({});
      expect(at.variables.size).toBe(0);
      expect(at.asked.size).toBe(0);
      expect(at.follow().moving).toBe(false);
      // Pinned again, it is at rest where it is.
      at.aim({ open });
      expect(at.says()).toBe(open ? "out none" : "away edge");
      expect(at.asked.size).toBe(0);
    }
  });

  test("taken to the other side on its way, it slides on from there with the other sign", () => {
    const at = stage();
    at.aim({ open: true });
    at.aim({ open: false });
    at.paint();
    at.paint();
    const away = at.variables.get("--column-away");
    at.aim({ open: false, side: "left" });
    expect(at.variables.get("--column-away")).toBe(`-${away}`);
    expect(at.variables.get("--handle-away")).toBe("-1");
    const said = settle(at);
    expect(steps(said)).toEqual(["sliding sliding", "away sliding", "away edge"]);
    expect(at.asked.size).toBe(0);
  });

  test("a column that gets wider or narrower on its way is drawn by the width it has", () => {
    const at = stage(240);
    at.aim({ open: false });
    at.aim({ open: true });
    at.paint();
    at.paint();
    // The strip, or a window that got narrower, gives it a new width.
    at.panel.offsetWidth = 412;
    at.paint();
    expect(at.follow().cover).toBe(at.drawn());
    at.panel.offsetWidth = 280;
    const said = settle(at);
    expect(said.at(-1)).toBe("out none");
    expect(at.drawn()).toBe(280);
    expect(at.asked.size).toBe(0);
  });

  test("a handle hidden while the closed column's comes in goes off again, and one shown comes in", () => {
    const at = stage();
    at.aim({ open: true });
    at.aim({ open: false });
    while (at.says() !== "away sliding") at.paint();
    at.paint();
    at.aim({ open: false, handle: false });
    expect(steps(run(at))).toEqual(["away sliding", "away none"]);
    at.aim({ open: false, handle: true });
    expect(steps(run(at))).toEqual(["away sliding", "away edge"]);
    expect(at.asked.size).toBe(0);
  });

  test("taken away on its way, it drops its frame", () => {
    const at = stage();
    at.aim({ open: true });
    at.aim({ open: false });
    at.paint();
    expect(at.asked.size).toBe(1);
    at.slide.destroy();
    expect(at.asked.size).toBe(0);
    expect(at.wrap.dataset).toEqual({});
    expect(at.variables.size).toBe(0);
  });
});

describe("the pinned panel's slide in the stylesheet", () => {
  const rule = (selector: string) => {
    const at = CSS.indexOf(`${selector} {`);
    if (at < 0) throw new Error(`no rule for ${selector}`);
    return CSS.slice(at, CSS.indexOf("}", at));
  };

  test("keeps the wrapper where it is, so the handle does not ride the column", () => {
    const wrap = rule(
      '.wrap[data-dock="true"][data-handle="hidden"][data-open="false"][data-side="left"]',
    );
    // Still a transform, so the wrapper is the box the handle and the tooltip are placed in.
    expect(wrap).toContain("transform: translateX(0)");
    expect(wrap).toContain("visibility: visible");
    // Every floating slide of the wrapper has its pinned twin, which comes after it.
    for (const floating of [
      '.wrap[data-side="left"] {',
      '.wrap[data-open="true"] {',
      '.wrap[data-handle="hidden"][data-open="false"] {',
      '.wrap[data-handle="hidden"][data-open="false"][data-side="left"] {',
    ]) {
      expect(CSS.indexOf(floating)).toBeGreaterThan(-1);
      expect(CSS.indexOf('.wrap[data-dock="true"],\n')).toBeGreaterThan(CSS.indexOf(floating));
    }
    for (const twin of [
      '.wrap[data-dock="true"],',
      '.wrap[data-dock="true"][data-side="left"],',
      '.wrap[data-dock="true"][data-handle="hidden"][data-open="false"],',
    ]) {
      expect(CSS).toContain(`\n${twin}\n`);
    }
  });

  test("slides the panel alone, by the px the panel says, and all the way off once it is away", () => {
    expect(rule('.wrap[data-dock="true"][data-column="sliding"] .panel')).toContain(
      "transform: translateX(var(--column-away, 0px))",
    );
    const away = rule('.wrap[data-dock="true"][data-column="away"] .panel');
    expect(away).toContain("transform: translateX(100%)");
    // It hides only closed: a column that opens takes the focus before it has moved.
    expect(away).not.toContain("visibility");
    expect(CSS).toContain(
      '.wrap[data-dock="true"][data-open="false"][data-column="away"] .panel { visibility: hidden; }',
    );
    expect(rule('.wrap[data-dock="true"][data-column="away"][data-side="left"] .panel')).toContain(
      "transform: translateX(-100%)",
    );
    // No clock of the stylesheet's moves or hides the column.
    expect(CSS).toContain('.wrap[data-dock="true"] .panel { visibility: visible; }');
    expect(CSS).not.toMatch(/data-dock="true"\][^{]*\{[^}]*transition: transform/);
  });

  test("puts the handle at the window's edge, out of the column's flow, and slides it by its own width", () => {
    const shown = rule(
      '.wrap[data-dock="true"]:is([data-handle-at="edge"], [data-handle-at="sliding"]) .handle',
    );
    expect(shown).toContain("position: absolute");
    expect(shown).toContain("right: 0");
    expect(shown).toContain("margin: 0");
    const left = rule(
      '.wrap[data-dock="true"][data-side="left"]:is([data-handle-at="edge"], [data-handle-at="sliding"]) .handle',
    );
    expect(left).toContain("left: 0");
    const sliding = rule('.wrap[data-dock="true"][data-handle-at="sliding"] .handle');
    expect(sliding).toContain("transform: translateX(calc(100% * var(--handle-away, 0)))");
    // On its way it takes no click, which would turn the panel round.
    expect(sliding).toContain("pointer-events: none");
  });
});
