import { describe, expect, test } from "bun:test";
import type { StackFrame } from "bippy/source";
import { isSited, mapped, relocated } from "../src/grab/source";

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

/** A lazy route's chunk on a Vite dev server, whose source map names the file with its query. */
const CHUNK = "https://app.localhost/src/routes/index.tsx?tsr-split=component";

const ROUTE = {
  name: "index.tsx?tsr-split=component",
  content: [
    "const styles = { title: {} };",
    "",
    "function HomePage() {",
    "  return (",
    "    <main>",
    "      <h1>Stop fighting</h1>",
    "      <Outlet />",
    "    </main>",
    "  );",
    "}",
  ].join("\n"),
};

const H1 = { tag: "h1", host: true };
const RAW: StackFrame = {
  functionName: "HomePage",
  fileName: CHUNK,
  lineNumber: 447,
  columnNumber: 22,
};

describe("isSited", () => {
  test("a mapped frame on its element's tag is right, on anything else it is not", () => {
    const at = (lineNumber: number, columnNumber: number): StackFrame => ({
      ...RAW,
      fileName: ROUTE.name,
      lineNumber,
      columnNumber,
      isSymbolicated: true,
    });
    expect(isSited(at(6, 6), H1, ROUTE)).toBe(true);
    expect(isSited(at(1, 6), H1, ROUTE)).toBe(false);
    expect(isSited(at(7, 6), H1, ROUTE)).toBe(false);
    expect(isSited(RAW, H1, ROUTE)).toBe(false);
  });

  test("a component may be written under another name, so any tag will do", () => {
    const frame = { ...RAW, lineNumber: 7, columnNumber: 6, isSymbolicated: true };
    expect(isSited(frame, { tag: "OutletImpl", host: false }, ROUTE)).toBe(true);
    expect(isSited({ ...frame, lineNumber: 4 }, { tag: "OutletImpl", host: false }, ROUTE)).toBe(
      false,
    );
  });
});

describe("relocated", () => {
  test("a frame the map had no place for gets its line and column from the source", () => {
    const frame = mapped(relocated(RAW, RAW, H1, ROUTE, null), RAW);
    expect(frame).toMatchObject({
      functionName: "HomePage",
      fileName: "src/routes/index.tsx",
      lineNumber: 6,
      columnNumber: 7,
      isSymbolicated: true,
    });
  });

  test("a frame the map put on the wrong line moves, and one with nothing found stays", () => {
    const wrong = { ...RAW, fileName: ROUTE.name, lineNumber: 1, isSymbolicated: true };
    expect(relocated(wrong, RAW, H1, ROUTE, null).lineNumber).toBe(6);
    expect(relocated(wrong, RAW, { tag: "h2", host: true }, ROUTE, null)).toBe(wrong);
    expect(relocated(RAW, RAW, { tag: "h2", host: true }, ROUTE, null)).toBe(RAW);
  });
});
