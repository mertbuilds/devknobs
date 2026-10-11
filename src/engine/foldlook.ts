/**
 * The numbers a fold's look is drawn by, as they ship, in one table read each
 * time a fold is drawn. The built package has these and no way to set them.
 * From source, the tuning controls set them by hand on a live page.
 */

/** Every number as it ships. Tuned values that are kept go here. */
export const TUNE_DEFAULTS = {
  /** The widest the blur gets, in css px at scale 1: at the free edge, the half standing at `blurAngle`. */
  blurMost: 48,
  /** The blur at the hinge, as a share of the blur at the free edge at the same angle. None as it ships: the hinge side is sharp. */
  blurHinge: 0,
  /** How the blur rises from the hinge to the free edge: 1 evenly, more keeps it low further from the hinge. */
  blurRise: 2,
  /** The hinge's angle the blur is widest at, in degrees: 180 open flat, 90 a right angle, 0 shut. */
  blurAngle: 90,
  /** How the blur falls off away from that angle: 1 evenly, more keeps it low further from it. */
  blurStand: 1.5,
  /** How much of its peak the blur keeps past that angle, on the side away from where the screen lies flat in sight: 0 falls as it rose, 1 stays at the peak. */
  blurHold: 0,
  /** How the blur rises to its peak: 0 by `blurStand`'s power, 1 slow at both ends, as jadon7/iphone-duo's does. */
  blurEase: 0,
  /** How wide the blur at the picture's ends along the hinge is at the hinge, in widths of the dark past them. */
  edgeHinge: 0.3,
  /** The same at the free edge. */
  edgeFree: 1,
  /** How far into the picture from an end the blur past it reaches, in widths of that blur. */
  edgeReach: 1.5,
  /** How far apart WebGL2's taps are, as a share of the blur's width: more is softer, till the taps show. */
  blurSpread: 0.5,
  /** How dark the turned screen's free edge gets, 0 to 1, the half standing at a right angle. None as it ships, so the four numbers under it do nothing till a hand raises it: 0.7 is as measured from Apple's. */
  darkMost: 0,
  /** How that dark falls off away from a right angle: more keeps it to fewer degrees about it. */
  darkPower: 3,
  /** Where that dark starts, as a share of the way from the hinge to the free edge. */
  darkFrom: 0.25,
  /** How wide the darkest strip at the free edge is, as a share of the same way. */
  darkBand: 0.05,
  /** How much of that dark comes on evenly from where it starts: the rest is the strip's. */
  darkBroad: 0.5,
  /** How strongly the half that turns is shaded toward its free edge as it turns. Not at all as it ships: Apple's is 1.5. */
  wipeShade: 0,
  /** How deep the shadow over the outer half of the open screen's half gets, 0 to 1. None as it ships: Apple's is 1. */
  farShade: 0,
  /** How much noise WebGL2 adds to a shade it draws, in steps of a screen's 256, so a dark, slow one shows no bands. */
  grain: 1,
} satisfies Record<string, number>;

export type LookKey = keyof typeof TUNE_DEFAULTS;

/** The numbers as they are now. Read where a fold is drawn, never copied. */
export const tune: Record<LookKey, number> = { ...TUNE_DEFAULTS };
