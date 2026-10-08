import { afterEach, describe, expect, test } from "bun:test";
import { apply, reset } from "../src/engine/time";
import { resolveKeys } from "../src/ui/bindings";
import { keyChips, overflowBadge } from "../src/ui/footer";
import { defaultKeys } from "../src/ui/keys";
import { HOST_STYLE, wallInput } from "../src/ui/panel";
import {
  cornerAt,
  dragTarget,
  dragTo,
  FLING,
  FLING_LEAN,
  FLING_SPAN,
  FLING_STRETCH,
  GLIDE,
  GLIDE_MAX,
  GLIDE_SPEED,
  glideTime,
  landSide,
  PANEL_GAP,
  type Place,
  type Room,
  type Sample,
  SNAP,
  settle,
  snap,
  translateOf,
  velocity,
} from "../src/ui/place";
import { handleHint } from "../src/ui/settings";
import { SLIDE } from "../src/ui/slide";
import { CSS } from "../src/ui/styles";
import { TIP_GAP, TIP_MARGIN, tipAt } from "../src/ui/tooltip";

describe("overflowBadge", () => {
  test("counts while the overflow knob is on", () => {
    expect(overflowBadge(true, 0)).toBe("0 overflowing");
    expect(overflowBadge(true, 2)).toBe("2 overflowing");
  });

  test("says nothing while the knob is off", () => {
    expect(overflowBadge(false, 0)).toBe("");
    expect(overflowBadge(false, 2)).toBe("");
  });

  test("says nothing before the frame reports a count", () => {
    expect(overflowBadge(true, null)).toBe("");
  });
});

describe("tipAt", () => {
  const view = { width: 1000, height: 800 };
  const tip = { width: 100, height: 20 };

  test("centers over its control", () => {
    const control = { left: 500, top: 700, width: 20, bottom: 720 };
    expect(tipAt(control, tip, view)).toEqual({ x: 460, y: 700 - TIP_GAP - 20 });
  });

  test("stays inside the window at either edge", () => {
    expect(tipAt({ left: 990, top: 700, width: 10, bottom: 720 }, tip, view).x).toBe(
      1000 - TIP_MARGIN - 100,
    );
    expect(tipAt({ left: 0, top: 700, width: 10, bottom: 720 }, tip, view).x).toBe(TIP_MARGIN);
  });

  test("goes under its control where there is no room above", () => {
    expect(tipAt({ left: 500, top: 10, width: 20, bottom: 30 }, tip, view).y).toBe(30 + TIP_GAP);
  });
});

describe("keyChips", () => {
  test("the panel, search, grab, replay and reset, most used first", () => {
    expect(keyChips(defaultKeys(), true, true)).toEqual([
      { command: "panel", key: "⇧K", word: "panel" },
      { command: "search", key: "/", word: "search" },
      { command: "grab", key: "⇧G", word: "grab" },
      { command: "replay", key: "⇧R", word: "replay animations" },
      { command: "reset", key: "⇧⌫", word: "reset" },
    ]);
  });

  test("the keys the mount set, and the keys off a mac", () => {
    expect(keyChips(defaultKeys(), true, false).map((chip) => chip.key)).toEqual([
      "Shift K",
      "/",
      "Shift G",
      "Shift R",
      "Shift Backspace",
    ]);
    const mounted = defaultKeys({ hotkey: "d", grabKey: "ctrl+c" });
    expect(keyChips(mounted, true, false).map((chip) => chip.key)).toEqual([
      "Shift D",
      "/",
      "Ctrl C",
      "Shift R",
      "Shift Backspace",
    ]);
  });

  test("the keys the user set, over the mount's", () => {
    const keys = resolveKeys(defaultKeys({ hotkey: "d" }), { panel: "alt+k", grab: "shift+x" });
    expect(keyChips(keys, true, true).map((chip) => chip.key)).toEqual([
      "⌥K",
      "/",
      "⇧X",
      "⇧R",
      "⇧⌫",
    ]);
    expect(keyChips(keys, true, false)[0]?.key).toBe("Alt K");
  });

  test("no grab chip with no grab", () => {
    expect(keyChips(defaultKeys(), false, true).map((chip) => chip.command)).toEqual([
      "panel",
      "search",
      "replay",
      "reset",
    ]);
  });
});

describe("dragTarget", () => {
  test("a plain drag moves the open panel with its handle", () => {
    expect(dragTarget(false, true)).toBe("panel");
  });

  test("a shift drag moves the handle alone", () => {
    expect(dragTarget(true, true)).toBe("handle");
  });

  test("a closed panel has only the handle to move", () => {
    expect(dragTarget(false, false)).toBe("handle");
    expect(dragTarget(true, false)).toBe("handle");
  });
});

/** A window 800 tall with a panel 300 tall: the panel's top runs from 8 to 492. */
const ROOM: Room = { view: 800, panel: 300, handle: 64 };
const LAST = ROOM.view - PANEL_GAP - ROOM.panel;

function at(y: number, top: number, edge: Place["edge"] = "none", tab: Place["tab"] = "none") {
  return { y, top, edge, tab };
}

