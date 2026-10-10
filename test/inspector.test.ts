import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { InspectControl } from "../src/grab/inspect";
import { createInspector, type Inspector, type LoadStyles, type PaneDoor } from "../src/ui/inspector";
import type { PaneView } from "../src/ui/pane";
import type { StylesContext } from "../src/ui/stylesview";
import type { Tips } from "../src/ui/tooltip";

/** Inspect's switch, as far as the inspector drives it. */
let on: boolean;
let modeListeners: ((on: boolean) => void)[];
let pickListeners: ((element: Element) => void)[];
let outlined: (Element | null)[];
/** The pane: the view that is open in it, and what its head was told to say. */
let open: PaneView | null;
let cleanup: (() => void) | null;
let paneListeners: ((id: string | null) => void)[];
let titles: [string, string][];
let opens: number;
/** The styles view the pane mounted: what it was shown, and what it was handed. */
let shown: (Element | null)[];
let refreshes: number;
let destroyed: number;
let handed: StylesContext | null;
let filterText: string;
let body: { nodes: unknown[]; append(node: unknown): void };
let inspector: Inspector | null = null;

const inspect: InspectControl = {
  isOn: () => on,
  set(next) {
    if (next === on) return;
    on = next;
    for (const listener of [...modeListeners]) listener(next);
  },
  subscribe(listener) {
    modeListeners.push(listener);
    return () => {
      modeListeners = modeListeners.filter((one) => one !== listener);
    };
  },
  onPick(listener) {
    pickListeners.push(listener);
    return () => {
      pickListeners = pickListeners.filter((one) => one !== listener);
    };
  },
  outline: (element) => {
    outlined.push(element);
  },
  destroy: () => undefined,
};

function emit(id: string | null): void {
  for (const listener of [...paneListeners]) listener(id);
}

/** The pane as `pane.ts` has it: one view at a time, the last one's cleanup run first. */
const pane: PaneDoor = {
  openPane(view) {
    if (open?.id === view.id) return;
    cleanup?.();
    open = view;
    opens++;
    const made = view.mount(body as unknown as HTMLElement);
    cleanup = typeof made === "function" ? made : null;
    emit(view.id);
  },
  paneView: () => open?.id ?? null,
  onPane(listener) {
    paneListeners.push(listener);
    return () => {
      paneListeners = paneListeners.filter((one) => one !== listener);
    };
  },
  retitlePane: (id, title) => {
    titles.push([id, title]);
  },
};

function closePane(): void {
  cleanup?.();
  cleanup = null;
  open = null;
  emit(null);
}

const load: LoadStyles = async () => ({
  createStylesView: (context) => {
    handed = context;
    return {
      node: {} as HTMLElement,
      show: (element) => {
        shown.push(element);
      },
      refresh: () => {
        refreshes++;
      },
      escape: () => {
        const had = filterText !== "";
        filterText = "";
        return had;
      },
      destroy: () => {
        destroyed++;
      },
    };
  },
});

const tips = {} as Tips;
const button = { tagName: "BUTTON" } as unknown as Element;
const link = { tagName: "A" } as unknown as Element;

function pick(element: Element): void {
  for (const listener of [...pickListeners]) listener(element);
}

async function settle(): Promise<void> {
  await Bun.sleep(0);
}

beforeEach(() => {
  on = false;
  modeListeners = [];
  pickListeners = [];
  outlined = [];
  open = null;
  cleanup = null;
  paneListeners = [];
  titles = [];
  opens = 0;
  shown = [];
  refreshes = 0;
  destroyed = 0;
  handed = null;
  filterText = "";
  body = {
    nodes: [],
    append(node) {
      this.nodes.push(node);
    },
  };
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: Object.assign(new EventTarget(), { location: { origin: "http://localhost:3000" } }),
  });
  inspector = createInspector({ inspect, tips }, load, pane);
});

afterEach(() => {
  inspector?.destroy();
  inspector = null;
  Reflect.deleteProperty(globalThis, "window");
});

describe("inspect going on", () => {
  test("opens the styles view in the pane, with nothing picked yet", async () => {
    inspect.set(true);
    await settle();
    expect(open?.id).toBe("styles");
    expect(open?.title).toBe("styles");
    expect(body.nodes).toHaveLength(1);
    expect(shown).toEqual([]);
    expect(on).toBe(true);
  });

  test("opens nothing if it went off again while the view loaded", async () => {
    inspect.set(true);
    inspect.set(false);
    await settle();
    expect(open).toBeNull();
  });

  test("with the view open already, leaves it and what it shows as they are", async () => {
    inspect.set(true);
    await settle();
    pick(button);
    inspect.set(false);
    inspect.set(true);
    await settle();
    expect(opens).toBe(1);
    expect(destroyed).toBe(0);
    expect(shown).toEqual([button]);
  });
});

describe("a pick", () => {
  test("shows in the view, and inspect stays on for the next", async () => {
    inspect.set(true);
    await settle();
    pick(button);
    pick(link);
    expect(shown).toEqual([button, link]);
    expect(on).toBe(true);
    expect(opens).toBe(1);
  });

  test("made while the view loads is the first thing it shows", async () => {
    inspect.set(true);
    pick(button);
    await settle();
    expect(shown).toEqual([button]);
  });

  test("the view says its element in the pane's head, and boxes it through inspect", async () => {
    inspect.set(true);
    await settle();
    handed?.title("button#save");
    handed?.outline(button);
    expect(titles).toEqual([["styles", "button#save"]]);
    expect(outlined).toEqual([button]);
  });
});

describe("escape", () => {
  test("with the focus in the pane, clears the view's filter first, then is the pane's", async () => {
    inspect.set(true);
    await settle();
    filterText = "color";
    expect(open?.escape?.()).toBe(true);
    expect(open?.escape?.()).toBe(false);
  });

  test("that ends the mode leaves the pane and what it shows", async () => {
    inspect.set(true);
    await settle();
    pick(button);
    // The mode takes the first escape itself, and only says it went off.
    inspect.set(false);
    expect(open?.id).toBe("styles");
    expect(destroyed).toBe(0);
    expect(outlined).toEqual([]);
  });
});

describe("the pane closing", () => {
  test("ends inspect and takes the box off the element", async () => {
    inspect.set(true);
    await settle();
    pick(button);
    closePane();
    expect(on).toBe(false);
    expect(destroyed).toBe(1);
    expect(outlined[outlined.length - 1]).toBeNull();
  });

  test("another view taking its place does the same", async () => {
    inspect.set(true);
    await settle();
    pane.openPane({ id: "other", title: "other", mount: () => undefined });
    expect(on).toBe(false);
    expect(destroyed).toBe(1);
    expect(outlined[outlined.length - 1]).toBeNull();
  });

  test("a pick left waiting is not shown by a view opened later", async () => {
    inspect.set(true);
    pick(button);
    emit(null);
    inspect.set(true);
    await settle();
    expect(shown).toEqual([]);
  });
});

describe("the inspector going", () => {
  test("hears nothing more", async () => {
    inspector?.destroy();
    inspect.set(true);
    await settle();
    expect(open).toBeNull();
    expect(modeListeners).toEqual([]);
    expect(pickListeners).toEqual([]);
    expect(paneListeners).toEqual([]);
  });
});
