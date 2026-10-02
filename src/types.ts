/** Emulated value for `prefers-color-scheme`. */
export type SchemeValue = "light" | "dark" | "system";

/** Emulated value for `prefers-reduced-motion`. */
export type MotionValue = "reduce" | "system";

/** Playback rate for every animation on the page. 1 is normal speed and 0 pauses. */
export type SpeedValue = number;

/** Emulated value for `prefers-contrast`. */
export type ContrastValue = "more" | "system";

/** Emulated value for `prefers-reduced-transparency`. */
export type TransparencyValue = "reduce" | "system";

/** Writing direction. `system` derives the direction from the language tag. */
export type DirValue = "ltr" | "rtl" | "system";

export interface LocaleValue {
  /** BCP 47 tag, or `system` to stop emulating. */
  lang: string;
  dir: DirValue;
}

/** A failure to report instead of a position. `none` reports the position. */
export type GeoErrorValue = "none" | "denied" | "unavailable" | "timeout";

export interface GeoValue {
  /**
   * A preset id, `custom` to use the explicit fields, `route` to travel the
   * route, or `system` to stop emulating.
   */
  preset: string;
  lat: number;
  lng: number;
  accuracy: number;
  /** The zone of a `custom` position, followed by a time zone knob set to `geo`. */
  timeZone: string;
  /** Works without a position too, so a page can be tested for refusals alone. */
  error: GeoErrorValue;
  /** The path of the `route` preset: `lat,lng` per line, or a pasted GPX file. */
  route: string;
  /** How fast the `route` preset travels its path, in km/h. */
  speed: number;
}

/**
 * An IANA zone such as `Asia/Kathmandu`, `geo` to follow the geolocation
 * preset, or `system` to stop emulating.
 */
export type TimeZoneValue = string;

/** The real clock, one that runs on from a set instant, or one stopped there. */
export type ClockMode = "system" | "offset" | "frozen";

export interface ClockValue {
  mode: ClockMode;
  /** The instant the clock read at `since`, in epoch ms. A frozen clock stays there. */
  at: number;
  /**
   * The real instant `at` was set at, in epoch ms. The engine stamps it on
   * every change, so a patch leaves it out.
   */
  since: number;
  /** Clock ms per real ms while it runs. */
  speed: number;
  /** Send the clock's instant to the page's own origin, in an `x-devknobs-now` header. */
  header: boolean;
}

/** Emulated `navigator.onLine`. Requests still go out: only the flag and its events change. */
export type OnlineValue = "offline" | "system";

/** Emulated `navigator.connection.effectiveType`, where the browser has a connection. */
export type ConnectionValue = "slow-2g" | "2g" | "3g" | "4g" | "system";

/** Emulated `navigator.connection.saveData`. */
export type SaveDataValue = "on" | "off" | "system";

export interface NetworkValue {
  online: OnlineValue;
  type: ConnectionValue;
  saveData: SaveDataValue;
}

/** Root font size in px, or `system` to stop emulating. */
export type TextValue = number | "system";

/** Viewport width in px, rendered as a frame that wide, or `full` for the window. */
export type WidthValue = number | "full";

/** Device pixel ratio inside the frame, or `system` for the screen's own. */
export type DprValue = number | "system";

/** A vision deficiency drawn as a filter over the frame, or `none`. */
export type VisionValue =
  | "none"
  | "protanopia"
  | "deuteranopia"
  | "tritanopia"
  | "achromatopsia"
  | "blur";

export interface PanelValue {
  open: boolean;
  /** Handle offset from the top of the viewport, in px. */
  y: number;
  /** Panel offset from the top of the viewport, in px. The handle pushes it. */
  top: number;
}

export interface DevknobsState {
  scheme: SchemeValue;
  motion: MotionValue;
  speed: SpeedValue;
  contrast: ContrastValue;
  transparency: TransparencyValue;
  locale: LocaleValue;
  /** Pseudo-localize the page's text. */
  pseudo: boolean;
  geo: GeoValue;
  timeZone: TimeZoneValue;
  clock: ClockValue;
  network: NetworkValue;
  text: TextValue;
  /** WCAG 1.4.12 text spacing. */
  spacing: boolean;
  width: WidthValue;
  /** Render the page in a full-width frame even at full width, for the native scheme. */
  frame: boolean;
  dpr: DprValue;
  vision: VisionValue;
  /** Mark the boxes that stick out of the viewport sideways. */
  overflow: boolean;
  outlines: boolean;
  panel: PanelValue;
}

/** A partial state update. Object knobs may be patched field by field. */
export type DevknobsStatePatch = {
  [K in keyof DevknobsState]?: DevknobsState[K] extends object
    ? Partial<DevknobsState[K]>
    : DevknobsState[K];
};

/** Every knob module applies a value and can put the page back the way it was. */
export interface Knob<T> {
  apply(value: T): void;
  reset(): void;
}
