import { describe, expect, test } from "bun:test";
import { foldRest, moveHinge } from "../src/engine/foldhand";
import {
  FOLD_MAGNET,
  FOLD_STOPS,
  foldChip,
  heldTarget,
  keyStop,
  nearestStop,
  postureCommit,
  stepStop,
  valueNow,
  valueText,
} from "../src/ui/foldslider";

describe("the fold slider's stops", () => {
  test("are shut, Apple's landing a third of the way, and open", () => {
    expect(FOLD_STOPS).toEqual([0, 0.333, 1]);
  });

  test("let go, the hinge goes to the nearest", () => {
    expect(nearestStop(0)).toBe(0);
    expect(nearestStop(0.16)).toBe(0);
    expect(nearestStop(0.17)).toBe(0.333);
    expect(nearestStop(0.6)).toBe(0.333);
    expect(nearestStop(0.67)).toBe(1);
    expect(nearestStop(1)).toBe(1);
  });

  test("a hand near either end puts the hinge all the way there, as the magnets do", () => {
    expect(FOLD_MAGNET).toBe(0.08);
    expect(heldTarget(0.05)).toBe(0);
    expect(heldTarget(0.08)).toBe(0);
    expect(heldTarget(0.1)).toBe(0.1);
    expect(heldTarget(0.5)).toBe(0.5);
    expect(heldTarget(0.9)).toBe(0.9);
    expect(heldTarget(0.93)).toBe(1);
  });

  test("a hand past the track holds the hinge at its end", () => {
    expect(heldTarget(-0.4)).toBe(0);
    expect(heldTarget(1.7)).toBe(1);
  });
});

describe("the fold slider's keys", () => {
  test("step a stop at a time, left and down toward shut, right and up toward open", () => {
    expect(keyStop("ArrowRight", 0)).toBe(0.333);
    expect(keyStop("ArrowUp", 0.333)).toBe(1);
    expect(keyStop("ArrowLeft", 1)).toBe(0.333);
    expect(keyStop("ArrowDown", 0.333)).toBe(0);
  });

  test("stay at an end past it", () => {
    expect(keyStop("ArrowLeft", 0)).toBe(0);
    expect(keyStop("ArrowRight", 1)).toBe(1);
  });

  test("from between stops, go to the next one that way", () => {
    expect(stepStop(0.5, 1)).toBe(1);
    expect(stepStop(0.5, -1)).toBe(0.333);
    expect(stepStop(0.2, -1)).toBe(0);
  });

  test("home and end go all the way, and any other key does nothing", () => {
    expect(keyStop("Home", 1)).toBe(0);
    expect(keyStop("End", 0)).toBe(1);
    expect(keyStop("Enter", 0)).toBeNull();
    expect(keyStop("a", 0.333)).toBeNull();
  });
});

describe("the fold slider's posture", () => {
  test("changes only once the hinge is let go at the other end", () => {
    expect(postureCommit(1, "closed")).toBe("open");
    expect(postureCommit(0, "open")).toBe("closed");
  });

  test("stays at the end it is at, and at the landing", () => {
    expect(postureCommit(0, "closed")).toBeNull();
    expect(postureCommit(1, "open")).toBeNull();
    expect(postureCommit(0.333, "closed")).toBeNull();
    expect(postureCommit(0.333, "open")).toBeNull();
  });
});

describe("the fold slider for assistive tech", () => {
  test("says how far open the hinge is, 0 to 100", () => {
    expect(valueNow(0)).toBe(0);
    expect(valueNow(0.333)).toBe(33);
    expect(valueNow(1)).toBe(100);
    expect(valueNow(1.2)).toBe(100);
  });

  test("says it in words", () => {
    expect(valueText(0)).toBe("closed");
    expect(valueText(0.333)).toBe("half open");
    expect(valueText(0.7)).toBe("half open");
    expect(valueText(1)).toBe("open");
  });
});

describe("a hand on the hinge with no fold", () => {
  test("moves nothing, and leaves nothing between the ends", () => {
    expect(moveHinge(0.5)).toBe(false);
    expect(foldRest()).toBeNull();
  });
});

describe("the fold chip beside the slider", () => {
  test("says unfold while shut and fold while open", () => {
    expect(foldChip("closed").label).toBe("unfold");
    expect(foldChip("open").label).toBe("fold");
  });

  test("folds to the posture opposite the one the knobs hold, also from half open", () => {
    expect(foldChip("closed").posture).toBe("open");
    expect(foldChip("open").posture).toBe("closed");
  });
});
