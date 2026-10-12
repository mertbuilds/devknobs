import { isDevknobsFrame, post, readMessage } from "../engine/frame";
import { frameWindow } from "../engine/width";
import { label } from "../styles/tree";
import type { BoxRing } from "./boxmodel";
import { createGrab, type GrabControl, type GrabControlOptions, type LoadMode } from "./control";
import type { Outline } from "./outline";

/** Loads the mode and the outline, the first time inspect turns on. */
export type LoadInspect = () => Promise<
  Awaited<ReturnType<LoadMode>> & { createOutline: () => Outline }
>;

export interface InspectControl extends GrabControl {
  /** Hear each element inspect picks, here or in the frame. Returns the way to stop. */
  onPick(listener: (element: Element) => void): () => void;
  /** Put a quiet box on an element, in the frame's page too, or with null take it off. */
  outline(element: Element | null): void;
  /** Tint one area of the outlined element's box alone, or with null all four again. */
  area(ring: BoxRing | null): void;
}

/**
 * Grab and inspect are the same picking with another end, so one of the two
 * is on at a time: either going on ends the other. Returns the way to stop.
 */
export function oneAtATime(grab: GrabControl, inspect: GrabControl): () => void {
  const stops = [
    grab.subscribe((on) => {
      if (on) inspect.set(false);
    }),
    inspect.subscribe((on) => {
      if (on) grab.set(false);
    }),
  ];
  return () => {
    for (const stop of stops) stop();
  };
}

/**
 * Where the frame's window holds the element inspect is on. A message cannot
 * carry an element, and the page above reads the frame's window as it is on
 * the same origin, so a message only says that the element here changed.
 */
const HELD = Symbol.for("devknobs.inspected");

/** Told by its node type, as `instanceof` fails for an element of the frame's window. */
function isElement(value: unknown): value is Element {
  return typeof value === "object" && value !== null && "nodeType" in value && value.nodeType === 1;
}

function held(view: Window): Element | null {
  try {
    const value: unknown = Reflect.get(view, HELD);
    return isElement(value) ? value : null;
  } catch {
    // A frame that left the origin holds nothing to read.
    return null;
  }
}

/**
 * Inspect's switch: grab's own, with its key, its hold and its way into the
 * frame, where a pick copies nothing, is handed to whoever listens on the
 * page above, and ends the mode. The label says `styles` before the element, so the two modes
 * are told apart. The element picked is the live one, the frame's too, so the
 * page above reads its rules itself and keeps them to edit later. `frameOf`
 * is the frame's window while it is up, for a test to stand in for.
 */
export function createInspect(
  options: Pick<GrabControlOptions, "key"> = {},
  load: LoadInspect = () => import("./index"),
  frameOf: () => Window | null = frameWindow,
): InspectControl {
  const inFrame = isDevknobsFrame();
  const listeners = new Set<(element: Element) => void>();
  let outliner: Outline | null = null;
  /** The element to box on this page, kept while the outline loads. */
  let boxed: Element | null = null;
  /** The area to tint alone, kept for an outline that loads after it was said. */
  let tinted: BoxRing | null = null;
  let destroyed = false;

  function pick(element: Element): void {
    if (inFrame) {
      Reflect.set(window, HELD, element);
      post(window.parent, { source: "devknobs", type: "picked" });
      return;
    }
    for (const listener of Array.from(listeners)) listener(element);
  }

  const control = createGrab(
    {
      key: options.key,
      purpose: {
        channel: "inspect",
        label: (element) => ({ tag: "styles", name: label(element) }),
        pick,
      },
    },
    load,
  );

  function box(element: Element | null): void {
    boxed = element;
    if (outliner) {
      outliner.show(element);
      return;
    }
    if (!element) return;
    void load().then(({ createOutline }) => {
      if (destroyed) return;
      outliner ??= createOutline();
      outliner.show(boxed);
      if (tinted) outliner.area(tinted);
    });
  }

  /** An element of the frame's page is boxed there, by the copy that draws on it. */
  function outline(element: Element | null): void {
    const view = inFrame ? null : frameOf();
    if (view) {
      try {
        const theirs = element !== null && element.ownerDocument === view.document;
        Reflect.set(view, HELD, theirs ? element : null);
        post(view, { source: "devknobs", type: "outline" });
      } catch {
        // A frame that left the origin has no page of ours to draw on.
      }
    }
    box(element?.ownerDocument === document ? element : null);
  }

  /** The area goes to the copy that draws the box: this one, and the frame's where it is up. */
  function area(ring: BoxRing | null): void {
    const view = inFrame ? null : frameOf();
    if (view) post(view, { source: "devknobs", type: "area", ring });
    tint(ring);
  }

  function tint(ring: BoxRing | null): void {
    tinted = ring;
    outliner?.area(ring);
  }

  function onMessage(event: MessageEvent): void {
    if (inFrame) {
      const message = readMessage(event, window.parent, window.location.origin);
      if (message?.type === "outline") box(held(window));
      else if (message?.type === "area") tint(message.ring);
      return;
    }
    const view = frameOf();
    const message = readMessage(event, view, window.location.origin);
    const element = message?.type === "picked" && view ? held(view) : null;
    if (element) pick(element);
  }

  window.addEventListener("message", onMessage);

  return {
    ...control,
    onPick(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    outline,
    area,
    destroy() {
      destroyed = true;
      control.destroy();
      window.removeEventListener("message", onMessage);
      listeners.clear();
      outliner?.destroy();
      outliner = null;
    },
  };
}
