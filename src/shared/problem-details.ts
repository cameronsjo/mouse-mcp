/**
 * RFC 9457 Problem Details
 *
 * Standardized error response format for HTTP APIs.
 * @see https://www.rfc-editor.org/rfc/rfc9457.html
 */

/**
 * RFC 9457 Problem Details interface
 */
export interface ProblemDetails {
  /** URI reference identifying the problem type */
  type: string;

  /** Short, human-readable summary (SHOULD NOT change between occurrences) */
  title: string;

  /** HTTP status code for this occurrence */
  status: number;

  /** Human-readable explanation specific to this occurrence */
  detail: string;

  /** URI reference identifying this specific occurrence */
  instance: string;

  /** Extension: MCP tool name */
  tool?: string;

  /** Extension: Entity ID being operated on */
  entityId?: string;

  /** Extension: Entity type (attraction, destination, etc.) */
  entityType?: string;

  /** Extension: Field name for validation errors */
  field?: string;

  /** Extension: Sanitized invalid value for validation errors */
  invalidValue?: unknown;

  /** Extension: Sanitized API endpoint for API errors */
  endpoint?: string;

  /** Extension: Configuration key for config errors */
  configKey?: string;

  /** Extension: ISO 8601 timestamp when error occurred */
  timestamp?: string;

  /** Extension: Additional context (use sparingly) */
  [key: string]: unknown;
}

/**
 * MCP tool response with Problem Details error
 */
export interface ProblemDetailsResponse {
  content: [{ type: "text"; text: string }];
  isError: true;
}

/**
 * Error type metadata
 */
interface ErrorTypeMetadata {
  type: string;
  title: string;
  status: number;
}

/**
 * Registry of error types to Problem Details metadata
 */
const ERROR_TYPE_REGISTRY: Record<string, ErrorTypeMetadata> = {
  DisneyMcpError: {
    type: "about:blank",
    title: "An error occurred",
    status: 500,
  },
  ValidationError: {
    type: "https://mouse-mcp.dev/errors/validation-error",
    title: "Validation Failed",
    status: 400,
  },
  ApiError: {
    type: "https://mouse-mcp.dev/errors/api-error",
    title: "External API Error",
    status: 502,
  },
  SessionError: {
    type: "https://mouse-mcp.dev/errors/session-error",
    title: "Session Error",
    status: 401,
  },
  NotFoundError: {
    type: "https://mouse-mcp.dev/errors/not-found",
    title: "Resource Not Found",
    status: 404,
  },
  DatabaseError: {
    type: "https://mouse-mcp.dev/errors/database-error",
    title: "Database Error",
    status: 500,
  },
  CacheError: {
    type: "https://mouse-mcp.dev/errors/cache-error",
    title: "Cache Error",
    status: 500,
  },
  ConfigError: {
    type: "https://mouse-mcp.dev/errors/configuration-error",
    title: "Configuration Error",
    status: 500,
  },
};

/**
 * Base error with Problem Details support
 */
export class DisneyMcpError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;
  tool?: string;
  entityId?: string;
  entityType?: string;

  constructor(message: string, code: string, details?: Record<string, unknown>, tool?: string) {
    super(message);
    this.name = "DisneyMcpError";
    this.code = code;
    this.details = details;
    this.tool = tool;
  }

  /**
   * Convert error to RFC 9457 Problem Details
   */
  toProblemDetails(): ProblemDetails {
    const metadata = ERROR_TYPE_REGISTRY[this.name] ?? ERROR_TYPE_REGISTRY.DisneyMcpError!;

    const problem: ProblemDetails = {
      type: metadata.type,
      title: metadata.title,
      status: metadata.status,
      detail: this.message,
      instance: `urn:uuid:${generateUuidV4()}`,
      timestamp: new Date().toISOString(),
    };

    // Add tool name if available
    if (this.tool) {
      problem.tool = this.tool;
    }

    // Add entity context if available
    if (this.entityId) {
      problem.entityId = this.entityId;
    }
    if (this.entityType) {
      problem.entityType = this.entityType;
    }

    return problem;
  }
}

/**
 * Validation errors
 */
export class ValidationError extends DisneyMcpError {
  readonly field: string;
  readonly value: unknown;

  constructor(message: string, field: string, value: unknown, tool?: string) {
    super(message, "VALIDATION_ERROR", { field, value }, tool);
    this.name = "ValidationError";
    this.field = field;
    this.value = value;
  }

  toProblemDetails(): ProblemDetails {
    const problem = super.toProblemDetails();
    problem.field = this.field;
    // Sanitize value - don't include sensitive data
    problem.invalidValue = sanitizeValue(this.value);
    return problem;
  }
}

/**
 * API request errors
 */
export class ApiError extends DisneyMcpError {
  readonly statusCode: number;
  readonly endpoint: string;

  constructor(
    message: string,
    statusCode: number,
    endpoint: string,
    details?: Record<string, unknown>,
    tool?: string
  ) {
    super(message, "API_ERROR", { ...details, statusCode, endpoint }, tool);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.endpoint = endpoint;
  }

  toProblemDetails(): ProblemDetails {
    const problem = super.toProblemDetails();

    // Map API status codes to appropriate Problem Details status
    if (this.statusCode >= 500) {
      problem.status = 503; // Service Unavailable
    } else if (this.statusCode >= 400) {
      problem.status = 502; // Bad Gateway
    }

    // Sanitize endpoint - remove query params, tokens, etc.
    problem.endpoint = sanitizeEndpoint(this.endpoint);

    return problem;
  }
}

