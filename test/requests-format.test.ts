import { describe, expect, test } from "bun:test";
import { BODY_CAP, type BodyRecord } from "../src/requests/types";
import {
  atTop,
  bodyNote,
  bodyText,
  bytesLabel,
  clockTime,
  copyText,
  durationLabel,
  firstInView,
  generalLines,
  hides,
  keptScroll,
  kindLabel,
  LIGHT_WHY,
  matches,
  methodLabel,
  middle,
  QUERY_MAX,
  sizeLabel,
  statusHot,
  statusLabel,
  statusLine,
  STICK_SLACK,
  urlName,
} from "../src/ui/requestformat";
import { fetched, image } from "./requests-entries";

function text(body: string, more: Partial<BodyRecord> = {}): BodyRecord {
  return { kind: "text", text: body, size: body.length, truncated: false, type: "application/json", ...more };
}

describe("urlName", () => {
  test("is the last path segment, with the query apart", () => {
    expect(urlName("http://app.test/api/users?page=2")).toEqual({ name: "users", query: "?page=2" });
    expect(urlName("http://app.test/a/b/app.js")).toEqual({ name: "app.js", query: "" });
  });

  test("keeps the slash of a folder", () => {
    expect(urlName("http://app.test/api/users/")).toEqual({ name: "users/", query: "" });
  });

  test("is the host for a bare origin, its port included", () => {
    expect(urlName("http://app.test/")).toEqual({ name: "app.test", query: "" });
    expect(urlName("http://app.test:3000")).toEqual({ name: "app.test:3000", query: "" });
    expect(urlName("http://app.test/?q=1")).toEqual({ name: "app.test", query: "?q=1" });
  });

  test("names only the type of an address that holds its own content", () => {
    expect(urlName("data:image/png;base64,AAAA")).toEqual({ name: "data:image/png", query: "" });
  });

  test("leaves an address that does not read as it is", () => {
    expect(urlName("not a url")).toEqual({ name: "not a url", query: "" });
  });
});

describe("middle", () => {
  test("leaves a short text alone", () => {
    expect(middle("?page=2", QUERY_MAX)).toBe("?page=2");
    expect(middle("?".padEnd(QUERY_MAX, "a"), QUERY_MAX)).toHaveLength(QUERY_MAX);
  });

  test("cuts a long one in its middle, to the length asked for", () => {
    const cut = middle("?page=2&sort=name&dir=asc", QUERY_MAX);
    expect(cut).toBe("?page=2&…dir=asc");
    expect([...cut]).toHaveLength(QUERY_MAX);
  });
});

describe("methodLabel and kindLabel", () => {
  test("a script's request shows its method, a long one kept short", () => {
    expect(methodLabel(fetched())).toBe("POST");
    expect(methodLabel(fetched({ method: "DELETE" }))).toBe("DEL");
    expect(methodLabel(fetched({ method: "OPTIONS" }))).toBe("OPT");
    expect(methodLabel(fetched({ method: "PROPFIND" }))).toBe("PROPF");
  });

  test("a light row shows what kind of thing it is", () => {
    expect(methodLabel(image())).toBe("img");
    expect(methodLabel(image({ kind: "navigation", url: "http://app.test/" }))).toBe("doc");
  });

  test("the kind comes from the type, then the address, then what loaded it", () => {
    expect(kindLabel(image({ url: "http://app.test/x", contentType: "text/css" }))).toBe("css");
    expect(kindLabel(image({ url: "http://app.test/a.woff2", initiatorType: "css" }))).toBe("font");
    expect(kindLabel(image({ url: "http://app.test/app.mjs?v=2", initiatorType: "link" }))).toBe("js");
    expect(kindLabel(image({ url: "http://app.test/x", initiatorType: "script" }))).toBe("js");
    expect(kindLabel(image({ url: "http://app.test/x", initiatorType: "beacon" }))).toBe("beacon");
    expect(kindLabel(image({ url: "http://app.test/x", initiatorType: "" }))).toBe("other");
    expect(kindLabel(fetched())).toBe("fetch");
  });

  test("a word of the page's that every object has a member by is no kind and no method", () => {
    for (const word of ["constructor", "toString", "__proto__", "hasOwnProperty", "valueOf"]) {
      // By its extension, then by what loaded it: the word itself, cut short, and never a function's text.
      expect(kindLabel(image({ url: `http://app.test/app.${word}`, initiatorType: "" }))).toBe("other");
      expect(kindLabel(image({ url: "http://app.test/x", initiatorType: word }))).toBe(word.slice(0, 6));
      expect(methodLabel(fetched({ method: word }))).toBe(word.slice(0, 5));
      expect(methodLabel(fetched({ method: word.toUpperCase() }))).toBe(word.toUpperCase().slice(0, 5));
    }
  });
});

