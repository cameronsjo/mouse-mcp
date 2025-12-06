# Observability Guide

This document covers the observability stack for mouse-mcp, including distributed tracing, error tracking, and log correlation.

## Overview

mouse-mcp uses [Sentry](https://sentry.io) with OpenTelemetry integration for:

- **Distributed Tracing**: Track requests across MCP tools, database queries, API calls, and embeddings
- **Error Tracking**: Capture and aggregate errors with full context
- **Performance Monitoring**: Identify slow operations and bottlenecks
- **Log Correlation**: Link log entries to their parent traces

## Quick Start

### Enable Tracing

Set the Sentry DSN environment variable:

```bash
export MOUSE_MCP_SENTRY_DSN="https://your-key@sentry.io/project-id"
```

That's it. The server will automatically instrument all operations.

### Verify It's Working

1. Start the server and execute any MCP tool
2. Check your Sentry dashboard for incoming traces
3. Look for spans like `mcp.tool.disney_sync` or `disney.attractions.list`

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `MOUSE_MCP_SENTRY_DSN` | Sentry DSN (required to enable tracing) | - |
| `MOUSE_MCP_SENTRY_TRACES_SAMPLE_RATE` | Percentage of traces to capture (0.0-1.0) | `1.0` |
| `MOUSE_MCP_SENTRY_DEBUG` | Enable Sentry debug logging | `false` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Additional OTLP export endpoint | - |

### Sampling Configuration

For production, consider reducing the sample rate to manage costs:

```bash
# Capture 10% of traces
export MOUSE_MCP_SENTRY_TRACES_SAMPLE_RATE="0.1"

# Capture all traces (development)
export MOUSE_MCP_SENTRY_TRACES_SAMPLE_RATE="1.0"
```

## Instrumented Components

### MCP Tool Handlers

Every MCP tool call creates a span:

```
mcp.tool.disney_sync
mcp.tool.disney_attractions
mcp.tool.disney_search
```

Attributes:

- `mcp.tool.name`: The tool being called
- `mcp.session_id`: Session identifier (if available)

### Disney API Client

API calls to the Disney Parks API:

```
disney.attractions.list
disney.dining.list
disney.entertainment.list
disney.characters.list
```

Attributes:

- `disney.destination_id`: Target destination (e.g., `wdw`)
- `disney.entity_type`: Entity type being fetched
- `http.status_code`: Response status
- `cache.hit`: Whether result was cached

### Database Operations

SQLite database queries:

```
db.query
cache.get
cache.set
```

Attributes:

- `db.system`: `sqlite`
- `db.operation`: Query type
- `cache.key`: Cache key for cache operations
- `cache.hit`: Cache hit/miss status

### Embedding Operations

Vector embedding generation and search:

```
embedding.generate
embedding.search
vectordb.save-embedding
vectordb.vector-search
```

Attributes:

- `embedding.provider`: Provider ID (e.g., `openai`, `transformers`)
- `embedding.model`: Model name
- `embedding.dimensions`: Vector dimensions
- `embedding.batch_size`: Batch size for bulk operations

## Trace Structure

A typical `disney_sync` operation produces this trace hierarchy:

```
mcp.tool.disney_sync
├── disney.attractions.list
│   ├── cache.get (cache miss)
│   ├── http.client (API request)
│   └── cache.set
├── disney.dining.list
│   └── cache.get (cache hit)
├── db.insert (save entities)
└── embedding.ensure-batch
    ├── embedding.generate (batch)
    └── vectordb.save-embeddings-batch
```

## Log Correlation

Log entries automatically include trace context when available:

```json
{
  "level": "info",
  "message": "Fetching attractions",
  "traceId": "abc123...",
  "spanId": "def456...",
  "timestamp": "2025-01-15T10:30:00Z"
}
```

Use the `traceId` to find all logs for a specific request in your log aggregator.

## Debugging

### Enable Debug Logging

```bash
export MOUSE_MCP_SENTRY_DEBUG="true"
```

This outputs Sentry SDK debug information to stderr.

### Common Issues

**No traces appearing:**

1. Verify `MOUSE_MCP_SENTRY_DSN` is set correctly
2. Check that `MOUSE_MCP_SENTRY_TRACES_SAMPLE_RATE` is not `0`
3. Look for Sentry initialization errors in stderr

**Missing spans:**

1. Ensure the operation completed (errors may prevent span completion)
2. Check if sampling is excluding your traces
3. Verify the component is instrumented

**High latency in traces:**

1. Check if database operations are the bottleneck
2. Look for cache misses causing API calls
3. Review embedding generation times

## Privacy and Security

### PII Filtering

The following data is automatically stripped before sending to Sentry:

- Cookies
- Authorization headers
- Other authentication headers

### What Gets Sent

Traces include:

- Operation names and durations
- Entity IDs (not names or content)
- Error messages and stack traces
- Performance metrics

Traces do NOT include:

- User data
- Entity content or descriptions
- API keys or credentials
- Request/response bodies

## Disabling Tracing

To completely disable tracing, simply don't set `MOUSE_MCP_SENTRY_DSN`:

```bash
unset MOUSE_MCP_SENTRY_DSN
```

The application runs normally without any tracing overhead.

## Advanced: Custom OTLP Export

To send traces to an additional OpenTelemetry collector:

```bash
export OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:4318"
```

This enables dual export to both Sentry and your OTLP endpoint.

## Monitoring Checklist

For production deployments:

- [ ] Set `MOUSE_MCP_SENTRY_DSN` in production environment
- [ ] Configure appropriate `MOUSE_MCP_SENTRY_TRACES_SAMPLE_RATE` (recommend 0.1-0.2)
- [ ] Set up Sentry alerts for error spikes
- [ ] Create dashboards for key performance metrics
- [ ] Configure log aggregation with trace ID correlation
- [ ] Test tracing in staging before production
