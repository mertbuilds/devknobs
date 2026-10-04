import type { DevknobsState, DevknobsStatePatch, OrientationValue } from "../types";

export type DeviceKind = "phone" | "tablet" | "laptop" | "desktop";

export interface DevicePreset {
  id: string;
  label: string;
  /**
   * The screen in css px, the way the device is usually held: phones and
   * tablets upright, laptops and desktops across. A phone's browser chrome
   * takes some of it, which the frame does not.
   */
  width: number;
  height: number;
  dpr: number;
  /** The ua knob's preset for the device's own browser. */
  ua: string;
  touch: boolean;
  kind: DeviceKind;
  /** The way it is held when picked fresh, where that is not the way its size stands. */
  usual?: OrientationValue;
}

/**
 * Popular devices in 2026, by kind, iPhones newest first. The iPhone Duo is
 * two screens, so two devices: the cover screen of the folded phone, and the
 * inner screen of the open one, which is held across.
 */
export const DEVICES: readonly DevicePreset[] = [
  {
    id: "iphone-18-pro",
    label: "iPhone 18 Pro",
    width: 402,
    height: 874,
    dpr: 3,
    ua: "iphone-safari",
    touch: true,
    kind: "phone",
  },
  {
    id: "iphone-18-pro-max",
    label: "iPhone 18 Pro Max",
    width: 440,
    height: 956,
    dpr: 3,
    ua: "iphone-safari",
    touch: true,
    kind: "phone",
  },
  {
    id: "iphone-duo-closed",
    label: "iPhone Duo (closed)",
    width: 466,
    height: 678,
    dpr: 3,
    ua: "iphone-safari",
    touch: true,
    kind: "phone",
  },
  {
    id: "iphone-duo-open",
    label: "iPhone Duo (open)",
    width: 669,
    height: 951,
    dpr: 3,
    ua: "iphone-safari",
    touch: true,
    kind: "phone",
    usual: "landscape",
  },
  {
    id: "iphone-air",
    label: "iPhone Air",
    width: 420,
    height: 912,
    dpr: 3,
    ua: "iphone-safari",
    touch: true,
    kind: "phone",
  },
  {
    id: "iphone-17",
    label: "iPhone 17",
    width: 402,
    height: 874,
    dpr: 3,
    ua: "iphone-safari",
    touch: true,
    kind: "phone",
  },
  {
    id: "iphone-17-pro",
    label: "iPhone 17 Pro",
    width: 402,
    height: 874,
    dpr: 3,
    ua: "iphone-safari",
    touch: true,
    kind: "phone",
  },
  {
    id: "iphone-17-pro-max",
    label: "iPhone 17 Pro Max",
    width: 440,
    height: 956,
    dpr: 3,
    ua: "iphone-safari",
    touch: true,
    kind: "phone",
  },
  {
    id: "iphone-16",
    label: "iPhone 16",
    width: 393,
    height: 852,
    dpr: 3,
    ua: "iphone-safari",
    touch: true,
    kind: "phone",
  },
  {
    id: "iphone-16-plus",
    label: "iPhone 16 Plus",
    width: 430,
    height: 932,
    dpr: 3,
    ua: "iphone-safari",
    touch: true,
    kind: "phone",
  },
  {
    id: "iphone-16-pro",
    label: "iPhone 16 Pro",
    width: 402,
    height: 874,
    dpr: 3,
    ua: "iphone-safari",
    touch: true,
    kind: "phone",
  },
  {
    id: "iphone-16-pro-max",
    label: "iPhone 16 Pro Max",
    width: 440,
    height: 956,
    dpr: 3,
    ua: "iphone-safari",
    touch: true,
    kind: "phone",
  },
  {
    id: "iphone-se",
    label: "iPhone SE",
    width: 375,
    height: 667,
    dpr: 2,
    ua: "iphone-safari",
    touch: true,
    kind: "phone",
  },
  {
    id: "pixel-9",
    label: "Pixel 9",
    width: 412,
    height: 924,
    dpr: 2.625,
    ua: "android-chrome",
    touch: true,
    kind: "phone",
  },
  {
    id: "galaxy-s25",
    label: "Galaxy S25",
    width: 360,
    height: 780,
    dpr: 3,
    ua: "android-chrome",
    touch: true,
    kind: "phone",
  },
  {
    id: "galaxy-s25-ultra",
    label: "Galaxy S25 Ultra",
    width: 384,
    height: 832,
    dpr: 2.8125,
    ua: "android-chrome",
    touch: true,
    kind: "phone",
  },
  {
    id: "ipad-mini",
    label: "iPad mini",
    width: 744,
    height: 1133,
    dpr: 2,
    ua: "ipad-safari",
    touch: true,
    kind: "tablet",
  },
  {
    id: "ipad-air-11",
    label: "iPad Air 11",
    width: 820,
    height: 1180,
    dpr: 2,
    ua: "ipad-safari",
    touch: true,
    kind: "tablet",
  },
  {
    id: "ipad-pro-13",
    label: "iPad Pro 13",
    width: 1032,
    height: 1376,
    dpr: 2,
    ua: "ipad-safari",
    touch: true,
    kind: "tablet",
  },
  {
    id: "macbook-air-13",
    label: "MacBook Air 13",
    width: 1470,
    height: 956,
    dpr: 2,
    ua: "mac-safari",
    touch: false,
    kind: "laptop",
  },
  {
    id: "laptop",
    label: "laptop",
    width: 1366,
    height: 768,
    dpr: 1,
    ua: "windows-chrome",
    touch: false,
    kind: "laptop",
  },
  {
    id: "desktop",
    label: "desktop",
    width: 1920,
    height: 1080,
    dpr: 1,
    ua: "windows-chrome",
    touch: false,
    kind: "desktop",
  },
];

