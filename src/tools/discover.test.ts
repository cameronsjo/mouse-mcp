/**
 * discover Tool Handler Tests
 *
 * Test Plan:
 *
 * handler (Classification: API handler)
 *   [x] Validation: missing query → isError=true (ValidationError)
 *   [x] Happy: semanticSearch returns results → found:true with result list
 *   [x] Happy: semanticSearch returns empty list → found:false with message
 *   [x] Unhappy: semanticSearch throws → isError=true (formatErrorResponse)
 *
 * Response shape invariants:
 *   - content[0].type === 'text'
 *   - content[0].text is valid JSON
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock heavy embeddings dependency before any imports
vi.mock("../embeddings/search.js", () => ({
  semanticSearch: vi.fn(),
  ensureEmbeddingsBatch: vi.fn(),
}));

import { handler } from "./discover.js";
import { semanticSearch } from "../embeddings/search.js";
import type { DisneyEntity } from "../types/index.js";

// ---------------------------------------------------------------------------
// Sample semantic search result
// ---------------------------------------------------------------------------

const stubEntity: DisneyEntity = {
  id: "sm-001",
  name: "Space Mountain",
  slug: "space-mountain",
  entityType: "ATTRACTION",
  destinationId: "wdw",
  parkId: "80007944",
  parkName: "Magic Kingdom Park",
  location: null,
  url: null,
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

describe("validation", () => {
  it("returns isError when query is not provided", async () => {
    const result = await handler({});

    expect(result.isError).toBe(true);
    expect(result.content[0]?.type).toBe("text");
    const parsed = JSON.parse(result.content[0]!.text) as Record<string, unknown>;
    expect(typeof parsed["error"]).toBe("string");
  });

  it("returns isError when query is an empty string", async () => {
    vi.mocked(semanticSearch).mockResolvedValue([]);

    const result = await handler({ query: "" });

    expect(result.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Happy paths
// ---------------------------------------------------------------------------

describe("happy paths", () => {
  it("returns found:true with results when semanticSearch returns matches", async () => {
    vi.mocked(semanticSearch).mockResolvedValue([
      { entity: stubEntity, score: 0.95, distance: 0.05 },
    ]);

    const result = await handler({ query: "thrill rides" });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]!.text) as {
      found: boolean;
      count: number;
      results: Array<{ name: string; id: string }>;
    };
    expect(parsed.found).toBe(true);
    expect(parsed.count).toBe(1);
    expect(parsed.results[0]?.name).toBe("Space Mountain");
  });

  it("returns found:false with message when no results come back", async () => {
    vi.mocked(semanticSearch).mockResolvedValue([]);

    const result = await handler({ query: "nothing matches this" });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]!.text) as {
      found: boolean;
      message: string;
    };
    expect(parsed.found).toBe(false);
    expect(typeof parsed.message).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// Error path
// ---------------------------------------------------------------------------

describe("error path", () => {
  it("returns isError when semanticSearch throws", async () => {
    vi.mocked(semanticSearch).mockRejectedValue(new Error("vector DB offline"));

    const result = await handler({ query: "thrill rides" });

    expect(result.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Response shape invariants
// ---------------------------------------------------------------------------

describe("response shape", () => {
  it("always returns content[0].type === text", async () => {
    vi.mocked(semanticSearch).mockResolvedValue([]);
    const result = await handler({ query: "something" });

    expect(result.content[0]?.type).toBe("text");
  });

  it("content[0].text is always valid JSON", async () => {
    vi.mocked(semanticSearch).mockResolvedValue([]);
    const result = await handler({ query: "something" });

    expect(() => JSON.parse(result.content[0]!.text)).not.toThrow();
  });
});
