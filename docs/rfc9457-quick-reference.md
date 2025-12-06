# RFC 9457 Problem Details - Quick Reference

Quick reference guide for implementing RFC 9457 Problem Details in Mouse MCP tools.

## Error Types Cheat Sheet

| Error Type | URI | Status | Use When |
|------------|-----|--------|----------|
| ValidationError | `https://mouse-mcp.dev/errors/validation-error` | 400 | Invalid input, missing params, schema violations |
| ApiError | `https://mouse-mcp.dev/errors/api-error` | 502/503 | External API failures, network errors |
| SessionError | `https://mouse-mcp.dev/errors/session-error` | 401 | Auth failures, session expired |
| NotFoundError | `https://mouse-mcp.dev/errors/not-found` | 404 | Resource doesn't exist |
| DatabaseError | `https://mouse-mcp.dev/errors/database-error` | 500 | DB connection, query failures |
| CacheError | `https://mouse-mcp.dev/errors/cache-error` | 500 | Cache read/write failures |
| ConfigError | `https://mouse-mcp.dev/errors/configuration-error` | 500 | Missing/invalid config |
| Generic | `about:blank` | 500 | Unknown/unexpected errors |

## Quick Code Examples

### ValidationError

```typescript
// Invalid parameter value
if (!["wdw", "dlr"].includes(args.destination)) {
  throw new ValidationError(
    "Invalid destination. Must be 'wdw' or 'dlr'",
    "destination",
    args.destination,
    "disney_attractions"
  );
}

// Missing required parameter
if (!args.destination) {
  throw new ValidationError(
    "Missing required parameter: destination",
    "destination",
    null,
    "disney_attractions"
  );
}
```

### ApiError

```typescript
// API request failed
const response = await fetch(endpoint);
if (!response.ok) {
  throw new ApiError(
    `Disney API returned ${response.status}`,
    response.status,
    endpoint,
    undefined,
    "disney_attractions"
  );
}
```

### SessionError

```typescript
// No valid session
const session = await sessionManager.getSession(destination);
if (!session) {
  throw new SessionError(
    "No valid Disney session",
    undefined,
    "disney_attractions"
  );
}
```

### NotFoundError

```typescript
// Entity not found
const entity = await getEntity(entityId);
if (!entity) {
  throw new NotFoundError(
    `Attraction with ID '${entityId}' not found`,
    "attraction",
    entityId,
    "disney_entity"
  );
}
```

### DatabaseError

```typescript
// Database operation failed
try {
  await db.exec(query);
} catch (error) {
  throw new DatabaseError(
    "Failed to execute query",
    { error: (error as Error).message }
  );
}
```

### ConfigError

```typescript
// Missing environment variable
const provider = process.env.MOUSEMCP_EMBEDDING_PROVIDER;
if (!provider) {
  throw new ConfigError(
    "Required environment variable MOUSEMCP_EMBEDDING_PROVIDER not set",
    "MOUSEMCP_EMBEDDING_PROVIDER"
  );
}
```

## Tool Handler Template

```typescript
import { formatErrorResponse, ValidationError, SessionError, ApiError } from "../shared/problem-details.js";

export const handler: ToolHandler = async (args) => {
  try {
    // 1. Validate input
    if (!args.destination) {
      throw new ValidationError(
        "Missing required parameter: destination",
        "destination",
        null,
        "tool_name"
      );
    }

    // 2. Check session
    const session = await sessionManager.getSession(args.destination);
    if (!session) {
      throw new SessionError(
        "No valid Disney session",
        undefined,
        "tool_name"
      );
    }

    // 3. Make API request
    const response = await fetch(endpoint);
    if (!response.ok) {
      throw new ApiError(
        `API error: ${response.status}`,
        response.status,
        endpoint,
        undefined,
        "tool_name"
      );
    }

    // 4. Process and return results
    const data = await response.json();
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }]
    };

  } catch (error) {
    // 5. Format error as Problem Details
    return formatErrorResponse(error, "tool_name");
  }
};
```

## Import Statement

```typescript
import {
  formatErrorResponse,
  ValidationError,
  ApiError,
  SessionError,
  NotFoundError,
  DatabaseError,
  CacheError,
  ConfigError,
  DisneyMcpError,
  type ProblemDetails,
} from "../shared/problem-details.js";
```

## Response Format

Every error response follows this structure:

```typescript
{
  // Required RFC 9457 fields
  type: string;      // Error type URI
  title: string;     // Human-readable summary
  status: number;    // HTTP status code
  detail: string;    // Specific error message
  instance: string;  // Unique URN for this occurrence

  // Optional standard extensions
  timestamp?: string;    // ISO 8601 timestamp
  tool?: string;         // MCP tool name

  // Error-specific extensions
  field?: string;        // For ValidationError
  invalidValue?: unknown; // For ValidationError
  endpoint?: string;     // For ApiError (sanitized)
  entityType?: string;   // For NotFoundError
  entityId?: string;     // For NotFoundError
  configKey?: string;    // For ConfigError
}
```

