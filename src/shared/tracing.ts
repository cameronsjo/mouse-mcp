/**
 * Tracing Utilities
 *
 * Provides helper functions for creating spans and instrumenting operations.
 * Uses Sentry's OpenTelemetry integration under the hood.
 */

import * as Sentry from "@sentry/node";
import { trace, context, SpanStatusCode, type Span } from "@opentelemetry/api";

// Semantic conventions for span attributes
export const SPAN_ATTRIBUTES = {
  // Database operations
  DB_SYSTEM: "db.system",
  DB_NAME: "db.name",
  DB_OPERATION: "db.operation",
  DB_STATEMENT: "db.statement",

  // HTTP operations
  HTTP_METHOD: "http.method",
  HTTP_URL: "http.url",
  HTTP_STATUS_CODE: "http.status_code",
  HTTP_HOST: "http.host",

  // Disney-specific attributes
  DISNEY_DESTINATION: "disney.destination_id",
  DISNEY_PARK: "disney.park_id",
  DISNEY_ENTITY_TYPE: "disney.entity_type",
  DISNEY_ENTITY_ID: "disney.entity_id",

  // MCP-specific attributes
  MCP_TOOL: "mcp.tool.name",
  MCP_SESSION: "mcp.session_id",

  // Embedding operations
  EMBEDDING_PROVIDER: "embedding.provider",
  EMBEDDING_MODEL: "embedding.model",
  EMBEDDING_DIMENSIONS: "embedding.dimensions",
  EMBEDDING_BATCH_SIZE: "embedding.batch_size",

  // Cache operations
  CACHE_KEY: "cache.key",
  CACHE_HIT: "cache.hit",
  CACHE_TTL: "cache.ttl_hours",
} as const;

// Span operation names following OpenTelemetry semantic conventions
export const SPAN_OPERATIONS = {
  // Database operations
  DB_QUERY: "db.query",
  DB_INSERT: "db.insert",
  DB_UPDATE: "db.update",
  DB_DELETE: "db.delete",

  // HTTP operations
  HTTP_CLIENT: "http.client",

  // Cache operations
  CACHE_GET: "cache.get",
  CACHE_SET: "cache.set",
  CACHE_DELETE: "cache.delete",

  // MCP operations
  MCP_TOOL_CALL: "mcp.tool",

  // Embedding operations
  EMBEDDING_GENERATE: "embedding.generate",
  EMBEDDING_SEARCH: "embedding.search",

  // Session operations
  SESSION_REFRESH: "session.refresh",
  SESSION_VALIDATE: "session.validate",

  // Disney API operations
  DISNEY_API_REQUEST: "disney.api.request",
} as const;

/**
 * Wrap an async operation with a span.
 *
 * @param name - Human-readable span name
 * @param op - Operation type (e.g., "db.query", "http.client")
 * @param fn - The async function to execute
 * @param attributes - Optional span attributes
 * @returns The result of the function
 */
export async function withSpan<T>(
  name: string,
  op: string,
  fn: (span: Span | undefined) => Promise<T>,
  attributes?: Record<string, string | number | boolean>
): Promise<T> {
  return Sentry.startSpan(
    {
      name,
      op,
      attributes,
    },
    async (span) => {
      try {
        const result = await fn(span);
        return result;
      } catch (error) {
        // Mark span as error
        if (span) {
          span.setStatus({ code: SpanStatusCode.ERROR, message: String(error) });
          span.recordException(error as Error);
        }
        throw error;
      }
    }
  );
}

/**
 * Wrap a synchronous operation with a span.
 */
export function withSpanSync<T>(
  name: string,
  op: string,
  fn: (span: Span | undefined) => T,
  attributes?: Record<string, string | number | boolean>
): T {
  return Sentry.startSpanManual(
    {
      name,
      op,
      attributes,
    },
    (span) => {
      try {
        const result = fn(span);
        span?.end();
        return result;
      } catch (error) {
        if (span) {
          span.setStatus({ code: SpanStatusCode.ERROR, message: String(error) });
          span.recordException(error as Error);
          span.end();
        }
        throw error;
      }
    }
  );
}

