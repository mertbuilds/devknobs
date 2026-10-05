import { describe, expect, test } from "bun:test";
import {
  defaultGrabKey,
  type GrabKeyLike,
  grabKeyLabel,
  HOLD,
  HOLD_AFTER_COPY,
  HOLD_INPUT,
  HOLD_SELECTION,
  type Hold,
  holdDuration,
  holdStep,
  isCLike,
  isGrabKey,
  keyMatches,
  parseGrabKey,
  releasesGrabKey,
} from "../src/grab/keys";

function key(patch: Partial<GrabKeyLike>): GrabKeyLike {
  return {
    key: "c",
    code: "KeyC",
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    ...patch,
  };
}

describe("parseGrabKey", () => {
  test("defaults to shift and g", () => {
    expect(parseGrabKey(undefined)).toEqual(defaultGrabKey());
    expect(parseGrabKey("")).toEqual({
      meta: false,
      ctrl: false,
      shift: true,
      alt: false,
      key: "g",
    });
  });

  test("reads shift and a letter, as the default is", () => {
    expect(parseGrabKey("shift+g")).toEqual(defaultGrabKey());
    expect(parseGrabKey("Shift+K")).toEqual({
      meta: false,
      ctrl: false,
      shift: true,
      alt: false,
      key: "k",
    });
  });

  test("reads modifiers by any of their names, and one key", () => {
    expect(parseGrabKey("alt+shift+g")).toEqual({
      meta: false,
      ctrl: false,
      shift: true,
      alt: true,
      key: "g",
    });
    expect(parseGrabKey("Cmd + Option + K")).toEqual({
      meta: true,
      ctrl: false,
      shift: false,
      alt: true,
      key: "k",
    });
  });

  test("falls back to the default for no key, or two", () => {
    expect(parseGrabKey("alt+shift")).toEqual(defaultGrabKey());
    expect(parseGrabKey("a+b")).toEqual(defaultGrabKey());
  });
});

describe("isGrabKey", () => {
  const mac = parseGrabKey("meta+c");

  test("takes shift and g by default, in either case for caps lock", () => {
    const shiftG = { shiftKey: true, key: "G", code: "KeyG" };
    expect(isGrabKey(key(shiftG), defaultGrabKey())).toBe(true);
    expect(isGrabKey(key({ ...shiftG, key: "g" }), defaultGrabKey())).toBe(true);
    // A layout that is not latin, with g's place still the key.
    expect(isGrabKey(key({ ...shiftG, key: "П" }), defaultGrabKey())).toBe(true);
  });

  test("leaves a key that types another latin letter in g's place, or an IME's", () => {
    const shiftG = { shiftKey: true, code: "KeyG" };
    // Colemak types d there, Dvorak i and Turkish F ü.
    for (const typed of ["D", "I", "Ü", "Process", "Dead"]) {
      expect(isGrabKey(key({ ...shiftG, key: typed }), defaultGrabKey())).toBe(false);
    }
    expect(isGrabKey(key({ ...shiftG, key: "G", isComposing: true }), defaultGrabKey())).toBe(false);
  });

  test("leaves g alone without shift, or with another modifier", () => {
    const g = { key: "g", code: "KeyG" };
    expect(isGrabKey(key(g), defaultGrabKey())).toBe(false);
    for (const modifier of ["altKey", "ctrlKey", "metaKey"] as const) {
      const press = key({ ...g, key: "G", shiftKey: true, [modifier]: true });
      expect(isGrabKey(press, defaultGrabKey())).toBe(false);
    }
  });

  test("takes a custom c key with only its own modifier", () => {
    expect(isGrabKey(key({ metaKey: true }), mac)).toBe(true);
    expect(isGrabKey(key({ metaKey: true, shiftKey: true }), mac)).toBe(false);
    expect(isGrabKey(key({ ctrlKey: true }), mac)).toBe(false);
    expect(isGrabKey(key({}), mac)).toBe(false);
    expect(isGrabKey(key({ ctrlKey: true }), parseGrabKey("ctrl+c"))).toBe(true);
  });

  test("takes a c on any layout", () => {
    expect(isGrabKey(key({ metaKey: true, key: "с", code: "KeyS" }), mac)).toBe(true);
    expect(isGrabKey(key({ metaKey: true, key: "j", code: "KeyC" }), mac)).toBe(true);
    expect(isCLike("ç")).toBe(true);
    expect(isCLike("x", "KeyX")).toBe(false);
  });

  test("matches a custom key by what it types or where it sits", () => {
    const custom = parseGrabKey("alt+shift+g");
    const press = { altKey: true, shiftKey: true };
    expect(isGrabKey(key({ ...press, key: "G", code: "KeyG" }), custom)).toBe(true);
    // Option types a symbol on a Mac, and the code still says g.
    expect(isGrabKey(key({ ...press, key: "˝", code: "KeyG" }), custom)).toBe(true);
    expect(isGrabKey(key({ altKey: true, key: "g", code: "KeyG" }), custom)).toBe(false);
    // Option types a latin letter in s's place.
    const altS = key({ altKey: true, key: "ß", code: "KeyS" });
    expect(isGrabKey(altS, parseGrabKey("alt+s"))).toBe(true);
  });
});

