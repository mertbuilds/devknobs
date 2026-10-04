import { describe, expect, test } from "bun:test";
import {
  classifySourcePath,
  isBundlePath,
  isSharedUiPath,
  isTrustedAppPath,
  normalizeFilePath,
} from "../src/grab/paths";
import type { SourceOrigin } from "../src/grab/types";

describe("normalizeFilePath", () => {
  test.each([
    ["http://localhost:5173/src/components/Button.tsx?t=1712", "/src/components/Button.tsx"],
    ["webpack-internal:///(app-pages-browser)/./src/app/page.tsx", "src/app/page.tsx"],
    ["/Users/me/app/src/App.tsx", "/Users/me/app/src/App.tsx"],
    ["./src/App.tsx", "src/App.tsx"],
    ["<anonymous>", ""],
  ])("%s is %s", (input, path) => {
    expect(normalizeFilePath(input)).toBe(path);
  });
});

describe("classifySourcePath", () => {
  test.each<[string, SourceOrigin, string | null]>([
    ["http://localhost:5173/src/components/Button.tsx?t=1", "app", null],
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
