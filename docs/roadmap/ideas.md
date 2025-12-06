# Roadmap Ideas

Ideas and planned features for mouse-mcp.

## MCP 2025-11-25 Spec Compliance

Current SDK: `@modelcontextprotocol/sdk@1.12.0` (needs upgrade for 2025-11-25 features)

### Gap Analysis

| Feature | Status | Notes |
|---------|--------|-------|
| Tools | ✅ Implemented | 6 tools with schemas |
| Resources | ❌ Missing | Could expose disney:// URIs |
| Prompts | ❌ Missing | Could provide trip planning templates |
| Tasks | ❌ Missing | New in 2025-11-25 for long-running ops |
| Sampling | ❌ N/A | Server-to-client, not needed |
| Elicitation | ❌ Missing | Could request park preferences |
| Roots | ❌ N/A | Filesystem boundaries, not applicable |
| OAuth 2.1 Auth | ❌ Missing | Required for cloud deployment |
| .well-known Discovery | ❌ Missing | New in 2025-11-25 |
| Streamable HTTP | ❌ Missing | Only stdio transport |

---

## All Ideas

| Item | Priority | Effort | Notes |
|------|----------|--------|-------|
| SQL injection fix in LanceDB | p0 | small | Escape string interpolation in queries at lancedb.ts:116, 145, 153, 174, 221-223, 277-278 |
| Add OpenTelemetry + Sentry | p0 | medium | OTEL tracing with Sentry integration for errors, spans for API/DB/embeddings |
| Implement PII sanitization | p0 | medium | Sanitize user-generated content before logging, caching, or returning to LLM |
| Encrypt session tokens at rest | p0 | small | Session cookies/tokens stored as plain text in SQLite - use AES-256-GCM |
| Add rate limiting | p1 | medium | Per-tool rate limits to prevent abuse and Disney API bans |
| Implement JSON schema validation | p1 | small | Runtime validation of tool inputs using ajv or zod |
| Add request timeouts to tool handlers | p1 | small | Prevent long-running tool calls from blocking MCP connection |
| Extract magic numbers to constants | p1 | small | session-manager.ts, embeddings/search.ts, lancedb.ts, entities.ts |
| Add test coverage | p1 | large | Unit tests for tools, integration tests for API clients, PII sanitization tests |
| Fix fire-and-forget error handling | p1 | small | Add error boundaries to async embedding generation in entities.ts |
| Add audit logging | p1 | small | Log all tool invocations with sanitized context |
| Validate OpenAI API key format | p1 | small | Check key starts with sk-, mask in logs |
| Set database file permissions | p1 | small | Restrict to 0700/0600 for security |
| Switch to better-sqlite3 | p2 | medium | Native performance, WAL mode for crash safety, FTS5 support |
| Add transaction support | p2 | medium | Atomic database operations across cache/entities/sessions |
| Implement MCP Resources | p2 | medium | Add disney:// URIs for read-only entity lookups |
| Add SSE transport | p2 | medium | Support web-based integrations alongside stdio |
| Create CONTRIBUTING.md | p2 | small | Contributor guidelines, PR process, code style |
| Create CHANGELOG.md | p2 | small | Track version history with Keep a Changelog format |
| Add JSDoc @param/@returns/@example tags | p2 | medium | Structured API documentation for all public functions |
| Add production deployment guide | p2 | medium | Docker, monitoring, backup/restore procedures |
| Refactor duplicate normalization code | p2 | medium | Extract common logic from disney-finder.ts normalize* methods |
| Add request deduplication | p2 | small | Prevent concurrent identical requests from hitting API |
| Parallelize sequential operations | p2 | small | Use Promise.all in entity.ts and search.ts |
| Add correlation IDs | p3 | small | Trace requests through tool → client → DB → API |
| Add response streaming | p3 | medium | Stream large result sets for attractions lists |
| Add pagination to list operations | p3 | small | limit/offset support for all query tools |
| Implement cache warm-up on startup | p3 | small | Pre-load frequently accessed entities |
| Add Prometheus metrics | p3 | medium | Tool invocation counts, latency histograms, cache hit rates |
| Fix entity type deduplication | p1 | medium | Disney /entertainment returns rides alongside shows. Attractions saved first get overwritten as SHOW. Need entity type priority: ATTRACTION > SHOW > EVENT |
| Rotate user agents | p4 | small | Avoid static user agent being easily identifiable |
| Add background cache purging | p4 | small | Scheduled cleanup of expired cache entries |

---

## MCP 2025-11-25 New Features

| Item | Priority | Effort | Notes |
|------|----------|--------|-------|
| Upgrade to MCP SDK 2025-11-25 | p1 | small | Update @modelcontextprotocol/sdk for new spec features |
| Implement OAuth 2.1 authentication | p1 | large | Required for cloud deployment - PKCE, RFC 8707 resource indicators |
| Add Streamable HTTP transport | p1 | medium | Enable cloud deployment alongside stdio |
| Implement MCP Tasks | p2 | medium | Long-running ops (disney_sync) with progress tracking |
| Add .well-known discovery endpoint | p2 | small | Server metadata at /.well-known/mcp for capability discovery |
| Implement MCP Prompts | p2 | medium | Trip planning templates, park day itineraries |
| Implement Elicitation | p3 | medium | Request park preferences, party size, dates from user |
| Add OAuth Client ID Metadata | p3 | small | URL-based client registration (replaces DCR) |

---

## Cloud Deployment & Security

| Item | Priority | Effort | Notes |
|------|----------|--------|-------|
| Dockerize server | p1 | small | Multi-stage build, non-root user, minimal image |
| Add health check endpoint | p1 | small | /health for container orchestration |
| Implement Zero Trust security | p1 | medium | Validate every request, no implicit trust |
| Add JWT token validation | p1 | medium | Verify signatures, check issuer/audience/expiry |
| Implement RBAC | p2 | medium | Role-based access control for tools |
| Add BOLA protection | p2 | small | Prevent broken object level authorization attacks |
| Deploy to Railway/Fly.io | p2 | medium | Low-cost cloud with usage-based pricing |
| Add secrets management | p2 | small | Use environment or secrets manager for keys |
| Implement request signing | p3 | medium | HMAC signatures for request integrity |
| Add WAF/rate limiting at edge | p3 | medium | Cloudflare or similar for DDoS protection |

---

## Observability Stack

| Item | Priority | Effort | Notes |
|------|----------|--------|-------|
| Add @sentry/node with OTEL | p1 | small | Error tracking + distributed tracing in one |
| Fix MCP logging (double-serialized JSON) | p1 | small | Use MCP's sendLoggingMessage() or plain text stderr to avoid nested JSON in inspector |
| Implement structured logging | p1 | small | JSON logs with trace/span IDs, already partially done |
| Add custom OTEL spans | p1 | medium | Spans for Disney API, DB queries, embeddings |
| Export metrics to Prometheus | p2 | medium | Tool latency, cache hit rate, error rate |
| Add Sentry performance monitoring | p2 | small | Transaction tracking, slow query detection |
| Create Grafana dashboards | p3 | medium | Visualize metrics and traces |
| Add log aggregation | p3 | medium | Ship logs to Loki or similar |
