/**
 * search Tool Handler Tests
 *
 * Test Plan:
 *
 * handler (Classification: API handler — I/O boundary)
 *   [x] Validation: neither id nor name → isError=true (ValidationError)
 *   [x] ID lookup: entity found in local DB → found:true response
 *   [x] ID lookup: miss in DB, client fallback also misses → found:false
 *   [x] ID lookup: client throws → formatErrorResponse (isError)
 *   [x] Name search: fuzzy match returns bestMatch + alternatives
 *   [x] Name search: no match after all fallbacks → found:false
 *
 * Response shape invariants:
 *   - content[0].type === 'text'
 *   - content[0].text is valid JSON
 *   - isError is only set on error paths
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the Disney client before any imports that may load it
vi.mock("../clients/index.js", () => {
  const clientMethods = {
    getEntityById: vi.fn(),
    getAttractions: vi.fn(),
    getDining: vi.fn(),
    getShows: vi.fn(),
    getShops: vi.fn(),
    getEvents: vi.fn(),
    getDestinations: vi.fn(),
  };
  return {
    getDisneyFinderClient: vi.fn().mockReturnValue(clientMethods),
    resetDisneyFinderClient: vi.fn(),
    getSessionManager: vi.fn(),
  };
});

import { handler } from "./search.js";
import { getDisneyFinderClient } from "../clients/index.js";
import { setupTempDb, teardownTempDb } from "../db/__test-helpers__/temp-db.js";
import { saveEntity } from "../db/entities.js";
import { removeAllEventListeners } from "../events/entity-events.js";
import { getEntityEmitter } from "../events/entity-events.js";
import type { DisneyAttraction } from "../types/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAttraction(id: string, name: string): DisneyAttraction {
  return {
    id,
    name,
    slug: name.toLowerCase().replace(/ /g, "-"),
    entityType: "ATTRACTION",
    destinationId: "wdw",
    parkId: "80007944",
    parkName: "Magic Kingdom Park",
    location: null,
    url: null,
    heightRequirement: null,
    thrillLevel: null,
    experienceType: null,
    duration: null,
    lightningLane: null,
    singleRider: false,
    riderSwap: false,
    photopass: false,
    virtualQueue: false,
    wheelchairAccessible: true,
    tags: [],
  };
}

function parseResult(result: { content: Array<{ type: string; text: string }> }): unknown {
  return JSON.parse(result.content[0]!.text);
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  setupTempDb();
  removeAllEventListeners();
  getEntityEmitter().on("error", () => {});

  // Default: client returns null / empty lists
  const client = vi.mocked(getDisneyFinderClient)();
  vi.mocked(client.getEntityById).mockResolvedValue(null);
  vi.mocked(client.getAttractions).mockResolvedValue([]);
  vi.mocked(client.getDining).mockResolvedValue([]);
  vi.mocked(client.getShows).mockResolvedValue([]);
});

afterEach(() => {
  teardownTempDb();
});

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

describe("validation", () => {
  it("returns isError when neither id nor name is provided", async () => {
    const result = await handler({});

    expect(result.isError).toBe(true);
    expect(result.content[0]?.type).toBe("text");
    const parsed = JSON.parse(result.content[0]!.text) as Record<string, unknown>;
    expect(typeof parsed["error"]).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// ID lookup paths
// ---------------------------------------------------------------------------

describe("id lookup", () => {
  it("returns found:true when the entity is in the local DB", async () => {
    const entity = makeAttraction("sm-001", "Space Mountain");
    await saveEntity(entity);

    const result = await handler({ id: "sm-001" });

    expect(result.isError).toBeUndefined();
    const parsed = parseResult(result) as { found: boolean; entity: { id: string } };
    expect(parsed.found).toBe(true);
    expect(parsed.entity.id).toBe("sm-001");
  });

  it("falls back to client when entity is not in DB, returns found:false on client miss", async () => {
    const client = vi.mocked(getDisneyFinderClient)();
    vi.mocked(client.getEntityById).mockResolvedValue(null);

    const result = await handler({ id: "not-in-db" });

    expect(result.isError).toBeUndefined();
    const parsed = parseResult(result) as { found: boolean; id: string };
    expect(parsed.found).toBe(false);
    expect(parsed.id).toBe("not-in-db");
  });

  it("returns isError when the client throws during id fallback", async () => {
    const client = vi.mocked(getDisneyFinderClient)();
    vi.mocked(client.getEntityById).mockRejectedValue(new Error("API down"));

    const result = await handler({ id: "throw-id" });

    expect(result.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Name search paths
// ---------------------------------------------------------------------------

describe("name search", () => {
  it("returns found:true with bestMatch when a fuzzy match exists in DB", async () => {
    await saveEntity(makeAttraction("hm-001", "Haunted Mansion"));
    await saveEntity(makeAttraction("btr-001", "Big Thunder Mountain Railroad"));

    const result = await handler({ name: "Haunted Mansion" });

    expect(result.isError).toBeUndefined();
    const parsed = parseResult(result) as {
      found: boolean;
      bestMatch: { id: string };
      alternatives: unknown[];
    };
    expect(parsed.found).toBe(true);
    expect(parsed.bestMatch.id).toBe("hm-001");
  });

  it("returns found:false when no entities match the name query", async () => {
    const result = await handler({ name: "XYZ Ride That Does Not Exist" });

    expect(result.isError).toBeUndefined();
    const parsed = parseResult(result) as { found: boolean };
    expect(parsed.found).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Response shape invariants
// ---------------------------------------------------------------------------

describe("response shape", () => {
  it("always returns content[0].type === text", async () => {
    const result = await handler({});

    expect(result.content[0]?.type).toBe("text");
  });

  it("content[0].text is always valid JSON", async () => {
    const result = await handler({});

    expect(() => JSON.parse(result.content[0]!.text)).not.toThrow();
  });
});
