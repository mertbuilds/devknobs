import type { UaValue } from "../types";

/** A brand of the UA client hints, with its version. */
export interface UaBrand {
  brand: string;
  version: string;
}

/** What `getHighEntropyValues` adds to the brands, `mobile` and `platform`. */
export interface UaHints {
  platformVersion: string;
  model: string;
  architecture: string;
  bitness: string;
  /** The brands again, each with its full version. */
  fullVersionList: readonly UaBrand[];
  uaFullVersion: string;
}

export interface UaPreset {
  id: string;
  label: string;
  userAgent: string;
  platform: string;
  vendor: string;
  mobile: boolean;
  /** The UA client hint brands, major versions only. Empty where the browser has no `userAgentData`. */
  brands: readonly UaBrand[];
  /** The UA client hint platform, such as `Android` or `macOS`. */
  uaPlatform: string;
  maxTouchPoints: number;
  /** `navigator.appVersion`. Left out, it is the user agent after `Mozilla/`. */
  appVersion?: string;
  /** Left out where there is no `userAgentData` to ask. */
  hints?: UaHints;
}

/** Chrome stable as of October 2026. Its user agent says the major version alone. */
const CHROME = "154.0.8037.98";
const EDGE = "154.0.4258.53";
const SAFARI = "27.0";
const FIREFOX = "157.0";

/** The made up brand Chromium lists among the real ones, so no site can match the list whole. */
const GREASE: UaBrand = { brand: "Not/A)Brand", version: "24.0.0.0" };

const APPLE = "Apple Computer, Inc.";
const GOOGLE = "Google Inc.";

function major(version: string): string {
  return version.split(".")[0] ?? version;
}

function chromeAgent(system: string, mobile = false): string {
  const browser = `Chrome/${major(CHROME)}.0.0.0 ${mobile ? "Mobile " : ""}Safari/537.36`;
  return `Mozilla/5.0 (${system}) AppleWebKit/537.36 (KHTML, like Gecko) ${browser}`;
}

/** Brands and hints of a Chromium browser: Chromium, the made up brand, then its own if it has one. */
function chromium(
  own: UaBrand | null,
  hints: Pick<UaHints, "platformVersion" | "model" | "architecture" | "bitness">,
): Pick<UaPreset, "brands" | "hints"> {
  const full = [{ brand: "Chromium", version: CHROME }, GREASE, ...(own ? [own] : [])];
  return {
    brands: full.map(({ brand, version }) => ({ brand, version: major(version) })),
    hints: { ...hints, fullVersionList: full, uaFullVersion: own?.version ?? CHROME },
  };
}

const CHROME_BRAND: UaBrand = { brand: "Google Chrome", version: CHROME };
const DESKTOP = { model: "", bitness: "64" };
const WINDOWS = { ...DESKTOP, platformVersion: "19.0.0", architecture: "x86" };
const MAC_SAFARI = `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${SAFARI} Safari/605.1.15`;

