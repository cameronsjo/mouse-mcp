# RFC 9457 Problem Details for Mouse MCP

## Overview

This document defines the RFC 9457 Problem Details implementation for the Mouse MCP server. RFC 9457 provides a standardized format for HTTP API error responses that is machine-readable and extensible.

## References

- [RFC 9457: Problem Details for HTTP APIs](https://www.rfc-editor.org/rfc/rfc9457.html)
- [IANA Problem Types Registry](https://www.iana.org/assignments/http-problem-types/)

## Problem Details Structure

### Core Fields (RFC 9457)

All Problem Details responses MUST include these fields:

- **type** (string): URI reference identifying the problem type. MUST be a valid URI. Defaults to "about:blank" for generic errors.
- **title** (string): Short, human-readable summary of the problem type. SHOULD NOT change between occurrences.
- **status** (number): HTTP status code for this occurrence. MUST match the actual HTTP response status.
- **detail** (string): Human-readable explanation specific to this occurrence.
- **instance** (string): URI reference identifying this specific occurrence.

### Extension Fields (Mouse MCP Specific)

Additional fields MAY be included for MCP-specific context:

- **tool** (string): Name of the MCP tool that generated the error
- **entityId** (string): ID of the entity being operated on (if applicable)
- **entityType** (string): Type of entity (attraction, destination, dining, etc.)
- **field** (string): Field name for validation errors
- **invalidValue** (unknown): Sanitized representation of invalid value
- **endpoint** (string): Sanitized API endpoint that failed (for ApiError)
- **timestamp** (string): ISO 8601 timestamp when error occurred

## Error Type URIs

All error type URIs follow the pattern: `https://mouse-mcp.dev/errors/{error-type}`

### Base Error Types

#### Generic Error

- **URI**: `about:blank`
- **Title**: "An error occurred"
- **Status**: 500
- **Use**: Fallback for unknown or unclassified errors

#### Validation Error

- **URI**: `https://mouse-mcp.dev/errors/validation-error`
- **Title**: "Validation Failed"
- **Status**: 400
- **Extensions**: `field`, `invalidValue`
- **Use**: Input validation failures, schema violations, constraint violations

#### API Error

- **URI**: `https://mouse-mcp.dev/errors/api-error`
- **Title**: "External API Error"
- **Status**: 502 (Bad Gateway) or 503 (Service Unavailable)
- **Extensions**: `endpoint` (sanitized)
- **Use**: Upstream API failures, third-party service errors

#### Session Error

- **URI**: `https://mouse-mcp.dev/errors/session-error`
- **Title**: "Session Error"
- **Status**: 401 (Unauthorized) or 403 (Forbidden)
- **Use**: Authentication failures, session expiration, authorization failures

#### Not Found Error

- **URI**: `https://mouse-mcp.dev/errors/not-found`
- **Title**: "Resource Not Found"
- **Status**: 404
- **Extensions**: `entityId`, `entityType`
- **Use**: Requested resource does not exist

#### Database Error

- **URI**: `https://mouse-mcp.dev/errors/database-error`
- **Title**: "Database Error"
- **Status**: 500
- **Use**: Database connection failures, query errors, transaction failures

#### Cache Error

- **URI**: `https://mouse-mcp.dev/errors/cache-error`
- **Title**: "Cache Error"
- **Status**: 500
- **Use**: Cache operation failures (rare, usually non-fatal)

#### Configuration Error

- **URI**: `https://mouse-mcp.dev/errors/configuration-error`
- **Title**: "Configuration Error"
- **Status**: 500
- **Use**: Missing or invalid configuration, startup failures

## TypeScript Interfaces

```typescript
/**
 * RFC 9457 Problem Details
 *
 * Standardized error response format for HTTP APIs.
 * @see https://www.rfc-editor.org/rfc/rfc9457.html
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
```

## Implementation

### Error Type Registry

```typescript
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
```

### Updated Error Classes

```typescript
/** Base error with Problem Details support */
export class DisneyMcpError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;
  readonly tool?: string;
  readonly entityId?: string;
  readonly entityType?: string;

  constructor(
    message: string,
    code: string,
    details?: Record<string, unknown>,
    tool?: string
  ) {
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
    const metadata = ERROR_TYPE_REGISTRY[this.name] ?? ERROR_TYPE_REGISTRY.DisneyMcpError;

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

/** Validation errors */
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

/** API request errors */
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

/** Session/authentication errors */
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

/** Resource not found errors */
export class NotFoundError extends DisneyMcpError {
  constructor(
    message: string,
    entityType: string,
    entityId: string,
    tool?: string
  ) {
    super(message, "NOT_FOUND", { entityType, entityId }, tool);
    this.name = "NotFoundError";
    this.entityType = entityType;
    this.entityId = entityId;
  }
}

/** Database errors */
export class DatabaseError extends DisneyMcpError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "DATABASE_ERROR", details);
    this.name = "DatabaseError";
  }
}

/** Cache errors */
export class CacheError extends DisneyMcpError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "CACHE_ERROR", details);
    this.name = "CacheError";
  }
}

/** Configuration errors */
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
```

### Format Error Response Function

```typescript
/**
 * Format error as RFC 9457 Problem Details for MCP tool response
 *
 * Security considerations:
 * - Sanitizes sensitive data (tokens, credentials, internal paths)
 * - Limits detail verbosity in production
 * - Generates unique instance URN for tracking
 */
export function formatErrorResponse(
  error: unknown,
  tool?: string
): ProblemDetailsResponse {
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
 */
function generateUuidV4(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
```

## Example Error Responses

### Validation Error

```json
{
  "type": "https://mouse-mcp.dev/errors/validation-error",
  "title": "Validation Failed",
  "status": 400,
  "detail": "Invalid destination ID. Must be 'wdw' or 'dlr'",
  "instance": "urn:uuid:a3bb189e-8bf9-41c4-b5db-dbe0e0f51f6e",
  "timestamp": "2025-12-06T18:30:00.000Z",
  "tool": "disney_attractions",
  "field": "destination",
  "invalidValue": "orlando"
}
```

### API Error (Service Unavailable)

```json
{
  "type": "https://mouse-mcp.dev/errors/api-error",
  "title": "External API Error",
  "status": 503,
  "detail": "Disney API returned 503: Service temporarily unavailable",
  "instance": "urn:uuid:7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "timestamp": "2025-12-06T18:31:15.000Z",
  "tool": "disney_attractions",
  "endpoint": "https://api.wdpro.disney.go.com/facility-service/attractions"
}
```

### Session Error (Unauthorized)

```json
{
  "type": "https://mouse-mcp.dev/errors/session-error",
  "title": "Session Error",
  "status": 401,
  "detail": "No valid Disney session. Session may have expired or authentication failed",
  "instance": "urn:uuid:3f7e4c8a-9d2b-4e3a-8f1c-2b5d9e6a7c8f",
  "timestamp": "2025-12-06T18:32:00.000Z",
  "tool": "disney_attractions"
}
```

### Not Found Error

```json
{
  "type": "https://mouse-mcp.dev/errors/not-found",
  "title": "Resource Not Found",
  "status": 404,
  "detail": "Attraction with ID '99999999' not found at Walt Disney World",
  "instance": "urn:uuid:1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d",
  "timestamp": "2025-12-06T18:33:00.000Z",
  "tool": "disney_entity",
  "entityType": "attraction",
  "entityId": "99999999"
}
```

### Database Error

```json
{
  "type": "https://mouse-mcp.dev/errors/database-error",
  "title": "Database Error",
  "status": 500,
  "detail": "Failed to initialize database: unable to open database file",
  "instance": "urn:uuid:8e7d6c5b-4a3f-2e1d-0c9b-8a7f6e5d4c3b",
  "timestamp": "2025-12-06T18:34:00.000Z"
}
```

### Configuration Error

```json
{
  "type": "https://mouse-mcp.dev/errors/configuration-error",
  "title": "Configuration Error",
  "status": 500,
  "detail": "Required environment variable MOUSEMCP_EMBEDDING_PROVIDER not set",
  "instance": "urn:uuid:9f8e7d6c-5b4a-3f2e-1d0c-9b8a7f6e5d4c",
  "timestamp": "2025-12-06T18:35:00.000Z",
  "configKey": "MOUSEMCP_EMBEDDING_PROVIDER"
}
```

### Cache Error

```json
{
  "type": "https://mouse-mcp.dev/errors/cache-error",
  "title": "Cache Error",
  "status": 500,
  "detail": "Failed to read from cache: cache file corrupted",
  "instance": "urn:uuid:2b3c4d5e-6f7a-8b9c-0d1e-2f3a4b5c6d7e",
  "timestamp": "2025-12-06T18:36:00.000Z"
}
```

### Generic Error (Unknown Type)

```json
{
  "type": "about:blank",
  "title": "An error occurred",
  "status": 500,
  "detail": "An unexpected error occurred",
  "instance": "urn:uuid:5c6d7e8f-9a0b-1c2d-3e4f-5a6b7c8d9e0f",
  "timestamp": "2025-12-06T18:37:00.000Z",
  "tool": "disney_sync"
}
```

## Security Considerations

### Data Sanitization

All error responses MUST sanitize sensitive information:

1. **File Paths**: Replace with `[path]` placeholder
2. **Tokens/Keys**: Replace with `[redacted]` placeholder
3. **Email Addresses**: Replace with `[email]` placeholder
4. **Query Parameters**: Remove or redact sensitive parameters (token, key, secret, password, auth)
5. **Large Values**: Truncate or summarize to prevent information leakage

### Production vs Development

In production environments:

- SHOULD use more generic detail messages
- MUST NOT include stack traces
- MUST NOT include internal implementation details
- MAY include error instance URN for support tracking

In development environments:

- MAY include more detailed error information
- MAY include stack traces (via separate logging, not in response)
- SHOULD still sanitize sensitive data

### Error Instance Tracking

The `instance` field uses URN format with UUID v4:

- Format: `urn:uuid:{uuid-v4}`
- Unique per error occurrence
- Can be used for correlation with logs
- Safe to share with users for support requests

## Migration Guide

### Step 1: Update Error Classes

Add `toProblemDetails()` method to all error classes that extend `DisneyMcpError`.

### Step 2: Update Error Response Formatting

Replace the current `formatErrorResponse()` function with the RFC 9457 version.

### Step 3: Update Tool Error Handling

Update all tools to pass the tool name to `formatErrorResponse()`:

```typescript
try {
  // Tool logic
} catch (error) {
  return formatErrorResponse(error, "disney_attractions");
}
```

### Step 4: Add NotFoundError Class

Create the new `NotFoundError` class for 404 scenarios.

### Step 5: Add ConfigError Class

Create the new `ConfigError` class for configuration issues.

### Step 6: Update Documentation

Update API documentation to reference RFC 9457 Problem Details format.

## Best Practices

### DO

- Use specific error types (ValidationError, ApiError, etc.) rather than base DisneyMcpError
- Include tool name when throwing errors from tools
- Provide actionable detail messages
- Use consistent title text for the same error type
- Generate unique instance URN for each occurrence
- Sanitize all error data before including in response

### DO NOT

- Include sensitive data in error responses (tokens, passwords, internal paths)
- Change error title text between occurrences of the same type
- Use generic "An error occurred" when a specific error type applies
- Include stack traces in production error responses
- Expose internal implementation details in error messages

## References

- [RFC 9457: Problem Details for HTTP APIs](https://www.rfc-editor.org/rfc/rfc9457.html)
- [RFC 3986: Uniform Resource Identifier (URI): Generic Syntax](https://www.rfc-editor.org/rfc/rfc3986.html)
- [RFC 2119: Key words for use in RFCs](https://www.rfc-editor.org/rfc/rfc2119.html)
- [IANA HTTP Problem Types Registry](https://www.iana.org/assignments/http-problem-types/)
