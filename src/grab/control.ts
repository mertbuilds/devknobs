// adapted from react-grab (MIT, Copyright (c) 2025 Aiden Bai)
import * as engine from "../engine";
import { isDevknobsFrame, needsFrame, post, readMessage } from "../engine/frame";
import { frameWindow } from "../engine/width";
import { typesInField } from "../ui/keys";
import {
  defaultGrabKey,
  type GrabKey,
  grabKeyTypes,
  type Hold,
  type HoldEvent,
  holdDuration,
  holdStep,
  isGrabKey,
  keyMatches,
  pressTurnsOn,
  releasesGrabKey,
} from "./keys";
import type { Mode, ModeOptions } from "./mode";
import { type GrabPlace, grabStep } from "./place";

export interface GrabControlOptions {
  /**
   * The key that grabs as it is now, read on each key so a new one takes at
   * once, or null while there is none, as while the panel records a key.
   * Defaults to shift and g.
   */
  key?: () => GrabKey | null;
}

/** Loads grab's mode, the overlay and the context, the first time grab turns on. */
export type LoadMode = () => Promise<{ startMode: (options: ModeOptions) => Mode }>;

export interface GrabControl {
  isOn(): boolean;
  /** Turn grab on or off, in the frame while it is up. */
  set(on: boolean): void;
  /** Hear grab go on and off. Returns the way to stop. */
  subscribe(listener: (on: boolean) => void): () => void;
  destroy(): void;
}

const MODIFIER_KEYS = new Set(["Meta", "Control", "Shift", "Alt", "AltGraph", "CapsLock"]);

function deepActive(): Element | null {
  let active = document.activeElement;
  while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
  return active;
}

/** Is the key likely a copy: a field has the focus, or text is selected? */
function holdScene(): { input: boolean; selection: boolean } {
  const active = deepActive();
  const field = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement;
  const input = field || (active instanceof HTMLElement && active.isContentEditable);
  let selection = (window.getSelection()?.toString() ?? "") !== "";
  if (field) {
    try {
      selection ||= active.selectionStart !== active.selectionEnd;
    } catch {
      // An input type without a selection.
    }
  }
  return { input, selection };
}

/**
 * The scheme the system really prefers, read in a shadow root of this
 * document, where no knob rewrites the media rules. The frame is told, as
 * its own can be the emulated one, handed down natively.
 */
function systemScheme(): "light" | "dark" {
  const host = document.createElement("div");
  host.setAttribute("data-devknobs", "probe");
  host.style.cssText = "position:fixed;width:0;height:0;overflow:hidden;pointer-events:none";
  const root = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = "i{display:block;width:0}@media (prefers-color-scheme: dark){i{width:1px}}";
  const probe = document.createElement("i");
  root.append(style, probe);
  (document.body ?? document.documentElement).append(host);
  const dark = probe.getBoundingClientRect().width > 0;
  host.remove();
  return dark ? "dark" : "light";
}

/**
 * Grab's switch, in every bundle: the key that turns it on, the panel's
 * view of it, and the way into the width knob's frame. Grab has to run in the
 * page that owns React, so while the frame is up, the page above hands grab
 * to the frame and only shows it as on. The overlay and the context load the
 * first time grab turns on.
 */
