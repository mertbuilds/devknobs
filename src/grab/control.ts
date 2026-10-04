// adapted from react-grab (MIT, Copyright (c) 2025 Aiden Bai)
import * as engine from "../engine";
import { isDevknobsFrame, needsFrame, post, readMessage } from "../engine/frame";
import { realPlatform } from "../engine/ua";
import { frameWindow } from "../engine/width";
import {
  grabKeyLabel,
  type Hold,
  type HoldEvent,
  holdDuration,
  holdStep,
  isGrabKey,
  parseGrabKey,
  releasesGrabKey,
} from "./keys";
import type { Mode } from "./mode";

export interface GrabControlOptions {
  /** The key held to grab, such as `alt+shift+g`. Defaults to meta or ctrl with c. */
  key?: string;
}

export interface GrabControl {
  /** The grab key as the panel shows it, such as `⌘C`. */
  readonly label: string;
  isOn(): boolean;
  /** Turn grab on or off, in the frame while it is up. */
  set(on: boolean): void;
  /** Hear grab go on and off. Returns the way to stop. */
  subscribe(listener: (on: boolean) => void): () => void;
  destroy(): void;
}

const MODIFIER_KEYS = new Set(["Meta", "Control", "Shift", "Alt", "AltGraph", "CapsLock"]);

function isMac(): boolean {
  return /mac|iphone|ipad|ipod/i.test(realPlatform());
}

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
 * Grab's switch, in every bundle: the held key that turns it on, the panel's
 * view of it, and the way into the width knob's frame. Grab has to run in the
 * page that owns React, so while the frame is up, the page above hands grab
 * to the frame and only shows it as on. The overlay and the context load the
 * first time grab turns on.
 */
export function createGrab(options: GrabControlOptions = {}): GrabControl {
  const mac = isMac();
  const key = parseGrabKey(options.key, mac);
  const inFrame = isDevknobsFrame();
  const listeners = new Set<(on: boolean) => void>();
  let on = false;
  /** Grab is on in the frame, not here. */
  let forwarded = false;
  let mode: Mode | null = null;
  /** Bumped each time grab goes on or off, so a mode that loads late knows it is stale. */
  let turn = 0;
  let hold: Hold | null = null;
  let holdTimer = 0;
  let pointer: { x: number; y: number } | null = null;
  /** The scheme the page above said to draw in. */
  let scheme: "light" | "dark" | undefined;

  function notify(next: boolean): void {
    if (on === next) return;
    on = next;
    if (inFrame) post(window.parent, { source: "devknobs", type: "grab", on });
    for (const listener of Array.from(listeners)) listener(on);
  }

  function frame(): Window | null {
    return inFrame ? null : frameWindow();
  }

  function startLocal(): void {
    const at = ++turn;
    notify(true);
    void import("./index").then(({ startMode }) => {
      if (at !== turn || !on) return;
      mode = startMode({
        pointer,
        scheme,
        onExit: () => {
          mode = null;
          turn++;
          notify(false);
        },
      });
    });
  }

  function stopLocal(): void {
    turn++;
    mode?.stop();
    mode = null;
  }

  function set(next: boolean): void {
    const target = frame();
    if (target && (next || forwarded)) {
      forwarded = next;
      post(target, { source: "devknobs", type: "grab", on: next, scheme: systemScheme() });
      if (next) target.focus();
      notify(next);
      return;
    }
    if (next === on) return;
    if (next) startLocal();
    else {
      stopLocal();
      notify(false);
    }
  }

  function step(event: HoldEvent): void {
    const result = holdStep(hold, event);
    hold = result.hold;
    if (!hold) clearTimeout(holdTimer);
    if (result.activate) set(true);
  }

  function onKeydown(event: KeyboardEvent): void {
    if (mode) {
      mode.keydown(event);
      return;
    }
    if (on) {
      // On in the frame, with the keys up here.
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        set(false);
      }
      return;
    }
    if (isGrabKey(event, key)) {
      if (event.repeat) {
        step({ type: "repeat" });
        return;
      }
      if (hold) return;
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
    if (hold && releasesGrabKey(event, key)) step({ type: "release", at: Date.now() });
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
    if (message?.type === "grab") {
      forwarded = message.on;
      notify(message.on);
    } else if (message?.type === "ready" && forwarded) {
      // The frame loaded again, and grab with it is gone.
      forwarded = false;
      notify(false);
    }
  }

  /** The frame coming up or going down takes grab with it. */
  const unsubscribe = engine.subscribe((state) => {
    if (inFrame || !on) return;
    const framed = needsFrame(state);
    if (forwarded && !framed) {
      forwarded = false;
      notify(false);
    } else if (!forwarded && framed) set(false);
  });

  window.addEventListener("keydown", onKeydown, true);
  window.addEventListener("keyup", onKeyup, true);
  window.addEventListener("blur", onBlur);
  window.addEventListener("pointermove", onPointer, { capture: true, passive: true });
  window.addEventListener("message", onMessage);
  document.addEventListener("copy", onCopy, true);

  return {
    label: grabKeyLabel(key, mac),
    isOn: () => on,
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
