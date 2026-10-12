import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { InspectControl } from "../src/grab/inspect";
import { createInspector, type Inspector, type LoadStyles, type PaneDoor } from "../src/ui/inspector";
import type { PaneView } from "../src/ui/pane";
import type { StylesMode } from "../src/ui/prefs";
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
/** How often the open view was brought back in sight. */
let shows: number;
/** The styles view the pane mounted: what it was shown, and what it was handed. */
let shown: (Element | null)[];
let refreshes: number;
let destroyed: number;
let focuses: number;
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
  area: () => undefined,
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
  showPane: (id) => {
    if (open?.id === id) shows++;
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
        context.held?.(element);
      },
      refresh: () => {
        refreshes++;
      },
      escape: () => {
        const had = filterText !== "";
        filterText = "";
        return had;
      },
      focus: () => {
        focuses++;
      },
      destroy: () => {
        destroyed++;
      },
    };
  },
});

const tips = {} as Tips;

/** An element of a page that shows, until `isConnected` is taken from it. */
function fakeElement(tagName: string, id: string): Element {
  return {
    tagName,
    isConnected: true,
    ownerDocument: { defaultView: {} },
    getAttribute: (name: string) => (name === "id" ? id : null),
  } as unknown as Element;
}

let button: Element;
let link: Element;

/** A pick, as the mode makes one: the element is handed over, and the mode ends. */
function pick(element: Element): void {
  for (const listener of [...pickListeners]) listener(element);
  inspect.set(false);
}

/** The select button, as the pane's head was handed it. */
function select() {
  const action = open?.actions?.[0];
  if (!action) throw new Error("no select button");
  return action;
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
  shows = 0;
  shown = [];
  refreshes = 0;
  destroyed = 0;
  focuses = 0;
  handed = null;
  filterText = "";
  button = fakeElement("BUTTON", "save");
  link = fakeElement("A", "home");
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
  test("opens the styles view in the panel, with nothing picked yet", async () => {
    inspect.set(true);
    await settle();
    // The view takes the focus the head's back button was given.
    expect(focuses).toBe(1);
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
    inspect.set(true);
    await settle();
    expect(opens).toBe(1);
    expect(destroyed).toBe(0);
    expect(shown).toEqual([button]);
    // A panel that closed over the view opens again for the picking.
    expect(shows).toBe(1);
  });
});

describe("a pick", () => {
  test("shows in the view, which stays open on it with the mode ended and nothing boxed", async () => {
    inspect.set(true);
    await settle();
    pick(button);
    expect(shown).toEqual([button]);
    expect(on).toBe(false);
    expect(open?.id).toBe("styles");
    expect(opens).toBe(1);
    expect(outlined.every((element) => element === null)).toBe(true);
    expect(inspector?.picked()).toBe("button#save");
  });

  test("made while the view loads is the first thing it shows, though the mode ended with it", async () => {
    inspect.set(true);
    pick(button);
    await settle();
    expect(open?.id).toBe("styles");
    expect(shown).toEqual([button]);
    // The picking is over, and the focus stays where the pane put it.
    expect(focuses).toBe(0);
  });

  test("the view says its element in the pane's head", async () => {
    inspect.set(true);
    await settle();
    handed?.title("button#save");
    expect(titles).toEqual([["styles", "button#save"]]);
  });

  test("tells who listens that the view holds another element, and none once it left", async () => {
    let heard = 0;
    inspector?.subscribe(() => heard++);
    inspect.set(true);
    await settle();
    pick(button);
    expect(heard).toBe(1);
    // A crumb showed an ancestor, and the view says so.
    handed?.held?.(link);
    expect(inspector?.picked()).toBe("a#home");
    handed?.held?.(null);
    expect(inspector?.picked()).toBeNull();
    expect(heard).toBe(3);
  });

  test("an element that left its page is held no more", async () => {
    inspect.set(true);
    await settle();
    pick(button);
    Object.assign(button, { isConnected: false });
    expect(inspector?.picked()).toBeNull();
  });
});

describe("the select button", () => {
  test("is the first of the head's actions, named, with inspect's key in its tooltip", async () => {
    inspector?.destroy();
    inspector = createInspector({ inspect, tips, key: () => "Shift C" }, load, pane);
    inspect.set(true);
    await settle();
    expect(open?.actions).toHaveLength(1);
    expect(select().label).toBe("select an element");
    expect(select().icon).toBe("square-dashed-mouse-pointer");
    expect(select().hint?.()).toBe("Shift C");
  });

  test("is pressed while the picking is on, however that went on or off, and tells its head", async () => {
    inspect.set(true);
    await settle();
    let told = 0;
    const stop = select().watch?.(() => told++);
    expect(select().pressed?.()).toBe(true);
    pick(button);
    expect(select().pressed?.()).toBe(false);
    expect(told).toBe(1);
    // By inspect's key.
    inspect.set(true);
    expect(select().pressed?.()).toBe(true);
    // By escape.
    inspect.set(false);
    expect(select().pressed?.()).toBe(false);
    expect(told).toBe(3);
    stop?.();
    inspect.set(true);
    expect(told).toBe(3);
  });

  test("starts the picking, and pressed again ends it with the element kept", async () => {
    inspect.set(true);
    await settle();
    pick(button);
    focuses = 0;
    select().run();
    expect(on).toBe(true);
    // The view takes the focus from the button, so the arrows and Enter are the picking's.
    expect(focuses).toBe(1);
    select().run();
    expect(on).toBe(false);
    expect(focuses).toBe(1);
    expect(shown).toEqual([button]);
    expect(inspector?.picked()).toBe("button#save");
  });
});

