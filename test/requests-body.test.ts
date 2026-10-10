import { describe, expect, test } from "bun:test";
import { clipText, describeBody, isText, readText } from "../src/requests/body";
import { trimStack } from "../src/requests/stack";
import { BODY_CAP } from "../src/requests/types";
import { streamOf } from "./requests-fakes";

describe("clipText", () => {
  test("keeps a short text whole, with its size in bytes", () => {
    expect(clipText("héllo", "text/plain")).toEqual({
      kind: "text",
      text: "héllo",
      size: 6,
      truncated: false,
      type: "text/plain",
    });
  });

  test("cuts at the cap and says so", () => {
    const record = clipText("a".repeat(BODY_CAP + 10), "text/plain");
    expect(record.text.length).toBe(BODY_CAP);
    expect(record.truncated).toBe(true);
    // The whole was never measured.
    expect(record.size).toBeNull();
    expect(clipText("a".repeat(BODY_CAP), "text/plain")).toMatchObject({ truncated: false, size: BODY_CAP });
  });

  test("counts the cap in bytes, and never ends on half a character", () => {
    const record = clipText("é".repeat(4), "text/plain", 5);
    expect(record).toMatchObject({ text: "éé", size: 8, truncated: true });
    // A long text too, of which only the head is measured.
    expect(clipText("é".repeat(40), "text/plain", 5)).toMatchObject({ text: "éé", size: null, truncated: true });
    // A cut between the two halves of a character leaves neither.
    expect(clipText("aaaa😀bbbb", "text/plain", 5)).toMatchObject({ text: "aaaa", truncated: true });
    expect(clipText("aa😀bbbbbb", "text/plain", 5)).toMatchObject({ text: "aa", truncated: true });
  });

  // The engines keep the whole parent string alive behind a slice of it, so a
  // row that kept `text.slice(0, cap)` would pin megabytes for its 64 KB. No
  // test can see what a string holds on to, so this one checks the way the
  // copy is made: the kept text is what the decoder made of the head's bytes,
  // and the long text was never encoded whole.
  test("what is kept of a long text is a copy of its head, not a slice of the whole", () => {
    const decode = TextDecoder.prototype.decode;
    const encode = TextEncoder.prototype.encode;
    const decoded: string[] = [];
    const encoded: number[] = [];
    TextDecoder.prototype.decode = function (...args: Parameters<typeof decode>): string {
      const text = decode.apply(this, args);
      decoded.push(text);
      return text;
    };
    TextEncoder.prototype.encode = function (input?: string): ReturnType<typeof encode> {
      encoded.push(input?.length ?? 0);
      return encode.call(this, input);
    };
    try {
      const record = clipText("a".repeat(5 * BODY_CAP), "text/plain");
      expect(record).toMatchObject({ truncated: true, size: null });
      expect(record.text).toBe("a".repeat(BODY_CAP));
      expect(decoded).toEqual([record.text]);
      expect(encoded).toEqual([BODY_CAP]);
    } finally {
      TextDecoder.prototype.decode = decode;
      TextEncoder.prototype.encode = encode;
    }
  });
});

describe("describeBody", () => {
  test("nothing sent is no body", () => {
    expect(describeBody(undefined, "")).toBeNull();
    expect(describeBody(null, "")).toBeNull();
  });

  test("a string and search params are text, typed as the browser would send them", () => {
    expect(describeBody("hi", "")).toMatchObject({ kind: "text", text: "hi", type: "text/plain;charset=UTF-8" });
    expect(describeBody('{"a":1}', "application/json")).toMatchObject({ text: '{"a":1}', type: "application/json" });
    expect(describeBody(new URLSearchParams({ a: "1", b: "x y" }), "")).toMatchObject({
      kind: "text",
      text: "a=1&b=x+y",
      type: "application/x-www-form-urlencoded;charset=UTF-8",
    });
  });

  test("a form is a line per field, and a file is named, not read", () => {
    const form = new FormData();
    form.set("name", "Ada");
    form.set("photo", new File(["12345"], "me.png", { type: "image/png" }));
    expect(describeBody(form, "")).toEqual({
      kind: "form",
      text: "name=Ada\nphoto=(file me.png, image/png, 5 bytes)",
      size: null,
      truncated: false,
      type: "multipart/form-data",
    });
  });

  test("bytes are counted and named", () => {
    expect(describeBody(new Blob(["abc"], { type: "image/png" }), "")).toEqual({
      kind: "binary",
      text: "",
      size: 3,
      truncated: false,
      type: "image/png",
    });
    expect(describeBody(new ArrayBuffer(8), "")).toMatchObject({ kind: "binary", size: 8, type: "ArrayBuffer" });
    expect(describeBody(new Uint8Array(4), "application/octet-stream")).toMatchObject({
      kind: "binary",
      size: 4,
      type: "application/octet-stream",
    });
  });

  test("a stream is named and left unread", () => {
    const { stream } = streamOf(["a"]);
    expect(describeBody(stream, "text/plain")).toEqual({
      kind: "stream",
      text: "",
      size: null,
      truncated: false,
      type: "text/plain",
    });
    expect(stream.locked).toBe(false);
  });
});