describe("snap", () => {
  test("keeps a value between its bounds", () => {
    expect(snap(-50, 8, 492)).toBe(8);
    expect(snap(900, 8, 492)).toBe(492);
    expect(snap(200, 8, 492)).toBe(200);
  });

  test("pulls a value flush with a bound within SNAP of it", () => {
    expect(snap(8 + SNAP, 8, 492)).toBe(8);
    expect(snap(8 + SNAP + 1, 8, 492)).toBe(8 + SNAP + 1);
    expect(snap(492 - SNAP, 8, 492)).toBe(492);
    expect(snap(492 - SNAP - 1, 8, 492)).toBe(492 - SNAP - 1);
  });

  test("pulls to the nearer bound when both are near", () => {
    expect(snap(20, 8, 40)).toBe(8);
    expect(snap(30, 8, 40)).toBe(40);
  });

  test("with no room between the bounds, keeps to the lower one", () => {
    expect(snap(50, 8, 4)).toBe(8);
  });
});

describe("a plain drag", () => {
  const from = at(140, 100);

  test("moves the panel and carries the handle along", () => {
    expect(dragTo("panel", true, 300, from, ROOM)).toEqual(at(340, 300));
  });

  test("snaps the panel flush with the window's top within SNAP", () => {
    expect(dragTo("panel", true, PANEL_GAP + 12, from, ROOM)).toEqual(at(48, 8, "top"));
  });

  test("snaps the panel flush with the window's bottom within SNAP", () => {
    const dropped = dragTo("panel", true, LAST - 15, from, ROOM);
    expect(dropped).toEqual(at(LAST + 40, LAST, "bottom"));
    expect(dropped.top + ROOM.panel).toBe(ROOM.view - PANEL_GAP);
  });

  test("keeps the whole panel inside the window", () => {
    expect(dragTo("panel", true, -300, from, ROOM).top).toBe(PANEL_GAP);
    expect(dragTo("panel", true, 2000, from, ROOM).top).toBe(LAST);
  });

  test("keeps a handle flush with a corner flush with it", () => {
    expect(dragTo("panel", true, 480, at(100, 100, "none", "top"), ROOM)).toEqual(
      at(LAST, LAST, "bottom", "top"),
    );
  });
});

describe("a shift drag", () => {
  const from = at(200, 100);
  const low = 100 + ROOM.panel - ROOM.handle;

  test("slides the handle along the panel, which stays put", () => {
    expect(dragTo("handle", true, 180, from, ROOM)).toEqual(at(180, 100));
  });

  test("snaps the handle flush with the panel's top corner within SNAP", () => {
    expect(dragTo("handle", true, 115, from, ROOM)).toEqual(at(100, 100, "none", "top"));
  });

  test("snaps the handle flush with the panel's bottom corner within SNAP", () => {
    expect(dragTo("handle", true, low - 10, from, ROOM)).toEqual(at(low, 100, "none", "bottom"));
  });

  test("keeps the handle along the panel's edge", () => {
    expect(dragTo("handle", true, 0, from, ROOM).y).toBe(100);
    expect(dragTo("handle", true, 2000, from, ROOM).y).toBe(low);
  });
});

describe("a closed panel's drag", () => {
  const from = at(140, 100);
  const bottom = ROOM.view - PANEL_GAP - ROOM.handle;

  test("moves the handle, and the hidden panel with it", () => {
    expect(dragTo("handle", false, 400, from, ROOM)).toEqual(at(400, 360));
  });

  test("snaps the handle flush with the window's top, the panel opening under it", () => {
    expect(dragTo("handle", false, 20, from, ROOM)).toEqual(at(8, 8, "top", "top"));
  });

  test("snaps the handle flush with the window's bottom, the panel opening over it", () => {
    expect(dragTo("handle", false, bottom - 10, from, ROOM)).toEqual(
      at(bottom, LAST, "bottom", "bottom"),
    );
  });
});

describe("cornerAt", () => {
  const low = 100 + ROOM.panel - ROOM.handle;

  test("names the corner a handle flush with the panel covers", () => {
    expect(cornerAt(100, 100, ROOM)).toBe("top");
    expect(cornerAt(low, 100, ROOM)).toBe("bottom");
  });

  test("says none for a handle between the corners, or one dragged off a closed panel", () => {
    expect(cornerAt(140, 100, ROOM)).toBe("none");
    expect(cornerAt(400, 100, ROOM)).toBe("none");
  });

  test("agrees with what a layout says", () => {
    for (const place of [at(300, 300), at(LAST, LAST, "bottom"), at(140, 100), at(8, 8, "top")]) {
      const laid = settle(place, ROOM);
      expect(cornerAt(laid.y, laid.top, ROOM)).toBe(laid.tab);
    }
  });
});

