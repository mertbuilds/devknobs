import { describe, expect, test } from "bun:test";
import {
  deleteDatabase,
  listDatabases,
  NO_LIST,
  RECORD_PAGE,
  readDatabase,
  readRecords,
} from "../src/storage/idb";
import { type DatabaseMode, type FakeSite, fakeSite, settle } from "./storage-fakes";

/** A page with one database of two stores, the second with 120 records. */
function shop(mode: DatabaseMode = "ok"): FakeSite {
  const site = fakeSite();
  site.idb.add("shop", 3, {
    carts: {
      keyPath: "id",
      autoIncrement: true,
      indexes: ["byUser", "byDate"],
      records: [[1, { id: 1, items: ["a"] }]],
    },
    events: {
      keyPath: null,
      records: Array.from({ length: 120 }, (_, at): [unknown, unknown] => [at, { at }]),
    },
  });
  site.idb.modes.set("shop", mode);
  return site;
}

/** Nothing is left open: every connection the reads made was closed. */
function allClosed(site: FakeSite): void {
  expect(site.idb.openNow()).toEqual([]);
}

describe("listing", () => {
  test("names every database with its version", async () => {
    const site = shop();
    site.idb.add("logs", 1, {});
    expect(await listDatabases(site)).toEqual({
      databases: [
        { name: "shop", version: 3 },
        { name: "logs", version: 1 },
      ],
      error: null,
    });
    // Listing opens nothing.
    expect(site.idb.opens).toEqual([]);
  });

  test("says plainly where the browser cannot list, and where there is no IndexedDB", async () => {
    expect(await listDatabases(fakeSite({ listable: false }))).toEqual({ databases: [], error: NO_LIST });
    expect(await listDatabases({ ...fakeSite(), indexedDB: undefined })).toEqual({
      databases: [],
      error: "IndexedDB is not here",
    });
  });
});

describe("reading a database", () => {
  test("gives each store's key path, auto increment, indexes and record count", async () => {
    const site = shop();
    expect(await readDatabase(site, "shop")).toEqual({
      version: 3,
      stores: [
        { name: "carts", keyPath: "id", autoIncrement: true, indexes: ["byUser", "byDate"], count: 1 },
        { name: "events", keyPath: "", autoIncrement: false, indexes: [], count: 120 },
      ],
      error: null,
    });
  });

  test("opens by name alone, with no version, so no upgrade is ever asked for", async () => {
    const site = shop();
    await readDatabase(site, "shop");
    await readRecords(site, "shop", "events", 0);
    expect(site.idb.opens).toEqual([["shop"], ["shop"]]);
  });

  test("reads in read-only transactions only", async () => {
    const site = shop();
    await readDatabase(site, "shop");
    await readRecords(site, "shop", "carts", 0);
    expect(site.idb.connections.flatMap((connection) => connection.modes)).toEqual([
      "readonly",
      "readonly",
    ]);
  });

  test("closes the database once it has read", async () => {
    const site = shop();
    await readDatabase(site, "shop");
    await readRecords(site, "shop", "events", 0);
    expect(site.idb.connections).toHaveLength(2);
    allClosed(site);
  });

  test("a database with no stores opens no transaction, and is closed", async () => {
    const site = fakeSite();
    site.idb.add("empty", 1, {});
    expect(await readDatabase(site, "empty")).toEqual({ version: 1, stores: [], error: null });
    expect(site.idb.connections[0]?.modes).toEqual([]);
    allClosed(site);
  });

  test("closes it when the open fails, and says so", async () => {
    const site = shop("fail");
    const read = await readDatabase(site, "shop", 20);
    expect(read.stores).toEqual([]);
    expect(read.error).toBe("cannot open shop: UnknownError");
    allClosed(site);
  });

  test("closes it when the transaction aborts", async () => {
    const site = shop("abort");
    const read = await readDatabase(site, "shop", 20);
    expect(read.error).toBe("cannot read shop: AbortError");
    expect(site.idb.connections).toHaveLength(1);
    allClosed(site);
    expect((await readRecords(site, "shop", "events", 0, RECORD_PAGE, 20)).error).toBe(
      "cannot read events: AbortError",
    );
    allClosed(site);
  });

  test("closes it when starting the transaction throws", async () => {
    const site = shop("throw");
    expect((await readDatabase(site, "shop", 20)).error).toBe(
      "cannot read shop: the storage is not ready",
    );
    expect((await readRecords(site, "shop", "events", 0, RECORD_PAGE, 20)).error).toBe(
      "cannot read events: the storage is not ready",
    );
    expect(site.idb.connections).toHaveLength(2);
    allClosed(site);
  });

  test("gives up on a read that never finishes, and closes the database", async () => {
    const site = shop("hang");
    const read = await readDatabase(site, "shop", 20);
    expect(read.error).toBe("cannot read shop: it took too long");
    allClosed(site);
    expect((await readRecords(site, "shop", "events", 0, RECORD_PAGE, 20)).error).toBe(
      "cannot read events: it took too long",
    );
    allClosed(site);
  });

  test("gives up on an open that the page's upgrade holds back, and holds nothing", async () => {
    const site = shop("never");
    const started = Date.now();
    const read = await readDatabase(site, "shop", 20);
    expect(Date.now() - started).toBeLessThan(500);
    expect(read.error).toBe("shop did not open in time: the page may be upgrading it");
    expect(site.idb.connections).toEqual([]);
  });

  test("a connection that comes after the view gave up is closed the moment it arrives", async () => {
    const site = shop("late");
    site.idb.lateBy = 40;
    const read = await readDatabase(site, "shop", 10);
    expect(read.error).toContain("did not open in time");
    await settle(60);
    expect(site.idb.connections).toHaveLength(1);
    expect(site.idb.connections[0]?.modes).toEqual([]);
    allClosed(site);
  });

  test("lets the page's own upgrade through: a version change closes the connection at once", async () => {
    const site = shop("hang");
    const reading = readDatabase(site, "shop", 50);
    await settle(5);
    const [connection] = site.idb.connections;
    expect(connection?.closed).toBe(false);
    connection?.onversionchange?.();
    expect(connection?.closed).toBe(true);
    await reading;
  });

  test("a name that is gone is never created: the upgrade is aborted", async () => {
    const site = fakeSite();
    const read = await readDatabase(site, "ghost", 20);
    expect(read.error).toBe("ghost is gone");
    expect(site.idb.aborted).toEqual(["ghost"]);
    expect(site.idb.created).toEqual([]);
    expect(site.idb.data.has("ghost")).toBe(false);
    allClosed(site);
  });
});

