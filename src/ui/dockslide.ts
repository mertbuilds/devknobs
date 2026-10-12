import { ease, FADE_CURVE, lerp } from "../engine/morph";
import type { SideValue } from "../types";

/**
 * A pinned panel's way out and away, and its handle's, as one sequence. The
 * column slides by itself: closing, it goes all the way off its edge first,
 * and only then the handle comes in from that edge. Opening, the column comes
 * out at once and the handle goes off the edge as it does.
 *
 * No strip shows between the page and the column at any frame, by how it is
 * made: the column is drawn here, a frame at a time, and the page's frame
 * asks in that same frame where it was drawn, so the frame's edge is the
 * column's drawn edge. The handle is never part of the column: it lies over
 * the page, at the window's edge, and takes no room from it.
 *
 * A change on the way goes on from what shows: the column turns round where
 * it is, a handle that waits its turn stays where it got to, and one frame
 * asked for is all that ever waits. A floating panel has none of this: its
 * handle rides its edge, as the stylesheet slides the two.
 */

/** How long the column's whole slide takes, and the handle's, in ms, as a floating panel's. */
export const DOCK_SLIDE = 150;

/** What shows of a pinned panel: how far its column is out and its handle in, each 0 to 1. */
export interface Shown {
  column: number;
  handle: number;
}

/** Where the sequence goes: the panel out, or away, with its handle in where one shows. */
export interface Aim {
  open: boolean;
  handle: boolean;
}

/** One of the two on its way: from where, to where, since when and for how long. */
interface Leg {
  from: number;
  to: number;
  start: number;
  time: number;
}

/** What shows once the sequence for `aim` is over. */
export function restOf(aim: Aim): Shown {
  return { column: aim.open ? 1 : 0, handle: !aim.open && aim.handle ? 1 : 0 };
}

export interface Sequence {
  /**
   * Go to `aim` from what shows at `time`. `still` lands there at once, as
   * under reduced motion.
   */
  go(aim: Aim, time: number, still: boolean): void;
  /** What shows at `time`, the same however often one frame asks. */
  at(time: number): Shown;
  /** Is the column on its way? */
  moving(): boolean;
  /** Is all of it where it goes? */
  resting(): boolean;
  /** Does the handle wait for the column, or come in after it? */
  coming(): boolean;
}

/** The sequence of a panel that starts at rest at `first`. */
export function createSequence(first: Aim): Sequence {
  let aim = first;
  let shown = restOf(first);
  /** The way each is on, null at rest and while the handle waits its turn. */
  let column: Leg | null = null;
  let handle: Leg | null = null;

  /** The way from `from` to `to`, which takes its share of the whole slide's time, or none. */
  function leg(from: number, to: number, start: number): Leg | null {
    return from === to ? null : { from, to, start, time: DOCK_SLIDE * Math.abs(to - from) };
  }

  /** Where a leg is at `time`, and whether it has landed. */
  function along(way: Leg, time: number): { value: number; landed: boolean } {
    const share = (time - way.start) / way.time;
    if (share >= 1) return { value: way.to, landed: true };
    return { value: lerp(way.from, way.to, ease(FADE_CURVE, share)), landed: false };
  }

  function at(time: number): Shown {
    if (column) {
      const now = along(column, time);
      shown = { ...shown, column: now.value };
      if (now.landed) {
        column = null;
        // The handle's turn: it comes in once the column is all the way off.
        if (!aim.open && aim.handle) handle = leg(shown.handle, 1, time);
      }
    }
    if (handle) {
      const now = along(handle, time);
      shown = { ...shown, handle: now.value };
      if (now.landed) handle = null;
    }
    return shown;
  }

  return {
    go(next, time, still): void {
      if (next.open === aim.open && next.handle === aim.handle) return;
      at(time);
      aim = next;
      if (still) {
        column = null;
        handle = null;
        shown = restOf(next);
        return;
      }
      column = leg(shown.column, next.open ? 1 : 0, time);
      // Going away, the handle leaves with the column that comes out, or with
      // no column on its way. Coming in, it waits for the column to be off.
      if (next.open || !next.handle) handle = leg(shown.handle, 0, time);
      else handle = column ? null : leg(shown.handle, 1, time);
    },
    at,
    moving: () => column !== null,
    resting: () => column === null && handle === null,
    coming: () => !aim.open && aim.handle,
  };
}