describe("settle", () => {
  test("a panel at the window's bottom grows upward, and a handle at its top rides up", () => {
    const grown = settle(at(LAST, LAST, "bottom", "top"), { ...ROOM, panel: 400 });
    expect(grown).toEqual(at(392, 392, "bottom", "top"));
    expect(grown.top + 400).toBe(ROOM.view - PANEL_GAP);
  });

  test("a handle at the bottom corner of a panel at the bottom stays put as it grows", () => {
    const corner = ROOM.view - PANEL_GAP - ROOM.handle;
    const grown = settle(at(corner, LAST, "bottom", "bottom"), { ...ROOM, panel: 400 });
    expect(grown).toEqual(at(corner, 392, "bottom", "bottom"));
  });

  test("a panel at the window's bottom follows it when the window resizes", () => {
    const corner = ROOM.view - PANEL_GAP - ROOM.handle;
    const smaller = settle(at(corner, LAST, "bottom", "bottom"), { ...ROOM, view: 600 });
    expect(smaller).toEqual(at(600 - PANEL_GAP - ROOM.handle, 292, "bottom", "bottom"));
  });

  test("a panel at the window's top stays there when the window resizes", () => {
    expect(settle(at(8, 8, "top", "top"), { ...ROOM, view: 500 })).toEqual(at(8, 8, "top", "top"));
  });

  test("a panel between the edges keeps its place, and the window keeps it inside", () => {
    expect(settle(at(340, 300), ROOM)).toEqual(at(340, 300));
    expect(settle(at(340, 300), { ...ROOM, view: 500 })).toEqual(at(340, 192, "bottom"));
  });

  test("a handle stays inside a panel that shrinks under it", () => {
    expect(settle(at(300, 100), { ...ROOM, panel: 200 })).toEqual(at(236, 100, "none", "bottom"));
  });

  test("pulls flush what sits within SNAP of an edge, as an older session may", () => {
    expect(settle(at(310, 300), ROOM)).toEqual(at(300, 300, "none", "top"));
    expect(settle(at(LAST - 2, LAST - 10), ROOM)).toEqual(at(LAST, LAST, "bottom", "top"));
  });

  test("a panel as tall as the window keeps the edge it had", () => {
    const full = { ...ROOM, view: 616, panel: 600 };
    expect(settle(at(8, 8, "bottom", "top"), full).edge).toBe("bottom");
    expect(settle(at(8, 8), full).edge).toBe("top");
  });

  test("a layout of a layout, or of a drag, moves nothing", () => {
    const short = { ...ROOM, view: 500 };
    const laid: [Place, Room][] = [
      [settle(at(310, 300), ROOM), ROOM],
      [settle(at(340, 300), short), short],
      [dragTo("panel", true, LAST - 15, at(140, 100), ROOM), ROOM],
      [dragTo("handle", true, 115, at(200, 100), ROOM), ROOM],
      [dragTo("handle", false, 400, at(140, 100), ROOM), ROOM],
      [dragTo("handle", false, 20, at(140, 100), ROOM), ROOM],
    ];
    for (const [place, room] of laid) expect(settle(place, room)).toEqual(place);
  });
});

describe("settle by the top", () => {
  test("a panel at the window's bottom that shrinks keeps its top and leaves the bottom", () => {
    const shrunk = settle(at(LAST, LAST, "bottom", "top"), { ...ROOM, panel: 200 }, "top");
    expect(shrunk).toEqual(at(LAST, LAST, "none", "top"));
  });

  test("nothing pulls it back flush as it starts to shrink", () => {
    const first = settle(at(LAST, LAST, "bottom", "top"), { ...ROOM, panel: 295 }, "top");
    expect(first).toEqual(at(LAST, LAST, "none", "top"));
    expect(settle(first, { ...ROOM, panel: 290 }, "top")).toEqual(first);
  });

  test("a handle at the bottom corner rises with the panel's bottom", () => {
    const corner = LAST + ROOM.panel - ROOM.handle;
    const shrunk = settle(at(corner, LAST, "bottom", "bottom"), { ...ROOM, panel: 200 }, "top");
    expect(shrunk).toEqual(at(LAST + 200 - ROOM.handle, LAST, "none", "bottom"));
  });

  test("a panel that grows past the window's bottom is pushed up, flush with it", () => {
    const grown = settle(at(LAST, LAST, "none", "top"), { ...ROOM, panel: 400 }, "top");
    expect(grown).toEqual(at(392, 392, "bottom", "top"));
  });

  test("grows back flush with the bottom it left", () => {
    const shrunk = settle(at(LAST, LAST, "bottom", "top"), { ...ROOM, panel: 200 }, "top");
    expect(settle(shrunk, ROOM, "top")).toEqual(at(LAST, LAST, "bottom", "top"));
  });

  test("a panel at the window's top stays there", () => {
    const shrunk = settle(at(8, 8, "top", "top"), { ...ROOM, panel: 200 }, "top");
    expect(shrunk).toEqual(at(8, 8, "top", "top"));
  });

  test("a handle between the corners keeps its place inside the panel", () => {
    expect(settle(at(310, 300), ROOM, "top")).toEqual(at(310, 300));
    expect(settle(at(450, 300), { ...ROOM, panel: 200 }, "top")).toEqual(
      at(300 + 200 - ROOM.handle, 300, "none", "bottom"),
    );
  });

  test("a layout by the edge after one by the top moves nothing", () => {
    const shrunk = settle(at(LAST, LAST, "bottom", "top"), { ...ROOM, panel: 200 }, "top");
    expect(settle(shrunk, { ...ROOM, panel: 200 })).toEqual(shrunk);
  });
});

