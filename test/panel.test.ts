import { describe, expect, test } from "bun:test";
import { HOST_STYLE } from "../src/ui/panel";
import { CSS } from "../src/ui/styles";

interface Rule {
  selector: string;
  body: string;
}

/** Every rule in the stylesheet. At-rules fall away and leave the rules inside. */
function rules(css: string): Rule[] {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, "");
  return [...bare.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
    selector: match[1].trim(),
    body: match[2],
  }));
}

function body(selector: string): string {
  const rule = rules(CSS).find((entry) => entry.selector === selector);
  if (!rule) throw new Error(`no rule for ${selector}`);
  return rule.body;
}

/** The selectors that take a pointer back from the page. */
function pointerTargets(): string[] {
  return rules(CSS)
    .filter((rule) => /pointer-events:\s*auto/.test(rule.body))
    .map((rule) => rule.selector);
}

describe("pointer events", () => {
  test("the host takes none", () => {
    expect(HOST_STYLE).toContain("pointer-events:none");
  });

  test("the wrapper takes none, past its own all: initial", () => {
    expect(body(".wrap")).toMatch(/pointer-events:\s*none/);
  });

  test("the handle and a panel that is out are the only surfaces that take one", () => {
    expect(pointerTargets()).toEqual([".handle", '.wrap[data-open="true"] .panel']);
  });
});