describe("statusLabel", () => {
  test("is the number where there is one", () => {
    expect(statusLabel(fetched())).toBe("201");
    expect(statusLabel(fetched({ state: "failed", status: 404 }))).toBe("404");
  });

  test("is a word for a request that failed, was given up or still runs", () => {
    expect(statusLabel(fetched({ state: "failed", status: null }))).toBe("failed");
    expect(statusLabel(fetched({ state: "aborted", status: null }))).toBe("aborted");
    expect(statusLabel(fetched({ state: "pending", status: null }))).toBe("pending");
    expect(statusLabel(fetched({ status: 0 }))).toBe("opaque");
  });

  test("is empty where the browser does not say how a load went", () => {
    expect(statusLabel(image({ status: null }))).toBe("");
  });

  test("marks a failure and 400 or above, and nothing else", () => {
    expect(statusHot(fetched({ state: "failed", status: null }))).toBe(true);
    expect(statusHot(fetched({ state: "failed", status: 500 }))).toBe(true);
    expect(statusHot(image({ status: 404 }))).toBe(true);
    expect(statusHot(fetched())).toBe(false);
    expect(statusHot(fetched({ status: 399 }))).toBe(false);
    expect(statusHot(fetched({ state: "aborted", status: null }))).toBe(false);
    expect(statusHot(fetched({ state: "pending", status: null }))).toBe(false);
  });

  test("in full, says the status text or what went wrong", () => {
    expect(statusLine(fetched())).toBe("201 Created");
    expect(statusLine(fetched({ statusText: "" }))).toBe("201");
    expect(statusLine(fetched({ state: "failed", status: null, error: "TypeError: Failed to fetch" }))).toBe(
      "failed, TypeError: Failed to fetch",
    );
    expect(statusLine(image({ status: null }))).toBe("not given by the browser");
  });
});

describe("durationLabel", () => {
  test("is whole ms under a second", () => {
    expect(durationLabel(0)).toBe("0ms");
    expect(durationLabel(123.4)).toBe("123ms");
    expect(durationLabel(999.4)).toBe("999ms");
  });

  test("is seconds to one decimal from a second up", () => {
    expect(durationLabel(999.6)).toBe("1.0s");
    expect(durationLabel(1000)).toBe("1.0s");
    expect(durationLabel(1234)).toBe("1.2s");
    expect(durationLabel(12_345)).toBe("12.3s");
  });

  test("is empty while there is none", () => {
    expect(durationLabel(null)).toBe("");
  });
});

