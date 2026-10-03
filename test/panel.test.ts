import { afterEach, describe, expect, test } from "bun:test";
import { apply, reset } from "../src/engine/time";
import { HOST_STYLE, overflowBadge, wallInput } from "../src/ui/panel";
import { CSS } from "../src/ui/styles";

describe("overflowBadge", () => {
  test("counts while the overflow knob is on", () => {
    expect(overflowBadge(true, 0)).toBe(" · 0 overflowing");
    expect(overflowBadge(true, 2)).toBe(" · 2 overflowing");
  });

  test("says nothing while the knob is off", () => {
    expect(overflowBadge(false, 0)).toBe("");
    expect(overflowBadge(false, 2)).toBe("");
  });

  test("says nothing before the frame reports a count", () => {
    expect(overflowBadge(true, null)).toBe("");
  });
});

describe("wallInput", () => {
  afterEach(() => {
    reset();
  });

  test("writes an instant the way a datetime-local input reads it", () => {
    expect(wallInput(new Date(2026, 9, 4, 9, 5, 30).getTime())).toBe("2026-10-04T09:05");
    expect(wallInput(new Date(999, 0, 1).getTime())).toBe("0999-01-01T00:00");
  });

  test("on the clock face of the emulated zone", () => {
    apply("Asia/Tokyo");
    expect(wallInput(Date.UTC(2026, 9, 4, 0, 5))).toBe("2026-10-04T09:05");
  });
});

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

describe("closed panel", () => {
  test("paints nothing but the handle, once it has slid out", () => {
    expect(body(".panel")).toMatch(/visibility:\s*hidden/);
    expect(body(".panel")).toMatch(/transition:\s*visibility 0s linear 150ms/);
    expect(body('.wrap[data-open="true"] .panel')).toMatch(/visibility:\s*visible/);
    expect(body('.wrap[data-open="true"] .panel')).toMatch(/transition-delay:\s*0s/);
  });
});
