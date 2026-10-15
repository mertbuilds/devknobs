import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { FRAME_NAME } from "../src/engine/frame";
import { createGrab, type GrabControl } from "../src/grab/control";
import {
  createInspect,
  type InspectControl,
  type LoadInspect,
  oneAtATime,
} from "../src/grab/inspect";
import type { ModeOptions } from "../src/grab/mode";
import { withShift } from "../src/ui/keys";

const ORIGIN = "http://localhost:3000";
const HELD = Symbol.for("devknobs.inspected");

/** What a copy posted to the page above it, and what the page above posted into its frame. */
let posted: unknown[];
let sent: unknown[];
let parent: { postMessage: (message: unknown) => void };
/** The frame's window as the page above reaches it, or null with the frame down. */
let frame: (EventTarget & { document: object; postMessage(message: unknown): void }) | null;
/** The options of every mode started, and whether it was stopped since. */
let modes: { options: ModeOptions; stopped: boolean }[];
/** What the outline was told to box, in order. */
let boxed: (Element | null)[];
/** The area the outline was told to tint alone, in order. */
let areas: (string | null)[];
let outlines: number;

const load: LoadInspect = async () => ({
  startMode: (options) => {
    const mode = { options, stopped: false };
    modes.push(mode);
    return {
      keydown: () => undefined,
      stop: () => {
        mode.stopped = true;
      },
    };
  },
  createOutline: () => {
    outlines++;
    return {
      show: (element) => {
        boxed.push(element);
      },
      area: (ring) => {
        areas.push(ring);
      },
      destroy: () => undefined,
    };
  },
});

/** A window for the control, the page above or the copy in the frame by its name. */
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

/** An element, as far as the control looks at one: a node of some document. */
function element(doc: object): Element {
  return { nodeType: 1, tagName: "BUTTON", ownerDocument: doc, getAttribute: () => null } as unknown as Element;
}

function message(data: object, source: unknown): void {
  window.dispatchEvent(Object.assign(new Event("message"), { data, origin: ORIGIN, source }));
}

/** Shift and c pressed off any field, as inspect's key is by default. */
function shiftC(patch: Partial<KeyboardEvent> = {}): Event {
  return Object.assign(new Event("keydown", { cancelable: true }), {
    key: "C",
    code: "KeyC",
    shiftKey: true,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    repeat: false,
    composedPath: () => [{ tagName: "DIV", isContentEditable: false }],
    ...patch,
  });
}

async function settle(): Promise<void> {
  await Bun.sleep(0);
}

let control: InspectControl | null = null;
let grab: GrabControl | null = null;

beforeEach(() => {
  posted = [];
  sent = [];
  modes = [];
  boxed = [];
  areas = [];
  outlines = 0;
  parent = { postMessage: (data) => posted.push(data) };
  frame = null;
});

afterEach(() => {
  control?.destroy();
  control = null;
  grab?.destroy();
  grab = null;
  Reflect.deleteProperty(globalThis, "window");
  Reflect.deleteProperty(globalThis, "document");
});

function above(): InspectControl {
  setWindow("");
  frame = Object.assign(new EventTarget(), {
    document: {},
    postMessage: (data: unknown) => {
      sent.push(data);
    },
  });
  return createInspect({}, load, () => frame as unknown as Window | null);
}