export const UA_PRESETS: readonly UaPreset[] = [
  {
    id: "iphone-safari",
    label: "iPhone Safari",
    // Safari has frozen the system version at 18.6 since 26.
    userAgent: `Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${SAFARI} Mobile/15E148 Safari/604.1`,
    platform: "iPhone",
    vendor: APPLE,
    mobile: true,
    brands: [],
    uaPlatform: "iOS",
    maxTouchPoints: 5,
  },
  {
    id: "android-chrome",
    label: "Android Chrome",
    userAgent: chromeAgent("Linux; Android 10; K", true),
    platform: "Linux armv81",
    vendor: GOOGLE,
    mobile: true,
    uaPlatform: "Android",
    maxTouchPoints: 5,
    ...chromium(CHROME_BRAND, {
      platformVersion: "16.0.0",
      model: "Pixel 10",
      architecture: "",
      bitness: "",
    }),
  },
  {
    id: "ipad-safari",
    label: "iPad Safari",
    // iPadOS asks for desktop sites, so only the touch points tell it from a Mac.
    userAgent: MAC_SAFARI,
    platform: "MacIntel",
    vendor: APPLE,
    mobile: false,
    brands: [],
    uaPlatform: "iOS",
    maxTouchPoints: 5,
  },
  {
    id: "mac-safari",
    label: "Mac Safari",
    userAgent: MAC_SAFARI,
    platform: "MacIntel",
    vendor: APPLE,
    mobile: false,
    brands: [],
    uaPlatform: "macOS",
    maxTouchPoints: 0,
  },
  {
    id: "mac-chrome",
    label: "Mac Chrome",
    userAgent: chromeAgent("Macintosh; Intel Mac OS X 10_15_7"),
    platform: "MacIntel",
    vendor: GOOGLE,
    mobile: false,
    uaPlatform: "macOS",
    maxTouchPoints: 0,
    ...chromium(CHROME_BRAND, { ...DESKTOP, platformVersion: "26.7.1", architecture: "arm" }),
  },
  {
    id: "windows-chrome",
    label: "Windows Chrome",
    userAgent: chromeAgent("Windows NT 10.0; Win64; x64"),
    platform: "Win32",
    vendor: GOOGLE,
    mobile: false,
    uaPlatform: "Windows",
    maxTouchPoints: 0,
    ...chromium(CHROME_BRAND, WINDOWS),
  },
  {
    id: "windows-edge",
    label: "Windows Edge",
    userAgent: `${chromeAgent("Windows NT 10.0; Win64; x64")} Edg/${EDGE}`,
    platform: "Win32",
    vendor: GOOGLE,
    mobile: false,
    uaPlatform: "Windows",
    maxTouchPoints: 0,
    ...chromium({ brand: "Microsoft Edge", version: EDGE }, WINDOWS),
  },
  {
    id: "linux-firefox",
    label: "Linux Firefox",
    userAgent: `Mozilla/5.0 (X11; Linux x86_64; rv:${FIREFOX}) Gecko/20100101 Firefox/${FIREFOX}`,
    platform: "Linux x86_64",
    vendor: "",
    mobile: false,
    brands: [],
    uaPlatform: "Linux",
    maxTouchPoints: 0,
    appVersion: "5.0 (X11)",
  },
  {
    id: "googlebot",
    label: "Googlebot",
    // The smartphone crawler, which indexes for mobile first, on evergreen Chromium.
    userAgent: `Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME} Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)`,
    platform: "Linux armv81",
    vendor: GOOGLE,
    mobile: true,
    uaPlatform: "Android",
    maxTouchPoints: 1,
    ...chromium(null, {
      platformVersion: "6.0.1",
      model: "Nexus 5X",
      architecture: "",
      bitness: "",
    }),
  },
];

export function uaPreset(id: string): UaPreset | undefined {
  return UA_PRESETS.find((preset) => preset.id === id);
}

/** The user agent the knob sets, or an empty string while it leaves the browser's own. */
export function userAgentOf(value: UaValue): string {
  if (value.preset === "custom") return value.custom.trim();
  return uaPreset(value.preset)?.userAgent ?? "";
}