export function createGrab(
  options: GrabControlOptions = {},
  loadMode: LoadMode = () => import("./index"),
): GrabControl {
  const keyNow = options.key ?? defaultGrabKey;
  const inFrame = isDevknobsFrame();
  const listeners = new Set<(on: boolean) => void>();
  /** Where grab runs. Only `move` changes it. */
  let place: GrabPlace = "off";
  let mode: Mode | null = null;
  /** Bumped each time grab goes on or off, so a mode that loads late knows it is stale. */
  let turn = 0;
  let hold: Hold | null = null;
  let holdTimer = 0;
  let pointer: { x: number; y: number } | null = null;
  /** The scheme the page above said to draw in. */
  let scheme: "light" | "dark" | undefined;

  function frame(): Window | null {
    return inFrame ? null : frameWindow();
  }

  function startLocal(): void {
    const at = ++turn;
    void loadMode().then(({ startMode }) => {
      if (at !== turn || place !== "here") return;
      mode = startMode({
        pointer,
        scheme,
        heldKey: (event) => {
          const key = keyNow();
          return key !== null && keyMatches(event, key.key);
        },
        onExit: () => {
          mode = null;
          move("off");
        },
      });
    });
  }

  function stopLocal(): void {
    turn++;
    mode?.stop();
    mode = null;
  }

  /**
   * The one way grab goes on, off, or over to the frame. A mode here, with its
   * box and glow, never outlives grab being here.
   */
  function move(to: GrabPlace): void {
    if (to === place) return;
    const was = place !== "off";
    if (place === "here") stopLocal();
    place = to;
    if (to === "here") startLocal();
    const on = to !== "off";
    if (on === was) return;
    if (inFrame) post(window.parent, { source: "devknobs", type: "grab", on });
    for (const listener of Array.from(listeners)) listener(on);
  }

  function set(next: boolean): void {
    const target = frame();
    const to = grabStep(place, { type: "ask", on: next, frame: target !== null });
    if (target && (to === "frame" || place === "frame")) {
      post(target, { source: "devknobs", type: "grab", on: next, scheme: systemScheme() });
      if (next) target.focus();
    }
    move(to);
  }

  function step(event: HoldEvent): void {
    const result = holdStep(hold, event);
    hold = result.hold;
    if (!hold) clearTimeout(holdTimer);
    if (result.activate) set(true);
  }

  function onKeydown(event: KeyboardEvent): void {
    const key = keyNow();
    const press = key !== null && pressTurnsOn(key);
    const grabKey =
      key !== null && isGrabKey(event, key) && !(grabKeyTypes(key) && typesInField(event));
    if (grabKey && press) {
      // Where it is grab's, a key that types is not typed. A press turns grab
      // on, or off while it is on or loading, and a repeat does nothing.
      event.preventDefault();
      if (!event.repeat) set(place === "off");
      return;
    }
    if (mode) {
      mode.keydown(event);
      return;
    }
    if (place !== "off") {
      // On in the frame, or loading here, with the keys up here.
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        set(false);
      }
      return;
    }
    if (grabKey) {
      if (event.repeat) {
        step({ type: "repeat" });
        return;
      }
      if (hold) return;
      // The key may be a copy, so it waits longer in a field or on a selection.
      const duration = holdDuration(holdScene());
      step({ type: "down", at: Date.now(), duration });
      clearTimeout(holdTimer);
      holdTimer = window.setTimeout(() => step({ type: "timer" }), duration);
      return;
    }
    // Another key with the modifiers is another shortcut.
    if (hold && !MODIFIER_KEYS.has(event.key)) step({ type: "cancel" });
  }

  function onKeyup(event: KeyboardEvent): void {
    const key = keyNow();
    if (hold && key && releasesGrabKey(event, key)) step({ type: "release", at: Date.now() });
  }

  function onCopy(): void {
    if (hold) step({ type: "copy" });
  }

  function onBlur(): void {
    if (hold) step({ type: "cancel" });
  }

  function onPointer(event: PointerEvent): void {
    pointer = { x: event.clientX, y: event.clientY };
  }

  function onMessage(event: MessageEvent): void {
    if (inFrame) {
      const message = readMessage(event, window.parent, window.location.origin);
      if (message?.type !== "grab") return;
      scheme = message.scheme;
      set(message.on);
      return;
    }
    const message = readMessage(event, frameWindow(), window.location.origin);
    if (message?.type === "grab") move(grabStep(place, { type: "frame", on: message.on }));
    // The frame loaded again, and grab with it is gone.
    else if (message?.type === "ready") move(grabStep(place, { type: "frame", on: false }));
  }

  /** The frame coming up or going down takes grab with it. */
  const unsubscribe = engine.subscribe((state) => {
    if (!inFrame) move(grabStep(place, { type: "framed", frame: needsFrame(state) }));
  });

  window.addEventListener("keydown", onKeydown, true);
  window.addEventListener("keyup", onKeyup, true);
  window.addEventListener("blur", onBlur);
  window.addEventListener("pointermove", onPointer, { capture: true, passive: true });
  window.addEventListener("message", onMessage);
  document.addEventListener("copy", onCopy, true);

  return {
    isOn: () => place !== "off",
    set,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    destroy() {
      set(false);
      stopLocal();
      unsubscribe();
      clearTimeout(holdTimer);
      listeners.clear();
      window.removeEventListener("keydown", onKeydown, true);
      window.removeEventListener("keyup", onKeyup, true);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("pointermove", onPointer, true);
      window.removeEventListener("message", onMessage);
      document.removeEventListener("copy", onCopy, true);
    },
  };
}