## Constructor Signatures

```typescript
// ValidationError
new ValidationError(
  message: string,
  field: string,
  value: unknown,
  tool?: string
)

// ApiError
new ApiError(
  message: string,
  statusCode: number,
  endpoint: string,
  details?: Record<string, unknown>,
  tool?: string
)

// SessionError
new SessionError(
  message: string,
  details?: Record<string, unknown>,
  tool?: string
)

// NotFoundError
new NotFoundError(
  message: string,
  entityType: string,
  entityId: string,
  tool?: string
)

// DatabaseError
new DatabaseError(
  message: string,
  details?: Record<string, unknown>
)

// CacheError
new CacheError(
  message: string,
  details?: Record<string, unknown>
)

// ConfigError
new ConfigError(
  message: string,
  configKey?: string,
  details?: Record<string, unknown>
)
```

## Decision Tree

```
Error occurred?
  |
  ├─ User input related?
  │   ├─ Invalid value? → ValidationError
  │   └─ Resource not exist? → NotFoundError
  |
  ├─ External API related? → ApiError
  |
  ├─ Auth/Session related? → SessionError
  |
  ├─ Database related? → DatabaseError
  |
  ├─ Cache related? → CacheError
  |
  ├─ Config related? → ConfigError
  |
  └─ Unknown/Other? → DisneyMcpError (generic)
```

## Best Practices

### DO

- ✅ Pass tool name to error constructors
- ✅ Use specific error types (not generic)
- ✅ Provide actionable error messages
- ✅ Include field names for validation errors
- ✅ Include entity context for not found errors
- ✅ Always use formatErrorResponse() in catch blocks

### DON'T

- ❌ Include sensitive data in error messages
- ❌ Use generic DisneyMcpError when specific type applies
- ❌ Forget to pass tool name
- ❌ Include stack traces in error responses
- ❌ Expose internal implementation details

## Security Sanitization

The following are automatically sanitized:

```typescript
// File paths → [path]
"/Users/cameron/secret/file.txt" → "[path]"

// Long tokens → [redacted]
"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." → "[redacted]"

// Email addresses → [email]
"user@example.com" → "[email]"

// Query parameters (in URLs)
"?token=secret&key=abc" → "?token=[redacted]&key=[redacted]"

// Large objects/arrays
{...complex object...} → "[Object]"
[1, 2, 3, ...] → "[Array of N items]"

// Long strings (>100 chars)
"very long string..." → "very long str..."
```

## Common Patterns

### Validate and Throw

```typescript
// Single validation
if (!validDestinations.includes(args.destination)) {
  throw new ValidationError(
    "Invalid destination",
    "destination",
    args.destination,
    "tool_name"
  );
}

// Multiple validations
const errors: ValidationError[] = [];
if (!args.destination) {
  errors.push(new ValidationError("Missing destination", "destination", null, "tool_name"));
}
if (!args.parkId) {
  errors.push(new ValidationError("Missing parkId", "parkId", null, "tool_name"));
}
if (errors.length > 0) {
  throw errors[0]; // Or combine into single error
}
```

### Try-Catch with Rethrow

```typescript
try {
  const result = await externalOperation();
} catch (error) {
  if (error instanceof DisneyMcpError) {
    throw error; // Already a Problem Details error
  }
  throw new ApiError(
    `External operation failed: ${(error as Error).message}`,
    500,
    endpoint,
    undefined,
    "tool_name"
  );
}
```

### Optional Operation with Fallback

```typescript
let cached;
try {
  cached = await readCache(key);
} catch (error) {
  // Cache errors are non-fatal - log and continue
  logger.warn("Cache read failed, falling back to API", error);
  cached = null;
}

const data = cached ?? await fetchFromApi();
```

## Testing Checklist

- [ ] Error has correct type URI
- [ ] Error has correct HTTP status code
- [ ] Error includes tool name
- [ ] Error detail is actionable
- [ ] Sensitive data is sanitized
- [ ] Instance URN is unique
- [ ] Timestamp is included
- [ ] Error-specific extensions are present (field, entityId, etc.)

## Quick Debugging

```bash
# Check error type
curl -s http://localhost/api/tool | jq '.type'

# Get error details
curl -s http://localhost/api/tool | jq '{type, status, detail, field}'

# Get instance URN for support
curl -s http://localhost/api/tool | jq '.instance'

# Check if error is validation related
curl -s http://localhost/api/tool | jq 'select(.type | contains("validation"))'
```

## Further Reading

- [Full RFC 9457 Implementation Docs](./rfc9457-problem-details.md)
- [Error Type URIs Reference](./error-types.md)
- [Complete Examples](./rfc9457-examples.md)
- [Migration Guide](./rfc9457-migration-guide.md)
- [RFC 9457 Specification](https://www.rfc-editor.org/rfc/rfc9457.html)
