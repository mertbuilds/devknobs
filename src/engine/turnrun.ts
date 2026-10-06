import { blurOf, unblurAt } from "./fold";
import type { Rect } from "./mock";
import { coverAt, MORPH_TIME, type Pose, poseAt, poseOf, poseTransform, turnedPose } from "./morph";
import type { ViewportValue } from "./width";

/**
 * Turns a device in view, case and page as one, and blurs the page on its
 * screen while it is laid out the other way, as a fold does too. What it needs
 * of the frame comes in a `TurnScene`, so it holds no node of its own.
 */

/**
 * What a device turning moves: the element that holds the case and the
 * screen, its top left in the letterbox and the scale it is drawn at there,
 * where the screen stood as the turn started, the cover over its page, and
 * how many of the cover's px are a css px of the screen.
 */
export interface Spin {
  unit: HTMLElement;
  corner: { x: number; y: number };
  base: number;
  start: Rect;
  cover: HTMLElement;
  blur: number;
}

/** What a device turning asks of the frame, as it starts. */
export interface TurnScene {
  /** The element that holds the case and the screen. */
  unit: HTMLElement;
  /** The mat around the frame, which the turn is measured in. */
  letterbox: HTMLElement;
  /** Holds the page and the bars, which the cover goes over. */
  glass: HTMLElement;
  /** The frame the page is in. */
  frame: HTMLIFrameElement;
  /** Blurs the page on the screen while it is laid out the other way. */
  cover: HTMLElement;
  /** The scale the unit is drawn at. */
  base: number;
  /** The page's color. */
  background(): string;
  /** Where the screen is drawn now, in the letterbox. */
  screenRect(): Rect;
}

/** A device turning on its way: how it stands now, and what draws it the way it ends up. */
let spin: { spin: Spin; pose: Pose; frame: number; done: () => void } | null = null;
/**
 * The cover that blurs the page on the screen of a device that turns or
 * folds, how far it has blurred it, and how many of its px are a css px of
 * the screen.
 */
let cover: { node: HTMLElement; share: number; frame: number; blur: number } | null = null;
/** The knobs a device turning draws once it is the other way up. */
let turned: ViewportValue | null = null;

/** Is a device turning? */
export function turning(): boolean {
  return spin !== null;
}

/** Stand the device at `pose`. */
function stand(turn: Spin, pose: Pose): void {
  turn.unit.style.transform = poseTransform(turn.start, pose, turn.corner, turn.base);
}

/** How many of the cover's px, in the screen, are a css px of the page: the frame's zoom. */
export function zoomOf(scene: TurnScene): number {
  return Number.parseFloat(scene.frame.style.zoom) || 1;
}

/** How far the cover has blurred the page now, 0 to 1. */
export function coverShare(): number {
  return cover?.share ?? 0;
}

/** Blur the page under the cover `share` of the way. */
function paint(node: HTMLElement, share: number, blur: number): void {
  const filter = blurOf(share, blur);
  node.style.backdropFilter = filter;
  node.style.setProperty("-webkit-backdrop-filter", filter);
  node.hidden = share <= 0;
}

/**
 * Blur the page under the cover `share` of the way, `blur` of its px to a css
 * px of the screen, and stop it where it was going.
 */
export function coverTo(node: HTMLElement, share: number, blur = 1): void {
  if (cover) window.cancelAnimationFrame(cover.frame);
  cover = share > 0 ? { node, share, frame: 0, blur } : null;
  paint(node, share, blur);
}

/**
 * Let the page laid out the other way sharpen, once the page in the frame has
 * had two frames to lay itself out at its new size.
 */
