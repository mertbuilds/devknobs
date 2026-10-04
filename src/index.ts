import * as engine from "./engine";
import { DEVICES } from "./engine/devices";
import { isDevknobsFrame } from "./engine/frame";
import { GEO_PRESETS } from "./engine/geo";
import { LOCALE_PRESETS } from "./engine/locale";
import { TIME_ZONE_PRESETS } from "./engine/time";
import { UA_PRESETS } from "./engine/ua";
import { forwardKeys } from "./ui/keys";
import { createPanel, type Panel } from "./ui/panel";

export type {
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

export interface MountOptions extends engine.EngineOptions {
  /** Key that toggles the panel. Defaults to `d`. */
  hotkey?: string;
  /** Start the panel open or closed. Defaults to the stored state, closed at first. */
  open?: boolean;
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

/**
 * Start the knobs and put the panel on the page. Patches go in right away, even
 * mid-parse, so that a theme script running before `DOMContentLoaded` sees the
 * emulated values. The panel host waits for the body. Inside the width knob's
 * frame there is no panel: the page above has it, and gets the frame's keys.
 */
export function mount(options: MountOptions = {}): void {
  if (panel || stopKeys) return;
  engine.start(options);
  if (isDevknobsFrame()) {
    stopKeys = forwardKeys(options.hotkey);
    return;
  }
  if (options.open !== undefined) engine.setState({ panel: { open: options.open } });
  panel = createPanel(options);
}

/** Remove the panel and undo every knob. */
export function unmount(): void {
  panel?.destroy();
  panel = null;
  stopKeys?.();
  stopKeys = null;
  engine.stop();
}

export const getState = engine.getState;
export const setState = engine.setState;
export const reset = engine.reset;
export const replay = engine.replay;
