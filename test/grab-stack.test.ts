import { describe, expect, test } from "bun:test";
import type { StackFrame } from "bippy/source";
import { buildTrace } from "../src/grab/context";
import { formatStack, selectSource, sourceLine } from "../src/grab/stack";
import type { ResolvedSource } from "../src/grab/types";

const ORIGIN = "http://localhost:5173";

function app(name: string, path: string, line = 10, symbolicated = true): StackFrame {
  return {
    functionName: name,
    fileName: `${ORIGIN}${path}`,
    lineNumber: line,
    columnNumber: 4,
    isSymbolicated: symbolicated,
  };
}

function pkg(name: string, path: string): StackFrame {
  return {
    functionName: name,
    fileName: `/repo/node_modules/${path}`,
    lineNumber: 1,
    columnNumber: 1,
  };
}

function source(patch: Partial<ResolvedSource> = {}): ResolvedSource {
  return {
    filePath: "src/features/Cart.tsx",
    lineNumber: 12,
    columnNumber: 5,
    componentName: "Cart",
    origin: "app",
    symbolicated: true,
    ...patch,
  };
}

describe("sourceLine", () => {
  test("names the component and its place, line and column when a source map gave them", () => {
    expect(sourceLine(source())).toBe("\n  in Cart (at src/features/Cart.tsx:12:5)");
  });

  test("drops the line where nothing mapped it back, except on Next.js", () => {
    expect(sourceLine(source({ symbolicated: false }))).toBe(
      "\n  in Cart (at src/features/Cart.tsx)",
    );
    expect(sourceLine(source({ symbolicated: false }), true)).toBe(
      "\n  in Cart (at src/features/Cart.tsx:12:5)",
    );
  });

  test("shows the path alone without a component, and Next.js paths from the app folder", () => {
    expect(sourceLine(source({ componentName: null, lineNumber: null }))).toBe(
      "\n  in src/features/Cart.tsx",
    );
    const absolute = source({ filePath: "/Users/me/site/src/app/page.tsx", componentName: "Page" });
    expect(sourceLine(absolute, true)).toBe("\n  in Page (at /./src/app/page.tsx:12:5)");
  });
});

describe("formatStack", () => {
  test("app frames show their path, library frames their package, server frames say so", () => {
    const trace = formatStack([
      app("Button", "/src/features/Save.tsx", 3),
      pkg("Tabs", "@radix-ui/react-tabs/dist/index.mjs"),
      { functionName: "Layout", isServer: true },
    ]);
    expect(trace.text).toBe(
      "\n  in Button (at /src/features/Save.tsx:3:4)" +
        "\n  in Tabs (@radix-ui/react-tabs)" +
        "\n  in Layout (at Server)",
    );
    expect(trace.needsSelector).toBe(false);
  });

  test("spends the budget of 3 on trusted app frames only", () => {
    const stack = [
      app("Alpha", "/src/a/Alpha.tsx"),
      app("Card", "/src/components/ui/card.tsx"),
      pkg("Popover", "@radix-ui/react-popover/dist/index.mjs"),
      app("Beta", "/src/b/Beta.tsx"),
      app("Gamma", "/src/c/Gamma.tsx"),
      app("Delta", "/src/d/Delta.tsx"),
    ];
    const names = (maxLines?: number) =>
      formatStack(stack, { maxLines })
        .text.split("\n")
        .filter(Boolean)
        .map((line) => line.trim().split(" ")[1]);
    expect(names()).toEqual(["Alpha", "Card", "Popover", "Beta", "Gamma"]);
    expect(names(1)).toEqual(["Alpha", "Card", "Popover"]);
  });

  test("stops at 20 lines, free lines included", () => {
    const stack = Array.from({ length: 30 }, (_, i) => pkg(`Lib${i}`, `lib${i}/index.js`));
    expect(formatStack(stack).text.split("\n").filter(Boolean)).toHaveLength(20);
  });

  test("drops the top frame that names the leading source again, and repeated library frames", () => {
    const stack = [
      app("Cart", "/src/features/Cart.tsx"),
      pkg("Tabs", "@radix-ui/react-tabs/dist/a.mjs"),
      pkg("Tabs", "@radix-ui/react-tabs/dist/b.mjs"),
    ];
    const trace = formatStack(stack, {}, source());
    expect(trace.text).toBe(
      "\n  in Cart (at src/features/Cart.tsx:12:5)\n  in Tabs (@radix-ui/react-tabs)",
    );
  });

  test("asks for a selector when only shared ui or libraries made it in", () => {
    expect(formatStack([app("Card", "/src/components/ui/card.tsx")]).needsSelector).toBe(true);
    expect(formatStack([pkg("Tabs", "@radix-ui/react-tabs/a.mjs")]).needsSelector).toBe(true);
    expect(formatStack([]).needsSelector).toBe(true);
  });

  test("skips internal and lower case names", () => {
    const stack = [pkg("Suspense", "react/index.js"), pkg("_Inner", "lib/index.js")];
    expect(formatStack(stack).text).toBe("\n  in react\n  in lib");
  });
});

describe("selectSource", () => {
  test("prefers a trusted fiber source, then trusted app frames, then the rest", () => {
    const stack = [
      app("Card", "/src/components/ui/card.tsx"),
      app("Cart", "/src/features/Cart.tsx"),
    ];
    expect(selectSource(source(), stack)?.componentName).toBe("Cart");
    const shared = source({ filePath: "src/components/ui/card.tsx", componentName: "Card" });
    expect(selectSource(shared, stack)?.filePath).toBe("/src/features/Cart.tsx");
    expect(selectSource(null, [pkg("Tabs", "@radix-ui/react-tabs/a.mjs")])?.origin).toBe("package");
    expect(selectSource(null, [])).toBeNull();
  });
});

describe("buildTrace", () => {
  test("falls back to the fiber's components when the stack has nothing", () => {
    const trace = buildTrace([], null, (max) => ["Header", "App"].slice(0, max));
    expect(trace.text).toBe("\n  in Header\n  in App");
    expect(trace.needsSelector).toBe(true);
  });

  test("adds missing ancestors when only libraries made it in", () => {
    const stack = [pkg("Tabs", "@radix-ui/react-tabs/a.mjs")];
    const trace = buildTrace(stack, null, (max, accept) =>
      ["Tabs", "Settings", "App"].filter(accept).slice(0, max),
    );
    expect(trace.text).toBe("\n  in Tabs (@radix-ui/react-tabs)\n  in Settings\n  in App");
  });

  test("leaves ancestors out once an app frame spent the budget", () => {
    const stack = [app("Cart", "/src/features/Cart.tsx"), app("Shop", "/src/features/Shop.tsx")];
    const trace = buildTrace(stack, null, () => ["App"]);
    expect(trace.text).toBe(
      "\n  in Cart (at /src/features/Cart.tsx:10:4)\n  in Shop (at /src/features/Shop.tsx:10:4)",
    );
  });
});
