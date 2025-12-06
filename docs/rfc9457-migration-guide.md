# RFC 9457 Migration Guide

This guide provides step-by-step instructions for migrating the Mouse MCP server from legacy error handling to RFC 9457 Problem Details.

## Overview

The migration involves:

1. Updating error class implementations
2. Replacing the error formatting function
3. Updating tool error handling
4. Adding missing error classes
5. Testing the migration

## Prerequisites

- Understanding of RFC 9457 Problem Details format
- Familiarity with Mouse MCP error handling
- Read [rfc9457-problem-details.md](./rfc9457-problem-details.md)
- Read [error-types.md](./error-types.md)

## Migration Steps

### Step 1: Review the New Implementation

The new RFC 9457 implementation is in:

- `/Users/cameron/Projects/mouse-mcp/src/shared/problem-details.ts`

Review this file to understand:

- New `ProblemDetails` interface
- Updated error class implementations
- New `formatErrorResponse()` function
- Sanitization functions

### Step 2: Update Imports

Update imports across the codebase to use the new implementation.

#### Before

```typescript
import { formatErrorResponse, ValidationError } from "../shared/index.js";
```

#### After

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

### Step 3: Replace Error Module

Replace the old error module with the new one:

```bash
# Backup the old implementation
mv src/shared/errors.ts src/shared/errors.ts.bak

# Update shared/index.ts to export from problem-details.ts
```

Update `/Users/cameron/Projects/mouse-mcp/src/shared/index.ts`:

```typescript
// Remove old error exports
// export * from "./errors.js";

// Add new error exports
export * from "./problem-details.js";
```

### Step 4: Update Error Class Usage

#### ValidationError

**Before**:

```typescript
throw new ValidationError(
  "Invalid destination ID. Must be 'wdw' or 'dlr'",
  "destination",
  args.destination
);
```

**After** (add tool parameter):

```typescript
throw new ValidationError(
  "Invalid destination ID. Must be 'wdw' or 'dlr'",
  "destination",
  args.destination,
  "disney_attractions"  // Add tool name
);
```

#### ApiError

**Before**:

```typescript
throw new ApiError(
  "Disney API error: 503",
  503,
  endpoint
);
```

**After** (add tool parameter):

```typescript
throw new ApiError(
  "Disney API error: 503",
  503,
  endpoint,
  undefined,  // details (optional)
  "disney_attractions"  // Add tool name
);
```

#### SessionError

**Before**:

```typescript
throw new SessionError("No valid session");
```

**After** (add tool parameter):

```typescript
throw new SessionError(
  "No valid session",
  undefined,  // details (optional)
  "disney_attractions"  // Add tool name
);
```

### Step 5: Add Missing Error Classes

#### NotFoundError

Add usage for entity lookups that return no results:

```typescript
// Example: In disney_entity tool
const entity = await getEntity(entityId);
if (!entity) {
  throw new NotFoundError(
    `Entity with ID '${entityId}' not found`,
    "attraction",  // entity type
    entityId,      // entity ID
    "disney_entity"  // tool name
  );
}
```

#### ConfigError

Add usage for configuration failures:

```typescript
// Example: In config validation
const embeddingProvider = process.env.MOUSEMCP_EMBEDDING_PROVIDER;
if (!embeddingProvider) {
  throw new ConfigError(
    "Required environment variable MOUSEMCP_EMBEDDING_PROVIDER not set",
    "MOUSEMCP_EMBEDDING_PROVIDER"  // config key
  );
}
```

### Step 6: Update Tool Error Handlers

Update all tools to pass the tool name to `formatErrorResponse()`:

**Before**:

```typescript
export const handler: ToolHandler = async (args) => {
  try {
    // Tool logic
    return { content: [{ type: "text", text: result }] };
  } catch (error) {
    return formatErrorResponse(error);
  }
};
```

**After**:

```typescript
export const handler: ToolHandler = async (args) => {
  try {
    // Tool logic
    return { content: [{ type: "text", text: result }] };
  } catch (error) {
    return formatErrorResponse(error, "disney_attractions");  // Add tool name
  }
};
```

### Step 7: Update Files by Tool

Update each tool file to use the new error handling:

#### disney_attractions.ts

