import { describe, expect, test } from "bun:test";
import { identityOf, patchedAs, patchWindow, stale } from "../src/engine/identity";
import { DEFAULT_STATE, merge } from "../src/engine/store";
import { reset, uaPreset } from "../src/engine/ua";
import type { DevknobsStatePatch } from "../src/types";

const REAL_AGENT = "Mozilla/5.0 (Macintosh) Chrome/1.0.0.0 Safari/537.36";

function state(patch: DevknobsStatePatch) {
  return merge(DEFAULT_STATE, patch);
}

/** A frame's fresh window, from another realm: its own navigator and `matchMedia`. */
function freshWindow() {
  class Navigator {
    get userAgent(): string {
      return REAL_AGENT;
    }
    get maxTouchPoints(): number {
      return 0;
    }
  }
  const view = {
    Navigator,
    navigator: new Navigator(),
    matchMedia: (query: string) => ({ media: query }),
  };
  return view as typeof view & Window;
}

describe("identityOf", () => {
  test("a phone of another platform is another identity, one of the same is not", () => {
    const iphone = identityOf(state({ device: "iphone-16-pro" }));
    expect(iphone).toEqual({ agent: "iphone-safari", touch: true, dpr: 3 });
    expect(stale(iphone, identityOf(state({ device: "pixel-9" })))).toBe(true);
    expect(stale(iphone, identityOf(state({ device: "iphone-16" })))).toBe(false);
  });

  test("the size, the way it is held, the zoom and the rest leave it alone", () => {
    const phone = state({ device: "iphone-16-pro" });
    const turned = merge(phone, {
      orientation: "landscape",
      zoom: 0.5,
      mock: false,
      bars: "minimized",
      touchPointer: false,
      scheme: "dark",
    });
    expect(stale(identityOf(phone), identityOf(turned))).toBe(false);
  });

  test("the user agent, the touch screen and the ratio each make a new one", () => {
    const phone = state({ device: "iphone-16-pro" });
    const loaded = identityOf(phone);
    expect(stale(loaded, identityOf(merge(phone, { ua: { preset: "android-chrome" } })))).toBe(
      true,
    );
    expect(stale(loaded, identityOf(merge(phone, { dpr: 2 })))).toBe(true);
    expect(stale(loaded, identityOf({ ...phone, device: "laptop" }))).toBe(true);
  });

  test("a custom string is the string, and system or an empty one the browser's own", () => {
    expect(identityOf(state({ ua: { preset: "custom", custom: " curl/8.7.1 " } })).agent).toBe(
      "curl/8.7.1",
    );
    expect(identityOf(state({})).agent).toBe("");
    expect(identityOf(state({ ua: { preset: "custom", custom: "" } })).agent).toBe("");
  });

  test("no page loaded yet is never stale", () => {
    expect(stale(null, identityOf(state({ device: "pixel-9" })))).toBe(false);
  });
});

describe("patchWindow", () => {
  test("puts the device on another window before its scripts, and leaves this one alone", () => {
    const own = navigator.userAgent;
    const view = freshWindow();
    const phone = state({ device: "pixel-9" });
    expect(patchWindow(view, phone)).toEqual(identityOf(phone));
    expect(view.navigator.userAgent).toBe(uaPreset("android-chrome")?.userAgent ?? "");
    expect(view.navigator.maxTouchPoints).toBe(5);
    expect("ontouchstart" in view).toBe(true);
    expect(view.matchMedia("(pointer: coarse)").media).toBe("(min-width: 0px)");
    expect(view.matchMedia("(hover: hover)").media).toBe("not all");
    expect(navigator.userAgent).toBe(own);
  });

  test("a window patched already keeps what it has", () => {
    const view = freshWindow();
    patchWindow(view, state({ device: "iphone-16-pro" }));
    const matchMedia = view.matchMedia;
    expect(patchWindow(view, state({ device: "laptop" }))).toEqual(
      identityOf(state({ device: "iphone-16-pro" })),
    );
    expect(view.matchMedia).toBe(matchMedia);
    expect(view.navigator.userAgent).toContain("iPhone");
    expect(patchedAs(view)?.agent).toBe("iphone-safari");
  });

  test("the copy in that window finds the browser's own fields to put back", () => {
    const view = freshWindow();
    patchWindow(view, state({ device: "iphone-16-pro" }));
    reset(view);
    expect(view.navigator.userAgent).toBe(REAL_AGENT);
    expect(view.navigator.maxTouchPoints).toBe(0);
  });

  test("a device without a touch screen gets none", () => {
    const view = freshWindow();
    patchWindow(view, state({ device: "laptop" }));
    expect(view.navigator.userAgent).toContain("Windows");
    expect("ontouchstart" in view).toBe(false);
    expect(view.matchMedia("(pointer: coarse)").media).toBe("(pointer: coarse)");
  });
});
