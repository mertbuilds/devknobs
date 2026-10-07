import type { MatColorValue } from "../types";
import { folding } from "./foldrun";
import type { Point } from "./mat";
import type { Rect } from "./mock";
import { type Curve, ease } from "./morph";
import { running, still } from "./morphrun";
import { slowed, slowness } from "./slow";
import { turning } from "./turnrun";

/**
 * A new mat color splashes out from behind the device: a layer of the mat in
 * the new color over the old, revealed by a blob that grows from the middle of
 * the screen until it covers the letterbox, then the new color is the mat's
 * own and the layer goes. Each blob is drawn from its own seed, so no two
 * splashes look the same.
 */

/** How long a splash takes to cover the letterbox, in ms. */
export const SPLASH_TIME = 1200;

/** How a splash grows: a gentle ease-out, so the long splash reads as a slow spread, not a burst and a tail. */
const SPLASH_CURVE: Curve = [0.25, 0.6, 0.3, 1];

/** How far past the farthest corner of the letterbox a splash ends, in px. */
const MARGIN = 24;

/** How many points the rim of the blob and of a drop is drawn through. */
const RIM = 48;
const DROP_RIM = 20;

/**
 * How far a smooth curve through the rim's points may fall inside the points,
 * as a share of the radius, which the end radius leaves room for.
 */
const SLACK = 0.03;

/** One wave on a rim: how many times it goes round, how far out it reaches as a share of the radius, where it starts, and how far it drifts by the end, in radians. */
export interface Wave {
  k: number;
  amp: number;
  phase: number;
  drift: number;
}

/**
 * A smaller blob that flies out ahead of the main one and is swallowed by it:
 * the direction it flies in, how far out it starts and ends as a share of the
 * main radius, its own size as a share, and its own rim.
 */
export interface Drop {
  angle: number;
  from: number;
  to: number;
  size: number;
  waves: Wave[];
}

/** The shape of one splash: the main blob's rim and its drops. */
export interface Splash {
  waves: Wave[];
  drops: Drop[];
}

/** Where a splash starts and how big its main blob is at the end, in px in the letterbox. */
export interface Plan {
  x: number;
  y: number;
  radius: number;
}

/** A closed curve as cubic segments: each a start, two control points and an end. */
export type Segment = readonly [Point, Point, Point, Point];

/** Numbers from 0 to 1 that only `seed` decides (mulberry32). */
export function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A few waves, each from 2 to 7 times round, the higher ones smaller, at most `most` out in all. */
function wavesOf(random: () => number, count: number, most: number): Wave[] {
  const ks = [2, 3, 4, 5, 6, 7];
  const waves: Wave[] = [];
  for (let i = 0; i < count; i++) {
    const [k = 2] = ks.splice(Math.floor(random() * ks.length), 1);
    waves.push({
      k,
      amp: (0.4 + 0.6 * random()) * (2 / k),
      phase: random() * 2 * Math.PI,
      drift: (random() - 0.5) * 1.6,
    });
  }
  const sum = waves.reduce((total, wave) => total + wave.amp, 0);
  return waves.map((wave) => ({ ...wave, amp: (wave.amp * most) / sum }));
}

/** The shape of a splash from `seed`: a main blob with four waves on its rim, and two to four drops. */
export function splashOf(seed: number): Splash {
  const random = seeded(seed);
  const waves = wavesOf(random, 4, 0.12 + 0.1 * random());
  const count = 2 + Math.floor(random() * 3);
  const drops: Drop[] = [];
  for (let i = 0; i < count; i++) {
    drops.push({
      angle: ((i + random() * 0.7) / count) * 2 * Math.PI,
      from: 1.15 + 0.3 * random(),
      to: 0.35 + 0.2 * random(),
      size: 0.14 + 0.14 * random(),
      waves: wavesOf(random, 2, 0.12),
    });
  }
  return { waves, drops };
}

/** How far in a rim's waves can pull it at most, as a share of the radius. */
function reach(waves: Wave[]): number {
  return waves.reduce((total, wave) => total + wave.amp, 0);
}

/**
 * Where a splash starts, the middle of `screen`, and how big its main blob
 * ends, so that even where its rim dips in it is past every corner of a
 * letterbox `size` px, by `MARGIN`.
 */
export function planOf(splash: Splash, screen: Rect, size: { width: number; height: number }): Plan {
  const x = screen.x + screen.width / 2;
  const y = screen.y + screen.height / 2;
  const far = Math.max(
    Math.hypot(x, y),
    Math.hypot(size.width - x, y),
    Math.hypot(x, size.height - y),
    Math.hypot(size.width - x, size.height - y),
  );
  return { x, y, radius: (far + MARGIN) / (1 - reach(splash.waves) - SLACK) };
}

/** `count` points round a rim of `radius` px about `centre`, its waves `share` of the way through their drift. */
function rim(centre: Point, radius: number, waves: Wave[], share: number, count: number): Point[] {
  const points: Point[] = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * 2 * Math.PI;
    let r = 1;
    for (const wave of waves) r += wave.amp * Math.sin(wave.k * angle + wave.phase + wave.drift * share);
    points.push({ x: centre.x + radius * r * Math.cos(angle), y: centre.y + radius * r * Math.sin(angle) });
  }
  return points;
}