export function deviceOf(id: string): DevicePreset | undefined {
  return DEVICES.find((device) => device.id === id);
}

/** Does the device's screen take touch? */
export function hasTouch(id: string): boolean {
  return deviceOf(id)?.touch === true;
}

function handheld(device: DevicePreset): boolean {
  return device.kind === "phone" || device.kind === "tablet";
}

/** A size held one way: landscape puts the long side across, portrait up. */
export function turn(
  size: { width: number; height: number },
  orientation: OrientationValue,
): { width: number; height: number } {
  const long = Math.max(size.width, size.height);
  const short = Math.min(size.width, size.height);
  return orientation === "landscape"
    ? { width: long, height: short }
    : { width: short, height: long };
}

/** A device names its own browser in the ua knob, unless the patch names one. */
function withUa(patch: DevknobsStatePatch, preset: string): DevknobsStatePatch {
  return { ...patch, ua: { preset, ...patch.ua } };
}

/**
 * A device taken away takes its browser along, while the ua knob still has
 * the one the device brought and the patch names none.
 */
function withoutUa(state: DevknobsState, patch: DevknobsStatePatch): DevknobsStatePatch {
  const before = deviceOf(state.device);
  if (!before || patch.ua !== undefined || state.ua.preset !== before.ua) return patch;
  return { ...patch, ua: { preset: "system" } };
}

/**
 * What a patch does to the frame's size. A device brings its width, height,
 * dpr and browser. A phone or tablet picked after another is held the same
 * way, anything else the way it usually is, unless the patch says how. A new
 * orientation alone turns a frame that has both a width and a height. What the
 * patch sets itself wins over all of it.
 */
export function hold(state: DevknobsState, patch: DevknobsStatePatch): DevknobsStatePatch {
  const device = patch.device === undefined ? undefined : deviceOf(patch.device);
  if (device) {
    const before = deviceOf(state.device);
    const keep = before !== undefined && handheld(before) && handheld(device);
    const usual = device.usual ?? (device.width > device.height ? "landscape" : "portrait");
    const orientation = patch.orientation ?? (keep ? state.orientation : usual);
    const size = turn(device, orientation);
    return withUa({ ...size, dpr: device.dpr, ...patch, orientation }, device.ua);
  }
  const next = patch.device === undefined ? patch : withoutUa(state, patch);
  const { width, height } = state;
  const turned = next.orientation !== undefined && next.orientation !== state.orientation;
  if (turned && typeof width === "number" && typeof height === "number") {
    return { width: height, height: width, ...next };
  }
  return next;
}

/**
 * Keep the device fields true to the size: the orientation is the way the
 * frame stands, portrait while it has no width or height to turn, and a size
 * that is no longer the device's leaves no device behind.
 */
export function settle(state: DevknobsState): DevknobsState {
  const { width, height } = state;
  const sized = typeof width === "number" && typeof height === "number";
  const orientation: OrientationValue = sized && width > height ? "landscape" : "portrait";
  const device = deviceOf(state.device);
  const fits =
    device !== undefined &&
    sized &&
    ((width === device.width && height === device.height) ||
      (width === device.height && height === device.width));
  const id = fits ? state.device : "none";
  if (orientation === state.orientation && id === state.device) return state;
  return { ...state, orientation, device: id };
}
