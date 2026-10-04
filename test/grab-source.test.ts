import { describe, expect, test } from "bun:test";
import { mapped } from "../src/grab/source";

const SCRIPT = "http://localhost:5173/src/features/Cart.tsx?t=1";

describe("mapped", () => {
  test("counts the column from 1", () => {
    expect(mapped({ fileName: "/src/App.tsx", columnNumber: 4 }, null).columnNumber).toBe(5);
    expect(mapped({ fileName: "/src/App.tsx", columnNumber: undefined }, null).columnNumber).toBe(
      undefined,
    );
  });

  test("puts a path beside its script, and leaves a rooted one alone", () => {
    expect(mapped({ fileName: "Cart.tsx" }, { fileName: SCRIPT }).fileName).toBe(
      "src/features/Cart.tsx",
    );
    expect(mapped({ fileName: "../App.tsx" }, { fileName: SCRIPT }).fileName).toBe("src/App.tsx");
    expect(
      mapped({ fileName: "a.tsx" }, { fileName: "http://localhost:5173/@fs/repo/ui/b.tsx" })
        .fileName,
    ).toBe("/repo/ui/a.tsx");
    expect(mapped({ fileName: "/src/App.tsx" }, { fileName: SCRIPT }).fileName).toBe(
      "/src/App.tsx",
    );
    expect(mapped({ fileName: "webpack://app/./src/App.tsx" }, { fileName: SCRIPT }).fileName).toBe(
      "webpack://app/./src/App.tsx",
    );
    expect(mapped({ fileName: "Cart.tsx" }, null).fileName).toBe("Cart.tsx");
  });

  test("takes the function's name from the frame, over the token at the call", () => {
    expect(mapped({ functionName: "map" }, { functionName: "App" }).functionName).toBe("App");
    expect(mapped({ functionName: "Cart" }, { functionName: "a" }).functionName).toBe("Cart");
    expect(mapped({ functionName: "Cart" }, null).functionName).toBe("Cart");
  });
});
