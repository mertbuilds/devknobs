import type { GrabControl } from "../grab/control";
import { BINDING_WORDS, type LiveKeys, recordStep } from "./bindings";
import { button, el, mark, rowBox } from "./dom";
import { BINDING_ICONS, icon, type IconName } from "./icons";
import { type Binding, comboLabel, comboSpoken, type Keys } from "./keys";
import type { LivePrefs } from "./prefs";
import { focusOn, type View } from "./slide";
import type { Tips } from "./tooltip";

/**
 * The settings view, which slides in over the rows: whether the handle shows
 * while the panel is closed, and each binding's key, recorded from the next
 * keys pressed. A key a binding cannot take is refused, and the chip says why.
 */

/** What a binding's chip says while it has no key: its default went to another binding. */
export const NO_KEY = "not set";

/** How long a chip stays red, and its reason shows, after a key it cannot take, in ms. */
const REFUSED_RED = 1000;
const REFUSED_TIP = 1800;

/** How long the way back to a panel whose handle was just hidden shows, in ms. */
const HANDLE_HINT = 4000;

/**
 * What the panel says as the user hides the handle, so the way back to a
 * closed panel is never lost: the panel's key, as `comboLabel` shows it.
 */
export function handleHint(keys: Keys, mac: boolean): string {
  return `press ${comboLabel(keys.panel, mac)} to open knobs`;
}

/** What the settings need from the panel. */
export interface SettingsContext {
  keys: LiveKeys;
  prefs: LivePrefs;
  grab: GrabControl | null;
  mac: boolean;
  /** The bindings the shortcuts list. */
  bindingsHere: readonly Binding[];
  /** The footer's control that opens and leaves the settings. */
  keysToggle: HTMLButtonElement;
  /** The live region that says why a key was not taken. */
  said: HTMLElement;
  tips: Tips;
  /** Draw the whole panel again. */
  render(): void;
  /** Show the keys in force, everywhere the panel shows them. */
  renderKeys(): void;
  /** Whether the search is open. */
  searching(): boolean;
  leaveSearch(): void;
}

export interface Settings {
  /** The settings pane. */
  view: HTMLElement;
  /** Whether the settings show in place of the rows. */
  editing(): boolean;
  setEditing(on: boolean): void;
  drawKeys(now: Keys): void;
  /** Show whether the handle shows while the panel is closed. */
  drawHandle(shown: boolean): void;
  /** Take a key for the binding that records, if one does, and say whether it did. */
  recordingKey(event: KeyboardEvent): boolean;
  stopRecording(): void;
  leaveKeys(): void;
  destroy(): void;
}

