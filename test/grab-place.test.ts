import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { FRAME_NAME } from "../src/engine/frame";
import { createGrab, type GrabControl, type LoadMode } from "../src/grab/control";
import { parseGrabKey } from "../src/grab/keys";
import { grabStep } from "../src/grab/place";
import { KEYS_FIELD } from "../src/ui/keys";

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
      // As the real mode does, it keeps a held grab key from being typed.
      keydown: (event) => {
        if (event.repeat && options.heldKey(event)) event.preventDefault();
      },
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

/** Shift and g pressed in `target`, the deepest node the event came through. */
function shiftG(target: unknown, patch: Partial<KeyboardEvent> = {}): Event {
  return Object.assign(new Event("keydown", { cancelable: true }), {
    key: "G",
    code: "KeyG",
    shiftKey: true,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    repeat: false,
    composedPath: () => [target],
    ...patch,
  });
}

/** Off a field of the page. */
const PAGE = { tagName: "DIV", isContentEditable: false };

describe("grab's key", () => {
  test("shift and g is grab's off a field and in the panel's search, and not typed", () => {
    setWindow("");
    control = createGrab({}, loadMode);
    const page = shiftG(PAGE);
    window.dispatchEvent(page);
    expect(page.defaultPrevented).toBe(true);
    const search = { tagName: "INPUT", hasAttribute: (name: string) => name === KEYS_FIELD };
    const inSearch = shiftG(search);
    window.dispatchEvent(inSearch);
    expect(inSearch.defaultPrevented).toBe(true);
  });

  test("the panel hears grab go on within the press, so it can hand the focus to grab", () => {
    setWindow("");
    control = createGrab({}, loadMode);
    const heard: boolean[] = [];
    control.subscribe((on) => heard.push(on));
    const search = { tagName: "INPUT", hasAttribute: (name: string) => name === KEYS_FIELD };
    window.dispatchEvent(shiftG(search));
    expect(heard).toEqual([true]);
    control.set(false);
    expect(heard).toEqual([true, false]);
  });

  test("in a field of the page, shift and g types a capital", () => {
    setWindow("");
    control = createGrab({}, loadMode);
    for (const tagName of ["INPUT", "TEXTAREA", "SELECT"]) {
      const event = shiftG({ tagName, hasAttribute: () => false });
      window.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    }
    expect(control.isOn()).toBe(false);
  });

  test("a press turns grab on at once, and a second press off", async () => {
    setWindow("");
    control = createGrab({}, loadMode);
    window.dispatchEvent(shiftG(PAGE));
    expect(control.isOn()).toBe(true);
    await settle();
    expect(modes).toHaveLength(1);
    window.dispatchEvent(shiftG(PAGE));
    expect(control.isOn()).toBe(false);
    expect(modes.map((mode) => mode.stopped)).toEqual([true]);
  });

  test("the key held down repeats without turning grab off, or on again", async () => {
    setWindow("");
    control = createGrab({}, loadMode);
    window.dispatchEvent(shiftG(PAGE));
    await settle();
    const repeat = shiftG(PAGE, { repeat: true });
    window.dispatchEvent(repeat);
    expect(repeat.defaultPrevented).toBe(true);
    expect(control.isOn()).toBe(true);
    window.dispatchEvent(shiftG(PAGE));
    window.dispatchEvent(shiftG(PAGE, { repeat: true }));
    expect(control.isOn()).toBe(false);
  });

  test("a second press while grab loads cancels it", async () => {
    setWindow("");
    control = createGrab({}, loadMode);
    window.dispatchEvent(shiftG(PAGE));
    window.dispatchEvent(shiftG(PAGE));
    await settle();
    expect(control.isOn()).toBe(false);
    expect(modes).toEqual([]);
  });

  test("shift on its own leaves grab on", async () => {
    setWindow("");
    control = createGrab({}, loadMode);
    window.dispatchEvent(shiftG(PAGE));
    await settle();
    window.dispatchEvent(shiftG(PAGE, { key: "Shift", code: "ShiftLeft" }));
    expect(control.isOn()).toBe(true);
  });

  test("a g still held once shift is let go is not typed while grab is on", async () => {
    setWindow("");
    control = createGrab({}, loadMode);
    window.dispatchEvent(shiftG(PAGE));
    await settle();
    const held = shiftG(PAGE, { key: "g", shiftKey: false, repeat: true });
    window.dispatchEvent(held);
    expect(held.defaultPrevented).toBe(true);
    expect(control.isOn()).toBe(true);
  });

  test("a key that copies still waits for a hold", () => {
    setWindow("");
    const names = ["HTMLElement", "HTMLInputElement", "HTMLTextAreaElement"] as const;
    for (const name of names) {
      Object.defineProperty(globalThis, name, { configurable: true, value: class {} });
    }
    try {
      control = createGrab({ key: () => parseGrabKey("meta+c") }, loadMode);
      const press = shiftG(PAGE, { key: "c", code: "KeyC", shiftKey: false, metaKey: true });
      window.dispatchEvent(press);
      expect(press.defaultPrevented).toBe(false);
      expect(control.isOn()).toBe(false);
    } finally {
      for (const name of names) Reflect.deleteProperty(globalThis, name);
    }
  });
});

describe("a grab key set in the panel", () => {
  test("shift and x is pressed: grab turns on at once, and the old key is a letter again", () => {
    setWindow("");
    control = createGrab({ key: () => parseGrabKey("shift+x") }, loadMode);
    const old = shiftG(PAGE);
    window.dispatchEvent(old);
    expect(old.defaultPrevented).toBe(false);
    expect(control.isOn()).toBe(false);
    const press = shiftG(PAGE, { key: "X", code: "KeyX" });
    window.dispatchEvent(press);
    expect(press.defaultPrevented).toBe(true);
    expect(control.isOn()).toBe(true);
  });

  test("ctrl and shift and x is held: a tap leaves grab off and the key to the page", () => {
    setWindow("");
    const names = ["HTMLElement", "HTMLInputElement", "HTMLTextAreaElement"] as const;
    for (const name of names) {
      Object.defineProperty(globalThis, name, { configurable: true, value: class {} });
    }
    try {
      control = createGrab({ key: () => parseGrabKey("ctrl+shift+x") }, loadMode);
      const press = shiftG(PAGE, { key: "X", code: "KeyX", ctrlKey: true });
      window.dispatchEvent(press);
      expect(press.defaultPrevented).toBe(false);
      expect(control.isOn()).toBe(false);
    } finally {
      for (const name of names) Reflect.deleteProperty(globalThis, name);
    }
  });

  test("no key while the panel records one, so the key pressed is not grab's", () => {
    setWindow("");
    control = createGrab({ key: () => null }, loadMode);
    const press = shiftG(PAGE);
    window.dispatchEvent(press);
    expect(press.defaultPrevented).toBe(false);
    expect(control.isOn()).toBe(false);
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