describe("isText", () => {
  test("tells text from bytes by the content type", () => {
    for (const type of [
      "text/html; charset=utf-8",
      "application/json",
      "application/problem+json",
      "application/xml",
      "image/svg+xml",
      "application/javascript",
      "application/x-www-form-urlencoded",
    ]) {
      expect([type, isText(type)]).toEqual([type, true]);
    }
    for (const type of ["", "image/png", "application/octet-stream", "font/woff2", "application/pdf"]) {
      expect([type, isText(type)]).toEqual([type, false]);
    }
  });
});

describe("readText", () => {
  test("reads a body to its end", async () => {
    const { stream } = streamOf(["hel", "lo"]);
    expect(await readText({ body: stream, blob: () => Promise.reject() }, "text/plain")).toEqual({
      record: { kind: "text", text: "hello", size: 5, truncated: false, type: "text/plain" },
      complete: true,
    });
  });

  test("stops at the cap and lets the rest go unread", async () => {
    const source = streamOf(["abcd", "efgh", "ijkl"], false);
    const read = await readText({ body: source.stream, blob: () => Promise.reject() }, "text/plain", 6);
    expect(read).toEqual({
      record: { kind: "text", text: "abcdef", size: null, truncated: true, type: "text/plain" },
      complete: false,
    });
    await Promise.resolve();
    expect(source.cancelled()).toBe(true);
  });

  test("a body still coming after the wait is let go, with what came of it", async () => {
    const source = streamOf(["abcd"], false);
    const read = await readText({ body: source.stream, blob: () => Promise.reject() }, "text/plain", 64, 20);
    expect(read).toEqual({
      record: { kind: "text", text: "abcd", size: null, truncated: true, timedOut: true, type: "text/plain" },
      complete: false,
    });
    expect(source.cancelled()).toBe(true);
  });

  test("a body that ends in time is whole, and nothing is cancelled later", async () => {
    const source = streamOf(["abcd"]);
    const read = await readText({ body: source.stream, blob: () => Promise.reject() }, "text/plain", 64, 20);
    expect(read.record).toEqual({ kind: "text", text: "abcd", size: 4, truncated: false, type: "text/plain" });
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(source.cancelled()).toBe(false);
  });

  test("a body of exactly the cap is whole", async () => {
    const { stream } = streamOf(["abc", "def"]);
    const read = await readText({ body: stream, blob: () => Promise.reject() }, "text/plain", 6);
    expect(read.record).toMatchObject({ text: "abcdef", size: 6, truncated: false });
  });

  test("a character split over two chunks comes out whole", async () => {
    const bytes = new TextEncoder().encode("é");
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.subarray(0, 1));
        controller.enqueue(bytes.subarray(1));
        controller.close();
      },
    });
    const read = await readText({ body: stream, blob: () => Promise.reject() }, "text/plain");
    expect(read.record.text).toBe("é");
  });

  test("without a stream to read, the head of the whole body is taken", async () => {
    const copy = { body: undefined, blob: () => Promise.resolve(new Blob(["abcdefgh"])) };
    expect((await readText(copy, "text/plain", 3)).record).toEqual({
      kind: "text",
      text: "abc",
      size: 8,
      truncated: true,
      type: "text/plain",
    });
  });
});

describe("trimStack", () => {
  const V8 = "Error\n    at fetch (devknobs.js:1:1)\n    at load (app.js:10:5)\n    at main (app.js:2:1)";
  const OTHERS = "fetch@devknobs.js:1:1\nload@app.js:10:5\nmain@app.js:2:1\n";

  test("drops the error's own line and devknobs' frames, in either engine's writing", () => {
    expect(trimStack(V8, 1)).toBe("at load (app.js:10:5)\nat main (app.js:2:1)");
    expect(trimStack(OTHERS, 1)).toBe("load@app.js:10:5\nmain@app.js:2:1");
  });

  test("keeps a dozen frames at most, and nothing of no stack", () => {
    const deep = Array.from({ length: 40 }, (_, index) => `at f${index} (app.js:${index}:1)`).join("\n");
    expect(trimStack(`Error\n${deep}`, 1).split("\n").length).toBe(12);
    expect(trimStack(undefined, 1)).toBe("");
  });
});
