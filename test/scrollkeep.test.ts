import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { FRAME_NAME } from "../src/engine/frame";
import {
  follow,
  HOLD,
  HOLD_CAP,
  type Holding,
  hold,
  type Kept,
  keep,
  keepOwn,
  keptWith,
  next,
  PUT_BUDGET,
  parseKept,
  resume,
  SCROLL_KEY,
  SCROLL_VERSION,
  SCROLL_WINDOW,
  type ScrollView,
  type Seen,
  take,
} from "../src/engine/scrollkeep";

const NOW = 1_000_000;

describe("the kept record", () => {
  test("reads back what was kept", () => {
    const kept: Kept = { at: NOW, page: { path: "/", x: 0, y: 640 } };
    expect(parseKept(JSON.stringify({ v: SCROLL_VERSION, ...kept }))).toEqual(kept);
  });

  test("is nothing when missing, malformed or from a newer devknobs", () => {
    expect(parseKept(null)).toBeNull();
    expect(parseKept("{")).toBeNull();
    expect(parseKept("12")).toBeNull();
    expect(parseKept(JSON.stringify({ v: SCROLL_VERSION, page: { path: "/", x: 0, y: 1 } }))).toBeNull();
    expect(parseKept(JSON.stringify({ v: SCROLL_VERSION + 1, at: NOW }))).toBeNull();
  });

  test("drops a place that is not whole", () => {
    const text = JSON.stringify({
      v: SCROLL_VERSION,
      at: NOW,
      page: { path: "/", x: 0, y: "640" },
      frame: { path: "/docs", x: 0, y: 320 },
    });
    expect(parseKept(text)).toEqual({ at: NOW, frame: { path: "/docs", x: 0, y: 320 } });
  });
});

describe("keeping a place", () => {
  test("keeps the place of a scrolled page", () => {
    expect(keptWith(null, "page", { path: "/", x: 0, y: 640 }, NOW)).toEqual({
      at: NOW,
      page: { path: "/", x: 0, y: 640 },
    });
  });

  test("keeps nothing for a page at its top", () => {
    expect(keptWith(null, "page", { path: "/", x: 0, y: 0 }, NOW)).toBeNull();
    expect(keptWith(null, "frame", null, NOW)).toBeNull();
  });

  test("leaves the other document's place while it is fresh", () => {
    const kept: Kept = { at: NOW, page: { path: "/", x: 0, y: 640 } };
    expect(keptWith(kept, "frame", { path: "/", x: 0, y: 320 }, NOW + 5)).toEqual({
      at: NOW + 5,
      page: { path: "/", x: 0, y: 640 },
      frame: { path: "/", x: 0, y: 320 },
    });
  });

  test("drops the other document's place once it is stale", () => {
    const kept: Kept = { at: NOW, page: { path: "/", x: 0, y: 640 } };
    expect(keptWith(kept, "frame", { path: "/", x: 0, y: 320 }, NOW + SCROLL_WINDOW)).toEqual({
      at: NOW + SCROLL_WINDOW,
      frame: { path: "/", x: 0, y: 320 },
    });
  });

  test("replaces its own place, with nothing too", () => {
    const kept: Kept = { at: NOW, frame: { path: "/", x: 0, y: 320 } };
    expect(keptWith(kept, "frame", null, NOW + 5)).toBeNull();
  });
});

describe("taking a place", () => {
  const kept: Kept = {
    at: NOW,
    page: { path: "/", x: 0, y: 640 },
    frame: { path: "/", x: 4, y: 320 },
  };

  test("gives a document its place once, and leaves the other's", () => {
    const page = take(kept, "page", "/", NOW + 200);
    expect(page.place).toEqual({ x: 0, y: 640 });
    expect(page.rest).toEqual({ at: NOW, frame: { path: "/", x: 4, y: 320 } });
    const frame = take(page.rest, "frame", "/", NOW + 900);
    expect(frame.place).toEqual({ x: 4, y: 320 });
    expect(frame.rest).toBeNull();
    expect(take(frame.rest, "frame", "/", NOW + 950).place).toBeNull();
  });

  test("gives nothing at another path, and the place goes", () => {
    const moved = take(kept, "page", "/docs", NOW + 200);
    expect(moved.place).toBeNull();
    expect(moved.rest).toEqual({ at: NOW, frame: { path: "/", x: 4, y: 320 } });
  });

  test("gives nothing once the record is stale, or from ahead of the clock", () => {
    expect(take(kept, "page", "/", NOW + SCROLL_WINDOW)).toEqual({ place: null, rest: null });
    expect(take(kept, "page", "/", NOW - 1)).toEqual({ place: null, rest: null });
  });

  test("gives nothing where nothing was kept", () => {
    expect(take(null, "page", "/", NOW)).toEqual({ place: null, rest: null });
    expect(take({ at: NOW, page: kept.page }, "frame", "/", NOW)).toEqual({
      place: null,
      rest: { at: NOW, page: kept.page },
    });
  });
});

