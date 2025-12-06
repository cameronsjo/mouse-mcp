# RFC 9457 Problem Details Implementation

Complete documentation for RFC 9457 Problem Details error responses in Mouse MCP.

## Overview

Mouse MCP implements [RFC 9457: Problem Details for HTTP APIs](https://www.rfc-editor.org/rfc/rfc9457.html) for standardized, machine-readable error responses. This provides:

- Consistent error format across all MCP tools
- Machine-readable error types with URIs
- Secure error responses with automatic sanitization
- Rich context for debugging and user guidance
- Extensibility for MCP-specific metadata

## Documentation Index

### Core Documentation

1. **[RFC 9457 Problem Details](./rfc9457-problem-details.md)** - Complete specification
   - Problem Details structure and fields
   - TypeScript interfaces
   - Error class implementations
   - Security considerations
   - Best practices

2. **[Error Type URIs](./error-types.md)** - Error type reference
   - All error type URIs and descriptions
   - When to use each error type
   - HTTP status code mappings
   - Error hierarchy and selection guide
   - Security sanitization rules

3. **[Quick Reference](./rfc9457-quick-reference.md)** - Developer cheat sheet
   - Error types cheat sheet
   - Quick code examples
   - Tool handler template
   - Constructor signatures
   - Decision tree

### Implementation Guides

4. **[Migration Guide](./rfc9457-migration-guide.md)** - Step-by-step migration
   - Migration steps from legacy errors
   - File-by-file update instructions
   - Testing checklist
   - Rollback plan
   - Common issues and solutions

5. **[Examples](./rfc9457-examples.md)** - Comprehensive examples
   - 17 detailed error examples
   - Client handling patterns
   - Retry logic
   - Error logging

## Quick Start

### Installation

The implementation is in `/Users/cameron/Projects/mouse-mcp/src/shared/problem-details.ts`.

### Import

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
} from "../shared/problem-details.js";
```

### Basic Usage

```typescript
export const handler: ToolHandler = async (args) => {
  try {
    // Validate input
    if (!args.destination) {
      throw new ValidationError(
        "Missing required parameter: destination",
        "destination",
        null,
        "disney_attractions"
      );
    }

    // Your tool logic here
    const result = await processRequest(args);

    return {
      content: [{ type: "text", text: JSON.stringify(result) }]
    };
  } catch (error) {
    return formatErrorResponse(error, "disney_attractions");
  }
};
```

### Error Response Example

```json
{
  "type": "https://mouse-mcp.dev/errors/validation-error",
  "title": "Validation Failed",
  "status": 400,
  "detail": "Missing required parameter: destination",
  "instance": "urn:uuid:a3bb189e-8bf9-41c4-b5db-dbe0e0f51f6e",
  "timestamp": "2025-12-06T18:30:00.000Z",
  "tool": "disney_attractions",
  "field": "destination",
  "invalidValue": null
}
```

## Error Types

| Type | URI | Status | Use Case |
|------|-----|--------|----------|
| ValidationError | `https://mouse-mcp.dev/errors/validation-error` | 400 | Invalid input |
| SessionError | `https://mouse-mcp.dev/errors/session-error` | 401 | Auth failures |
| NotFoundError | `https://mouse-mcp.dev/errors/not-found` | 404 | Resource missing |
| ApiError | `https://mouse-mcp.dev/errors/api-error` | 502/503 | External API errors |
| DatabaseError | `https://mouse-mcp.dev/errors/database-error` | 500 | Database failures |
| CacheError | `https://mouse-mcp.dev/errors/cache-error` | 500 | Cache failures |
| ConfigError | `https://mouse-mcp.dev/errors/configuration-error` | 500 | Config issues |

See [Error Type URIs](./error-types.md) for complete reference.

## Key Features

### RFC 9457 Compliance

All error responses include the required RFC 9457 fields:

- `type` - URI identifying the error type
- `title` - Human-readable summary
- `status` - HTTP status code
- `detail` - Specific error message
- `instance` - Unique URN for this occurrence

### MCP Extensions

Additional fields for MCP context:

- `tool` - MCP tool that generated the error
- `timestamp` - ISO 8601 timestamp
- `field` - Field name (validation errors)
- `entityId` / `entityType` - Entity context (not found errors)
- `endpoint` - API endpoint (API errors, sanitized)
- `configKey` - Config key (config errors)

### Security

Automatic sanitization of:

- File paths → `[path]`
- Tokens/credentials → `[redacted]`
- Email addresses → `[email]`
- Sensitive query parameters
- Large objects/arrays
- Long strings

### Traceability

Each error gets a unique instance URN:

```
urn:uuid:a3bb189e-8bf9-41c4-b5db-dbe0e0f51f6e
```

Use this for:

- Correlation with logs
- Support requests
- Error tracking
- Debugging

## Implementation Files

### Source Code

- `/Users/cameron/Projects/mouse-mcp/src/shared/problem-details.ts` - Complete implementation (455 lines)
  - `ProblemDetails` interface
  - Error classes (DisneyMcpError, ValidationError, ApiError, etc.)
  - `formatErrorResponse()` function
  - Sanitization utilities
  - UUID generation

