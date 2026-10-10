import { describe, expect, test } from "bun:test";
import { BODY_CAP, type BodyRecord } from "../src/requests/types";
import {
  atBottom,
  bodyNote,
  bodyText,
  bytesLabel,
  clockTime,
  copyText,
  durationLabel,
  generalLines,
  hides,
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

describe("atBottom", () => {
  test("holds at the end and within the slack of it", () => {
    expect(atBottom(900, 100, 1000)).toBe(true);
    expect(atBottom(900 - STICK_SLACK, 100, 1000)).toBe(true);
    expect(atBottom(0, 100, 80)).toBe(true);
  });

  test("lets go once scrolled up past the slack", () => {
    expect(atBottom(900 - STICK_SLACK - 1, 100, 1000)).toBe(false);
    expect(atBottom(0, 100, 1000)).toBe(false);
  });
});

describe("bodies", () => {
  test("json that is all there is laid out a key a line", () => {
    expect(bodyText(text('{"id":7,"tags":["a"]}'))).toBe('{\n  "id": 7,\n  "tags": [\n    "a"\n  ]\n}');
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
