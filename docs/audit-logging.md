# Audit Logging

## Overview

The mouse-mcp server implements comprehensive audit logging for all MCP tool invocations. Audit logs capture execution metadata with automatic PII sanitization and timing metrics.

## Implementation

### Architecture

Audit logging is implemented using a wrapper pattern:

- **Location**: `/src/shared/audit-logger.ts`
- **Integration**: Applied in `/src/server.ts` at the MCP request handler level
- **Pattern**: Non-invasive wrapper around tool handlers using `withAuditLogging()`

### What Gets Logged

For every tool invocation, audit logs capture:

1. **Tool Invocation Start**:
   - Tool name
   - Timestamp (UTC, ISO 8601 format)
   - Input parameters (sanitized)

2. **Tool Invocation Completion**:
   - Tool name
   - Timestamp (UTC, ISO 8601 format)
   - Execution duration (milliseconds)
   - Status: `success` or `error`
   - Error details (if failed, sanitized)

### Log Levels

- **INFO**: Successful tool invocations (start and completion)
- **ERROR**: Failed tool invocations with error details

### PII Sanitization

All logged data is automatically sanitized using the existing PII sanitizer (`/src/shared/pii-sanitizer.ts`).

**Patterns detected and redacted**:

- Email addresses → `[REDACTED_EMAIL]`
- Phone numbers → `[REDACTED_PHONE]`
- Social Security Numbers → `[REDACTED_SSN]`
- Credit card numbers → `[REDACTED_CREDIT_CARD]`
- IP addresses → `[REDACTED_IP_ADDRESS]`
- API keys/tokens → `[REDACTED_API_KEY]`
- ZIP codes (context-aware) → `[REDACTED_ZIP_CODE]`

**Sanitization applies to**:

- Input parameters (tool arguments)
- Error messages
- All nested object values (recursive)

## Log Output

### Structured JSON Logs (stderr)

```json
{
  "timestamp": "2025-12-07T12:34:56.789Z",
  "level": "INFO",
  "context": "Audit",
  "message": "Tool invocation started",
  "data": {
    "tool": "search",
    "timestamp": "2025-12-07T12:34:56.789Z",
    "args": {
      "query": "Space Mountain",
      "destination": "wdw"
    }
  }
}

{
  "timestamp": "2025-12-07T12:34:57.234Z",
  "level": "INFO",
  "context": "Audit",
  "message": "Tool invocation completed",
  "data": {
    "tool": "search",
    "timestamp": "2025-12-07T12:34:56.789Z",
    "durationMs": 445,
    "status": "success"
  }
}
```

### Human-Readable File Logs (.logs/)

```text
[2025-12-07T12:34:56.789Z] INFO  [Audit] Tool invocation started {"tool":"search","timestamp":"2025-12-07T12:34:56.789Z","args":{"query":"Space Mountain","destination":"wdw"}}
[2025-12-07T12:34:57.234Z] INFO  [Audit] Tool invocation completed {"tool":"search","timestamp":"2025-12-07T12:34:56.789Z","durationMs":445,"status":"success"}
```

### Error Logging Example

```json
{
  "timestamp": "2025-12-07T12:35:10.456Z",
  "level": "ERROR",
  "context": "Audit",
  "message": "Tool invocation failed",
  "data": {
    "tool": "sync",
    "timestamp": "2025-12-07T12:35:08.123Z",
    "durationMs": 2333,
    "status": "error",
    "errorMessage": "Failed to fetch data from API",
    "errorName": "ApiError"
  }
}
```

## Integration Points

### Server Integration

In `/src/server.ts`, the CallToolRequestSchema handler wraps tool handlers:

```typescript
const auditedHandler = withAuditLogging(name, tool.handler);
const result = await auditedHandler(args ?? {});
```

This ensures:

- All tool invocations are audited
- No changes required to individual tool implementations
- Consistent audit logging across all tools

### Observability Integration

Audit logs integrate with the existing observability stack:

- **OpenTelemetry**: Trace/span IDs automatically included in log entries
- **Sentry**: Error tracking remains separate (for alerting)
- **File Logging**: Daily rotated logs in `.logs/` directory

## Performance Impact

- **Minimal overhead**: ~1-2ms per tool invocation
- **Non-blocking**: All logging is asynchronous
- **Safe failure**: File write failures don't impact tool execution

## Testing

Comprehensive tests in `/src/shared/audit-logger.test.ts` verify:

- Successful invocation logging
- Failed invocation logging
- PII sanitization in arguments
- PII sanitization in error messages
- Accurate duration measurement
- Empty argument handling

## Privacy & Compliance

**Data Protection**:

- PII is redacted before logging
- No response bodies logged (could be large or sensitive)
- All timestamps in UTC
- Secure file permissions on log files

**Audit Trail**:

- Complete record of tool usage
- Timing data for performance analysis
- Error tracking for debugging
- Tamper-evident (append-only log files)

## Future Enhancements

Potential improvements:

- Configurable log retention policies
- Log aggregation/shipping to external services
- Advanced query/search capabilities
- Compliance report generation
- Rate limiting detection
- User/session correlation (when available)