describe("sizes and times", () => {
  test("bytes read in the unit that fits", () => {
    expect(bytesLabel(0)).toBe("0 bytes");
    expect(bytesLabel(1)).toBe("1 byte");
    expect(bytesLabel(1023)).toBe("1023 bytes");
    expect(bytesLabel(1536)).toBe("1.5 KB");
    expect(bytesLabel(BODY_CAP)).toBe("64 KB");
    expect(bytesLabel(5 * 1024 * 1024)).toBe("5 MB");
  });

  test("a size says what came over the wire, or that the server hides it", () => {
    expect(sizeLabel({ transfer: 1536, encoded: 21, decoded: 21, hidden: false })).toBe(
      "1.5 KB over the wire, 21 bytes of body",
    );
    expect(sizeLabel({ transfer: 0, encoded: 21, decoded: 21, hidden: false })).toBe(
      "nothing over the wire, 21 bytes of body",
    );
    expect(sizeLabel({ transfer: 0, encoded: 0, decoded: 0, hidden: true })).toBe("hidden by the server");
  });

  test("the time of day reads to the ms", () => {
    expect(clockTime(new Date(2026, 0, 2, 14, 3, 7, 120))).toBe("14:03:07.120");
    expect(clockTime(new Date(2026, 0, 2, 0, 0, 0, 5))).toBe("00:00:00.005");
  });
});

describe("matches", () => {
  const post = fetched();
  const png = image();

  test("with no filter, the chips pick whose requests show", () => {
    expect([matches(post, "", "all"), matches(png, "", "all")]).toEqual([true, true]);
    expect([matches(post, "", "script"), matches(png, "", "script")]).toEqual([true, false]);
    expect([matches(post, "", "other"), matches(png, "", "other")]).toEqual([false, true]);
  });

  test("a light row of a script's request counts as the script's", () => {
    const late = image({ initiatorType: "fetch" });
    expect(matches(late, "", "script")).toBe(true);
    expect(matches(late, "", "other")).toBe(false);
  });

  test("the filter finds the address, the method and the status, in any case", () => {
    expect(matches(post, "USERS", "all")).toBe(true);
    expect(matches(post, "post", "all")).toBe(true);
    expect(matches(post, "201", "all")).toBe(true);
    expect(matches(post, "404", "all")).toBe(false);
    expect(matches(fetched({ state: "failed", status: null }), "failed", "all")).toBe(true);
    expect(matches(png, "post", "all")).toBe(false);
  });

  test("every word has to land, and the chip still holds", () => {
    expect(matches(post, "post users", "all")).toBe(true);
    expect(matches(post, "post logo", "all")).toBe(false);
    expect(matches(post, "users", "other")).toBe(false);
  });
});

describe("atTop", () => {
  test("holds at the start and within the slack of it", () => {
    expect(atTop(0)).toBe(true);
    expect(atTop(STICK_SLACK)).toBe(true);
    // A box pulled past its start, as a touch scroll can.
    expect(atTop(-12)).toBe(true);
  });

  test("lets go once scrolled down past the slack", () => {
    expect(atTop(STICK_SLACK + 1)).toBe(false);
    expect(atTop(900)).toBe(false);
  });
});

describe("firstInView", () => {
  test("is the row the scroll has reached, one that is partly gone included", () => {
    expect(firstInView(0, 26)).toBe(0);
    expect(firstInView(25, 26)).toBe(0);
    expect(firstInView(26, 26)).toBe(1);
    expect(firstInView(120, 26)).toBe(4);
    expect(firstInView(64.5, 25.8)).toBe(2);
  });

  test("is the first row where nothing tells how far apart they are", () => {
    expect(firstInView(120, 0)).toBe(0);
    expect(firstInView(-12, 26)).toBe(0);
  });
});

describe("keptScroll", () => {
  test("goes on by just the height of the rows that went in above", () => {
    expect(keptScroll(120, 1, 26)).toBe(146);
    expect(keptScroll(120, 50, 26)).toBe(120 + 50 * 26);
    expect(keptScroll(64.5, 3, 25.8)).toBeCloseTo(141.9);
  });

  test("stays for none, and comes back for rows that left from above", () => {
    expect(keptScroll(120, 0, 26)).toBe(120);
    expect(keptScroll(120, -2, 26)).toBe(68);
    expect(keptScroll(20, -2, 26)).toBe(0);
  });
});

