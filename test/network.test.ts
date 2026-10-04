import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { apply, reset } from "../src/engine/network";
import type { NetworkValue } from "../src/types";

const realNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");

/** The browser's own connection, its readings on the prototype as in Chromium. */
class FakeConnection extends EventTarget {
  get effectiveType(): string {
    return "4g";
  }
  get rtt(): number {
    return 100;
  }
  get downlink(): number {
    return 9.6;
  }
  get saveData(): boolean {
    return false;
  }
}

class FakeNavigator {
  connection: FakeConnection | undefined = new FakeConnection();
  get onLine(): boolean {
    return true;
  }
}

let heard: string[] = [];

function network(patch: Partial<NetworkValue>): NetworkValue {
  return { online: "system", type: "system", saveData: "system", ...patch };
}

/** The fake navigator's connection, which the DOM types do not know about. */
function connection(): FakeConnection {
  return (navigator as unknown as FakeNavigator).connection!;
}

function readings(): unknown[] {
  const { effectiveType, rtt, downlink, saveData } = connection();
  return [effectiveType, rtt, downlink, saveData];
}

beforeEach(() => {
  heard = [];
  const window = new EventTarget();
  for (const type of ["online", "offline"]) window.addEventListener(type, () => heard.push(type));
  Object.defineProperty(globalThis, "window", { configurable: true, value: window });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: new FakeNavigator(),
  });
});

afterEach(() => {
  reset();
  Reflect.deleteProperty(globalThis, "window");
  if (realNavigator) Object.defineProperty(globalThis, "navigator", realNavigator);
});

describe("online", () => {
  test("offline flips navigator.onLine and fires the events once per move", () => {
    apply(network({ online: "offline" }));
    expect(navigator.onLine).toBe(false);
    apply(network({ online: "offline", type: "3g" }));
    expect(heard).toEqual(["offline"]);
    apply(network({}));
    expect(navigator.onLine).toBe(true);
    expect(heard).toEqual(["offline", "online"]);
  });

  test("reset puts the browser's flag back and says so", () => {
    apply(network({ online: "offline" }));
    reset();
    expect(navigator.onLine).toBe(true);
    expect(Object.keys(navigator)).toEqual(["connection"]);
    expect(heard).toEqual(["offline", "online"]);
  });
});

describe("connection", () => {
  test("reports the effective type with a matching rtt and downlink, and fires change", () => {
    let changes = 0;
    connection().addEventListener("change", () => changes++);
    apply(network({ type: "2g" }));
    expect(readings()).toEqual(["2g", 1400, 0.07, false]);
    apply(network({ type: "2g" }));
    expect(changes).toBe(1);
    apply(network({ type: "2g", saveData: "on" }));
    expect(readings()).toEqual(["2g", 1400, 0.07, true]);
    apply(network({}));
    expect(readings()).toEqual(["4g", 100, 9.6, false]);
    expect(changes).toBe(3);
    expect(Object.keys(connection())).toEqual([]);
  });

  test("a browser without a connection only gets the online flag", () => {
    (navigator as unknown as FakeNavigator).connection = undefined;
    apply(network({ online: "offline", type: "3g", saveData: "on" }));
    expect(navigator.onLine).toBe(false);
  });
});
