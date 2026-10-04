import { describe, expect, test } from "bun:test";
import {
  classifySourcePath,
  isBundlePath,
  isSharedUiPath,
  isTrustedAppPath,
  normalizeFilePath,
  rootOf,
} from "../src/grab/paths";
import type { SourceOrigin } from "../src/grab/types";

describe("normalizeFilePath", () => {
  test.each([
    ["http://localhost:5173/src/components/Button.tsx?t=1712", "src/components/Button.tsx"],
    [
      "https://app.localhost/src/routes/index.tsx?tsr-split=component&v=6b0316c7",
      "src/routes/index.tsx",
    ],
    ["http://localhost:5173/src/lib/utils.ts", "src/lib/utils.ts"],
    [
      "http://localhost:5173/@fs/Users/me/repo/packages/ui/src/index.ts?v=1",
      "/Users/me/repo/packages/ui/src/index.ts",
    ],
    ["index.tsx?tsr-split=component", "index.tsx"],
    ["src/routes/__root.tsx", "src/routes/__root.tsx"],
    ["webpack-internal:///(app-pages-browser)/./src/app/page.tsx", "src/app/page.tsx"],
    ["/Users/me/app/src/App.tsx", "/Users/me/app/src/App.tsx"],
    ["./src/App.tsx", "src/App.tsx"],
    ["<anonymous>", ""],
  ])("%s is %s", (input, path) => {
    expect(normalizeFilePath(input)).toBe(path);
  });
});

describe("the project's root", () => {
  const ROOT = "/Users/me/repo/apps/web";

  test("comes from a source map's file and the url that serves it", () => {
    const file = `${ROOT}/src/routes/index.tsx`;
    const url = "https://app.localhost/src/routes/index.tsx?tsr-split=component";
    expect(rootOf(file, url)).toBe(ROOT);
    expect(rootOf(file, "https://app.localhost/src/other.tsx")).toBeNull();
    expect(rootOf(undefined, url)).toBeNull();
    expect(rootOf("/Users/me/x.ts", "http://localhost:5173/@fs/Users/me/x.ts")).toBeNull();
  });

  test("is cut from a path under it, by its place on disk or through /@fs/", () => {
    expect(normalizeFilePath(`${ROOT}/src/App.tsx`, ROOT)).toBe("src/App.tsx");
    expect(normalizeFilePath(`http://localhost:5173/@fs${ROOT}/src/App.tsx?v=1`, ROOT)).toBe(
      "src/App.tsx",
    );
    expect(normalizeFilePath("/Users/me/repo/packages/ui/src/index.ts", ROOT)).toBe(
      "/Users/me/repo/packages/ui/src/index.ts",
    );
  });
});

describe("classifySourcePath", () => {
  test.each<[string, SourceOrigin, string | null]>([
    ["http://localhost:5173/src/components/Button.tsx?t=1", "app", null],
    ["https://app.localhost/src/routes/index.tsx?tsr-split=component&v=6b0316c7", "app", null],
    [
      "http://localhost:5173/node_modules/.vite/deps/@tanstack_react-router.js?v=6b0316c7",
      "package",
      "@tanstack/react-router",
    ],
    ["webpack-internal:///(app-pages-browser)/./src/app/page.tsx", "app", null],
    ["@components/forms/Field.tsx", "app", null],
    [
      "/repo/node_modules/@tanstack/react-query/build/modern/index.js",
      "package",
      "@tanstack/react-query",
    ],
    ["/repo/node_modules/clsx/dist/clsx.mjs", "package", "clsx"],
    [
      "http://localhost:5173/node_modules/.vite/deps/@radix-ui_react-dialog.js?v=1",
      "package",
      "@radix-ui/react-dialog",
    ],
    ["https://esm.sh/react-dom@19.0.0/client.js", "package", "react-dom"],
    ["../@acme/ui/src/button.tsx", "package", "@acme/ui"],
    ["http://localhost:5173/node_modules/.vite/deps/chunk-ABC123.js?v=1", "unknown", null],
    ["http://localhost:4173/assets/index-a1b2c3d4.js", "unknown", null],
    ["", "unknown", null],
  ])("%s is %s", (input, origin, packageName) => {
    expect(classifySourcePath(input)).toEqual({ origin, packageName });
  });
});

describe("trusted app paths", () => {
  test("shared ui is app source but not trusted", () => {
    for (const path of [
      "/src/components/ui/button.tsx",
      "/repo/packages/ui/src/card.tsx",
      "src/primitives/Box.tsx",
    ]) {
      expect(isSharedUiPath(path)).toBe(true);
      expect(isTrustedAppPath(path)).toBe(false);
    }
  });

  test("a built bundle is not trusted", () => {
    expect(isBundlePath("http://localhost:3000/_next/static/chunks/app/page-abc123.js")).toBe(true);
    expect(isBundlePath("http://localhost:4173/assets/index-a1b2c3d4.js")).toBe(true);
    expect(isTrustedAppPath("http://localhost:4173/assets/index-a1b2c3d4.js")).toBe(false);
  });

  test("a feature component is trusted", () => {
    expect(isTrustedAppPath("/src/features/cart/Checkout.tsx")).toBe(true);
    expect(isTrustedAppPath(null)).toBe(true);
  });
});
