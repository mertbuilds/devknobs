import { afterEach, describe, expect, test } from "bun:test";
import { copyGrab, clipboardData } from "../src/grab/clipboard";
import { formatEntry, joinEntries } from "../src/grab/context";
import type { GrabEntry, GrabPayload } from "../src/grab/types";

function entry(content: string): GrabEntry {
  return {
    tagName: "button",
    componentName: "Save",
    content,
    source: {
      filePath: "src/Save.tsx",
      lineNumber: 4,
      columnNumber: 2,
      componentName: "Save",
      origin: "app",
      symbolicated: true,
    },
    stackContext: "\n  in Save (at src/Save.tsx:4:2)",
    frames: [{ functionName: "Save", fileName: "src/Save.tsx", lineNumber: 4, columnNumber: 2 }],
  };
}

const PAYLOAD: GrabPayload = {
  content: "[<b>a & b</b> in Save]\n[<i /> in Other]",
  entries: [entry("[<b>a & b</b> in Save]"), entry("[<i /> in Other]")],
};

describe("formatEntry", () => {
  test("puts html, trace, key and selector on one line in brackets", () => {
    const trace = "\n  in Save (at src/Save.tsx:4:2)\n  in Form (at src/Form.tsx:9:1)";
    expect(formatEntry("<button>Save</button>", trace, "row-1", '[data-testid="save"]')).toBe(
      '[<button>Save</button> in Save (at src/Save.tsx:4:2) in Form (at src/Form.tsx:9:1) key: "row-1" selector: [data-testid="save"]]',
    );
  });

  test("leaves out a missing key or selector, and quotes and cuts a long key", () => {
    expect(formatEntry("<div />", "", null, null)).toBe("[<div />]");
    const key = `"${"k".repeat(200)}`;
    expect(formatEntry("<li />", "", key, null)).toBe(
      `[<li /> key: ${JSON.stringify(`${key.slice(0, 120)}...`)}]`,
    );
  });
});

describe("joinEntries", () => {
  test("puts one element per line", () => {
    expect(joinEntries([entry("[one]"), entry("[two]"), entry("[three]")])).toBe(
      "[one]\n[two]\n[three]",
    );
  });
});

describe("clipboardData", () => {
  test("carries plain text, escaped html and both json types", () => {
    const data = clipboardData(PAYLOAD, 42);
    expect(data["text/plain"]).toBe(PAYLOAD.content);
    expect(data["text/html"]).toBe(
      "<meta charset='utf-8'><pre><code>[&lt;b&gt;a &amp; b&lt;/b&gt; in Save]\n[&lt;i /&gt; in Other]</code></pre>",
    );
    expect(JSON.parse(data["application/x-devknobs-grab"] ?? "")).toEqual({
      ...PAYLOAD,
      timestamp: 42,
    });
  });

  test("gives react-grab's type its own shape", () => {
    const parsed: unknown = JSON.parse(
      clipboardData(PAYLOAD, 42)["application/x-react-grab"] ?? "",
    );
    expect(parsed).toEqual({
      version: "devknobs",
      content: PAYLOAD.content,
      timestamp: 42,
      entries: PAYLOAD.entries.map((one) => ({
        tagName: one.tagName,
        componentName: one.componentName,
        content: one.content,
        source: one.source,
        stackContext: one.stackContext,
        frames: one.frames,
      })),
    });
  });
});

describe("copyGrab", () => {
  const realNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const set = new Map<string, string>();
  let listener: ((event: ClipboardEvent) => void) | null = null;
  let copies = true;
  let written: string | null = null;

  function setGlobals(): void {
    const textarea = { value: "", style: {}, setAttribute() {}, select() {}, remove() {} };
    const doc = {
      body: { append() {} },
      createElement: () => textarea,
      addEventListener: (_: string, handler: (event: ClipboardEvent) => void) => {
        listener = handler;
      },
      removeEventListener: () => {
        listener = null;
      },
      execCommand: () => {
        if (!copies) return false;
        const event = {
          preventDefault() {},
          clipboardData: { setData: (t: string, v: string) => set.set(t, v) },
        };
        listener?.(event as unknown as ClipboardEvent);
        return true;
      },
    };
    Object.defineProperty(globalThis, "document", { configurable: true, value: doc });
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { clipboard: { writeText: async (text: string) => void (written = text) } },
    });
  }

  afterEach(() => {
    set.clear();
    listener = null;
    copies = true;
    written = null;
    Reflect.deleteProperty(globalThis, "document");
    if (realNavigator) Object.defineProperty(globalThis, "navigator", realNavigator);
  });

  test("puts every type on the clipboard inside the copy event, and stops listening", async () => {
    setGlobals();
    expect(await copyGrab(PAYLOAD)).toBe(true);
    expect([...set.keys()].sort()).toEqual([
      "application/x-devknobs-grab",
      "application/x-react-grab",
      "text/html",
      "text/plain",
    ]);
    expect(listener).toBeNull();
  });

  test("falls back to the text alone when the copy command fails", async () => {
    setGlobals();
    copies = false;
    expect(await copyGrab(PAYLOAD)).toBe(true);
    expect(written).toBe(PAYLOAD.content);
    expect(set.size).toBe(0);
  });
});
