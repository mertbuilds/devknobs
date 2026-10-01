import { afterEach, describe, expect, test } from "bun:test";
import { canonicalTag, setDefaultLocale, withLocale } from "../src/engine/intl";

const NativeDateTimeFormat = Intl.DateTimeFormat;

afterEach(() => {
  setDefaultLocale(null);
});

describe("withLocale", () => {
  test("fills in locales that were left out", () => {
    expect(withLocale([], 0, "tr")).toEqual(["tr"]);
    expect(withLocale([undefined, { style: "percent" }], 0, "tr")).toEqual([
      "tr",
      { style: "percent" },
    ]);
    expect(withLocale([[]], 0, "tr")).toEqual(["tr"]);
    expect(withLocale(["b"], 1, "tr")).toEqual(["b", "tr"]);
  });

  test("keeps locales the caller passed", () => {
    const args = ["de", {}];
    expect(withLocale(args, 0, "tr")).toBe(args);
    expect(withLocale([["de", "en"]], 0, "tr")).toEqual([["de", "en"]]);
  });

  test("passes everything through without a tag", () => {
    const args: unknown[] = [];
    expect(withLocale(args, 0, null)).toBe(args);
  });
});

test("canonicalTag", () => {
  expect(canonicalTag("EN-us")).toBe("en-US");
  expect(canonicalTag("not a tag!")).toBeNull();
});

describe("setDefaultLocale", () => {
  test("every Intl service takes the tag when none is passed", () => {
    setDefaultLocale("tr");
    expect(new Intl.NumberFormat().resolvedOptions().locale).toBe("tr");
    expect(Intl.NumberFormat().resolvedOptions().locale).toBe("tr");
    expect(new Intl.NumberFormat([]).resolvedOptions().locale).toBe("tr");
    expect(new Intl.DateTimeFormat().resolvedOptions().locale).toBe("tr");
    expect(new Intl.Collator().resolvedOptions().locale).toBe("tr");
    expect(new Intl.PluralRules().resolvedOptions().locale).toBe("tr");
    expect(new Intl.RelativeTimeFormat().resolvedOptions().locale).toBe("tr");
    expect(new Intl.ListFormat().resolvedOptions().locale).toBe("tr");
    expect(new Intl.Segmenter().resolvedOptions().locale).toBe("tr");
    expect(new Intl.DisplayNames(undefined, { type: "region" }).resolvedOptions().locale).toBe(
      "tr",
    );
  });

  test("an explicit locale wins", () => {
    setDefaultLocale("tr");
    expect(new Intl.NumberFormat("de").resolvedOptions().locale).toBe("de");
    expect((1234.5).toLocaleString("en-US")).toBe("1,234.5");
  });

  test("the toLocale methods and localeCompare take the tag too", () => {
    setDefaultLocale("tr");
    expect((1234.5).toLocaleString()).toBe("1.234,5");
    expect((12345n).toLocaleString()).toBe("12.345");
    expect([1234.5].toLocaleString()).toBe("1.234,5");
    const epoch = new Date(0);
    expect(epoch.toLocaleDateString(undefined, { timeZone: "UTC" })).toBe(
      epoch.toLocaleDateString("tr", { timeZone: "UTC" }),
    );
    expect(epoch.toLocaleString(undefined, { timeZone: "UTC" })).toBe(
      epoch.toLocaleString("tr", { timeZone: "UTC" }),
    );
    expect(epoch.toLocaleTimeString(undefined, { timeZone: "UTC" })).toBe(
      epoch.toLocaleTimeString("tr", { timeZone: "UTC" }),
    );
    // Swedish sorts ä after z, German next to a.
    setDefaultLocale("sv");
    expect("ä".localeCompare("z")).toBe(1);
    expect("ä".localeCompare("z", "de")).toBe(-1);
  });

  test("instanceof, statics and identity keep working", () => {
    setDefaultLocale("tr");
    expect(new Intl.NumberFormat() instanceof Intl.NumberFormat).toBe(true);
    expect(Intl.NumberFormat.supportedLocalesOf(["tr"])).toEqual(["tr"]);
    expect(Intl.NumberFormat).toBe(Intl.NumberFormat);
    class Sub extends Intl.NumberFormat {}
    const sub = new Sub();
    expect(sub instanceof Sub).toBe(true);
    expect(sub.resolvedOptions().locale).toBe("tr");
  });

  test("puts every member back exactly", () => {
    const before = Object.getOwnPropertyDescriptor(Intl, "NumberFormat");
    const method = Number.prototype.toLocaleString;
    setDefaultLocale("tr");
    expect(Intl.NumberFormat).not.toBe(before?.value);
    setDefaultLocale(null);
    expect(Object.getOwnPropertyDescriptor(Intl, "NumberFormat")).toEqual(before!);
    expect(Intl.NumberFormat).toBe(before?.value);
    expect(Number.prototype.toLocaleString).toBe(method);
  });

  test("composes with a DateTimeFormat assigned on top, and leaves it on reset", () => {
    setDefaultLocale("tr");
    const zoned = new Proxy(NativeDateTimeFormat, {
      construct: (target, [locales, options]: unknown[]) =>
        new target(locales as string, { ...(options ?? {}), timeZone: "Asia/Tokyo" }),
    });
    Intl.DateTimeFormat = zoned;
    const options = new Intl.DateTimeFormat().resolvedOptions();
    expect(options.locale).toBe("tr");
    expect(options.timeZone).toBe("Asia/Tokyo");
    setDefaultLocale(null);
    expect(Intl.DateTimeFormat).toBe(zoned);
    Intl.DateTimeFormat = NativeDateTimeFormat;
  });

  test("a proxy assigned back is not wrapped twice", () => {
    setDefaultLocale("tr");
    const kept = Intl.DateTimeFormat;
    Intl.DateTimeFormat = kept;
    expect(Intl.DateTimeFormat).toBe(kept);
    setDefaultLocale(null);
    expect(Intl.DateTimeFormat).toBe(NativeDateTimeFormat);
  });

  test("an instance assigning its own method keeps it to itself", () => {
    setDefaultLocale("tr");
    const date = new Date(0);
    const own = () => "own";
    date.toLocaleString = own;
    expect(date.toLocaleString()).toBe("own");
    expect(new Date(0).toLocaleString(undefined, { timeZone: "UTC" })).toBe(
      new Date(0).toLocaleString("tr", { timeZone: "UTC" }),
    );
  });

  test("a proxy kept from before goes quiet on reset", () => {
    setDefaultLocale("tr");
    const Kept = Intl.NumberFormat;
    setDefaultLocale(null);
    expect(new Kept().resolvedOptions().locale).not.toBe("tr");
  });

  test("an invalid tag patches nothing", () => {
    const before = Intl.NumberFormat;
    setDefaultLocale("not a tag!");
    expect(Intl.NumberFormat).toBe(before);
  });
});
