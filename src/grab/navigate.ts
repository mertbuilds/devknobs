// adapted from react-grab (MIT, Copyright (c) 2025 Aiden Bai)
import { composedParent, isGrabbable } from "./hit";

/** Where an arrow key moves the selection. */
export type Step = "up" | "down" | "left" | "right";

/** How many parents up the selection remembers its way back down from. */
const HISTORY = 50;

/** The parts of a keydown that pick a step. */
export type StepKey = Pick<KeyboardEvent, "key" | "shiftKey">;

/** Arrows move the selection, and tab and shift-tab go along the siblings too. */
export function stepOf(event: StepKey): Step | null {
  switch (event.key) {
    case "ArrowUp":
      return "up";
    case "ArrowDown":
      return "down";
    case "ArrowLeft":
      return "left";
    case "ArrowRight":
      return "right";
    case "Tab":
      return event.shiftKey ? "left" : "right";
    default:
      return null;
  }
}

export interface Navigator {
  /** The element a step leads to from `current`, or null where it leads nowhere. */
  next(step: Step, current: Element): Element | null;
  /** Forget the way back down, as a pointer move picks a new element. */
  clear(): void;
}

function firstChild(element: Element, accept: (element: Element) => boolean): Element | null {
  const children = element.children.length > 0 ? element.children : element.shadowRoot?.children;
  for (const child of Array.from(children ?? [])) if (accept(child)) return child;
  return null;
}

/**
 * Up goes to the parent, up to the body and never past it. Down goes back the
 * way up came, else to the first child. Left and right go along the siblings,
 * and where those run out, to the sibling of the nearest parent that has one:
 * the element before or after in page order, under the body. Both forget the
 * way back down, which would lead into the branch just left.
 * What `accept` turns down is passed over: devknobs' own nodes and the root.
 */
export function createNavigator(accept: (element: Element) => boolean = isGrabbable): Navigator {
  let history: Element[] = [];

  function up(current: Element): Element | null {
    let parent = composedParent(current);
    while (parent && !accept(parent)) {
      const tag = parent.tagName.toLowerCase();
      if (tag === "body" || tag === "html") return null;
      parent = composedParent(parent);
    }
    if (!parent) return null;
    history.push(current);
    if (history.length > HISTORY) history = history.slice(-HISTORY);
    return parent;
  }

  function down(current: Element): Element | null {
    const previous = history.pop();
    if (previous?.isConnected) return previous;
    history = [];
    return firstChild(current, accept);
  }

  function along(current: Element, forward: boolean): Element | null {
    const sibling = (element: Element) =>
      forward ? element.nextElementSibling : element.previousElementSibling;
    for (let from: Element | null = current; from; from = composedParent(from)) {
      const tag = from.tagName.toLowerCase();
      if (tag === "body" || tag === "html") return null;
      for (let next = sibling(from); next; next = sibling(next)) {
        if (!accept(next)) continue;
        history = [];
        return next;
      }
    }
    return null;
  }

  return {
    next(step, current) {
      if (step === "up") return up(current);
      if (step === "down") return down(current);
      return along(current, step === "right");
    },
    clear() {
      history = [];
    },
  };
}
