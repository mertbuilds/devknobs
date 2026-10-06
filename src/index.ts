import * as engine from "./engine";
import { DEVICES } from "./engine/devices";
import { isDevknobsFrame } from "./engine/frame";
import { GEO_PRESETS } from "./engine/geo";
import { LOCALE_PRESETS } from "./engine/locale";
import { TIME_ZONE_PRESETS } from "./engine/time";
import { UA_PRESETS } from "./engine/ua";
import { createGrab, type GrabControl } from "./grab/control";
import type { GrabOptions, GrabPayload } from "./grab/types";
import { claim, free, superseded } from "./instance";
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
export type { EngineOptions } from "./engine";
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
  if (isDevknobsFrame()) {
    stopKeys = forwardKeys(live.get, () => engine.getState().panel.open);
    return;
  }
  if (options.open !== undefined) engine.setState({ panel: { open: options.open } });
  if (options.grabColor !== undefined) engine.setState({ grabColor: options.grabColor });
  panel = createPanel({ keys: live, grab: grabControl });
}

/** Remove the panel and undo every knob. A copy that was taken over has done so already. */
export function unmount(): void {
  if (superseded(window, unmount)) return;
  panel?.destroy();
  panel = null;
  grabControl?.destroy();
  grabControl = null;
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
