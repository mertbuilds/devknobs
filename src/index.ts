import * as engine from "./engine";
import { GEO_PRESETS } from "./engine/geo";
import { LOCALE_PRESETS } from "./engine/locale";

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
export type { EngineOptions as MountOptions } from "./engine";

export const PRESETS = {
  locale: LOCALE_PRESETS,
  geo: GEO_PRESETS,
};

let host: HTMLElement | null = null;

/**
 * Start the knobs and add the panel host to the page. Patches go in right away,
 * even mid-parse, so that a theme script running before `DOMContentLoaded` sees
 * the emulated values. The host waits for the body.
 */
export function mount(options: engine.EngineOptions = {}): void {
  if (host) return;
  engine.start(options);
  host = document.createElement("div");
  host.setAttribute("data-devknobs", "panel");
  host.style.cssText = "position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647";
  if (document.body) document.body.appendChild(host);
  else document.addEventListener("DOMContentLoaded", attachHost, { once: true });
}

function attachHost(): void {
  if (host && !host.isConnected) document.body.appendChild(host);
}

/** Remove the panel and undo every knob. */
export function unmount(): void {
  document.removeEventListener("DOMContentLoaded", attachHost);
  engine.stop();
  host?.remove();
  host = null;
}

export const getState = engine.getState;
export const setState = engine.setState;
export const reset = engine.reset;
export const replay = engine.replay;
