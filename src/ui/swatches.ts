import * as engine from "../engine";
import { isCustomColor } from "../engine/color";
import type { CustomColor, DevknobsState } from "../types";
import type { Knob } from "./catalog";
import { dropColor, type LiveColors, pickColor } from "./colors";
import { button, el } from "./dom";
import { icon } from "./icons";
import { textField } from "./kit";
import { type RadioItem, radioGroup } from "./radio";

/**
 * The one swatch list every color knob is drawn with: the knob's own colors
 * as a radio group, the one that is on with a ring around it. A knob that
 * takes colors of the user's own lists them after its own, each with an x
 * that takes it off the list, and ends with a plus that opens the browser's
 * color picker, with a field under the list for a color typed out.
 */

/** What says no to a color that does not read. */
export const NOT_A_COLOR = "use a hex such as #1e90ff, or rgb()";

/** What the swatch list needs from the editors. */
export interface SwatchesContext {
  /** The panel's shadow root, which knows the focus. */
  root: ShadowRoot;
  /** The colors the user added. */
  colors: LiveColors;
  /** Set the knob from the panel. */
  set(knob: Knob, value: string): void;
  /** Put the knob back to its default. */
  reset(knob: Knob): void;
  /** Say no to what a control was given, and why. */
  refuse(node: HTMLElement, reason: string): void;
}

export function swatchList(
  knob: Knob,
  context: SwatchesContext,
): [HTMLElement, (state: DevknobsState) => void] {
  const { root, colors, set } = context;
  const track = el("div", "swatches");
  track.setAttribute("role", "radiogroup");
  track.setAttribute("aria-label", knob.label);
  const swatch = (value: string, label: string, paint: string): HTMLButtonElement => {
    const node = button("swatch", "");
    node.setAttribute("role", "radio");
    node.setAttribute("aria-label", label);
    node.title = label;
    node.style.background = paint;
    node.addEventListener("click", () => set(knob, value));
    return node;
  };
  const items: RadioItem[] = knob.options.map((option) => {
    const node = swatch(option.value, option.label, option.swatch ?? "");
    track.append(node);
    return { node, value: option.value };
  });
  const show = radioGroup(track, items, (value) => set(knob, value));
  const update = (state: DevknobsState): void => show(knob.read(state));
  const list = knob.custom;
  if (!list) return [track, update];
  /** The colors of the user's own the knob lists, and the way to list others. */
  const kept = (): readonly CustomColor[] => colors.get()[list];
  const keep = (next: readonly CustomColor[]): void => colors.set(list, next);

  /** How many of the swatches are the knob's own, which never go. */
  const own = items.length;
  /** What stands in the track for the colors of the user's own: each swatch, and its x after it. */
  let drawn: HTMLElement[] = [];
  const box = el("div", "colors");
  const plus = el("span", "swatch-plus");
  const add = button("swatch swatch-add", "");
  add.append(icon("plus", 10));
  add.setAttribute("aria-label", `add a color to ${knob.label}`);
  add.title = "add a color";
  // The browser's own picker, unseen under the plus, which opens it there.
  const picker = document.createElement("input");
  picker.type = "color";
  picker.className = "swatch-pick";
  picker.tabIndex = -1;
  picker.setAttribute("aria-label", `pick a color for ${knob.label}`);
  plus.append(add, picker);
  // The kit's field, as a view's is: Enter takes what is typed, or says why not.
  const typed = textField({
    placeholder: "#hex or rgb()",
    label: `a color for ${knob.label}, as a hex or rgb()`,
    onEnter: () => {
      if (take(typed.value)) done();
      else context.refuse(typed, NOT_A_COLOR);
    },
  });
  typed.hidden = true;
  track.append(plus);
  box.append(track, typed);

  /** The swatch that is on, which the tab key stops at. */
  const onItem = (): RadioItem | undefined => items.find((item) => item.node.tabIndex === 0);

  /** Whether the focus is on one of `nodes` or in one. */
  const holds = (...nodes: Element[]): boolean =>
    nodes.some((node) => root.activeElement !== null && node.contains(root.activeElement));

  /** Take a color off the list. One that was on leaves the knob at its default. */
  function drop(color: CustomColor): void {
    const focused = holds(track);
    const was = knob.read(engine.getState()) === color;
    keep(dropColor(kept(), color));
    if (was) context.reset(knob);
    if (focused) (onItem() ?? items[0])?.node.focus({ preventScroll: true });
  }

  /** Draw the colors of the user's own again, between the knob's own and the plus. */
  function draw(): void {
    const held = items.find((item) => item.node === root.activeElement)?.value;
    for (const node of drawn) node.remove();
    drawn = [];
    items.length = own;
    for (const color of kept()) {
      const node = swatch(color, color, color);
      node.classList.add("swatch-own");
      const remove = button("swatch-x", "");
      remove.append(icon("x", 8));
      remove.tabIndex = -1;
      remove.setAttribute("aria-label", `remove ${color}`);
      remove.title = `remove ${color}`;
      remove.addEventListener("click", () => drop(color));
      node.addEventListener("keydown", (event: KeyboardEvent) => {
        if (event.key !== "Delete" && event.key !== "Backspace") return;
        if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
        event.preventDefault();
        drop(color);
      });
      // The x stands after its swatch in the track, so every swatch is the radio group's own child.
      plus.before(node, remove);
      drawn.push(node, remove);
      items.push({ node, value: color });
    }
    // A swatch drawn again keeps the focus the one before it had.
    if (held !== undefined) items.find((item) => item.value === held)?.node.focus();
  }

  /**
   * Take a color typed or picked: a new one joins the list and is on at once,
   * and one the knob or the list has is on with no second swatch. False for
   * what does not read as a color.
   */
  function take(text: string): boolean {
    const picked = pickColor(text, knob.options, kept());
    if (!picked) return false;
    if (picked.list.join() !== kept().join()) keep(picked.list);
    set(knob, picked.value);
    return true;
  }

  /** No color is being added any more: the field goes, its focus to the swatch that is on. */
  function done(): void {
    const focused = holds(plus, typed);
    typed.hidden = true;
    typed.value = "";
    if (focused) (onItem()?.node ?? add).focus({ preventScroll: true });
  }

  add.addEventListener("click", () => {
    typed.hidden = false;
    // The picker starts on the color that is on, so only another one is a change.
    const current = knob.read(engine.getState());
    const start = knob.options.find((option) => option.value === current)?.color ?? current;
    if (isCustomColor(start)) picker.value = start;
    try {
      picker.showPicker();
    } catch {
      // A browser without `showPicker`, or one that wants a click of the input's own.
      picker.click();
    }
  });
  // A color still being picked shows on the page as it moves, and joins no list yet.
  picker.addEventListener("input", () => {
    set(knob, picker.value);
    knob.land?.();
  });
  // The picker closed on another color than it opened on: that one is kept.
  picker.addEventListener("change", () => {
    if (take(picker.value)) knob.land?.();
    done();
  });
  typed.addEventListener("keydown", (event: KeyboardEvent) => {
    // Escape closes the editor, which the panel sees to, and the field with it.
    if (event.key !== "Escape") return;
    typed.hidden = true;
    typed.value = "";
  });

  colors.subscribe(() => {
    draw();
    update(engine.getState());
  });
  draw();
  return [box, update];
}
