import { describe, expect, test } from "bun:test";
import { type GrabPlace, grabStep } from "../src/grab/place";

describe("grabStep", () => {
  test("asked on, grab runs here, or in the frame while it is up", () => {
    expect(grabStep("off", { type: "ask", on: true, frame: false })).toBe("here");
    expect(grabStep("off", { type: "ask", on: true, frame: true })).toBe("frame");
    expect(grabStep("here", { type: "ask", on: true, frame: true })).toBe("frame");
  });

  test("asked off, grab is off wherever it ran", () => {
    expect(grabStep("here", { type: "ask", on: false, frame: false })).toBe("off");
    expect(grabStep("frame", { type: "ask", on: false, frame: true })).toBe("off");
    expect(grabStep("here", { type: "ask", on: false, frame: true })).toBe("off");
  });

  test("the frame taking grab leaves nothing of it running here", () => {
    expect(grabStep("here", { type: "frame", on: true })).toBe("frame");
    expect(grabStep("off", { type: "frame", on: true })).toBe("frame");
  });

  test("the frame ending grab, or loading again, ends it here too", () => {
    expect(grabStep("frame", { type: "frame", on: false })).toBe("off");
    expect(grabStep("here", { type: "frame", on: false })).toBe("off");
  });

  test("the frame coming up ends grab here, and going down ends it in the frame", () => {
    expect(grabStep("here", { type: "framed", frame: true })).toBe("off");
    expect(grabStep("frame", { type: "framed", frame: false })).toBe("off");
  });

  test("another device keeps grab where it is", () => {
    expect(grabStep("frame", { type: "framed", frame: true })).toBe("frame");
    expect(grabStep("here", { type: "framed", frame: false })).toBe("here");
    expect(grabStep("off", { type: "framed", frame: true })).toBe("off");
  });
});

/**
 * The page above and the copy in its frame, each with its own place, and what
 * they post each other. A page draws grab's box and glow only while its place
 * is `here`.
 */
function pages(above: GrabPlace = "off") {
  const state = { above, frame: "off" as GrabPlace };
  /** The frame posts up whenever grab goes on or off in it. */
  function setFrame(to: GrabPlace): void {
    const was = state.frame !== "off";
    state.frame = to;
    if ((to !== "off") !== was) state.above = grabStep(state.above, { type: "frame", on: !was });
  }
  return {
    state,
    /** The page above asks grab on or off, and hands the ask to its frame. */
    askAbove(on: boolean): void {
      const from = state.above;
      state.above = grabStep(from, { type: "ask", on, frame: true });
      if (state.above === "frame" || from === "frame") {
        setFrame(grabStep(state.frame, { type: "ask", on, frame: false }));
      }
    },
    /** Grab turns on in the frame from its own key. */
    askFrame(on: boolean): void {
      setFrame(grabStep(state.frame, { type: "ask", on, frame: false }));
    },
    /** A copy in the frame: its mode ends itself. */
    copyInFrame(): void {
      setFrame("off");
    },
  };
}

describe("grab across the frame", () => {
  test("a copy in the frame leaves no glow in either page", () => {
    const both = pages();
    both.askAbove(true);
    expect(both.state).toEqual({ above: "frame", frame: "here" });
    both.copyInFrame();
    expect(both.state).toEqual({ above: "off", frame: "off" });
  });

  test("a copy in the frame leaves no glow above, where grab ran before the frame took it", () => {
    const both = pages("here");
    both.askFrame(true);
    expect(both.state).toEqual({ above: "frame", frame: "here" });
    both.copyInFrame();
    expect(both.state).toEqual({ above: "off", frame: "off" });
  });

  test("escape above ends grab in the frame", () => {
    const both = pages();
    both.askFrame(true);
    both.askAbove(false);
    expect(both.state).toEqual({ above: "off", frame: "off" });
  });
});
