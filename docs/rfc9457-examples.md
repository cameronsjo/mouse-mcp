# RFC 9457 Error Response Examples

This document provides comprehensive examples of RFC 9457 Problem Details error responses for all error types in the Mouse MCP server.

## Example Format

Each example includes:

1. **Scenario**: Description of when this error occurs
2. **Code**: TypeScript code that throws the error
3. **Response**: The RFC 9457 Problem Details JSON response
4. **Client Handling**: How a client should handle this error

---

## Validation Errors

### Example 1: Invalid Destination ID

**Scenario**: User provides an invalid destination ID to disney_attractions tool.

**Code**:

```typescript
// In disney_attractions tool handler
if (!["wdw", "dlr"].includes(args.destination)) {
  throw new ValidationError(
    "Invalid destination ID. Must be 'wdw' or 'dlr'",
    "destination",
    args.destination,
    "disney_attractions"
  );
}
```

**Response**:

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

**Client Handling**:

- Display error message to user
- Highlight the "destination" field
- Show valid options: "wdw" or "dlr"
- Allow user to correct and retry

---

### Example 2: Missing Required Parameter

**Scenario**: User doesn't provide required destination parameter.

**Code**:

```typescript
if (!args.destination) {
  throw new ValidationError(
    "Missing required parameter: destination",
    "destination",
    null,
    "disney_attractions"
  );
}
```

**Response**:

```json
{
  "type": "https://mouse-mcp.dev/errors/validation-error",
  "title": "Validation Failed",
  "status": 400,
  "detail": "Missing required parameter: destination",
  "instance": "urn:uuid:b4cc290f-9cg0-52d5-c6ec-ecf1f1g62g7f",
  "timestamp": "2025-12-06T18:31:00.000Z",
  "tool": "disney_attractions",
  "field": "destination",
  "invalidValue": null
}
```

**Client Handling**:

- Prompt user to provide the "destination" parameter
- Show parameter description and valid values
- Don't allow submission until required field is filled

---

### Example 3: Invalid Height Requirement

**Scenario**: User provides invalid height requirement filter.

**Code**:

```typescript
if (args.filters?.maxHeightRequirement && args.filters.maxHeightRequirement < 0) {
  throw new ValidationError(
    "Height requirement must be a positive number",
    "filters.maxHeightRequirement",
    args.filters.maxHeightRequirement,
    "disney_attractions"
  );
}
```

**Response**:

```json
{
  "type": "https://mouse-mcp.dev/errors/validation-error",
  "title": "Validation Failed",
  "status": 400,
  "detail": "Height requirement must be a positive number",
  "instance": "urn:uuid:c5dd391g-0dh1-63e6-d7fd-fdf2g2h73h8g",
  "timestamp": "2025-12-06T18:32:00.000Z",
  "tool": "disney_attractions",
  "field": "filters.maxHeightRequirement",
  "invalidValue": -5
}
```

**Client Handling**:

- Display error on the height requirement field
- Show constraint: "must be positive"
- Clear invalid value or set to default

---

## API Errors

### Example 4: Disney API Service Unavailable

**Scenario**: Disney API returns 503 Service Unavailable.

**Code**:

```typescript
const response = await fetch(endpoint);
if (!response.ok) {
  throw new ApiError(
    `Disney API returned ${response.status}: Service temporarily unavailable`,
    response.status,
    endpoint,
    undefined,
    "disney_attractions"
  );
}
```

**Response**:

```json
{
  "type": "https://mouse-mcp.dev/errors/api-error",
  "title": "External API Error",
  "status": 503,
  "detail": "Disney API returned 503: Service temporarily unavailable",
  "instance": "urn:uuid:7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "timestamp": "2025-12-06T18:33:00.000Z",
  "tool": "disney_attractions",
  "endpoint": "https://api.wdpro.disney.go.com/facility-service/attractions"
}
```

**Client Handling**:

- Display "Service temporarily unavailable" message
- Suggest retrying in a few minutes
- Implement exponential backoff for retries
- Log endpoint for debugging

---

### Example 5: Disney API Rate Limited

**Scenario**: Disney API returns 429 Too Many Requests.

**Code**:

```typescript
if (response.status === 429) {
  throw new ApiError(
    "Disney API rate limit exceeded. Please try again later",
    429,
    endpoint,
    { retryAfter: response.headers.get("Retry-After") },
    "disney_attractions"
  );
}
```

**Response**:

```json
{
  "type": "https://mouse-mcp.dev/errors/api-error",
  "title": "External API Error",
  "status": 502,
  "detail": "Disney API rate limit exceeded. Please try again later",
  "instance": "urn:uuid:8d0f7780-8536-51ef-055c-f18g2f91f8a8",
  "timestamp": "2025-12-06T18:34:00.000Z",
  "tool": "disney_attractions",
  "endpoint": "https://api.wdpro.disney.go.com/facility-service/attractions",
  "retryAfter": "60"
}
```

