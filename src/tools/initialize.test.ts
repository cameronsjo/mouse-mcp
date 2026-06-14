/**
 * initialize Tool Handler Tests
 *
 * Test Plan:
 *
 * handler (Classification: API handler — orchestration)
 *   [x] skipEmbeddings=true: calls client fetch methods, returns success stats
 *   [x] skipEmbeddings=true: does not call embedding provider or ensureEmbeddingsBatch
 *   [x] skipEmbeddings=false: calls embedding provider when entity count exceeds embedding count
 *   [x] Unhappy: client throws → isError=true (formatErrorResponse)
 *   [x] Response shape: success, message, stats sections present
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

vi.mock("../vectordb/index.js", () => ({
  getEmbeddingStats: vi.fn().mockResolvedValue({ total: 0, byModel: {} }),
  connectLanceDB: vi.fn(),
  closeLanceDB: vi.fn(),
  saveEmbedding: vi.fn(),
  saveEmbeddingsBatch: vi.fn(),
  getEmbedding: vi.fn(),
  isEmbeddingStale: vi.fn(),
  vectorSearch: vi.fn(),
  deleteEmbedding: vi.fn(),
  deleteEmbeddingsByDestination: vi.fn(),
  escapeSqlValue: vi.fn(),
  escapeSqlIdentifier: vi.fn(),
  buildWhereClause: vi.fn(),
  buildEqualityClause: vi.fn(),
}));

vi.mock("../embeddings/index.js", () => ({
  getEmbeddingProvider: vi.fn().mockResolvedValue({
    fullModelName: "test-model",
  }),
}));

vi.mock("../embeddings/search.js", () => ({
  semanticSearch: vi.fn(),
  ensureEmbeddingsBatch: vi.fn().mockResolvedValue(undefined),
}));

import { handler } from "./initialize.js";
import { getDisneyFinderClient } from "../clients/index.js";
import { getEmbeddingStats } from "../vectordb/index.js";
import { getEmbeddingProvider } from "../embeddings/index.js";
import { ensureEmbeddingsBatch } from "../embeddings/search.js";
import { setupTempDb, teardownTempDb } from "../db/__test-helpers__/temp-db.js";
import { saveEntity } from "../db/entities.js";
import { removeAllEventListeners } from "../events/entity-events.js";
import { getEntityEmitter } from "../events/entity-events.js";
import type { DisneyAttraction } from "../types/index.js";

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  setupTempDb();
  removeAllEventListeners();
  getEntityEmitter().on("error", () => {});

  const client = vi.mocked(getDisneyFinderClient)();
  vi.mocked(client.getAttractions).mockResolvedValue([]);
  vi.mocked(client.getDining).mockResolvedValue([]);
  vi.mocked(client.getShows).mockResolvedValue([]);
  vi.mocked(client.getShops).mockResolvedValue([]);
  vi.mocked(client.getEvents).mockResolvedValue([]);

  vi.mocked(getEmbeddingStats).mockResolvedValue({ total: 0, byModel: {} });
});

afterEach(() => {
  teardownTempDb();
});

// ---------------------------------------------------------------------------
// skipEmbeddings=true branch
// ---------------------------------------------------------------------------

describe("skipEmbeddings=true", () => {
  it("returns success:true with stats when all client calls succeed", async () => {
    const result = await handler({ skipEmbeddings: true });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]!.text) as {
      success: boolean;
      message: string;
      stats: Record<string, unknown>;
    };
    expect(parsed.success).toBe(true);
    expect(typeof parsed.message).toBe("string");
    expect(parsed.stats).toBeDefined();
  });

  it("does not call embedding provider when skipEmbeddings is true", async () => {
    await handler({ skipEmbeddings: true });

    expect(vi.mocked(getEmbeddingProvider)).not.toHaveBeenCalled();
    expect(vi.mocked(ensureEmbeddingsBatch)).not.toHaveBeenCalled();
  });

  it("reports entity counts from client responses in stats", async () => {
    const client = vi.mocked(getDisneyFinderClient)();
    vi.mocked(client.getAttractions).mockResolvedValue([
      { id: "a1", name: "Ride A" } as never,
      { id: "a2", name: "Ride B" } as never,
    ]);
    vi.mocked(client.getDining).mockResolvedValue([{ id: "d1", name: "Eatery" } as never]);

    const result = await handler({ skipEmbeddings: true });

    const parsed = JSON.parse(result.content[0]!.text) as {
      stats: { attractions: number; dining: number };
    };
    expect(parsed.stats.attractions).toBe(2);
    expect(parsed.stats.dining).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// skipEmbeddings=false (default) — embeddings path
// ---------------------------------------------------------------------------

describe("embeddings path", () => {
  it("calls getEmbeddingProvider when skipEmbeddings is not set", async () => {
    // Embedding count equals entity count so ensureEmbeddingsBatch is skipped,
    // but the provider is still initialised.
    vi.mocked(getEmbeddingStats).mockResolvedValue({ total: 999, byModel: {} });

    await handler({});

    expect(vi.mocked(getEmbeddingProvider)).toHaveBeenCalled();
  });

  it("calls ensureEmbeddingsBatch when embedding count is below entity count", async () => {
    // The handler checks: if currentEmbeddingStats.total < totalEntities, load from DB
    // and call ensureEmbeddingsBatch — but only if allEntities.length > 0.
    // So we must (a) make the client report 1 entity so totalEntities=1,
    // and (b) pre-seed the DB so getEntities() returns that same entity.
    const stubAttraction: DisneyAttraction = {
      id: "init-a1",
      name: "Test Ride",
      slug: "test-ride",
      entityType: "ATTRACTION",
      destinationId: "wdw",
      parkId: null,
      parkName: null,
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
    await saveEntity(stubAttraction);

    const client = vi.mocked(getDisneyFinderClient)();
    vi.mocked(client.getAttractions).mockResolvedValue([stubAttraction]);
    vi.mocked(getEmbeddingStats).mockResolvedValue({ total: 0, byModel: {} });

    await handler({});

    expect(vi.mocked(ensureEmbeddingsBatch)).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Error path
// ---------------------------------------------------------------------------

describe("error path", () => {
  it("returns isError when the client throws", async () => {
    const client = vi.mocked(getDisneyFinderClient)();
    vi.mocked(client.getAttractions).mockRejectedValue(new Error("Disney API down"));

    const result = await handler({ skipEmbeddings: true });

    expect(result.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Response shape invariants
// ---------------------------------------------------------------------------

describe("response shape", () => {
  it("content[0].type is text", async () => {
    const result = await handler({ skipEmbeddings: true });

    expect(result.content[0]?.type).toBe("text");
  });

  it("content[0].text is valid JSON", async () => {
    const result = await handler({ skipEmbeddings: true });

    expect(() => JSON.parse(result.content[0]!.text)).not.toThrow();
  });
});
