import { describe, expect, test } from "bun:test";
import { KNOBS, knobOf } from "../src/ui/catalog";
import { filterOptions, resultText, search, searchActions, words } from "../src/ui/search";

const DAY = 86_400_000;

/** The top results as `knob value`, the value's own spelling, `-` for a knob alone. */
function top(query: string, count = 1): string[] {
  return search(query, KNOBS)
    .slice(0, count)
    .map((result) => `${result.knob.id} ${result.option?.value ?? "-"}`);
}

describe("words", () => {
  test("lower cases, splits on separators and drops a leading plus", () => {
    expect(words("Asia/Tokyo")).toEqual(["asia", "tokyo"]);
    expect(words("+2 days")).toEqual(["2", "days"]);
    expect(words("America/New_York")).toEqual(["america", "new", "york"]);
    expect(words("en-US")).toEqual(["en-us"]);
  });
});

describe("search", () => {
  test("finds a grab color by the knob and the color", () => {
    expect(top("grab color pink")).toEqual(["grabColor pink"]);
    expect(top("grab blue")).toEqual(["grabColor blue"]);
    expect(top("grab color")).toEqual(["grabColor -"]);
    expect(top("pink")).toEqual(["grabColor pink"]);
  });

  test("a value alone finds its knob", () => {
    expect(top("dark")).toEqual(["scheme dark"]);
    expect(top("390")).toEqual(["width 390"]);
    expect(top("tr")).toEqual(["locale tr"]);
    expect(top("rtl")).toEqual(["direction rtl"]);
    expect(top("pause")).toEqual(["speed 0"]);
    expect(top("offline")).toEqual(["online offline"]);
    expect(top("frozen")).toEqual(["clockMode frozen"]);
    expect(top("deuteranopia")).toEqual(["vision deuteranopia"]);
  });

  test("clock jumps, with or without the plus", () => {
    expect(top("+2d")).toEqual([`clock ${2 * DAY}`]);
    expect(top("2d")).toEqual([`clock ${2 * DAY}`]);
    expect(top("2 days")).toEqual([`clock ${2 * DAY}`]);
    expect(top("clock +2 days")).toEqual([`clock ${2 * DAY}`]);
  });

  test("the knob and the value together", () => {
    expect(top("scheme dark")).toEqual(["scheme dark"]);
    expect(top("speed pause")).toEqual(["speed 0"]);
    expect(top("pseudo on")).toEqual(["pseudo on"]);
    expect(top("vision deuteranopia")).toEqual(["vision deuteranopia"]);
    expect(top("time zone asia/tokyo")).toEqual(["timeZone Asia/Tokyo"]);
    expect(top("width 390")).toEqual(["width 390"]);
  });

  test("aliases", () => {
    expect(top("dark mode")).toEqual(["scheme dark"]);
    expect(top("mobile")).toEqual(["width 390"]);
    expect(top("turkish")).toEqual(["locale tr"]);
    expect(top("high contrast")).toEqual(["contrast more"]);
    expect(top("retina")).toEqual(["dpr 2"]);
  });

  test("devices by name, kind and browser, and a size typed out", () => {
    expect(top("iphone")).toEqual(["device iphone-18-pro"]);
    expect(top("iphone pro max")).toEqual(["device iphone-18-pro-max"]);
    expect(top("iphone 16 pro max")).toEqual(["device iphone-16-pro-max"]);
    expect(top("duo")).toEqual(["device iphone-duo"]);
    expect(top("air")).toEqual(["device iphone-air"]);
    expect(top("pixel")).toEqual(["device pixel-10"]);
    expect(top("pixel 9 pro xl")).toEqual(["device pixel-9-pro-xl"]);
    expect(top("pixel 10a")).toEqual(["device pixel-10a"]);
    expect(top("ipad")).toEqual(["device ipad-mini"]);
    expect(top("macbook")).toEqual(["device macbook-air-13"]);
    expect(top("phone")).toEqual(["device iphone-18-pro"]);
    expect(top("tablet", 3)).toEqual([
      "device ipad-mini",
      "device ipad-air-11",
      "device ipad-pro-13",
    ]);
    expect(top("android")).toEqual(["device pixel-10"]);
    expect(top("landscape")).toEqual(["device landscape"]);
    expect(top("rotate")).toEqual(["device -"]);
    expect(top("390x844")).toEqual(["device 390x844"]);
    expect(top("390 × 844")).toEqual(["device 390x844"]);
  });

  test("a foldable folded open or shut, by its posture or what folding it is called", () => {
    expect(top("unfold")).toEqual(["device iphone-duo:open"]);
    expect(top("fold")).toEqual(["device iphone-duo:closed"]);
    expect(top("open")).toEqual(["device iphone-duo:open"]);
    expect(top("closed")).toEqual(["device iphone-duo:closed"]);
    expect(top("duo open")).toEqual(["device iphone-duo:open"]);
    expect(top("duo closed")).toEqual(["device iphone-duo:closed"]);
    const unfold = search("unfold", KNOBS)[0];
    expect(unfold && resultText(unfold)).toEqual({ knob: "device", value: "iPhone Duo open" });
  });

  test("one word, every knob it names a value of", () => {
    expect(top("tokyo", 2)).toEqual(["geo tokyo", "timeZone Asia/Tokyo"]);
    expect(top("reduce", 2)).toEqual(["motion reduce", "transparency reduce"]);
  });

  test("a knob's name opens it, ahead of its values", () => {
    expect(top("geo")).toEqual(["geo -"]);
    expect(top("scheme", 4)).toEqual(["scheme -", "scheme system", "scheme light", "scheme dark"]);
  });

  test("is case-insensitive and goes by word starts", () => {
    expect(top("DARK")).toEqual(["scheme dark"]);
    expect(top("deut")).toEqual(["vision deuteranopia"]);
    expect(top("new york", 2)).toEqual(["geo new-york", "timeZone America/New_York"]);
  });

  test("a whole word beats the start of one", () => {
    expect(top("2", 2)).toEqual([`clock ${2 * DAY}`, "dpr 2"]);
  });

  test("values typed out in full", () => {
    expect(top("500")).toEqual(["width 500"]);
    expect(top("3d")).toEqual([`clock ${3 * DAY}`]);
    expect(top("pt-br")).toEqual(["locale pt-BR"]);
    expect(top("36.9, 30.7")).toEqual(["geo 36.9,30.7"]);
    expect(top("europe/paris")).toEqual(["timeZone Europe/Paris"]);
    expect(top("paris")).toEqual(["timeZone Europe/Paris"]);
  });

  test("zoom by its percent, typed out too, and fit", () => {
    expect(top("zoom 50")).toEqual(["zoom 0.5"]);
    expect(top("zoom 125%")).toEqual(["zoom 1.25"]);
    expect(top("zoom 80")).toEqual(["zoom 0.8"]);
    expect(top("fit")).toEqual(["zoom fit"]);
  });

  test("a bare number names no text size or dpr, the knob's name does", () => {
    expect(top("text 18")).toEqual(["text 18"]);
    expect(top("dpr 1.5")).toEqual(["dpr 1.5"]);
    expect(search("18", KNOBS).some((result) => result.knob.id === "text")).toBe(false);
  });

  test("finds nothing in nothing", () => {
    expect(search("", KNOBS)).toEqual([]);
    expect(search("   ", KNOBS)).toEqual([]);
    expect(search("zzzz", KNOBS)).toEqual([]);
  });

  test("shows a bounded list", () => {
    expect(search("a", KNOBS).length).toBeLessThanOrEqual(40);
  });

  test("user agent presets by browser, system or bot", () => {
    expect(top("ua")).toEqual(["ua -"]);
    expect(top("user agent")).toEqual(["ua -"]);
    expect(top("ua android")).toEqual(["ua android-chrome"]);
    expect(top("googlebot")).toEqual(["ua googlebot"]);
    expect(top("bot")).toEqual(["ua googlebot"]);
    expect(top("firefox")).toEqual(["ua linux-firefox"]);
    expect(top("ua iphone")).toEqual(["ua iphone-safari"]);
    expect(top("ua curl/8.7.1")).toEqual(["ua curl/8.7.1"]);
    expect(search("europe/paris", KNOBS).some((result) => result.knob.id === "ua")).toBe(false);
  });

  test("leaves out the knobs the browser cannot use", () => {
    const usable = KNOBS.filter((knob) => knob.id !== "connection");
    expect(search("3g", usable)).toEqual([]);
    expect(top("3g")).toEqual(["connection 3g"]);
  });
});

