import { afterEach, describe, expect, test } from "bun:test";
import { apply, reset } from "../src/engine/time";
import {
  dragTarget,
  dragTo,
  HOST_STYLE,
  overflowBadge,
  PANEL_GAP,
  type Place,
  type Room,
  SNAP,
  settle,
  snap,
  wallInput,
} from "../src/ui/panel";
import { CSS } from "../src/ui/styles";

describe("overflowBadge", () => {
  test("counts while the overflow knob is on", () => {
    expect(overflowBadge(true, 0)).toBe(" · 0 overflowing");
    expect(overflowBadge(true, 2)).toBe(" · 2 overflowing");
  });

  test("says nothing while the knob is off", () => {
    expect(overflowBadge(false, 0)).toBe("");
    expect(overflowBadge(false, 2)).toBe("");
  });

  test("says nothing before the frame reports a count", () => {
    expect(overflowBadge(true, null)).toBe("");
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
    expect(body('.wrap[data-open="true"] .panel')).toMatch(/transition-delay:\s*0s/);
  });
});
