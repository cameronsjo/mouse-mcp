/**
 * Shared utilities exports
 */

export { createLogger, Logger, type LogContext } from "./logger.js";
export {
  DisneyMcpError,
  SessionError,
  ApiError,
  CacheError,
  DatabaseError,
  ValidationError,
  formatErrorResponse,
  type ErrorResponse,
} from "./errors.js";
export { withRetry, type RetryOptions } from "./retry.js";
export { fuzzySearch, findBestMatch, type FuzzyMatchOptions } from "./fuzzy-match.js";
export {
  withSpan,
  withSpanSync,
  getCurrentTraceId,
  getCurrentSpanId,
  getTraceContext,
  setSpanAttribute,
  setSpanAttributes,
  recordException,
  addBreadcrumb,
  tracedFetch,
  SpanAttributes,
  SpanOperations,
  Sentry,
} from "./tracing.js";
