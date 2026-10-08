import { layoutOf, layoutOptions, platformOf } from "../engine/browserui";
import { DEVICES, deviceOf, formId, formOf, hasTouch, POSTURES } from "../engine/devices";
import { frameForced, needsFrame } from "../engine/frame";
import { MAT_COLOR_NAMES, MAT_COLORS, matGradient } from "../engine/matcolors";
import { mockOf } from "../engine/mock";
import { DEFAULT_STATE } from "../engine/store";
import { GRAB_COLOR_NAMES, GRAB_COLORS } from "../grab/colors";
import { UA_PRESETS, uaPreset } from "../engine/ua";
import { percent, ZOOM_MAX, ZOOM_MIN, ZOOM_PRESETS } from "../engine/zoom";
import type { BarsValue, BrowserValue, DevknobsState, GrabColorValue, VisionValue } from "../types";
import type { Knob, Option } from "./catalog";
import { flag, nameOf, numberIn, OFF_ON, options, parseUserAgent, UA_ALIASES } from "./knobs";

/** The device, viewport and debug knobs, and vision. */

/** The smallest and largest frame a size typed out can ask for, in px. */
const MIN_SIZE = 120;
const MAX_SIZE = 8192;

/** `390x844`, `390 × 844` or `390*844` as a width and a height. */
function parseSize(text: string): Option | null {
  const match = /^(\d+)\s*[x×*]\s*(\d+)(?:\s*px)?$/i.exec(text.trim());
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if ([width, height].some((size) => size < MIN_SIZE || size > MAX_SIZE)) return null;
  return { value: `${width}x${height}`, label: `${width} × ${height}` };
}

const ORIENTATIONS = options("portrait", "landscape");

/** What search finds each posture by, beside its name. */
const POSTURE_ALIASES = { closed: ["fold", "folded", "shut"], open: ["unfold", "unfolded"] } as const;

/** A foldable in each of its postures, as search finds them: `iphone-duo:open` unfolds the Duo. */
const POSTURE_OPTIONS: readonly Option[] = DEVICES.flatMap((device) =>
  device.postures
    ? POSTURES.map((posture) => ({
        value: `${device.id}:${posture}`,
        label: `${device.label} ${posture}`,
        aliases: POSTURE_ALIASES[posture],
      }))
    : [],
);

/** The screen in use, a foldable's in its posture. */
function screenNow(state: DevknobsState): string {
  return formId(state.device, state.posture);
}

/** The frame's size as the device knob reads it, such as `390x844` or `fullx700`. */
function sizeValue(state: DevknobsState): string {
  return typeof state.height === "number" ? `${state.width}x${state.height}` : "none";
}

export const DEVICE: Knob = {
  id: "device",
  label: "device",
  category: "device",
  control: "list",
  options: [
    { value: "none", label: "none" },
    ...DEVICES.map((device) => ({
      value: device.id,
      label: device.label,
      aliases: [device.kind, ...device.ua.split("-")],
      group: device.kind,
    })),
  ],
  aliases: ["devices", "height", "orientation", "rotate"],
  read: (state) => (state.device === "none" ? sizeValue(state) : state.device),
  write: (value, state) => {
    if (value === "portrait" || value === "landscape") return { orientation: value };
    const posture = POSTURES.find((name) => value.endsWith(`:${name}`));
    if (posture) return { device: value.slice(0, -posture.length - 1), posture };
    const size = /^(\d+|full)x(\d+)$/.exec(value);
    if (size) {
      return { width: size[1] === "full" ? "full" : Number(size[1]), height: Number(size[2]) };
    }
    if (value !== "none") return { device: value };
    // None takes away what the device brought, a dpr set since too.
    const device = formOf(state.device, state.posture);
    return device && state.dpr === device.dpr
      ? { device: "none", width: "full", height: "full", dpr: "system" }
      : { device: "none", width: "full", height: "full" };
  },
  // Back to no device, without the size and dpr the device brought.
  reset: {
    device: DEFAULT_STATE.device,
    width: DEFAULT_STATE.width,
    height: DEFAULT_STATE.height,
    dpr: DEFAULT_STATE.dpr,
    posture: DEFAULT_STATE.posture,
  },
  brief: (state) => {
    const device = deviceOf(state.device);
    if (!device) return nameOf(DEVICE, sizeValue(state));
    const posture = device.postures ? ` · ${state.posture}` : "";
    return `${device.label}${posture} · ${state.orientation}`;
  },
  name: (value) => value.replace("x", " × "),
  parse: parseSize,
  bare: true,
  extra: () => [...ORIENTATIONS, ...POSTURE_OPTIONS],
};