describe("bodies", () => {
  test("json that is all there is laid out a key a line", () => {
    expect(bodyText(text('{"id":7,"tags":["a"]}'))).toBe('{\n  "id": 7,\n  "tags": [\n    "a"\n  ]\n}');
  });

  test("json that laying out would change stays as it was kept", () => {
    const kept = (json: string) => expect(bodyText(text(json))).toBe(json);
    // A number too long for the engine would lose its last digits.
    kept('{"id":12345678901234567890}');
    kept('{"price":1.10}');
    // A key that comes twice would leave once, and number keys would change places.
    kept('{"a":1,"a":2}');
    kept('{"2":"b","1":"a"}');
    // An escape written another way would be written the engine's way.
    kept('{"name":"\\u00e9"}');
  });

  test("json is laid out whatever white space it came with, and a string keeps its own", () => {
    expect(bodyText(text('{ "a" : [ 1,\n\t2 ],\r\n "b c" : "x  \\" y" }'))).toBe(
      '{\n  "a": [\n    1,\n    2\n  ],\n  "b c": "x  \\" y"\n}',
    );
  });

  test("a body cut by time says so, and not that it was cut at the cap", () => {
    const late = text("half", { truncated: true, timedOut: true, size: null });
    expect(bodyNote(late)).toBe("cut after 2 seconds, the rest was still coming");
    expect(bodyNote(text("half", { truncated: true, size: null }))).toBe("truncated at 64 KB");
  });

  test("json that was cut stays as it was kept", () => {
    const cut = text('{"id":7,"na', { truncated: true, size: null });
    expect(bodyText(cut)).toBe('{"id":7,"na');
    // A cut that happens to read as json is still not the whole body.
    expect(bodyText(text("[1,2]", { truncated: true }))).toBe("[1,2]");
  });

  test("anything that is not json, or does not read as it, stays as it was kept", () => {
    expect(bodyText(text('{"id":7}', { type: "text/plain" }))).toBe('{"id":7}');
    expect(bodyText(text("{oops", { type: "application/json" }))).toBe("{oops");
    expect(bodyText(text("a=1\nb=2", { kind: "form", type: "application/json" }))).toBe("a=1\nb=2");
  });

  test("the answer's type stands in where the body has none", () => {
    expect(bodyText(text('{"id":7}', { type: "" }), "application/problem+json")).toBe('{\n  "id": 7\n}');
    expect(bodyText(text('{"id":7}', { type: "" }))).toBe('{"id":7}');
  });

  test("the note says how big, that it was cut, or what it is", () => {
    expect(bodyNote(text("abc"))).toBe("3 bytes");
    expect(bodyNote(text("abc", { truncated: true, size: null }))).toBe("truncated at 64 KB");
    expect(bodyNote(text("abc", { truncated: true, size: 2 * 1024 * 1024 }))).toBe("truncated at 64 KB of 2 MB");
    expect(bodyNote(text("", { kind: "binary", size: 2048 }))).toBe("binary, 2 KB");
    expect(bodyNote(text("", { kind: "binary", size: null }))).toBe("binary");
    expect(bodyNote(text("", { kind: "stream", size: null }))).toBe("stream, not read");
    expect(bodyNote(text("", { kind: "opaque", size: null }))).toBe("opaque");
  });
});

