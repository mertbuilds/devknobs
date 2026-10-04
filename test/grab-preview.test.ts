import { describe, expect, test } from "bun:test";
import { htmlPreview, isGeneratedClass, readableClass, truncateEscaped } from "../src/grab/preview";

const XHTML = "http://www.w3.org/1999/xhtml";
const SVG = "http://www.w3.org/2000/svg";

type Child = Element | string;

/** Just enough of an element for the preview: attributes, text and child elements. */
function el(
  tag: string,
  attrs: Record<string, string> = {},
  kids: Child[] = [],
  ns = XHTML,
): Element {
  const attributes = Object.entries(attrs).map(([name, value]) => ({ name, value }));
  const childNodes = kids.map((kid) =>
    typeof kid === "string" ? { nodeType: 3, textContent: kid } : kid,
  );
  const fake = {
    nodeType: 1,
    tagName: tag.toUpperCase(),
    namespaceURI: ns,
    attributes,
    childNodes,
    children: kids.filter((kid) => typeof kid !== "string"),
    getAttribute: (name: string) => attrs[name] ?? null,
    hasAttribute: (name: string) => name in attrs,
  };
  return fake as unknown as Element;
}

describe("truncateEscaped", () => {
  test("keeps short html and cuts long html to the limit, the dots included", () => {
    expect(truncateEscaped("short", 15)).toBe("short");
    expect(truncateEscaped("abcdefghijklmnopqrst", 15)).toBe("abcdefghijkl...");
    expect(truncateEscaped("abcdefghijklmnopqrst", 15)).toHaveLength(15);
  });

  test("never ends inside an entity", () => {
    expect(truncateEscaped("abcdefghij&amp;klmnop", 15)).toBe("abcdefghij...");
    expect(truncateEscaped("abcdef&amp;ghijklmnop", 15)).toBe("abcdef&amp;g...");
  });
});

describe("generated class names", () => {
  test.each([
    "index__styles.displayTitle",
    "x1jft12v",
    "xobvag8",
    "x78zum5",
    "xzcgazx",
    "xmbi4v7",
    "xdt5ytf",
    "_title_1a2b3",
    "_title_1a2b3_7",
    "Card_title__3xK2a",
    "css-1x2y3z",
    "sc-bdnylx",
    "jsx-3140235276",
  ])("%s is generated", (token) => {
    expect(isGeneratedClass(token)).toBe(true);
  });

  test.each([
    "btn",
    "hero-title",
    "text-4xl",
    "xlarge",
    "xl",
    "xsmall",
    "x-small",
    "card__title",
    "card__title--active",
    "MuiButton-root",
    "md:flex",
    "w-[420px]",
  ])("%s is written by hand", (token) => {
    expect(isGeneratedClass(token)).toBe(false);
  });

  test("keeps the readable names, in their order", () => {
    expect(readableClass("index__styles.displayTitle xobvag8 x1jft12v xb6ev31")).toBe("");
    expect(readableClass("  hero  _title_1a2b3 css-1x2y3z dark ")).toBe("hero dark");
  });

  test("drops StyleX atoms that have no digit, as a real card's class list has", () => {
    const real = "xzcgazx xmbi4v7 x78zum5 xdt5ytf xaqueou xieioua x1n2onr6";
    expect(readableClass(real)).toBe("");
    expect(readableClass(`card ${real} is-open`)).toBe("card is-open");
    expect(htmlPreview(el("li", { class: real }, ["Take photos"]))).toBe("<li>Take photos</li>");
  });

  test("keeps a word that starts with x, alone or among readable names", () => {
    expect(readableClass("xlarge")).toBe("xlarge");
    expect(readableClass("xl")).toBe("xl");
    expect(readableClass("x-small")).toBe("x-small");
    expect(readableClass("btn xlarge xsmall")).toBe("btn xlarge xsmall");
    expect(readableClass("xaqueou")).toBe("xaqueou");
  });
});

