import { readCookies, filterCookies } from "../storage/cookies";
import {
  type ApplyMode,
  applyPreset,
  canKeep,
  capture,
  entryCount,
  filterPresets,
  freeName,
  loadPresets,
  type Preset,
  parsePreset,
  presetCounts,
  presetText,
  savePresets,
  templateText,
} from "../storage/presets";
import { filterItems, readWeb } from "../storage/web";
import { el } from "./dom";
import {
  type ControlOption,
  controls,
  emptyLine,
  entryFold,
  noteLine,
  segments,
  stack,
  switchLine,
  textField,
} from "./kit";
import { askIn, counted, editBox, rowKeys, type Section, type Shell } from "./storageparts";

/**
 * Presets in the storage view: named sets of values to put into the page's
 * storage, kept by devknobs for this origin. One marked "apply on load" is
 * set on every load of the page, and the section says which are on its first
 * line, as the list of the stores does under its rows, so what changes the
 * page's data is never out of sight.
 */

/** What the section says where presets cannot be kept. */
export const FRESH_PRESETS = "fresh mode: presets are not read or kept";

/** Which presets apply on load, as the section's first line says it. */
export function onLoadLine(presets: readonly Preset[]): string {
  const names = presets.filter((preset) => preset.onLoad).map((preset) => preset.name);
  return names.length > 0
    ? `applies on every load of this page: ${names.join(", ")}`
    : "no preset applies on load";
}

/**
 * Ask for a name and keep what the page holds now as a preset: the items
 * and cookies the filter `query` leaves, less devknobs' own.
 */
export async function savePreset(shell: Shell, query: string): Promise<void> {
  if (!canKeep()) {
    shell.say(FRESH_PRESETS);
    return;
  }
  const { site } = shell;
  const local = filterItems(readWeb(site, "local").items, query, false);
  const session = filterItems(readWeb(site, "session").items, query, false);
  const cookies = filterCookies((await readCookies(site)).cookies, query);
  const sample = capture("preset", local, session, cookies, shell.now());
  if (sample.preset === null) {
    shell.say(sample.error);
    return;
  }
  const holds = presetCounts(sample.preset);
  shell.put((close) => {
    const problem = el("div", "ask");
    const save = (): void => {
      const made = capture(name.value, local, session, cookies, shell.now());
      if (made.preset === null) {
        problem.replaceChildren(noteLine(made.error));
        return;
      }
      const presets = loadPresets();
      const preset = { ...made.preset, name: freeName(made.preset.name, presets) };
      const failed = savePresets([...presets, preset]);
      if (failed !== null) {
        problem.replaceChildren(noteLine(failed));
        return;
      }
      close();
      shell.say(`kept the preset ${preset.name}: ${presetCounts(preset)}`);
      shell.touched();
    };
    const name = textField({ placeholder: "preset name", onEnter: save });
    const node = stack([
      noteLine(
        `keeps ${holds}${query.trim() === "" ? "" : ", as the filter shows them"}, without devknobs' own`,
      ),
      name,
      problem,
      controls([
        { label: "save preset", run: save },
        { label: "cancel", run: close },
      ]).node,
    ]);
    return { node, focus: name };
  });
}

