/**
 * JWKS Client Tests (Cluster C — Auth flow)
 *
 * Exercises the fetch + cache state machine with a fake `global.fetch` and
 * fake timers for TTL. Covers cache hit/miss/expiry, forced refresh on unknown
 * kid, error/malformed responses, TTL clamping, abort-on-timeout, and the
 * singleton registry.
 *
 * Test Plan
 *   JWKSClient.getKey (Classification: I/O boundary + cache state machine)
 *     [x] cache miss -> fetch once, index by kid, return key
 *     [x] cache hit within TTL -> no second fetch
 *     [x] expired -> refetch
 *     [x] unknown kid -> forces one refresh, returns null
 *   JWKSClient.refresh (Classification: I/O boundary + input parser)
 *     [x] non-ok response -> throws
 *     [x] missing keys array / keys not an array -> throws "Invalid JWKS response"
 *     [x] keys without kid skipped
 *     [x] aborts after FETCH_TIMEOUT_MS
 *   TTL: cacheTtlMs clamped to MAX_CACHE_TTL_MS
 *   clearCache / isCacheValid / getAllKeys
 *   getJWKSClient singleton per URI; clearAllJWKSCaches empties the registry
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { JWKSClient, getJWKSClient, clearAllJWKSCaches } from "./jwks.js";
import type { JSONWebKey } from "./types.js";

vi.mock("../shared/logger.js", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

const URI = "https://auth.example.com/.well-known/jwks.json";
const DEFAULT_TTL_MS = 10 * 60 * 1000;
const MAX_TTL_MS = 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10_000;

const KEY_A: JSONWebKey = { kty: "RSA", kid: "key-a", n: "aaa", e: "AQAB", use: "sig" };
const KEY_B: JSONWebKey = { kty: "RSA", kid: "key-b", n: "bbb", e: "AQAB", use: "sig" };

/** Build a fake fetch Response wrapping a JWKS payload. */
function jwksResponse(
  body: unknown,
  init: { ok?: boolean; status?: number; statusText?: string } = {}
) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    statusText: init.statusText ?? "OK",
    json: () => Promise.resolve(body),
  };
}