/** The panel as the sequence is aimed: pinned or not, on which side, out or away, its handle shown or not. */
export interface SlideAim extends Aim {
  docked: boolean;
  side: SideValue;
}

/** What is asked of the wrapper: its attributes, and the variables on its style. */
interface Marked {
  dataset: Record<string, string | undefined>;
  style: { setProperty(name: string, value: string): void; removeProperty(name: string): unknown };
}

/** What the sequence needs from the panel, and from the window. */
export interface SlideContext {
  /** The wrapper, which says in its attributes what the stylesheet draws. */
  wrap: Marked;
  /** The panel, for the width its column slides by. */
  panel: { offsetWidth: number };
  /** The time now, in ms, on the clock the frames come by. */
  clock(): number;
  /** Does nothing move, as under reduced motion? */
  still(): boolean;
  /** Ask for the next frame, and drop one asked for. */
  frame(run: (time: number) => void): number;
  drop(id: number): void;
}

export interface DockSlide {
  /** Go where the panel is now. A floating panel is left to the stylesheet. */
  aim(to: SlideAim): void;
  /**
   * Draw what shows in the frame of `time`, and say whether the column is on
   * its way. The page's frame asks here before it reads the column.
   */
  draw(time: number): boolean;
  /** Drop the frame asked for and leave the wrapper as a floating panel's. */
  destroy(): void;
}

/**
 * Run the sequence on the wrapper. `data-column` says the column is `out`,
 * `away` or `sliding`, off its edge by `--column-away` in whole px, so the
 * page's edge meets it. `data-handle-at` says the handle is at the `edge` or
 * `sliding`, off it by `--handle-away` of its width, and is not there while no
 * handle shows.
 */
export function createDockSlide(context: SlideContext): DockSlide {
  const { wrap, panel } = context;
  /** The sequence, null while the panel floats. */
  let sequence: Sequence | null = null;
  let side: SideValue = "right";
  let frame = 0;

  function put(shown: Shown, coming: boolean): void {
    const sign = side === "left" ? -1 : 1;
    if (shown.column === 1 || shown.column === 0) {
      wrap.dataset.column = shown.column === 1 ? "out" : "away";
      wrap.style.removeProperty("--column-away");
    } else {
      wrap.dataset.column = "sliding";
      const away = Math.round(panel.offsetWidth * (1 - shown.column));
      wrap.style.setProperty("--column-away", `${sign * away}px`);
    }
    if (shown.handle === 1) {
      wrap.dataset.handleAt = "edge";
      wrap.style.removeProperty("--handle-away");
    } else if (shown.handle > 0 || coming) {
      wrap.dataset.handleAt = "sliding";
      wrap.style.setProperty("--handle-away", String(sign * (1 - shown.handle)));
    } else {
      delete wrap.dataset.handleAt;
      wrap.style.removeProperty("--handle-away");
    }
  }

  function stop(): void {
    if (frame) context.drop(frame);
    frame = 0;
  }

  function draw(time: number): boolean {
    if (!sequence) return false;
    put(sequence.at(time), sequence.coming());
    if (sequence.resting()) stop();
    else frame ||= context.frame(tick);
    return sequence.moving();
  }

  function tick(time: number): void {
    frame = 0;
    draw(time);
  }

  function clear(): void {
    stop();
    sequence = null;
    delete wrap.dataset.column;
    delete wrap.dataset.handleAt;
    wrap.style.removeProperty("--column-away");
    wrap.style.removeProperty("--handle-away");
  }

  return {
    aim(to): void {
      side = to.side;
      if (!to.docked) {
        if (sequence) clear();
        return;
      }
      const now = context.clock();
      // A panel pinned now, or built pinned, is at rest where it is.
      if (!sequence) sequence = createSequence(to);
      else sequence.go(to, now, context.still());
      draw(now);
    },
    draw,
    destroy: clear,
  };
}