**Client Handling**:

- Display rate limit message
- Show countdown timer based on "retryAfter" value
- Automatically retry after wait period
- Consider implementing request queuing

---

### Example 6: API Endpoint with Sanitized Credentials

**Scenario**: API request with sensitive query parameters fails.

**Code**:

```typescript
const endpoint = "https://api.example.com/data?token=secret123&key=abc456";
throw new ApiError(
  "API request failed",
  401,
  endpoint,
  undefined,
  "disney_sync"
);
```

**Response**:

```json
{
  "type": "https://mouse-mcp.dev/errors/api-error",
  "title": "External API Error",
  "status": 502,
  "detail": "API request failed",
  "instance": "urn:uuid:9e1g8891-9647-62fg-166d-g29h3g02g9b9",
  "timestamp": "2025-12-06T18:35:00.000Z",
  "tool": "disney_sync",
  "endpoint": "https://api.example.com/data?token=[redacted]&key=[redacted]"
}
```

**Client Handling**:

- Note that sensitive parameters are redacted
- Check authentication credentials
- Verify API key validity
- Don't expose redacted values in UI

---

## Session Errors

### Example 7: No Valid Session

**Scenario**: No Disney session available when making authenticated request.

**Code**:

```typescript
const session = await sessionManager.getSession(destination);
if (!session) {
  throw new SessionError(
    "No valid Disney session. Session may have expired or authentication failed",
    undefined,
    "disney_attractions"
  );
}
```

**Response**:

```json
{
  "type": "https://mouse-mcp.dev/errors/session-error",
  "title": "Session Error",
  "status": 401,
  "detail": "No valid Disney session. Session may have expired or authentication failed",
  "instance": "urn:uuid:3f7e4c8a-9d2b-4e3a-8f1c-2b5d9e6a7c8f",
  "timestamp": "2025-12-06T18:36:00.000Z",
  "tool": "disney_attractions"
}
```

**Client Handling**:

- Prompt user to authenticate
- Trigger session refresh/login flow
- Clear cached session data
- Retry request after successful authentication

---

### Example 8: Session Creation Failed

**Scenario**: Browser automation fails to create Disney session.

**Code**:

```typescript
try {
  await browser.goto("https://disneyworld.disney.go.com");
} catch (error) {
  throw new SessionError(
    "Failed to create Disney session: browser automation error",
    { error: (error as Error).message },
    "disney_sync"
  );
}
```

**Response**:

```json
{
  "type": "https://mouse-mcp.dev/errors/session-error",
  "title": "Session Error",
  "status": 401,
  "detail": "Failed to create Disney session: browser automation error",
  "instance": "urn:uuid:0f2h9902-0758-73gh-277e-h30i4h13h0c0",
  "timestamp": "2025-12-06T18:37:00.000Z",
  "tool": "disney_sync"
}
```

**Client Handling**:

- Display session creation error
- Check if browser dependencies are installed
- Verify network connectivity
- Suggest manual session creation workaround

---

## Not Found Errors

### Example 9: Attraction Not Found

**Scenario**: User requests attraction that doesn't exist.

**Code**:

```typescript
const attraction = await getAttraction(entityId);
if (!attraction) {
  throw new NotFoundError(
    `Attraction with ID '${entityId}' not found at ${destinationName}`,
    "attraction",
    entityId,
    "disney_entity"
  );
}
```

**Response**:

```json
{
  "type": "https://mouse-mcp.dev/errors/not-found",
  "title": "Resource Not Found",
  "status": 404,
  "detail": "Attraction with ID '99999999' not found at Walt Disney World",
  "instance": "urn:uuid:1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d",
  "timestamp": "2025-12-06T18:38:00.000Z",
  "tool": "disney_entity",
  "entityType": "attraction",
  "entityId": "99999999"
}
```

**Client Handling**:

- Display "not found" message
- Suggest searching for similar attractions
- Verify entity ID is correct
- Provide link to browse all attractions

---

### Example 10: Park Not Found

**Scenario**: User requests park that doesn't exist.

**Code**:

```typescript
const park = parks.find((p) => p.id === parkId);
if (!park) {
  throw new NotFoundError(
    `Park with ID '${parkId}' not found at ${destinationName}`,
    "park",
    parkId,
    "disney_destinations"
  );
}
```

**Response**:

