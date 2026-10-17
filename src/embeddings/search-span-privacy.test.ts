/**
 * Search spans must record the query length, never the query text.
 *
 * Covers both search entry points: semantic search and fuzzy name search.
 */

import type { Span } from "@opentelemetry/api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setupTempDb, teardownTempDb } from "../db/__test-helpers__/temp-db.js";

/** Attributes set on every span the code under test opens, keyed by span name. */
const recorded = vi.hoisted(() => new Map<string, Map<string, unknown>>());

vi.mock("../shared/index.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../shared/index.js")>()),
  withSpan: async <T>(name: string, _op: string, fn: (span: Span) => Promise<T>): Promise<T> => {
    const attributes = new Map<string, unknown>();
    recorded.set(name, attributes);
    const span = {
      setAttribute: (key: string, value: unknown) => {
        attributes.set(key, value);
        return span;
      },
    } as unknown as Span;
    return fn(span);
  },
}));

vi.mock("./index.js", () => ({
  getEmbeddingProvider: () =>
    Promise.resolve({
      fullModelName: "test-model",
      embed: () => Promise.resolve({ embedding: [0.1, 0.2, 0.3] }),
    }),
}));

vi.mock("../vectordb/index.js", () => ({
  vectorSearch: () => Promise.resolve([]),
  saveEmbedding: vi.fn(),
  saveEmbeddingsBatch: vi.fn(),
  isEmbeddingStale: vi.fn(),
}));

const { semanticSearch } = await import("./search.js");
const { searchEntitiesByName } = await import("../db/entities.js");

const QUERY = "space mountain for my daughter emma";

/** Assert the span holds the query length and no attribute carries the text. */
function expectLengthOnly(spanName: string): void {
  const attributes = recorded.get(spanName);
  expect(attributes, `span ${spanName} was not opened`).toBeDefined();
  expect(attributes?.get("search.query_length")).toBe(QUERY.length);
  for (const [key, value] of attributes ?? []) {
    expect(String(value), `attribute ${key}`).not.toContain("emma");
  }
}

beforeEach(() => {
  recorded.clear();
  setupTempDb();
});

afterEach(() => {
  teardownTempDb();
});

describe("search span attributes", () => {
  it("semantic search records the query length, not the text", async () => {
    await semanticSearch(QUERY);

    expectLengthOnly("embedding.semantic-search");
  });

  it("name search records the query length, not the text", async () => {
    await searchEntitiesByName(QUERY);

    expectLengthOnly("entity.search");
  });
});