describe("landSide", () => {
  const WIDTH = 1000;

  test("goes back to its side short of the middle, and with no speed", () => {
    expect(landSide("right", 600, WIDTH, 0, 0)).toBe("right");
    expect(landSide("left", 400, WIDTH, 0, 0)).toBe("left");
    expect(landSide("right", 990, WIDTH, 0, 0)).toBe("right");
  });

  test("lands on the other side past the middle", () => {
    expect(landSide("right", 400, WIDTH, 0, 0)).toBe("left");
    expect(landSide("left", 600, WIDTH, 0, 0)).toBe("right");
    expect(landSide("right", 10, WIDTH, 0, 0)).toBe("left");
  });

  test("the middle itself is not past it", () => {
    expect(landSide("right", 500, WIDTH, 0, 0)).toBe("right");
    expect(landSide("left", 500, WIDTH, 0, 0)).toBe("left");
  });

  test("a fling toward the other side lands there short of the middle", () => {
    expect(landSide("right", 900, WIDTH, -FLING, 0)).toBe("left");
    expect(landSide("left", 100, WIDTH, FLING, 0)).toBe("right");
    expect(landSide("right", 990, WIDTH, -3, 1)).toBe("left");
  });

  test("a fling back home keeps the side past the middle", () => {
    expect(landSide("right", 300, WIDTH, FLING, 0)).toBe("right");
    expect(landSide("left", 700, WIDTH, -FLING, 0)).toBe("left");
  });

  test("a fling toward the side it is on changes nothing short of the middle", () => {
    expect(landSide("right", 900, WIDTH, 2, 0)).toBe("right");
    expect(landSide("left", 100, WIDTH, -2, 0)).toBe("left");
  });

  test("too slow to be a fling, the middle decides", () => {
    const slow = FLING * 0.9;
    expect(landSide("right", 900, WIDTH, -slow, 0)).toBe("right");
    expect(landSide("right", 300, WIDTH, slow, 0)).toBe("left");
  });

  test("a fast drag up or down never changes sides, and never holds one back", () => {
    expect(landSide("right", 900, WIDTH, -1, 3)).toBe("right");
    expect(landSide("left", 100, WIDTH, 1, -3)).toBe("left");
    // A diagonal that does not lean across enough is no fling either way.
    expect(landSide("right", 900, WIDTH, -FLING_LEAN, 1)).toBe("right");
    expect(landSide("right", 300, WIDTH, FLING_LEAN, 1)).toBe("left");
    expect(landSide("right", 900, WIDTH, -FLING_LEAN * 1.1, 1)).toBe("left");
  });
});

describe("velocity", () => {
  const at = (t: number, x: number, y = 0): Sample => ({ t, x, y });

  test("reads the speed of a steady drag", () => {
    const samples = [at(0, 0), at(50, 100, 10), at(100, 200, 20)];
    expect(velocity(samples, 100)).toEqual({ x: 2, y: 0.2 });
  });

  test("leaves out what is older than the span", () => {
    const samples = [at(0, 1000), at(200, 0), at(250, -50), at(300, -100)];
    expect(velocity(samples, 300)).toEqual({ x: -1, y: 0 });
    expect(FLING_SPAN).toBe(150);
  });

  test("goes by the fastest stretch, not by the slowing down before the release", () => {
    // 2 px per ms for 48 ms, then a hand that slows, stops and lets go.
    const samples = [at(0, 0), at(16, 32), at(32, 64), at(48, 96), at(64, 104), at(80, 106)];
    expect(velocity([...samples, at(110, 106)], 110)).toEqual({ x: 2, y: 0 });
  });

  test("goes by a whole stretch, so one jittery step is no fling", () => {
    const samples = [at(0, 0), at(16, 2), at(32, 4), at(48, 6), at(64, 8), at(65, 12)];
    expect(velocity(samples, 65).x).toBeCloseTo(10 / 49);
    expect(FLING_STRETCH).toBe(40);
  });

  test("the fastest stretch is the one that counts, up or down as well", () => {
    // Fast down, with a slower step across on the way.
    const samples = [at(0, 0, 0), at(20, 2, 60), at(40, 4, 120), at(60, 30, 130), at(80, 60, 140)];
    expect(velocity(samples, 80)).toEqual({ x: 0.1, y: 3 });
  });

  test("has none for a pointer that stopped before it let go", () => {
    const samples = [at(0, 0), at(50, 300), at(250, 300)];
    expect(velocity(samples, 250)).toEqual({ x: 0, y: 0 });
  });

  test("reads a drag shorter than a stretch whole, and one too short not at all", () => {
    expect(velocity([at(0, 0), at(10, 10), at(30, 30)], 30)).toEqual({ x: 1, y: 0 });
    expect(velocity([at(0, 0), at(5, 50)], 5)).toEqual({ x: 0, y: 0 });
  });

  test("has none with one sample, or none in time", () => {
    expect(velocity([], 0)).toEqual({ x: 0, y: 0 });
    expect(velocity([at(10, 50)], 10)).toEqual({ x: 0, y: 0 });
    expect(velocity([at(10, 0), at(10, 50)], 10)).toEqual({ x: 0, y: 0 });
  });
});

