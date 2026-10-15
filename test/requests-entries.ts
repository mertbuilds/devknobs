import { blank } from "../src/requests/record";
import type { RequestEntry } from "../src/requests/types";
import { fakeClock, LOADED } from "./requests-fakes";

const clock = fakeClock();

/** A fetch that went well, with everything the log can know of one. */
export function fetched(more: Partial<RequestEntry> = {}): RequestEntry {
  return {
    ...blank("t-1", "fetch", "top", clock, 120),
    method: "POST",
    url: "http://app.test/api/users?page=2",
    state: "ok",
    status: 201,
    statusText: "Created",
    requestHeaders: [
      ["content-type", "application/json"],
      ["Authorization", "Bearer abc"],
      ["X-Api-Key", "k1"],
    ],
    responseHeaders: [
      ["content-type", "application/json"],
      ["set-cookie", "sid=1"],
    ],
    requestBody: { kind: "text", text: '{"name":"Ada"}', size: 14, truncated: false, type: "application/json" },
    responseBody: {
      kind: "text",
      text: '{"id":7,"name":"Ada"}',
      size: 21,
      truncated: false,
      type: "application/json",
    },
    contentType: "application/json",
    sizes: { transfer: 1536, encoded: 21, decoded: 21, hidden: false },
    timing: { start: LOADED + 120, at: 120, response: 80, end: LOADED + 243, duration: 123.4 },
    initiator: "at save (http://app.test/app.js:10:5)\nat onClick (http://app.test/app.js:22:3)",
    initiatorType: "fetch",
    protocol: "h2",
    ...more,
  };
}

/** An image the page loaded on its own, from a server that keeps its sizes to itself. */
export function image(more: Partial<RequestEntry> = {}): RequestEntry {
  return {
    ...blank("t-2", "resource", "top", clock, 40),
    url: "http://cdn.test/img/logo.png",
    state: "ok",
    status: 200,
    sizes: { transfer: 0, encoded: 0, decoded: 0, hidden: true },
    timing: { start: LOADED + 40, at: 40, response: 30, end: LOADED + 85, duration: 45 },
    initiatorType: "img",
    protocol: "h2",
    ...more,
  };
}
