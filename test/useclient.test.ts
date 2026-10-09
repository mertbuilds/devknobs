import { describe, expect, test } from "bun:test";
import { directiveFaults, directiveLines } from "../scripts/useclient";

describe("use client check", () => {
  test("finds the directive's lines, in either quotes, with or without the semicolon", () => {
    expect(directiveLines('"use client";\nconst a = 1;\n')).toEqual([1]);
    expect(directiveLines("const a = 1;\n'use client'\n  \"use client\";\n")).toEqual([2, 3]);
    expect(directiveLines('const a = "use client";\n// "use client";\n')).toEqual([]);
  });

  test("passes modules with the directive on the first line or nowhere", () => {
    expect(directiveFaults({ "react.js": '"use client";\nexport {};\n', "index.js": "export {};\n" })).toEqual([]);
  });

  test("fails a directive below the first line", () => {
    const source = '"use client";\nconst engine = 1;\n// src/react.tsx\n"use client";\nexport {};\n';
    expect(directiveFaults({ "react.js": source })).toEqual(['react.js:4: "use client" below the first line']);
    expect(directiveFaults({ "react.js": '"use client";\n', "chunk.js": 'var a;\n"use client";\n' })).toEqual([
      'chunk.js:2: "use client" below the first line',
    ]);
  });

  test("fails a react entry with no directive, or none at all", () => {
    expect(directiveFaults({ "react.js": "export {};\n" })).toEqual(['react.js: no "use client" on the first line']);
    expect(directiveFaults({})).toEqual(['react.js: no "use client" on the first line']);
  });
});