describe("resultText", () => {
  test("reads as the knob, then the value written out", () => {
    const [result] = search("+2d", KNOBS);
    expect(result && resultText(result)).toEqual({ knob: "clock", value: "+2 days" });
    const [knob] = search("geo", KNOBS);
    expect(knob && resultText(knob)).toEqual({ knob: "geo", value: "" });
  });
});

describe("filterOptions", () => {
  test("an empty filter lists the knob's own values", () => {
    expect(filterOptions(knobOf("vision"), "")).toEqual([...knobOf("vision").options]);
  });

  test("matches labels and aliases", () => {
    expect(filterOptions(knobOf("locale"), "turk").map((option) => option.value)).toEqual(["tr"]);
    expect(filterOptions(knobOf("vision"), "blu").map((option) => option.value)).toEqual([
      "tritanopia",
      "blur",
    ]);
  });

  test("reaches past the presets and takes a value typed out", () => {
    expect(filterOptions(knobOf("timeZone"), "kath").map((option) => option.value)).toContain(
      "Asia/Kathmandu",
    );
    expect(filterOptions(knobOf("timeZone"), "paris").map((option) => option.value)).toEqual([
      "Europe/Paris",
    ]);
    expect(filterOptions(knobOf("locale"), "pt-br").map((option) => option.value)).toEqual([
      "pt-BR",
    ]);
    expect(filterOptions(knobOf("ua"), "curl/8.7.1").map((option) => option.value)).toEqual([
      "curl/8.7.1",
    ]);
    expect(filterOptions(knobOf("ua"), "safari").map((option) => option.value)).toEqual([
      "iphone-safari",
      "ipad-safari",
      "mac-safari",
    ]);
  });
});

describe("searchActions", () => {
  test("finds grab by its name and its aliases", () => {
    for (const query of ["grab", "gra", "inspect", "pick", "pick element"]) {
      expect(searchActions(query).map((action) => action.id)).toEqual(["grab"]);
    }
  });

  test("finds replay animations by what it does", () => {
    for (const query of ["replay", "animations", "restart", "replay animations"]) {
      expect(searchActions(query).map((action) => action.id)).toEqual(["replay"]);
    }
  });

  test("finds nothing for no query or a knob", () => {
    expect(searchActions("")).toEqual([]);
    expect(searchActions("dark")).toEqual([]);
  });
});