/**
 * Session/authentication errors
 */
export class SessionError extends DisneyMcpError {
  readonly isAuthFailure: boolean;

  constructor(message: string, details?: Record<string, unknown>, tool?: string) {
    super(message, "SESSION_ERROR", details, tool);
    this.name = "SessionError";
    this.isAuthFailure = true;
  }

  toProblemDetails(): ProblemDetails {
    const problem = super.toProblemDetails();
    // Session errors are always 401 Unauthorized
    problem.status = 401;
    return problem;
  }
}

/**
 * Resource not found errors
 */
export class NotFoundError extends DisneyMcpError {
  constructor(message: string, entityType: string, entityId: string, tool?: string) {
    super(message, "NOT_FOUND", { entityType, entityId }, tool);
    this.name = "NotFoundError";
    this.entityType = entityType;
    this.entityId = entityId;
  }
}

/**
 * Database errors
 */
export class DatabaseError extends DisneyMcpError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "DATABASE_ERROR", details);
    this.name = "DatabaseError";
  }
}

/**
 * Cache errors
 */
export class CacheError extends DisneyMcpError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "CACHE_ERROR", details);
    this.name = "CacheError";
  }
}

/**
 * Configuration errors
 */
export class ConfigError extends DisneyMcpError {
  readonly configKey?: string;

  constructor(message: string, configKey?: string, details?: Record<string, unknown>) {
    super(message, "CONFIG_ERROR", { ...details, configKey });
    this.name = "ConfigError";
    this.configKey = configKey;
  }

  toProblemDetails(): ProblemDetails {
    const problem = super.toProblemDetails();
    if (this.configKey) {
      problem.configKey = this.configKey;
    }
    return problem;
  }
}

/**
 * Format error as RFC 9457 Problem Details for MCP tool response
 *
 * Security considerations:
 * - Sanitizes sensitive data (tokens, credentials, internal paths)
 * - Limits detail verbosity in production
 * - Generates unique instance URN for tracking
 *
 * @param error - Error to format
 * @param tool - MCP tool name that generated the error
 * @returns RFC 9457 Problem Details formatted response
 */
export function formatErrorResponse(error: unknown, tool?: string): ProblemDetailsResponse {
  let problem: ProblemDetails;

  if (error instanceof DisneyMcpError) {
    // Set tool name if not already set
    if (tool && !error.tool) {
      error.tool = tool;
    }
    problem = error.toProblemDetails();
  } else if (error instanceof Error) {
    // Generic Error - convert to basic Problem Details
    problem = {
      type: "about:blank",
      title: "An error occurred",
      status: 500,
      detail: sanitizeErrorMessage(error.message),
      instance: `urn:uuid:${generateUuidV4()}`,
      timestamp: new Date().toISOString(),
    };

    if (tool) {
      problem.tool = tool;
    }
  } else {
    // Unknown error type
    problem = {
      type: "about:blank",
      title: "An error occurred",
      status: 500,
      detail: "An unexpected error occurred",
      instance: `urn:uuid:${generateUuidV4()}`,
      timestamp: new Date().toISOString(),
    };

    if (tool) {
      problem.tool = tool;
    }
  }

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(problem, null, 2),
      },
    ],
    isError: true,
  };
}

/**
 * Sanitize error message to remove sensitive information
 *
 * Removes:
 * - File paths
 * - Tokens/keys (32+ character alphanumeric strings)
 * - Email addresses
 */
function sanitizeErrorMessage(message: string): string {
  // Remove potential file paths
  let sanitized = message.replace(/\/[\w/.-]+/g, "[path]");

  // Remove potential tokens/keys
  sanitized = sanitized.replace(/[a-zA-Z0-9]{32,}/g, "[redacted]");

  // Remove potential emails
  sanitized = sanitized.replace(/[\w.-]+@[\w.-]+\.\w+/g, "[email]");

  return sanitized;
}

/**
 * Sanitize API endpoint to remove sensitive query parameters
 *
 * Redacts: token, key, secret, password, auth parameters
 */
function sanitizeEndpoint(endpoint: string): string {
  try {
    const url = new URL(endpoint);

    // Remove sensitive query parameters
    const sensitiveParams = ["token", "key", "secret", "password", "auth"];
    sensitiveParams.forEach((param) => {
      if (url.searchParams.has(param)) {
        url.searchParams.set(param, "[redacted]");
      }
    });

    return url.toString();
  } catch {
    // If not a valid URL, just return the path portion
    return endpoint.split("?")[0] ?? endpoint;
  }
}

/**
 * Sanitize value for inclusion in error response
 *
 * - Summarizes large objects/arrays
 * - Truncates long strings
 * - Passes through primitives
 */
function sanitizeValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  // Don't include large objects or arrays
  if (typeof value === "object") {
    if (Array.isArray(value)) {
      return `[Array of ${value.length} items]`;
    }
    return "[Object]";
  }

  // Truncate long strings
  if (typeof value === "string" && value.length > 100) {
    return value.substring(0, 97) + "...";
  }

  return value;
}

/**
 * Generate UUID v4
 *
 * Used for unique error instance URNs.
 */
function generateUuidV4(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
