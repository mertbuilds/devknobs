import type { PostureValue } from "../types";
import type { Rect, Sides } from "./mock";
import { type Corners, fitCorners, lerp } from "./morph";

/**
 * A foldable folding open or shut in view, as a book does: the half of the
 * open body on the far side of the hinge from the folded one turns about the
 * hinge toward the viewer, the open screen on its inside and the folded body
 * on its outside, while the other half stays. Measured from Apple's own fold
 * of the iPhone Duo, which drives everything from how far open the hinge is,
 * 0 shut to 1 open: the turn, and the light and blur of the screens, which
 * are Apple's own "Wipe" shader's, written out below. The fold is drawn in the open screen's css px, from the
 * open body's top left, and the whole of it moves from where the folded body
 * is drawn to where the open one is as it opens. Everything here is pure: the
 * frame draws it.
 */

/**
 * The hinge is a spring, stepped 60 times a second: Apple's of 0.75 s with a
 * bounce of 0.15, whose stiffness and damping follow from those, of mass 1.
 * Within `reach` of shut or open a magnet takes over, `pull` strong, and
 * snaps it there, so it never goes past.
 */
export const HINGE = {
  stiffness: (2 * Math.PI / 0.75) ** 2,
  damping: ((1 - 0.15) * 4 * Math.PI) / 0.75,
  step: 1 / 60,
  reach: 0.08,
  pull: { shut: 30, open: 20 },
} as const;

/** How long one step of the hinge is, in ms. */
export const HINGE_STEP = HINGE.step * 1000;

/** How far open the hinge is, 0 shut to 1 open, and how fast it moves, in openings a second. */
export interface Hinge {
  position: number;
  velocity: number;
}

/** How far open a posture leaves the hinge. */
export function openOf(posture: PostureValue): number {
  return posture === "open" ? 1 : 0;
}

/** The hinge a step on toward `target`, shut or open. */
export function hingeStep(hinge: Hinge, target: number): Hinge {
  const { position, velocity } = hinge;
  const dt = HINGE.step;
  const away = position - target;
  if (away === 0) return { position, velocity: 0 };
  const off = Math.abs(away);
  if (off > HINGE.reach) {
    const pushed = velocity + (-HINGE.stiffness * away - HINGE.damping * velocity) * dt;
    return { position: position + pushed * dt, velocity: pushed };
  }
  // The magnet keeps the speed, turned toward where it pulls, and pulls the harder the nearer.
  const toward = -Math.sign(away);
  const near = (HINGE.reach * HINGE.reach) / 10;
  const pull = target === 1 ? HINGE.pull.open : HINGE.pull.shut;
  const pulled = Math.abs(velocity) * toward + toward * pull * (near / (off * off)) * dt;
  const next = position + pulled * dt;
  const past = Math.sign(next - target) !== Math.sign(away);
  return past ? { position: target, velocity: 0 } : { position: next, velocity: pulled };
}

/** The hinge `steps` steps on toward `target`. */
export function hingeAfter(hinge: Hinge, target: number, steps: number): Hinge {
  let at = hinge;
  for (let step = 0; step < steps && !hingeStill(at, target); step++) at = hingeStep(at, target);
  return at;
}

/** Has the hinge got to `target` and stopped there? */
export function hingeStill(hinge: Hinge, target: number): boolean {
  return hinge.position === target && hinge.velocity === 0;
}

/** How far away the fold is seen from, in widths of the open screen. */
const DEPTH = 2.75;

/**
 * Over how much of the way the half that turns, a picture of the page, hands
 * the screen over to the page itself, laid out as it ends up.
 */
export const HAND_OVER = 0.08;

/** A point, in css px. */
export interface Point {
  x: number;
  y: number;
}

/** One posture's side of a fold. */
export interface FoldSide {
  /** The room the body takes around the screen and its size, or null where none is drawn. */
  body: { width: number; height: number; inset: Sides } | null;
  /** The screen's css size. */
  size: { width: number; height: number };
  /** Where the screen is drawn in the letterbox. */
  screen: Rect;
}

