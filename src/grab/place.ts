/** Where grab runs for a page: nowhere, on the page itself, or in the width knob's frame. */
export type GrabPlace = "off" | "here" | "frame";

export type GrabEvent =
  /** The page asks grab on or off: the key, the panel, escape. `frame` is whether its frame is up. */
  | { type: "ask"; on: boolean; frame: boolean }
  /** The frame says grab went on or off in it, or that it loaded again without grab. */
  | { type: "frame"; on: boolean }
  /** The frame came up or went down. */
  | { type: "framed"; frame: boolean };

/**
 * Where grab goes next. It runs in one place at a time: with the frame up it
 * is the frame's, and the page above only shows it as on. Whatever the frame
 * says leaves nothing of grab running on the page above.
 */
export function grabStep(place: GrabPlace, event: GrabEvent): GrabPlace {
  switch (event.type) {
    case "ask":
      if (!event.on) return "off";
      return event.frame ? "frame" : "here";
    case "frame":
      return event.on ? "frame" : "off";
    case "framed":
      if (place === "here" && event.frame) return "off";
      if (place === "frame" && !event.frame) return "off";
      return place;
  }
}