describe("a throw", () => {
  /**
   * A drag as the pointer reports it, every `step` ms: each leg goes on for a
   * time at a speed, and the release is one more sample where the last one was.
   */
  function trace(
    from: { x: number; y: number },
    legs: { ms: number; vx: number; vy?: number }[],
    step = 8,
  ): Sample[] {
    const samples: Sample[] = [{ t: 0, ...from }];
    let { x, y } = from;
    let t = 0;
    for (const leg of legs) {
      for (let spent = 0; spent < leg.ms; spent += step) {
        t += step;
        x += leg.vx * step;
        y += (leg.vy ?? 0) * step;
        samples.push({ t, x, y });
      }
    }
    samples.push({ t: t + 3, x, y });
    return samples;
  }

  /** The side a drag off the right edge of a window lands on, by its last sample. */
  function landed(samples: Sample[], width: number): string {
    const last = samples[samples.length - 1];
    if (!last) return "right";
    const speed = velocity(samples, last.t);
    return landSide("right", last.x, width, speed.x, speed.y);
  }

  const WIDTHS = [800, 1440, 2560, 3840];
  /** A flick with a mouse: speed up, peak, slow down, then a pause before the button comes up. */
  const flick = (pause: number, vy = 0) => [
    { ms: 48, vx: -0.6, vy: vy / 2 },
    { ms: 48, vx: -1.6, vy },
    { ms: 24, vx: -0.4, vy: vy / 4 },
    { ms: pause, vx: 0 },
  ];

  test("lands on the other side at any width, however the hand slows before it lets go", () => {
    for (const width of WIDTHS) {
      for (const pause of [0, 32, 56]) {
        for (const step of [4, 8, 16]) {
          const samples = trace({ x: width - 20, y: 300 }, flick(pause), step);
          expect(landed(samples, width)).toBe("left");
        }
      }
    }
  });

  test("the speed at the release alone would miss it", () => {
    const samples = trace({ x: 3820, y: 300 }, flick(56));
    const last = samples[samples.length - 1];
    const first = samples.find((sample) => last && sample.t >= last.t - 100);
    if (!first || !last) throw new Error("no samples");
    expect(Math.abs((last.x - first.x) / (last.t - first.t))).toBeLessThan(FLING);
    expect(Math.abs(velocity(samples, last.t).x)).toBeGreaterThan(FLING * 2);
  });

  test("lands there with the arc a long throw has", () => {
    for (const width of WIDTHS) {
      expect(landed(trace({ x: width - 20, y: 300 }, flick(40, 0.8)), width)).toBe("left");
      expect(landed(trace({ x: width - 20, y: 300 }, flick(40, -0.8)), width)).toBe("left");
    }
  });

  test("a slow drag that ends before the middle glides home", () => {
    for (const width of WIDTHS) {
      const samples = trace({ x: width - 20, y: 300 }, [{ ms: 800, vx: -0.3 }]);
      expect(landed(samples, width)).toBe("right");
    }
  });

  test("a fast drag up or down never changes sides", () => {
    for (const width of WIDTHS) {
      const down = [
        { ms: 48, vx: -0.2, vy: 1 },
        { ms: 96, vx: -0.6, vy: 3 },
        { ms: 24, vx: -0.1, vy: 0.5 },
        { ms: 40, vx: 0 },
      ];
      expect(landed(trace({ x: width - 20, y: 100 }, down), width)).toBe("right");
    }
  });

  test("a drag that stopped a span before it let go is no throw", () => {
    for (const width of WIDTHS) {
      const samples = trace({ x: width - 20, y: 300 }, [{ ms: 96, vx: -1.6 }]);
      const last = samples[samples.length - 1];
      if (!last) throw new Error("no samples");
      const held = [...samples, { ...last, t: last.t + FLING_SPAN }];
      expect(landed(held, width)).toBe("right");
    }
  });
});

describe("glideTime", () => {
  test("a short way takes the least", () => {
    expect(glideTime(0)).toBe(GLIDE);
    expect(glideTime(400)).toBe(GLIDE);
    expect(glideTime(GLIDE * GLIDE_SPEED)).toBe(GLIDE);
    expect(GLIDE).toBe(220);
  });

  test("a long way takes longer, up to the most", () => {
    expect(glideTime(1800)).toBe(300);
    expect(glideTime(2400)).toBe(400);
    expect(glideTime(3600)).toBe(GLIDE_MAX);
    expect(glideTime(10000)).toBe(GLIDE_MAX);
    expect(GLIDE_MAX).toBe(440);
  });
});

describe("translateOf", () => {
  test("reads a computed translate", () => {
    expect(translateOf("none")).toEqual({ x: 0, y: 0 });
    expect(translateOf("-120px")).toEqual({ x: -120, y: 0 });
    expect(translateOf("-120.5px 4px")).toEqual({ x: -120.5, y: 4 });
  });

  test("reads anything else as no translate", () => {
    expect(translateOf("")).toEqual({ x: 0, y: 0 });
    expect(translateOf("auto")).toEqual({ x: 0, y: 0 });
  });
});