```json
{
  "type": "https://mouse-mcp.dev/errors/not-found",
  "title": "Resource Not Found",
  "status": 404,
  "detail": "Park with ID '12345' not found at Walt Disney World",
  "instance": "urn:uuid:2b3c4d5e-6f7a-8b9c-0d1e-2f3a4b5c6d7e",
  "timestamp": "2025-12-06T18:39:00.000Z",
  "tool": "disney_destinations",
  "entityType": "park",
  "entityId": "12345"
}
```

**Client Handling**:

- Display park not found message
- Show list of available parks
- Suggest using disney_destinations to get valid park IDs
- Verify destination is correct

---

### Example 11: Tool Not Found

**Scenario**: User requests unknown MCP tool.

**Code**:

```typescript
const tool = getTool(name);
if (!tool) {
  throw new NotFoundError(
    `Tool '${name}' not found`,
    "tool",
    name
  );
}
```

**Response**:

```json
{
  "type": "https://mouse-mcp.dev/errors/not-found",
  "title": "Resource Not Found",
  "status": 404,
  "detail": "Tool 'disney_invalid_tool' not found",
  "instance": "urn:uuid:3c4d5e6f-7a8b-9c0d-1e2f-3a4b5c6d7e8f",
  "timestamp": "2025-12-06T18:40:00.000Z",
  "entityType": "tool",
  "entityId": "disney_invalid_tool"
}
```

**Client Handling**:

- Display tool not found message
- Show list of available tools
- Check for typos in tool name
- Verify MCP server version

---

## Database Errors

### Example 12: Database Initialization Failed

**Scenario**: Database file cannot be opened or created.

**Code**:

```typescript
try {
  await initializeDatabase(dbPath);
} catch (error) {
  throw new DatabaseError(
    `Failed to initialize database: ${(error as Error).message}`,
    { path: dbPath }
  );
}
```

**Response**:

```json
{
  "type": "https://mouse-mcp.dev/errors/database-error",
  "title": "Database Error",
  "status": 500,
  "detail": "Failed to initialize database: unable to open database file",
  "instance": "urn:uuid:8e7d6c5b-4a3f-2e1d-0c9b-8a7f6e5d4c3b",
  "timestamp": "2025-12-06T18:41:00.000Z"
}
```

**Client Handling**:

- Display database error message
- Check if database directory exists and is writable
- Verify disk space available
- Suggest checking MOUSEMCP_DATABASE_PATH configuration

---

### Example 13: Query Execution Failed

**Scenario**: SQL query fails during execution.

**Code**:

```typescript
try {
  const result = db.exec(query);
} catch (error) {
  throw new DatabaseError(
    "Failed to execute query",
    { query, error: (error as Error).message }
  );
}
```

**Response**:

```json
{
  "type": "https://mouse-mcp.dev/errors/database-error",
  "title": "Database Error",
  "status": 500,
  "detail": "Failed to execute query",
  "instance": "urn:uuid:9f8e7d6c-5b4a-3f2e-1d0c-9b8a7f6e5d4c",
  "timestamp": "2025-12-06T18:42:00.000Z"
}
```

**Client Handling**:

- Display generic database error
- Don't expose query details to end user
- Log instance URN for support
- Consider database repair/rebuild

---

## Cache Errors

### Example 14: Cache Read Failed

**Scenario**: Cache file is corrupted or unreadable.

**Code**:

```typescript
try {
  const cached = await readCache(key);
} catch (error) {
  throw new CacheError(
    "Failed to read from cache: cache file corrupted",
    { key, error: (error as Error).message }
  );
}
```

**Response**:

```json
{
  "type": "https://mouse-mcp.dev/errors/cache-error",
  "title": "Cache Error",
  "status": 500,
  "detail": "Failed to read from cache: cache file corrupted",
  "instance": "urn:uuid:2b3c4d5e-6f7a-8b9c-0d1e-2f3a4b5c6d7e",
  "timestamp": "2025-12-06T18:43:00.000Z"
}
```

**Client Handling**:

- Log cache error
- Fall back to fetching from original source
- Consider clearing corrupted cache
- Most cache errors are non-fatal

---

## Configuration Errors

### Example 15: Missing Environment Variable

**Scenario**: Required environment variable is not set.

**Code**:

```typescript
const embeddingProvider = process.env.MOUSEMCP_EMBEDDING_PROVIDER;
if (!embeddingProvider) {
  throw new ConfigError(
    "Required environment variable MOUSEMCP_EMBEDDING_PROVIDER not set",
    "MOUSEMCP_EMBEDDING_PROVIDER"
  );
}
```

**Response**:

```json
{
  "type": "https://mouse-mcp.dev/errors/configuration-error",
  "title": "Configuration Error",
  "status": 500,
  "detail": "Required environment variable MOUSEMCP_EMBEDDING_PROVIDER not set",
  "instance": "urn:uuid:9f8e7d6c-5b4a-3f2e-1d0c-9b8a7f6e5d4c",
  "timestamp": "2025-12-06T18:44:00.000Z",
  "configKey": "MOUSEMCP_EMBEDDING_PROVIDER"
}
```

