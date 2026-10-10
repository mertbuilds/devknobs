import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { codeBlock, group, LONG_LINE, pairs, splitBar } from "../src/ui/kit";
import { CSS } from "../src/ui/styles";
import { rules } from "./kit-dom";
import { fake, fakeDocument, leaveDocument } from "./requests-dom";

/** The body of the one rule with this selector. */
function body(selector: string): string {
  const found = rules(CSS).filter((rule) => rule.selector === selector);
  if (found.length !== 1) throw new Error(`${found.length} rules for ${selector}`);
  return found[0]?.body ?? "";
}

beforeEach(fakeDocument);
afterEach(leaveDocument);

describe("group", () => {
  test("is a named group: its label, then what its first line ends with, and room for what it holds", () => {
    const copy = document.createElement("button");
    const node = fake(group({ label: "response", ends: [copy] }));
    expect(node.className).toBe("group");
    expect(node.getAttribute("role")).toBe("group");
    expect(node.getAttribute("aria-label")).toBe("response");
    expect(node.nodes().map((child) => child.className)).toEqual(["group-head"]);
    const head = node.one("group-head");
    expect(head.nodes()[0]?.className).toBe("group-label");
    expect(head.nodes()[0]?.textContent).toBe("response");
    expect(head.nodes()[1]).toBe(fake(copy));
    expect(fake(group({ label: "timing" })).one("group-head").nodes()).toHaveLength(1);
  });
});

describe("pairs", () => {
  const LINES = [
    ["content-type", "application/json"],
    ["x-id", "7"],
  ] as const;

  test("is a list of names and values, a name and then its value", () => {
    const node = fake(pairs(LINES).node);
    expect(node.tag).toBe("dl");
    expect(node.className).toBe("pairs");
    expect(node.nodes().map((cell) => [cell.tag, cell.className, cell.textContent])).toEqual([
      ["dt", "pair-name", "content-type"],
      ["dd", "pair-value", "application/json"],
      ["dt", "pair-name", "x-id"],
      ["dd", "pair-value", "7"],
    ]);
  });

  test("keeps the pairs that match, name and value together, and says how many", () => {
    const list = pairs(LINES);
    expect(list.keep((name) => name === "x-id")).toBe(1);
    expect(fake(list.node).nodes().map((cell) => cell.hidden)).toEqual([true, true, false, false]);
    expect(list.keep((_name, value) => value.includes("json"))).toBe(1);
    expect(fake(list.node).nodes().map((cell) => cell.hidden)).toEqual([false, false, true, true]);
    expect(list.keep(() => true)).toBe(2);
    expect(list.keep(() => false)).toBe(0);
  });
});

describe("codeBlock", () => {
  test("is the text as written, with no control where no line is long", () => {
    const code = codeBlock({ text: '{\n  "a": 1\n}' });
    const node = fake(code.node);
    expect(node.className).toBe("code");
    expect(node.nodes().map((child) => [child.tag, child.className])).toEqual([["pre", "code-text"]]);
    expect(node.one("code-text").textContent).toBe('{\n  "a": 1\n}');
    expect(code.wrap).toBeNull();
  });

  test("a text with a long line gets the choice not to wrap, on at first", () => {
    expect(codeBlock({ text: "x".repeat(LONG_LINE) }).wrap).toBeNull();
    const code = codeBlock({ text: `short\n${"x".repeat(LONG_LINE + 1)}` });
    const wrap = fake(code.wrap);
    const text = fake(code.node).one("code-text");
    expect(wrap.textContent).toBe("wrap");
    expect(wrap.className).toBe("chip code-wrap on");
    expect(wrap.getAttribute("aria-pressed")).toBe("true");
    wrap.click();
    expect(wrap.getAttribute("aria-pressed")).toBe("false");
    expect(text.className).toBe("code-text nowrap");
    wrap.click();
    expect(wrap.className).toBe("chip code-wrap on");
    expect(text.className).toBe("code-text");
  });

  test("a text longer than the lines asked for shows those, and all of it once asked", () => {
    const lines = Array.from({ length: 5 }, (_, at) => `line ${at}`);
    const whole = fake(codeBlock({ text: lines.slice(0, 3).join("\n"), lines: 3 }).node);
    expect(whole.find("code-all")).toEqual([]);
    const node = fake(codeBlock({ text: lines.join("\n"), lines: 3 }).node);
    expect(node.one("code-text").textContent).toBe("line 0\nline 1\nline 2");
    const all = node.one("code-all");
    expect(all.textContent).toBe("show all");
    all.click();
    expect(node.one("code-text").textContent).toBe(lines.join("\n"));
    expect(node.find("code-all")).toEqual([]);
  });
});

