import type {
  DevknobsState,
  DevknobsStatePatch,
  OrientationValue,
  PostureValue,
} from "../types";

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
  /** Turned to be held across, its top goes to the right, where most go to the left. */
  clockwise?: boolean;
  /**
   * A device that folds: the screen it shows in each posture, which takes the
   * place of the fields above where it has its own. Held upright folded, its
   * hinge is on its left, so the screen it opens to is held the other way.
   */
  postures?: Readonly<Record<PostureValue, DeviceForm>>;
}

/**
 * The screen a foldable shows in a posture: its own id, which its body, its
 * picture and its browser are kept under, what the readout calls it, and what
 * it has of its own.
 */
export interface DeviceForm extends Partial<
  Pick<DevicePreset, "width" | "height" | "dpr" | "ua" | "usual" | "clockwise">
> {
  id: string;
  label: string;
}

/** The postures a foldable takes, the one it is picked in first. */
export const POSTURES: readonly PostureValue[] = ["closed", "open"];

/**
 * Popular devices in 2026, by kind, iPhones and Pixels newest first. A
 * Pixel's size is its panel in px over its density, rounded up as Chrome
 * rounds the screen, so 2992 px at 3 is 998. The iPhone Duo folds: its
 * size is the cover screen of the folded phone, and open it shows its inner
 * screen, which is held across.
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
    id: "iphone-duo",
    label: "iPhone Duo",
    width: 466,
    height: 678,
    dpr: 3,
    ua: "iphone-safari",
    touch: true,
    kind: "phone",
    postures: {
      closed: { id: "iphone-duo-closed", label: "iPhone Duo (closed)" },
      open: {
        id: "iphone-duo-open",
        label: "iPhone Duo (open)",
        width: 669,
        height: 951,
        usual: "landscape",
        // As Apple turns its picture of it.
        clockwise: true,
      },
    },
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
    id: "pixel-10",
    label: "Pixel 10",
    width: 412,
    height: 924,
    dpr: 2.625,
    ua: "android-chrome",
    touch: true,
    kind: "phone",
  },
  {
    id: "pixel-10-pro",
    label: "Pixel 10 Pro",
    width: 427,
    height: 952,
    dpr: 3,
    ua: "android-chrome",
    touch: true,
    kind: "phone",
  },
  {
    id: "pixel-10-pro-xl",
    label: "Pixel 10 Pro XL",
    width: 448,
    height: 998,
    dpr: 3,
    ua: "android-chrome",
    touch: true,
    kind: "phone",
  },
  {
    id: "pixel-10a",
    label: "Pixel 10a",
    width: 412,
    height: 924,
    dpr: 2.625,
    ua: "android-chrome",
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
    id: "pixel-9-pro",
    label: "Pixel 9 Pro",
    width: 427,
    height: 952,
    dpr: 3,
    ua: "android-chrome",
    touch: true,
    kind: "phone",
  },
  {
    id: "pixel-9-pro-xl",
    label: "Pixel 9 Pro XL",
    width: 448,
    height: 998,
    dpr: 3,
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

/**
 * The device as it stands in a posture, its first where none is said: a
 * foldable as the screen of that posture, under that screen's id and label,
 * and any other device as it is.
 */
export function formOf(id: string, posture: PostureValue = "closed"): DevicePreset | undefined {
  const device = deviceOf(id);
  const form = device?.postures?.[posture];
  return device && form ? { ...device, ...form } : device;
}

/** The id of the screen a device shows in a posture, or the id as it is. */
export function formId(id: string, posture?: PostureValue): string {
  return formOf(id, posture)?.id ?? id;
}

/** The foldable and the posture a screen of it belongs to, by the screen's id. */
export function formParent(id: string): { device: string; posture: PostureValue } | undefined {
  for (const device of DEVICES) {
    const posture = POSTURES.find((posture) => device.postures?.[posture].id === id);
    if (posture) return { device: device.id, posture };
  }
  return undefined;
}

