import * as engine from "./engine";
import { DEVICES } from "./engine/devices";
import { isDevknobsFrame } from "./engine/frame";
import { GEO_PRESETS } from "./engine/geo";
import { LOCALE_PRESETS } from "./engine/locale";
import { getOutside, subscribeOutside } from "./engine/outside";
import { TIME_ZONE_PRESETS } from "./engine/time";
import { UA_PRESETS } from "./engine/ua";
import { createGrab, type GrabControl } from "./grab/control";
import { createInspect, type InspectControl } from "./grab/inspect";
import type { GrabOptions, GrabPayload } from "./grab/types";
import { claim, free, superseded } from "./instance";
import { applyOnLoad } from "./storage/onload";
import type { GrabColorValue } from "./types";
import { createKeys, type LiveKeys } from "./ui/bindings";
import { forwardKeys } from "./ui/keys";
import { createPanel, type Panel } from "./ui/panel";

export type {
  BarsValue,
  BrowserValue,
  ClockMode,
  ClockValue,
  ConnectionValue,
  ContrastValue,
  DevknobsState,
  DevknobsStatePatch,
  DirValue,
  DprValue,
  EdgeValue,
  GeoErrorValue,
  GeoValue,
  GrabColorValue,
  HeightValue,
  Knob,
  LocaleValue,
  MotionValue,
  NetworkValue,
  OnlineValue,
  OrientationValue,
  PanelValue,
  SaveDataValue,
  SchemeValue,
  SideValue,
  SpeedValue,
  TextValue,
  TimeZoneValue,
  TransparencyValue,
  UaValue,
  VisionValue,
  WidthValue,
  ZoomValue,
} from "./types";
export type { DeviceKind, DevicePreset } from "./engine/devices";
export type { GeoPreset } from "./engine/geo";
export type { UaBrand, UaHints, UaPreset } from "./engine/ua";
export type { EngineOptions, OutsideOptions } from "./engine";
export type { OutsideListener, OutsideState } from "./engine/outside";
export type { GrabEntry, GrabFrame, GrabOptions, GrabPayload, ResolvedSource } from "./grab/types";

export interface MountOptions extends engine.EngineOptions {
  /**
   * The letter that with shift toggles the panel. Defaults to `k`. A key the
   * user sets in the panel wins over it.
   */
  hotkey?: string;
  /** Start the panel open or closed. Defaults to the stored state, closed at first. */
  open?: boolean;
  /** Press a key to grab elements for an agent. Defaults to true. */
  grab?: boolean;
  /**
   * The key that grabs, such as `alt+shift+g`. Defaults to `shift+g`. A key
   * the user sets in the panel wins over it.
   */
  grabKey?: string;
  /**
   * The color grab draws its boxes in. Defaults to the stored one, `auto` at
   * first: blue, and green where the page behind the element is blue.
   */
  grabColor?: GrabColorValue;
  /**
   * Show the handle on the window's edge while the panel is closed. Defaults
   * to true. With false, the panel key opens it. What the user sets in the
   * panel's settings wins over it.
   */
  handle?: boolean;
}

export const PRESETS = {
  locale: LOCALE_PRESETS,
  geo: GEO_PRESETS,
  timeZone: TIME_ZONE_PRESETS,
  ua: UA_PRESETS,
  device: DEVICES,
};

let panel: Panel | null = null;
let stopKeys: (() => void) | null = null;
let grabControl: GrabControl | null = null;
let inspectControl: InspectControl | null = null;
let keys: LiveKeys | null = null;

/**
 * Start the knobs and put the panel on the page. Patches go in right away, even
 * mid-parse, so that a theme script running before `DOMContentLoaded` sees the
 * emulated values. The panel host waits for the body. Inside the width knob's
 * frame there is no panel: the page above has it, and gets the frame's keys.
 * A second copy of devknobs on the page, such as a hot update loads, takes
 * over from the first, which unmounts.
 */
export function mount(options: MountOptions = {}): void {
  if (panel || stopKeys) return;
  // Before anything else: the presets marked to apply on load, unless the early script did.
  applyOnLoad();
  claim(window, unmount);
  engine.start(options);
  // The mount's keys, with the ones the user set in the panel on top.
  const live = createKeys({
    hotkey: options.hotkey,
    grabKey: options.grabKey,
    grab: options.grab !== false,
  });
  keys = live;
  // Ahead of the panel's keys, so escape ends grab before it closes the panel.
  // A key the panel records is never grab's.
  if (options.grab !== false) {
    grabControl = createGrab({ key: () => (live.recording ? null : live.get().grab) });
  }
  // Inspect is the same picking with another end, so one of the two is on at a time.
  const inspect = createInspect({ key: () => (live.recording ? null : live.get().inspect) });
  inspectControl = inspect;
  const grab = grabControl;
  grab?.subscribe((on) => {
    if (on) inspect.set(false);
  });
  inspect.subscribe((on) => {
    if (on) grab?.set(false);
  });
  if (isDevknobsFrame()) {
    stopKeys = forwardKeys(live.get, () => engine.getState().panel.open);
    return;
  }
  if (options.open !== undefined) engine.setState({ panel: { open: options.open } });
  if (options.grabColor !== undefined) engine.setState({ grabColor: options.grabColor });
  panel = createPanel({ keys: live, grab: grabControl, inspect, handle: options.handle });
}

/** Remove the panel and undo every knob. A copy that was taken over has done so already. */
export function unmount(): void {
  if (superseded(window, unmount)) return;
  panel?.destroy();
  panel = null;
  grabControl?.destroy();
  grabControl = null;
  inspectControl?.destroy();
  inspectControl = null;
  stopKeys?.();
  stopKeys = null;
  keys?.destroy();
  keys = null;
  engine.stop();
  free(window, unmount);
}

export const getState = engine.getState;
export const setState = engine.setState;
export const reset = engine.reset;
export const replay = engine.replay;

/**
 * The device frame showing an outside page: one on another origin, such as a
 * site a visitor pastes the address of. It is shown at the device's size, in
 * its body and bars, and no knob reaches into it. Nothing of it is stored.
 */
export const frame = {
  /**
   * Show the page at `url` in the frame, and bring the frame up as a phone
   * where there is none. Only `http:` and `https:` addresses are taken: false
   * for any other. `refused` shows the screen of a page that refuses to be
   * framed, without asking for the page.
   */
  show: engine.showOutside,
  /**
   * The outside page shown refuses to be framed, as the host's own check of
   * its `x-frame-options` and `frame-ancestors` said: the device's screen
   * says so. The browser tells a page above no such thing, so devknobs never
   * guesses it.
   */
  refuse: engine.refuseShown,
  /** Put the window's own page back in the frame. */
  own: engine.showOwn,
  /** What the frame shows now. */
  get: getOutside,
  /** Hear about every change of what the frame shows, its load included. Returns the way to stop. */
  subscribe: subscribeOutside,
};

/**
 * Copy what an agent needs to find the elements in the code: their html, the
 * components that rendered them and where. Loads on first use, so the page
 * never pays for it until then. Null when nothing was copied.
 */
export async function grab(
  elements: Element[],
  options?: GrabOptions,
): Promise<GrabPayload | null> {
  const loaded = await import("./grab");
  return loaded.grab(elements, options);
}