describe("splitBar", () => {
  test("is a picture with a name, a part a share, each as wide as its share", () => {
    const node = fake(splitBar([0.65, 0.35], "waiting 80ms, download 43ms"));
    expect(node.className).toBe("split");
    expect(node.getAttribute("role")).toBe("img");
    expect(node.getAttribute("aria-label")).toBe("waiting 80ms, download 43ms");
    expect(node.nodes().map((part) => [part.className, part.style.flexGrow])).toEqual([
      ["split-part", "0.65"],
      ["split-part", "0.35"],
    ]);
  });
});

describe("the rules of the kit's content parts", () => {
  /** A line around a part, which none has at rest. */
  const LINED = /border(?!-radius)|outline|box-shadow|font-weight/;

  test("no part has a line around it or a heavier text, and each is one column no wider than its view", () => {
    const own = rules(CSS).filter((rule) => /^\.(group|pairs?|pair-|code|split)\b/.test(rule.selector));
    expect(own.length).toBeGreaterThan(10);
    for (const rule of own) expect([rule.selector, LINED.test(rule.body)]).toEqual([rule.selector, false]);
    for (const selector of [".group", ".code"]) {
      expect(body(selector)).toMatch(/grid-template-columns:\s*minmax\(0, 1fr\)/);
    }
  });

  test("pairs are two columns, wrap anywhere, and stack a name over its value in a narrow view", () => {
    expect(body(".view-body")).toMatch(/container:\s*view \/ inline-size/);
    const wide = rules(CSS).filter((rule) => rule.selector === ".pairs");
    expect(wide).toHaveLength(2);
    expect(wide[0]?.body).toMatch(/grid-template-columns:\s*fit-content\(45%\) minmax\(0, 1fr\)/);
    expect(wide[0]?.body).toMatch(/overflow-wrap:\s*anywhere/);
    expect(wide[0]?.body).toMatch(/font-family:\s*var\(--mono\)/);
    // The second is the narrow view's, and only there: under 290, a panel of 300.
    const narrow = /@container view \(max-width: 290px\) \{([\s\S]*?)\n\}/.exec(CSS)?.[1] ?? "";
    expect(rules(narrow).map((rule) => rule.selector)).toEqual([".pairs", ".pair-value"]);
    expect(rules(narrow)[0]?.body).toMatch(/grid-template-columns:\s*minmax\(0, 1fr\)/);
    expect(wide[1]?.body).toBe(rules(narrow)[0]?.body);
  });

  test("code wraps, and with wrapping off scrolls in itself, never its view", () => {
    expect(body(".code-text")).toMatch(/white-space:\s*pre-wrap;\s*overflow-wrap:\s*anywhere/);
    expect(body(".code-text")).toMatch(/font-family:\s*var\(--mono\)/);
    expect(body(".code-text.nowrap")).toMatch(/white-space:\s*pre;/);
    expect(body(".code-text.nowrap")).toMatch(/overflow-x:\s*auto/);
  });

  test("the bar is the track's ground with its parts in the text's color, and nothing else", () => {
    expect(body(".split")).toMatch(/background:\s*var\(--track\)/);
    expect(body(".split-part")).toMatch(/background:\s*var\(--fg\)/);
    expect(`${body(".split")}${body(".split-part")}`).not.toMatch(/--(hot|ok|req-)/);
  });
});
