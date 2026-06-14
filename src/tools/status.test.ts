/**
 * status Tool Handler Tests
 *
 * Test Plan:
 *
 * handler (Classification: API handler — aggregates multiple sources)
 *   [x] Happy: returns a valid status payload with all top-level sections
 *   [x] Happy (includeDetails=true): response includes destination entity breakdown
 *   [x] Response shape: server, sessions, cache, database, embeddings, health sections
 *   [x] Response shape: content[0].type === 'text', valid JSON
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../clients/index.js", () => {
  const mockSessionStatus = {
    hasSession: false,
    isValid: false,
    expiresAt: null,
    errorCount: 0,
  };
  const mockSessionManager = {
    getSessionStatus: vi.fn().mockResolvedValue(mockSessionStatus),
  };
  return {
    getSessionManager: vi.fn().mockReturnValue(mockSessionManager),
    getDisneyFinderClient: vi.fn().mockReturnValue({
      getDestinations: vi.fn().mockResolvedValue([]),
    }),
    resetDisneyFinderClient: vi.fn(),
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

import { handler } from "./status.js";
import { getSessionManager } from "../clients/index.js";
import { getEmbeddingStats } from "../vectordb/index.js";
import { setupTempDb, teardownTempDb } from "../db/__test-helpers__/temp-db.js";

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  setupTempDb();

  // Reset to default mock return values
  const sm = vi.mocked(getSessionManager)();
  vi.mocked(sm.getSessionStatus).mockResolvedValue({
    hasSession: false,
    isValid: false,
    expiresAt: null,
    errorCount: 0,
  });
  vi.mocked(getEmbeddingStats).mockResolvedValue({ total: 0, byModel: {} });
});

afterEach(() => {
  teardownTempDb();
});

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe("happy path", () => {
  it("returns a status payload with all required top-level sections", async () => {
    const result = await handler({});

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]!.text) as Record<string, unknown>;
    expect(parsed).toHaveProperty("server");
    expect(parsed).toHaveProperty("sessions");
    expect(parsed).toHaveProperty("cache");
    expect(parsed).toHaveProperty("database");
    expect(parsed).toHaveProperty("embeddings");
    expect(parsed).toHaveProperty("health");
  });

  it("server section includes version, uptime, and timestamp", async () => {
    const result = await handler({});

    const parsed = JSON.parse(result.content[0]!.text) as {
      server: { version: string; uptime: number; timestamp: string };
    };
    expect(parsed.server.version).toBe("1.0.0");
    expect(typeof parsed.server.uptime).toBe("number");
    expect(() => new Date(parsed.server.timestamp).toISOString()).not.toThrow();
  });

  it("sessions section includes wdw and dlr status", async () => {
    const result = await handler({});

    const parsed = JSON.parse(result.content[0]!.text) as {
      sessions: {
        wdw: { hasSession: boolean };
        dlr: { hasSession: boolean };
      };
    };
    expect(typeof parsed.sessions.wdw.hasSession).toBe("boolean");
    expect(typeof parsed.sessions.dlr.hasSession).toBe("boolean");
  });

  it("database section reflects the empty temp DB", async () => {
    const result = await handler({});

    const parsed = JSON.parse(result.content[0]!.text) as {
      database: { entityCount: number; cacheEntries: number };
    };
    expect(parsed.database.entityCount).toBe(0);
    expect(parsed.database.cacheEntries).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// includeDetails=true
// ---------------------------------------------------------------------------

describe("includeDetails", () => {
  it("response includes wdw and dlr breakdown when includeDetails is true", async () => {
    const result = await handler({ includeDetails: true });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]!.text) as {
      details: {
        wdw: { attractions: number };
        dlr: { attractions: number };
      };
    };
    expect(parsed).toHaveProperty("details");
    expect(typeof parsed.details.wdw.attractions).toBe("number");
    expect(typeof parsed.details.dlr.attractions).toBe("number");
  });

  it("response does not include details section by default", async () => {
    const result = await handler({});

    const parsed = JSON.parse(result.content[0]!.text) as Record<string, unknown>;
    expect(parsed).not.toHaveProperty("details");
  });
});

// ---------------------------------------------------------------------------
// Response shape invariants
// ---------------------------------------------------------------------------

describe("response shape", () => {
  it("content[0].type is text", async () => {
    const result = await handler({});

    expect(result.content[0]?.type).toBe("text");
  });

  it("content[0].text is valid JSON", async () => {
    const result = await handler({});

    expect(() => JSON.parse(result.content[0]!.text)).not.toThrow();
  });
});
