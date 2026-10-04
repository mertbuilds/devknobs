import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { FRAME_NAME } from "../src/engine/frame";
import { createGrab, type GrabControl, type LoadMode } from "../src/grab/control";
import { grabStep } from "../src/grab/place";

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

const ORIGIN = "http://localhost:3000";

/** What a copy of grab posted to the page above it. */
let posted: unknown[];
let parent: { postMessage: (message: unknown) => void };
/** Every mode grab started, and whether it was stopped since. */
let modes: { stopped: boolean; exit: () => void }[];

/** Grab's mode, loaded as the real one is: a task after it is asked for. */
const loadMode: LoadMode = async () => ({
  startMode: (options) => {
    const mode = { stopped: false, exit: options.onExit };
    modes.push(mode);
    return {
      keydown: () => {},
      stop: () => {
        mode.stopped = true;
      },
    };
  },
});

/** A window for grab's control, the page above or the copy in the frame by its name. */
function setWindow(name: string): void {
  const view = Object.assign(new EventTarget(), {
    name,
    parent,
    location: { origin: ORIGIN },
    setTimeout: () => 0,
    getSelection: () => null,
  });
  Object.defineProperty(globalThis, "window", { configurable: true, value: view });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: Object.assign(new EventTarget(), { activeElement: null }),
  });
}

/** The page above posts grab on or off into the frame. */
function fromAbove(on: boolean): void {
  const event = Object.assign(new Event("message"), {
    data: { source: "devknobs", type: "grab", on, scheme: "light" },
    origin: ORIGIN,
    source: parent,
  });
  window.dispatchEvent(event);
}

/** The mode a lazy load starts, a task later. */
async function settle(): Promise<void> {
  await Bun.sleep(0);
}

let control: GrabControl | null = null;

beforeEach(() => {
  posted = [];
  modes = [];
  parent = { postMessage: (message) => posted.push(message) };
});

afterEach(() => {
  control?.destroy();
  control = null;
  Reflect.deleteProperty(globalThis, "window");
  Reflect.deleteProperty(globalThis, "document");
});

describe("grab's control", () => {
  test("turned off, stops the mode it started here", async () => {
    setWindow("");
    control = createGrab({}, loadMode);
    control.set(true);
    await settle();
    expect(modes.map((mode) => mode.stopped)).toEqual([false]);
    control.set(false);
    expect(modes.map((mode) => mode.stopped)).toEqual([true]);
    expect(control.isOn()).toBe(false);
  });

  test("turned off before its mode loads, starts none", async () => {
    setWindow("");
    control = createGrab({}, loadMode);
    control.set(true);
    control.set(false);
    await settle();
    expect(modes).toEqual([]);
  });
});

describe("grab across the frame", () => {
  test("a copy in the frame tells the page above it went on, and off with the copy", async () => {
    setWindow(FRAME_NAME);
    control = createGrab({}, loadMode);
    fromAbove(true);
    await settle();
    expect(modes).toHaveLength(1);
    modes[0]?.exit();
    expect(posted).toEqual([
      { source: "devknobs", type: "grab", on: true },
      { source: "devknobs", type: "grab", on: false },
    ]);
    expect(control.isOn()).toBe(false);
  });

  test("escape above ends grab in the frame, glow and all", async () => {
    setWindow(FRAME_NAME);
    control = createGrab({}, loadMode);
    control.set(true);
    await settle();
    fromAbove(false);
    expect(modes.map((mode) => mode.stopped)).toEqual([true]);
    expect(posted.at(-1)).toEqual({ source: "devknobs", type: "grab", on: false });
  });
});