/** A smooth closed curve through `points`, as a Catmull-Rom spline in cubic segments. */
export function segments(points: Point[]): Segment[] {
  const n = points.length;
  const at = (i: number): Point => points[(i + n) % n] ?? { x: 0, y: 0 };
  const out: Segment[] = [];
  for (let i = 0; i < n; i++) {
    const [a, b, c, d] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    out.push([
      b,
      { x: b.x + (c.x - a.x) / 6, y: b.y + (c.y - a.y) / 6 },
      { x: c.x - (d.x - b.x) / 6, y: c.y - (d.y - b.y) / 6 },
      c,
    ]);
  }
  return out;
}

/**
 * The rims of a splash `time` of the way through, 0 to 1: the main blob first,
 * grown on the splash's curve, then its drops, which fly out ahead of it and fall
 * back into it as it catches up. All go round the same way, so they add up.
 */
export function rimsAt(splash: Splash, plan: Plan, time: number): Point[][] {
  const t = Math.min(1, Math.max(0, time));
  const radius = plan.radius * ease(SPLASH_CURVE, t);
  const centre = { x: plan.x, y: plan.y };
  const rims = [rim(centre, radius, splash.waves, t, RIM)];
  for (const drop of splash.drops) {
    const out = radius * (drop.from + (drop.to - drop.from) * t);
    const at = { x: plan.x + out * Math.cos(drop.angle), y: plan.y + out * Math.sin(drop.angle) };
    rims.push(rim(at, radius * drop.size, drop.waves, t, DROP_RIM));
  }
  return rims;
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

/** The rims as css path data, each a closed smooth curve. */
export function pathOf(rims: Point[][]): string {
  return rims
    .map((points) => {
      const curve = segments(points);
      const [first] = curve;
      if (!first) return "";
      const start = `M${round(first[0].x)} ${round(first[0].y)}`;
      const rest = curve.map(
        ([, c1, c2, end]) =>
          `C${round(c1.x)} ${round(c1.y)} ${round(c2.x)} ${round(c2.y)} ${round(end.x)} ${round(end.y)}`,
      );
      return `${start}${rest.join("")}Z`;
    })
    .join("");
}

/** What a splash needs of the frame: the mat's paint and its lines, and where the screen is. */
export interface MatScene {
  letterbox: HTMLElement;
  back: HTMLElement;
  paper: SVGSVGElement | null;
  screen: () => Rect;
}

interface Layer {
  node: HTMLElement;
  mat: string;
  splash: Splash;
  plan: Plan;
  begun: number | null;
}

/** The splashes on their way, oldest first, each over the one before. */
let layers: Layer[] = [];
/** The mat's paint, held at the color the splashes started from. */
let base: HTMLElement | null = null;
let frame = 0;
let slow = 1;
let made = 0;

/** A device moves, and its mat's opening is drawn on the mat's paint itself. */
function moving(): boolean {
  return running() || turning() || folding();
}

/** The mat as the splash layer draws it: the lines in its own color, with a grid of its own. */
function paperFor(paper: SVGSVGElement | null): Node | null {
  const copy = paper?.cloneNode(true);
  if (!(copy instanceof Element)) return null;
  const grid = `mat-grid-${++made}`;
  copy.querySelector("pattern")?.setAttribute("id", grid);
  copy.querySelector("rect")?.setAttribute("fill", `url(#${grid})`);
  return copy;
}

/**
 * Give the mat `mat` as its color: at once on the first paint, with less
 * motion, and while a device moves, or else splashed out from the screen.
 */
export function spreadMat(scene: MatScene, mat: MatColorValue): void {
  const from = scene.letterbox.getAttribute("data-mat");
  if (from === mat) return;
  scene.letterbox.setAttribute("data-mat", mat);
  if (!from || still() || moving()) {
    landSplash();
    return;
  }
  if (!base) {
    base = scene.back;
    base.setAttribute("data-mat", from);
    slow = slowness();
  }
  const node = document.createElement("div");
  node.className = "splash";
  node.setAttribute("data-mat", mat);
  node.style.clipPath = "inset(50%)";
  const paper = paperFor(scene.paper);
  if (paper) node.append(paper);
  (layers.at(-1)?.node ?? scene.back).after(node);
  const splash = splashOf(Math.floor(Math.random() * 2 ** 32));
  const size = { width: scene.letterbox.clientWidth, height: scene.letterbox.clientHeight };
  layers.push({ node, mat, splash, plan: planOf(splash, scene.screen(), size), begun: null });
  if (!frame) frame = window.requestAnimationFrame(step);
}

/** Draw each splash a frame on. One that covers the letterbox is the mat's own color now, and every one under it goes. */
function step(now: number): void {
  frame = 0;
  if (moving()) {
    landSplash();
    return;
  }
  let done = -1;
  layers.forEach((layer, i) => {
    layer.begun ??= now;
    const time = slowed(now - layer.begun, slow) / SPLASH_TIME;
    if (time >= 1) done = i;
    else layer.node.style.clipPath = `path("${pathOf(rimsAt(layer.splash, layer.plan, time))}")`;
  });
  const top = layers[done];
  if (top) {
    base?.setAttribute("data-mat", top.mat);
    for (const layer of layers.splice(0, done + 1)) layer.node.remove();
  }
  if (layers.length === 0) {
    landSplash();
    return;
  }
  frame = window.requestAnimationFrame(step);
}

/** Land every splash at once: the mat takes the letterbox's color, and no layer or frame is left. */
export function landSplash(): void {
  if (frame) window.cancelAnimationFrame(frame);
  frame = 0;
  for (const layer of layers) layer.node.remove();
  layers = [];
  base?.removeAttribute("data-mat");
  base = null;
}