describe("htmlPreview", () => {
  test("shows a class without its generated names, and no class when all of them are", () => {
    const stylex = "index__styles.displayTitle xobvag8 x1jft12v xb6ev31 x72az59 x1uo3zyz";
    expect(htmlPreview(el("h1", { class: stylex }, ["Stop fighting"]))).toBe(
      "<h1>Stop fighting</h1>",
    );
    expect(htmlPreview(el("p", { class: "lead css-1x2y3z sc-bdnylx" }))).toBe('<p class="lead" />');
    const tailwind = "flex items-center gap-2 rounded-md px-3";
    expect(htmlPreview(el("div", { class: tailwind }))).toBe('<div class="flex items-c..." />');
  });

  test("lists the priority attributes first, in their order, then identifying, then the rest", () => {
    const button = el("button", {
      "data-x": "1",
      type: "submit",
      class: "btn",
      id: "save",
      title: "Save it",
    });
    expect(htmlPreview(button)).toBe(
      '<button id="save" class="btn" title="Save it" type="submit" data-x="1" />',
    );
  });

  test("shows 8 attributes at most", () => {
    const attrs = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`data-a${i}`, "v"]));
    const preview = htmlPreview(el("div", attrs));
    expect(preview.match(/data-a\d+/g)).toHaveLength(8);
  });

  test("cuts class and other values to 15, identifying values to 120", () => {
    const long = "x".repeat(200);
    const preview = htmlPreview(el("a", { class: long, href: long, "data-v": long }));
    expect(preview).toContain(`class="${"x".repeat(12)}..."`);
    expect(preview).toContain(`href="${"x".repeat(117)}..."`);
    expect(preview).toContain(`data-v="${"x".repeat(12)}..."`);
  });

  test("escapes values and text, and keeps entities whole when cutting", () => {
    const preview = htmlPreview(el("div", { title: 'say "hi" & <go>' }, ["a < b"]));
    expect(preview).toBe('<div title="say &quot;hi&quot; &amp; &lt;go&gt;">a &lt; b</div>');
    expect(htmlPreview(el("div", { "data-v": "abcdefghijk&z" }))).toBe(
      '<div data-v="abcdefghijk..." />',
    );
  });

  test("shows empty identifying attributes bare, and drops other empty ones, style and internal ones", () => {
    const input = el("input", {
      disabled: "",
      "data-empty": "",
      style: "color:red",
      "data-devknobs": "panel",
      "data-react-grab-frozen": "true",
    });
    expect(htmlPreview(input)).toBe("<input disabled />");
  });

  test("collapses white space and cuts text to 100", () => {
    expect(htmlPreview(el("p", {}, ["  two\n   words  "]))).toBe("<p>two words</p>");
    const preview = htmlPreview(el("p", {}, ["y".repeat(150)]));
    expect(preview).toBe(`<p>${"y".repeat(97)}...</p>`);
  });

  test("takes descendant text only for links, buttons and the like", () => {
    const inner = el("span", {}, ["Save"]);
    expect(htmlPreview(el("button", {}, [inner, " now"]))).toBe("<button>Save now</button>");
    expect(htmlPreview(el("div", {}, [el("span", {}, ["Save"])]))).toBe("<div />");
    expect(htmlPreview(el("div", {}, ["own", el("span", {}, ["child"])]))).toBe("<div>own</div>");
  });

  test("skips hidden, aria hidden and script text", () => {
    const icon = el("span", { "aria-hidden": "true" }, ["icon"]);
    const script = el("script", {}, ["code"]);
    expect(htmlPreview(el("a", { href: "/x" }, [icon, script, "Home"]))).toBe(
      '<a href="/x">Home</a>',
    );
    expect(htmlPreview(el("div", { hidden: "" }, ["gone"]))).toBe("<div />");
  });

  test("shows only the priority attributes outside html", () => {
    const svg = el("svg", { viewBox: "0 0 10 10", class: "icon", role: "img" }, [], SVG);
    expect(htmlPreview(svg)).toBe('<svg class="icon" role="img" />');
  });
});
