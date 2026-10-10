import { describe, expect, test } from "bun:test";
import { ACTIONS, KNOBS, ROWS, rowOf } from "../src/ui/catalog";
import { ACTION_ICONS, BRANDS, ICONS, ROW_ICONS } from "../src/ui/icons";

describe("icons", () => {
  test("every row has an icon", () => {
    for (const row of ROWS) expect(ROW_ICONS[row.id]).toBeDefined();
  });

  test("every knob has its row's icon to show in the search", () => {
    for (const knob of KNOBS) expect(ROW_ICONS[rowOf(knob.id).id]).toBeDefined();
  });

  test("every action has an icon", () => {
    for (const action of ACTIONS) expect(ACTION_ICONS[action.id]).toBeDefined();
  });

  test("every icon named is in the map, with shapes to draw", () => {
    const names = [...Object.values(ROW_ICONS), ...Object.values(ACTION_ICONS)];
    for (const name of names) {
      expect(Object.keys(ICONS)).toContain(name);
      expect(ICONS[name].length).toBeGreaterThan(0);
    }
  });

  test("each mark has the color Simple Icons lists for it, and JSON the text's", () => {
    const fills = Object.entries(BRANDS).map(([name, [fill, d]]) => [name, fill, d.startsWith("M")]);
    expect(fills).toEqual([
      ["javascript", "#F7DF1E", true],
      ["css", "#663399", true],
      ["html5", "#E34F26", true],
      ["webassembly", "#654FF0", true],
      ["json", "currentColor", true],
    ]);
  });
});
