import { describe, expect, test } from "bun:test";
import { isGrabKey, pressTurnsOn } from "../src/grab/keys";
import {
  BINDING_WORDS,
  BINDINGS,
  comboProblem,
  readKeys,
  recordStep,
  resolveKeys,
} from "../src/ui/bindings";
import { ACTIONS } from "../src/ui/catalog";
import { keyChips } from "../src/ui/footer";
import { ACTION_ICONS, BINDING_ICONS, ICONS } from "../src/ui/icons";
import { comboText, defaultKeys, keyAction, type KeyLike, withShift } from "../src/ui/keys";

function press(patch: Partial<KeyLike>): KeyLike {
  return {
    key: "",
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    target: null,
    composedPath: () => [],
    ...patch,
  };
}

describe("the inspect action", () => {
  test("is in the catalog after grab, with its own icon", () => {
    expect(ACTIONS.map((action) => action.id)).toEqual(["grab", "inspect", "replay"]);
    const inspect = ACTIONS.find((action) => action.id === "inspect");
    expect(inspect?.label).toBe("inspect");
    expect(inspect?.long).toBe("pick an element to see its styles");
    expect(ACTION_ICONS.inspect).not.toBe(ACTION_ICONS.grab);
    expect(ICONS[ACTION_ICONS.inspect].length).toBeGreaterThan(0);
    expect(BINDING_ICONS.inspect).toBe(ACTION_ICONS.inspect);
  });

  test("grab is no longer found as inspect", () => {
    expect(ACTIONS.find((action) => action.id === "grab")?.aliases).not.toContain("inspect");
  });
});

describe("the inspect key", () => {
  test("is shift and c, listed after grab's", () => {
    expect(comboText(defaultKeys().inspect)).toBe("shift+c");
    expect(BINDINGS).toEqual(["panel", "grab", "inspect", "replay", "reset"]);
    expect(BINDING_WORDS.inspect).toBe("inspect");
  });

  test("clashes with no other default, and a press turns inspect on as grab's does", () => {
    const keys = defaultKeys();
    const texts = BINDINGS.map((binding) => comboText(keys[binding]));
    expect(new Set(texts).size).toBe(texts.length);
    for (const binding of BINDINGS) expect(comboProblem(keys[binding], binding, keys)).toBeNull();
    expect(pressTurnsOn(keys.inspect)).toBe(true);
    const event = { key: "C", code: "KeyC", altKey: false, ctrlKey: false, metaKey: false };
    expect(isGrabKey({ ...event, shiftKey: true }, keys.inspect)).toBe(true);
    expect(isGrabKey({ ...event, shiftKey: true }, keys.grab)).toBe(false);
    // The panel's own actions leave it alone.
    expect(keyAction(press({ key: "C", code: "KeyC", shiftKey: true }), keys)).toBeNull();
  });

  test("gives way where the mount put the panel or grab on shift and c", () => {
    expect(comboText(defaultKeys({ hotkey: "c" }).inspect)).toBe("shift+i");
    expect(comboText(defaultKeys({ grabKey: "shift+c" }).inspect)).toBe("shift+i");
    expect(comboText(defaultKeys({ hotkey: "c", grabKey: "shift+i" }).inspect)).toBe("shift+y");
    // Grab on meta and c, as react-grab has it, is another key.
    expect(comboText(defaultKeys({ grabKey: "meta+c" }).inspect)).toBe("shift+c");
  });

  test("is set in the panel like the others: kept, refused where taken, and named to the rest", () => {
    const keys = defaultKeys();
    const x = press({ key: "X", code: "KeyX", shiftKey: true });
    expect(recordStep(x, "inspect", keys)).toEqual({ type: "keep", combo: withShift("x") });
    const g = press({ key: "G", code: "KeyG", shiftKey: true });
    expect(recordStep(g, "inspect", keys)).toEqual({ type: "refuse", reason: "used by grab" });
    const c = press({ key: "C", code: "KeyC", shiftKey: true });
    expect(recordStep(c, "grab", keys)).toEqual({ type: "refuse", reason: "used by inspect" });
  });

  test("is stored and read back with the others", () => {
    const stored = readKeys(JSON.stringify({ inspect: "Alt+Shift+I", grab: "shift+x" }));
    expect(stored).toEqual({ inspect: "alt+shift+i", grab: "shift+x" });
    expect(comboText(resolveKeys(defaultKeys(), stored).inspect)).toBe("alt+shift+i");
    // One set to another binding's key gives way to its default.
    const clash = resolveKeys(defaultKeys(), { inspect: "shift+g" });
    expect(comboText(clash.inspect)).toBe("shift+c");
  });
});

describe("the inspect chip", () => {
  test("sits after grab's in the footer where there is an inspect", () => {
    expect(keyChips(defaultKeys(), true, true, true)).toEqual([
      { command: "panel", key: "⇧K", word: "panel" },
      { command: "search", key: "/", word: "search" },
      { command: "grab", key: "⇧G", word: "grab" },
      { command: "inspect", key: "⇧C", word: "inspect" },
      { command: "replay", key: "⇧R", word: "replay animations" },
      { command: "reset", key: "⇧⌫", word: "reset" },
    ]);
    expect(keyChips(defaultKeys(), true, false, true)[3]?.key).toBe("Shift C");
  });

  test("shows the key the user set, and is left out with no inspect", () => {
    const keys = resolveKeys(defaultKeys(), { inspect: "alt+i" });
    expect(keyChips(keys, false, true, true).map((chip) => chip.key)).toContain("⌥I");
    expect(keyChips(keys, true, true).map((chip) => chip.command)).not.toContain("inspect");
  });
});