export function uncover(): void {
  const lifting = cover;
  if (!lifting) return;
  const from = lifting.share;
  let begin: number | null = null;
  let wait = 2;
  const step = (now: number) => {
    if (wait > 0) {
      wait--;
      lifting.frame = window.requestAnimationFrame(step);
      return;
    }
    begin ??= now;
    const elapsed = now - begin;
    const share = unblurAt(from, elapsed);
    if (elapsed >= MORPH_TIME.uncover) {
      coverTo(lifting.node, 0);
      return;
    }
    lifting.share = share;
    paint(lifting.node, share, lifting.blur);
    lifting.frame = window.requestAnimationFrame(step);
  };
  lifting.frame = window.requestAnimationFrame(step);
}

/**
 * Turn the device to `to` a frame at a time, from where a turn on its way got
 * to, or from where it stands, in view all along. In its last part the page
 * blurs, `done` draws the device the way it ends up, in the same frame as the
 * turn's last, and the page laid out the other way sharpens. A turn back to
 * the way the page is laid out sharpens it as it goes. A quarter turn takes
 * the whole time.
 */
export function turnTo(turn: Spin, to: Pose, done: () => void): void {
  const from = spin?.pose ?? poseOf(turn.start);
  if (spin) window.cancelAnimationFrame(spin.frame);
  const time = (MORPH_TIME.turn * Math.abs(to.angle - from.angle)) / 90;
  const over = cover?.share ?? 0;
  const across = to.angle === 0 ? 0 : 1;
  coverTo(turn.cover, over, turn.blur);
  const going = { spin: turn, pose: from, frame: 0, done };
  spin = going;
  let begin: number | null = null;
  const step = (now: number) => {
    begin ??= now;
    const elapsed = now - begin;
    going.pose = poseAt(from, to, elapsed, time);
    stand(turn, going.pose);
    coverTo(turn.cover, coverAt(over, across, elapsed, time), turn.blur);
    if (elapsed < time) {
      going.frame = window.requestAnimationFrame(step);
      return;
    }
    spin = null;
    done();
    uncover();
  };
  going.frame = window.requestAnimationFrame(step);
}

/**
 * Turn the device a quarter by `angle` onto the screen at `to`, in view all
 * along, case and page as one, and `draw` the knobs once it is there. A turn
 * back while it turns goes back from where it got to. Without a scene or a
 * place to go, the knobs are drawn at once.
 */
export function turnDevice(
  value: ViewportValue,
  angle: number,
  to: Rect | null,
  scene: TurnScene | null,
  draw: (value: ViewportValue) => void,
): void {
  turned = value;
  const done = () => {
    const next = turned;
    turned = null;
    if (next) draw(next);
  };
  const going = spin?.spin;
  if (going) {
    turnTo(going, to ? turnedPose(going.start, to, angle) : poseOf(going.start), done);
    return;
  }
  if (!scene || !to) {
    done();
    return;
  }
  const box = scene.letterbox.getBoundingClientRect();
  const unit = scene.unit.getBoundingClientRect();
  const start = scene.screenRect();
  const corner = { x: unit.left - box.left, y: unit.top - box.top };
  scene.cover.style.background = "";
  // Over the bars too, which are laid out the other way as well.
  scene.glass.append(scene.cover);
  const turn = { unit: scene.unit, corner, base: scene.base, start, cover: scene.cover, blur: zoomOf(scene) };
  turnTo(turn, turnedPose(start, to, angle), done);
}

/** The turn goes on, and the frame takes these knobs once it is there. */
export function holdTurn(value: ViewportValue): void {
  turned = value;
}

/** Land a device turning where it goes, at once, the page sharp. */
export function finishTurn(): void {
  const last = spin;
  spin = null;
  if (last) window.cancelAnimationFrame(last.frame);
  if (cover) coverTo(cover.node, 0);
  last?.done();
}

/** Stop a device turning where it is, the page sharp. */
export function stopTurn(): void {
  if (spin) window.cancelAnimationFrame(spin.frame);
  spin = null;
  if (cover) coverTo(cover.node, 0);
}

/** The frame is gone, and the knobs a turn would draw with it. */
export function forgetTurn(): void {
  turned = null;
}
