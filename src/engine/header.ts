import type { ClockValue } from "../types";
import { NativeDate, now } from "./clock";

/** The request header that tells the page's own server what time the clock says. */
export const NOW_HEADER = "x-devknobs-now";

type Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type Method = (this: XMLHttpRequest, ...args: unknown[]) => unknown;

interface Installed {
  target: object;
  key: string;
  original: unknown;
  value: unknown;
}

let on = false;
let installed: Installed[] = [];
/** The requests `open` aimed at the page's own origin. */
const ownOrigin = new WeakSet<XMLHttpRequest>();

/** Asked for, and a clock set to send. The real time is no news to a server. */
export function sends(clock: ClockValue): boolean {
  return clock.header && clock.mode !== "system";
}

/**
 * Is the URL on the page's own origin? Only those get the header: on another
 * origin it would set off a CORS preflight, and hand the clock to a stranger.
 */
export function sameOrigin(url: string): boolean {
  try {
    const { origin } = new URL(url, document.baseURI);
    return origin !== "null" && origin === location.origin;
  } catch {
    return false;
  }
}

function stamp(): string {
  return new NativeDate(now()).toISOString();
}

function isRequest(input: RequestInfo | URL): input is Request {
  return typeof input === "object" && "url" in input && "headers" in input;
}

/**
 * The fetch arguments with the header on: on the init's headers, which a
 * request's own give way to, or else on a copy of the request.
 */
function withHeader(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
): [RequestInfo | URL, RequestInit | undefined] {
  if (isRequest(input) && init?.headers === undefined) {
    const copy = new Request(input);
    copy.headers.set(NOW_HEADER, stamp());
    return [copy, init];
  }
  const headers = new Headers(init?.headers);
  headers.set(NOW_HEADER, stamp());
  return [input, { ...init, headers }];
}

function install<T>(target: object, key: string, make: (original: T) => T): void {
  const original = Reflect.get(target, key);
  if (typeof original !== "function") return;
  const value = make(original as T);
  if (Reflect.set(target, key, value)) installed.push({ target, key, original, value });
}

function patch(): void {
  if (installed.length > 0) return;
  install<Fetch>(
    globalThis,
    "fetch",
    (original) =>
      function fetch(this: unknown, input: RequestInfo | URL, init?: RequestInit) {
        const url = isRequest(input) ? input.url : String(input);
        if (!on || !sameOrigin(url)) return original.call(this, input, init);
        let args: [RequestInfo | URL, RequestInit | undefined] = [input, init];
        try {
          args = withHeader(input, init);
        } catch {
          // A request fetch refuses anyway, a used body say: let it reject as it would.
        }
        return original.call(this, ...args);
      },
  );
  if (typeof XMLHttpRequest !== "function") return;
  const xhr = XMLHttpRequest.prototype;
  install<Method>(
    xhr,
    "open",
    (original) =>
      function (this: XMLHttpRequest, ...args: unknown[]) {
        if (sameOrigin(String(args[1]))) ownOrigin.add(this);
        else ownOrigin.delete(this);
        return original.apply(this, args);
      },
  );
  install<Method>(
    xhr,
    "send",
    (original) =>
      function (this: XMLHttpRequest, ...args: unknown[]) {
        if (on && ownOrigin.has(this)) {
          try {
            this.setRequestHeader(NOW_HEADER, stamp());
          } catch {
            // Not opened: send throws its own error.
          }
        }
        return original.apply(this, args);
      },
  );
}

function restore(): void {
  for (const { target, key, original, value } of installed.reverse()) {
    // Wrapped by someone else since: leave theirs, ours passes through now.
    if (Reflect.get(target, key) === value) Reflect.set(target, key, original);
  }
  installed = [];
}

/**
 * Put the clock's instant on every `fetch` and `XMLHttpRequest` to the page's
 * own origin, when the clock knob asks for it.
 */
export function apply(value: ClockValue): void {
  on = sends(value);
  if (on) patch();
  else restore();
}

export function reset(): void {
  on = false;
  restore();
}
