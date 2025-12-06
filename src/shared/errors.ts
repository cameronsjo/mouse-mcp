/**
 * Custom Error Classes
 *
 * Structured errors for consistent handling across the application.
 */

/** Base error for Disney MCP server */
export class DisneyMcpError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(message: string, code: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "DisneyMcpError";
    this.code = code;
    this.details = details;
  }
}

/** Authentication/session errors */
export class SessionError extends DisneyMcpError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "SESSION_ERROR", details);
    this.name = "SessionError";
  }
}

/** API request errors */
export class ApiError extends DisneyMcpError {
  readonly statusCode: number;
  readonly endpoint: string;

  constructor(
    message: string,
    statusCode: number,
    endpoint: string,
    details?: Record<string, unknown>
  ) {
    super(message, "API_ERROR", { ...details, statusCode, endpoint });
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.endpoint = endpoint;
  }
}

/** Cache errors */
export class CacheError extends DisneyMcpError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "CACHE_ERROR", details);
    this.name = "CacheError";
  }
}

/** Database errors */
export class DatabaseError extends DisneyMcpError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "DATABASE_ERROR", details);
    this.name = "DatabaseError";
  }
}

/** Validation errors */
export class ValidationError extends DisneyMcpError {
  readonly field: string;
  readonly value: unknown;

  constructor(message: string, field: string, value: unknown) {
    super(message, "VALIDATION_ERROR", { field, value });
    this.name = "ValidationError";
    this.field = field;
    this.value = value;
  }
}

/** Format error for MCP tool response */
export interface ErrorResponse {
  content: [{ type: "text"; text: string }];
  isError: true;
}

export function formatErrorResponse(error: unknown): ErrorResponse {
  const message = error instanceof Error ? error.message : String(error);
  const code = error instanceof DisneyMcpError ? error.code : "UNKNOWN_ERROR";

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ error: message, code }, null, 2),
      },
    ],
    isError: true,
  };
}