describe("wallInput", () => {
  afterEach(() => {
    reset();
  });

  test("writes an instant the way a datetime-local input reads it", () => {
    expect(wallInput(new Date(2026, 9, 4, 9, 5, 30).getTime())).toBe("2026-10-04T09:05");
    expect(wallInput(new Date(999, 0, 1).getTime())).toBe("0999-01-01T00:00");
  });

  test("on the clock face of the emulated zone", () => {
    apply("Asia/Tokyo");
    expect(wallInput(Date.UTC(2026, 9, 4, 0, 5))).toBe("2026-10-04T09:05");
  });
});

interface Rule {
  selector: string;
  body: string;
}

/** Every rule in the stylesheet. At-rules fall away and leave the rules inside. */
function rules(css: string): Rule[] {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, "");
  return [...bare.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
    selector: match[1].trim(),
    body: match[2],
  }));
}

function body(selector: string): string {
  const rule = rules(CSS).find((entry) => entry.selector === selector);
  if (!rule) throw new Error(`no rule for ${selector}`);
  return rule.body;
}

/** The selectors that take a pointer back from the page. */
function pointerTargets(): string[] {
  return rules(CSS)
    .filter((rule) => /pointer-events:\s*auto/.test(rule.body))
    .map((rule) => rule.selector);
}

describe("pointer events", () => {
  test("the host takes none", () => {
    expect(HOST_STYLE).toContain("pointer-events:none");
  });

  test("the host is anchored by its side, not by its style", () => {
    expect(HOST_STYLE).not.toMatch(/left|right/);
  });

  test("the wrapper takes none, past its own all: initial", () => {
    expect(body(".wrap")).toMatch(/pointer-events:\s*none/);
  });

  test("the handle and a panel that is out are the only surfaces that take one", () => {
    expect(pointerTargets()).toEqual([".handle", '.wrap[data-open="true"] .panel']);
  });
});

describe("closed panel", () => {
  test("paints nothing but the handle, once it has slid out", () => {
    expect(body(".panel")).toMatch(/visibility:\s*hidden/);
    expect(body(".panel")).toMatch(/transition:\s*visibility 0s linear 150ms/);
    expect(body('.wrap[data-open="true"] .panel')).toMatch(/visibility:\s*visible/);
    expect(body('.wrap[data-open="true"] .panel')).toMatch(/transition-delay:\s*0s,/);
    // Off the edge too, where the border's own delay is dropped.
    expect(body('.wrap[data-float="true"][data-open="false"] .panel')).toMatch(
      /transition-delay:\s*150ms, 0s, 0s, 0s, 0s, 0s/,
    );
  });

  test("keeps the corner under the handle square while it slides back", () => {
    expect(body('.wrap[data-tab="top"] .panel')).toMatch(/border-top-left-radius:\s*0/);
    expect(body('.wrap[data-tab="bottom"] .panel')).toMatch(/border-bottom-left-radius:\s*0/);
    const radii = rules(CSS).filter((rule) => /border-(top|bottom)-left-radius:/.test(rule.body));
    for (const rule of radii) expect(rule.selector).not.toContain("data-open");
  });
});

describe("a hidden handle", () => {
  const closed = '.wrap[data-handle="hidden"][data-open="false"]';

  test("leaves nothing of a closed panel on the edge, on either side", () => {
    expect(body(closed)).toMatch(/visibility:\s*hidden/);
    expect(body(closed)).toMatch(/transform:\s*translateX\(100%\)/);
    expect(body(`${closed}[data-side="left"]`)).toMatch(/transform:\s*translateX\(-100%\)/);
    // It hides once the slide is over, so the close still shows.
    expect(body(closed)).toMatch(/visibility 0s linear 150ms/);
  });

  test("takes no pointer while closed", () => {
    expect(body(`${closed} .handle`)).toMatch(/pointer-events:\s*none/);
    expect(pointerTargets()).toEqual([".handle", '.wrap[data-open="true"] .panel']);
  });

  test("shows as ever while the panel is open", () => {
    const hiding = rules(CSS).filter((rule) => rule.selector.includes('data-handle="hidden"'));
    expect(hiding.length).toBeGreaterThan(0);
    for (const rule of hiding) expect(rule.selector).toContain('[data-open="false"]');
    // The open slide comes after, so it wins once the panel opens.
    const order = rules(CSS).map((rule) => rule.selector);
    expect(order.indexOf('.wrap[data-open="true"]')).toBeGreaterThan(order.indexOf(closed));
  });

  test("says how to bring the panel back, with the key in force", () => {
    expect(handleHint(defaultKeys(), true)).toBe("press ⇧K to open knobs");
    expect(handleHint(defaultKeys({ hotkey: "d" }), false)).toBe("press Shift D to open knobs");
  });
});

