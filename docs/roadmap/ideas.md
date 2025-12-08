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
| Streamable HTTP | 📝 Researched | See [research-http-transport.md](./research-http-transport.md) |

---

## All Ideas

| Item | Priority | Effort | Notes |
|------|----------|--------|-------|
| SQL injection fix in LanceDB | p0 | small | Escape string interpolation in queries at lancedb.ts:116, 145, 153, 174, 221-223, 277-278 |
| ~~Add OpenTelemetry + Sentry~~ | ✅ | medium | Added @sentry/node + @opentelemetry/sdk-node with tracing for tools, API calls, embeddings |
| ~~Implement PII sanitization~~ | ✅ | medium | Created pii-sanitizer.ts with pattern detection, integrated into logger and cache |
| ~~Encrypt session tokens at rest~~ | ✅ | small | AES-256-GCM encryption in crypto.ts, PBKDF2 key derivation in secrets.ts |
| Add rate limiting | p1 | medium | Per-tool rate limits to prevent abuse and Disney API bans |
| Implement JSON schema validation | p1 | small | Runtime validation of tool inputs using ajv or zod |
| ~~Add request timeouts to tool handlers~~ | ✅ | small | Created timeout.ts with configurable timeouts (10s-120s), wrapped all tool handlers |
| ~~Extract magic numbers to constants~~ | ✅ | small | Created constants.ts with 42 named constants, updated 25+ files |
| Add test coverage | p1 | large | Unit tests for tools, integration tests for API clients, PII sanitization tests |
| ~~Fix fire-and-forget error handling~~ | ✅ | small | Added try/catch around event emissions in entities.ts |
| ~~Add audit logging~~ | ✅ | small | Created audit-logger.ts with PII sanitization, timing, structured logging |
| ~~Validate OpenAI API key format~~ | ✅ | small | Created validation.ts, checks sk- prefix, masks keys in logs |
| ~~Set database file permissions~~ | ✅ | small | Created file-security.ts, sets 0700/0600 on data dirs and files |
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
| Rotate user agents | p4 | small | Avoid static user agent being easily identifiable |
| Add background cache purging | p4 | small | Scheduled cleanup of expired cache entries |
| Improve embedding text quality | p2 | medium | Generate prose descriptions via LLM, add query-document asymmetry (E5-style prefixes), hybrid search with BM25, IP/franchise associations |
| Entity change tracking | p2 | medium | Track changes over time: refurbishments, closures, new openings, name changes, attribute changes. Add entity_history table, diff detection on sync, `changes` tool |

---

## MCP 2025-11-25 New Features

| Item | Priority | Effort | Notes |
|------|----------|--------|-------|
| Upgrade to MCP SDK 2025-11-25 | p1 | small | Update @modelcontextprotocol/sdk for new spec features |
| Implement OAuth 2.1 authentication | p1 | large | Required for cloud deployment - PKCE, RFC 8707 resource indicators. See [research-mcp-authorization.md](./research-mcp-authorization.md) and [authorization-server-comparison.md](./authorization-server-comparison.md) |
| ~~Add Streamable HTTP transport~~ | ✅ | medium | HttpTransportServer with /mcp endpoint, session management |
| Implement MCP Tasks | p2 | medium | Long-running ops (disney_sync) with progress tracking |
| ~~Add .well-known discovery endpoint~~ | ✅ | small | Server metadata at /.well-known/mcp |
| Implement MCP Prompts | p2 | medium | Trip planning templates, park day itineraries |
| Implement Elicitation | p3 | medium | Request park preferences, party size, dates from user |
| Add OAuth Client ID Metadata | p3 | small | URL-based client registration (replaces DCR) |

---

## Cloud Deployment & Security

| Item | Priority | Effort | Notes |
|------|----------|--------|-------|
| ~~Dockerize server~~ | ✅ | small | Multi-stage build, non-root user, node:22-slim |
| ~~Add health check endpoint~~ | ✅ | small | /health with uptime, sessions, database status |
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
| ~~Fix MCP logging (double-serialized JSON)~~ | ✅ | small | Uses MCP's sendLoggingMessage() for inspector + plain text stderr for console readability |
| Implement structured logging | p1 | small | JSON logs with trace/span IDs, already partially done |
| Add custom OTEL spans | p1 | medium | Spans for Disney API, DB queries, embeddings |
| Export metrics to Prometheus | p2 | medium | Tool latency, cache hit rate, error rate |
| Add Sentry performance monitoring | p2 | small | Transaction tracking, slow query detection |
| Create Grafana dashboards | p3 | medium | Visualize metrics and traces |
| Add log aggregation | p3 | medium | Ship logs to Loki or similar |
