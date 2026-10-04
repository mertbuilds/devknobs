import { describe, expect, test } from "bun:test";
import type { StackFrame } from "bippy/source";
import { buildTrace, formatEntry } from "../src/grab/context";
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

const DEPS = `${ORIGIN}/node_modules/.vite/deps`;

function dep(name: string | undefined, file: string, line = 100): StackFrame {
  return { functionName: name, fileName: `${DEPS}/${file}`, lineNumber: line, columnNumber: 9 };
}

/** The router's and React's own frames between a route and the one above it. */
function routerFrames(last: string[]): StackFrame[] {
  return [
    dep(undefined, "@tanstack_react-router.js?v=6b0316c7", 2200),
    dep(undefined, "react-dom_client.js?v=6b0316c7", 5400),
    dep("Object.useMemo", "react-dom_client.js?v=6b0316c7", 18000),
    dep(undefined, "react.js?v=6b0316c7", 900),
    ...["MatchInnerImpl", "MatchView", "MatchImpl", ...last].map((name) =>
      dep(name, "@tanstack_react-router.js?v=6b0316c7"),
    ),
  ];
}

/** Grabbing an h1 in a lazy TanStack route, as the owner stack came on a Vite dev server. */
const LAZY_ROUTE: StackFrame[] = [
  { functionName: "h1" },
  {
    functionName: "HomePage",
    fileName: "src/routes/index.tsx",
    lineNumber: 549,
    columnNumber: 11,
    isSymbolicated: true,
  },
  dep("Lazy", "@tanstack_react-router.js?v=6b0316c7"),
  ...routerFrames(["OutletImpl"]),
  {
    functionName: "RootComponent",
    fileName: "src/routes/__root.tsx",
    lineNumber: 133,
    columnNumber: 7,
    isSymbolicated: true,
  },
  ...routerFrames(["MatchesInner", "Matches"]),
];

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
  test("app frames show their path, server frames say so, and library frames stay out", () => {
    const trace = formatStack([
      app("Button", "/src/features/Save.tsx", 3),
      pkg("Tabs", "@radix-ui/react-tabs/dist/index.mjs"),
      { functionName: "Layout", isServer: true },
    ]);
    expect(trace.text).toBe(
      "\n  in Button (at src/features/Save.tsx:3:4)\n  in Layout (at Server)",
    );
    expect(trace.needsSelector).toBe(false);
  });

  test("a lazy route shows the page and the root, none of the router or React between", () => {
    const page = source({
      filePath: "src/routes/index.tsx",
      lineNumber: 549,
      columnNumber: 11,
      componentName: "HomePage",
    });
    const trace = formatStack(LAZY_ROUTE, {}, page);
    expect(trace.text).toBe(
      "\n  in HomePage (at src/routes/index.tsx:549:11)" +
        "\n  in RootComponent (at src/routes/__root.tsx:133:7)",
    );
    expect(trace.needsSelector).toBe(false);
    expect(formatStack(LAZY_ROUTE).text).toBe(trace.text);
  });

  test("a route the map gave no line still shows its path from the project's root", () => {
    const stack = LAZY_ROUTE.map((frame) =>
      frame.functionName === "HomePage"
        ? {
            functionName: "HomePage",
            fileName: `${ORIGIN}/src/routes/index.tsx?tsr-split=component&v=6b0316c7`,
            lineNumber: 447,
            columnNumber: 22,
          }
        : frame,
    );
    expect(formatStack(stack).text).toBe(
      "\n  in HomePage (at src/routes/index.tsx)" +
        "\n  in RootComponent (at src/routes/__root.tsx:133:7)",
    );
  });

  test("with no app frame, the nearest named library component is the one hint", () => {
    const stack = LAZY_ROUTE.filter((frame) => frame.fileName?.startsWith(DEPS));
    const trace = formatStack(stack);
    expect(trace.text).toBe("\n  in Lazy (@tanstack/react-router)");
    expect(trace.needsSelector).toBe(true);
    expect(trace.hasBudgetedFrame).toBe(false);
    expect(trace.names.has("Lazy")).toBe(true);
  });

  test("a named frame of a bundle is a hint too, and one with no file is a line", () => {
    const chunk = { functionName: "Presence", fileName: `${DEPS}/chunk-ABC123.js?v=1` };
    expect(formatStack([chunk]).text).toBe("\n  in Presence");
    expect(formatStack([chunk, app("Cart", "/src/features/Cart.tsx")]).text).toBe(
      "\n  in Cart (at src/features/Cart.tsx:10:4)",
    );
    expect(formatStack([{ functionName: "Header" }, { functionName: "App" }]).text).toBe(
      "\n  in Header\n  in App",
    );
  });

  test("drops a frame that repeats the one before it", () => {
    const stack = [
      app("Cart", "/src/features/Cart.tsx"),
      pkg("Tabs", "@radix-ui/react-tabs/dist/a.mjs"),
      app("Cart", "/src/features/Cart.tsx"),
      app("Shop", "/src/features/Shop.tsx"),
    ];
    expect(formatStack(stack).text).toBe(
      "\n  in Cart (at src/features/Cart.tsx:10:4)\n  in Shop (at src/features/Shop.tsx:10:4)",
    );
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
    expect(names()).toEqual(["Alpha", "Card", "Beta", "Gamma"]);
    expect(names(1)).toEqual(["Alpha", "Card"]);
  });

  test("stops at 20 lines, free lines included", () => {
    const stack = Array.from({ length: 30 }, (_, i) =>
      app(`Part${i}`, `/src/components/ui/part${i}.tsx`),
    );
    expect(formatStack(stack).text.split("\n").filter(Boolean)).toHaveLength(20);
  });

  test("drops the top frame that names the leading source again", () => {
    const stack = [
      app("Cart", "/src/features/Cart.tsx"),
      pkg("Tabs", "@radix-ui/react-tabs/dist/a.mjs"),
      pkg("Tabs", "@radix-ui/react-tabs/dist/b.mjs"),
    ];
    const trace = formatStack(stack, {}, source());
    expect(trace.text).toBe("\n  in Cart (at src/features/Cart.tsx:12:5)");
  });

  test("asks for a selector when only shared ui or libraries made it in", () => {
    expect(formatStack([app("Card", "/src/components/ui/card.tsx")]).needsSelector).toBe(true);
    expect(formatStack([pkg("Tabs", "@radix-ui/react-tabs/a.mjs")]).needsSelector).toBe(true);
    expect(formatStack([]).needsSelector).toBe(true);
  });

  test("skips internal and lower case names", () => {
    const stack = [pkg("Suspense", "react/index.js"), pkg("_Inner", "lib/index.js")];
    expect(formatStack(stack).text).toBe("");
    expect(formatStack([{ isServer: true }]).text).toBe("");
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
    expect(selectSource(shared, stack)?.filePath).toBe("src/features/Cart.tsx");
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

  test("a lazy route's h1 copies as its page and its root, with no selector", () => {
    const page = source({
      filePath: "src/routes/index.tsx",
      lineNumber: 549,
      columnNumber: 11,
      componentName: "HomePage",
    });
    const trace = buildTrace(LAZY_ROUTE, page, () => ["Matches"]);
    expect(trace.needsSelector).toBe(false);
    expect(formatEntry("<h1>Stop fighting</h1>", trace.text, null, null)).toBe(
      "[<h1>Stop fighting</h1> in HomePage (at src/routes/index.tsx:549:11)" +
        " in RootComponent (at src/routes/__root.tsx:133:7)]",
    );
  });

  test("leaves ancestors out once an app frame spent the budget", () => {
    const stack = [app("Cart", "/src/features/Cart.tsx"), app("Shop", "/src/features/Shop.tsx")];
    const trace = buildTrace(stack, null, () => ["App"]);
    expect(trace.text).toBe(
      "\n  in Cart (at src/features/Cart.tsx:10:4)\n  in Shop (at src/features/Shop.tsx:10:4)",
    );
  });
});