/** Does the device in use have a mock to draw? */
export function hasMock(state: DevknobsState): boolean {
  return mockOf(screenNow(state), state.orientation) !== null;
}

export const MOCK: Knob = {
  id: "mock",
  label: "mock",
  category: "device",
  control: "switch",
  options: OFF_ON,
  aliases: ["mockup", "bezel", "body"],
  // On while it is drawn, so a phone or tablet is what puts it off its default.
  read: (state) => flag(state.mock && hasMock(state)),
  write: (value) => ({ mock: value === "on" }),
  reset: { mock: DEFAULT_STATE.mock },
  // The device says enough.
  brief: () => "",
  offers: (state) => (hasMock(state) ? ["off", "on"] : []),
};

export const TOUCH_POINTER: Knob = {
  id: "touchPointer",
  label: "touch pointer",
  category: "device",
  control: "switch",
  options: OFF_ON,
  aliases: ["finger", "tap", "swipe", "drag", "cursor", "touch events"],
  // On while the device takes touch, so a phone or tablet is what puts it off its default.
  read: (state) => flag(state.touchPointer && hasTouch(state.device)),
  write: (value) => ({ touchPointer: value === "on" }),
  reset: { touchPointer: DEFAULT_STATE.touchPointer },
  brief: () => "",
  offers: (state) => (hasTouch(state.device) ? ["off", "on"] : []),
};

/** The layout of the phone's browser in use, or off for a device without one. */
function layoutNow(state: DevknobsState): string {
  return layoutOf(screenNow(state), state.browser) ?? "off";
}

export const BROWSER: Knob = {
  id: "browser",
  label: "browser",
  category: "device",
  control: "segments",
  options: [
    { value: "compact", label: "compact", aliases: ["floating"] },
    { value: "bottom", label: "bottom" },
    { value: "top", label: "top" },
    { value: "off", label: "off", aliases: ["fullscreen"] },
  ],
  aliases: ["safari", "chrome", "address bar", "url bar", "search bar", "toolbar", "browser ui"],
  // The browser's own default while it is drawn, so a phone is what puts it off its default.
  read: layoutNow,
  write: (value) => ({ browser: value as BrowserValue }),
  reset: { browser: DEFAULT_STATE.browser },
  // The browser's own default says nothing.
  brief: (state) =>
    layoutNow(state) === layoutOptions(screenNow(state))[0] ? "" : layoutNow(state),
  offers: (state) => layoutOptions(screenNow(state)),
};

/** Are the browser's bars drawn, so they can be minimized? */
function barsShown(state: DevknobsState): boolean {
  return layoutNow(state) !== "off";
}

export const BARS: Knob = {
  id: "bars",
  label: "bars",
  category: "device",
  control: "segments",
  options: [
    { value: "auto", label: "auto", aliases: ["scroll", "follow"] },
    { value: "expanded", label: "expanded" },
    { value: "minimized", label: "minimized", aliases: ["scrolled", "collapsed"] },
  ],
  aliases: ["browser bars", "minimize", "collapse"],
  read: (state) => (barsShown(state) ? state.bars : "auto"),
  write: (value) => ({ bars: value as BarsValue }),
  reset: { bars: DEFAULT_STATE.bars },
  offers: (state) => (barsShown(state) ? ["auto", "expanded", "minimized"] : []),
};

/** Is Safari drawn, so its page can run under its bars? */
function safariShown(state: DevknobsState): boolean {
  return platformOf(screenNow(state)) === "safari" && barsShown(state);
}

export const EDGE_TO_EDGE: Knob = {
  id: "edgeToEdge",
  label: "edge to edge",
  category: "device",
  control: "switch",
  options: OFF_ON,
  aliases: ["edge", "under bars", "true height", "full height"],
  // On while Safari is drawn, so an iPhone is what puts it off its default.
  read: (state) => flag(state.edgeToEdge && safariShown(state)),
  write: (value) => ({ edgeToEdge: value === "on" }),
  reset: { edgeToEdge: DEFAULT_STATE.edgeToEdge },
  brief: () => "",
  offers: (state) => (safariShown(state) ? ["off", "on"] : []),
};

