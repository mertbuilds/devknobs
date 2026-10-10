import { describe as group, expect, test } from "bun:test";
import {
  byteSize,
  describe,
  isJson,
  preview,
  pretty,
  RENDER_LIMIT,
  relative,
  SHOW_ALL_LIMIT,
  shown,
  sizeLabel,
} from "../src/storage/format";

group("sizes", () => {
  test("a value weighs its UTF-8 bytes", () => {
    expect(byteSize("")).toBe(0);
    expect(byteSize("abc")).toBe(3);
    expect(byteSize("é")).toBe(2);
    expect(byteSize("€")).toBe(3);
    expect(byteSize("😀")).toBe(4);
    for (const text of ["naïve café", "日本語", "a😀b€c", "\ud800", "\ud800x"]) {
      expect(byteSize(text)).toBe(new TextEncoder().encode(text).length);
    }
  });

  test("are said in the largest unit that fits", () => {
    expect(sizeLabel(0)).toBe("0 B");
    expect(sizeLabel(1023)).toBe("1023 B");
    expect(sizeLabel(1024)).toBe("1 KB");
    expect(sizeLabel(1536)).toBe("1.5 KB");
    expect(sizeLabel(12 * 1024)).toBe("12 KB");
    expect(sizeLabel(250 * 1024)).toBe("250 KB");
    expect(sizeLabel(3.4 * 1024 * 1024)).toBe("3.4 MB");
  });
});

group("preview", () => {
  test("is the value on one line", () => {
    expect(preview("  a\n  b\t c ")).toBe("a b c");
  });

  test("cuts a long value in the middle, keeping both ends", () => {
    const text = `start${"x".repeat(500)}end`;
    const cut = preview(text, 21);
    expect(cut.length).toBe(21);
    expect(cut.startsWith("start")).toBe(true);
    expect(cut.endsWith("end")).toBe(true);
    expect(cut).toContain("…");
  });

  test("reads only the ends of a huge value", () => {
    const huge = `${"a".repeat(5_000_000)}z`;
    const started = performance.now();
    expect(preview(huge).endsWith("z")).toBe(true);
    expect(performance.now() - started).toBeLessThan(50);
  });
});

group("pretty", () => {
  test("lays out an object or an array that loses nothing by it", () => {
    expect(pretty('{"a":1,"b":[true,null,"x"]}')).toBe(JSON.stringify({ a: 1, b: [true, null, "x"] }, null, 2));
    expect(pretty(' [1, 2,\n 3] ')).toBe("[\n  1,\n  2,\n  3\n]");
    expect(pretty('{"text":"a  b\\n{}"}')).toBe('{\n  "text": "a  b\\n{}"\n}');
  });

  test("leaves a plain value, and text that is not json, as it is", () => {
    for (const text of ["12", '"text"', "true", "hello", "{not json", ""]) expect(pretty(text)).toBeNull();
  });

  test("leaves raw what a round trip would change", () => {
    // A number too long for a double, a key said twice, keys the engine reorders, and another way to write a number.
    expect(pretty('{"id":12345678901234567890}')).toBeNull();
    expect(pretty('{"a":1,"a":2}')).toBeNull();
    expect(pretty('{"b":1,"2":2}')).toBeNull();
    expect(pretty('{"n":1.0}')).toBeNull();
    expect(pretty('{"n":1e2}')).toBeNull();
    expect(pretty('{"s":"\\u0041"}')).toBeNull();
  });

  test("never parses a value past the render limit", () => {
    const big = JSON.stringify({ text: "x".repeat(RENDER_LIMIT) });
    expect(pretty(big)).toBeNull();
  });

  test("isJson says whether a text reads as json at all", () => {
    expect(isJson('{"a":1}')).toBe(true);
    expect(isJson("12")).toBe(true);
    expect(isJson("{a:1}")).toBe(false);
    expect(isJson("hello")).toBe(false);
  });
});

group("shown", () => {
  test("a value under the limit shows whole", () => {
    expect(shown("abc")).toEqual({ text: "abc", more: 0, canShowAll: false });
  });

  test("a long one is cut, and can be shown whole up to the larger limit", () => {
    const text = "x".repeat(RENDER_LIMIT + 5);
    const part = shown(text);
    expect(part.text.length).toBe(RENDER_LIMIT);
    expect(part.more).toBe(5);
    expect(part.canShowAll).toBe(true);
    expect(shown(text, true)).toEqual({ text, more: 0, canShowAll: false });
  });

  test("past the larger limit it can only be copied", () => {
    const text = "x".repeat(SHOW_ALL_LIMIT + 1);
    expect(shown(text).canShowAll).toBe(false);
    expect(shown(text, true).text.length).toBe(SHOW_ALL_LIMIT);
    expect(shown(text, true).more).toBe(1);
  });
});

group("relative", () => {
  test("says how far a time is, in its largest unit", () => {
    const now = 1_000_000_000_000;
    const day = 86_400_000;
    expect(relative(now + 3 * day + 5000, now)).toBe("in 3 days");
    expect(relative(now + day, now)).toBe("in 1 day");
    expect(relative(now - 2 * 3_600_000, now)).toBe("2 hours ago");
    expect(relative(now + 400 * day, now)).toBe("in 1 year");
    expect(relative(now + 200, now)).toBe("now");
  });
});

group("describe", () => {
  test("writes plain values as json does", () => {
    expect(describe({ a: 1, b: ["x", true, null] })).toBe('{"a":1, "b":["x", true, null]}');
    expect(describe("text")).toBe('"text"');
    expect(describe(undefined)).toBe("undefined");
    expect(describe(12n)).toBe("12n");
  });

  test("names what json has no word for", () => {
    expect(describe(new Date(0))).toBe("Date 1970-01-01T00:00:00.000Z");
    expect(describe(new Date(Number.NaN))).toBe("Date invalid");
    expect(describe(new Blob(["x".repeat(12 * 1024)], { type: "image/png" }))).toBe("Blob 12 KB image/png");
    expect(describe(new ArrayBuffer(4096))).toBe("bytes 4 KB");
    expect(describe(new Uint8Array(10))).toBe("bytes 10 B");
    expect(describe(new Map([["a", 1]]))).toBe('Map {"a" => 1}');
    expect(describe(new Set([1, 2]))).toBe("Set [1, 2]");
  });

  test("cuts a value that holds itself at the loop", () => {
    const loop: Record<string, unknown> = { name: "a" };
    loop.self = loop;
    expect(describe(loop)).toBe('{"name":"a", "self":(cycle)}');
    // The same value twice is no loop.
    const shared = { n: 1 };
    expect(describe([shared, shared])).toBe('[{"n":1}, {"n":1}]');
  });

  test("cuts a huge value once its room is written", () => {
    const huge = Array.from({ length: 100_000 }, (_, at) => ({ at, text: "x".repeat(50) }));
    const started = performance.now();
    const text = describe(huge, false, 500);
    expect(performance.now() - started).toBeLessThan(50);
    expect(text.length).toBeLessThan(1500);
    expect(text.endsWith("…]")).toBe(true);
    expect(describe("y".repeat(10_000), false, 100).length).toBeLessThan(120);
  });

  test("goes over lines with indent", () => {
    expect(describe({ a: [1] }, true)).toBe('{\n  "a": [\n    1\n  ]\n}');
  });
});
