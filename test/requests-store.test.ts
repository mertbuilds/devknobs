import { describe, expect, test } from "bun:test";
import { blank } from "../src/requests/record";
import { createStore } from "../src/requests/store";
import { type RequestEntry, RING_SIZE } from "../src/requests/types";
import { fakeClock, LOADED, manual } from "./requests-fakes";

function setup() {
  const clock = fakeClock();
  const timer = manual();
  const store = createStore({ seed: "t", now: () => clock.origin + clock.now(), schedule: timer.schedule });
  const add = (at: number): RequestEntry => {
    const entry = { ...blank(store.nextId(), "fetch", "top", clock, at), url: `http://app.test/${at}` };
    store.put(entry);
    return entry;
  };
  return { clock, timer, store, add };
}

describe("the ring", () => {
  test("keeps the last rows, oldest out first", () => {
    const { store, add } = setup();
    for (let at = 0; at < RING_SIZE + 5; at++) add(at);
    const rows = store.entries();
    expect(rows.length).toBe(RING_SIZE);
    expect(rows[0]?.timing.at).toBe(5);
    expect(rows.at(-1)?.timing.at).toBe(RING_SIZE + 4);
    expect(store.get("t-1")).toBeUndefined();
    expect(store.get(`t-${RING_SIZE + 5}`)).toBeDefined();
  });

  test("orders rows by when they started, whenever they came in", () => {
    const { store, add } = setup();
    add(30);
    add(10);
    add(20);
    add(20);
    expect(store.entries().map((row) => row.timing.at)).toEqual([10, 20, 20, 30]);
    expect(store.entries().map((row) => row.id)).toEqual(["t-2", "t-3", "t-4", "t-1"]);
  });

  test("a full ring has no room for a row older than all it holds", () => {
    const { store, add } = setup();
    for (let at = 10; at < RING_SIZE + 10; at++) add(at);
    const old = add(1);
    expect(store.entries().length).toBe(RING_SIZE);
    expect(store.get(old.id)).toBeUndefined();
    expect(store.entries()[0]?.timing.at).toBe(10);
  });

  test("gives every row an id of its own", () => {
    const { store } = setup();
    expect([store.nextId(), store.nextId()]).toEqual(["t-1", "t-2"]);
  });

  test("a change swaps the row for a new object in the same place", () => {
    const { store, add } = setup();
    const first = add(1);
    add(2);
    store.update(first.id, { status: 200, id: "other" });
    const changed = store.entries()[0];
    expect(changed).not.toBe(first);
    expect(changed).toMatchObject({ id: first.id, status: 200, url: first.url });
    expect(first.status).toBeNull();
    expect(store.entries().length).toBe(2);
    store.update("gone", { status: 500 });
    expect(store.entries().length).toBe(2);
  });
});

describe("listeners", () => {
  test("hear of a burst once, with each changed row as it is now", () => {
    const { store, add, timer } = setup();
    const heard: string[][] = [];
    store.subscribe((changed) => heard.push(changed.map((row) => `${row.id}:${row.status}`)));
    const first = add(1);
    add(2);
    store.update(first.id, { status: 200 });
    store.update(first.id, { status: 404 });
    expect(heard).toEqual([]);
    expect(timer.waiting()).toBe(1);
    timer.run();
    expect(heard).toEqual([["t-1:404", "t-2:null"]]);
    timer.run();
    expect(heard.length).toBe(1);
    add(3);
    timer.run();
    expect(heard[1]).toEqual(["t-3:null"]);
  });

  test("with no listener nothing is gathered and no timer runs", () => {
    const { store, add, timer } = setup();
    add(1);
    store.clear();
    add(2);
    expect(timer.waiting()).toBe(0);
    const heard: number[] = [];
    store.subscribe((changed) => heard.push(changed.length));
    store.flush();
    expect(heard).toEqual([]);
  });

  test("one that left hears no more", () => {
    const { store, add, timer } = setup();
    let calls = 0;
    const leave = store.subscribe(() => calls++);
    add(1);
    timer.run();
    leave();
    add(2);
    timer.run();
    expect(calls).toBe(1);
  });

  test("flush tells them now, and the timer has nothing left to tell", () => {
    const { store, add, timer } = setup();
    let calls = 0;
    store.subscribe(() => calls++);
    add(1);
    store.flush();
    expect(calls).toBe(1);
    expect(timer.waiting()).toBe(0);
  });
});

describe("clear", () => {
  test("empties the log and says so once, with no row", () => {
    const { store, add, timer } = setup();
    const heard: number[] = [];
    store.subscribe((changed) => heard.push(changed.length));
    add(1);
    add(2);
    store.clear();
    expect(store.entries()).toEqual([]);
    timer.run();
    expect(heard).toEqual([0]);
  });

  test("late news of a row from before stays out, and a new row comes in", () => {
    const { store, add, clock } = setup();
    const old = add(1);
    clock.tick(100);
    store.clear();
    store.update(old.id, { status: 200 });
    store.put({ ...old, status: 200 });
    expect(store.entries()).toEqual([]);
    clock.tick(1);
    const next = add(clock.now());
    expect(store.entries()).toEqual([next]);
    expect(next.timing.start).toBe(LOADED + 101);
  });

  test("close empties it and lets the listeners go", () => {
    const { store, add, timer } = setup();
    let calls = 0;
    store.subscribe(() => calls++);
    add(1);
    store.close();
    expect(timer.waiting()).toBe(0);
    add(2);
    timer.run();
    expect(calls).toBe(0);
  });
});