### Documentation

- `/Users/cameron/Projects/mouse-mcp/docs/rfc9457-problem-details.md` - Full specification
- `/Users/cameron/Projects/mouse-mcp/docs/error-types.md` - Error type reference
- `/Users/cameron/Projects/mouse-mcp/docs/rfc9457-quick-reference.md` - Developer cheat sheet
- `/Users/cameron/Projects/mouse-mcp/docs/rfc9457-migration-guide.md` - Migration instructions
- `/Users/cameron/Projects/mouse-mcp/docs/rfc9457-examples.md` - Comprehensive examples

## Migration Path

1. **Review** - Read [RFC 9457 Problem Details](./rfc9457-problem-details.md)
2. **Update Imports** - Import from `problem-details.ts`
3. **Add Tool Names** - Pass tool name to error constructors
4. **Update Handlers** - Pass tool name to `formatErrorResponse()`
5. **Add Missing Types** - Add NotFoundError and ConfigError usage
6. **Test** - Verify error responses follow RFC 9457 format

See [Migration Guide](./rfc9457-migration-guide.md) for detailed steps.

## Examples by Error Type

See [Examples](./rfc9457-examples.md) for 17 detailed examples including:

- Invalid destination ID (ValidationError)
- Missing required parameter (ValidationError)
- API service unavailable (ApiError)
- Session expired (SessionError)
- Attraction not found (NotFoundError)
- Database initialization failed (DatabaseError)
- Missing environment variable (ConfigError)
- Client handling patterns

## Best Practices

### DO

- Use specific error types (ValidationError, ApiError, etc.)
- Include tool name in all errors
- Provide actionable error messages
- Include field names for validation errors
- Include entity context for not found errors

### DON'T

- Use generic DisneyMcpError when specific type applies
- Include sensitive data (tokens, passwords, paths)
- Forget to pass tool name
- Expose internal implementation details
- Include stack traces in error responses

## Client Integration

### Parsing Error Responses

```typescript
const problem: ProblemDetails = JSON.parse(response.content[0].text);

// Check error type
if (problem.type === "https://mouse-mcp.dev/errors/validation-error") {
  // Highlight invalid field
  highlightField(problem.field);
}

// Get instance URN for support
console.log("Error ID:", problem.instance);
```

### Error Type Switching

```typescript
switch (problem.type) {
  case "https://mouse-mcp.dev/errors/validation-error":
    handleValidationError(problem);
    break;
  case "https://mouse-mcp.dev/errors/session-error":
    await refreshSession();
    retry();
    break;
  case "https://mouse-mcp.dev/errors/api-error":
    if (problem.status === 503) {
      retryWithBackoff();
    }
    break;
  default:
    showGenericError(problem.detail);
}
```

See [Examples](./rfc9457-examples.md) for complete client handling patterns.

## Testing

### Verify Error Format

```typescript
const response = formatErrorResponse(
  new ValidationError("test", "field", "value", "tool_name")
);

const problem = JSON.parse(response.content[0].text);

expect(problem.type).toBe("https://mouse-mcp.dev/errors/validation-error");
expect(problem.status).toBe(400);
expect(problem.field).toBe("field");
expect(problem.tool).toBe("tool_name");
expect(problem.instance).toMatch(/^urn:uuid:[0-9a-f-]{36}$/);
```

### Verify Sanitization

```typescript
const error = new ApiError(
  "test",
  401,
  "https://api.example.com?token=secret123",
  undefined,
  "tool_name"
);

const response = formatErrorResponse(error);
const problem = JSON.parse(response.content[0].text);

expect(problem.endpoint).toContain("token=[redacted]");
```

## Resources

### Internal Documentation

- [Full RFC 9457 Specification](./rfc9457-problem-details.md)
- [Error Type Reference](./error-types.md)
- [Quick Reference](./rfc9457-quick-reference.md)
- [Migration Guide](./rfc9457-migration-guide.md)
- [Comprehensive Examples](./rfc9457-examples.md)

### External References

- [RFC 9457: Problem Details for HTTP APIs](https://www.rfc-editor.org/rfc/rfc9457.html)
- [RFC 3986: URI Generic Syntax](https://www.rfc-editor.org/rfc/rfc3986.html)
- [RFC 2119: Key Words for RFCs](https://www.rfc-editor.org/rfc/rfc2119.html)
- [IANA Problem Types Registry](https://www.iana.org/assignments/http-problem-types/)

## Support

For questions or issues:

1. Check [Quick Reference](./rfc9457-quick-reference.md) for common patterns
2. Review [Examples](./rfc9457-examples.md) for similar use cases
3. Consult [Error Type URIs](./error-types.md) for error type selection
4. Follow [Migration Guide](./rfc9457-migration-guide.md) for implementation steps

## Version History

- **v1.0.0** (2025-12-06) - Initial RFC 9457 implementation
  - Complete Problem Details specification
  - 8 error types with URIs
  - Security sanitization
  - Comprehensive documentation
  - Migration guide
  - 17 detailed examples