describe("inspect's control", () => {
  test("starts grab's mode with a purpose: a label that says styles, and a pick that copies nothing", async () => {
    setWindow("");
    control = createInspect({}, load, () => null);
    const picked: Element[] = [];
    control.onPick((one) => picked.push(one));
    control.set(true);
    await settle();
    const purpose = modes[0]?.options.purpose;
    const button = {
      tagName: "BUTTON",
      getAttribute: (name: string) => (name === "id" ? "save" : name === "class" ? "primary" : null),
    } as unknown as Element;
    expect(purpose?.label(button)).toEqual({ tag: "styles", name: "button#save.primary" });
    purpose?.pick(button);
    expect(picked).toEqual([button]);
    // The mode ends itself with the pick, and inspect is off with it.
    modes[0]?.options.onExit();
    expect(control.isOn()).toBe(false);
  });

  test("its key turns the picking on, and pressed again while it picks, off", async () => {
    setWindow("");
    control = createInspect({ key: () => withShift("c") }, load, () => null);
    const heard: boolean[] = [];
    control.subscribe((on) => heard.push(on));
    const first = shiftC();
    window.dispatchEvent(first);
    expect(first.defaultPrevented).toBe(true);
    expect(control.isOn()).toBe(true);
    await settle();
    expect(modes).toHaveLength(1);
    window.dispatchEvent(shiftC({ repeat: true }));
    expect(control.isOn()).toBe(true);
    window.dispatchEvent(shiftC());
    expect(control.isOn()).toBe(false);
    expect(modes[0]?.stopped).toBe(true);
    // After a pick ended the mode, the key starts another.
    window.dispatchEvent(shiftC());
    await settle();
    modes[1]?.options.onExit();
    window.dispatchEvent(shiftC());
    expect(heard).toEqual([true, false, true, false, true]);
  });

  test("in the frame, goes on and off by its own name and not by grab's", async () => {
    setWindow(FRAME_NAME);
    control = createInspect({}, load, () => null);
    message({ source: "devknobs", type: "grab", on: true }, parent);
    expect(control.isOn()).toBe(false);
    message({ source: "devknobs", type: "inspect", on: true, scheme: "dark" }, parent);
    expect(control.isOn()).toBe(true);
    expect(posted).toEqual([{ source: "devknobs", type: "inspect", on: true }]);
    await settle();
    expect(modes[0]?.options.scheme).toBe("dark");
    message({ source: "devknobs", type: "inspect", on: false }, parent);
    expect(control.isOn()).toBe(false);
  });

  test("grab in the frame does not hear inspect", () => {
    setWindow(FRAME_NAME);
    grab = createGrab({}, load);
    message({ source: "devknobs", type: "inspect", on: true }, parent);
    expect(grab.isOn()).toBe(false);
    expect(posted).toEqual([]);
  });
});

describe("grab and inspect", () => {
  test("are on one at a time: either going on ends the other", async () => {
    setWindow("");
    grab = createGrab({}, load);
    control = createInspect({ key: () => withShift("c") }, load, () => null);
    const stop = oneAtATime(grab, control);
    control.set(true);
    await settle();
    grab.set(true);
    expect(control.isOn()).toBe(false);
    expect(grab.isOn()).toBe(true);
    await settle();
    // Inspect's mode is stopped, and the one mode left is grab's.
    expect(modes.map((mode) => [mode.options.purpose !== undefined, mode.stopped])).toEqual([
      [true, true],
      [false, false],
    ]);
    control.set(true);
    expect(grab.isOn()).toBe(false);
    expect(control.isOn()).toBe(true);
    await settle();
    expect(modes[1]?.stopped).toBe(true);
    stop();
    grab.set(true);
    expect(control.isOn()).toBe(true);
  });

  test("grab is as it was: a pick of inspect's ends inspect alone, and grab's key still starts grab", async () => {
    setWindow("");
    grab = createGrab({}, load);
    control = createInspect({ key: () => withShift("c") }, load, () => null);
    oneAtATime(grab, control);
    window.dispatchEvent(shiftC());
    await settle();
    modes[0]?.options.onExit();
    expect(control.isOn()).toBe(false);
    expect(grab.isOn()).toBe(false);
    window.dispatchEvent(shiftC({ key: "G", code: "KeyG" }));
    expect(grab.isOn()).toBe(true);
    expect(control.isOn()).toBe(false);
  });
});

