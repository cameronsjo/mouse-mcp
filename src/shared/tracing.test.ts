/**
 * Tests for tracing utilities
 *
 * These tests verify the behavior of tracing wrappers and helper functions.
 * Note: These are unit tests that mock Sentry/OTEL - they don't test actual span propagation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SpanStatusCode } from "@opentelemetry/api";

interface MockSpanOptions {
  name: string;
  op: string;
  attributes?: Record<string, unknown>;
}

// Mock Sentry before importing the module
vi.mock("@sentry/node", () => ({
  startSpan: vi.fn(
    async <T>(_options: MockSpanOptions, fn: (span: unknown) => Promise<T>): Promise<T> => {
      const mockSpan = {
        setStatus: vi.fn(),
        recordException: vi.fn(),
        setAttribute: vi.fn(),
        setAttributes: vi.fn(),
      };
      return fn(mockSpan);
    }
  ),
  startSpanManual: vi.fn(<T>(_options: MockSpanOptions, fn: (span: unknown) => T): T => {
    const mockSpan = {
      setStatus: vi.fn(),
      recordException: vi.fn(),
      setAttribute: vi.fn(),
      setAttributes: vi.fn(),
      end: vi.fn(),
    };
    return fn(mockSpan);
  }),
  captureException: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

// Mock OpenTelemetry trace API
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

import * as Sentry from "@sentry/node";
import { trace } from "@opentelemetry/api";
import {
  withSpan,
  withSpanSync,
  getCurrentTraceId,
  getCurrentSpanId,
  getTraceContext,
  setSpanAttribute,
  setSpanAttributes,
  recordException,
  addBreadcrumb,
  createChildSpan,
  tracedFetch,
  SPAN_ATTRIBUTES,
  SPAN_OPERATIONS,
  SpanAttributes,
  SpanOperations,
} from "./tracing.js";

describe("SPAN_ATTRIBUTES", () => {
  it("should export database attributes", () => {
    expect(SPAN_ATTRIBUTES.DB_SYSTEM).toBe("db.system");
    expect(SPAN_ATTRIBUTES.DB_NAME).toBe("db.name");
    expect(SPAN_ATTRIBUTES.DB_OPERATION).toBe("db.operation");
  });

  it("should export HTTP attributes", () => {
    expect(SPAN_ATTRIBUTES.HTTP_METHOD).toBe("http.method");
    expect(SPAN_ATTRIBUTES.HTTP_URL).toBe("http.url");
    expect(SPAN_ATTRIBUTES.HTTP_STATUS_CODE).toBe("http.status_code");
  });

  it("should export Disney-specific attributes", () => {
    expect(SPAN_ATTRIBUTES.DISNEY_DESTINATION).toBe("disney.destination_id");
    expect(SPAN_ATTRIBUTES.DISNEY_ENTITY_TYPE).toBe("disney.entity_type");
    expect(SPAN_ATTRIBUTES.DISNEY_ENTITY_ID).toBe("disney.entity_id");
  });

  it("should export MCP attributes", () => {
    expect(SPAN_ATTRIBUTES.MCP_TOOL).toBe("mcp.tool.name");
    expect(SPAN_ATTRIBUTES.MCP_SESSION).toBe("mcp.session_id");
  });

  it("should export embedding attributes", () => {
    expect(SPAN_ATTRIBUTES.EMBEDDING_PROVIDER).toBe("embedding.provider");
    expect(SPAN_ATTRIBUTES.EMBEDDING_MODEL).toBe("embedding.model");
    expect(SPAN_ATTRIBUTES.EMBEDDING_DIMENSIONS).toBe("embedding.dimensions");
  });

  it("should export cache attributes", () => {
    expect(SPAN_ATTRIBUTES.CACHE_KEY).toBe("cache.key");
    expect(SPAN_ATTRIBUTES.CACHE_HIT).toBe("cache.hit");
    expect(SPAN_ATTRIBUTES.CACHE_TTL).toBe("cache.ttl_hours");
  });

  it("should have backwards-compatible alias", () => {
    expect(SpanAttributes).toBe(SPAN_ATTRIBUTES);
  });
});

describe("SPAN_OPERATIONS", () => {
  it("should export database operations", () => {
    expect(SPAN_OPERATIONS.DB_QUERY).toBe("db.query");
    expect(SPAN_OPERATIONS.DB_INSERT).toBe("db.insert");
    expect(SPAN_OPERATIONS.DB_UPDATE).toBe("db.update");
    expect(SPAN_OPERATIONS.DB_DELETE).toBe("db.delete");
  });

  it("should export HTTP operations", () => {
    expect(SPAN_OPERATIONS.HTTP_CLIENT).toBe("http.client");
  });

  it("should export cache operations", () => {
    expect(SPAN_OPERATIONS.CACHE_GET).toBe("cache.get");
    expect(SPAN_OPERATIONS.CACHE_SET).toBe("cache.set");
    expect(SPAN_OPERATIONS.CACHE_DELETE).toBe("cache.delete");
  });

  it("should export MCP operations", () => {
    expect(SPAN_OPERATIONS.MCP_TOOL_CALL).toBe("mcp.tool");
  });

  it("should export embedding operations", () => {
    expect(SPAN_OPERATIONS.EMBEDDING_GENERATE).toBe("embedding.generate");
    expect(SPAN_OPERATIONS.EMBEDDING_SEARCH).toBe("embedding.search");
  });

  it("should have backwards-compatible alias", () => {
    expect(SpanOperations).toBe(SPAN_OPERATIONS);
  });
});

describe("withSpan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should call Sentry.startSpan with correct options", async () => {
    await withSpan("test-span", "test.op", async () => "result");

    expect(Sentry.startSpan).toHaveBeenCalledWith(
      {
        name: "test-span",
        op: "test.op",
        attributes: undefined,
      },
      expect.any(Function)
    );
  });

  it("should pass attributes to the span", async () => {
    const attributes = { key: "value", count: 42 };
    await withSpan("test-span", "test.op", async () => "result", attributes);

    expect(Sentry.startSpan).toHaveBeenCalledWith(
      {
        name: "test-span",
        op: "test.op",
        attributes,
      },
      expect.any(Function)
    );
  });

  it("should return the result of the wrapped function", async () => {
    const result = await withSpan("test-span", "test.op", async () => "expected-result");
    expect(result).toBe("expected-result");
  });

  it("should propagate errors and mark span as error", async () => {
    const testError = new Error("test error");

    await expect(
      withSpan("test-span", "test.op", async () => {
        throw testError;
      })
    ).rejects.toThrow("test error");
  });

  it("should provide span to the callback function", async () => {
    let receivedSpan: unknown = null;

    await withSpan("test-span", "test.op", async (span) => {
      receivedSpan = span;
      return "result";
    });

    expect(receivedSpan).toBeDefined();
    expect(receivedSpan).toHaveProperty("setAttribute");
  });
});

describe("withSpanSync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should call Sentry.startSpanManual with correct options", () => {
    withSpanSync("test-span", "test.op", () => "result");

    expect(Sentry.startSpanManual).toHaveBeenCalledWith(
      {
        name: "test-span",
        op: "test.op",
        attributes: undefined,
      },
      expect.any(Function)
    );
  });

  it("should return the result of the wrapped function", () => {
    const result = withSpanSync("test-span", "test.op", () => "expected-result");
    expect(result).toBe("expected-result");
  });

  it("should propagate errors", () => {
    expect(() =>
      withSpanSync("test-span", "test.op", () => {
        throw new Error("sync error");
      })
    ).toThrow("sync error");
  });
});

describe("getCurrentTraceId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return undefined when no active span", () => {
    vi.mocked(trace.getActiveSpan).mockReturnValue(undefined);
    expect(getCurrentTraceId()).toBeUndefined();
  });

  it("should return trace ID when span is active", () => {
    const mockSpan = {
      spanContext: () => ({
        traceId: "abc123",
        spanId: "def456",
      }),
    };
    vi.mocked(trace.getActiveSpan).mockReturnValue(mockSpan as never);

    expect(getCurrentTraceId()).toBe("abc123");
  });
});

describe("getCurrentSpanId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return undefined when no active span", () => {
    vi.mocked(trace.getActiveSpan).mockReturnValue(undefined);
    expect(getCurrentSpanId()).toBeUndefined();
  });

  it("should return span ID when span is active", () => {
    const mockSpan = {
      spanContext: () => ({
        traceId: "abc123",
        spanId: "def456",
      }),
    };
    vi.mocked(trace.getActiveSpan).mockReturnValue(mockSpan as never);

    expect(getCurrentSpanId()).toBe("def456");
  });
});

describe("getTraceContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return empty object when no active span", () => {
    vi.mocked(trace.getActiveSpan).mockReturnValue(undefined);
    expect(getTraceContext()).toEqual({});
  });

  it("should return both traceId and spanId when span is active", () => {
    const mockSpan = {
      spanContext: () => ({
        traceId: "trace-abc",
        spanId: "span-def",
      }),
    };
    vi.mocked(trace.getActiveSpan).mockReturnValue(mockSpan as never);

    expect(getTraceContext()).toEqual({
      traceId: "trace-abc",
      spanId: "span-def",
    });
  });
});

describe("setSpanAttribute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should do nothing when no active span", () => {
    vi.mocked(trace.getActiveSpan).mockReturnValue(undefined);
    expect(() => {
      setSpanAttribute("key", "value");
    }).not.toThrow();
  });

  it("should call setAttribute on active span", () => {
    const mockSetAttribute = vi.fn();
    const mockSpan = {
      setAttribute: mockSetAttribute,
    };
    vi.mocked(trace.getActiveSpan).mockReturnValue(mockSpan as never);

    setSpanAttribute("test-key", "test-value");

    expect(mockSetAttribute).toHaveBeenCalledWith("test-key", "test-value");
  });

  it("should handle different value types", () => {
    const mockSetAttribute = vi.fn();
    const mockSpan = { setAttribute: mockSetAttribute };
    vi.mocked(trace.getActiveSpan).mockReturnValue(mockSpan as never);

    setSpanAttribute("string-key", "string-value");
    setSpanAttribute("number-key", 42);
    setSpanAttribute("boolean-key", true);

    expect(mockSetAttribute).toHaveBeenCalledWith("string-key", "string-value");
    expect(mockSetAttribute).toHaveBeenCalledWith("number-key", 42);
    expect(mockSetAttribute).toHaveBeenCalledWith("boolean-key", true);
  });
});

describe("setSpanAttributes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should do nothing when no active span", () => {
    vi.mocked(trace.getActiveSpan).mockReturnValue(undefined);
    expect(() => {
      setSpanAttributes({ key: "value" });
    }).not.toThrow();
  });

  it("should call setAttributes on active span", () => {
    const mockSetAttributes = vi.fn();
    const mockSpan = { setAttributes: mockSetAttributes };
    vi.mocked(trace.getActiveSpan).mockReturnValue(mockSpan as never);

    const attributes = { key1: "value1", key2: 42, key3: true };
    setSpanAttributes(attributes);

    expect(mockSetAttributes).toHaveBeenCalledWith(attributes);
  });
});

describe("recordException", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should capture exception in Sentry even without active span", () => {
    vi.mocked(trace.getActiveSpan).mockReturnValue(undefined);
    const error = new Error("test error");

    recordException(error);

    expect(Sentry.captureException).toHaveBeenCalledWith(error);
  });

  it("should record exception on active span and capture in Sentry", () => {
    const mockRecordException = vi.fn();
    const mockSetStatus = vi.fn();
    const mockSpan = {
      recordException: mockRecordException,
      setStatus: mockSetStatus,
    };
    vi.mocked(trace.getActiveSpan).mockReturnValue(mockSpan as never);

    const error = new Error("test error");
    recordException(error);

    expect(mockRecordException).toHaveBeenCalledWith(error);
    expect(mockSetStatus).toHaveBeenCalledWith({
      code: SpanStatusCode.ERROR,
      message: "test error",
    });
    expect(Sentry.captureException).toHaveBeenCalledWith(error);
  });
});

describe("addBreadcrumb", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should add breadcrumb with default level", () => {
    addBreadcrumb("test message", "test-category");

    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith({
      message: "test message",
      category: "test-category",
      level: "info",
      data: undefined,
    });
  });

  it("should add breadcrumb with custom level and data", () => {
    addBreadcrumb("error message", "error-category", "error", { extra: "data" });

    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith({
      message: "error message",
      category: "error-category",
      level: "error",
      data: { extra: "data" },
    });
  });
});

describe("createChildSpan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /* eslint-disable @typescript-eslint/unbound-method */
  it("should create a child span with the tracer", () => {
    const mockStartSpan = vi.fn(() => ({
      setAttribute: vi.fn(),
      end: vi.fn(),
    }));
    const mockTracer = { startSpan: mockStartSpan };
    vi.mocked(trace.getTracer).mockReturnValue(mockTracer as never);

    const span = createChildSpan("child-span", "child.op", { key: "value" });

    expect(vi.mocked(trace.getTracer)).toHaveBeenCalledWith("mouse-mcp");
    expect(mockStartSpan).toHaveBeenCalledWith(
      "child-span",
      { attributes: { key: "value" } },
      expect.anything()
    );
    expect(span).toBeDefined();
  });
  /* eslint-enable @typescript-eslint/unbound-method */
});

describe("tracedFetch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock global fetch
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should call fetch with the provided URL and options", async () => {
    await tracedFetch("https://example.com/api", { method: "POST" });

    expect(global.fetch).toHaveBeenCalledWith("https://example.com/api", { method: "POST" });
  });

  it("should return the fetch response", async () => {
    const mockResponse = { ok: true, status: 200 };
    vi.mocked(global.fetch).mockResolvedValue(mockResponse as Response);

    const response = await tracedFetch("https://example.com/api");

    expect(response).toBe(mockResponse);
  });

  it("should use default GET method when not specified", async () => {
    await tracedFetch("https://example.com/api");

    expect(global.fetch).toHaveBeenCalledWith("https://example.com/api", undefined);
  });

  it("should handle non-ok responses", async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      status: 404,
    } as Response);

    const response = await tracedFetch("https://example.com/not-found");

    expect(response.status).toBe(404);
  });

  it("should use custom span name when provided", async () => {
    await tracedFetch("https://example.com/api", { method: "GET" }, "Custom Span Name");

    expect(Sentry.startSpan).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Custom Span Name",
      }),
      expect.any(Function)
    );
  });
});