function mockFetchOnce(
  body: unknown,
  init?: { ok?: boolean; status?: number; statusText?: string }
) {
  (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(jwksResponse(body, init));
}

describe("JWKSClient", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("getKey caching", () => {
    it("fetches and returns the key on a cache miss", async () => {
      mockFetchOnce({ keys: [KEY_A] });
      const client = new JWKSClient(URI);

      const key = await client.getKey("key-a");

      expect(key).toEqual(KEY_A);
    });

    it("fetches exactly once when the same key is requested within the TTL", async () => {
      mockFetchOnce({ keys: [KEY_A] });
      const client = new JWKSClient(URI);

      await client.getKey("key-a");
      await client.getKey("key-a");

      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it("refetches after the cache TTL has expired", async () => {
      mockFetchOnce({ keys: [KEY_A] });
      mockFetchOnce({ keys: [KEY_A] });
      const client = new JWKSClient(URI);

      await client.getKey("key-a");
      vi.setSystemTime(Date.now() + DEFAULT_TTL_MS + 1000);
      await client.getKey("key-a");

      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it("forces a single refresh and returns null for a kid that is not in the JWKS", async () => {
      mockFetchOnce({ keys: [KEY_A] });
      mockFetchOnce({ keys: [KEY_A] });
      const client = new JWKSClient(URI);

      await client.getKey("key-a");
      const result = await client.getKey("unknown-kid");

      expect(result).toBeNull();
    });

    it("performs a forced refresh fetch when the requested kid is unknown", async () => {
      mockFetchOnce({ keys: [KEY_A] });
      mockFetchOnce({ keys: [KEY_A] });
      const client = new JWKSClient(URI);

      await client.getKey("key-a");
      await client.getKey("unknown-kid");

      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe("refresh validation", () => {
    it("throws when the JWKS endpoint returns a non-ok status", async () => {
      mockFetchOnce({}, { ok: false, status: 500, statusText: "Server Error" });
      const client = new JWKSClient(URI);

      await expect(client.refresh()).rejects.toThrow("JWKS fetch failed: 500");
    });

    it("throws when the response body has no keys array", async () => {
      mockFetchOnce({ notKeys: [] });
      const client = new JWKSClient(URI);

      await expect(client.refresh()).rejects.toThrow("Invalid JWKS response");
    });

    it("throws when keys is present but not an array", async () => {
      mockFetchOnce({ keys: "nope" });
      const client = new JWKSClient(URI);

      await expect(client.refresh()).rejects.toThrow("Invalid JWKS response");
    });

    it("skips keys that have no kid when indexing", async () => {
      mockFetchOnce({ keys: [{ kty: "RSA", n: "x", e: "AQAB" }, KEY_B] });
      const client = new JWKSClient(URI);

      const keys = await client.getAllKeys();

      expect(keys).toEqual([KEY_B]);
    });

    it("aborts the fetch after the timeout elapses", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(
        (_url: string, opts: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            opts.signal.addEventListener("abort", () => {
              reject(new Error("aborted"));
            });
          })
      );
      const client = new JWKSClient(URI);

      // Attach the rejection assertion before advancing timers so the abort
      // rejection is never momentarily unhandled.
      const pending = client.refresh();
      const assertion = expect(pending).rejects.toThrow("aborted");
      await vi.advanceTimersByTimeAsync(FETCH_TIMEOUT_MS);

      await assertion;
    });
  });

  describe("TTL clamping", () => {
    it("clamps a cacheTtlMs above the maximum down to MAX_CACHE_TTL_MS", async () => {
      mockFetchOnce({ keys: [KEY_A] });
      const client = new JWKSClient(URI, { cacheTtlMs: 24 * 60 * 60 * 1000 });

      await client.getKey("key-a");
      vi.setSystemTime(Date.now() + MAX_TTL_MS + 1000);

      // Cache would still be valid at 24h, but is expired past the 1h clamp.
      expect(client.isCacheValid()).toBe(false);
    });

    it("honors a cacheTtlMs below the maximum", async () => {
      mockFetchOnce({ keys: [KEY_A] });
      const client = new JWKSClient(URI, { cacheTtlMs: 5 * 60 * 1000 });

      await client.getKey("key-a");
      vi.setSystemTime(Date.now() + 4 * 60 * 1000);

      expect(client.isCacheValid()).toBe(true);
    });
  });

  describe("cache state", () => {
    it("reports an invalid cache before any fetch", () => {
      const client = new JWKSClient(URI);

      expect(client.isCacheValid()).toBe(false);
    });

    it("reports a valid cache immediately after a successful fetch", async () => {
      mockFetchOnce({ keys: [KEY_A] });
      const client = new JWKSClient(URI);

      await client.getKey("key-a");

      expect(client.isCacheValid()).toBe(true);
    });

    it("invalidates the cache after clearCache", async () => {
      mockFetchOnce({ keys: [KEY_A] });
      const client = new JWKSClient(URI);
      await client.getKey("key-a");

      client.clearCache();

      expect(client.isCacheValid()).toBe(false);
    });
  });

  describe("singleton registry", () => {
    afterEach(() => {
      clearAllJWKSCaches();
    });

    it("returns the same instance for the same URI", () => {
      const a = getJWKSClient(URI);
      const b = getJWKSClient(URI);

      expect(a).toBe(b);
    });

    it("returns distinct instances for different URIs", () => {
      const a = getJWKSClient(URI);
      const b = getJWKSClient("https://other.example.com/jwks.json");

      expect(a).not.toBe(b);
    });

    it("drops registered instances so a fresh one is created after clearAllJWKSCaches", () => {
      const before = getJWKSClient(URI);

      clearAllJWKSCaches();
      const after = getJWKSClient(URI);

      expect(after).not.toBe(before);
    });
  });
});
