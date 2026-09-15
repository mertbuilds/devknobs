import * as engine from "./engine";
import { GEO_PRESETS } from "./engine/geo";
import { LOCALE_PRESETS } from "./engine/locale";
import { createPanel, type Panel } from "./ui/panel";

export type {
  ContrastValue,
  DevknobsState,
  DevknobsStatePatch,
  DirValue,
  GeoValue,
  Knob,
  LocaleValue,
  MotionValue,
  PanelValue,
  SchemeValue,
  TextValue,
  WidthValue,
} from "./types";
export type { GeoPreset } from "./engine/geo";
export type { EngineOptions } from "./engine";

export interface MountOptions extends engine.EngineOptions {
  /** Key that toggles the panel. Defaults to `d`. */
  hotkey?: string;
  /** Start the panel open or closed. Defaults to the stored state. */
  open?: boolean;
}

export const PRESETS = {
  locale: LOCALE_PRESETS,
  geo: GEO_PRESETS,
};

let panel: Panel | null = null;

/**
 * Start the knobs and put the panel on the page. Patches go in right away, even
 * mid-parse, so that a theme script running before `DOMContentLoaded` sees the
 * emulated values. The panel host waits for the body.
 */
export function mount(options: MountOptions = {}): void {
  if (panel) return;
  engine.start(options);
  if (options.open !== undefined) engine.setState({ panel: { open: options.open } });
  panel = createPanel(options);
}

/** Remove the panel and undo every knob. */
export function unmount(): void {
  panel?.destroy();
  panel = null;
  engine.stop();
}

export const getState = engine.getState;
export const setState = engine.setState;
export const reset = engine.reset;
export const replay = engine.replay;
