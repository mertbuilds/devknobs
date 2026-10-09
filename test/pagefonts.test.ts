import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { embedFonts, faceKey, warmFonts } from "../src/engine/pagefonts";
import { copyPage, forgetShots } from "../src/engine/pageshot";

/** A font face as far as the page tells which it has loaded. */
interface FakeFace {
  family: string;
  weight: string;
  style: string;
  unicodeRange: string;
  status: string;
}

/** A style rule: its text, the sheet it is from, and the rules it holds. */
interface FakeRule {
  cssText: string;
  parentStyleSheet: { href: string | null };
  cssRules?: FakeRule[];
}

/** The page's font faces, which tell who listens for more of them. */
class FakeFaces {
  listeners: (() => void)[] = [];
  constructor(readonly faces: FakeFace[]) {}
  [Symbol.iterator](): Iterator<FakeFace> {
    return this.faces[Symbol.iterator]();
  }
  addEventListener(_type: string, listener: () => void): void {
    this.listeners.push(listener);
  }
  removeEventListener(_type: string, listener: () => void): void {
    this.listeners = this.listeners.filter((other) => other !== listener);
  }
}

function loaded(family: string, weight = "400"): FakeFace {
  return { family, weight, style: "normal", unicodeRange: "U+0-10FFFF", status: "loaded" };
}

function rule(cssText: string, href: string | null = "https://site.test/css/app.css"): FakeRule {
  return { cssText, parentStyleSheet: { href } };
}

/** A page with these faces and rules, as far as its fonts are read. */
function pageOf(faces: FakeFace[], rules: FakeRule[]): { doc: Document; fonts: FakeFaces } {
  const fonts = new FakeFaces(faces);
  const doc = { fonts, baseURI: "https://site.test/page/", styleSheets: [{ cssRules: rules }] };
  return { doc: doc as unknown as Document, fonts };
}

function written(doc: Document, from: FakeRule): string {
  return embedFonts(doc)(from as unknown as CSSRule);
}

/** Each address fetched, and what comes back from it: a font's bytes, or nothing where it fails. */
let fetched: string[] = [];
let fails: (url: string) => boolean = () => false;
const realFetch = Reflect.get(globalThis, "fetch");

/** Let what was fetched come in. */
async function settle(): Promise<void> {
  for (let turn = 0; turn < 10; turn++) await Promise.resolve();
}

beforeEach(() => {
  fetched = [];
  fails = () => false;
  Reflect.set(globalThis, "fetch", (url: string) => {
    fetched.push(url);
    if (fails(url)) return Promise.reject(new TypeError("Failed to fetch"));
    return Promise.resolve(new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "font/woff2" } }));
  });
});

afterEach(() => {
  Reflect.set(globalThis, "fetch", realFetch);
  forgetShots();
});

/** The bytes 1, 2, 3 as the data a rule takes. */
const DATA = "data:font/woff2;base64,AQID";
const INTER = '@font-face { font-family: Inter; font-weight: 400; src: url("../fonts/inter.woff2") format("woff2"); }';

describe("faceKey", () => {
  test("reads a face the same from its rule and from the page", () => {
    expect(faceKey('"Inter Tight"', "normal", "", "U+0000-00FF, U+0131")).toBe(
      faceKey("Inter Tight", "400", "normal", "U+0-FF,U+131"),
    );
    expect(faceKey("Inter", "bold", "italic", "")).toBe(faceKey("inter", "700", "Italic", "U+0-10FFFF"));
    expect(faceKey("Inter", "100 900", "normal", "")).not.toBe(faceKey("Inter", "400", "normal", ""));
  });
});

