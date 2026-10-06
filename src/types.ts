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

/** Viewport height in px, rendered as a frame that tall, or `full` for the window. */
export type HeightValue = number | "full";

/** Which way the frame is held. Landscape puts its long side across. */
export type OrientationValue = "portrait" | "landscape";

/** How a foldable stands: folded shut on its cover screen, or open on its inner one. */
export type PostureValue = "closed" | "open";

/**
 * Where a phone's browser keeps its bars: `auto` for the browser's own
 * default, Safari's compact or Chrome's top, or `off` for none.
 */
export type BrowserValue = "auto" | "compact" | "bottom" | "top" | "off";

/**
 * A phone's browser bars: `auto` minimizes them on a scroll down and brings
 * them back on a scroll up, as the browser does, or they stay one way.
 */
export type BarsValue = "auto" | "expanded" | "minimized";

/** Device pixel ratio inside the frame, or `system` for the screen's own. */
export type DprValue = number | "system";

/**
 * How big the frame is drawn: `fit` for as big as the window allows, up to its
 * own size, or a scale such as 1.25 for 125%. The page inside sees the same
 * viewport and device pixel ratio either way.
 */
export type ZoomValue = "fit" | number;

/** A vision deficiency drawn as a filter over the frame, or `none`. */
export type VisionValue =
  | "none"
  | "protanopia"
  | "deuteranopia"
  | "tritanopia"
  | "achromatopsia"
  | "blur";

/**
 * The color grab draws its boxes in. `auto` is blue, and green where the page
 * behind the element is blue.
 */
export type GrabColorValue = "auto" | "blue" | "green" | "pink" | "orange" | "purple" | "cyan";

/** The color of the cutting mat the frame lies on. */
export type MatColorValue = "blue" | "green" | "magenta" | "purple" | "red" | "graphite";

export interface UaValue {
  /**
   * A preset id such as `iphone-safari`, `custom` to use the custom string, or
   * `system` to stop emulating.
   */
  preset: string;
  /** The user agent of the `custom` preset. */
  custom: string;
}

/** An edge a box sits flush with and follows when sizes change, or `none`. */
export type EdgeValue = "top" | "bottom" | "none";

/** The edge of the window the panel lives on. */
export type SideValue = "left" | "right";

export interface PanelValue {
  open: boolean;
  /** The edge of the window the panel and its handle live on. */
  side: SideValue;
  /** Handle offset from the top of the viewport, in px. */
  y: number;
  /** Panel offset from the top of the viewport, in px. */
  top: number;
  /** The edge of the window the panel sits flush with. */
  edge: EdgeValue;
  /** The corner of the panel the handle sits flush with. */
  tab: EdgeValue;
  /**
   * Ids of the rows set from the panel. Each stays in the list, back at its
   * default too, until its `×` takes it off. Reset all lists the default rows
   * again.
   */
  pinned: string[];
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
  height: HeightValue;
  /** A device preset id, or `none`. Picking one sets the width, height and dpr. */
  device: string;
  /**
   * Follows the width and height. Setting it turns a frame that has both, and
   * holds a device that way.
   */
  orientation: OrientationValue;
  /** How a device that folds stands. Folding it sets the width and height. */
  posture: PostureValue;
  /** Draw a phone's or a tablet's body around its frame. */
  mock: boolean;
  /** On a device with a touch screen, the mouse acts as a finger inside its frame. */
  touchPointer: boolean;
  /** A phone's browser bars around the page, which take their room from the viewport. */
  browser: BrowserValue;
  /** The browser's bars following the page's scroll, or held expanded or minimized. */
  bars: BarsValue;
  /**
   * Safari draws the page under its bars to the bottom of the screen, as the
   * phone looks, where the page reads a taller viewport than Safari reports.
   * Off, the page gets Safari's measured viewport.
   */
  edgeToEdge: boolean;
  /** Render the page in a full-width frame even at full width, for the native scheme. */
  frame: boolean;
  dpr: DprValue;
  zoom: ZoomValue;
  mat: MatColorValue;
  vision: VisionValue;
  ua: UaValue;
  /** Mark the boxes that stick out of the viewport sideways. */
  overflow: boolean;
  outlines: boolean;
  grabColor: GrabColorValue;
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