describe("a step of the hold", () => {
  const holding = (patch: Partial<Holding> = {}): Holding => ({
    target: { x: 0, y: 640 },
    start: NOW,
    loadedAt: null,
    puts: 0,
    ...patch,
  });
  const seen = (patch: Partial<Seen> = {}): Seen => ({
    x: 0,
    y: 0,
    maxX: 0,
    maxY: 2000,
    now: NOW + 16,
    ...patch,
  });

  test("waits while the page is too short to get there", () => {
    expect(next(holding(), seen({ maxY: 300 }))).toBe("wait");
  });

  test("puts the page back once it is long enough", () => {
    expect(next(holding(), seen())).toBe("put");
    expect(next(holding(), seen({ maxY: 640 }))).toBe("put");
  });

  test("leaves a page that is there already, and goes on watching", () => {
    expect(next(holding(), seen({ y: 640 }))).toBe("wait");
    expect(next(holding(), seen({ y: 640.6 }))).toBe("wait");
  });

  test("puts back a page the host moved after it was there", () => {
    expect(next(holding({ puts: 1, loadedAt: NOW }), seen({ y: 0, now: NOW + 400 }))).toBe("put");
  });

  test("ends some time after the load with the page in place", () => {
    const loaded = holding({ loadedAt: NOW + 100 });
    expect(next(loaded, seen({ y: 640, now: NOW + 100 + HOLD - 1 }))).toBe("wait");
    expect(next(loaded, seen({ y: 640, now: NOW + 100 + HOLD }))).toBe("done");
  });

  test("puts a page that never got long enough as far as it goes, and ends", () => {
    const loaded = holding({ loadedAt: NOW + 100 });
    expect(next(loaded, seen({ maxY: 300, now: NOW + 100 + HOLD }))).toBe("last");
  });

  test("ends a page that never loads", () => {
    expect(next(holding(), seen({ y: 640, now: NOW + HOLD_CAP - 1 }))).toBe("wait");
    expect(next(holding(), seen({ y: 640, now: NOW + HOLD_CAP }))).toBe("done");
  });

  test("lets a host that keeps moving the page win", () => {
    expect(next(holding({ puts: PUT_BUDGET }), seen())).toBe("done");
    const late = holding({ puts: PUT_BUDGET, loadedAt: NOW });
    expect(next(late, seen({ now: NOW + HOLD }))).toBe("done");
  });
});

/** A window with a page `height` long in a viewport of 800, and its frames run by hand. */
function fakeView(height: number) {
  const frames: Array<() => void> = [];
  const listeners = new Map<string, () => void>();
  const puts: number[] = [];
  const root = { scrollWidth: 1200, scrollHeight: height, clientWidth: 1200, clientHeight: 800 };
  const view = {
    scrollX: 0,
    scrollY: 0,
    document: { readyState: "loading", documentElement: root },
    scrollTo(options: ScrollToOptions) {
      const top = Math.min(options.top ?? 0, Math.max(0, root.scrollHeight - root.clientHeight));
      view.scrollY = top;
      puts.push(top);
    },
    addEventListener: (type: string, listener: () => void) => void listeners.set(type, listener),
    removeEventListener: (type: string) => void listeners.delete(type),
    requestAnimationFrame(callback: () => void) {
      frames.push(callback);
      return frames.length;
    },
  } satisfies ScrollView;
  /** Run the frame that waits. False once the hold asked for no more. */
  const frame = (): boolean => {
    const callback = frames.shift();
    callback?.();
    return callback !== undefined;
  };
  return { view, root, puts, listeners, frames, frame };
}