describe("generalLines", () => {
  test("a fetch says all that is known of it", () => {
    expect(generalLines(fetched(), "14:03:07.120")).toEqual([
      ["url", "http://app.test/api/users?page=2"],
      ["method", "POST"],
      ["status", "201 Created"],
      ["state", "ok"],
      ["kind", "fetch"],
      ["type", "application/json"],
      ["started at", "14:03:07.120"],
      ["duration", "123ms"],
      ["time to response", "80ms"],
      ["size", "1.5 KB over the wire, 21 bytes of body"],
      ["protocol", "h2"],
    ]);
  });

  test("a light row has no method, and says its size is hidden", () => {
    expect(generalLines(image(), "09:00:00.000")).toEqual([
      ["url", "http://cdn.test/img/logo.png"],
      ["status", "200"],
      ["state", "ok"],
      ["kind", "img, loaded by img"],
      ["started at", "09:00:00.000"],
      ["duration", "45ms"],
      ["time to response", "30ms"],
      ["size", "hidden by the server"],
      ["protocol", "h2"],
    ]);
  });

  test("says where a redirect ended, that it still runs, and that it is the frame's", () => {
    const lines = generalLines(
      fetched({
        finalUrl: "http://app.test/v2/users",
        source: "frame",
        state: "pending",
        status: null,
        sizes: null,
        protocol: "",
        timing: { start: 0, at: 0, response: null, end: null, duration: null },
      }),
      "now",
    );
    expect(lines).toContainEqual(["answered from", "http://app.test/v2/users"]);
    expect(lines).toContainEqual(["duration", "still going"]);
    expect(lines).toContainEqual(["from", "the device frame"]);
    expect(lines.map(([label]) => label)).not.toContain("size");
    expect(lines.map(([label]) => label)).not.toContain("time to response");
  });
});

describe("hides", () => {
  test("the headers that carry a credential, in any case", () => {
    for (const name of ["authorization", "Cookie", "Set-Cookie", "Proxy-Authorization"]) {
      expect(hides(name)).toBe(true);
    }
  });

  test("any header named for a token, a secret, a key or a password", () => {
    for (const name of ["X-CSRF-Token", "x-client-secret", "X-Api-Key", "x-password-hint"]) {
      expect(hides(name)).toBe(true);
    }
  });

  test("nothing else", () => {
    for (const name of ["content-type", "accept", "x-request-id", "cache-control"]) {
      expect(hides(name)).toBe(false);
    }
  });
});

