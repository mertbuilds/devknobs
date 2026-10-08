import * as engine from "../engine";
import type { DevknobsStatePatch, SideValue } from "../types";
import {
  between,
  cornerAt,
  DRAG_SLOP,
  dragTarget,
  dragTo,
  FLING_SPAN,
  FLING_TRAVEL,
  glideTime,
  landSide,
  type Anchor,
  type Place,
  type Room,
  type Sample,
  settle,
  translateOf,
  velocity,
} from "./place";

/**
 * Where the handle and the panel show on the page, and the drag that moves
 * them: a press on the handle that travels drags, a fling throws the panel to
 * the other side, and what was dragged glides to where it lands.
 */

/** What the drag needs from the panel. */
export interface DragContext {
  /** The host, which is fixed to the side the panel is on. */
  host: HTMLElement;
  wrap: HTMLElement;
  handle: HTMLButtonElement;
  panel: HTMLElement;
  /** Draw the whole panel again. */
  render(): void;
  /** Open or close the panel, as a click on the handle does. */
  toggle(): void;
}

export interface Drag {
  /**
   * Lay the panel out for the heights there are now: by its top when what is
   * in it changed, the default, or by its edge when the window did.
   */
  layout(anchor?: Anchor): void;
  /** Whether the handle is being dragged. */
  dragging(): boolean;
  /** End a drag the window took away, back where it came from. */
  cancel(): void;
}

