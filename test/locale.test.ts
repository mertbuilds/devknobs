import { describe, expect, test } from "bun:test";
import { dirFor, isRtl, languagesFor, LOCALE_PRESETS } from "../src/engine/locale";

describe("isRtl", () => {
  test("knows the right to left languages", () => {
    for (const lang of ["ar", "he", "fa", "ur", "ar-EG", "HE"]) {
      expect(isRtl(lang)).toBe(true);
    }
  });

  test("everything else is left to right", () => {
    for (const lang of ["en", "en-US", "tr", "de", "ja", "zh-CN", ""]) {
      expect(isRtl(lang)).toBe(false);
    }
  });
});

describe("dirFor", () => {
  test("derives the direction from the language", () => {
    expect(dirFor({ lang: "ar", dir: "system" })).toBe("rtl");
    expect(dirFor({ lang: "tr", dir: "system" })).toBe("ltr");
  });

  test("an explicit direction wins", () => {
    expect(dirFor({ lang: "ar", dir: "ltr" })).toBe("ltr");
    expect(dirFor({ lang: "en", dir: "rtl" })).toBe("rtl");
  });
});

describe("languagesFor", () => {
  test("adds the base tag", () => {
    expect(languagesFor("en-US")).toEqual(["en-US", "en"]);
    expect(languagesFor("zh-CN")).toEqual(["zh-CN", "zh"]);
  });

  test("keeps a bare tag alone", () => {
    expect(languagesFor("tr")).toEqual(["tr"]);
  });
});

test("locale presets", () => {
  expect(LOCALE_PRESETS).toEqual(["en", "en-US", "tr", "de", "fr", "es", "ar", "he", "ja", "zh-CN"]);
});
