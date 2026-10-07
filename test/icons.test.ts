import { describe, expect, test } from "bun:test";
import { ACTIONS, KNOBS, ROWS, rowOf } from "../src/ui/catalog";
import { ACTION_ICONS, ICONS, ROW_ICONS } from "../src/ui/icons";

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
});
