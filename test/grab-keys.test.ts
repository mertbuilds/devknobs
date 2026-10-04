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
  test("defaults to meta and c on a Mac, ctrl and c elsewhere", () => {
    expect(parseGrabKey(undefined, true)).toEqual(defaultGrabKey(true));
    expect(parseGrabKey("", false)).toEqual({
      meta: false,
      ctrl: true,
      shift: false,
      alt: false,
      key: "c",
    });
  });

  test("reads modifiers by any of their names, and one key", () => {
    expect(parseGrabKey("alt+shift+g", true)).toEqual({
      meta: false,
      ctrl: false,
      shift: true,
      alt: true,
      key: "g",
    });
    expect(parseGrabKey("Cmd + Option + K", false)).toEqual({
      meta: true,
      ctrl: false,
      shift: false,
      alt: true,
      key: "k",
    });
  });

  test("falls back to the default for no key, or two", () => {
    expect(parseGrabKey("alt+shift", true)).toEqual(defaultGrabKey(true));
    expect(parseGrabKey("a+b", false)).toEqual(defaultGrabKey(false));
  });
});

describe("isGrabKey", () => {
  const mac = defaultGrabKey(true);

  test("takes the c key with only the platform modifier", () => {
    expect(isGrabKey(key({ metaKey: true }), mac)).toBe(true);
    expect(isGrabKey(key({ metaKey: true, shiftKey: true }), mac)).toBe(false);
    expect(isGrabKey(key({ ctrlKey: true }), mac)).toBe(false);
    expect(isGrabKey(key({}), mac)).toBe(false);
    expect(isGrabKey(key({ ctrlKey: true }), defaultGrabKey(false))).toBe(true);
  });

  test("takes a c on any layout", () => {
    expect(isGrabKey(key({ metaKey: true, key: "с", code: "KeyS" }), mac)).toBe(true);
    expect(isGrabKey(key({ metaKey: true, key: "j", code: "KeyC" }), mac)).toBe(true);
    expect(isCLike("ç")).toBe(true);
    expect(isCLike("x", "KeyX")).toBe(false);
  });

  test("matches a custom key by what it types or where it sits", () => {
    const custom = parseGrabKey("alt+shift+g", true);
    const press = { altKey: true, shiftKey: true };
    expect(isGrabKey(key({ ...press, key: "G", code: "KeyG" }), custom)).toBe(true);
    // Option types a symbol on a Mac, and the code still says g.
    expect(isGrabKey(key({ ...press, key: "˝", code: "KeyG" }), custom)).toBe(true);
    expect(isGrabKey(key({ altKey: true, key: "g", code: "KeyG" }), custom)).toBe(false);
  });
});

describe("releasesGrabKey", () => {
  test("lets go with the key or one of its modifiers", () => {
    const mac = defaultGrabKey(true);
    expect(releasesGrabKey(key({}), mac)).toBe(true);
    expect(releasesGrabKey(key({ key: "Meta", code: "MetaLeft" }), mac)).toBe(true);
    expect(releasesGrabKey(key({ key: "Control", code: "ControlLeft" }), mac)).toBe(false);
    expect(releasesGrabKey(key({ key: "x", code: "KeyX" }), mac)).toBe(false);
  });
});

describe("grabKeyLabel", () => {
  test("reads as the platform writes shortcuts", () => {
    expect(grabKeyLabel(defaultGrabKey(true), true)).toBe("⌘C");
    expect(grabKeyLabel(defaultGrabKey(false), false)).toBe("ctrl+C");
    expect(grabKeyLabel(parseGrabKey("alt+shift+g", true), true)).toBe("⌥⇧G");
    expect(grabKeyLabel(parseGrabKey("alt+shift+g", false), false)).toBe("alt+shift+G");
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