describe("the left side", () => {
  test("mirrors the slide, and the handle sits on the panel's right", () => {
    expect(body(".wrap")).toMatch(/transform:\s*translateX\(239px\)/);
    expect(body('.wrap[data-side="left"]')).toMatch(/transform:\s*translateX\(-239px\)/);
    expect(body('.wrap[data-side="left"]')).toMatch(/flex-direction:\s*row-reverse/);
    const order = rules(CSS).map((rule) => rule.selector);
    // Open on either side wins over the closed slide, as it comes after.
    expect(order.indexOf('.wrap[data-open="true"]')).toBeGreaterThan(
      order.indexOf('.wrap[data-side="left"]'),
    );
  });

  test("mirrors the handle's overlap, border and radii", () => {
    const handle = body('.wrap[data-side="left"] .handle');
    expect(body(".handle")).toMatch(/margin-right:\s*-1px/);
    expect(handle).toMatch(/margin-left:\s*-1px/);
    expect(handle).toMatch(/margin-right:\s*0/);
    expect(handle).toMatch(/border-right:\s*1px solid var\(--line\)/);
    expect(handle).toMatch(/border-left:\s*0 solid var\(--edge-line\)/);
    expect(handle).toMatch(/border-radius:\s*var\(--edge\) 8px 8px var\(--edge\)/);
  });

  test("mirrors the panel's border and radii", () => {
    const panel = body('.wrap[data-side="left"] .panel');
    expect(body(".panel")).toMatch(/border-radius:\s*13px var\(--edge\) var\(--edge\) 13px/);
    expect(panel).toMatch(/border-right:\s*1px solid var\(--line\)/);
    expect(panel).toMatch(/border-left:\s*0 solid var\(--edge-line\)/);
    expect(panel).toMatch(/border-radius:\s*var\(--edge\) 13px 13px var\(--edge\)/);
  });

  test("keeps the corner under the handle square, by the tab alone", () => {
    expect(body('.wrap[data-side="left"][data-tab="top"] .panel')).toMatch(
      /border-top-right-radius:\s*0/,
    );
    expect(body('.wrap[data-side="left"][data-tab="bottom"] .panel')).toMatch(
      /border-bottom-right-radius:\s*0/,
    );
    const radii = rules(CSS).filter((rule) => /border-(top|bottom)-right-radius:/.test(rule.body));
    expect(radii.length).toBe(2);
    for (const rule of radii) expect(rule.selector).not.toContain("data-open");
  });

  test("takes a pointer nowhere the right side does not", () => {
    expect(pointerTargets()).toEqual([".handle", '.wrap[data-open="true"] .panel']);
  });
});

describe("the edge side", () => {
  test("is flush on the edge: no border and no radius", () => {
    expect(body(".wrap")).toMatch(/--edge:\s*0px/);
    expect(body(".wrap")).toMatch(/--edge-line:\s*transparent/);
    expect(body(".panel")).toMatch(/border-right:\s*0 solid var\(--edge-line\)/);
    expect(body(".handle")).toMatch(/border-right:\s*0 solid var\(--edge-line\)/);
    // A clear border with a width would cut the ends of the lines it meets.
    expect(body(".panel")).toMatch(/padding:\s*4px;/);
    expect(body(".handle")).not.toMatch(/padding/);
    expect(body('.wrap[data-side="left"] .panel')).not.toMatch(/padding:/);
    expect(body('.wrap[data-side="left"] .handle')).not.toMatch(/padding/);
  });

  test("is drawn as a free side while the panel floats, and the handle's while it is closed", () => {
    expect(body('.wrap[data-float="true"] .panel')).toMatch(/--edge:\s*13px/);
    expect(body('.wrap[data-float="true"] .panel')).toMatch(/--edge-line:\s*var\(--line\)/);
    expect(body('.wrap[data-float="true"] .panel')).toMatch(/border-right-width:\s*1px/);
    expect(body('.wrap[data-float="true"][data-side="left"] .panel')).toMatch(
      /border-left-width:\s*1px/,
    );
    const handle = body('.wrap[data-float="true"][data-open="false"] .handle');
    expect(handle).toMatch(/--edge:\s*8px/);
    expect(handle).toMatch(/--edge-line:\s*var\(--line\)/);
    expect(handle).toMatch(/border-right-width:\s*1px/);
    expect(body('.wrap[data-float="true"][data-open="false"][data-side="left"] .handle')).toMatch(
      /border-left-width:\s*1px/,
    );
  });

  test("keeps the box one size off the edge, the padding paying for the border", () => {
    expect(body('.wrap[data-float="true"] .panel')).toMatch(/padding-right:\s*3px/);
    expect(body('.wrap[data-float="true"][data-side="left"] .panel')).toMatch(
      /padding:\s*4px 4px 4px 3px/,
    );
    // The handle's width is set, so its padding only keeps the label in the middle.
    expect(body('.wrap[data-float="true"][data-open="false"] .handle')).toMatch(
      /padding-left:\s*1px/,
    );
    expect(body('.wrap[data-float="true"][data-open="false"][data-side="left"] .handle')).toMatch(
      /padding:\s*0 1px 0 0/,
    );
  });

  test("takes its border at once, and drops it when the color has eased out", () => {
    const late = (edge: string, pad: string) =>
      new RegExp(
        `border-${edge}-width 0s linear var\\(--glide\\),\\s*padding-${pad} 0s linear var\\(--glide\\)`,
      );
    expect(body(".panel")).toMatch(late("right", "right"));
    expect(body('.wrap[data-open="false"] .handle')).toMatch(late("right", "left"));
    expect(body('.wrap[data-side="left"] .panel')).toMatch(
      /border-left-color,\s*border-left-width, padding-left;/,
    );
    expect(body('.wrap[data-open="false"][data-side="left"] .handle')).toMatch(
      /border-left-color,\s*border-left-width, padding-right;/,
    );
    expect(body('.wrap[data-open="true"] .panel')).toMatch(
      /transition-delay:\s*0s, 0s, 0s, 0s, var\(--glide\), var\(--glide\)/,
    );
    expect(body('.wrap[data-float="true"] .panel')).toMatch(/transition-delay:\s*0s;/);
    expect(body('.wrap[data-float="true"][data-open="false"] .handle')).toMatch(
      /transition-delay:\s*0s;/,
    );
    // The float rule comes after the open one, so its delay is the one that counts.
    const order = rules(CSS).map((rule) => rule.selector);
    expect(order.indexOf('.wrap[data-float="true"] .panel')).toBeGreaterThan(
      order.indexOf('.wrap[data-open="true"] .panel'),
    );
  });

  test("the left side's radii come after the right side's tab corners", () => {
    const order = rules(CSS).map((rule) => rule.selector);
    expect(order.indexOf('.wrap[data-side="left"] .panel')).toBeGreaterThan(
      order.indexOf('.wrap[data-tab="bottom"] .panel'),
    );
  });
});

