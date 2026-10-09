import * as engine from "../engine";
import { now, realNow } from "../engine/clock";
import { deviceOf } from "../engine/devices";
import { resolveTimeZone } from "../engine/time";
import { userAgentOf } from "../engine/ua";
import type { DevknobsState, DevknobsStatePatch } from "../types";
import {
  type Knob,
  type KnobId,
  knobsOf,
  nameOf,
  type Option,
  type Row,
  type RowId,
  rowOf,
  wallInput,
} from "./catalog";
import { button, el, field, mark, numberField, reveal } from "./dom";
import { createFoldSlider, type FoldSlider, foldChip } from "./foldslider";
import { radioMove } from "./keys";
import { pinPatch, showsLabel } from "./list";
import { filterOptions } from "./search";

/**
 * The editor that folds out under a knob row: a control per knob, as its
 * kind asks for, and the free values and readouts some knobs add under it.
 * Each control comes with an update that keeps it in step with the knobs.
 */

/** What an editor control keeps in step with the knobs. */
export type Update = (state: DevknobsState) => void;

const CUSTOM_DEBOUNCE = 200;

/** What the clock note says: the time the page reads. */
function clockReadout(): string {
  return `now: ${new Date(now()).toLocaleString()}`;
}

/** A number the geo knob can use, so that a half-typed value is not an error. */
function toNumber(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Set knobs from the panel. Their row stays listed from here on. */
export function commit(row: RowId, patch: DevknobsStatePatch): void {
  engine.setState(pinPatch(engine.getState(), row, patch));
}

export function set(knob: Knob, value: string): void {
  commit(rowOf(knob.id).id, knob.write(value, engine.getState()));
}

/** What the editors need from the panel. */
export interface EditorsContext {
  /** The panel's shadow root, which knows the focus. */
  root: ShadowRoot;
  /** A value picked from a long list, which may open its row too. */
  pickOption(knob: Knob, option: Option): void;
}

export interface Editors {
  /** Fill a row's editor with its knobs' controls, and hand back their updates. */
  buildEditor(row: Row, editor: HTMLElement): Update[];
  /** Drop the timers and listeners the editors hold. */
  destroy(): void;
}

export function createEditors(context: EditorsContext): Editors {
  const { root, pickOption } = context;

  /** Leave an input alone while it has the caret, so typing is never cut off. */
  function fill(input: HTMLInputElement | HTMLTextAreaElement, value: string): void {
    if (root.activeElement === input) return;
    if (input.value !== value) input.value = value;
  }

  /** Typing commits once it pauses, each field on a timer of its own. */
  const pending = new Map<() => void, number>();

  function queue(commit: () => void): void {
    clearTimeout(pending.get(commit));
    pending.set(
      commit,
      window.setTimeout(() => {
        pending.delete(commit);
        commit();
      }, CUSTOM_DEBOUNCE),
    );
  }

  /**
   * A radio group is one tab stop, on the choice that is on, and the arrows
   * move the choice as they move the focus.
   */
  function radioGroup(
    knob: Knob,
    track: HTMLElement,
    items: { node: HTMLButtonElement; value: string }[],
  ): Update {
    // The choices shown, in the order they stand.
    const shown = () =>
      Array.from(track.children).flatMap((node) => {
        const item = items.find((entry) => entry.node === node);
        return item && !item.node.hidden ? [item] : [];
      });
    track.addEventListener("keydown", (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const list = shown();
      const at = list.findIndex((item) => item.node === event.target);
      const next = at < 0 ? null : radioMove(event.key, at, list.length);
      const item = next === null ? undefined : list[next];
      if (!item) return;
      event.preventDefault();
      item.node.focus();
      set(knob, item.value);
    });
    return (state) => {
      const current = knob.read(state);
      const list = shown();
      const known = list.some((item) => item.value === current);
      for (const item of items) {
        const on = item.value === current;
        mark(item.node, on, "aria-checked");
        item.node.tabIndex = on || (!known && item === list[0]) ? 0 : -1;
      }
    };
  }

  function segments(knob: Knob): [HTMLElement, Update] {
    const track = el("div", "seg");
    track.setAttribute("role", "radiogroup");
    track.setAttribute("aria-label", knob.label);
    const items = knob.options.map((option) => {
      const node = button("seg-item", option.label);
      node.setAttribute("role", "radio");
      node.addEventListener("click", () => set(knob, option.value));
      track.append(node);
      return { node, value: option.value };
    });
    const update = radioGroup(knob, track, items);
    const offers = knob.offers;
    if (!offers) return [track, update];
    // Only the choices the state offers, in its order.
    return [
      track,
      (state) => {
        const offered = offers(state);
        const order = offered.flatMap((value) => items.filter((item) => item.value === value));
        for (const item of items) item.node.hidden = !order.includes(item);
        const standing = Array.from(track.children).filter(
          (node) => node instanceof HTMLElement && !node.hidden,
        );
        if (order.some((item, at) => standing[at] !== item.node)) {
          track.append(...order.map((item) => item.node));
        }
        update(state);
      },
    ];
  }

  /** Colors as swatches, the one that is on with a ring around it. */
  function swatches(knob: Knob): [HTMLElement, Update] {
    const track = el("div", "swatches");
    track.setAttribute("role", "radiogroup");
    track.setAttribute("aria-label", knob.label);
    const items = knob.options.map((option) => {
      const node = button("swatch", "");
      node.setAttribute("role", "radio");
      node.setAttribute("aria-label", option.label);
      node.title = option.label;
      node.style.background = option.swatch ?? "";
      node.addEventListener("click", () => set(knob, option.value));
      track.append(node);
      return { node, value: option.value };
    });
    return [track, radioGroup(knob, track, items)];
  }

  /**
   * Presets as chips. A value set some other way, from search say, shows as a
   * chip of its own, or in the custom field where the knob has one.
   */
  function chips(knob: Knob, custom: HTMLInputElement | null): [HTMLElement, Update] {
    const box = el("div", "chips");
    box.setAttribute("aria-label", knob.label);
    const items = knob.options.map((option) => {
      const node = button("chip", option.label);
      node.addEventListener("click", () => set(knob, option.value));
      box.append(node);
      return { node, value: option.value };
    });
    const other = el("span", "chip on");
    box.append(custom ?? other);
    return [
      box,
      (state) => {
        const current = knob.read(state);
        let known = false;
        for (const item of items) {
          mark(item.node, item.value === current);
          known ||= item.value === current;
        }
        if (custom) {
          custom.classList.toggle("on", !known);
          fill(custom, known ? "" : current);
          return;
        }
        other.hidden = known || current === "";
        other.textContent = nameOf(knob, current);
      },
    ];
  }

  function toggleSwitch(knob: Knob): [HTMLElement, Update] {
    const [off, on] = knob.options;
    const node = button("switch", "");
    node.setAttribute("role", "switch");
    node.setAttribute("aria-label", knob.label);
    node.addEventListener("click", () => {
      if (!off || !on) return;
      set(knob, knob.read(engine.getState()) === on.value ? off.value : on.value);
    });
    return [node, (state) => mark(node, knob.read(state) === on?.value, "aria-checked")];
  }

  /**
   * A long list with a filter that also takes a value typed out in full.
   * Unfiltered, grouped values sit under their headings.
   */
  function list(knob: Knob): [HTMLElement, Update] {
    const box = el("div", "list");
    const filter = field("filter", "filter", `filter ${knob.label}`);
    const items = el("div", "items");
    items.setAttribute("role", "listbox");
    items.setAttribute("aria-label", knob.label);
    // A pick keeps the focus where it was, as the list is drawn again under it.
    items.addEventListener("mousedown", (event: MouseEvent) => event.preventDefault());
    box.append(filter, items);
    let shown: Option[] = [];
    let at = -1;
    const draw = (state: DevknobsState) => {
      const current = knob.read(state);
      shown = filterOptions(knob, filter.value);
      if (filter.value.trim() === "" && !shown.some((option) => option.value === current)) {
        shown.unshift({ value: current, label: nameOf(knob, current) });
      }
      const grouped = filter.value.trim() === "";
      const nodes: HTMLElement[] = [];
      let group: string | undefined;
      shown.forEach((option, index) => {
        if (grouped && option.group && option.group !== group) {
          nodes.push(el("div", "group-label", option.group));
        }
        group = option.group;
        const node = button("item", option.label);
        node.setAttribute("role", "option");
        node.tabIndex = -1;
        mark(node, option.value === current, "aria-selected");
        node.classList.toggle("cursor", index === at);
        node.addEventListener("click", () => pickOption(knob, option));
        nodes.push(node);
      });
      items.replaceChildren(...nodes);
      const cursorNode = items.querySelector(".cursor");
      if (cursorNode instanceof HTMLElement) reveal(cursorNode, items);
    };
    filter.addEventListener("input", () => {
      at = filter.value.trim() ? 0 : -1;
      items.scrollTop = 0;
      draw(engine.getState());
    });
    filter.addEventListener("keydown", (event: KeyboardEvent) => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const step = event.key === "ArrowDown" ? 1 : -1;
        at = Math.min(Math.max(at + step, 0), shown.length - 1);
        draw(engine.getState());
      } else if (event.key === "Enter") {
        event.preventDefault();
        const option = shown[Math.max(at, 0)];
        if (option) pickOption(knob, option);
      }
    });
    return [box, draw];
  }

  const widthField = field("chip chip-field", "other", "custom width in pixels");
  widthField.type = "number";
  widthField.inputMode = "numeric";

  function commitWidth(): void {
    const width = Number(widthField.value);
    if (Number.isFinite(width) && width > 0) commit("viewport", { width });
  }

  widthField.addEventListener("input", () => queue(commitWidth));

  function control(knob: Knob): [HTMLElement, Update] {
    if (knob.control === "switch") return toggleSwitch(knob);
    if (knob.control === "segments") return segments(knob);
    if (knob.control === "swatches") return swatches(knob);
    if (knob.control === "list") return list(knob);
    return chips(knob, knob.id === "width" ? widthField : null);
  }

  /** Set the clock to an instant, running unless it stands frozen already. */
  function travel(at: number, since = realNow()): void {
    const frozen = engine.getState().clock.mode === "frozen";
    commit("clock", { clock: { mode: frozen ? "frozen" : "offset", at, since } });
  }

  function clockExtra(): [HTMLElement, Update] {
    const box = el("div", "extra");
    const at = field("field-clock", "", "clock date and time");
    at.type = "datetime-local";
    const note = el("div", "note");
    box.append(at, note);
    // A date and time picked whole runs the clock from there.
    at.addEventListener("change", () => {
      const time = Date.parse(at.value);
      if (!Number.isNaN(time)) travel(time);
    });
    return [
      box,
      (state) => {
        fill(at, state.clock.mode === "system" ? "" : wallInput(state.clock.at));
        note.hidden = state.clock.mode === "system";
        note.textContent = clockReadout();
      },
    ];
  }

  function geoExtra(): [HTMLElement, Update] {
    const box = el("div", "extra");
    const lat = numberField("lat", "latitude");
    const lng = numberField("lng", "longitude");
    const custom = el("div", "fields");
    custom.append(el("span", "unit", "lat"), lat, el("span", "unit", "lng"), lng);
    const route = document.createElement("textarea");
    route.className = "field field-route";
    route.placeholder = "lat,lng per line, or gpx";
    route.spellcheck = false;
    route.setAttribute("aria-label", "route");
    const speed = numberField("speed", "route speed in kilometers per hour");
    const pace = el("div", "fields");
    pace.append(speed, el("span", "unit", "kilometers per hour"));
    const travelBox = el("div", "extra");
    travelBox.append(route, pace);
    box.append(custom, travelBox);
    const commitCustom = () =>
      commit("location", {
        geo: { preset: "custom", lat: toNumber(lat.value), lng: toNumber(lng.value) },
      });
    const commitRoute = () => commit("location", { geo: { preset: "route", route: route.value } });
    const commitSpeed = () => commit("location", { geo: { speed: toNumber(speed.value) } });
    for (const input of [lat, lng]) input.addEventListener("input", () => queue(commitCustom));
    route.addEventListener("input", () => queue(commitRoute));
    speed.addEventListener("input", () => queue(commitSpeed));
    return [
      box,
      (state) => {
        custom.hidden = state.geo.preset !== "custom";
        travelBox.hidden = state.geo.preset !== "route";
        fill(lat, String(state.geo.lat));
        fill(lng, String(state.geo.lng));
        fill(route, state.geo.route);
        fill(speed, String(state.geo.speed));
      },
    ];
  }

  /** The device row's fold slider, which stops listening to the fold with the panel. */
  let foldSlider: FoldSlider | null = null;

  /** A width and a height of the frame's own, a turn of it, and a fold of a foldable, by a chip and by a slider. */
  function deviceExtra(): [HTMLElement, Update] {
    const extra = el("div", "extra extra-device");
    const box = el("div", "fields");
    const width = numberField("width", "viewport width in pixels");
    const height = numberField("height", "viewport height in pixels");
    const rotate = button("chip", "rotate");
    const fold = button("chip", "unfold");
    box.append(width, el("span", "unit", "×"), height, rotate, fold);
    const slider = createFoldSlider((posture) => commit("device", { posture }));
    foldSlider = slider;
    extra.append(box, slider.node);
    // An empty field is the window's own size.
    const size = (input: HTMLInputElement) => {
      const value = toNumber(input.value);
      return value > 0 ? value : "full";
    };
    const commitSize = () => commit("device", { width: size(width), height: size(height) });
    for (const input of [width, height]) input.addEventListener("input", () => queue(commitSize));
    rotate.addEventListener("click", () => {
      const turned = engine.getState().orientation === "portrait" ? "landscape" : "portrait";
      commit("device", { orientation: turned });
    });
    // The chip takes the hinge from the slider, held or on its way, and folds it to the other posture.
    fold.addEventListener("click", () => {
      commit("device", { posture: foldChip(engine.getState().posture).posture });
    });
    return [
      extra,
      (state) => {
        fill(width, typeof state.width === "number" ? String(state.width) : "");
        fill(height, typeof state.height === "number" ? String(state.height) : "");
        rotate.hidden = typeof state.width !== "number" || typeof state.height !== "number";
        fold.hidden = !deviceOf(state.device)?.postures;
        fold.textContent = foldChip(state.posture).label;
        slider.update(state);
      },
    ];
  }

  function zoneExtra(): [HTMLElement, Update] {
    const note = el("div", "note");
    return [
      note,
      (state) => {
        // Only following geo leaves the zone in use unsaid.
        note.hidden = state.timeZone !== "geo";
        note.textContent = `in use: ${resolveTimeZone(state.timeZone, state.geo) ?? "system"}`;
      },
    ];
  }

  /** The custom user agent, shown while custom is picked, and editing it keeps it the custom one. */
  function uaExtra(): [HTMLElement, Update] {
    const custom = document.createElement("textarea");
    custom.className = "field field-ua";
    custom.placeholder = "custom user agent";
    custom.spellcheck = false;
    custom.setAttribute("aria-label", "custom user agent");
    const commitCustom = () => commit("device", { ua: { preset: "custom", custom: custom.value } });
    custom.addEventListener("input", () => queue(commitCustom));
    return [
      custom,
      (state) => {
        custom.hidden = state.ua.preset !== "custom";
        fill(custom, userAgentOf(state.ua));
      },
    ];
  }

  /** What some knobs add under their control: free values and readouts. */
  const EXTRAS: Partial<Record<KnobId, () => [HTMLElement, Update]>> = {
    clock: clockExtra,
    device: deviceExtra,
    geo: geoExtra,
    timeZone: zoneExtra,
    ua: uaExtra,
  };

  function buildEditor(row: Row, editor: HTMLElement): Update[] {
    const updates: Update[] = [];
    for (const knob of knobsOf(row)) {
      const line = el("div", `knob knob-${knob.control}`);
      line.dataset.knob = knob.id;
      const [node, update] = control(knob);
      // The control keeps the knob's name for assistive tech where the label goes.
      if (showsLabel(row, knob)) line.append(el("div", "knob-label", knob.label));
      line.append(node);
      updates.push(update);
      const extra = EXTRAS[knob.id]?.();
      if (extra) {
        line.append(extra[0]);
        updates.push(extra[1]);
      }
      // A knob hides while it does nothing, or while its choices depend on the device and it offers none.
      const { shown, offers } = knob;
      if (shown || offers) {
        updates.push((state) => {
          line.hidden = !(shown?.(state) ?? true) || offers?.(state).length === 0;
        });
      }
      editor.append(line);
    }
    return updates;
  }

  return {
    buildEditor,
    destroy(): void {
      foldSlider?.destroy();
      for (const timer of pending.values()) clearTimeout(timer);
    },
  };
}
