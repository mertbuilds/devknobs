import { describe, expect, test } from "bun:test";
import { locateJsx, opensAt, tagPlaces } from "../src/grab/locate";

/** A route's file as it is written. The page starts on line 9. */
const SOURCE = `import { useState } from 'react';
import { Row } from '../components/row';

const styles = {
  title: { fontSize: 40 },
  lead: { fontSize: 18 },
};

function HomePage() {
  const [rows] = useState<Row[]>([]);
  return (
    <main>
      <section>
        <h1 className="title">Stop fighting</h1>
        <p>first</p>
      </section>
      <section>
        <p>second</p>
        {rows.map((row) => (
          <Row key={row.id} row={row} />
        ))}
        <p>third</p>
      </section>
    </main>
  );
}
`;

function call(tag: string, line: number, column: number, children = ""): string {
  const props = children ? `{ children: [${children}] }` : "{}";
  return `/* @__PURE__ */ _jsxDEV(${tag}, ${props}, void 0, false, {
  fileName: _jsxFileName,
  lineNumber: ${line},
  columnNumber: ${column}
}, this)`;
}

/**
 * The same file as a dev server hands it out once a splitter cut the 5 lines
 * of styles: every line the transform noted is 5 short, and the compiler
 * lifted the last paragraph above the others.
 */
const CODE = `var _jsxFileName = "/repo/src/routes/index.tsx";
function HomePage() {
  const t0 = ${call('"p"', 17, 9)};
  return ${call(
    '"main"',
    7,
    5,
    `${call('"section"', 8, 7, `${call('"h1"', 9, 9)}, ${call('"p"', 10, 9, '"a ) b", `c ${"}"} d`')}`)},
    ${call('"section"', 12, 7, `${call('"p"', 13, 9)}, rows.map((row) => ${call("Row", 15, 11)}), t0`)}`,
  )};
}
`;

/** Where the nth call of `tag` starts in the code, as a stack frame's place. */
function callPlace(tag: string, nth: number): { line: number; column: number } {
  let at = -1;
  for (let count = 0; count <= nth; count++) at = CODE.indexOf(`_jsxDEV(${tag},`, at + 1);
  const before = CODE.slice(0, at).split("\n");
  return { line: before.length, column: before[before.length - 1]?.length ?? 0 };
}

describe("opensAt", () => {
  test("is true where a tag opens, and for the very tag when one is named", () => {
    expect(opensAt(SOURCE, { line: 14, column: 8 })).toBe(true);
    expect(opensAt(SOURCE, { line: 14, column: 8 }, "h1")).toBe(true);
    expect(opensAt(SOURCE, { line: 14, column: 8 }, "h2")).toBe(false);
    expect(opensAt(SOURCE, { line: 14, column: 9 })).toBe(false);
    expect(opensAt(SOURCE, { line: 5, column: 2 })).toBe(false);
    expect(opensAt(SOURCE, { line: 99, column: 0 })).toBe(false);
  });
});

describe("tagPlaces", () => {
  test("lists every opening of the tag, not its closings, longer names or type arguments", () => {
    expect(tagPlaces(SOURCE, "h1")).toEqual([{ line: 14, column: 8 }]);
    expect(tagPlaces(SOURCE, "p").map((place) => place.line)).toEqual([15, 18, 22]);
    expect(tagPlaces(SOURCE, "Row")).toEqual([{ line: 20, column: 10 }]);
    expect(tagPlaces(SOURCE, "sec")).toEqual([]);
  });
});

describe("locateJsx", () => {
  test("a tag written once is found without the code", () => {
    expect(locateJsx(SOURCE, "h1", true, null, null)).toEqual({ line: 14, column: 8 });
    expect(locateJsx(SOURCE, "Row", false, null, null)).toEqual({ line: 20, column: 10 });
  });

  test("a tag written more than once needs the code and the call", () => {
    expect(locateJsx(SOURCE, "p", true, null, null)).toBeNull();
    expect(locateJsx(SOURCE, "p", true, CODE, null)).toBeNull();
    expect(locateJsx(SOURCE, "article", true, CODE, callPlace('"p"', 0))).toBeNull();
  });

  test("the transform's notes rank the calls in the source's order, lifted ones too", () => {
    const lines = [0, 1, 2].map(
      (nth) => locateJsx(SOURCE, "p", true, CODE, callPlace('"p"', nth))?.line,
    );
    expect(lines).toEqual([22, 15, 18]);
    expect(locateJsx(SOURCE, "section", true, CODE, callPlace('"section"', 1))).toEqual({
      line: 17,
      column: 6,
    });
  });

  test("gives nothing when the calls and the tags do not pair up", () => {
    const extra = `${CODE}\nconst more = ${call('"p"', 30, 3)};`;
    expect(locateJsx(SOURCE, "p", true, extra, callPlace('"p"', 0))).toBeNull();
    const noted = CODE.replace("lineNumber: 13,", "line: 13,");
    expect(locateJsx(SOURCE, "p", true, noted, callPlace('"p"', 0))).toBeNull();
    expect(locateJsx(SOURCE, "p", true, CODE, { line: 1, column: 0 })).toBeNull();
  });
});
