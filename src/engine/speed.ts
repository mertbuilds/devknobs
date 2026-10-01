import type { SpeedValue } from "../types";
import { collect, isOwn, onDocumentTimeline, shadowRoots } from "./animations";

/** How often the sweep looks again for shadow roots that came or went, in ms. */
const ROOT_INTERVAL = 500;

/** The one part of GSAP the knob drives: the root timeline everything plays on. */
interface GsapTimeline {
  timeScale(value?: number): unknown;
}

type Animate = Element["animate"];

let rate = 1;
/** Every animation on the knob's rate, with the rate it had before. */
const originals = new Map<Animation, number>();
let roots: ShadowRoot[] = [];
let lastWalk = 0;
let frame = 0;
let listening = false;
let nativeAnimate: Animate | null = null;
let patchedAnimate: Animate | null = null;
/** GSAP's own time scale, while the knob drives it. */
let gsapScale: number | null = null;
let gsapRate = 1;

function setRate(animation: Animation, value: number): void {
  // `updatePlaybackRate` keeps the animation where it is instead of jumping.
  if (typeof animation.updatePlaybackRate === "function") animation.updatePlaybackRate(value);
  else animation.playbackRate = value;
}

/** Put an animation on the knob's rate, once, remembering the rate it had. */
function adopt(animation: Animation): void {
  if (originals.has(animation) || !onDocumentTimeline(animation)) return;
  const original = animation.playbackRate;
  originals.set(animation, original);
  setRate(animation, original * rate);
}

/** Give the animations the page no longer has their own rate back, and let them go. */
function prune(current: Set<Animation>): void {
  for (const [animation, original] of originals) {
    if (current.has(animation)) continue;
    setRate(animation, original);
    originals.delete(animation);
  }
}

/** GSAP's root timeline, when the page has GSAP on `window`. */
function gsapTimeline(): GsapTimeline | null {
  const gsap = (window as unknown as { gsap?: { globalTimeline?: GsapTimeline } }).gsap;
  return gsap?.globalTimeline ?? null;
}

function syncGsap(): void {
  const timeline = gsapTimeline();
  if (!timeline) return;
  if (gsapScale === null) {
    const scale = Number(timeline.timeScale());
    gsapScale = Number.isFinite(scale) ? scale : 1;
  }
  if (gsapRate === rate) return;
  timeline.timeScale(gsapScale * rate);
  gsapRate = rate;
}

function restoreGsap(): void {
  const timeline = gsapTimeline();
  if (timeline && gsapScale !== null) timeline.timeScale(gsapScale);
  gsapScale = null;
  gsapRate = 1;
}

/**
 * Find the animations the listeners missed: CSS ones in shadow roots, ones
 * built with `new Animation()`, ones that wait out a delay before they fire
 * `animationstart`. A full pass also looks for new shadow roots and drops the
 * animations the page is done with.
 */
function sweep(full: boolean): void {
  if (full) roots = shadowRoots();
  const animations = collect(roots);
  for (const animation of animations) adopt(animation);
  if (full) prune(new Set(animations));
  syncGsap();
}

function tick(now: number): void {
  frame = requestAnimationFrame(tick);
  const full = now - lastWalk >= ROOT_INTERVAL;
  if (full) lastWalk = now;
  sweep(full);
}

/** A CSS animation or transition just started: take it, and its pseudo-elements'. */
function onStart(event: AnimationEvent | TransitionEvent): void {
  const target = event.target;
  if (!(target instanceof Element) || isOwn(target)) return;
  for (const animation of target.getAnimations({ subtree: event.pseudoElement !== "" })) {
    adopt(animation);
  }
}

/** Catch script animations the moment they are made, before their first frame. */
function patchAnimate(): void {
  if (patchedAnimate) return;
  const native = Element.prototype.animate;
  nativeAnimate = native;
  patchedAnimate = function animate(this: Element, ...args: Parameters<Animate>): Animation {
    const animation = native.apply(this, args);
    if (rate !== 1 && !isOwn(this)) adopt(animation);
    return animation;
  };
  Element.prototype.animate = patchedAnimate;
}

function restoreAnimate(): void {
  // A wrapper someone put over this one stays, and this one goes quiet at rate 1.
  if (nativeAnimate && Element.prototype.animate === patchedAnimate) {
    Element.prototype.animate = nativeAnimate;
  }
  nativeAnimate = null;
  patchedAnimate = null;
}

/**
 * Play every animation at `value` times its own rate, the way the DevTools
 * Animations panel does. Scroll-driven animations keep following the scroll.
 */
export function apply(value: SpeedValue): void {
  const next = Number.isFinite(value) && value >= 0 ? value : 1;
  if (next === 1) {
    reset();
    return;
  }
  if (next === rate && frame) return;
  rate = next;
  for (const [animation, original] of originals) setRate(animation, original * rate);
  patchAnimate();
  if (!listening) {
    window.addEventListener("animationstart", onStart, true);
    window.addEventListener("transitionrun", onStart, true);
    listening = true;
  }
  lastWalk = performance.now();
  sweep(true);
  if (!frame) frame = requestAnimationFrame(tick);
}

/** Back to normal speed: every rate the knob changed goes back to what it was. */
export function reset(): void {
  rate = 1;
  if (frame) {
    cancelAnimationFrame(frame);
    frame = 0;
  }
  if (listening) {
    window.removeEventListener("animationstart", onStart, true);
    window.removeEventListener("transitionrun", onStart, true);
    listening = false;
  }
  restoreAnimate();
  for (const [animation, original] of originals) setRate(animation, original);
  originals.clear();
  roots = [];
  restoreGsap();
}
