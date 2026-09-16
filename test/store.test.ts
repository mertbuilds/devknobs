import { describe, expect, test } from "bun:test";
import { DEFAULT_STATE, merge, parse } from "../src/engine/store";

describe("parse", () => {
  test("falls back to the defaults", () => {
    expect(parse(null)).toEqual(DEFAULT_STATE);
    expect(parse("")).toEqual(DEFAULT_STATE);
    expect(parse("not json")).toEqual(DEFAULT_STATE);
    expect(parse("[]")).toEqual(DEFAULT_STATE);
    expect(parse("null")).toEqual(DEFAULT_STATE);
    expect(parse("{}")).toEqual(DEFAULT_STATE);
  });

  test("keeps the valid fields and drops the rest", () => {
    const state = parse(
      JSON.stringify({
        scheme: "dark",
        motion: "loud",
        contrast: "more",
        locale: { lang: "tr", dir: "sideways" },
        geo: { preset: "tokyo", lat: "x" },
        text: 20,
        width: "full",
        outlines: "yes",
        panel: { open: false, y: 40, top: 24 },
        stray: 1,
      }),
    );
    expect(state).toEqual({
      scheme: "dark",
      motion: "system",
      contrast: "more",
      locale: { lang: "tr", dir: "system" },
      geo: { preset: "tokyo", lat: 0, lng: 0, accuracy: DEFAULT_STATE.geo.accuracy, timeZone: "" },
      text: 20,
      width: "full",
      outlines: false,
      panel: { open: false, y: 40, top: 24 },
    });
  });

  test("puts the panel where the handle is when the session predates its top", () => {
    expect(parse(JSON.stringify({ panel: { y: 200 } })).panel).toEqual({
      open: DEFAULT_STATE.panel.open,
      y: 200,
      top: 200,
    });
  });

  test("rejects sizes that are not positive numbers", () => {
    expect(parse(JSON.stringify({ text: 0, width: -10 }))).toMatchObject({
      text: "system",
      width: "full",
    });
    expect(parse(JSON.stringify({ text: "16px", width: 420 }))).toMatchObject({
      text: "system",
      width: 420,
    });
  });
});

describe("merge", () => {
  test("patches object knobs field by field", () => {
    const state = merge(DEFAULT_STATE, { geo: { preset: "tokyo" } });
    expect(state.geo).toEqual({ ...DEFAULT_STATE.geo, preset: "tokyo" });
    expect(state.locale).toEqual(DEFAULT_STATE.locale);
  });

  test("leaves the panel top alone when only the handle moves", () => {
    expect(merge(DEFAULT_STATE, { panel: { y: 300 } }).panel).toEqual({
      ...DEFAULT_STATE.panel,
      y: 300,
    });
  });

  test("replaces scalar knobs", () => {
    expect(merge(DEFAULT_STATE, { scheme: "dark", width: 420 })).toMatchObject({
      scheme: "dark",
      width: 420,
    });
  });

  test("leaves the source state alone", () => {
    merge(DEFAULT_STATE, { scheme: "dark", locale: { lang: "ar" } });
    expect(DEFAULT_STATE.scheme).toBe("system");
    expect(DEFAULT_STATE.locale.lang).toBe("system");
  });
});