/** `navigator.appVersion` for a user agent, as Chromium and Safari derive it. */
export function appVersionOf(userAgent: string): string {
  return userAgent.replace(/^Mozilla\//, "");
}

/** The navigator fields the knob reads out, all of them on `Navigator.prototype`. */
const KEYS = [
  "userAgent",
  "appVersion",
  "platform",
  "vendor",
  "maxTouchPoints",
  "userAgentData",
] as const;

type Key = (typeof KEYS)[number];

interface Shared {
  /** The browser's own descriptors, or null while nothing is patched. */
  originals: Map<Key, PropertyDescriptor | undefined> | null;
}

/**
 * The early script and the full one are two copies, and the page above a
 * frame patches the frame's window before either runs there. Whichever
 * patches first keeps the browser's own descriptors on that window, so no
 * other copy takes a patch for the real thing, and any can put the real ones
 * back.
 */
const SHARED = Symbol.for("devknobs.ua");

function isShared(value: unknown): value is Shared {
  return typeof value === "object" && value !== null && "originals" in value;
}

function sharedOf(scope: object): Shared {
  const had: unknown = Reflect.get(scope, SHARED);
  if (isShared(had)) return had;
  const shared: Shared = { originals: null };
  Reflect.set(scope, SHARED, shared);
  return shared;
}

function prototypeOf(scope: object): object | null {
  const navigator: unknown = Reflect.get(scope, "Navigator");
  return typeof navigator === "function" ? (navigator.prototype as object) : null;
}

function put(target: object, key: Key, value: unknown): void {
  Object.defineProperty(target, key, { configurable: true, enumerable: true, get: () => value });
}

function restore(shared: Shared, target: object, key: Key): void {
  const descriptor = shared.originals?.get(key);
  if (descriptor) Object.defineProperty(target, key, descriptor);
  else Reflect.deleteProperty(target, key);
}

function copy(brands: readonly UaBrand[]): UaBrand[] {
  return brands.map(({ brand, version }) => ({ brand, version }));
}

type UaSource = Pick<UaPreset, "brands" | "mobile" | "uaPlatform" | "hints">;

/** What a Chromium browser reports for a user agent it was handed without hints. */
const NO_HINTS: UaSource = { brands: [], mobile: false, uaPlatform: "" };

/**
 * A stand-in for `navigator.userAgentData`, on the browser's own prototype
 * where it has one. Every value comes from the one source, the high entropy
 * ones included.
 */
function uaData(source: UaSource, scope: object): object {
  const brands = Object.freeze(source.brands.map((brand) => Object.freeze({ ...brand })));
  const low = () => ({ brands: copy(brands), mobile: source.mobile, platform: source.uaPlatform });
  const hints = source.hints;
  const high = (): Record<string, unknown> => ({
    architecture: hints?.architecture ?? "",
    bitness: hints?.bitness ?? "",
    fullVersionList: copy(hints?.fullVersionList ?? []),
    model: hints?.model ?? "",
    platformVersion: hints?.platformVersion ?? "",
    uaFullVersion: hints?.uaFullVersion ?? "",
  });
  const native: unknown = Reflect.get(scope, "NavigatorUAData");
  const proto = typeof native === "function" ? (native.prototype as object) : Object.prototype;
  return Object.create(proto, {
    brands: { enumerable: true, get: () => brands },
    mobile: { enumerable: true, get: () => source.mobile },
    platform: { enumerable: true, get: () => source.uaPlatform },
    getHighEntropyValues: {
      value: (asked: Iterable<string>): Promise<Record<string, unknown>> => {
        try {
          const values: Record<string, unknown> = low();
          const all = high();
          for (const hint of Array.from(asked, String)) {
            if (Object.hasOwn(all, hint)) values[hint] = all[hint];
          }
          return Promise.resolve(values);
        } catch (error) {
          return Promise.reject(error);
        }
      },
    },
    toJSON: { value: low },
  });
}

/**
 * Put a browser's user agent on `navigator`: the string, `appVersion`,
 * `platform`, `vendor`, `maxTouchPoints` and `userAgentData`, all of them
 * from the same browser. Safari and Firefox have no `userAgentData`, so their
 * presets take it away. A custom string sets the string alone, as Chrome
 * DevTools does: the rest stays the browser's own, and a `userAgentData` the
 * browser has reports no brands. `scope` is the window to patch, another one
 * on this origin too.
 */
export function apply(value: UaValue, scope: object = globalThis): void {
  const target = prototypeOf(scope);
  const preset = value.preset === "custom" ? undefined : uaPreset(value.preset);
  const userAgent = userAgentOf(value);
  if (!target || userAgent === "") {
    reset(scope);
    return;
  }
  const shared = sharedOf(scope);
  shared.originals ??= new Map(
    KEYS.map((key) => [key, Object.getOwnPropertyDescriptor(target, key)]),
  );
  put(target, "userAgent", userAgent);
  put(target, "appVersion", preset?.appVersion ?? appVersionOf(userAgent));
  if (!preset) {
    for (const key of ["platform", "vendor", "maxTouchPoints"] as const) {
      restore(shared, target, key);
    }
    if (shared.originals.get("userAgentData")) {
      put(target, "userAgentData", uaData(NO_HINTS, scope));
    } else restore(shared, target, "userAgentData");
    return;
  }
  put(target, "platform", preset.platform);
  put(target, "vendor", preset.vendor);
  put(target, "maxTouchPoints", preset.maxTouchPoints);
  if (preset.brands.length > 0) put(target, "userAgentData", uaData(preset, scope));
  else Reflect.deleteProperty(target, "userAgentData");
}

/** The browser's own `navigator.platform`, whatever preset is on. */
export function realPlatform(): string {
  const getter = sharedOf(globalThis).originals?.get("platform")?.get;
  try {
    return String(getter ? getter.call(navigator) : navigator.platform);
  } catch {
    return "";
  }
}

/** Whether the browser runs on an Apple platform, where shortcuts read `⌘` and `⇧`. */
export function isMac(): boolean {
  return /mac|iphone|ipad|ipod/i.test(realPlatform());
}

/** Hand every field back to the browser. */
export function reset(scope: object = globalThis): void {
  const shared = sharedOf(scope);
  const target = prototypeOf(scope);
  if (!shared.originals) return;
  if (target) for (const key of KEYS) restore(shared, target, key);
  shared.originals = null;
}
