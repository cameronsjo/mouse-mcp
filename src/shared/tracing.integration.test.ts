/**
 * Integration tests for span propagation
 *
 * These tests verify that spans are properly created and nested
 * when using the tracing utilities in realistic scenarios.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Track all spans created during tests
interface MockSpanRecord {
  name: string;
  op: string;
  attributes?: Record<string, unknown>;
  status?: { code: number; message?: string };
  exceptions: Error[];
  ended: boolean;
  children: MockSpanRecord[];
  parent?: MockSpanRecord;
}

let spanStack: MockSpanRecord[] = [];
let allSpans: MockSpanRecord[] = [];

function createMockSpan(
  name: string,
  op: string,
  attributes?: Record<string, unknown>
): MockSpanRecord {
  const currentParent = spanStack[spanStack.length - 1];
  const span: MockSpanRecord = {
    name,
    op,
    attributes: { ...attributes },
    exceptions: [],
    ended: false,
    children: [],
    parent: currentParent,
  };

  if (currentParent) {
    currentParent.children.push(span);
  }

  allSpans.push(span);
  return span;
}

interface MockSpanOptions {
  name: string;
  op: string;
  attributes?: Record<string, unknown>;
}

interface MockSpanStatus {
  code: number;
  message?: string;
}

// Mock Sentry with span tracking
vi.mock("@sentry/node", () => ({
  startSpan: vi.fn(
    async <T>(options: MockSpanOptions, fn: (span: unknown) => Promise<T>): Promise<T> => {
      const span = createMockSpan(options.name, options.op, options.attributes);
      spanStack.push(span);

      const mockSpanApi = {
        setStatus: vi.fn((status: MockSpanStatus) => {
          span.status = status;
        }),
        recordException: vi.fn((error: Error) => {
          span.exceptions.push(error);
        }),
        setAttribute: vi.fn((key: string, value: unknown) => {
          if (span.attributes) {
            span.attributes[key] = value;
          }
        }),
        setAttributes: vi.fn((attrs: Record<string, unknown>) => {
          Object.assign(span.attributes ?? {}, attrs);
        }),
      };

      try {
        const result = await fn(mockSpanApi);
        span.ended = true;
        return result;
      } finally {
        spanStack.pop();
      }
    }
  ),
  startSpanManual: vi.fn(<T>(options: MockSpanOptions, fn: (span: unknown) => T): T => {
    const span = createMockSpan(options.name, options.op, options.attributes);
    spanStack.push(span);

    const mockSpanApi = {
      setStatus: vi.fn((status: MockSpanStatus) => {
        span.status = status;
      }),
      recordException: vi.fn((error: Error) => {
        span.exceptions.push(error);
      }),
      setAttribute: vi.fn((key: string, value: unknown) => {
        if (span.attributes) {
          span.attributes[key] = value;
        }
      }),
      setAttributes: vi.fn((attrs: Record<string, unknown>) => {
        Object.assign(span.attributes ?? {}, attrs);
      }),
      end: vi.fn(() => {
        span.ended = true;
        spanStack.pop();
      }),
    };

    return fn(mockSpanApi);
  }),
  captureException: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

// Mock OpenTelemetry
vi.mock("@opentelemetry/api", async () => {
  const actual = await vi.importActual("@opentelemetry/api");
  return {
    ...actual,
    trace: {
      getActiveSpan: vi.fn(() => null),
      getTracer: vi.fn(() => ({
        startSpan: vi.fn(() => ({
          setAttribute: vi.fn(),
          setAttributes: vi.fn(),
          end: vi.fn(),
        })),
      })),
    },
    context: {
      active: vi.fn(() => ({})),
    },
  };
});

import { withSpan, withSpanSync, SPAN_OPERATIONS, SPAN_ATTRIBUTES } from "./tracing.js";

describe("Span Propagation Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    spanStack = [];
    allSpans = [];
  });

  describe("nested async spans", () => {
    it("should create parent-child relationship for nested withSpan calls", async () => {
      await withSpan("parent-span", "parent.op", async (parentSpan) => {
        parentSpan?.setAttribute("parent-attr", "parent-value");

        await withSpan("child-span", "child.op", async (childSpan) => {
          childSpan?.setAttribute("child-attr", "child-value");
          return "child-result";
        });

        return "parent-result";
      });

      expect(allSpans).toHaveLength(2);

      const parentSpan = allSpans.find((s) => s.name === "parent-span");
      const childSpan = allSpans.find((s) => s.name === "child-span");

      expect(parentSpan).toBeDefined();
      expect(childSpan).toBeDefined();
      expect(childSpan!.parent).toBe(parentSpan);
      expect(parentSpan!.children).toContain(childSpan);
    });

    it("should handle deeply nested spans", async () => {
      await withSpan("level-1", "op.1", async () => {
        await withSpan("level-2", "op.2", async () => {
          await withSpan("level-3", "op.3", async () => {
            return "deep";
          });
          return "mid";
        });
        return "top";
      });

      expect(allSpans).toHaveLength(3);

      const level1 = allSpans.find((s) => s.name === "level-1");
      const level2 = allSpans.find((s) => s.name === "level-2");
      const level3 = allSpans.find((s) => s.name === "level-3");

      expect(level2!.parent).toBe(level1);
      expect(level3!.parent).toBe(level2);
    });

    it("should handle sibling spans under same parent", async () => {
      await withSpan("parent", "parent.op", async () => {
        await withSpan("sibling-1", "sibling.op", async () => "first");
        await withSpan("sibling-2", "sibling.op", async () => "second");
        return "parent-done";
      });

      expect(allSpans).toHaveLength(3);

      const parent = allSpans.find((s) => s.name === "parent");
      const sibling1 = allSpans.find((s) => s.name === "sibling-1");
      const sibling2 = allSpans.find((s) => s.name === "sibling-2");

      expect(sibling1!.parent).toBe(parent);
      expect(sibling2!.parent).toBe(parent);
      expect(parent!.children).toHaveLength(2);
    });
  });

  describe("error propagation", () => {
    it("should mark span as error when exception thrown", async () => {
      const testError = new Error("test failure");

      await expect(
        withSpan("failing-span", "fail.op", async () => {
          throw testError;
        })
      ).rejects.toThrow("test failure");

      const span = allSpans.find((s) => s.name === "failing-span");
      expect(span!.status?.code).toBe(2); // SpanStatusCode.ERROR
      expect(span!.exceptions).toContain(testError);
    });

    it("should propagate errors through nested spans", async () => {
      const testError = new Error("deep error");

      await expect(
        withSpan("outer", "outer.op", async () => {
          await withSpan("inner", "inner.op", async () => {
            throw testError;
          });
        })
      ).rejects.toThrow("deep error");

      const innerSpan = allSpans.find((s) => s.name === "inner");
      expect(innerSpan!.exceptions).toContain(testError);
    });
  });

  describe("attribute propagation", () => {
    it("should preserve attributes set during span execution", async () => {
      await withSpan("attributed-span", "attr.op", async (span) => {
        span?.setAttribute(SPAN_ATTRIBUTES.DB_SYSTEM, "sqlite");
        span?.setAttribute(SPAN_ATTRIBUTES.DB_OPERATION, "query");
        span?.setAttribute("custom.count", 42);
        return "result";
      });

      const span = allSpans.find((s) => s.name === "attributed-span");
      expect(span!.attributes![SPAN_ATTRIBUTES.DB_SYSTEM]).toBe("sqlite");
      expect(span!.attributes![SPAN_ATTRIBUTES.DB_OPERATION]).toBe("query");
      expect(span!.attributes!["custom.count"]).toBe(42);
    });

    it("should support initial attributes", async () => {
      await withSpan("initial-attrs-span", "init.op", async () => "result", {
        initial: "value",
        count: 10,
      });

      const span = allSpans.find((s) => s.name === "initial-attrs-span");
      expect(span!.attributes!.initial).toBe("value");
      expect(span!.attributes!.count).toBe(10);
    });
  });

  describe("realistic scenarios", () => {
    it("should handle MCP tool -> API -> DB pattern", async () => {
      // Simulate: mcp.tool -> disney.api -> db.query -> cache.set
      await withSpan("mcp.tool.disney_sync", SPAN_OPERATIONS.MCP_TOOL_CALL, async (toolSpan) => {
        toolSpan?.setAttribute(SPAN_ATTRIBUTES.MCP_TOOL, "disney_sync");

        await withSpan(
          "disney.attractions.list",
          SPAN_OPERATIONS.DISNEY_API_REQUEST,
          async (apiSpan) => {
            apiSpan?.setAttribute(SPAN_ATTRIBUTES.DISNEY_DESTINATION, "wdw");

            // Cache check
            await withSpan("cache.check", SPAN_OPERATIONS.CACHE_GET, async (cacheSpan) => {
              cacheSpan?.setAttribute(SPAN_ATTRIBUTES.CACHE_HIT, false);
              return null; // cache miss
            });

            // API call would happen here

            // Cache set
            await withSpan("cache.store", SPAN_OPERATIONS.CACHE_SET, async (cacheSpan) => {
              cacheSpan?.setAttribute(SPAN_ATTRIBUTES.CACHE_TTL, 4);
              return true;
            });

            return [{ id: "attraction-1" }];
          }
        );

        // DB insert
        await withSpan("db.save-entities", SPAN_OPERATIONS.DB_INSERT, async (dbSpan) => {
          dbSpan?.setAttribute(SPAN_ATTRIBUTES.DB_SYSTEM, "sqlite");
          dbSpan?.setAttribute("db.row_count", 1);
          return 1;
        });

        return { synced: 1 };
      });

      expect(allSpans).toHaveLength(5);

      // Verify hierarchy
      const toolSpan = allSpans.find((s) => s.name === "mcp.tool.disney_sync");
      const apiSpan = allSpans.find((s) => s.name === "disney.attractions.list");
      const cacheCheckSpan = allSpans.find((s) => s.name === "cache.check");
      const cacheStoreSpan = allSpans.find((s) => s.name === "cache.store");
      const dbSpan = allSpans.find((s) => s.name === "db.save-entities");

      expect(apiSpan!.parent).toBe(toolSpan);
      expect(cacheCheckSpan!.parent).toBe(apiSpan);
      expect(cacheStoreSpan!.parent).toBe(apiSpan);
      expect(dbSpan!.parent).toBe(toolSpan);

      // Verify attributes
      expect(toolSpan!.attributes![SPAN_ATTRIBUTES.MCP_TOOL]).toBe("disney_sync");
      expect(apiSpan!.attributes![SPAN_ATTRIBUTES.DISNEY_DESTINATION]).toBe("wdw");
      expect(cacheCheckSpan!.attributes![SPAN_ATTRIBUTES.CACHE_HIT]).toBe(false);
      expect(dbSpan!.attributes![SPAN_ATTRIBUTES.DB_SYSTEM]).toBe("sqlite");
    });

    it("should handle embedding search pattern", async () => {
      await withSpan(
        "embedding.semantic-search",
        SPAN_OPERATIONS.EMBEDDING_SEARCH,
        async (searchSpan) => {
          searchSpan?.setAttribute("search.query", "space mountain");

          // Generate query embedding
          await withSpan(
            "embedding.generate-query",
            SPAN_OPERATIONS.EMBEDDING_GENERATE,
            async (embedSpan) => {
              embedSpan?.setAttribute(SPAN_ATTRIBUTES.EMBEDDING_PROVIDER, "transformers");
              embedSpan?.setAttribute(SPAN_ATTRIBUTES.EMBEDDING_MODEL, "all-MiniLM-L6-v2");
              embedSpan?.setAttribute(SPAN_ATTRIBUTES.EMBEDDING_DIMENSIONS, 384);
              return new Array<number>(384).fill(0);
            }
          );

          // Vector search
          await withSpan("vectordb.search", SPAN_OPERATIONS.DB_QUERY, async (dbSpan) => {
            dbSpan?.setAttribute(SPAN_ATTRIBUTES.DB_SYSTEM, "lancedb");
            dbSpan?.setAttribute("search.limit", 10);
            dbSpan?.setAttribute("search.results_count", 5);
            return [{ id: "1", _distance: 0.1 }];
          });

          return [{ entity: { id: "1" }, score: 0.9 }];
        }
      );

      expect(allSpans).toHaveLength(3);

      const searchSpan = allSpans.find((s) => s.name === "embedding.semantic-search");
      const embedSpan = allSpans.find((s) => s.name === "embedding.generate-query");
      const dbSpan = allSpans.find((s) => s.name === "vectordb.search");

      expect(embedSpan!.parent).toBe(searchSpan);
      expect(dbSpan!.parent).toBe(searchSpan);
    });
  });

  describe("sync spans", () => {
    it("should create sync spans that end properly", () => {
      const result = withSpanSync("sync-span", "sync.op", (span) => {
        span?.setAttribute("sync.attr", "value");
        return "sync-result";
      });

      expect(result).toBe("sync-result");

      const span = allSpans.find((s) => s.name === "sync-span");
      expect(span).toBeDefined();
      expect(span!.ended).toBe(true);
    });

    it("should handle errors in sync spans", () => {
      expect(() =>
        withSpanSync("sync-error-span", "sync.op", () => {
          throw new Error("sync error");
        })
      ).toThrow("sync error");

      const span = allSpans.find((s) => s.name === "sync-error-span");
      expect(span!.status?.code).toBe(2); // ERROR
      expect(span!.ended).toBe(true);
    });
  });
});