describe("keyMatches", () => {
  test("takes the key whatever modifiers are down", () => {
    expect(keyMatches(key({ key: "g", code: "KeyG" }), "g")).toBe(true);
    expect(keyMatches(key({ key: "G", code: "KeyG", shiftKey: true }), "g")).toBe(true);
    expect(keyMatches(key({ key: "h", code: "KeyH" }), "g")).toBe(false);
    expect(keyMatches(key({ key: "с", code: "KeyS", metaKey: true }), "c")).toBe(true);
  });
});

describe("releasesGrabKey", () => {
  test("lets go of shift and g with either, whatever the case", () => {
    const grab = defaultGrabKey();
    expect(releasesGrabKey(key({ key: "g", code: "KeyG" }), grab)).toBe(true);
    expect(releasesGrabKey(key({ key: "G", code: "KeyG" }), grab)).toBe(true);
    expect(releasesGrabKey(key({ key: "Shift", code: "ShiftLeft" }), grab)).toBe(true);
    expect(releasesGrabKey(key({ key: "Meta", code: "MetaLeft" }), grab)).toBe(false);
  });

  test("lets go with the key or one of its modifiers", () => {
    const mac = parseGrabKey("meta+c");
    expect(releasesGrabKey(key({}), mac)).toBe(true);
    expect(releasesGrabKey(key({ key: "Meta", code: "MetaLeft" }), mac)).toBe(true);
    expect(releasesGrabKey(key({ key: "Control", code: "ControlLeft" }), mac)).toBe(false);
    expect(releasesGrabKey(key({ key: "x", code: "KeyX" }), mac)).toBe(false);
  });
});

describe("grabKeyLabel", () => {
  test("reads as the platform writes shortcuts", () => {
    expect(grabKeyLabel(defaultGrabKey(), true)).toBe("⇧G");
    expect(grabKeyLabel(defaultGrabKey(), false)).toBe("shift+G");
    expect(grabKeyLabel(parseGrabKey("meta+c"), true)).toBe("⌘C");
    expect(grabKeyLabel(parseGrabKey("ctrl+c"), false)).toBe("ctrl+C");
    expect(grabKeyLabel(parseGrabKey("alt+shift+g"), true)).toBe("⌥⇧G");
    expect(grabKeyLabel(parseGrabKey("alt+shift+g"), false)).toBe("alt+shift+G");
  });
});

describe("holdDuration", () => {
  test("waits longer where the key is likely a copy", () => {
    expect(holdDuration({ input: false, selection: false })).toBe(HOLD);
    expect(holdDuration({ input: true, selection: false })).toBe(HOLD + HOLD_INPUT);
    expect(holdDuration({ input: false, selection: true })).toBe(HOLD + HOLD_SELECTION);
    expect(holdDuration({ input: true, selection: true })).toBe(HOLD + HOLD_SELECTION);
  });
});

describe("holdStep", () => {
  const down = { type: "down", at: 1000, duration: HOLD } as const;

  function held(patch: Partial<Hold> = {}): Hold {
    return { start: 1000, duration: HOLD, copied: false, due: false, ...patch };
  }

  test("turns grab on once the hold lasts", () => {
    const started = holdStep(null, down);
    expect(started).toEqual({ hold: held(), activate: false });
    expect(holdStep(started.hold, { type: "timer" })).toEqual({ hold: null, activate: true });
  });

  test("a quick press is a copy and nothing more", () => {
    const started = holdStep(null, down).hold;
    expect(holdStep(started, { type: "release", at: 1050 })).toEqual({
      hold: null,
      activate: false,
    });
  });

  test("a press that copied waits for the key to repeat", () => {
    let hold = holdStep(holdStep(null, down).hold, { type: "copy" }).hold;
    expect(hold).toEqual(held({ copied: true }));
    hold = holdStep(hold, { type: "timer" }).hold;
    expect(hold).toEqual(held({ copied: true, due: true }));
    expect(holdStep(hold, { type: "repeat" })).toEqual({ hold: null, activate: true });
  });

  test("a press that copied turns grab on when let go late, not early", () => {
    const due = held({ copied: true, due: true });
    expect(holdStep(due, { type: "release", at: 1000 + HOLD_AFTER_COPY }).activate).toBe(true);
    expect(holdStep(due, { type: "release", at: 1000 + HOLD_AFTER_COPY - 1 }).activate).toBe(false);
  });

  test("a repeat before the time is up waits", () => {
    expect(holdStep(held(), { type: "repeat" })).toEqual({ hold: held(), activate: false });
  });

  test("another shortcut cancels, and a second press keeps the first hold", () => {
    expect(holdStep(held(), { type: "cancel" })).toEqual({ hold: null, activate: false });
    expect(holdStep(held(), { ...down, at: 2000 }).hold).toEqual(held());
  });

  test("nothing happens without a hold", () => {
    expect(holdStep(null, { type: "timer" })).toEqual({ hold: null, activate: false });
    expect(holdStep(null, { type: "repeat" })).toEqual({ hold: null, activate: false });
  });
});
