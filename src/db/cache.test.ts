/**
 * Cache Integration Tests
 *
 * Test Plan:
 *
 * cacheSet / cacheGet (Classification: I/O boundary + TTL)
 *   [x] Happy: round-trip returns stored value with metadata
 *   [x] Boundary: expired entry returns null (vi.useFakeTimers)
 *   [x] Unhappy: corrupt JSON stored → null + auto-delete
 *   [x] cacheDelete returns true for existing key, false for missing key
 *   [x] cachePurgeExpired returns count of expired entries removed
 *   [x] cacheClear returns count and empties the table
 *   [x] getCacheStats returns correct total, expired, and sources breakdown
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { setupTempDb, teardownTempDb } from "./__test-helpers__/temp-db.js";
import {
  cacheGet,
  cacheSet,
  cacheDelete,
  cachePurgeExpired,
  cacheClear,
  getCacheStats,
} from "./cache.js";
import { getDatabase } from "./database.js";

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  setupTempDb();
});

afterEach(async () => {
  vi.useRealTimers();
  teardownTempDb();
});

// ---------------------------------------------------------------------------
// cacheSet / cacheGet round-trip
// ---------------------------------------------------------------------------

describe("cacheSet / cacheGet", () => {
  it("round-trips a stored value with metadata", async () => {
    const data = { name: "Space Mountain", id: "sm-1" };
    await cacheSet("test-key", data, { source: "disney", ttlHours: 1 });

    const result = await cacheGet<typeof data>("test-key");

    expect(result).not.toBeNull();
    expect(result?.data).toEqual(data);
    expect(result?.source).toBe("disney");
    expect(result?.cachedAt).toBeDefined();
    expect(result?.expiresAt).toBeDefined();
  });

  it("returns null for a key that was never set", async () => {
    const result = await cacheGet("never-set-key");

    expect(result).toBeNull();
  });

  it("uses default source themeparks-wiki when none is specified", async () => {
    await cacheSet("default-src-key", { foo: "bar" });

    const result = await cacheGet<{ foo: string }>("default-src-key");

    expect(result?.source).toBe("themeparks-wiki");
  });
});

// ---------------------------------------------------------------------------
// TTL expiry
// ---------------------------------------------------------------------------

describe("TTL expiry", () => {
  it("returns null for an entry whose TTL has elapsed", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

    await cacheSet("ttl-key", { value: 42 }, { ttlHours: 1 });

    // Advance time past the 1-hour TTL
    vi.advanceTimersByTime(2 * 60 * 60 * 1000);

    const result = await cacheGet("ttl-key");

    expect(result).toBeNull();
  });

  it("returns the entry when TTL has not yet elapsed", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

    await cacheSet("ttl-live-key", { value: 99 }, { ttlHours: 2 });

    // Advance time by only 30 minutes
    vi.advanceTimersByTime(30 * 60 * 1000);

    const result = await cacheGet<{ value: number }>("ttl-live-key");

    expect(result?.data.value).toBe(99);
  });
});

// ---------------------------------------------------------------------------
// Corrupt JSON handling
// ---------------------------------------------------------------------------

describe("corrupt stored JSON", () => {
  it("returns null and auto-deletes the corrupt entry", async () => {
    await cacheSet("corrupt-key", { good: true });

    // Overwrite with invalid JSON directly in the DB
    const db = await getDatabase();
    db.run("UPDATE cache SET data = ? WHERE key = ?", ["{not json{{", "corrupt-key"]);

    const result = await cacheGet("corrupt-key");

    expect(result).toBeNull();

    // Entry should have been auto-deleted
    const afterDelete = await cacheGet("corrupt-key");
    expect(afterDelete).toBeNull();
    // Verify it's truly gone (not just expired)
    const check = db.exec("SELECT COUNT(*) FROM cache WHERE key = ?", ["corrupt-key"]);
    expect(check[0]?.values[0]?.[0]).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// cacheDelete
// ---------------------------------------------------------------------------

describe("cacheDelete", () => {
  it("returns true and removes an existing key", async () => {
    await cacheSet("del-key", { x: 1 });

    const result = await cacheDelete("del-key");

    expect(result).toBe(true);
    expect(await cacheGet("del-key")).toBeNull();
  });

  it("returns false for a key that does not exist", async () => {
    const result = await cacheDelete("missing-key");

    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// cachePurgeExpired
// ---------------------------------------------------------------------------

describe("cachePurgeExpired", () => {
  it("returns the count of expired entries purged", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

    await cacheSet("purge-exp1", { a: 1 }, { ttlHours: 1 });
    await cacheSet("purge-exp2", { b: 2 }, { ttlHours: 1 });
    await cacheSet("purge-live", { c: 3 }, { ttlHours: 48 });

    vi.advanceTimersByTime(2 * 60 * 60 * 1000); // 2 hours

    const purged = await cachePurgeExpired();

    expect(purged).toBe(2);
  });

  it("returns 0 when no entries are expired", async () => {
    await cacheSet("not-expired", { d: 4 }, { ttlHours: 24 });

    const purged = await cachePurgeExpired();

    expect(purged).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// cacheClear
// ---------------------------------------------------------------------------

describe("cacheClear", () => {
  it("removes all entries and returns the total count", async () => {
    await cacheSet("clear-k1", { e: 5 });
    await cacheSet("clear-k2", { f: 6 });

    const cleared = await cacheClear();

    expect(cleared).toBe(2);
    expect(await cacheGet("clear-k1")).toBeNull();
    expect(await cacheGet("clear-k2")).toBeNull();
  });

  it("returns 0 when the cache is already empty", async () => {
    const cleared = await cacheClear();

    expect(cleared).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// getCacheStats
// ---------------------------------------------------------------------------

describe("getCacheStats", () => {
  it("returns correct total, expired, and source breakdown", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

    await cacheSet("stats-k1", { g: 7 }, { source: "disney", ttlHours: 1 });
    await cacheSet("stats-k2", { h: 8 }, { source: "themeparks-wiki", ttlHours: 1 });
    await cacheSet("stats-k3", { i: 9 }, { source: "disney", ttlHours: 48 });

    // Advance past first two entries' TTL
    vi.advanceTimersByTime(2 * 60 * 60 * 1000);

    const stats = await getCacheStats();

    expect(stats.totalEntries).toBe(3);
    expect(stats.expiredEntries).toBe(2);
    expect(stats.sources["disney"]).toBe(2);
    expect(stats.sources["themeparks-wiki"]).toBe(1);
  });

  it("returns zero stats on an empty cache", async () => {
    const stats = await getCacheStats();

    expect(stats.totalEntries).toBe(0);
    expect(stats.expiredEntries).toBe(0);
    expect(Object.keys(stats.sources)).toHaveLength(0);
  });
});