describe("a pick in the frame", () => {
  test("ends the mode there, and the page above hears the pick and then that inspect is off", async () => {
    setWindow(FRAME_NAME);
    control = createInspect({}, load, () => null);
    control.set(true);
    await settle();
    modes[0]?.options.purpose?.pick(element(document));
    modes[0]?.options.onExit();
    expect(control.isOn()).toBe(false);
    expect(posted).toEqual([
      { source: "devknobs", type: "inspect", on: true },
      { source: "devknobs", type: "picked" },
      { source: "devknobs", type: "inspect", on: false },
    ]);
  });

  test("is held on the frame's window, and the page above is told there is one", async () => {
    setWindow(FRAME_NAME);
    control = createInspect({}, load, () => null);
    const heard: Element[] = [];
    control.onPick((one) => heard.push(one));
    control.set(true);
    await settle();
    const button = element(document);
    modes[0]?.options.purpose?.pick(button);
    expect(Reflect.get(window, HELD)).toBe(button);
    expect(posted).toEqual([
      { source: "devknobs", type: "inspect", on: true },
      { source: "devknobs", type: "picked" },
    ]);
    // The frame's copy has no pane: the page above shows it.
    expect(heard).toEqual([]);
  });

  test("reaches the page above as the frame's own live element", () => {
    control = above();
    const heard: Element[] = [];
    control.onPick((one) => heard.push(one));
    const button = element(frame?.document ?? {});
    Reflect.set(frame ?? {}, HELD, button);
    message({ source: "devknobs", type: "picked" }, frame);
    expect(heard).toEqual([button]);
    expect(heard[0]).toBe(button);
  });

  test("is nothing where the frame holds no element, or another window says so", () => {
    control = above();
    const heard: Element[] = [];
    control.onPick((one) => heard.push(one));
    message({ source: "devknobs", type: "picked" }, frame);
    Reflect.set(frame ?? {}, HELD, "button");
    message({ source: "devknobs", type: "picked" }, frame);
    Reflect.set(frame ?? {}, HELD, element(frame?.document ?? {}));
    message({ source: "devknobs", type: "picked" }, {});
    expect(heard).toEqual([]);
  });
});

describe("the outline", () => {
  test("of an element of this page is drawn here, and loads with the first one", async () => {
    setWindow("");
    control = createInspect({}, load, () => null);
    control.outline(null);
    await settle();
    expect(outlines).toBe(0);
    const button = element(document);
    control.outline(button);
    await settle();
    expect(boxed).toEqual([button]);
    control.outline(null);
    expect(boxed).toEqual([button, null]);
    expect(outlines).toBe(1);
  });

  test("of an element of the frame's page is the frame's to draw", async () => {
    control = above();
    const button = element(frame?.document ?? {});
    control.outline(button);
    await settle();
    expect(Reflect.get(frame ?? {}, HELD)).toBe(button);
    expect(sent).toEqual([{ source: "devknobs", type: "outline" }]);
    expect(boxed).toEqual([]);
    control.outline(null);
    expect(Reflect.get(frame ?? {}, HELD)).toBe(null);
    expect(sent).toHaveLength(2);
  });

  test("in the frame, follows what the page above put on its window", async () => {
    setWindow(FRAME_NAME);
    control = createInspect({}, load, () => null);
    const button = element(document);
    Reflect.set(window, HELD, button);
    message({ source: "devknobs", type: "outline" }, parent);
    await settle();
    expect(boxed).toEqual([button]);
    Reflect.set(window, HELD, null);
    message({ source: "devknobs", type: "outline" }, parent);
    expect(boxed).toEqual([button, null]);
  });

  test("an area said before the outline loaded is the one it draws", async () => {
    setWindow("");
    control = createInspect({}, load, () => null);
    control.outline(element(document));
    control.area("padding");
    expect(areas).toEqual([]);
    await settle();
    expect(areas).toEqual(["padding"]);
  });

  test("one area of the box goes to the outline here, and to the frame's where it is up", async () => {
    control = above();
    control.outline(element(document));
    await settle();
    sent = [];
    control.area("padding");
    control.area(null);
    expect(areas).toEqual(["padding", null]);
    expect(sent).toEqual([
      { source: "devknobs", type: "area", ring: "padding" },
      { source: "devknobs", type: "area", ring: null },
    ]);
  });

  test("in the frame, the area the page above says is tinted on the outline there", async () => {
    setWindow(FRAME_NAME);
    control = createInspect({}, load, () => null);
    Reflect.set(window, HELD, element(document));
    message({ source: "devknobs", type: "outline" }, parent);
    await settle();
    message({ source: "devknobs", type: "area", ring: "margin" }, parent);
    message({ source: "devknobs", type: "area", ring: "sky" }, parent);
    message({ source: "devknobs", type: "area", ring: null }, parent);
    expect(areas).toEqual(["margin", null]);
  });

  test("an element of a page that is gone is boxed nowhere", async () => {
    control = above();
    control.outline(element({}));
    await settle();
    expect(boxed).toEqual([]);
    expect(Reflect.get(frame ?? {}, HELD)).toBe(null);
  });
});