export function createDrag(context: DragContext): Drag {
  const { host, wrap, handle, panel } = context;

  /** The heights the panel lays itself out with, as they are now. */
  function measure(): Room {
    return {
      view: window.innerHeight,
      panel: panel.getBoundingClientRect().height,
      handle: handle.getBoundingClientRect().height,
    };
  }

  /** Where the panel last showed, and whether it showed the last time it was placed. */
  let shownTop = engine.getState().panel.top;
  let shownOpen = engine.getState().panel.open;

  /**
   * Make a change to the wrapper show at once, with no transition. A slide
   * that was running stops where the change puts it.
   */
  function jump(change: () => void): void {
    const was = wrap.style.transitionProperty;
    wrap.style.transitionProperty = "none";
    change();
    // Read the style back, so the change is in before the transitions return.
    wrap.getBoundingClientRect();
    wrap.style.transitionProperty = was;
  }

  /**
   * Put the handle and the panel where a place says, on the side it says.
   * `tab` tells the stylesheet which corner of the panel the handle covers,
   * if any, open or closed, so that corner stays square for as long as the
   * panel shows, the slide back and a toggle halfway through it included.
   * Closed, the panel stays where it last showed, so it slides out from its
   * own spot whatever the handle does, and takes the place it has by then
   * when it opens. The layout that closes it still moves it, as closing
   * leaves the search and the panel shows a last time at its new height.
   * The closed slide points the other way on the other side, so a change of
   * side jumps there rather than sweep across the window.
   */
  function placePanel(at: Place, open: boolean, side: SideValue): void {
    if (open || shownOpen) shownTop = at.top;
    shownOpen = open;
    if (wrap.dataset.side !== side) {
      jump(() => {
        wrap.dataset.side = side;
        host.style.left = side === "left" ? "0" : "";
        host.style.right = side === "right" ? "0" : "";
      });
    }
    wrap.dataset.tab = open ? at.tab : cornerAt(at.y, shownTop, measure());
    host.style.top = `${at.y}px`;
    panel.style.marginTop = `${shownTop - at.y}px`;
  }

  /**
   * Lay the panel out for the heights there are now and store where it
   * landed. The store renders again from here, which lays it out a second
   * time and finds nothing left to move. A drag owns the place until it ends,
   * and a handle with no height is off the page, with nothing to measure.
   * What is in the panel grows and shrinks by its top, so a row that folds
   * away does so in place, and the window by the edge the panel is flush with.
   */
  function layout(anchor: Anchor = "top"): void {
    if (dragging) return;
    const stored = engine.getState().panel;
    const room = measure();
    const next = room.handle > 0 ? settle(stored, room, anchor) : stored;
    placePanel(next, stored.open, stored.side);
    const moved =
      next.y !== stored.y ||
      next.top !== stored.top ||
      next.edge !== stored.edge ||
      next.tab !== stored.tab;
    if (moved) engine.setState({ panel: next });
  }

  let dragging = false;
  let dragged = false;
  /** The pointer that drags. Another one pressed meanwhile is left alone. */
  let pointer = -1;
  let startPointer = 0;
  let lastPointer = 0;
  let startX = 0;
  let lastX = 0;
  /** What the drag moves, where things sat when it took that over, and where they sit now. */
  let moving: "panel" | "handle" | null = null;
  let dragFrom: Place = engine.getState().panel;
  let dragAt: Place = dragFrom;
  /** Where the pointer would put what the drag moves, with no edge pulling it. */
  let loose = 0;
  /**
   * How far the drag carries what shows across, off its side, and down, which
   * is more than nothing only where it took over a glide that had not ended.
   */
  let across = 0;
  let down = 0;
  /** Where the pointer went lately, for its speed as it lets go. */
  let samples: Sample[] = [];

  /** The box of what shows: the handle, and the panel with it while it is open. */
  function shownBox(open: boolean): { left: number; top: number; width: number } {
    const tab = handle.getBoundingClientRect();
    if (!open) return { left: tab.left, top: tab.top, width: tab.width };
    const box = panel.getBoundingClientRect();
    const left = Math.min(tab.left, box.left);
    return { left, top: Math.min(tab.top, box.top), width: Math.max(tab.right, box.right) - left };
  }

  /** The window's width less a scrollbar, the room the host is fixed in. */
  function viewWidth(): number {
    return document.documentElement.clientWidth || window.innerWidth;
  }

  function sample(event: PointerEvent): void {
    samples = samples.filter((at) => at.t >= event.timeStamp - FLING_SPAN);
    samples.push({ t: event.timeStamp, x: event.clientX, y: event.clientY });
  }

  // A mouse press must not focus the handle: a key held mid-drag (shift) would
  // otherwise turn that focus into a visible ring. Keyboard focus is unaffected.
  handle.addEventListener("mousedown", (event: MouseEvent) => event.preventDefault());
  handle.addEventListener("pointerdown", (event: PointerEvent) => {
    if (event.button !== 0 || dragging) return;
    const { y, top, edge, tab } = engine.getState().panel;
    dragging = true;
    dragged = false;
    pointer = event.pointerId;
    startPointer = event.clientY;
    lastPointer = event.clientY;
    startX = event.clientX;
    lastX = event.clientX;
    samples = [];
    sample(event);
    moving = null;
    dragAt = { y, top, edge, tab };
    handle.setPointerCapture(event.pointerId);
  });

  handle.addEventListener("pointermove", (event: PointerEvent) => {
    if (!dragging || event.pointerId !== pointer) return;
    // Every move goes by its own step, so the slop is never paid back as a
    // jump and shift can take over halfway through without one either.
    const step = event.clientY - lastPointer;
    const stepX = event.clientX - lastX;
    lastPointer = event.clientY;
    lastX = event.clientX;
    sample(event);
    const travel = Math.hypot(event.clientX - startX, event.clientY - startPointer);
    if (!dragged && travel < DRAG_SLOP) return;
    if (!dragged) {
      // A glide still running stops where it shows, and the drag carries it on
      // from there, one to one with the pointer. An open or close slide runs on.
      ({ x: across, y: down } = translateOf(getComputedStyle(wrap).translate));
      wrap.style.transitionProperty = "transform";
      // The edge takes its free shape in the usual time, whatever the last glide took.
      wrap.style.removeProperty("--glide");
    }
    dragged = true;
    // The panel and the handle move as one, and shift lets the handle go
    // alone, halfway through a drag too, from where it shows.
    const { open, side } = engine.getState().panel;
    const target = dragTarget(event.shiftKey, open);
    wrap.dataset.drag = target;
    if (target !== moving) {
      moving = target;
      dragFrom = dragAt;
      loose = target === "panel" ? dragAt.top : dragAt.y;
    }
    loose += step;
    // Not through the store: a pointermove is no reason to re-apply every knob.
    dragAt = dragTo(target, open, loose, dragFrom, measure());
    placePanel(dragAt, open, side);
    // Across, what shows follows the pointer as far as the window goes. A
    // shift drag slides the handle along the panel and nowhere else.
    if (target === "panel" || !open) {
      const box = shownBox(open);
      const home = box.left - across;
      across = between(across + stepX, -home, viewWidth() - box.width - home);
    }
    wrap.style.translate = `${across}px ${down}px`;
    // Off its edge, the side that was against the window is drawn as a free one.
    wrap.dataset.float = across !== 0 ? "true" : "false";
  });

  /**
   * Put the panel down at a place, or back at its own with null, and glide it
   * there from where it shows: the place goes in, side and all, what shows is
   * measured there, moved back by the difference, and let go, so it slides
   * the rest of the way. The side swaps first, so the glide starts from what
   * shows under the pointer. A long way takes longer, and the edge eases back
   * flush in the same time, so it only stops floating here.
   */
  function land(next: DevknobsStatePatch["panel"] | null): void {
    const { open } = engine.getState().panel;
    const from = shownBox(open);
    wrap.style.transitionProperty = "transform";
    wrap.style.translate = "";
    if (next) engine.setState({ panel: next });
    else context.render();
    const to = shownBox(open);
    const x = from.left - to.left;
    const y = from.top - to.top;
    wrap.style.setProperty("--glide", `${glideTime(Math.hypot(x, y))}ms`);
    wrap.dataset.float = "false";
    if (x !== 0 || y !== 0) {
      wrap.style.translate = `${x}px ${y}px`;
      wrap.getBoundingClientRect();
    }
    wrap.style.transitionProperty = "";
    wrap.style.translate = "";
  }

  /**
   * End a drag. One the pointer let go of lands on the side `landSide` picks
   * for where it was let go and how fast it went, at the place it was
   * dragged to. One cut short goes back where it came from. A shift drag of
   * an open panel only slid the handle along it, so it keeps its side.
   */
  function endDrag(event: PointerEvent | null): void {
    if (!dragging) return;
    dragging = false;
    wrap.dataset.drag = "false";
    if (handle.hasPointerCapture(pointer)) handle.releasePointerCapture(pointer);
    if (dragged && event) {
      sample(event);
      const { open, side } = engine.getState().panel;
      const box = shownBox(open);
      const speed = velocity(samples, event.timeStamp);
      const flung = Math.abs(event.clientX - startX) >= FLING_TRAVEL ? speed.x : 0;
      const middle = box.left + box.width / 2;
      const slid = open && moving === "handle";
      land({
        ...dragAt,
        side: slid ? side : landSide(side, middle, viewWidth(), flung, speed.y),
      });
      // Only a move the user makes is kept for new tabs.
      engine.keepPlace();
    } else if (dragged) land(null);
    else context.render();
    // A pointer press leaves focus on the handle, and the next keypress (the
    // hotkey, say) would then promote it to :focus-visible. Keyboard users
    // never come through here, so they keep their focus.
    handle.blur();
  }

  handle.addEventListener("pointerup", (event: PointerEvent) => {
    if (event.pointerId === pointer) endDrag(event);
  });
  handle.addEventListener("pointercancel", (event: PointerEvent) => {
    if (event.pointerId !== pointer) return;
    endDrag(null);
    // No click follows a cancel, so there is none to swallow.
    dragged = false;
  });
  // The browser can take the pointer away, and a window that lost the focus
  // may never hear it come up. Either way the panel goes back to its place,
  // and the next click on the handle toggles it. The capture a pointerup lets
  // go of finds the drag already ended, and its click is still swallowed.
  handle.addEventListener("lostpointercapture", (event: PointerEvent) => {
    if (!dragging || event.pointerId !== pointer) return;
    endDrag(null);
    dragged = false;
  });
  // The drag that just ended still sends a click. Swallow that one.
  handle.addEventListener("click", () => {
    if (dragged) {
      dragged = false;
      return;
    }
    context.toggle();
  });

  return {
    layout,
    dragging: () => dragging,
    cancel(): void {
      if (!dragging) return;
      endDrag(null);
      dragged = false;
    },
  };
}