describe("the row's way in", () => {
  test("with nothing picked yet starts the picking, and opens the view", async () => {
    inspector?.open();
    expect(on).toBe(true);
    await settle();
    expect(open?.id).toBe("styles");
    expect(focuses).toBe(1);
  });

  test("with an element held opens the view on it, and picks nothing", async () => {
    inspector?.open();
    await settle();
    pick(button);
    closePane();
    expect(inspector?.picked()).toBe("button#save");
    shown = [];
    focuses = 0;
    inspector?.open();
    expect(on).toBe(false);
    await settle();
    expect(open?.id).toBe("styles");
    expect(on).toBe(false);
    expect(shown).toEqual([button]);
    expect(focuses).toBe(0);
    expect(select().pressed?.()).toBe(false);
  });

  test("with the view open on an element does nothing", async () => {
    inspector?.open();
    await settle();
    pick(button);
    inspector?.open();
    await settle();
    expect(on).toBe(false);
    expect(opens).toBe(1);
  });

  test("picks again where the element it held left its page", async () => {
    inspector?.open();
    await settle();
    pick(button);
    closePane();
    Object.assign(button, { isConnected: false });
    shown = [];
    inspector?.open();
    expect(on).toBe(true);
    await settle();
    expect(shown).toEqual([]);
  });

  test("while the picking is on, ends it", async () => {
    inspector?.open();
    await settle();
    inspector?.open();
    expect(on).toBe(false);
    expect(open?.id).toBe("styles");
  });

  test("taken back by another view before the view loaded, opens nothing", async () => {
    inspector?.open();
    await settle();
    pick(button);
    closePane();
    inspector?.open();
    pane.openPane({ id: "other", title: "other", mount: () => undefined });
    await settle();
    expect(open?.id).toBe("other");
  });
});

describe("what the view points at", () => {
  test("is boxed on the page while it is pointed at, and the box goes with the pointer", async () => {
    inspect.set(true);
    await settle();
    pick(button);
    outlined = [];
    handed?.outline(link);
    handed?.outline(null);
    expect(outlined).toEqual([link, null]);
  });

  test("is not boxed under the picking's own box, which takes any box off as it goes on", async () => {
    inspect.set(true);
    await settle();
    pick(button);
    handed?.outline(link);
    outlined = [];
    inspect.set(true);
    expect(outlined).toEqual([null]);
    handed?.outline(link);
    expect(outlined).toEqual([null]);
    // Taking a box off is never held back.
    handed?.outline(null);
    expect(outlined).toEqual([null, null]);
  });

  test("the head's line stands for the element held, and for nothing with none", async () => {
    inspect.set(true);
    await settle();
    open?.point?.(true);
    expect(outlined.every((element) => element === null)).toBe(true);
    pick(button);
    outlined = [];
    open?.point?.(true);
    open?.point?.(false);
    expect(outlined).toEqual([button, null]);
  });
});

describe("escape", () => {
  test("ends inspect first and stops, then clears the view's filter, then is the panel's", async () => {
    inspect.set(true);
    await settle();
    filterText = "color";
    expect(open?.escape?.()).toBe(true);
    expect(on).toBe(false);
    expect(filterText).toBe("color");
    expect(open?.escape?.()).toBe(true);
    expect(filterText).toBe("");
    expect(open?.escape?.()).toBe(false);
  });

  test("that ends the mode leaves the pane and what it shows", async () => {
    inspect.set(true);
    await settle();
    pick(button);
    inspect.set(true);
    // The mode takes the first escape itself, and only says it went off.
    inspect.set(false);
    expect(open?.id).toBe("styles");
    expect(destroyed).toBe(0);
    expect(shown).toEqual([button]);
    expect(inspector?.picked()).toBe("button#save");
  });
});

describe("the pane closing", () => {
  test("ends the picking and takes any box off, and the element is kept", async () => {
    inspect.set(true);
    await settle();
    pick(button);
    inspect.set(true);
    closePane();
    expect(on).toBe(false);
    expect(destroyed).toBe(1);
    expect(outlined[outlined.length - 1]).toBeNull();
    expect(inspector?.picked()).toBe("button#save");
  });

  test("another view taking its place does the same", async () => {
    inspect.set(true);
    await settle();
    pane.openPane({ id: "other", title: "other", mount: () => undefined });
    expect(on).toBe(false);
    expect(destroyed).toBe(1);
    expect(outlined[outlined.length - 1]).toBeNull();
  });

  test("a view that opens later is on the element still, with the picking on where it was asked for", async () => {
    inspect.set(true);
    await settle();
    pick(button);
    closePane();
    shown = [];
    inspect.set(true);
    await settle();
    expect(shown).toEqual([button]);
    expect(on).toBe(true);
  });
});

describe("the mode of the styles view", () => {
  test("is the one the preferences keep, and one picked in the view is kept there", async () => {
    inspector?.destroy();
    let mode: StylesMode = "simple";
    const kept: StylesMode[] = [];
    inspector = createInspector(
      {
        inspect,
        tips,
        prefs: {
          get: () => ({
            handle: true,
            listWidth: 240,
            viewWidth: 340,
            stylesMode: mode,
            stylesBox: true,
          }),
          setStylesMode: (next) => {
            mode = next;
            kept.push(next);
          },
          setStylesBox: () => undefined,
        },
      },
      load,
      pane,
    );
    inspect.set(true);
    await settle();
    expect(handed?.mode?.get()).toBe("simple");
    handed?.mode?.set("advanced");
    expect(kept).toEqual(["advanced"]);
    expect(handed?.mode?.get()).toBe("advanced");
  });

  test("with no preferences, the view is handed none and is the advanced one", async () => {
    inspect.set(true);
    await settle();
    expect(handed).not.toBeNull();
    expect(handed?.mode).toBeUndefined();
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