describe("the glide", () => {
  test("is the translate, apart from the open and close slide", () => {
    expect(body(".wrap")).toMatch(
      /transition:\s*transform 150ms ease-out, translate var\(--glide\) ease-out/,
    );
  });

  test("takes 220ms unless the panel sets it longer, and the edge eases back with it", () => {
    expect(body(".wrap")).toMatch(/--glide:\s*220ms/);
    expect(CSS.match(/220ms/g)).toHaveLength(1);
  });

  test("stops with reduced motion, as every transition does", () => {
    const reduced = CSS.slice(CSS.indexOf("prefers-reduced-motion"));
    expect(reduced).toMatch(/\.wrap, [^{]*\{\s*transition:\s*none !important/);
  });
});

describe("the slide between the rows and the settings", () => {
  const curve = "cubic-bezier(0.32, 0.72, 0, 1)";

  test("moves the views by transform alone, on the iOS curve, as long as the panel waits", () => {
    const panes = body(".body[data-slide] > .pane");
    expect(panes).toContain(`transform ${SLIDE}ms ${curve}`);
    expect(panes).not.toMatch(/opacity/);
    expect(panes).not.toMatch(/left|width|margin/);
  });

  test("eases the body's height in the same time, clipped out to the border across", () => {
    const slide = body(".body[data-slide]");
    expect(slide).toContain(`height ${SLIDE}ms ${curve}`);
    expect(slide).toMatch(/clip-path:\s*inset\(0 -4px\)/);
  });

  test("pushes the settings in from the right and the rows all the way out past the clip", () => {
    expect(body('.wrap:not([data-mode="keys"]) .body[data-slide] > .keys')).toMatch(
      /transform:\s*translateX\(calc\(100% \+ 4px\)\)/,
    );
    const rows = body('.wrap[data-mode="keys"] .body[data-slide] > .home');
    expect(rows).toMatch(/transform:\s*translateX\(calc\(-100% - 4px\)\)/);
    expect(rows).not.toMatch(/opacity/);
  });

  test("starts a view coming in from where it rests while away", () => {
    const starting = CSS.slice(CSS.indexOf("@starting-style"));
    const keys = starting.indexOf('.wrap[data-mode="keys"] .body[data-slide] > .keys {');
    const home = starting.indexOf('.wrap:not([data-mode="keys"]) .body[data-slide] > .home {');
    expect(starting.slice(keys)).toMatch(/^[^}]*transform:\s*translateX\(calc\(100% \+ 4px\)\)/);
    expect(starting.slice(home)).toMatch(/^[^}]*transform:\s*translateX\(calc\(-100% - 4px\)\)/);
  });

  test("keeps the view that leaves up, out of the flow, under the settings", () => {
    const hiding = rules(CSS).find((rule) => rule.selector.includes(".keys:not(.leaving)"));
    expect(hiding?.selector).toContain('.wrap[data-mode="keys"] .home:not(.leaving)');
    expect(hiding?.body).toMatch(/display:\s*none/);
    expect(body(".body[data-slide] > .pane.leaving")).toMatch(/position:\s*absolute/);
    expect(body(".body[data-slide] > .keys")).toMatch(/z-index:\s*1/);
  });

  test("swaps at once with reduced motion, the body and the views being in the wrapper", () => {
    const reduced = CSS.slice(CSS.indexOf("prefers-reduced-motion"));
    expect(reduced).toMatch(/\.wrap \*, [^{]*\{\s*transition:\s*none !important/);
  });
});