describe("reading records", () => {
  test("gives the first fifty, in key order", async () => {
    const site = shop();
    const page = await readRecords(site, "shop", "events", 0);
    expect(RECORD_PAGE).toBe(50);
    expect(page.error).toBeNull();
    expect(page.records).toHaveLength(50);
    expect(page.records[0]).toEqual({ key: 0, value: { at: 0 } });
    expect(page.records[49]).toEqual({ key: 49, value: { at: 49 } });
  });

  test("pages by fifty, and the last page is what is left", async () => {
    const site = shop();
    const second = await readRecords(site, "shop", "events", 50);
    expect(second.records.map((record) => record.key)).toEqual(Array.from({ length: 50 }, (_, at) => 50 + at));
    const third = await readRecords(site, "shop", "events", 100);
    expect(third.records.map((record) => record.key)).toEqual(Array.from({ length: 20 }, (_, at) => 100 + at));
    expect((await readRecords(site, "shop", "events", 120)).records).toEqual([]);
    allClosed(site);
  });

  test("a store that is not there is a line, and the database is closed", async () => {
    const site = shop();
    const page = await readRecords(site, "shop", "nope", 0, RECORD_PAGE, 20);
    expect(page.records).toEqual([]);
    expect(page.error).toBe("cannot read nope: NotFoundError");
    allClosed(site);
  });
});

describe("deleting a database", () => {
  test("deletes it whole", async () => {
    const site = shop();
    expect(await deleteDatabase(site, "shop", 20)).toBe("deleted");
    expect(site.idb.data.has("shop")).toBe(false);
    expect(site.idb.opens).toEqual([]);
  });

  test("one the page holds open says blocked once the wait is over", async () => {
    const site = shop();
    site.idb.held.add("shop");
    const started = Date.now();
    expect(await deleteDatabase(site, "shop", 20)).toBe("blocked");
    expect(Date.now() - started).toBeLessThan(500);
    expect(site.idb.data.has("shop")).toBe(true);
  });

  test("fails without IndexedDB", async () => {
    expect(await deleteDatabase({ ...fakeSite(), indexedDB: undefined }, "x", 20)).toBe("failed");
  });
});
