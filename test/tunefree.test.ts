import { describe, expect, test } from "bun:test";
import { checked, MARKERS, tuneFaults } from "../scripts/tunefree";

describe("tune free check", () => {
  test("passes files with none of the controls in them", () => {
    const clean = { "index.js": 'var tune = { blurMost: 48 };\nfunction blurOn() {\n  return true;\n}\n', "engine/fold.d.ts": "/** As jadon7/iphone-duo's does. */\nexport declare function shadesOn(): boolean;\n" };
    expect(tuneFaults(clean)).toEqual([]);
    expect(tuneFaults({})).toEqual([]);
  });

  test("fails every mark of the controls, by file", () => {
    expect(tuneFaults({ "index.js": 'var TUNE_KEY = Symbol.for("devknobs.foldtune");\n', "chunk.js": "var finds = { backTint: 0, stillOn: 1 };\n" })).toEqual([
      'index.js: has "foldtune"',
      'chunk.js: has "backTint"',
      'chunk.js: has "stillOn"',
    ]);
    // A build with the constant not defined keeps the guard, minified too.
    expect(tuneFaults({ "index.global.js": 'if(typeof DEVKNOBS_TUNE>"u"||DEVKNOBS_TUNE)E();' })).toEqual(['index.global.js: has "DEVKNOBS_TUNE"']);
    expect(tuneFaults({ "engine/foldtune.d.ts": "export {};\n" }, ["never"])).toEqual([]);
    for (const marker of MARKERS) expect(tuneFaults({ "a.js": `x ${marker} y` })).toContain(`a.js: has "${marker}"`);
  });

  test("reads modules and declarations, and nothing else", () => {
    expect(["index.js", "engine/fold.d.ts", "bezels/a.png", "index.js.map"].filter(checked)).toEqual(["index.js", "engine/fold.d.ts"]);
  });
});
