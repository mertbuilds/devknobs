/** Emulated value for `prefers-color-scheme`. */
export type SchemeValue = "light" | "dark" | "system";

/** Emulated value for `prefers-reduced-motion`. */
export type MotionValue = "reduce" | "system";

/** Emulated value for `prefers-contrast`. */
export type ContrastValue = "more" | "system";

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

/** Body width in px, or `full` for the real viewport width. */
export type WidthValue = number | "full";

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
  contrast: ContrastValue;
  locale: LocaleValue;
  geo: GeoValue;
  text: TextValue;
  width: WidthValue;
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