/** Where the fold is drawn in the letterbox: its top left, and its scale. */
export interface Place {
  x: number;
  y: number;
  scale: number;
}

/** A fold laid out, in the open screen's css px from the open body's top left. */
export interface FoldLayout {
  /** The hinge runs up and down the open screen, held across, else along it. */
  across: boolean;
  /** The open body's size. */
  open: { width: number; height: number };
  /** Where the folded body lies on the open one once shut. */
  shut: Rect;
  /** The hinge's line: x held across, else y. */
  hinge: number;
  /** What the half that turns keeps of the open body, a px past the hinge. */
  clip: string;
  /** The point each side of the turning half turns about: the hinge, in the middle of the screens. */
  origins: { inner: string; outer: string };
  /** The same points, in each side's own css px. */
  pivots: { inner: Point; outer: Point };
  /** The fold shut, and open. */
  folded: Place;
  unfolded: Place;
  /** The perspective, in px. */
  depth: number;
}

function num(value: number): number {
  return Math.round(value * 100) / 100;
}

/** A share of light or blur, to a thousandth. */
function fine(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** The body of a side, or the bare screen where none is drawn. */
function boxOf(side: FoldSide): { width: number; height: number; inset: Sides } {
  return side.body ?? { ...side.size, inset: { top: 0, right: 0, bottom: 0, left: 0 } };
}

/** Where a side's body is drawn: its top left in the letterbox, at the scale its screen is. */
function placeOf(side: FoldSide): Place {
  const { inset } = boxOf(side);
  const scale = side.size.width > 0 ? side.screen.width / side.size.width : 1;
  return { x: side.screen.x - inset.left * scale, y: side.screen.y - inset.top * scale, scale };
}

/**
 * Lay a fold out between a foldable's folded and open sides. The hinge runs
 * through the middle of the open screen. Folded upright, the hinge is on the
 * body's left, so held across open, the folded body lies right of it, and
 * held upright open, as it is turned a quarter anticlockwise, above it. The
 * screens' middles line up along the hinge.
 */
export function foldLayout(closed: FoldSide, open: FoldSide, across: boolean): FoldLayout {
  const shutBox = boxOf(closed);
  const openBox = boxOf(open);
  const middle = {
    x: openBox.inset.left + open.size.width / 2,
    y: openBox.inset.top + open.size.height / 2,
  };
  const shutMiddle = {
    x: shutBox.inset.left + closed.size.width / 2,
    y: shutBox.inset.top + closed.size.height / 2,
  };
  const { width, height } = openBox;
  const shut = across
    ? { x: middle.x, y: middle.y - shutMiddle.y, width: shutBox.width, height: shutBox.height }
    : {
        x: middle.x - shutMiddle.x,
        y: middle.y - shutBox.height,
        width: shutBox.width,
        height: shutBox.height,
      };
  const at = placeOf(closed);
  const pivots = {
    inner: middle,
    outer: across ? { x: 0, y: shutMiddle.y } : { x: shutMiddle.x, y: shutBox.height },
  };
  return {
    across,
    open: { width, height },
    shut,
    hinge: across ? middle.x : middle.y,
    clip: across ? `inset(0 ${num(width - middle.x - 1)}px 0 0)` : `inset(${num(middle.y - 1)}px 0 0 0)`,
    origins: {
      inner: `${num(pivots.inner.x)}px ${num(pivots.inner.y)}px`,
      outer: `${num(pivots.outer.x)}px ${num(pivots.outer.y)}px`,
    },
    pivots,
    folded: { x: at.x - shut.x * at.scale, y: at.y - shut.y * at.scale, scale: at.scale },
    unfolded: placeOf(open),
    depth: DEPTH * (across ? open.size.width : open.size.height),
  };
}

/** How a fold is drawn with its hinge `open` of the way open. */
export interface FoldFrame {
  /** Where the fold is in the letterbox, on its way from where it is drawn shut to where open. */
  place: Place;
  /** The turning half's inside, the open screen's, while it faces the viewer, as a transform. */
  inner: string | null;
  /** Its outside, the folded body, while that faces the viewer. */
  outer: string | null;
  /** How far the turning half stands off the screen, 0 flat to 1 square to it. */
  lift: number;
  /** How far the side that faces the viewer is turned, in degrees. */
  degrees: number;
}

/** How a fold laid out as `layout` is drawn with its hinge `open` of the way open. */
export function foldFrame(layout: FoldLayout, open: number): FoldFrame {
  const angle = 180 * (1 - open);
  const { folded, unfolded } = layout;
  const turn = layout.across ? "rotateY" : "rotateX";
  const view = `perspective(${num(layout.depth)}px)`;
  const leaf = (degrees: number) => `${view} ${turn}(${num(degrees)}deg)`;
  return {
    place: {
      x: lerp(folded.x, unfolded.x, open),
      y: lerp(folded.y, unfolded.y, open),
      scale: lerp(folded.scale, unfolded.scale, open),
    },
    inner: angle < 90 ? leaf(angle) : null,
    outer: angle < 90 ? null : leaf(angle - 180),
    lift: num(Math.sin((angle * Math.PI) / 180)),
    degrees: num(angle < 90 ? angle : angle - 180),
  };
}

/**
 * Where a point of the turning half, in its own css px, is seen with it
 * turned `degrees` about `pivot` as `foldFrame` turns it: about the hinge
 * running up and down, held `across`, else along, from `depth` px away.
 */
export function seenAt(point: Point, pivot: Point, degrees: number, across: boolean, depth: number): Point {
  const angle = (degrees * Math.PI) / 180;
  const x = point.x - pivot.x;
  const y = point.y - pivot.y;
  // How far it comes toward the viewer, and how much bigger that makes it.
  const near = across ? -x * Math.sin(angle) : y * Math.sin(angle);
  const grow = 1 / (1 - near / depth);
  return across
    ? { x: pivot.x + x * Math.cos(angle) * grow, y: pivot.y + y * grow }
    : { x: pivot.x + x * grow, y: pivot.y + y * Math.cos(angle) * grow };
}

/** How far along its tangents a cubic's handles sit to draw a quarter circle, in radii. */
const KAPPA = 0.5523;

/**
 * The outline of a rect with its corners rounded by `radii`, from the top left
 * round by the right, as css path data, each point put where `seen` puts it:
 * its sides as lines, and each corner as a quarter circle's cubic through its
 * handles, so it stays as round as a border radius in perspective.
 */
export function roundedPath(rect: Rect, radii: Corners, seen: (point: Point) => Point): string {
  const { x, y, width, height } = rect;
  const [a, b, c, d] = fitCorners(rect, radii);
  const at = (px: number, py: number) => {
    const point = seen({ x: px, y: py });
    return `${num(point.x)} ${num(point.y)}`;
  };
  // A corner from where it leaves one side, by its two handles, to where it meets the next.
  const corner = (radius: number, from: Point, to: Point, tip: Point) => {
    if (radius <= 0) return `L${at(tip.x, tip.y)}`;
    const handle = (end: Point) => at(end.x + (tip.x - end.x) * KAPPA, end.y + (tip.y - end.y) * KAPPA);
    return `L${at(from.x, from.y)}C${handle(from)} ${handle(to)} ${at(to.x, to.y)}`;
  };
  const right = x + width;
  const bottom = y + height;
  return [
    `M${at(x + a, y)}`,
    corner(b, { x: right - b, y }, { x: right, y: y + b }, { x: right, y }),
    corner(c, { x: right, y: bottom - c }, { x: right - c, y: bottom }, { x: right, y: bottom }),
    corner(d, { x: x + d, y: bottom }, { x, y: bottom - d }, { x, y: bottom }),
    corner(a, { x, y: y + a }, { x: x + a, y }, { x, y }),
    "Z",
  ].join("");
}

/**
 * Apple's "Wipe" shader lights each screen of the fold, as the hinge sets it.
 * Across the screen, from 0 to 1 the way its texture runs, light falls off
 * with the distance from the wipe's line, `at`: from the open screen's far
 * side, so the half that stays is lit all over and the half that turns
 * darkens toward its free edge, and from the folded screen's hinge, so it
 * darkens toward its free edge too. Before the screen is drawn its picture is
 * blurred twice, each time the more the further it is from the line past
 * `blur`, out to a mip level 8 times `blurArea`, and darkened where it is
 * blurred most. The picture itself lies flat behind the glass, so a half that
 * turns is a window onto it: what it shows does not turn with it, and past
 * the picture's edge, where the half comes nearer than the screen it stood
 * in, it is dark, a wedge at each end that grows toward the free edge.
 */
export const WIPE = {
  /** The open screen: Apple's inner texture, 2853 px across, the wipe's line on the side that stays. */
  inner: { at: 1, shade: [0.5, 1], blur: [0.45, 1], texture: 2853 },
  /** The folded body's screen: its texture as wide as its opening in Apple's picture of it. */
  cover: { at: 0, shade: [0, 1], blur: [0, 0.9], texture: 1398 },
} as const;

/** Which of the turning half's screens: the open screen's half, or the folded body's whole. */
export type Pane = keyof typeof WIPE;

/** Apple shows the middle of each texture, 1.12 times smaller than the whole. */
export const FRAMING = 1.12;

/** The blur's most, as a mip level, at a `blurArea` of 1. */
const MAX_BLUR = 8;

/** The screen's light is worked out unlit by the display: shown, it goes through this gamma. */
const GAMMA = 2.2;

function smoothstep(from: number, to: number, value: number): number {
  const t = clamp((value - from) / (to - from));
  return t * t * (3 - 2 * t);
}

/** How strong the wipe is on a screen, 0 to 1, with the hinge `open` of the way open, as Apple's uniforms record it. */
export function wipeAmount(pane: Pane, open: number): number {
  return pane === "inner" ? clamp(1.2 * (1 - open)) : clamp(1 - 2 * Math.abs(open - 0.5)) / 2;
}

/**
 * How bright the open screen is set, 0 to 1: 0.15 shut, a quarter a third of
 * the way open, then evenly up to all of it, as recorded. The folded screen's
 * stays 1.
 */
export function brightness(pane: Pane, open: number): number {
  if (pane === "cover") return 1;
  return open < 1 / 3 ? 0.15 + 0.3 * open : 0.25 + 1.125 * (open - 1 / 3);
}

/** Where a point `t` of the way from the hinge to the free edge of the half that turns is, across its texture. */
export function uvOf(pane: Pane, t: number): number {
  return pane === "inner" ? 0.5 - t / 2 : t;
}

/** How much light the wipe leaves at `uv`, 0 to 1. */
export function wipeLight(pane: Pane, uv: number, amount: number): number {
  const { at, shade } = WIPE[pane];
  return 1 - clamp(smoothstep(shade[0], shade[1], Math.abs(uv - at)) * amount * 1.5);
}

/** Apple's `blurArea` at `uv` before it is held to its range, which runs evenly along the half. */
function rawArea(pane: Pane, uv: number, amount: number): number {
  const { at, blur } = WIPE[pane];
  return (((Math.abs(uv - at) - blur[0]) / (blur[1] - blur[0])) * amount * 2.5) / 0.75;
}

/** How blurred the picture is at `uv`: Apple's `blurArea`, 0 to 4/3, a mip level 8 times it. */
export function blurArea(pane: Pane, uv: number, amount: number): number {
  return Math.min(4 / 3, Math.max(0, rawArea(pane, uv, amount)));
}

/** How much light each of the two blurs leaves where it blurs `area`, both of them together. */
export function blurLight(area: number): number {
  return smoothstep(1.3, 0.9, area) ** 2;
}

/**
 * The extra shadow of the open screen's far side, which deepens as the wipe
 * does, over the outer half of the half that turns. The folded screen has none.
 */
export function edgeLight(pane: Pane, uv: number, amount: number): number {
  if (pane === "cover") return 1;
  return lerp(1, smoothstep(0.05, 0.5, uv), smoothstep(0, 0.55, amount));
}

/** How wide a blur of `area` is, as a share of the screen across the hinge: its mip level's texels, twice over. */
export function blurWidth(pane: Pane, area: number): number {
  return (Math.SQRT2 * 2 ** (MAX_BLUR * area) * FRAMING) / WIPE[pane].texture;
}

/** How light a shown screen is, 0 to 1, for a light of `light` as Apple's shader works it out. */
export function shown(light: number): number {
  return clamp(light) ** (1 / GAMMA);
}

/**
 * How much of the screen, at each end along the hinge, the picture darkens
 * toward its edge over as the half stands, so the dark past it comes on
 * softly: as much as Apple's texture goes past what the screen shows of it.
 */
export const RIM = (FRAMING - 1) / 2;

/** How dim the screen the frame draws is, 0 to 1, with the hinge `open` of the way open: the half that stays, or the folded screen. */
export function screenDim(pane: Pane, open: number): number {
  return fine(1 - shown(smoothstep(0.1, 1, brightness(pane, open))));
}

/** How many points along the half that turns its shades are worked out at, hinge to free edge. */
const STEPS = 8;

/** A blurrier picture fading in, `from` to `to` of the way from the hinge to the free edge, up to `most` of it. */
export interface BlurFade {
  from: number;
  to: number;
  most: number;
}

/** How the half that turns is lit and blurred. */
export interface PaneLook {
  /** How dark the half is as it turns, at `STEPS + 1` points from the hinge to the free edge: the screen's light and the wipe. */
  turned: number[];
  /** How dark the picture is at the same points of it as it lies flat: its blurs' dark and the far side's shadow. */
  flat: number[];
  /** Where each blurrier picture fades in, or null where it does not show. */
  blurs: (BlurFade | null)[];
}

/**
 * The blurrier pictures of the page, by how wide their blur is in css px.
 * Each fades in over the one before as the blur goes from that one's to its
 * own, the sharp one's counted as `BLURS[0]`.
 */
export const BLURS = [2, 8, 32, 128] as const;

/**
 * How the half that turns, of `pane`, looks with the hinge `open` of the way
 * open, its screen `extent` css px across the hinge.
 */
export function paneLook(pane: Pane, open: number, extent: number): PaneLook {
  const amount = wipeAmount(pane, open);
  const light = smoothstep(0.1, 1, brightness(pane, open));
  const points = Array.from({ length: STEPS + 1 }, (_, step) => uvOf(pane, step / STEPS));
  const turned = points.map((uv) => fine(1 - shown(light * wipeLight(pane, uv, amount))));
  const flat = points.map((uv) =>
    fine(1 - shown(blurLight(blurArea(pane, uv, amount)) * edgeLight(pane, uv, amount))),
  );
  // The blur's width doubles for each eighth of the area, and the area grows evenly along the half.
  const start = rawArea(pane, uvOf(pane, 0), amount);
  const slope = rawArea(pane, uvOf(pane, 1), amount) - start;
  const top = Math.min(start + slope, 4 / 3);
  const areaFor = (width: number) =>
    Math.log2((width * WIPE[pane].texture) / (extent * Math.SQRT2 * FRAMING)) / MAX_BLUR;
  const blurs = BLURS.slice(1).map((width, index) => {
    const low = areaFor(BLURS[index] ?? 0);
    const high = areaFor(width);
    if (slope <= 0 || top <= low) return null;
    // From where the blur is the last picture's to where it is this one's, or as far as it gets.
    const reach = Math.min(high, top);
    const along = (area: number) => (area - start) / slope;
    return { from: fine(along(low)), to: fine(along(reach)), most: fine((reach - low) / (high - low)) };
  });
  return { turned, flat, blurs };
}

/**
 * How far the page itself has taken over from the picture of it on the half
 * that turns, 0 to 1, with the frame laid out `drawn`: in the last
 * `HAND_OVER` of the way to that posture, where the half lies all but flat.
 */
export function handOver(open: number, drawn: PostureValue): number {
  return fine(clamp(drawn === "open" ? (open - (1 - HAND_OVER)) / HAND_OVER : (HAND_OVER - open) / HAND_OVER));
}
