import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { appVersionOf, apply, reset, UA_PRESETS, uaPreset, userAgentOf } from "../src/engine/ua";
import type { UaValue } from "../src/types";

const REAL_AGENT = "Mozilla/5.0 (Macintosh) Chrome/1.0.0.0 Safari/537.36";

/** The browser's own data, a Chromium one as the stub navigator reports it. */
const REAL_DATA = { brands: [{ brand: "Real", version: "1" }], mobile: false, platform: "macOS" };

/** A navigator with its readings on the prototype, as every browser has them. */
function stubNavigator(withData: boolean): void {
  class Navigator {
    get userAgent(): string {
      return REAL_AGENT;
    }
    get appVersion(): string {
      return "5.0 (Macintosh)";
    }
    get platform(): string {
      return "MacIntel";
    }
    get vendor(): string {
      return "Google Inc.";
    }
    get maxTouchPoints(): number {
      return 0;
    }
  }
  if (withData) {
    Object.defineProperty(Navigator.prototype, "userAgentData", {
      configurable: true,
      enumerable: true,
      get: () => REAL_DATA,
    });
  }
  Object.defineProperty(globalThis, "Navigator", { configurable: true, value: Navigator });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: new Navigator() });
}

const realNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
const KEYS = ["userAgent", "appVersion", "platform", "vendor", "maxTouchPoints", "userAgentData"];

/** The prototype's own descriptors for every field the knob touches. */
function descriptors(): (PropertyDescriptor | undefined)[] {
  return KEYS.map((key) => Object.getOwnPropertyDescriptor(Navigator.prototype, key));
}

/** What a page reads off `navigator`. */
function read(): Record<string, unknown> {
  return Object.fromEntries(KEYS.map((key) => [key, Reflect.get(navigator, key)]));
}

interface UaData {
  brands: { brand: string; version: string }[];
  mobile: boolean;
  platform: string;
  getHighEntropyValues(hints: unknown): Promise<Record<string, unknown>>;
  toJSON(): unknown;
}

function uaData(): UaData {
  return Reflect.get(navigator, "userAgentData") as UaData;
}

function preset(id: string): UaValue {
  return { preset: id, custom: "" };
}

beforeEach(() => stubNavigator(true));

afterEach(() => {
  reset();
  Reflect.deleteProperty(globalThis, "Navigator");
  if (realNavigator) Object.defineProperty(globalThis, "navigator", realNavigator);
});

test("presets", () => {
  expect(UA_PRESETS.map((entry) => entry.id)).toEqual([
    "iphone-safari",
    "android-chrome",
    "ipad-safari",
    "mac-safari",
    "mac-chrome",
    "windows-chrome",
    "windows-edge",
    "linux-firefox",
    "googlebot",
  ]);
});

describe("apply", () => {
  test("puts every field of the preset on navigator", () => {
    apply(preset("iphone-safari"));
    const iphone = uaPreset("iphone-safari");
    expect(navigator.userAgent).toBe(iphone?.userAgent ?? "");
    expect(navigator.userAgent).toContain("iPhone");
    expect(navigator.appVersion).toBe(appVersionOf(navigator.userAgent));
    expect(read().platform).toBe("iPhone");
    expect(navigator.vendor).toBe("Apple Computer, Inc.");
    expect(navigator.maxTouchPoints).toBe(5);
  });

  test("reset puts the browser's own descriptors back", () => {
    const before = descriptors();
    apply(preset("android-chrome"));
    apply(preset("linux-firefox"));
    reset();
    expect(descriptors()).toEqual(before);
    expect(read()).toEqual({
      userAgent: REAL_AGENT,
      appVersion: "5.0 (Macintosh)",
      platform: "MacIntel",
      vendor: "Google Inc.",
      maxTouchPoints: 0,
      userAgentData: REAL_DATA,
    });
  });

  test("system is the browser's own, and so is an id it does not know", () => {
    const before = descriptors();
    apply(preset("googlebot"));
    apply(preset("system"));
    expect(descriptors()).toEqual(before);
    apply(preset("netscape"));
    expect(descriptors()).toEqual(before);
  });

  test("leaves the field off a browser that never had it", () => {
    reset();
    stubNavigator(false);
    apply(preset("windows-chrome"));
    expect(uaData().platform).toBe("Windows");
    reset();
    expect("userAgentData" in navigator).toBe(false);
  });

  test("firefox has its own app version and no vendor", () => {
    apply(preset("linux-firefox"));
    expect(navigator.appVersion).toBe("5.0 (X11)");
    expect(navigator.vendor).toBe("");
    expect(read().platform).toBe("Linux x86_64");
  });

  test("the ipad asks for desktop sites, and only its touch points give it away", () => {
    apply(preset("ipad-safari"));
    expect(navigator.userAgent).toBe(uaPreset("mac-safari")?.userAgent ?? "");
    expect(read().platform).toBe("MacIntel");
    expect(navigator.maxTouchPoints).toBe(5);
  });
});