**Client Handling**:

- Display configuration error
- Guide user to set MOUSEMCP_EMBEDDING_PROVIDER
- Show example configuration
- Link to configuration documentation

---

### Example 16: Invalid Configuration Value

**Scenario**: Environment variable has invalid value.

**Code**:

```typescript
const provider = process.env.MOUSEMCP_EMBEDDING_PROVIDER;
if (!["openai", "transformers"].includes(provider)) {
  throw new ConfigError(
    `Invalid embedding provider: ${provider}. Must be 'openai' or 'transformers'`,
    "MOUSEMCP_EMBEDDING_PROVIDER"
  );
}
```

**Response**:

```json
{
  "type": "https://mouse-mcp.dev/errors/configuration-error",
  "title": "Configuration Error",
  "status": 500,
  "detail": "Invalid embedding provider: custom. Must be 'openai' or 'transformers'",
  "instance": "urn:uuid:0g9f8e7d-6c5b-4a3f-2e1d-0c9b8a7f6e5d",
  "timestamp": "2025-12-06T18:45:00.000Z",
  "configKey": "MOUSEMCP_EMBEDDING_PROVIDER"
}
```

**Client Handling**:

- Display configuration error with valid options
- Update configuration to valid value
- Show current value (if not sensitive)
- Restart server after configuration fix

---

## Generic Errors

### Example 17: Unknown Error

**Scenario**: Unexpected error that doesn't fit other categories.

**Code**:

```typescript
try {
  // Some operation
} catch (error) {
  // Falls through to generic error handling
  return formatErrorResponse(error, "disney_sync");
}
```

**Response**:

```json
{
  "type": "about:blank",
  "title": "An error occurred",
  "status": 500,
  "detail": "An unexpected error occurred",
  "instance": "urn:uuid:5c6d7e8f-9a0b-1c2d-3e4f-5a6b7c8d9e0f",
  "timestamp": "2025-12-06T18:46:00.000Z",
  "tool": "disney_sync"
}
```

**Client Handling**:

- Display generic error message
- Log instance URN for support
- Suggest retrying
- Report to error tracking service

---

## Client Error Handling Patterns

### Pattern 1: Error Type Switching

```typescript
async function handleToolCall(tool: string, args: object) {
  try {
    const response = await callMcpTool(tool, args);
    return response;
  } catch (error) {
    const problem = JSON.parse(error.message);

    switch (problem.type) {
      case "https://mouse-mcp.dev/errors/validation-error":
        // Highlight invalid field
        highlightField(problem.field);
        showError(`Invalid ${problem.field}: ${problem.detail}`);
        break;

      case "https://mouse-mcp.dev/errors/session-error":
        // Trigger re-authentication
        await refreshSession();
        // Retry request
        return handleToolCall(tool, args);

      case "https://mouse-mcp.dev/errors/api-error":
        if (problem.status === 503) {
          // Retry with exponential backoff
          return retryWithBackoff(() => callMcpTool(tool, args));
        }
        break;

      case "https://mouse-mcp.dev/errors/not-found":
        // Show not found UI
        showNotFound(problem.entityType, problem.entityId);
        break;

      default:
        // Generic error handling
        showError(problem.detail);
        logError(problem.instance, problem);
    }
  }
}
```

### Pattern 2: Retry Logic

```typescript
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 3
): Promise<T> {
  let lastError: any;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      const problem = JSON.parse(error.message);
      lastError = problem;

      // Only retry on specific error types
      if (
        problem.type === "https://mouse-mcp.dev/errors/api-error" &&
        problem.status === 503
      ) {
        const delay = Math.pow(2, i) * 1000; // Exponential backoff
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      // Don't retry on other error types
      throw error;
    }
  }

  throw lastError;
}
```

### Pattern 3: Error Logging

```typescript
function logProblemDetails(problem: ProblemDetails) {
  console.error("MCP Error:", {
    type: problem.type,
    title: problem.title,
    status: problem.status,
    detail: problem.detail,
    instance: problem.instance,
    timestamp: problem.timestamp,
    tool: problem.tool,
    // Additional context
    entityType: problem.entityType,
    entityId: problem.entityId,
    field: problem.field,
  });

  // Send to error tracking service
  if (errorTracker) {
    errorTracker.captureError(problem.instance, {
      type: problem.type,
      message: problem.detail,
      metadata: problem,
    });
  }
}
```

## References

- [RFC 9457 Problem Details Implementation](./rfc9457-problem-details.md)
- [Error Type URIs](./error-types.md)
- [Migration Guide](./rfc9457-migration-guide.md)