export const WIDTH: Knob = {
  id: "width",
  label: "width",
  category: "viewport",
  control: "chips",
  options: [
    { value: "full", label: "full" },
    { value: "1024", label: "1024", aliases: ["laptop"] },
    { value: "768", label: "768", aliases: ["tablet", "ipad"] },
    { value: "390", label: "390", aliases: ["phone", "mobile", "iphone"] },
  ],
  aliases: ["viewport", "responsive", "breakpoint", "device"],
  read: (state) => String(state.width),
  write: (value) => ({ width: value === "full" ? "full" : Number(value) }),
  reset: { width: DEFAULT_STATE.width },
  // A device's size is the device row's.
  base: (state) => (deviceOf(state.device) ? String(state.width) : undefined),
  // With a height too, the device knob says the size.
  brief: (state) => (typeof state.height === "number" ? "" : String(state.width)),
  parse: (text) => {
    const match = /^(\d+)(?:\s*px)?$/i.exec(text.trim());
    return match ? numberIn(match[1] ?? "", MIN_SIZE, MAX_SIZE) : null;
  },
  bare: true,
};

export const DPR: Knob = {
  id: "dpr",
  label: "dpr",
  category: "viewport",
  control: "chips",
  options: [
    { value: "system", label: "system" },
    { value: "1", label: "1" },
    { value: "2", label: "2", aliases: ["retina"] },
    { value: "3", label: "3" },
  ],
  aliases: ["pixel ratio", "device pixel ratio", "density", "resolution"],
  read: (state) => String(state.dpr),
  write: (value) => ({ dpr: value === "system" ? "system" : Number(value) }),
  reset: { dpr: DEFAULT_STATE.dpr },
  // A device's dpr is the device row's.
  base: (state) => {
    const device = formOf(state.device, state.posture);
    return device ? String(device.dpr) : undefined;
  },
  brief: (state) => `dpr ${state.dpr}`,
  parse: (text) => numberIn(text, 0.25, 5),
};

/** `80` or `80%` as a zoom, in reason. */
function parseZoom(text: string): Option | null {
  const match = /^(\d+(?:\.\d+)?)\s*%?$/.exec(text.trim());
  const scale = Number(match?.[1]) / 100;
  if (!match || !(scale >= ZOOM_MIN && scale <= ZOOM_MAX)) return null;
  return { value: String(scale), label: percent(scale) };
}

export const ZOOM: Knob = {
  id: "zoom",
  label: "zoom",
  category: "viewport",
  // Segments, not chips: six presets wrap as chips at the panel's width.
  control: "segments",
  options: [
    { value: "fit", label: "fit", aliases: ["window"] },
    ...ZOOM_PRESETS.map((scale) => ({
      value: String(scale),
      label: String(Math.round(scale * 100)),
      long: percent(scale),
    })),
  ],
  aliases: ["scale", "magnify", "magnification"],
  read: (state) => String(state.zoom),
  write: (value) => ({ zoom: value === "fit" ? "fit" : Number(value) }),
  reset: { zoom: DEFAULT_STATE.zoom },
  // Only a frame is zoomed. The value waits for one.
  brief: (state) => (needsFrame(state) ? percent(Number(state.zoom)) : ""),
  name: (value) => percent(Number(value)),
  parse: parseZoom,
  shown: needsFrame,
};

export const FRAME: Knob = {
  id: "frame",
  label: "frame",
  category: "viewport",
  control: "switch",
  options: OFF_ON,
  aliases: ["iframe"],
  read: (state) => flag(state.frame),
  write: (value) => ({ frame: value === "on" }),
  reset: { frame: DEFAULT_STATE.frame },
  brief: (state) => (frameForced(state) ? "" : "frame"),
  // The switch changes nothing to see while another knob holds the frame up.
  shown: (state) => !frameForced(state),
};

/** More words search finds each mat color by. */
const MAT_ALIASES: Partial<Record<string, readonly string[]>> = {
  green: ["classic"],
  graphite: ["black", "gray", "grey", "dark"],
};