export function createSettings(context: SettingsContext): Settings {
  const { keys, prefs, grab, mac, bindingsHere, keysToggle, said, tips, render, renderKeys } =
    context;

  // The settings, in place of the rows: a way back to them, whether the
  // handle shows while the panel is closed, then each binding's key, to set
  // or put back. A key that is not taken shakes its chip and says why in the
  // tooltip. The panel's icons face the side it is on.
  const keysView = el("div", "keys pane");
  keysView.setAttribute("role", "group");
  keysView.setAttribute("aria-label", "settings");
  const keysBack = button("main", "");
  keysBack.setAttribute("aria-label", "back from settings");
  const handleSwitch = button("switch row-control", "");
  handleSwitch.setAttribute("role", "switch");
  handleSwitch.setAttribute("aria-label", "show handle");
  const sided = (name: IconName): SVGElement => {
    const glyph = icon(name);
    if (name.startsWith("panel-")) glyph.classList.add("sided");
    return glyph;
  };
  keysView.append(
    rowBox(keysBack, icon("chevron-left"), "settings"),
    rowBox(el("div", "main"), sided("panel-right"), "show handle", handleSwitch),
    el("div", "group-label", "shortcuts"),
  );
  const keyViews = new Map<
    Binding,
    { set: HTMLButtonElement; back: HTMLButtonElement }
  >();
  for (const binding of bindingsHere) {
    const word = BINDING_WORDS[binding];
    const set = button("key-set row-control", "");
    const back = button("clear", "");
    back.append(icon("x"));
    back.setAttribute("aria-label", `put the ${word} key back`);
    // Its x sits before its key, so every key ends on the row's right edge.
    keysView.append(rowBox(el("div", "main"), sided(BINDING_ICONS[binding]), word, set));
    set.before(back);
    keyViews.set(binding, { set, back });
  }

  /** The shortcuts show in place of the rows. */
  let editingKeys = false;
  /** The binding waiting for its new key. */
  let recording: Binding | null = null;
  /** Takes the red off a chip whose key was not taken. */
  let refusedTimer = 0;

  /** Show the keys in force on the settings, and whether they show. */
  function drawKeys(now: Keys): void {
    keysToggle.setAttribute("aria-pressed", editingKeys ? "true" : "false");
    for (const [binding, view] of keyViews) {
      const word = BINDING_WORDS[binding];
      const on = recording === binding;
      const combo = now[binding];
      view.set.textContent = on ? "press keys…" : combo ? comboLabel(combo, mac) : NO_KEY;
      view.set.classList.toggle("recording", on);
      view.set.setAttribute(
        "aria-label",
        on
          ? `press the new ${word} key`
          : `${word}, ${combo ? comboSpoken(combo) : NO_KEY}, ${combo ? "change" : "set"}`,
      );
      view.back.hidden = !keys.custom(binding);
    }
  }

  /** The keys of the bindings listed, which a new key must not be one of. */
  function keysHere(): Partial<Keys> {
    const now = keys.get();
    return Object.fromEntries(bindingsHere.map((binding) => [binding, now[binding]]));
  }

  /**
   * Wait for a binding's new key. Until it comes, every key goes to the
   * recording and to nothing else: not to the panel, grab or the page.
   */
  function startRecording(binding: Binding): void {
    recording = binding;
    keys.recording = true;
    // Grab's mode reads the keys ahead of the panel, escape and the arrows too.
    grab?.set(false);
    renderKeys();
    keyViews.get(binding)?.set.focus({ preventScroll: true });
  }

  function stopRecording(): void {
    if (recording === null) return;
    const chip = keyViews.get(recording)?.set;
    recording = null;
    keys.recording = false;
    if (chip) unrefuse(chip);
    renderKeys();
  }

  /**
   * A key pressed while a binding records. Tab moves on, and the blur that
   * follows ends it. Every other key is swallowed: escape cancels, a key the
   * binding can take becomes its key, and one it cannot says why.
   */
  function recordKey(event: KeyboardEvent, binding: Binding): void {
    if (event.key === "Tab") {
      stopRecording();
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    const step = recordStep(event, binding, keysHere());
    const chip = keyViews.get(binding)?.set;
    // The reason a key was refused stays until the next key.
    if (chip && tips.isFor(chip)) tips.hide();
    if (step.type === "cancel") stopRecording();
    else if (step.type === "refuse" && chip) refuse(chip, step.reason);
    else if (step.type === "keep") {
      stopRecording();
      keys.set(binding, step.combo);
    }
  }

  /**
   * A key the chip's binding cannot take: the chip shakes and goes red for a
   * moment, and the tooltip over it says why, as the live region does. A
   * second one starts it all again.
   */
  function refuse(chip: HTMLElement, reason: string): void {
    clearTimeout(refusedTimer);
    chip.classList.remove("refused");
    // Read the layout, so the shake starts over.
    void chip.offsetWidth;
    chip.classList.add("refused");
    refusedTimer = window.setTimeout(() => chip.classList.remove("refused"), REFUSED_RED);
    tips.show(chip, reason, true);
    tips.hideAfter(REFUSED_TIP);
    said.textContent = reason;
  }

  function unrefuse(chip: HTMLElement): void {
    clearTimeout(refusedTimer);
    chip.classList.remove("refused");
    if (tips.isFor(chip)) tips.hide();
  }

  /** Hand the focus to what a view takes it on, as it slides there. */
  function focusView(view: View): void {
    (focusOn(view) === "back" ? keysBack : keysToggle).focus({ preventScroll: true });
  }

  function openKeys(): void {
    if (context.searching()) context.leaveSearch();
    editingKeys = true;
    render();
    focusView("keys");
  }

  function leaveKeys(): void {
    stopRecording();
    editingKeys = false;
    render();
    focusView("home");
  }

  keysToggle.addEventListener("click", () => (editingKeys ? leaveKeys() : openKeys()));
  keysBack.addEventListener("click", leaveKeys);
  tips.tooltip(keysToggle, "settings");
  // Hiding the handle says how to bring the closed panel back, so nobody is shut out.
  handleSwitch.addEventListener("click", () => {
    const on = !prefs.get().handle;
    prefs.setHandle(on);
    if (on) {
      if (tips.isFor(handleSwitch)) tips.hide();
      return;
    }
    const hint = handleHint(keys.get(), mac);
    tips.show(handleSwitch, hint);
    tips.hideAfter(HANDLE_HINT);
    said.textContent = hint;
  });
  for (const [binding, view] of keyViews) {
    view.set.addEventListener("click", () => {
      if (recording === binding) stopRecording();
      else startRecording(binding);
    });
    view.set.addEventListener("blur", () => {
      if (recording === binding) stopRecording();
    });
    view.back.addEventListener("click", () => {
      stopRecording();
      keys.set(binding, null);
      view.set.focus({ preventScroll: true });
    });
  }

  return {
    view: keysView,
    editing: () => editingKeys,
    setEditing(on: boolean): void {
      editingKeys = on;
    },
    drawKeys,
    drawHandle(shown: boolean): void {
      mark(handleSwitch, shown, "aria-checked");
    },
    recordingKey(event: KeyboardEvent): boolean {
      if (recording === null) return false;
      recordKey(event, recording);
      return true;
    },
    stopRecording,
    leaveKeys,
    destroy(): void {
      clearTimeout(refusedTimer);
    },
  };
}
