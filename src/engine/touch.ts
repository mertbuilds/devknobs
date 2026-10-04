/**
 * A device's touch screen, as scripts look for one: `'ontouchstart' in
 * window`, and `navigator.maxTouchPoints` unless the ua knob reports it. The
 * pointer and hover media queries go through the media knobs, and the touch
 * pointer makes the mouse act as a finger.
 */

/** What iOS reports, and Android mostly too. */
const TOUCH_POINTS = 5;

export interface TouchValue {
  on: boolean;
  /** Report the touch points in `navigator.maxTouchPoints` too. */
  points: boolean;
}

/** `ontouchstart` was put on the window here, which had none. */
let handler = false;
/** `maxTouchPoints` was put on the navigator here, over the prototype's. */
let points = false;

export function apply(value: TouchValue): void {
  if (value.on && !handler && !("ontouchstart" in window)) {
    Object.defineProperty(window, "ontouchstart", {
      configurable: true,
      enumerable: true,
      writable: true,
      value: null,
    });
    handler = true;
  } else if (!value.on && handler) {
    Reflect.deleteProperty(window, "ontouchstart");
    handler = false;
  }
  const report = value.on && value.points;
  if (report && !points) {
    Object.defineProperty(navigator, "maxTouchPoints", {
      configurable: true,
      enumerable: true,
      get: () => TOUCH_POINTS,
    });
    points = true;
  } else if (!report && points) {
    Reflect.deleteProperty(navigator, "maxTouchPoints");
    points = false;
  }
}

export function reset(): void {
  apply({ on: false, points: false });
}