export const MAT: Knob = {
  id: "mat",
  label: "mat",
  category: "viewport",
  control: "swatches",
  options: MAT_COLOR_NAMES.map((name) => ({
    value: name,
    label: name,
    aliases: MAT_ALIASES[name],
    swatch: matGradient(MAT_COLORS[name].srgb),
  })),
  aliases: ["background", "cutting mat", "mat color", "letterbox"],
  read: (state) => state.mat,
  write: (value) => ({ mat: MAT_COLOR_NAMES.find((name) => name === value) ?? DEFAULT_STATE.mat }),
  reset: { mat: DEFAULT_STATE.mat },
  // The mat lies around a frame. The value waits for one.
  brief: (state) => (needsFrame(state) ? state.mat : ""),
  shown: needsFrame,
};

export const VISION: Knob = {
  id: "vision",
  label: "vision",
  category: "look",
  control: "list",
  options: [
    { value: "none", label: "none" },
    { value: "protanopia", label: "protanopia", aliases: ["red"] },
    { value: "deuteranopia", label: "deuteranopia", aliases: ["green"] },
    { value: "tritanopia", label: "tritanopia", aliases: ["blue"] },
    {
      value: "achromatopsia",
      label: "achromatopsia",
      aliases: ["gray", "grayscale", "monochrome"],
    },
    { value: "blur", label: "blur", aliases: ["blurry"] },
  ],
  aliases: ["color blind", "colorblind", "blindness", "deficiency"],
  read: (state) => state.vision,
  write: (value) => ({ vision: value as VisionValue }),
  reset: { vision: DEFAULT_STATE.vision },
};

export const UA: Knob = {
  id: "ua",
  label: "user agent",
  category: "device",
  control: "list",
  options: [
    { value: "system", label: "system" },
    ...UA_PRESETS.map((preset) => ({
      value: preset.id,
      label: preset.label.toLowerCase(),
      aliases: UA_ALIASES[preset.id] ?? [],
    })),
    { value: "custom", label: "custom", opens: true },
  ],
  aliases: ["ua", "useragent", "browser"],
  read: (state) => state.ua.preset,
  write: (value, state) => {
    if (value === "system" || uaPreset(value)) return { ua: { preset: value } };
    if (value !== "custom") return { ua: { preset: "custom", custom: value } };
    // Custom starts from the user agent in use, so it can be edited from there.
    const real = typeof navigator === "undefined" ? "" : navigator.userAgent;
    const custom = uaPreset(state.ua.preset)?.userAgent || state.ua.custom || real;
    return { ua: { preset: "custom", custom } };
  },
  reset: { ua: { preset: DEFAULT_STATE.ua.preset } },
  // A device says its own.
  brief: (state) =>
    formOf(state.device, state.posture)?.ua === state.ua.preset ? "" : nameOf(UA, state.ua.preset),
  parse: parseUserAgent,
};

export const OVERFLOW: Knob = {
  id: "overflow",
  label: "overflow",
  category: "debug",
  control: "switch",
  options: OFF_ON,
  aliases: ["horizontal", "scroll", "sideways"],
  read: (state) => flag(state.overflow),
  write: (value) => ({ overflow: value === "on" }),
  reset: { overflow: DEFAULT_STATE.overflow },
  brief: (_state, live) => (live.overflow === null ? "overflow" : `overflow · ${live.overflow}`),
};

export const OUTLINES: Knob = {
  id: "outlines",
  label: "outlines",
  category: "debug",
  control: "switch",
  options: OFF_ON,
  aliases: ["outline", "borders", "boxes"],
  read: (state) => flag(state.outlines),
  write: (value) => ({ outlines: value === "on" }),
  reset: { outlines: DEFAULT_STATE.outlines },
  brief: () => "outlines",
};

/** Half blue and half green: the two colors grab picks from on its own. */
const AUTO_SWATCH = [
  "linear-gradient(135deg",
  `${GRAB_COLORS.blue.srgb} 50%`,
  `${GRAB_COLORS.green.srgb} 50%)`,
].join(", ");

export const GRAB_COLOR: Knob = {
  id: "grabColor",
  label: "grab color",
  category: "debug",
  control: "swatches",
  options: [
    {
      value: "auto",
      label: "auto",
      aliases: ["automatic"],
      swatch: AUTO_SWATCH,
    },
    ...GRAB_COLOR_NAMES.map((name) => ({
      value: name,
      label: name,
      swatch: GRAB_COLORS[name].srgb,
    })),
  ],
  aliases: ["highlight", "overlay"],
  read: (state) => state.grabColor,
  write: (value) => ({ grabColor: value as GrabColorValue }),
  reset: { grabColor: DEFAULT_STATE.grabColor },
};
