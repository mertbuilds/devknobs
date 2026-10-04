import type { ConnectionValue, NetworkValue } from "../types";

/** What Chrome reports for each effective type, at the edge of its band. */
const CONNECTIONS: Record<Exclude<ConnectionValue, "system">, { rtt: number; downlink: number }> = {
  "slow-2g": { rtt: 2000, downlink: 0.05 },
  "2g": { rtt: 1400, downlink: 0.07 },
  "3g": { rtt: 270, downlink: 0.7 },
  "4g": { rtt: 50, downlink: 10 },
};

const CONNECTION_KEYS = ["effectiveType", "rtt", "downlink", "saveData"];

const SYSTEM: NetworkValue = { online: "system", type: "system", saveData: "system" };

/** Own getters devknobs put on an object, over the browser's own on its prototype. */
const shadowed = new Map<object, Set<string>>();

function shadow(target: object, key: string, value: unknown): void {
  Object.defineProperty(target, key, { configurable: true, enumerable: true, get: () => value });
  const keys = shadowed.get(target) ?? new Set<string>();
  keys.add(key);
  shadowed.set(target, keys);
}

function unshadow(target: object, key: string): void {
  if (shadowed.get(target)?.delete(key)) Reflect.deleteProperty(target, key);
}

/** `navigator.connection`, which only Chromium has. */
function connection(): EventTarget | null {
  const value = (navigator as { connection?: unknown }).connection;
  return value instanceof EventTarget ? value : null;
}

function readConnection(target: EventTarget): string {
  return CONNECTION_KEYS.map((key) => String(Reflect.get(target, key))).join();
}

/**
 * Mimic the network the page sees: `navigator.onLine` with its `online` and
 * `offline` events, and `navigator.connection` with its `change` event.
 * Requests still go out as before: only what the page reads changes.
 */
export function apply(value: NetworkValue): void {
  const wasOnline = navigator.onLine;
  if (value.online === "offline") shadow(navigator, "onLine", false);
  else unshadow(navigator, "onLine");
  if (navigator.onLine !== wasOnline) {
    window.dispatchEvent(new Event(navigator.onLine ? "online" : "offline"));
  }
  const target = connection();
  if (!target) return;
  const before = readConnection(target);
  if (value.type === "system") {
    for (const key of ["effectiveType", "rtt", "downlink"]) unshadow(target, key);
  } else {
    shadow(target, "effectiveType", value.type);
    shadow(target, "rtt", CONNECTIONS[value.type].rtt);
    shadow(target, "downlink", CONNECTIONS[value.type].downlink);
  }
  if (value.saveData === "system") unshadow(target, "saveData");
  else shadow(target, "saveData", value.saveData === "on");
  if (readConnection(target) !== before) target.dispatchEvent(new Event("change"));
}

export function reset(): void {
  if (shadowed.size > 0) apply(SYSTEM);
  shadowed.clear();
}