describe("userAgentData", () => {
  test("only chromium browsers have it, as in the real ones", () => {
    for (const entry of UA_PRESETS) {
      apply(preset(entry.id));
      const chromium = !/^(iphone-safari|ipad-safari|mac-safari|linux-firefox)$/.test(entry.id);
      expect("userAgentData" in navigator).toBe(chromium);
      expect(entry.brands.length > 0).toBe(chromium);
    }
  });

  test("brands, mobile and platform come from the preset", () => {
    apply(preset("android-chrome"));
    const data = uaData();
    expect(data.brands.map((entry) => entry.brand)).toEqual([
      "Chromium",
      "Not/A)Brand",
      "Google Chrome",
    ]);
    expect(data.mobile).toBe(true);
    expect(data.platform).toBe("Android");
    expect(Object.isFrozen(data.brands)).toBe(true);
    expect(uaData()).toBe(data);
    expect(JSON.parse(JSON.stringify(data))).toEqual({
      brands: data.brands,
      mobile: true,
      platform: "Android",
    });
  });

  test("brand versions match the user agent's", () => {
    for (const entry of UA_PRESETS.filter((candidate) => candidate.brands.length > 0)) {
      const chrome = /Chrome\/(\d+)/.exec(entry.userAgent)?.[1];
      const chromium = entry.brands.find((brand) => brand.brand === "Chromium");
      expect(chromium?.version).toBe(chrome ?? "");
      const edge = /Edg\/([\d.]+)/.exec(entry.userAgent)?.[1];
      if (edge) expect(entry.hints?.uaFullVersion).toBe(edge);
    }
  });

  test("getHighEntropyValues answers what was asked, from the same browser", async () => {
    apply(preset("windows-edge"));
    const values = await uaData().getHighEntropyValues([
      "architecture",
      "bitness",
      "fullVersionList",
      "model",
      "platformVersion",
      "uaFullVersion",
      "nonsense",
    ]);
    expect(values).toEqual({
      brands: [
        { brand: "Chromium", version: "154" },
        { brand: "Not/A)Brand", version: "24" },
        { brand: "Microsoft Edge", version: "154" },
      ],
      mobile: false,
      platform: "Windows",
      architecture: "x86",
      bitness: "64",
      fullVersionList: [
        { brand: "Chromium", version: "154.0.8037.98" },
        { brand: "Not/A)Brand", version: "24.0.0.0" },
        { brand: "Microsoft Edge", version: "154.0.4258.53" },
      ],
      model: "",
      platformVersion: "19.0.0",
      uaFullVersion: "154.0.4258.53",
    });
  });

  test("getHighEntropyValues always has the low entropy values, and full versions match", async () => {
    apply(preset("googlebot"));
    const data = uaData();
    expect(await data.getHighEntropyValues([])).toEqual({
      brands: data.brands,
      mobile: true,
      platform: "Android",
    });
    const { fullVersionList, model } = await data.getHighEntropyValues(["fullVersionList", "model"]);
    expect(model).toBe("Nexus 5X");
    const majors = (fullVersionList as { brand: string; version: string }[]).map(
      ({ brand, version }) => ({ brand, version: version.split(".")[0] }),
    );
    expect(majors).toEqual(data.brands);
  });

  test("getHighEntropyValues rejects hints that are not a list", async () => {
    apply(preset("mac-chrome"));
    await expect(uaData().getHighEntropyValues(undefined)).rejects.toThrow(TypeError);
  });
});

describe("custom", () => {
  const CURL = "curl/8.7.1";

  test("sets the string alone, as devtools does, with no brands", async () => {
    apply({ preset: "custom", custom: ` ${CURL} ` });
    expect(navigator.userAgent).toBe(CURL);
    expect(navigator.appVersion).toBe(CURL);
    expect(read().platform).toBe("MacIntel");
    expect(navigator.maxTouchPoints).toBe(0);
    expect(uaData().brands).toEqual([]);
    expect(await uaData().getHighEntropyValues(["model", "uaFullVersion"])).toEqual({
      brands: [],
      mobile: false,
      platform: "",
      model: "",
      uaFullVersion: "",
    });
  });

  test("puts back what a preset changed", () => {
    apply(preset("iphone-safari"));
    apply({ preset: "custom", custom: uaPreset("iphone-safari")?.userAgent ?? "" });
    expect(read().platform).toBe("MacIntel");
    expect(navigator.vendor).toBe("Google Inc.");
    expect("userAgentData" in navigator).toBe(true);
  });

  test("gives no data to a browser without it", () => {
    reset();
    stubNavigator(false);
    apply(preset("android-chrome"));
    apply({ preset: "custom", custom: CURL });
    expect("userAgentData" in navigator).toBe(false);
  });

  test("an empty string is the browser's own", () => {
    const before = descriptors();
    apply({ preset: "custom", custom: "  " });
    expect(descriptors()).toEqual(before);
  });
});

describe("userAgentOf", () => {
  test("is the preset's string, the custom one, or empty for the browser's own", () => {
    expect(userAgentOf(preset("googlebot"))).toContain("Googlebot/2.1");
    expect(userAgentOf({ preset: "custom", custom: "curl/8.7.1\n" })).toBe("curl/8.7.1");
    expect(userAgentOf({ preset: "system", custom: "curl/8.7.1" })).toBe("");
  });
});
