import { describe, expect, test } from "bun:test";
import { claim, free, superseded } from "../src/instance";

/**
 * A copy's way out, shaped as `unmount` is: a copy taken over does nothing,
 * else it undoes its own and lets the page go.
 */
function copy(scope: object, name: string, calls: string[]): () => void {
  const release = () => {
    if (superseded(scope, release)) return;
    calls.push(name);
    free(scope, release);
  };
  return release;
}

describe("claim", () => {
  test("a second copy makes the first let go before it takes the page", () => {
    const scope = {};
    const calls: string[] = [];
    const first = copy(scope, "first", calls);
    const second = copy(scope, "second", calls);
    claim(scope, first);
    expect(calls).toEqual([]);
    claim(scope, second);
    expect(calls).toEqual(["first"]);
    expect(superseded(scope, first)).toBe(true);
    expect(superseded(scope, second)).toBe(false);
  });

  test("the copy that holds the page claims it again without letting go", () => {
    const scope = {};
    let released = 0;
    const own = () => {
      released++;
    };
    claim(scope, own);
    claim(scope, own);
    expect(released).toBe(0);
    expect(superseded(scope, own)).toBe(false);
  });

  test("a third copy only makes the one holding the page let go", () => {
    const scope = {};
    const calls: string[] = [];
    const first = copy(scope, "first", calls);
    const second = copy(scope, "second", calls);
    claim(scope, first);
    claim(scope, second);
    claim(scope, copy(scope, "third", calls));
    expect(calls).toEqual(["first", "second"]);
  });
});

describe("superseded", () => {
  test("nothing holds a page nobody claimed, so a copy still undoes its own", () => {
    expect(superseded({}, () => {})).toBe(false);
  });

  test("a copy taken over has nothing left to undo", () => {
    const scope = {};
    const first = () => {};
    claim(scope, first);
    claim(scope, () => {});
    expect(superseded(scope, first)).toBe(true);
  });
});

describe("free", () => {
  test("lets the page go for the copy that holds it", () => {
    const scope = {};
    const own = () => {};
    claim(scope, own);
    free(scope, own);
    expect(Object.getOwnPropertySymbols(scope)).toEqual([]);
  });

  test("a copy taken over cannot let the new one's page go", () => {
    const scope = {};
    const first = () => {};
    const second = () => {};
    claim(scope, first);
    claim(scope, second);
    free(scope, first);
    expect(superseded(scope, first)).toBe(true);
    expect(superseded(scope, second)).toBe(false);
  });
});