/**
 * Every screen the devices show, each under its own id: a foldable as the
 * screen of each of its postures, and any other device as it is.
 */
export const SCREENS: readonly DevicePreset[] = DEVICES.flatMap((device) => {
  const { postures } = device;
  return postures ? POSTURES.map((posture) => ({ ...device, ...postures[posture] })) : [device];
});

/** A device, or a foldable's screen, by its id. */
export function screenOf(id: string): DevicePreset | undefined {
  return SCREENS.find((screen) => screen.id === id);
}

/** Does the device's screen take touch? */
export function hasTouch(id: string): boolean {
  return deviceOf(id)?.touch === true;
}

function handheld(device: DevicePreset): boolean {
  return device.kind === "phone" || device.kind === "tablet";
}

/** The other way to hold a device. */
function flip(orientation: OrientationValue): OrientationValue {
  return orientation === "portrait" ? "landscape" : "portrait";
}

/** The way a device, or a foldable's screen, is usually held. */
function usualOf(device: DevicePreset): OrientationValue {
  return device.usual ?? (device.width > device.height ? "landscape" : "portrait");
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
 * A foldable folded open or shut: its hinge stays where it is, so the screen
 * it goes to is held the other way, at that screen's size. A dpr and a browser
 * the last screen brought go with it. Null for a patch that does not fold it.
 */
function fold(state: DevknobsState, patch: DevknobsStatePatch): DevknobsStatePatch | null {
  const { posture } = patch;
  const same = patch.device === undefined || patch.device === state.device;
  if (!same || posture === undefined || posture === state.posture) return null;
  const from = formOf(state.device, state.posture);
  const to = formOf(state.device, posture);
  if (!from || !to || !deviceOf(state.device)?.postures) return null;
  const orientation = patch.orientation ?? flip(state.orientation);
  const dpr = state.dpr === from.dpr ? to.dpr : state.dpr;
  const next = { ...turn(to, orientation), dpr, ...patch, orientation };
  return state.ua.preset === from.ua ? withUa(next, to.ua) : next;
}

/**
 * What a patch does to the frame's size. A device brings its width, height,
 * dpr and browser, a foldable those of the screen it shows in its posture. A
 * phone or tablet picked after another one turned from its usual way is
 * turned from its own too, anything else held the way it usually is, unless
 * the patch says how. A new orientation alone turns a frame that has both a
 * width and a height. What the patch sets itself wins over all of it.
 */
export function hold(state: DevknobsState, patch: DevknobsStatePatch): DevknobsStatePatch {
  const folded = fold(state, patch);
  if (folded) return folded;
  const picked = patch.device === undefined ? undefined : deviceOf(patch.device);
  const device = picked && formOf(picked.id, patch.posture ?? state.posture);
  if (device) {
    // Turned from the way the last one is usually held, the next is turned
    // from its own. Folding turns a foldable's screen, which is not a turn.
    const before = formOf(state.device, state.posture);
    const turned = before !== undefined && handheld(before) && state.orientation !== usualOf(before);
    const usual = usualOf(device);
    const orientation = patch.orientation ?? (turned && handheld(device) ? flip(usual) : usual);
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
 * that is no longer the device's leaves no device behind. Without a foldable,
 * the posture is the first, so one picked next comes up in it.
 */
export function settle(state: DevknobsState): DevknobsState {
  const { width, height } = state;
  const sized = typeof width === "number" && typeof height === "number";
  const orientation: OrientationValue = sized && width > height ? "landscape" : "portrait";
  const device = formOf(state.device, state.posture);
  const fits =
    device !== undefined &&
    sized &&
    ((width === device.width && height === device.height) ||
      (width === device.height && height === device.width));
  const id = fits ? state.device : "none";
  const posture = deviceOf(id)?.postures ? state.posture : "closed";
  const same = orientation === state.orientation && posture === state.posture;
  if (same && id === state.device) return state;
  return { ...state, orientation, posture, device: id };
}