describe("copyText", () => {
  test("a fetch, whole, with the values of its secret headers left out", () => {
    expect(copyText(fetched())).toBe(
      [
        "POST http://app.test/api/users?page=2",
        "status: 201 Created",
        "time: 123ms, response after 80ms",
        "size: 1.5 KB over the wire, 21 bytes of body",
        "protocol: h2",
        "",
        "request headers:",
        "content-type: application/json",
        "Authorization: <hidden>",
        "X-Api-Key: <hidden>",
        "",
        "request body (application/json, 14 bytes):",
        '{"name":"Ada"}',
        "",
        "response headers:",
        "content-type: application/json",
        "set-cookie: <hidden>",
        "",
        "response body (application/json, 21 bytes):",
        '{"id":7,"name":"Ada"}',
        "",
        "initiator:",
        "at save (http://app.test/app.js:10:5)",
        "at onClick (http://app.test/app.js:22:3)",
      ].join("\n"),
    );
  });

  test("a secret in an address, a header or a stack is hidden, and a body is copied as it is", () => {
    const entry = fetched({
      url: "http://app.test/api/login?access_token=tok123&page=2&api_key=k9&sig=keep#session_id=s77",
      finalUrl: "http://sso.test/done?jwt=eyJ.a.b&next=%2Fhome&X-Amz-Signature=abc&X-Amz-Credential=me",
      redirected: true,
      requestHeaders: [
        ["content-type", "application/x-www-form-urlencoded"],
        ["X-Auth", "a1"],
        ["X-Session-Id", "s2"],
        ["X-Signature", "s3"],
        ["X-Amz-Credential", "c4"],
        ["X-Jwt-Assertion", "j5"],
        ["Accept", "text/html"],
      ],
      requestBody: {
        kind: "form",
        text: "user=ada\npassword=hunter2",
        size: null,
        truncated: false,
        type: "application/x-www-form-urlencoded",
      },
      responseHeaders: [["content-type", "application/json"]],
      responseBody: {
        kind: "text",
        text: '{"access_token":"tok999"}',
        size: 25,
        truncated: false,
        type: "application/json",
      },
      initiator: [
        "at login (http://app.test/app.js?token=t1&v=3:10:5)",
        "login@http://app.test/app.js?auth=a2:22:3",
        "at http://app.test/boot.js?v=4&key=k5",
      ].join("\n"),
    });
    expect(copyText(entry)).toBe(
      [
        "POST http://app.test/api/login?access_token=<hidden>&page=2&api_key=<hidden>&sig=keep#session_id=<hidden>",
        "answered from: http://sso.test/done?jwt=<hidden>&next=%2Fhome&X-Amz-Signature=<hidden>&X-Amz-Credential=<hidden>",
        "status: 201 Created",
        "time: 123ms, response after 80ms",
        "size: 1.5 KB over the wire, 21 bytes of body",
        "protocol: h2",
        "",
        "request headers:",
        "content-type: application/x-www-form-urlencoded",
        "X-Auth: <hidden>",
        "X-Session-Id: <hidden>",
        "X-Signature: <hidden>",
        "X-Amz-Credential: <hidden>",
        "X-Jwt-Assertion: <hidden>",
        "Accept: text/html",
        "",
        "request body (application/x-www-form-urlencoded):",
        "user=ada",
        "password=hunter2",
        "",
        "response headers:",
        "content-type: application/json",
        "",
        "response body (application/json, 25 bytes):",
        '{"access_token":"tok999"}',
        "",
        "initiator:",
        "at login (http://app.test/app.js?token=<hidden>&v=3:10:5)",
        "login@http://app.test/app.js?auth=<hidden>:22:3",
        "at http://app.test/boot.js?v=4&key=<hidden>",
      ].join("\n"),
    );
    // The row keeps its own, for the pane to show.
    expect(entry.url).toContain("access_token=tok123");
  });

  test("a light row, with what the browser does not give said plainly", () => {
    expect(copyText(image())).toBe(
      [
        "img http://cdn.test/img/logo.png",
        "status: 200",
        "time: 45ms, response after 30ms",
        "size: hidden by the server",
        "protocol: h2",
        `note: ${LIGHT_WHY}, no headers and no bodies`,
      ].join("\n"),
    );
  });

  test("no secret value is in the text, and the row keeps its own", () => {
    const entry = fetched();
    const copied = copyText(entry);
    for (const secret of ["Bearer abc", "k1", "sid=1"]) expect(copied).not.toContain(secret);
    expect(entry.requestHeaders[1]).toEqual(["Authorization", "Bearer abc"]);
  });

  test("a body is copied as it was kept, with what is missing of it", () => {
    const cut = text('{"id":7,"na', { truncated: true, size: null });
    const copied = copyText(fetched({ responseBody: cut }));
    expect(copied).toContain('response body (application/json, truncated at 64 KB):\n{"id":7,"na');
    const bytes = text("", { kind: "binary", size: 2048, type: "image/png" });
    expect(copyText(fetched({ responseBody: bytes }))).toContain("\nresponse body: binary, 2 KB, image/png");
    const stream = text("", { kind: "stream", size: null, type: "" });
    expect(copyText(fetched({ requestBody: stream }))).toContain("\nrequest body: stream, not read");
  });

  test("a request that never got an answer says why, and leaves out what it has none of", () => {
    const copied = copyText(
      fetched({
        method: "GET",
        state: "failed",
        status: null,
        statusText: "",
        error: "TypeError: Failed to fetch",
        requestHeaders: [],
        requestBody: null,
        responseHeaders: [],
        responseBody: null,
        sizes: null,
        protocol: "",
        initiator: "",
      }),
    );
    expect(copied).toBe(
      [
        "GET http://app.test/api/users?page=2",
        "status: failed, TypeError: Failed to fetch",
        "time: 123ms, response after 80ms",
      ].join("\n"),
    );
  });
});
