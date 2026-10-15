import { describe, expect, test } from "bun:test";
import { ACTIONS, KNOBS, ROWS, rowOf } from "../src/ui/catalog";
import { BINDING_ICONS, BRANDS, ICONS, ROW_ICONS, rowIcon } from "../src/ui/icons";

describe("icons", () => {
  test("every row has an icon", () => {
    for (const row of ROWS) expect(Object.keys(ICONS)).toContain(rowIcon(row));
  });

  test("every knob has its row's icon to show in the search", () => {
    for (const knob of KNOBS) expect(ROW_ICONS[rowOf(knob.id).id]).toBeDefined();
  });

  test("every action names its icon, which its shortcut shows too", () => {
    for (const action of ACTIONS) {
      expect(Object.keys(ICONS)).toContain(action.icon);
      if (action.binding) expect(BINDING_ICONS[action.binding]).toBe(action.icon);
    }
  });

  test("every icon named is in the map, with shapes to draw", () => {
    const names = [...Object.values(ROW_ICONS), ...ACTIONS.map((action) => action.icon)];
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