describe("the hold on a page", () => {
  const TARGET = { x: 0, y: 640 };

  test("waits for the page to grow, then puts it back once", () => {
    const page = fakeView(900);
    let time = NOW;
    hold(page.view, TARGET, () => time);
    expect(page.puts).toEqual([]);
    time += 16;
    page.frame();
    expect(page.puts).toEqual([]);
    page.root.scrollHeight = 3000;
    time += 16;
    page.frame();
    time += 16;
    page.frame();
    expect(page.puts).toEqual([640]);
  });

  test("does not scroll a page the host already put there", () => {
    const page = fakeView(3000);
    page.view.scrollY = 640;
    let time = NOW;
    hold(page.view, TARGET, () => time);
    page.view.document.readyState = "complete";
    for (time = NOW + 16; time < NOW + HOLD; time += 16) page.frame();
    expect(page.puts).toEqual([]);
  });

  test("puts back a page the host sends to the top as it mounts", () => {
    const page = fakeView(3000);
    let time = NOW;
    hold(page.view, TARGET, () => time);
    page.view.document.readyState = "complete";
    time += 300;
    page.view.scrollY = 0;
    page.frame();
    expect(page.puts).toEqual([640, 640]);
    expect(page.view.scrollY).toBe(640);
  });

  test("ends after its time, and listens no more", () => {
    const page = fakeView(3000);
    let time = NOW;
    hold(page.view, TARGET, () => time);
    expect(page.listeners.size).toBe(4);
    page.view.document.readyState = "complete";
    time += 16;
    page.frame();
    time += HOLD;
    page.frame();
    expect(page.frames).toEqual([]);
    expect(page.listeners.size).toBe(0);
    page.view.scrollY = 0;
    expect(page.frame()).toBe(false);
    expect(page.puts).toEqual([640]);
  });

  test("stops at once when the visitor scrolls", () => {
    const page = fakeView(900);
    let time = NOW;
    hold(page.view, TARGET, () => time);
    page.listeners.get("wheel")?.();
    expect(page.listeners.size).toBe(0);
    page.root.scrollHeight = 3000;
    time += 16;
    page.frame();
    expect(page.puts).toEqual([]);
    expect(page.frames).toEqual([]);
  });

  test("puts a page that stays short at its end", () => {
    const page = fakeView(1000);
    let time = NOW;
    hold(page.view, TARGET, () => time);
    page.view.document.readyState = "complete";
    time += 16;
    page.frame();
    time += HOLD;
    page.frame();
    expect(page.puts).toEqual([200]);
    expect(page.frames).toEqual([]);
  });
});

describe("across a reload", () => {
  let items: Map<string, string>;
  let frames: Array<() => void>;
  let puts: number[];

  /** Stand a window up as the page, or as the copy in the frame, scrolled to `y`. */
  function page(path: string, y: number, name = ""): void {
    frames = [];
    puts = [];
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        name,
        frameElement: null,
        location: { pathname: path },
        scrollX: 0,
        scrollY: y,
        sessionStorage: {
          getItem: (key: string) => items.get(key) ?? null,
          setItem: (key: string, value: string) => items.set(key, value),
          removeItem: (key: string) => items.delete(key),
        },
        document: {
          readyState: "complete",
          documentElement: { scrollWidth: 1200, scrollHeight: 3000, clientWidth: 1200, clientHeight: 800 },
        },
        scrollTo: (options: ScrollToOptions) => puts.push(options.top ?? 0),
        addEventListener: () => {},
        removeEventListener: () => {},
        requestAnimationFrame: (callback: () => void) => frames.push(callback),
      },
    });
  }

  /** A frame's window as the page above sees it. */
  function inner(path: string, y: number): Window {
    const view = { location: { pathname: path }, scrollX: 0, scrollY: y };
    return view as unknown as Window;
  }

  beforeEach(() => {
    items = new Map();
  });

  afterEach(() => {
    follow(null);
    Reflect.deleteProperty(globalThis, "window");
  });

  test("the page comes back where it was, once", () => {
    page("/", 640);
    keepOwn();
    page("/", 0);
    resume();
    expect(puts).toEqual([640]);
    expect(items.has(SCROLL_KEY)).toBe(false);
    page("/", 0);
    resume();
    expect(puts).toEqual([]);
  });

  test("a load devknobs did not ask for restores nothing", () => {
    page("/", 640);
    page("/", 0);
    resume();
    expect(puts).toEqual([]);
    expect(frames).toEqual([]);
  });

  test("a load at another path restores nothing, and uses the place up", () => {
    page("/", 640);
    keepOwn();
    page("/docs", 0);
    resume();
    expect(puts).toEqual([]);
    expect(items.has(SCROLL_KEY)).toBe(false);
  });

  test("the page's reload keeps the frame's place for the frame built after it", () => {
    page("/", 0);
    follow(() => inner("/", 320));
    keepOwn();
    // The page was at its top under the frame: it has nothing to go back to.
    page("/", 0);
    resume();
    expect(puts).toEqual([]);
    expect(items.has(SCROLL_KEY)).toBe(true);
    page("/", 0, FRAME_NAME);
    resume();
    expect(puts).toEqual([320]);
    expect(items.has(SCROLL_KEY)).toBe(false);
  });

  test("the frame's own reload keeps its place, and leaves the page's alone", () => {
    page("/", 0);
    keep(inner("/", 320), "frame");
    page("/", 0);
    resume();
    expect(puts).toEqual([]);
    page("/", 0, FRAME_NAME);
    resume();
    expect(puts).toEqual([320]);
  });

  test("a frame on another origin keeps nothing", () => {
    page("/", 0);
    const away = {
      get location(): Location {
        throw new Error("cross-origin");
      },
    };
    keep(away as unknown as Window, "frame");
    expect(items.has(SCROLL_KEY)).toBe(false);
  });

  test("storage that refuses keeps and restores nothing", () => {
    page("/", 640);
    Object.defineProperty(window, "sessionStorage", {
      get() {
        throw new Error("denied");
      },
    });
    keepOwn();
    resume();
    expect(puts).toEqual([]);
  });
});