export function presetSection(shell: Shell): Section {
  const { site } = shell;
  const node = el("div", "st-list");
  const top = el("div", "st-list");
  const making = el("div", "st-list");
  const list = el("div", "st-list");
  node.append(top, making, list);

  let presets: Preset[] = [];
  let read = false;
  const open = new Set<string>();
  let mains: { main: HTMLElement; remove(): void }[] = [];
  /** How each preset applies from its row, kept while the list draws again. */
  const modes = new Map<string, ApplyMode>();

  /** Keep the presets as they are now, and draw. Says what stopped it. */
  function keep(next: Preset[]): boolean {
    const failed = savePresets(next);
    if (failed !== null) {
      shell.say(failed);
      return false;
    }
    presets = next;
    draw();
    return true;
  }

  function replace(old: Preset, next: Preset): boolean {
    return keep(presets.map((preset) => (preset === old ? next : preset)));
  }

  function row(preset: Preset): HTMLElement {
    const { name } = preset;
    const fold = entryFold({
      name,
      value: presetCounts(preset),
      end: preset.onLoad ? "on load" : "",
      open: open.has(name),
      onToggle(out) {
        if (out) {
          open.add(name);
          fill();
        } else open.delete(name);
      },
    });

    function apply(): void {
      const mode = modes.get(name) ?? "add";
      const failed = applyPreset(site, preset, mode);
      const set = entryCount(preset) - failed.length;
      shell.say([
        `${mode === "replace" ? "replaced with" : "applied"} ${name}: ${counted(set, ["value", "values"])} set`,
        ...(failed.length > 0 ? [`not set: ${failed.join(", ")}`] : []),
      ]);
      shell.touched();
    }

    function edit(): void {
      const box = editBox(shell, {
        label: `the preset ${name} as json`,
        value: presetText(preset),
        save(text) {
          const made = parsePreset(text);
          if (made.preset === null) return made.error;
          const next: Preset = {
            ...made.preset,
            name: freeName(made.preset.name, presets, preset),
            onLoad: preset.onLoad,
            clearFirst: preset.clearFirst,
          };
          const failed = savePresets(presets.map((entry) => (entry === preset ? next : entry)));
          if (failed !== null) return failed;
          open.delete(name);
          open.add(next.name);
          return null;
        },
        close(saved) {
          if (saved) refresh();
          else fill();
        },
      });
      fold.body.replaceChildren(box.node);
      box.area.focus({ preventScroll: true });
    }

    /** A field for the preset's name, in the row's fold, which escape takes back. */
    function rename(): void {
      const problem = el("div", "ask");
      const back = (): void => {
        release();
        fill();
      };
      const save = (): void => {
        const typed = field.value.trim();
        if (typed === "") {
          problem.replaceChildren(noteLine("the preset needs a name"));
          return;
        }
        const next = { ...preset, name: freeName(typed, presets, preset) };
        const failed = savePresets(presets.map((entry) => (entry === preset ? next : entry)));
        if (failed !== null) {
          problem.replaceChildren(noteLine(failed));
          return;
        }
        release();
        open.delete(name);
        open.add(next.name);
        refresh();
      };
      const field = textField({ placeholder: "preset name", label: `name of ${name}`, value: name, onEnter: save });
      const release = shell.hold(back);
      fold.body.replaceChildren(
        stack([
          field,
          problem,
          controls([
            { label: "rename", run: save },
            { label: "cancel", run: back },
          ]).node,
        ]),
      );
      field.focus({ preventScroll: true });
    }

    function remove(): void {
      open.add(name);
      fold.set(true);
      askIn(
        shell,
        fold.body,
        `delete the preset ${name}?`,
        "delete",
        () => {
          open.delete(name);
          keep(presets.filter((entry) => entry !== preset));
        },
        fill,
      );
    }

    function fill(): void {
      const how = segments({
        label: `how ${name} applies`,
        options: [
          { value: "add", label: "add to what is there" },
          { value: "replace", label: "replace" },
        ],
        value: modes.get(name) ?? "add",
        onChange(value) {
          modes.set(name, value === "replace" ? "replace" : "add");
          how.set(value);
        },
      });
      const parts: HTMLElement[] = [
        how.node,
        controls([
          { label: "apply", run: apply },
          { label: "rename", run: rename },
          { label: "edit", run: edit },
          { label: "export", run: () => shell.copy(presetText(preset), `the preset ${name}`) },
          { label: "delete", run: remove },
        ]).node,
        switchLine({
          label: "apply on load",
          on: preset.onLoad,
          onChange(on) {
            if (!replace(preset, { ...preset, onLoad: on })) return;
            if (on) shell.say(`${name} is set on every load of this page, until it is turned off`);
          },
        }).node,
      ];
      if (preset.onLoad) {
        parts.push(
          switchLine({
            label: "clear local and session first",
            on: preset.clearFirst,
            onChange: (on) => void replace(preset, { ...preset, clearFirst: on }),
          }).node,
        );
      }
      fold.body.replaceChildren(stack(parts));
    }

    if (open.has(name)) fill();
    mains.push({ main: fold.main, remove });
    return fold.node;
  }

  function draw(): void {
    if (!canKeep()) {
      top.replaceChildren(stack([noteLine(FRESH_PRESETS)]));
      list.replaceChildren();
      shell.counted();
      return;
    }
    top.replaceChildren(stack([noteLine(onLoadLine(presets))]));
    const matching = filterPresets(presets, shell.query());
    mains = [];
    if (matching.length === 0) {
      list.replaceChildren(emptyLine(presets.length === 0 ? "no presets yet" : "nothing matches"));
    } else list.replaceChildren(...matching.map(row));
    shell.counted();
  }

  function refresh(): void {
    presets = loadPresets();
    read = true;
    draw();
  }

  rowKeys(list, () => mains);

  /** Closes the box a preset is written or pasted in, while one is open. */
  let closeMaking: (() => void) | null = null;

  /** A box to write or paste a preset's json in, which adds it once it checks out. */
  function make(label: string, action: string, value: string, placeholder: string): void {
    closeMaking?.();
    const box = editBox(shell, {
      label,
      value,
      placeholder,
      action,
      save(text) {
        const made = parsePreset(text);
        if (made.preset === null) return made.error;
        const preset = { ...made.preset, name: freeName(made.preset.name, presets) };
        const failed = savePresets([...presets, preset]);
        if (failed === null) open.add(preset.name);
        return failed;
      },
      close(saved) {
        closeMaking = null;
        making.replaceChildren();
        if (saved) refresh();
      },
    });
    closeMaking = box.cancel;
    making.replaceChildren(box.node);
    box.area.focus({ preventScroll: true });
  }

  return {
    node,
    live: false,
    noun: ["preset", "presets"],
    refresh,
    filter() {
      if (read) draw();
    },
    count: () => (read ? presets.length : null),
    controls(): ControlOption[] {
      if (!canKeep()) return [];
      return [
        { label: "new preset", run: () => make("a new preset as json", "add", templateText(), "") },
        { label: "import", run: () => make("a preset's json", "import", "", "paste a preset's json") },
      ];
    },
  };
}