```typescript
export const handler: ToolHandler = async (args) => {
  try {
    // Validate destination
    if (!["wdw", "dlr"].includes(args.destination)) {
      throw new ValidationError(
        "Invalid destination ID. Must be 'wdw' or 'dlr'",
        "destination",
        args.destination,
        "disney_attractions"
      );
    }

    // Get session
    const session = await sessionManager.getSession(args.destination);
    if (!session) {
      throw new SessionError(
        "No valid Disney session",
        undefined,
        "disney_attractions"
      );
    }

    // Make API request
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

    // Return results
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  } catch (error) {
    return formatErrorResponse(error, "disney_attractions");
  }
};
```

#### disney_entity.ts

```typescript
export const handler: ToolHandler = async (args) => {
  try {
    const entity = await getEntity(args.entityId);

    if (!entity) {
      throw new NotFoundError(
        `Entity with ID '${args.entityId}' not found`,
        args.entityType,
        args.entityId,
        "disney_entity"
      );
    }

    return { content: [{ type: "text", text: JSON.stringify(entity) }] };
  } catch (error) {
    return formatErrorResponse(error, "disney_entity");
  }
};
```

#### disney_dining.ts

```typescript
export const handler: ToolHandler = async (args) => {
  try {
    // Validation
    if (!["wdw", "dlr"].includes(args.destination)) {
      throw new ValidationError(
        "Invalid destination ID. Must be 'wdw' or 'dlr'",
        "destination",
        args.destination,
        "disney_dining"
      );
    }

    // Session check
    const session = await sessionManager.getSession(args.destination);
    if (!session) {
      throw new SessionError(
        "No valid Disney session",
        undefined,
        "disney_dining"
      );
    }

    // API request
    const response = await fetch(endpoint);
    if (!response.ok) {
      throw new ApiError(
        `Disney API returned ${response.status}`,
        response.status,
        endpoint,
        undefined,
        "disney_dining"
      );
    }

    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  } catch (error) {
    return formatErrorResponse(error, "disney_dining");
  }
};
```

#### disney_sync.ts

```typescript
export const handler: ToolHandler = async (args) => {
  try {
    // Database operations
    try {
      await saveToDatabase(data);
    } catch (error) {
      throw new DatabaseError(
        "Failed to save sync data to database",
        { error: (error as Error).message }
      );
    }

    return { content: [{ type: "text", text: "Sync complete" }] };
  } catch (error) {
    return formatErrorResponse(error, "disney_sync");
  }
};
```

### Step 8: Update Database Initialization

Update database initialization to use ConfigError:

```typescript
// In src/db/database.ts
try {
  const dbPath = process.env.MOUSEMCP_DATABASE_PATH;
  if (!dbPath) {
    throw new ConfigError(
      "Required environment variable MOUSEMCP_DATABASE_PATH not set",
      "MOUSEMCP_DATABASE_PATH"
    );
  }

  // Initialize database
} catch (error) {
  if (error instanceof DisneyMcpError) {
    throw error;
  }
  throw new DatabaseError(
    `Failed to initialize database: ${(error as Error).message}`,
    { originalError: error }
  );
}
```

### Step 9: Update Session Manager

Update session manager to use SessionError consistently:

```typescript
// In src/clients/session-manager.ts
async getSession(destination: DestinationId): Promise<Session | null> {
  try {
    // Session logic
  } catch (error) {
    throw new SessionError(
      "Failed to retrieve session",
      { destination, error: (error as Error).message }
    );
  }
}
```

### Step 10: Update Server Error Handling

Update the server to handle Problem Details errors:

```typescript
// In src/server.ts
this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  logger.info("Tool invocation", { tool: name });

  const tool = getTool(name);
  if (!tool) {
    logger.warn("Unknown tool requested", { tool: name });
    return formatErrorResponse(
      new NotFoundError("Tool not found", "tool", name),
      name
    ) as { content: Array<{ type: "text"; text: string }> };
  }

  try {
    const result = await tool.handler(args ?? {});
    logger.debug("Tool completed", { tool: name });
    return result as { content: Array<{ type: "text"; text: string }> };
  } catch (error) {
    logger.error("Tool execution failed", error, { tool: name });
    return formatErrorResponse(error, name) as {
      content: Array<{ type: "text"; text: string }>;
    };
  }
});
```

### Step 11: Testing

Create test cases for each error type:

```typescript
// test/errors.test.ts
import { describe, it, expect } from "vitest";
import {
  ValidationError,
  ApiError,
  SessionError,
  NotFoundError,
  DatabaseError,
  CacheError,
  ConfigError,
  formatErrorResponse,
} from "../src/shared/problem-details.js";

describe("RFC 9457 Problem Details", () => {
  it("should format ValidationError correctly", () => {
    const error = new ValidationError(
      "Invalid value",
      "field",
      "invalid",
      "test_tool"
    );
    const response = formatErrorResponse(error, "test_tool");

    const problem = JSON.parse(response.content[0].text);
    expect(problem.type).toBe("https://mouse-mcp.dev/errors/validation-error");
    expect(problem.title).toBe("Validation Failed");
    expect(problem.status).toBe(400);
    expect(problem.field).toBe("field");
    expect(problem.tool).toBe("test_tool");
  });

  it("should format ApiError correctly", () => {
    const error = new ApiError(
      "API error",
      503,
      "https://api.example.com/endpoint",
      undefined,
      "test_tool"
    );
    const response = formatErrorResponse(error, "test_tool");

    const problem = JSON.parse(response.content[0].text);
    expect(problem.type).toBe("https://mouse-mcp.dev/errors/api-error");
    expect(problem.title).toBe("External API Error");
    expect(problem.status).toBe(503);
    expect(problem.endpoint).toBe("https://api.example.com/endpoint");
  });

  it("should sanitize sensitive query parameters", () => {
    const error = new ApiError(
      "API error",
      401,
      "https://api.example.com/endpoint?token=secret123&key=abc",
      undefined,
      "test_tool"
    );
    const response = formatErrorResponse(error, "test_tool");

    const problem = JSON.parse(response.content[0].text);
    expect(problem.endpoint).toContain("token=[redacted]");
    expect(problem.endpoint).toContain("key=[redacted]");
  });

  it("should format NotFoundError correctly", () => {
    const error = new NotFoundError(
      "Entity not found",
      "attraction",
      "12345",
      "test_tool"
    );
    const response = formatErrorResponse(error, "test_tool");

    const problem = JSON.parse(response.content[0].text);
    expect(problem.type).toBe("https://mouse-mcp.dev/errors/not-found");
    expect(problem.status).toBe(404);
    expect(problem.entityType).toBe("attraction");
    expect(problem.entityId).toBe("12345");
  });

  it("should include instance URN", () => {
    const error = new ValidationError("test", "field", "value");
    const response = formatErrorResponse(error);

    const problem = JSON.parse(response.content[0].text);
    expect(problem.instance).toMatch(/^urn:uuid:[0-9a-f-]{36}$/);
  });

  it("should include timestamp", () => {
    const error = new ValidationError("test", "field", "value");
    const response = formatErrorResponse(error);

    const problem = JSON.parse(response.content[0].text);
    expect(problem.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});
```

Run tests:

```bash
npm run test
```

### Step 12: Update Documentation

Update the following documentation files:

1. **README.md**: Add link to RFC 9457 implementation
2. **docs/development.md**: Update error handling examples
3. **docs/tools.md**: Update error response examples
4. **API documentation**: Update error response schemas

### Step 13: Clean Up

After successful migration and testing:

```bash
# Remove backup
rm src/shared/errors.ts.bak

# Verify no references to old error module
grep -r "from.*errors.js" src/
```

## Verification Checklist

- [ ] All error classes updated with tool parameter
- [ ] All tools pass tool name to formatErrorResponse()
- [ ] NotFoundError added for entity lookups
- [ ] ConfigError added for configuration validation
- [ ] Tests pass for all error types
- [ ] Error responses follow RFC 9457 format
- [ ] Sensitive data is sanitized in error responses
- [ ] Instance URN is generated for each error
- [ ] Timestamp is included in all errors
- [ ] Documentation is updated
- [ ] Old error module is removed

## Rollback Plan

If issues are discovered after migration:

1. Restore backup: `mv src/shared/errors.ts.bak src/shared/errors.ts`
2. Revert shared/index.ts exports
3. Revert tool changes
4. Run tests to verify rollback

## Common Issues and Solutions

### Issue: Tool name not appearing in errors

**Solution**: Ensure tool name is passed to both error constructor and formatErrorResponse():

```typescript
throw new ValidationError(message, field, value, "tool_name");
// AND
return formatErrorResponse(error, "tool_name");
```

### Issue: Sensitive data appearing in error responses

**Solution**: Check sanitization functions in problem-details.ts. Add additional patterns if needed.

### Issue: Tests failing

**Solution**: Update test expectations to match RFC 9457 format. Check that error types, titles, and status codes match the registry.

## References

- [RFC 9457: Problem Details for HTTP APIs](https://www.rfc-editor.org/rfc/rfc9457.html)
- [Mouse MCP RFC 9457 Implementation](./rfc9457-problem-details.md)
- [Error Type URIs](./error-types.md)