describe("embedFonts", () => {
  test("leaves a face not fetched yet as it is, and fetches it once, from its sheet's address", async () => {
    const { doc } = pageOf([loaded("Inter")], [rule(INTER)]);
    expect(written(doc, rule(INTER))).toBe(INTER);
    expect(written(doc, rule(INTER))).toBe(INTER);
    expect(fetched).toEqual(["https://site.test/fonts/inter.woff2"]);
    await settle();
    expect(written(doc, rule(INTER))).toBe(
      `@font-face { font-family: Inter; font-weight: 400; src: url("${DATA}") format("woff2"); }`,
    );
    expect(fetched.length).toBe(1);
  });

  test("takes the page's address where the rule's sheet has none", () => {
    const { doc } = pageOf([loaded("Inter")], []);
    written(doc, rule(INTER, null));
    expect(fetched).toEqual(["https://site.test/fonts/inter.woff2"]);
  });

  test("leaves a face the page has not loaded alone", async () => {
    const waiting = { ...loaded("Inter"), status: "unloaded" };
    const { doc } = pageOf([waiting, loaded("Inter", "700")], [rule(INTER)]);
    expect(written(doc, rule(INTER))).toBe(INTER);
    await settle();
    expect(written(doc, rule(INTER))).toBe(INTER);
    expect(fetched).toEqual([]);
  });

  test("does not ask again for a font that will not come", async () => {
    fails = () => true;
    const { doc } = pageOf([loaded("Inter")], [rule(INTER)]);
    written(doc, rule(INTER));
    await settle();
    expect(written(doc, rule(INTER))).toBe(INTER);
    expect(written(doc, rule(INTER))).toBe(INTER);
    expect(fetched.length).toBe(1);
  });

  test("leaves a font that is data already as it is", () => {
    const own = '@font-face { font-family: Inter; src: url("data:font/woff2;base64,AA;x=,") format("woff2"); }';
    const { doc } = pageOf([loaded("Inter")], [rule(own)]);
    expect(written(doc, rule(own))).toBe(own);
    expect(fetched).toEqual([]);
  });

  test("takes the one source the browser reads, after any local one", async () => {
    const many =
      '@font-face { font-family: Inter; src: url("inter.eot") format("embedded-opentype"), local("Inter"), ' +
      'url("inter.woff2") format("woff2"), url("inter.woff") format("woff"); font-display: swap; }';
    const { doc } = pageOf([loaded("Inter")], [rule(many)]);
    written(doc, rule(many));
    expect(fetched).toEqual(["https://site.test/css/inter.woff2"]);
    await settle();
    expect(written(doc, rule(many))).toBe(
      `@font-face { font-family: Inter; src: local("Inter"), url("${DATA}") format("woff2"); font-display: swap; }`,
    );
  });

  test("embeds a face in a rule that holds it, and leaves the rest of that rule", async () => {
    const other = "p { color: red; }";
    const layer: FakeRule = {
      ...rule(`@layer base {\n  ${INTER}\n  ${other}\n}`),
      cssRules: [rule(INTER), rule(other)],
    };
    const { doc } = pageOf([loaded("Inter")], [layer]);
    expect(written(doc, layer)).toBe(layer.cssText);
    await settle();
    const text = written(doc, layer);
    expect(text).toContain(`url("${DATA}") format("woff2")`);
    expect(text).toContain(other);
    expect(text.startsWith("@layer base {")).toBe(true);
  });
});

describe("warmFonts", () => {
  test("fetches a page's fonts ahead once, and those it loads later", async () => {
    const bold = '@font-face { font-family: Inter; font-weight: 700; src: url("bold.woff2"); }';
    const { doc, fonts } = pageOf([loaded("Inter")], [rule(INTER), rule(bold)]);
    warmFonts(doc);
    warmFonts(doc);
    expect(fetched).toEqual(["https://site.test/fonts/inter.woff2"]);
    expect(fonts.listeners.length).toBe(1);
    fonts.faces.push(loaded("Inter", "700"));
    for (const listener of fonts.listeners) listener();
    expect(fetched).toEqual(["https://site.test/fonts/inter.woff2", "https://site.test/css/bold.woff2"]);
    await settle();
    expect(written(doc, rule(bold))).toContain(DATA);
  });

  test("lets go of a page's fonts with the page, and with the frame", async () => {
    const first = pageOf([loaded("Inter")], [rule(INTER)]);
    warmFonts(first.doc);
    await settle();
    const next = pageOf([loaded("Inter")], [rule(INTER)]);
    warmFonts(next.doc);
    expect(first.fonts.listeners.length).toBe(0);
    expect(fetched.length).toBe(2);
    await settle();
    forgetShots();
    expect(next.fonts.listeners.length).toBe(0);
    expect(written(next.doc, rule(INTER))).toBe(INTER);
    expect(fetched.length).toBe(3);
  });
});

describe("copyPage", () => {
  test("writes the fonts fetched by then into the copy's styles", async () => {
    let styles = "";
    const node = (): Record<string, unknown> => ({
      querySelectorAll: () => [],
      querySelector: () => null,
      append() {},
      set textContent(text: string) {
        styles = text;
      },
    });
    const { doc } = pageOf([loaded("Inter")], [rule(INTER)]);
    const inert = { importNode: node, createElement: node };
    Object.assign(doc, { documentElement: node(), implementation: { createHTMLDocument: () => inert } });
    const frame = { contentDocument: doc } as unknown as HTMLIFrameElement;
    copyPage(frame);
    expect(styles).toBe(INTER);
    await settle();
    copyPage(frame);
    expect(styles).toContain(DATA);
    expect(fetched.length).toBe(1);
  });
});
