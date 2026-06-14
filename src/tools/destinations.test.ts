/**
 * list_parks Tool Handler Tests
 *
 * Test Plan:
 *
 * handler (Classification: API handler + cache read-through)
 *   [x] Happy (cold cache): fetches from client and returns formatted destinations
 *   [x] Happy (warm cache): returns cached destinations without calling client again
 *   [x] Response shape: destinations array with id, name, location, timezone, parks
 *   [x] Response shape: _meta.cachedAt is present
 *
 * Response shape invariants:
 *   - content[0].type === 'text'
 *   - content[0].text is valid JSON
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../clients/index.js", () => {
  const clientMethods = {
    getAttractions: vi.fn(),
    getDining: vi.fn(),
    getShows: vi.fn(),
    getShops: vi.fn(),
    getEvents: vi.fn(),
    getEntityById: vi.fn(),
    getDestinations: vi.fn(),
  };
  return {
    getDisneyFinderClient: vi.fn().mockReturnValue(clientMethods),
    resetDisneyFinderClient: vi.fn(),
    getSessionManager: vi.fn(),
  };
});

import { handler } from "./destinations.js";
import { getDisneyFinderClient } from "../clients/index.js";
import { setupTempDb, teardownTempDb } from "../db/__test-helpers__/temp-db.js";
import type { DisneyDestination } from "../types/index.js";

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

const stubDestinations: DisneyDestination[] = [
  {
    id: "wdw",
    name: "Walt Disney World Resort",
    location: "Orlando, FL",
    timezone: "America/New_York",
    parks: [{ id: "80007944", name: "Magic Kingdom Park", slug: "magic-kingdom" }],
    otherVenues: [],
  },
];

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  setupTempDb();
  const client = vi.mocked(getDisneyFinderClient)();
  vi.mocked(client.getDestinations).mockResolvedValue(stubDestinations);
});

afterEach(() => {
  teardownTempDb();
});

// ---------------------------------------------------------------------------
// Happy paths
// ---------------------------------------------------------------------------

describe("cold cache", () => {
  it("fetches from the client and returns formatted destinations", async () => {
    const result = await handler({});

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]!.text) as {
      destinations: Array<{ id: string; name: string; parks: Array<{ id: string }> }>;
    };
    expect(parsed.destinations).toHaveLength(1);
    expect(parsed.destinations[0]?.id).toBe("wdw");
    expect(parsed.destinations[0]?.parks[0]?.id).toBe("80007944");
  });
});

describe("warm cache", () => {
  it("does not call the client a second time when destinations are cached", async () => {
    const client = vi.mocked(getDisneyFinderClient)();

    // First call populates cache
    await handler({});
    // Second call should serve from cache
    await handler({});

    expect(vi.mocked(client.getDestinations)).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Response shape
// ---------------------------------------------------------------------------

describe("response shape", () => {
  it("includes _meta.cachedAt in the JSON response", async () => {
    const result = await handler({});

    const parsed = JSON.parse(result.content[0]!.text) as {
      _meta: { cachedAt: string };
    };
    expect(typeof parsed._meta.cachedAt).toBe("string");
  });

  it("content[0].type is always text", async () => {
    const result = await handler({});

    expect(result.content[0]?.type).toBe("text");
  });

  it("content[0].text is always valid JSON", async () => {
    const result = await handler({});

    expect(() => JSON.parse(result.content[0]!.text)).not.toThrow();
  });
});
