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

export interface GeoValue {
  /** A preset id, `custom` to use the explicit fields, or `system` to stop emulating. */
  preset: string;
  lat: number;
  lng: number;
  accuracy: number;
  timeZone: string;
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
  geo: GeoValue;
  text: TextValue;
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
