import { isCustomColor, readColor } from "../engine/color";
import { fresh, webStorage } from "../engine/fresh";
import { newer, stamped } from "../engine/stored";
import type { CustomColor } from "../types";

/**
 * Where the colors the user added are kept, in `localStorage`, so a site has
 * them across reloads and in new tabs of the origin. Reset all leaves them,
 * and fresh mode starts with none and keeps none.
 */
export const COLORS_KEY = "devknobs:colors";

/** The version of the colors `COLORS_KEY` keeps. Bump it with a new shape, see stored.ts. */
export const COLORS_VERSION = 1;

/** The most colors of the user's own a knob lists. One more takes the oldest off. */
export const MOST_COLORS = 8;

/** A knob's list of colors of the user's own: the mat's, or grab's. */
export type ColorList = "mat" | "grab";

/** The colors the user added, each list oldest first. */
export type Colors = Readonly<Record<ColorList, readonly CustomColor[]>>;

/** A list as kept: only the colors that read, each once, the newest `MOST_COLORS` of them. */
function listOf(value: unknown): CustomColor[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter(isCustomColor))).slice(-MOST_COLORS);
}

/** Read the stored colors, keeping only the ones that read. */
export function readColors(json: string | null | undefined): Colors {
  let value: unknown = null;
  try {
    value = json ? JSON.parse(json) : null;
  } catch {
    value = null;
  }
  if (typeof value !== "object" || value === null || newer(value, COLORS_VERSION)) {
    return { mat: [], grab: [] };
  }
  return { mat: listOf(Reflect.get(value, "mat")), grab: listOf(Reflect.get(value, "grab")) };
}

/** The colors as `COLORS_KEY` keeps them. */
export function colorsText(colors: Colors): string {
  return JSON.stringify(stamped({ mat: colors.mat, grab: colors.grab }, COLORS_VERSION));
}

/**
 * A list with a color added at its end. One it has stays where it is, and one
 * past the most takes the oldest off.
 */
export function addColor(list: readonly CustomColor[], color: CustomColor): CustomColor[] {
  return list.includes(color) ? [...list] : [...list, color].slice(-MOST_COLORS);
}

/** A list without a color. */
export function dropColor(list: readonly CustomColor[], color: CustomColor): CustomColor[] {
  return list.filter((entry) => entry !== color);
}

/** What a color typed or picked comes to: the value the knob takes, and the list from there. */
export interface Picked {
  value: string;
  list: CustomColor[];
}

/**
 * Take a color typed or picked for a knob with `options` and `list`. One the
 * same as an option's color picks that option, and one the list has picks
 * that one, so no color stands twice. A new one joins the list and is picked.
 * Null for what does not read as a color.
 */
export function pickColor(
  text: string,
  options: readonly { value: string; color?: CustomColor }[],
  list: readonly CustomColor[],
): Picked | null {
  const color = readColor(text);
  if (!color) return null;
  const same = options.find((option) => option.color === color);
  if (same) return { value: same.value, list: [...list] };
  return { value: color, list: addColor(list, color) };
}

function loadColors(): Colors {
  try {
    return readColors(webStorage("local")?.getItem(COLORS_KEY));
  } catch {
    return readColors(null);
  }
}

function keepColors(colors: Colors): void {
  try {
    const local = webStorage("local");
    if (colors.mat.length + colors.grab.length === 0) local?.removeItem(COLORS_KEY);
    else local?.setItem(COLORS_KEY, colorsText(colors));
  } catch {
    // Private mode, disabled storage: the colors hold until the page goes.
  }
}

/** The colors the user added, in step with the ones added or taken off, here or in another tab. */
export interface LiveColors {
  get(): Colors;
  /** Put a list in place of the one kept. */
  set(list: ColorList, colors: readonly CustomColor[]): void;
  /** Hear the colors change. Returns the way to stop. */
  subscribe(listener: () => void): () => void;
  destroy(): void;
}

export function createColors(): LiveColors {
  let colors = loadColors();
  const listeners = new Set<() => void>();

  function changed(): void {
    for (const listener of Array.from(listeners)) listener();
  }

  function onStorage(event: StorageEvent): void {
    if (event.key !== COLORS_KEY && event.key !== null) return;
    // In fresh mode nothing kept is read: a color added here holds, whatever another tab keeps.
    if (fresh()) return;
    colors = loadColors();
    changed();
  }

  if (typeof window !== "undefined") window.addEventListener("storage", onStorage);

  return {
    get: () => colors,
    set(list, next) {
      colors = { ...colors, [list]: listOf(next) };
      keepColors(colors);
      changed();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    destroy() {
      listeners.clear();
      if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
    },
  };
}