/**
 * Get the current trace ID for logging correlation.
 */
export function getCurrentTraceId(): string | undefined {
  const activeSpan = trace.getActiveSpan();
  if (activeSpan) {
    return activeSpan.spanContext().traceId;
  }
  return undefined;
}

/**
 * Get the current span ID for logging correlation.
 */
export function getCurrentSpanId(): string | undefined {
  const activeSpan = trace.getActiveSpan();
  if (activeSpan) {
    return activeSpan.spanContext().spanId;
  }
  return undefined;
}

/**
 * Get trace context for logging.
 */
export function getTraceContext(): { traceId?: string; spanId?: string } {
  const activeSpan = trace.getActiveSpan();
  if (activeSpan) {
    const spanContext = activeSpan.spanContext();
    return {
      traceId: spanContext.traceId,
      spanId: spanContext.spanId,
    };
  }
  return {};
}

/**
 * Add an attribute to the current span.
 */
export function setSpanAttribute(key: string, value: string | number | boolean): void {
  const activeSpan = trace.getActiveSpan();
  if (activeSpan) {
    activeSpan.setAttribute(key, value);
  }
}

/**
 * Add multiple attributes to the current span.
 */
export function setSpanAttributes(attributes: Record<string, string | number | boolean>): void {
  const activeSpan = trace.getActiveSpan();
  if (activeSpan) {
    activeSpan.setAttributes(attributes);
  }
}

/**
 * Record an exception on the current span.
 */
export function recordException(error: Error): void {
  const activeSpan = trace.getActiveSpan();
  if (activeSpan) {
    activeSpan.recordException(error);
    activeSpan.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
  }

  // Also capture in Sentry
  Sentry.captureException(error);
}

/**
 * Add a breadcrumb for debugging.
 */
export function addBreadcrumb(
  message: string,
  category: string,
  level: Sentry.SeverityLevel = "info",
  data?: Record<string, unknown>
): void {
  Sentry.addBreadcrumb({
    message,
    category,
    level,
    data,
  });
}

/**
 * Create a child span from the current context.
 * Useful for manual span management.
 *
 * @param name - Human-readable span name
 * @param _op - Operation type (reserved for future use)
 * @param attributes - Optional span attributes
 */
export function createChildSpan(
  name: string,
  _op: string,
  attributes?: Record<string, string | number | boolean>
): Span | undefined {
  const tracer = trace.getTracer("mouse-mcp");
  const parentContext = context.active();
  const span = tracer.startSpan(name, { attributes }, parentContext);
  return span;
}

/**
 * Wrap a fetch call with tracing.
 * Adds HTTP-specific attributes to the span.
 */
export async function tracedFetch(
  url: string,
  options?: RequestInit,
  spanName?: string
): Promise<Response> {
  const parsedUrl = new URL(url);

  return withSpan(
    spanName ?? `HTTP ${options?.method ?? "GET"} ${parsedUrl.hostname}${parsedUrl.pathname}`,
    SPAN_OPERATIONS.HTTP_CLIENT,
    async (span) => {
      span?.setAttributes({
        [SPAN_ATTRIBUTES.HTTP_METHOD]: options?.method ?? "GET",
        [SPAN_ATTRIBUTES.HTTP_URL]: url,
        [SPAN_ATTRIBUTES.HTTP_HOST]: parsedUrl.hostname,
      });

      const response = await fetch(url, options);

      span?.setAttribute(SPAN_ATTRIBUTES.HTTP_STATUS_CODE, response.status);

      if (!response.ok) {
        span?.setStatus({
          code: SpanStatusCode.ERROR,
          message: `HTTP ${response.status}`,
        });
      }

      return response;
    }
  );
}

// Backwards-compatible aliases for the constants
export { SPAN_ATTRIBUTES as SpanAttributes, SPAN_OPERATIONS as SpanOperations };

// Re-export Sentry for direct access
export { Sentry };
